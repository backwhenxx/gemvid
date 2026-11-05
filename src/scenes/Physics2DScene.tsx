import React, {useMemo} from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import Matter from 'matter-js';
import type {SceneProps} from '../Short';
import {GLBackground} from '../components/GLBackground';
import {Accented} from '../components/Accented';
import {FONT, rng} from '../lib/util';

// 2D-физика (Matter.js): эмодзи/предметы падают и копятся в «стакане».
// props: items (["🥔","🥕"]), count, label?, radius?
const LEFT = 150;
const RIGHT = 930;
const FLOOR = 1150;

export const Physics2DScene: React.FC<SceneProps> = ({scene, accent, durationInFrames}) => {
  const {items = ['🥔', '🥕', '🍎'], count = 40, label = '', radius = 52} = scene.props;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const sim = useMemo(() => {
    (Matter.Common as any)._seed = 12345;
    const engine = Matter.Engine.create({gravity: {x: 0, y: 1.4, scale: 0.001}});
    const st = {isStatic: true};
    Matter.Composite.add(engine.world, [
      Matter.Bodies.rectangle((LEFT + RIGHT) / 2, FLOOR + 30, RIGHT - LEFT + 120, 60, st),
      Matter.Bodies.rectangle(LEFT - 30, FLOOR - 600, 60, 1300, st),
      Matter.Bodies.rectangle(RIGHT + 30, FLOOR - 600, 60, 1300, st),
    ]);
    const r = rng(77);
    const n = Math.min(count, 120);
    const bodies = Array.from({length: n}, (_, i) =>
      Matter.Bodies.circle(LEFT + radius + r() * (RIGHT - LEFT - radius * 2), -radius - i * radius * 0.9, radius * (0.85 + r() * 0.3), {
        restitution: 0.35,
        friction: 0.2,
        angle: r() * 6.28,
      }),
    );
    Matter.Composite.add(engine.world, bodies);
    const out = new Float32Array(durationInFrames * n * 3);
    for (let f = 0; f < durationInFrames; f++) {
      Matter.Engine.update(engine, 1000 / fps);
      bodies.forEach((b, i) => out.set([b.position.x, b.position.y, b.angle], (f * n + i) * 3));
    }
    return {out, n, radii: bodies.map((b) => (b as any).circleRadius as number)};
  }, [count, radius, durationInFrames, fps]);

  const f = Math.min(frame, durationInFrames - 1);
  const labelIn = interpolate(frame, [4, 16], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill>
      <GLBackground accent={accent} seed={4} />
      <svg width={1080} height={1920} style={{position: 'absolute', inset: 0}}>
        <path
          d={`M ${LEFT - 6} ${FLOOR - 520} L ${LEFT - 6} ${FLOOR + 6} L ${RIGHT + 6} ${FLOOR + 6} L ${RIGHT + 6} ${FLOOR - 520}`}
          stroke="rgba(255,255,255,0.75)"
          strokeWidth={10}
          fill="rgba(255,255,255,0.04)"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {Array.from({length: sim.n}, (_, i) => {
          const k = (f * sim.n + i) * 3;
          const rr = sim.radii[i];
          return (
            <text
              key={i}
              x={0}
              y={0}
              fontSize={rr * 1.9}
              textAnchor="middle"
              dominantBaseline="central"
              transform={`translate(${sim.out[k]} ${sim.out[k + 1]}) rotate(${(sim.out[k + 2] * 180) / Math.PI})`}
              style={{fontFamily: '"Noto Color Emoji", "Apple Color Emoji", sans-serif'}}
            >
              {items[i % items.length]}
            </text>
          );
        })}
      </svg>
      {label ? (
        <div
          style={{
            position: 'absolute',
            top: 250,
            left: 60,
            right: 60,
            textAlign: 'center',
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 92,
            color: '#fff',
            textTransform: 'uppercase',
            opacity: labelIn,
            textShadow: '0 8px 30px rgba(0,0,0,0.8)',
          }}
        >
          <Accented text={label} accent={accent} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
