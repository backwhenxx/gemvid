import React, {useLayoutEffect, useRef} from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import paper from 'paper';
import type {SceneProps} from '../Short';
import {GLBackground} from '../components/GLBackground';
import {Accented} from '../components/Accented';
import {FONT, clamp01, easeInOut} from '../lib/util';

// Чертёж «от руки» (Paper.js): линии рисуются по очереди со свечением, подписи появляются по ходу.
// props: preset? ("cellar") ИЛИ paths: [{d, color?, width?}], labels?: [{text, x, y, at}], title?
type PathDef = {d: string; color?: string; width?: number};
type LabelDef = {text: string; x: number; y: number; at: number};

const PRESETS: Record<string, {paths: PathDef[]; labels: LabelDef[]}> = {
  cellar: {
    paths: [
      {d: 'M 60 640 L 1020 640', width: 8},
      {d: 'M 290 640 L 290 420 L 540 250 L 790 420 L 790 640'},
      {d: 'M 500 640 L 500 520 L 580 520 L 580 640'},
      {d: 'M 700 640 L 700 680 L 660 680 L 660 720 L 620 720 L 620 760 L 580 760 L 580 800', color: 'accent'},
      {d: 'M 320 800 L 760 800 L 760 1110 L 320 1110 Z', color: 'accent', width: 9},
      {d: 'M 350 900 L 520 900 M 350 1000 L 520 1000', width: 5},
      {d: 'M 120 700 L 170 750 M 120 820 L 170 870 M 120 940 L 170 990 M 900 700 L 950 750 M 900 820 L 950 870 M 900 940 L 950 990', width: 4, color: '#8a6a52'},
    ],
    labels: [
      {text: 'дом', x: 540, y: 470, at: 0.25},
      {text: '−2,5 м', x: 900, y: 1060, at: 0.6},
      {text: '*+4 °C* круглый год', x: 540, y: 1165, at: 0.8},
    ],
  },
};

export const DrawScene: React.FC<SceneProps> = ({scene, accent, durationInFrames}) => {
  const {preset = 'cellar', paths: customPaths, labels: customLabels, title = ''} = scene.props;
  const def = customPaths ? {paths: customPaths as PathDef[], labels: (customLabels ?? []) as LabelDef[]} : PRESETS[preset] ?? PRESETS.cellar;
  const labels = customLabels ?? def.labels;
  const frame = useCurrentFrame();
  const canvas = useRef<HTMLCanvasElement>(null);
  const st = useRef<{scope: paper.PaperScope; items: {path: paper.Path; len: number; offset: number}[]; total: number} | null>(null);

  useLayoutEffect(() => {
    const c = canvas.current!;
    c.setAttribute('hidpi', 'off');
    c.setAttribute('data-paper-hidpi', 'off');
    c.width = 1080;
    c.height = 1920;
    const scope = new paper.PaperScope();
    scope.setup(c);
    const items: {path: paper.Path; len: number; offset: number}[] = [];
    let total = 0;
    def.paths.forEach((p) => {
      p.d
        .split(/(?=M)/)
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((sub) => {
          const path = new scope.Path(sub);
          const col = !p.color || p.color === 'white' ? '#ffffff' : p.color === 'accent' ? accent : p.color;
          path.strokeColor = new scope.Color(col);
          path.strokeWidth = p.width ?? 7;
          path.strokeCap = 'round';
          path.strokeJoin = 'round';
          path.shadowColor = new scope.Color(col);
          path.shadowBlur = 22;
          const len = path.length;
          items.push({path, len, offset: total});
          total += len;
        });
    });
    st.current = {scope, items, total};
    return () => {
      scope.project.remove();
      st.current = null;
    };
  }, [preset, accent]);

  useLayoutEffect(() => {
    const s = st.current;
    if (!s) return;
    const p = easeInOut(frame / (durationInFrames * 0.75));
    const drawn = p * s.total;
    s.items.forEach(({path, len, offset}) => {
      const v = clamp01((drawn - offset) / len);
      path.dashArray = [len, len];
      path.dashOffset = len * (1 - v);
      path.visible = v > 0;
    });
    (s.scope.view as any).update?.();
  }, [frame]);

  const titleIn = interpolate(frame, [2, 14], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill>
      <GLBackground accent={accent} second="#1d3b6b" seed={8} />
      <AbsoluteFill
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.05) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,0.05) 2px, transparent 2px)',
          backgroundSize: '60px 60px',
        }}
      />
      <canvas ref={canvas} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
      {labels.map((l, i) => {
        const f0 = l.at * durationInFrames * 0.85;
        const o = interpolate(frame, [f0, f0 + 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: l.x,
              top: l.y,
              transform: `translate(-50%, -50%) scale(${0.7 + 0.3 * o})`,
              opacity: o,
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: 54,
              color: '#fff',
              whiteSpace: 'nowrap',
              background: 'rgba(7,7,12,0.7)',
              padding: '8px 22px',
              borderRadius: 14,
              border: '3px solid rgba(255,255,255,0.25)',
            }}
          >
            <Accented text={l.text} accent={accent} />
          </div>
        );
      })}
      {title ? (
        <div
          style={{
            position: 'absolute',
            top: 140,
            left: 60,
            right: 60,
            textAlign: 'center',
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 80,
            color: '#fff',
            textTransform: 'uppercase',
            opacity: titleIn,
          }}
        >
          <Accented text={title} accent={accent} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
