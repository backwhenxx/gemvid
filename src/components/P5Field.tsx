import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {continueRender, delayRender, useCurrentFrame, useVideoConfig} from 'remotion';
import p5 from 'p5';
import {rng} from '../lib/util';

// Генеративный фон на p5.js: линии, текущие по полю шума
export const P5Field: React.FC<{color?: string; seed?: number}> = ({color = '#FF3D8B', seed = 3}) => {
  const ref = useRef<HTMLDivElement>(null);
  const inst = useRef<p5 | null>(null);
  const tRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender('p5 init'));
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  useEffect(() => {
    const sketch = (p: p5) => {
      const starts: [number, number][] = [];
      p.setup = () => {
        const c = p.createCanvas(540, 960);
        (c as any).elt.style.width = '100%';
        (c as any).elt.style.height = '100%';
        p.pixelDensity(1);
        p.noiseSeed(seed);
        const r = rng(seed);
        for (let i = 0; i < 160; i++) starts.push([r() * 540, r() * 960]);
        p.noLoop();
        setReady(true);
        continueRender(handle);
      };
      p.draw = () => {
        const t = tRef.current;
        p.background(7, 7, 12);
        const col = p.color(color);
        p.noFill();
        p.strokeWeight(1.6);
        starts.forEach(([sx, sy], i) => {
          col.setAlpha(40 + (i % 5) * 18);
          p.stroke(col);
          let x = sx;
          let y = sy;
          p.beginShape();
          for (let k = 0; k < 28; k++) {
            p.vertex(x, y);
            const a = p.noise(x * 0.004, y * 0.004, t * 0.12) * p.TWO_PI * 2;
            x += Math.cos(a) * 7;
            y += Math.sin(a) * 7;
          }
          p.endShape();
        });
      };
    };
    inst.current = new p5(sketch, ref.current!);
    return () => {
      inst.current?.remove();
      inst.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    if (!ready || !inst.current) return;
    tRef.current = frame / fps;
    inst.current.redraw();
  }, [frame, ready]);

  return <div ref={ref} style={{position: 'absolute', inset: 0}} />;
};
