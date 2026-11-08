import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {loadFont} from '@remotion/google-fonts/Comfortaa';
import type {Word} from '../types';

const {fontFamily} = loadFont('normal', {weights: ['700'], subsets: ['cyrillic', 'latin']});

// Субтитры «по одному слову» по центру кадра — как в 3D-роликах канала
export const WordCaptions: React.FC<{words: Word[]; y?: number}> = ({words, y = 1120}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  let w: Word | undefined;
  for (let i = 0; i < words.length; i++) {
    const next = words[i + 1];
    const end = next ? Math.min(next.start, words[i].end + 0.5) : words[i].end + 0.4;
    if (t >= words[i].start && t < end) {
      w = words[i];
      break;
    }
  }
  if (!w) return null;
  const pop = interpolate(frame, [w.start * fps, w.start * fps + 3], [0.86, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const text = w.text.replace(/[.,;:!?…«»"—]+$/g, '').replace(/^[«"—]+/, '');
  if (!text) return null;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: y,
          transform: `translateY(-50%) scale(${pop})`,
          textAlign: 'center',
          fontFamily,
          fontWeight: 700,
          fontSize: 64,
          color: '#ffffff',
          textShadow: '0 3px 10px rgba(0,0,0,0.55), 0 0 2px rgba(0,0,0,0.6)',
        }}
      >
        {text.charAt(0).toUpperCase() + text.slice(1)}
      </div>
    </AbsoluteFill>
  );
};
