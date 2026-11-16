// Постобработка 3D-кадра (идея из cinecode; сами проходы — штатные из three/examples, без новых пакетов).
// Включать в сцене: <Post opt={P.post} /> внутри <ThreeCanvas>. Камера сама сообщает дистанцию фокуса:
// camera.userData.focus = расстояние до предмета (в метрах).
// С умом: рендер у нас на процессоре. bloom дешёвый (порог высокий — светятся только солнце и блики),
// dof (глубина резкости) рисует сцену второй раз — включать на крупных планах, где фон надо смягчить.
import React, {useMemo} from 'react';
import * as THREE from 'three';
import {useFrame, useThree} from '@react-three/fiber';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {BokehPass} from 'three/examples/jsm/postprocessing/BokehPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import {Pass, FullScreenQuad} from 'three/examples/jsm/postprocessing/Pass.js';

export type PostOpt = {
  bloom?: number; // сила свечения бликов, 0 — выкл (обычно 0.2–0.4)
  bloomThreshold?: number; // яркость, с которой начинается свечение (0.85–0.95)
  dof?: number; // сила размытия вне фокуса, 0 — выкл (обычно 1–3)
  paint?: number; // «живопись»: фильтр мазка + тёплые света/холодные тени + холст. 1 — норма, 0 — выкл
};

// ── «Живопись»: кадр как написанный кистью. Работает поверх готовой картинки (после OutputPass),
// поэтому годится для любого мира без переделки материалов. Мазок считается в половинном размере (дёшево).
const P_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
const P_KUW = /* glsl */ `
uniform sampler2D tDiffuse; uniform vec2 uPx; varying vec2 vUv;
void main(){
  vec4 m[8]; vec3 s[8]; for(int k=0;k<8;k++){ m[k]=vec4(0.); s[k]=vec3(0.); }
  float rad = float(RADIUS); float zeta = 2./rad; float zc = 0.58; float sinZ = sin(zc); float eta = (zeta + cos(zc))/(sinZ*sinZ);
  for(int y=-RADIUS;y<=RADIUS;y++) for(int x=-RADIUS;x<=RADIUS;x++){
    vec2 v = vec2(float(x), float(y))/rad; if(dot(v,v) > 1.0) continue;
    vec3 c = texture2D(tDiffuse, vUv + vec2(float(x), float(y))*uPx).rgb;
    float sum = 0.; float w[8]; float z, vxx, vyy;
    vxx = zeta - eta*v.x*v.x; vyy = zeta - eta*v.y*v.y;
    z = max(0., v.y + vxx); w[0]=z*z; sum+=w[0]; z = max(0., -v.x + vyy); w[2]=z*z; sum+=w[2];
    z = max(0., -v.y + vxx); w[4]=z*z; sum+=w[4]; z = max(0., v.x + vyy); w[6]=z*z; sum+=w[6];
    vec2 v2 = 0.70710678*vec2(v.x - v.y, v.x + v.y);
    vxx = zeta - eta*v2.x*v2.x; vyy = zeta - eta*v2.y*v2.y;
    z = max(0., v2.y + vxx); w[1]=z*z; sum+=w[1]; z = max(0., -v2.x + vyy); w[3]=z*z; sum+=w[3];
    z = max(0., -v2.y + vxx); w[5]=z*z; sum+=w[5]; z = max(0., v2.x + vyy); w[7]=z*z; sum+=w[7];
    float g = exp(-3.125*dot(v,v))/max(sum, 1e-5);
    for(int k=0;k<8;k++){ float wk = w[k]*g; m[k] += vec4(c*wk, wk); s[k] += c*c*wk; }
  }
  vec4 o = vec4(0.);
  for(int k=0;k<8;k++){ m[k].rgb /= max(m[k].w, 1e-5); s[k] = abs(s[k]/max(m[k].w,1e-5) - m[k].rgb*m[k].rgb);
    float sg = s[k].r+s[k].g+s[k].b; float w = 1./(1. + pow(8000.*sg, 4.5)); o += vec4(m[k].rgb*w, w); }
  gl_FragColor = vec4(o.rgb/max(o.w,1e-5), 1.);
}`;
const P_FIN = /* glsl */ `
uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uK; varying vec2 vUv;
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s+=a*vn(p); p=p*2.03+7.1; a*=.5; } return s/0.9375; }
float luma(vec3 c){ return dot(c, vec3(.299,.587,.114)); }
void main(){
  float S = uRes.x/1080.; vec2 fc = vUv*uRes/S; vec3 c = texture2D(tDiffuse, vUv).rgb;
  vec2 t = 1.5*S/uRes; float h = luma(texture2D(tDiffuse, vUv+t).rgb) - luma(texture2D(tDiffuse, vUv-t).rgb);
  c += clamp(h, -0.12, 0.12)*0.6*uK;                                   // рельеф мазка
  c = mix(vec3(luma(c)), c, 1. + 0.1*uK); c = (c-.5)*(1.+0.07*uK)+.5;   // цвет и контраст
  float L = luma(c);
  c += uK*(vec3(0.0, 0.005, 0.045)*(1.-smoothstep(0.,.55,L)) + vec3(0.04, 0.018, -0.025)*smoothstep(.5,1.,L)); // холодные тени, тёплые света
  float cv = fbm(vec2(fc.x/3.2, fc.y/11.)+3.)*0.5 + fbm(vec2(fc.x/13., fc.y/3.4))*0.5; c *= 1. + 0.05*uK*(cv-.5)*2.; // холст
  vec2 q = (vUv-.5)*vec2(1., uRes.y/uRes.x*0.6); c *= 1. - 0.2*uK*smoothstep(.35,.95,length(q));
  gl_FragColor = vec4(clamp(c,0.,1.), 1.);
}`;
class PaintPass extends Pass {
  rt: THREE.WebGLRenderTarget;
  kuw: THREE.ShaderMaterial;
  fin: THREE.ShaderMaterial;
  quad: FullScreenQuad;
  constructor(w: number, h: number, k: number) {
    super();
    const hw = Math.max(2, Math.round(w / 2)), hh = Math.max(2, Math.round(h / 2));
    this.rt = new THREE.WebGLRenderTarget(hw, hh);
    this.kuw = new THREE.ShaderMaterial({defines: {RADIUS: Math.max(2, Math.round((3 * w) / 1080))}, uniforms: {tDiffuse: {value: null}, uPx: {value: new THREE.Vector2(1 / hw, 1 / hh)}}, vertexShader: P_VERT, fragmentShader: P_KUW, depthTest: false, depthWrite: false});
    this.fin = new THREE.ShaderMaterial({uniforms: {tDiffuse: {value: null}, uRes: {value: new THREE.Vector2(w, h)}, uK: {value: k}}, vertexShader: P_VERT, fragmentShader: P_FIN, depthTest: false, depthWrite: false});
    this.quad = new FullScreenQuad(this.kuw);
  }
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    this.kuw.uniforms.tDiffuse.value = readBuffer.texture;
    this.quad.material = this.kuw;
    renderer.setRenderTarget(this.rt);
    this.quad.render(renderer);
    this.fin.uniforms.tDiffuse.value = this.rt.texture;
    this.quad.material = this.fin;
    renderer.setRenderTarget((this as any).renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

export const Post: React.FC<{opt?: PostOpt | false}> = ({opt}) => {
  const {gl, scene, camera, size} = useThree();
  const o = opt || {};
  const bloom = o.bloom ?? 0;
  const dof = o.dof ?? 0;
  const paint = o.paint ?? 0;
  const on = !!opt && (bloom > 0 || dof > 0 || paint > 0);
  const c = useMemo(() => {
    if (!on) return null;
    const w = Math.round(size.width * gl.getPixelRatio());
    const h = Math.round(size.height * gl.getPixelRatio());
    const rt = new THREE.WebGLRenderTarget(w, h, {type: THREE.HalfFloatType});
    const composer = new EffectComposer(gl, rt);
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
    composer.addPass(new RenderPass(scene, camera));
    let bok: BokehPass | null = null;
    if (dof > 0) {
      bok = new BokehPass(scene, camera, {focus: 50, aperture: 0.0001 * dof, maxblur: 0.004 * Math.min(2, dof)});
      composer.addPass(bok);
    }
    if (bloom > 0) composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.width / 2, size.height / 2), bloom, 0.5, o.bloomThreshold ?? 0.9));
    composer.addPass(new OutputPass());
    if (paint > 0) composer.addPass(new PaintPass(w, h, paint));
    return {composer, bok};
  }, [on]);
  useFrame(() => {
    if (!c) {
      gl.render(scene, camera);
      return;
    }
    if (c.bok) {
      const f = (camera.userData.focus as number) || 50;
      const u = (c.bok as any).uniforms;
      u.focus.value = f;
      // апертура масштабируется от дистанции: на крупном плане и на общем — похожая мягкость фона
      u.aperture.value = (0.0001 * dof * 30) / Math.max(3, f);
    }
    c.composer.render();
  }, 1);
  return null;
};
