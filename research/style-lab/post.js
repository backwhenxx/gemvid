// Мини-конвейер постобработки: сцена → цвет+глубина+нормали → цепочка полноэкранных проходов.
import * as THREE from 'three';

const COMMON = /* glsl */`
uniform sampler2D tDiffuse, tScene, tDepth, tNormal;
uniform vec2 uRes; uniform float uTime, uNear, uFar, uS, uSeed;
varying vec2 vUv;
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.03+7.1; a*=.5; } return s/0.9375; }
float luma(vec3 c){ return dot(c, vec3(.299,.587,.114)); }
vec3 sat(vec3 c, float s){ return mix(vec3(luma(c)), c, s); }
float rawDepth(vec2 uv){ return texture2D(tDepth, uv).x; }
float linDepth(vec2 uv){ float z = rawDepth(uv); return uNear*uFar/(uFar - z*(uFar-uNear)); }
vec3 nrm(vec2 uv){ return texture2D(tNormal, uv).xyz*2.-1.; }
float edgeAt(vec2 uv, float px, float dthr, float nthr){
  vec2 t = px/uRes; float d0 = linDepth(uv);
  float d1=linDepth(uv+vec2(t.x,0.)), d2=linDepth(uv-vec2(t.x,0.)), d3=linDepth(uv+vec2(0.,t.y)), d4=linDepth(uv-vec2(0.,t.y));
  float lap = abs(d1+d2+d3+d4-4.*d0)/d0;
  float ed = smoothstep(dthr, dthr*2.5, lap);
  vec3 n0 = nrm(uv);
  float nd = 4. - dot(n0,nrm(uv+vec2(t.x,0.))) - dot(n0,nrm(uv-vec2(t.x,0.))) - dot(n0,nrm(uv+vec2(0.,t.y))) - dot(n0,nrm(uv-vec2(0.,t.y)));
  float en = smoothstep(nthr, nthr*2.2, nd);
  return max(ed, en);
}
vec2 wobble(vec2 uv, float amp, float scale, float seed){ vec2 p = uv*uRes/(scale*uS) + seed*17.3; return uv + (vec2(fbm(p), fbm(p+41.7))-.5)*2.*amp*uS/uRes; }
float dotScreen(vec2 fc, float ang, float size, float a){ float c=cos(ang), s=sin(ang); vec2 p = vec2(c*fc.x - s*fc.y, s*fc.x + c*fc.y)/size; vec2 g = fract(p)-.5; float r = sqrt(clamp(a,0.,1.))*0.72; return 1.-smoothstep(r-0.1, r+0.1, length(g)); }
float paperTex(vec2 fc){ float f = fbm(fc/2.4)*0.6 + fbm(vec2(fc.x/38., fc.y/3.))*0.4; return f; }
`;
const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;
const C3 = (h) => { const c = new THREE.Color(h); return new THREE.Vector3(c.r, c.g, c.b).set(...new THREE.Color().setStyle(h).convertLinearToSRGB().toArray()); };

export const P = {
  tonemap: (o = {}) => ({ u: { uExp: o.exp ?? 1, uAces: o.aces ?? 1 }, f: /* glsl */`
    uniform float uExp, uAces;
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb*uExp; c = mix(clamp(c,0.,1.), aces(c*0.9), uAces); gl_FragColor = vec4(pow(c, vec3(1./2.2)), 1.); }` }),

  fxaa: () => ({ u: {}, f: /* glsl */`
    void main(){ vec2 px = 1./uRes; vec3 l = vec3(.299,.587,.114);
      vec3 nw = texture2D(tDiffuse, vUv+vec2(-1.,-1.)*px).rgb, ne = texture2D(tDiffuse, vUv+vec2(1.,-1.)*px).rgb, sw = texture2D(tDiffuse, vUv+vec2(-1.,1.)*px).rgb, se = texture2D(tDiffuse, vUv+vec2(1.,1.)*px).rgb, m = texture2D(tDiffuse, vUv).rgb;
      float lnw = dot(nw,l), lne = dot(ne,l), lsw = dot(sw,l), lse = dot(se,l), lm = dot(m,l);
      float lmin = min(lm, min(min(lnw,lne), min(lsw,lse))), lmax = max(lm, max(max(lnw,lne), max(lsw,lse)));
      vec2 dir = vec2(-((lnw+lne)-(lsw+lse)), ((lnw+lsw)-(lne+lse)));
      float red = max((lnw+lne+lsw+lse)*0.03125, 1./128.); float rcp = 1./(min(abs(dir.x),abs(dir.y))+red);
      dir = clamp(dir*rcp, -8., 8.)*px;
      vec3 A = .5*(texture2D(tDiffuse, vUv+dir*(1./3.-.5)).rgb + texture2D(tDiffuse, vUv+dir*(2./3.-.5)).rgb);
      vec3 B = A*.5 + .25*(texture2D(tDiffuse, vUv-dir*.5).rgb + texture2D(tDiffuse, vUv+dir*.5).rgb);
      float lb = dot(B,l); gl_FragColor = vec4((lb < lmin || lb > lmax) ? A : B, 1.); }` }),

  kuwahara: (o = {}) => ({ half: o.half, d: { RADIUS: o.radius ?? 5 }, u: { uQ: o.q ?? 10, uStep: o.half ? 2 : 1 }, f: /* glsl */`
    uniform float uQ, uStep;
    void main(){
      vec4 m[8]; vec3 s[8]; for(int k=0;k<8;k++){ m[k]=vec4(0.); s[k]=vec3(0.); }
      float rad = float(RADIUS); float zeta = 2./rad; float zc = 0.58; float sinZ = sin(zc); float eta = (zeta + cos(zc))/(sinZ*sinZ);
      vec2 px = uStep/vec2(textureSize(tDiffuse, 0));
      for(int y=-RADIUS;y<=RADIUS;y++) for(int x=-RADIUS;x<=RADIUS;x++){
        vec2 v = vec2(float(x), float(y))/rad; if(dot(v,v) > 1.0) continue;
        vec3 c = texture2D(tDiffuse, vUv + vec2(float(x), float(y))*px).rgb;
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
        float sg = s[k].r+s[k].g+s[k].b; float w = 1./(1. + pow(min(8000.*sg, 40.), 0.5*uQ)); o += vec4(m[k].rgb*w, w); }
      gl_FragColor = vec4(o.rgb/max(o.w,1e-20), 1.);
    }` }),

  // обводка тушью/карандашом
  ink: (o = {}) => ({ u: { uInk: C3(o.color ?? '#1b1410'), uPx: o.px ?? 2, uOp: o.op ?? 1, uWob: o.wob ?? 0, uWs: o.ws ?? 50, uD: o.d ?? 0.012, uN: o.n ?? 0.5, uBoil: o.boil ?? 0, uDbl: o.dbl ?? 0, uSelf: o.self ?? 0 }, f: /* glsl */`
    uniform vec3 uInk; uniform float uPx, uOp, uWob, uWs, uD, uN, uBoil, uDbl, uSelf;
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float sd = floor(uTime*uBoil)+uSeed;
      float e = edgeAt(wobble(vUv, uWob, uWs, sd), uPx*uS, uD, uN);
      if(uDbl > 0.) e = max(e, uDbl*edgeAt(wobble(vUv, uWob*1.9, uWs*1.3, sd+5.), uPx*uS*0.8, uD, uN));
      float press = 0.75 + 0.25*fbm(vUv*uRes/(uS*23.));
      gl_FragColor = vec4(mix(c, mix(uInk, c*c*0.55, uSelf), clamp(e*uOp*press,0.,1.)), 1.); }` }),

  // финальная «плёнка»: цвет, тени/света, рельеф мазка, холст, зерно, виньетка
  finish: (o = {}) => ({ u: { uSat: o.sat ?? 1, uCon: o.con ?? 1, uSh: new THREE.Vector3(...(o.sh ?? [0, 0, 0])), uHi: new THREE.Vector3(...(o.hi ?? [0, 0, 0])), uVig: o.vig ?? 0, uGrain: o.grain ?? 0, uCanvas: o.canvas ?? 0, uEmb: o.emboss ?? 0, uPaper: C3(o.paper ?? '#ffffff'), uPaperK: o.paperK ?? 0 }, f: /* glsl */`
    uniform float uSat, uCon, uVig, uGrain, uCanvas, uEmb, uPaperK; uniform vec3 uSh, uHi, uPaper;
    void main(){ vec2 fc = vUv*uRes/uS; vec3 c = texture2D(tDiffuse, vUv).rgb;
      if(uEmb > 0.){ vec2 t = 1.5*uS/uRes; float h = luma(texture2D(tDiffuse, vUv+t).rgb) - luma(texture2D(tDiffuse, vUv-t).rgb); c += clamp(h, -0.12, 0.12)*uEmb; }
      c = sat(c, uSat); c = (c-.5)*uCon+.5; float L = luma(c);
      c += uSh*(1.-smoothstep(0.,.55,L)) + uHi*smoothstep(.5,1.,L);
      if(uCanvas > 0.){ float cv = fbm(vec2(fc.x/3.2, fc.y/11.)+3.)*0.5 + fbm(vec2(fc.x/13., fc.y/3.4))*0.5; c *= 1. + uCanvas*(cv-.5)*2.; }
      c = mix(c, c*uPaper*(0.9+0.2*paperTex(fc)), uPaperK);
      vec2 q = (vUv-.5)*vec2(1., uRes.y/uRes.x*0.6); c *= 1. - uVig*smoothstep(.35,.95,length(q));
      c += (hash(fc+uSeed*3.1+floor(uTime*24.))-.5)*uGrain;
      gl_FragColor = vec4(clamp(c,0.,1.), 1.); }` }),

  // малая глубина резкости «макет»
  tilt: (o = {}) => ({ u: { uFocus: o.focus ?? 40, uK: o.k ?? 3, uMax: o.max ?? 14, uY: o.y ?? 0 }, f: /* glsl */`
    uniform float uFocus, uK, uMax, uY;
    void main(){ float d = linDepth(vUv); float coc = clamp(abs(d-uFocus)/uFocus*uK, 0., 1.);
      coc = max(coc, uY*smoothstep(.28,.5,abs(vUv.y-.5)));
      float r = coc*uMax*uS; vec3 acc = vec3(0.); float n = 0.;
      for(int i=0;i<36;i++){ float a = float(i)*2.39996; float rr = r*sqrt((float(i)+.5)/36.); vec2 o = vec2(cos(a),sin(a))*rr/uRes;
        float d2 = linDepth(vUv+o); float c2 = clamp(abs(d2-uFocus)/uFocus*uK,0.,1.); float w = (d2 < d-0.5 || c2 >= coc*0.6) ? 1. : 0.25; acc += texture2D(tDiffuse, vUv+o).rgb*w; n += w; }
      gl_FragColor = vec4(acc/n, 1.); }` }),

  // комикс: точки в тенях
  halftone: (o = {}) => ({ u: { uDot: o.dot ?? 7, uK: o.k ?? 0.42, uLo: o.lo ?? 0.22, uHi2: o.hi ?? 0.6 }, f: /* glsl */`
    uniform float uDot, uK, uLo, uHi2;
    void main(){ vec2 fc = vUv*uRes/uS; vec3 c = texture2D(tDiffuse, vUv).rgb; float L = luma(c);
      float sky = step(0.9999, rawDepth(vUv));
      float sh = smoothstep(uHi2, uLo, L)*(1.-sky);
      float dots = dotScreen(fc, 0.785, uDot, sh*0.75);
      c = mix(c, c*(1.-uK), dots);
      float sd = dotScreen(fc, 0.785, uDot*1.4, smoothstep(0.75,0.3,vUv.y)*0.55)*sky; c = mix(c, vec3(1.), sd*0.55);
      gl_FragColor = vec4(c, 1.); }` }),

  // гравюра из старого атласа: штрих по форме, сепия, акварельная заливка
  engrave: (o = {}) => ({ u: { uPaper: C3(o.paper ?? '#efe2c4'), uInk: C3(o.ink ?? '#3b2a1c'), uWash: o.wash ?? 0.8, uSp: o.sp ?? 7.5 }, f: /* glsl */`
    uniform vec3 uPaper, uInk; uniform float uWash, uSp;
    float hatch(vec2 fc, float ang, float sp, float w){ float c=cos(ang), s=sin(ang); float v = (fc.x*s + fc.y*c)/sp; float d = abs(fract(v)-.5)*2.; return (1.-smoothstep(w-.2, w+.2, d))*step(0.04, w); }
    void main(){ vec2 fc = vUv*uRes/uS; vec3 c = texture2D(tDiffuse, vUv).rgb; float L = luma(c); float tone = 1.-L;
      float sky = step(0.9999, rawDepth(vUv)); vec3 n = nrm(vUv);
      vec2 w = fc + (vec2(fbm(fc/42.), fbm(fc/42.+9.))-.5)*7.;
      float ang = sky > .5 ? 0.0 : (n.y > 0.72 ? 0.14 : (n.x > 0.3 ? 1.02 : (n.x < -0.3 ? -1.02 : 0.62)));
      float press = 0.8+0.4*fbm(fc/30.+2.);
      float h = hatch(w, ang, uSp, clamp((tone-0.2)*1.15, 0., .82)*press);
      h = max(h, hatch(w, ang+1.15, uSp, clamp((tone-0.6)*1.7, 0., .8)*press));
      vec3 wash = pow(sat(c, 0.85), vec3(0.62)); wash = mix(vec3(1.), wash, uWash*(0.85+0.3*fbm(fc/120.+5.)));
      vec3 col = uPaper*wash;
      col = mix(col, uInk, h*0.8);
      float e = edgeAt(wobble(vUv, 1.6, 44., uSeed), 1.7*uS, 0.012, 0.55);
      col = mix(col, uInk, e*0.92);
      col *= 0.9 + 0.14*paperTex(fc);
      col *= 1. - 0.10*smoothstep(.62,.82,fbm(fc/150.+3.));
      vec2 q = (vUv-.5)*vec2(1., uRes.y/uRes.x*0.6); col = mix(col, col*vec3(.78,.66,.5), smoothstep(.55,1.05,length(q)+0.12*fbm(fc/90.)));
      gl_FragColor = vec4(col, 1.); }` }),

  // акварель + карандаш в альбоме
  watercolor: (o = {}) => ({ u: { uPaper: C3(o.paper ?? '#fbf6ea'), uPencil: C3(o.pencil ?? '#3c3b46'), uBorder: o.border ?? 1 }, f: /* glsl */`
    uniform vec3 uPaper, uPencil; uniform float uBorder;
    void main(){ vec2 fc = vUv*uRes/uS;
      vec2 uvb = vUv + (vec2(fbm(fc/55.), fbm(fc/55.+5.))-.5)*7.*uS/uRes;
      vec3 c = texture2D(tDiffuse, uvb).rgb; c = sat(c, 1.18); c = mix(c, vec3(1.), 0.2);
      float pig = fbm(fc/160.+2.); c = mix(c, c*c*1.08, 0.5*pig);
      float bloomy = fbm(fc/75.+11.); c = mix(c, vec3(1.), 0.22*smoothstep(.55,.8,bloomy));
      float e = 0.; for(int i=0;i<4;i++){ float a = float(i)*1.5708; e += edgeAt(uvb + vec2(cos(a),sin(a))*2.5*uS/uRes, 2.2*uS, 0.012, 0.6); } e *= 0.25;
      c *= 1. - 0.2*e;
      float gran = paperTex(fc); c *= 0.9 + 0.16*gran;
      vec2 q = min(vUv, 1.-vUv); float d = min(q.x, q.y*uRes.y/uRes.x) + (fbm(fc/80.+1.)-.5)*0.075 + (fbm(fc/14.)-.5)*0.012;
      float m = mix(1., smoothstep(0.03, 0.062, d), uBorder);
      float rim = smoothstep(0.03,0.062,d)*(1.-smoothstep(0.062,0.11,d))*uBorder; c *= 1.-0.12*rim;
      vec3 col = mix(uPaper*(0.94+0.08*gran), c*uPaper, m);
      float p1 = edgeAt(wobble(vUv, 2.2, 46., uSeed), 1.15*uS, 0.012, 0.55);
      float p2 = edgeAt(wobble(vUv, 4.6, 64., uSeed+3.), 1.0*uS, 0.012, 0.55);
      float pen = clamp(p1*0.85 + p2*0.45, 0., 1.)*(0.55+0.45*gran)*mix(0.35,1.,m);
      col = mix(col, uPencil, pen*0.8);
      gl_FragColor = vec4(col, 1.); }` }),

  // ризограф: четыре краски внахлёст, растр, несовмещение, зерно
  riso: (o = {}) => ({ u: { uPaper: C3(o.paper ?? '#f3ead8'), uY: C3(o.y ?? '#ffd23c'), uM: C3(o.m ?? '#ff5a52'), uC: C3(o.c ?? '#1f9bb0'), uK: C3(o.k ?? '#23264d'), uDot: o.dot ?? 6.5 }, f: /* glsl */`
    uniform vec3 uPaper, uY, uM, uC, uK; uniform float uDot;
    vec4 sep(vec3 c){ c = clamp(sat(c,1.25),0.,1.); float k = 1.-max(c.r,max(c.g,c.b)); float ik = 1./max(1.-k,1e-3);
      return vec4((1.-c.r-k)*ik, (1.-c.g-k)*ik, (1.-c.b-k)*ik, smoothstep(0.28,0.86,k+0.42*(1.-luma(c)))); }
    float ink(vec2 fc, float a, float ang){ a = clamp(a,0.,1.); float flat_ = smoothstep(.62,.9,a); float ht = dotScreen(fc, ang, uDot, a); return mix(ht, 1., flat_)*step(0.06,a); }
    void main(){ vec2 fc = vUv*uRes/uS; vec2 px = uS/uRes;
      vec4 s0 = sep(texture2D(tDiffuse, vUv).rgb); vec4 s1 = sep(texture2D(tDiffuse, vUv+vec2(2.6,-1.6)*px).rgb); vec4 s2 = sep(texture2D(tDiffuse, vUv+vec2(-1.8,2.2)*px).rgb);
      float g = fbm(fc/1.8); float miss = 1.-0.5*smoothstep(.72,.9,fbm(fc/3.3+4.));
      vec3 col = uPaper*(0.95+0.07*paperTex(fc));
      col *= mix(vec3(1.), uY, ink(fc, s0.z, 0.1)*miss*(0.82+0.18*g));
      col *= mix(vec3(1.), uM, ink(fc, s1.y, 1.31)*miss*(0.82+0.18*g));
      col *= mix(vec3(1.), uC, ink(fc, s2.x, 0.61)*miss*(0.82+0.18*g));
      col *= mix(vec3(1.), uK, ink(fc, s0.w, 0.785)*(0.86+0.14*g));
      gl_FragColor = vec4(col, 1.); }` }),

  // бумага: светлая кромка среза и волокна
  paper: (o = {}) => ({ u: { uEdge: o.edge ?? 0.55, uTex: o.tex ?? 0.1 }, f: /* glsl */`
    uniform float uEdge, uTex;
    void main(){ vec2 fc = vUv*uRes/uS; vec3 c = texture2D(tDiffuse, vUv).rgb;
      float e = edgeAt(vUv, 1.4*uS, 0.012, 0.9);
      float sh = 0.; for(int i=1;i<=4;i++){ sh += edgeAt(vUv + vec2(-1.3, 1.6)*float(i)*uS/uRes, 1.6*uS, 0.012, 9.); } c *= 1. - 0.07*sh*(1.-e);
      c = mix(c, vec3(1.,.985,.95), e*uEdge);
      float f = fbm(fc/2.1)*0.5 + fbm(vec2(fc.x/50., fc.y/2.6))*0.5; c *= 1. - uTex + uTex*2.*f;
      gl_FragColor = vec4(c, 1.); }` }),
};

export class Pipeline {
  constructor(renderer, w, h, near, far) {
    this.r = renderer; this.w = w; this.h = h; this.near = near; this.far = far;
    const dt = new THREE.DepthTexture(w, h); dt.type = THREE.UnsignedIntType;
    this.rtScene = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthTexture: dt });
    this.rtNormal = new THREE.WebGLRenderTarget(w, h);
    const mk = (k) => { const t = new THREE.WebGLRenderTarget(Math.round(w * k), Math.round(h * k)); t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter; return t; };
    this.full = [mk(1), mk(1)]; this.half = [mk(0.5), mk(0.5)];
    this.q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); this.q.frustumCulled = false; this.qs = new THREE.Scene(); this.qs.add(this.q);
    this.qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.nmat = new THREE.MeshNormalMaterial();
    this.mats = new Map();
  }
  mat(p) {
    if (!this.mats.has(p)) {
      const u = { tDiffuse: { value: null }, tScene: { value: null }, tDepth: { value: null }, tNormal: { value: null }, uRes: { value: new THREE.Vector2(this.w, this.h) }, uTime: { value: 0 }, uNear: { value: this.near }, uFar: { value: this.far }, uS: { value: this.w / 1080 }, uSeed: { value: 0 } };
      for (const k in p.u) u[k] = { value: p.u[k] };
      const d = Object.assign({}, p.d || {}); if (d.RADIUS) d.RADIUS = Math.max(2, Math.round(d.RADIUS * this.w / 1080 * (p.half ? 0.5 : 1)));
      this.mats.set(p, new THREE.ShaderMaterial({ uniforms: u, defines: d, vertexShader: VERT, fragmentShader: COMMON + p.f, depthTest: false, depthWrite: false, toneMapped: false }));
    }
    return this.mats.get(p);
  }
  render(scene, camera, sky, passes, time, flatNormals) {
    const r = this.r;
    r.setRenderTarget(this.rtScene); r.setClearColor(0x000000, 1); r.clear(); r.render(scene, camera);
    const bg = scene.background, fog = scene.fog; sky.visible = false; scene.background = null; scene.fog = null; this.nmat.flatShading = !!flatNormals; scene.overrideMaterial = this.nmat;
    r.setRenderTarget(this.rtNormal); r.setClearColor(0x8080ff, 1); r.clear(); r.render(scene, camera);
    scene.overrideMaterial = null; sky.visible = true; scene.background = bg; scene.fog = fog;
    let src = this.rtScene.texture, fi = 0, hi = 0;
    passes.forEach((p, i) => {
      const m = this.mat(p), last = i === passes.length - 1;
      const dst = last ? null : (p.half ? this.half[hi++ % 2] : this.full[fi++ % 2]);
      m.uniforms.tDiffuse.value = src; m.uniforms.tScene.value = this.rtScene.texture; m.uniforms.tDepth.value = this.rtScene.depthTexture; m.uniforms.tNormal.value = this.rtNormal.texture; m.uniforms.uTime.value = time;
      this.q.material = m; r.setRenderTarget(dst); r.render(this.qs, this.qc);
      if (dst) src = dst.texture;
    });
    r.setRenderTarget(null);
  }
}
