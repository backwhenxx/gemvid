import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {AbsoluteFill, Img, cancelRender, continueRender, delayRender, useCurrentFrame} from 'remotion';
import {Renderer, Program, Mesh, Triangle, Texture} from 'ogl';
import glTransitionsModule from 'gl-transitions';
import type {SceneProps} from '../Short';
import {Accented} from '../components/Accented';
import {FONT, H, W, asset, clamp01, easeInOut} from '../lib/util';

// Картинка (например, из Nano Banana) с медленным 2.5D-наездом.
// Если предыдущая сцена тоже картинка — переход между ними шейдером из GL Transitions (через OGL).
// props: src, transition? (имя из gl-transitions), title?
const ALL: any[] = ((glTransitionsModule as any).default ?? glTransitionsModule) as any[];
const DEFAULT_CYCLE = ['directionalwarp', 'crosswarp', 'cube', 'Swirl', 'LinearBlur', 'ZoomInCircles', 'wind', 'GlitchMemories'];
const TRANSITION_FRAMES = 14;

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

// Параметры наезда: зависят только от имени файла и прогресса → стыки совпадают
export const kenBurns = (src: string, p: number) => {
  const h = hash(src);
  const dir = h % 4;
  const s = 1.04 + 0.12 * p;
  const dx = (dir === 0 ? -1 : dir === 1 ? 1 : 0) * 40 * p;
  const dy = (dir === 2 ? -1 : dir === 3 ? 1 : 0) * 50 * p;
  return {s, dx, dy};
};

const drawCover = (img: HTMLImageElement, kb: {s: number; dx: number; dy: number}) => {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const sc = Math.max(W / img.naturalWidth, H / img.naturalHeight) * kb.s;
  const w = img.naturalWidth * sc;
  const h = img.naturalHeight * sc;
  ctx.drawImage(img, (W - w) / 2 + kb.dx, (H - h) / 2 + kb.dy, w, h);
  return c;
};

const loadImg = (url: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Не загрузилась картинка: ' + url));
    i.src = url;
  });

const VERT = `attribute vec2 uv; attribute vec2 position; varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }`;

const fragFor = (glsl: string) => `precision highp float;
uniform sampler2D from; uniform sampler2D to; uniform float progress; uniform float ratio;
varying vec2 vUv;
vec4 getFromColor(vec2 uv){ return texture2D(from, uv); }
vec4 getToColor(vec2 uv){ return texture2D(to, uv); }
${glsl}
void main(){ gl_FragColor = transition(vUv); }`;

export const ImageScene: React.FC<SceneProps> = ({scene, prev, base, accent, durationInFrames}) => {
  const {src, transition, title = ''} = scene.props;
  const prevSrc: string | null = prev && prev.type === 'image' ? prev.props.src : null;
  const frame = useCurrentFrame();
  const canvas = useRef<HTMLCanvasElement>(null);
  const gl = useRef<{renderer: Renderer; program: Program; mesh: Mesh} | null>(null);
  const [ready, setReady] = useState(!prevSrc);
  const [handle] = useState(() => (prevSrc ? delayRender('gl-transition') : null));

  useEffect(() => {
    if (!prevSrc) return;
    (async () => {
      const [a, b] = await Promise.all([loadImg(asset(base, prevSrc)), loadImg(asset(base, src))]);
      const name = transition ?? DEFAULT_CYCLE[hash(src) % DEFAULT_CYCLE.length];
      const t = ALL.find((x) => x.name.toLowerCase() === String(name).toLowerCase()) ?? ALL.find((x) => x.name === 'fade');
      const renderer = new Renderer({canvas: canvas.current!, width: W / 2, height: H / 2, dpr: 1, preserveDrawingBuffer: true});
      canvas.current!.style.width = '100%';
      canvas.current!.style.height = '100%';
      const g = renderer.gl;
      const mk = (c: HTMLCanvasElement) => new Texture(g, {image: c, generateMipmaps: false});
      const uniforms: Record<string, {value: any}> = {
        from: {value: mk(drawCover(a, kenBurns(prevSrc, 1)))},
        to: {value: mk(drawCover(b, kenBurns(src, 0)))},
        progress: {value: 0},
        ratio: {value: W / H},
      };
      Object.entries(t.defaultParams ?? {}).forEach(([k, v]) => (uniforms[k] = {value: v}));
      const program = new Program(g, {vertex: VERT, fragment: fragFor(t.glsl), uniforms});
      gl.current = {renderer, program, mesh: new Mesh(g, {geometry: new Triangle(g), program})};
      setReady(true);
      continueRender(handle!);
    })().catch((e) => cancelRender(e));
    return () => {
      gl.current?.renderer.gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [prevSrc, src]);

  const inTransition = !!prevSrc && frame < TRANSITION_FRAMES;

  useLayoutEffect(() => {
    if (!inTransition || !gl.current) return;
    gl.current.program.uniforms.progress.value = easeInOut(frame / TRANSITION_FRAMES);
    gl.current.renderer.render({scene: gl.current.mesh});
  }, [frame, ready]);

  const kb = kenBurns(src, clamp01(frame / durationInFrames));

  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      <Img
        src={asset(base, src)}
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `translate(${kb.dx}px, ${kb.dy}px) scale(${kb.s})`,
        }}
      />
      {prevSrc ? (
        <canvas ref={canvas} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', display: inTransition ? 'block' : 'none'}} />
      ) : null}
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.45) 100%)'}} />
      {title ? (
        <div
          style={{
            position: 'absolute',
            top: 200,
            left: 60,
            right: 60,
            textAlign: 'center',
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 86,
            color: '#fff',
            textTransform: 'uppercase',
            WebkitTextStroke: '8px #000',
            paintOrder: 'stroke fill',
          }}
        >
          <Accented text={title} accent={accent} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
