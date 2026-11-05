import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C, SLAM} from '../lib/theme';

// Маленький белый пузырь «ШТА?!» в левом верхнем углу — единственный фирменный знак
export const BrandMark: React.FC = () => (
  <div style={{position: 'absolute', left: 52, top: 96, pointerEvents: 'none'}}>
    <div
      style={{
        position: 'relative',
        background: C.paper,
        color: C.bg,
        fontFamily: SLAM,
        fontWeight: 900,
        fontSize: 34,
        padding: '12px 24px',
        borderRadius: 30,
        letterSpacing: 0.5,
      }}
    >
      ШТА<span style={{color: C.brand}}>?!</span>
      <div
        style={{
          position: 'absolute',
          left: 26,
          bottom: -14,
          width: 0,
          height: 0,
          borderLeft: '10px solid transparent',
          borderRight: '16px solid transparent',
          borderTop: `18px solid ${C.paper}`,
        }}
      />
    </div>
  </div>
);

// Зерно плёнки: лёгкий шум, меняется раз в 2 кадра
export const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  const seed = Math.floor(frame / 2) % 7;
  return (
    <AbsoluteFill style={{pointerEvents: 'none', opacity: 0.07, mixBlendMode: 'overlay'}}>
      <svg width="1080" height="1920">
        <filter id={`g${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={seed} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="1080" height="1920" filter={`url(#g${seed})`} />
      </svg>
    </AbsoluteFill>
  );
};

// Мягкая виньетка
export const Vignette: React.FC = () => (
  <AbsoluteFill style={{pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.45) 100%)'}} />
);
