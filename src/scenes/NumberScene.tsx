import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {SceneProps} from '../Short';
import {P5Field} from '../components/P5Field';
import {Accented} from '../components/Accented';
import {FONT, easeOutCubic} from '../lib/util';

// Большое число со счётчиком. props: value, prefix?, suffix?, decimals?, label?, from?
export const NumberScene: React.FC<SceneProps> = ({scene, accent, durationInFrames}) => {
  const {value = 100, prefix = '', suffix = '', decimals = 0, label = '', from = 0} = scene.props;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const countFrames = Math.min(durationInFrames * 0.55, fps * 1.4);
  const p = easeOutCubic(frame / countFrames);
  const v = from + (value - from) * p;
  const shown = v.toLocaleString('ru-RU', {minimumFractionDigits: decimals, maximumFractionDigits: decimals});
  const landed = spring({frame: frame - Math.round(countFrames), fps, config: {damping: 9, stiffness: 180}});
  const enter = spring({frame, fps, config: {damping: 16}});
  const labelIn = interpolate(frame, [countFrames * 0.6, countFrames * 0.6 + 10], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const str = `${prefix}${shown}${suffix}`;

  return (
    <AbsoluteFill>
      <P5Field color={accent} seed={5} />
      <AbsoluteFill style={{background: 'radial-gradient(circle at 50% 38%, rgba(0,0,0,0) 0%, rgba(7,7,12,0.75) 70%)'}} />
      <div
        style={{
          position: 'absolute',
          top: 470,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: str.length > 7 ? 190 : 270,
          color: '#fff',
          fontVariantNumeric: 'tabular-nums',
          transform: `scale(${0.6 + 0.4 * enter + 0.12 * Math.sin(Math.min(landed, 1) * Math.PI)})`,
          textShadow: `0 0 ${40 + 50 * Math.min(landed, 1)}px ${accent}`,
          letterSpacing: -6,
        }}
      >
        {str}
      </div>
      {label ? (
        <div
          style={{
            position: 'absolute',
            top: 820,
            left: 80,
            right: 80,
            textAlign: 'center',
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 64,
            color: 'rgba(255,255,255,0.92)',
            opacity: labelIn,
            transform: `translateY(${(1 - labelIn) * 30}px)`,
          }}
        >
          <Accented text={label} accent={accent} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
