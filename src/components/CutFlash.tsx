import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {TimedScene} from '../types';

// Короткая вспышка на стыке сцен — «захват внимания» при каждой смене.
// Между двумя картинками не нужна: там работает GL-переход.
export const CutFlash: React.FC<{scenes: TimedScene[]}> = ({scenes}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  let opacity = 0;
  scenes.forEach((s, i) => {
    if (i === 0) return;
    const prev = scenes[i - 1];
    if (prev.type === 'image' && s.type === 'image') return;
    const f = Math.round(s.start * fps);
    opacity = Math.max(opacity, interpolate(frame, [f - 1, f, f + 6], [0, 0.55, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
  });
  if (opacity <= 0) return null;
  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(circle at 50% 45%, rgba(255,255,255,1) 0%, rgba(255,255,255,0.6) 40%, rgba(255,255,255,0) 75%)',
        opacity,
        mixBlendMode: 'screen',
        pointerEvents: 'none',
      }}
    />
  );
};
