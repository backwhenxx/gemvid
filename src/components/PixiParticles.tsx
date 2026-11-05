import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {continueRender, delayRender, useCurrentFrame, useVideoConfig} from 'remotion';
import {Application, Graphics, Sprite} from 'pixi.js';
import {H, W, rng} from '../lib/util';

// Светящиеся частицы на PixiJS. Позиция каждой — функция времени,
// поэтому кадры одинаковые при любом порядке рендера.
type P = {x: number; y: number; vy: number; amp: number; ph: number; s: number; a: number};

export const PixiParticles: React.FC<{color?: string; count?: number; seed?: number}> = ({
  color = '#FF3D8B',
  count = 90,
  seed = 7,
}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const st = useRef<{app: Application; sprites: Sprite[]; data: P[]} | null>(null);
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender('pixi init'));
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  useEffect(() => {
    let alive = true;
    const app = new Application();
    app
      .init({
        canvas: ref.current!,
        width: W / 2,
        height: H / 2,
        backgroundAlpha: 0,
        antialias: true,
        autoStart: false,
        preserveDrawingBuffer: true,
        preference: 'webgl',
      })
      .then(() => {
        if (!alive) return;
        app.ticker.stop();
        ref.current!.style.width = '100%';
        ref.current!.style.height = '100%';
        // Мягкая «светящаяся» точка из концентрических кругов
        const g = new Graphics();
        for (let i = 10; i >= 1; i--) g.circle(0, 0, i * 3).fill({color: 0xffffff, alpha: 0.06 + (10 - i) * 0.01});
        g.circle(0, 0, 4).fill({color: 0xffffff, alpha: 1});
        const tex = app.renderer.generateTexture(g);
        const r = rng(seed);
        const tint = parseInt(color.replace('#', ''), 16);
        const data: P[] = [];
        const sprites: Sprite[] = [];
        for (let i = 0; i < count; i++) {
          data.push({x: r() * (W / 2), y: r() * (H / 2), vy: 8 + r() * 30, amp: 10 + r() * 40, ph: r() * 6.28, s: 0.2 + r() * 0.8, a: 0.3 + r() * 0.7});
          const sp = new Sprite(tex);
          sp.anchor.set(0.5);
          sp.tint = i % 4 === 0 ? 0xffffff : tint;
          sp.blendMode = 'add';
          app.stage.addChild(sp);
          sprites.push(sp);
        }
        st.current = {app, sprites, data};
        setReady(true);
        continueRender(handle);
      });
    return () => {
      alive = false;
      try {
        app.destroy();
      } catch {}
      st.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const s = st.current;
    if (!s || !ready) return;
    const t = frame / fps;
    s.data.forEach((d, i) => {
      const sp = s.sprites[i];
      const hh = H / 2 + 60;
      sp.x = d.x + Math.sin(t * 0.8 + d.ph) * d.amp;
      sp.y = ((((d.y - t * d.vy) % hh) + hh) % hh) - 30;
      sp.scale.set(d.s);
      sp.alpha = d.a * (0.6 + 0.4 * Math.sin(t * 2.3 + d.ph));
    });
    s.app.render();
  }, [frame, ready]);

  return <canvas ref={ref} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />;
};
