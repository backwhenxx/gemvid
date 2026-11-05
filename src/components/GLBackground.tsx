import React, {useLayoutEffect, useRef} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {Renderer, Program, Mesh, Triangle} from 'ogl';
import {hexToRgb} from '../lib/util';

// Живой фон на шейдере (OGL): тёмный градиент с плавающими цветными пятнами и зерном
const vertex = /* glsl */ `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }`;

const fragment = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uSeed;
uniform vec3 uAccent;
uniform vec3 uSecond;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
float blob(vec2 uv, vec2 c, float r){ return smoothstep(r, 0.0, length((uv - c) * vec2(1.0, 1.7778))); }
void main(){
  vec2 uv = vUv;
  float t = uTime * 0.25 + uSeed;
  vec3 col = mix(vec3(0.02,0.02,0.05), vec3(0.05,0.04,0.09), uv.y);
  col += uAccent * 0.55 * blob(uv, vec2(0.5 + 0.3*sin(t*1.1), 0.30 + 0.12*cos(t*0.8)), 0.65);
  col += uSecond * 0.45 * blob(uv, vec2(0.5 + 0.35*cos(t*0.7), 0.72 + 0.1*sin(t*1.3)), 0.6);
  col += uAccent * 0.18 * blob(uv, vec2(0.2 + 0.1*sin(t*2.0), 0.5), 0.35);
  float v = smoothstep(1.15, 0.25, length((uv - 0.5) * vec2(1.0, 1.2)));
  col *= v;
  col += (hash(uv * 900.0 + floor(uTime * 24.0)) - 0.5) * 0.035;
  gl_FragColor = vec4(col, 1.0);
}`;

export const GLBackground: React.FC<{accent: string; second?: string; seed?: number}> = ({
  accent,
  second = '#3D7BFF',
  seed = 1,
}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const st = useRef<{renderer: Renderer; program: Program; mesh: Mesh} | null>(null);
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  useLayoutEffect(() => {
    const renderer = new Renderer({canvas: ref.current!, width: 540, height: 960, dpr: 1, preserveDrawingBuffer: true});
    ref.current!.style.width = '100%';
    ref.current!.style.height = '100%';
    const gl = renderer.gl;
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        uTime: {value: 0},
        uSeed: {value: seed},
        uAccent: {value: hexToRgb(accent)},
        uSecond: {value: hexToRgb(second)},
      },
    });
    const mesh = new Mesh(gl, {geometry: new Triangle(gl), program});
    st.current = {renderer, program, mesh};
    return () => {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      st.current = null;
    };
  }, [accent, second, seed]);

  useLayoutEffect(() => {
    const s = st.current;
    if (!s) return;
    s.program.uniforms.uTime.value = frame / fps;
    s.renderer.render({scene: s.mesh});
  }, [frame, fps, accent, second, seed]);

  return <canvas ref={ref} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />;
};
