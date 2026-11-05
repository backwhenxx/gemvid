import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {SceneProps} from '../Short';
import {GLBackground} from '../components/GLBackground';
import {PixiParticles} from '../components/PixiParticles';
import {FONT} from '../lib/util';

// Финал: розовый «пузырь» канала и кнопка «ПОДПИШИСЬ» с нажатием
export const OutroScene: React.FC<SceneProps> = ({scene, accent}) => {
  const {channel = 'ШТА?!', cta = 'ПОДПИШИСЬ'} = scene.props;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const bubble = spring({frame, fps, config: {damping: 10, stiffness: 160}});
  const btn = spring({frame: frame - 8, fps, config: {damping: 12, stiffness: 200}});
  const pressAt = 22;
  const press = interpolate(frame, [pressAt, pressAt + 4, pressAt + 10], [1, 0.9, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const pressed = frame >= pressAt + 4;
  const ripple = interpolate(frame, [pressAt + 3, pressAt + 22], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const handX = interpolate(frame, [10, pressAt], [260, 90], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const handY = interpolate(frame, [10, pressAt], [220, 40], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill>
      <GLBackground accent={accent} seed={13} />
      <PixiParticles color={accent} count={80} seed={21} />
      <div
        style={{
          position: 'absolute',
          top: 420,
          left: '50%',
          transform: `translateX(-50%) scale(${bubble})`,
          background: accent,
          color: '#fff',
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 150,
          padding: '40px 80px',
          borderRadius: 120,
          boxShadow: `0 0 80px ${accent}`,
        }}
      >
        {channel}
        <div
          style={{
            position: 'absolute',
            bottom: -46,
            left: 120,
            width: 0,
            height: 0,
            borderLeft: '30px solid transparent',
            borderRight: '50px solid transparent',
            borderTop: `60px solid ${accent}`,
          }}
        />
      </div>
      <div style={{position: 'absolute', top: 820, left: '50%', transform: `translateX(-50%) scale(${btn * press})`}}>
        <div
          style={{
            position: 'relative',
            background: pressed ? '#2a2a33' : '#ff1f1f',
            color: '#fff',
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 84,
            padding: '30px 70px',
            borderRadius: 30,
            whiteSpace: 'nowrap',
          }}
        >
          {pressed ? 'ВЫ ПОДПИСАНЫ ✓' : cta}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 700,
              height: 700,
              marginLeft: -350,
              marginTop: -350,
              borderRadius: '50%',
              border: `8px solid ${accent}`,
              transform: `scale(${ripple})`,
              opacity: ripple > 0 ? 1 - ripple : 0,
            }}
          />
          <div style={{position: 'absolute', left: handX + 200, top: handY + 40, fontSize: 110, opacity: btn}}>👆</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
