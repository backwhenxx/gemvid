import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {SceneProps} from '../Short';
import {C, SLAM, expoOut} from '../lib/theme';
import {clamp01} from '../lib/util';

// Финал: белый пузырь «ШТА?!» и кнопка «ПОДПИШИСЬ» с нажатием. Субтитры здесь не рисуются.
export const OutroScene: React.FC<SceneProps> = ({scene}) => {
  const {cta = 'ПОДПИШИСЬ'} = scene.props;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const bubble = expoOut(clamp01(frame / 12));
  const btn = spring({frame: frame - 6, fps, config: {damping: 18, stiffness: 180}});
  const pressAt = 26;
  const press = interpolate(frame, [pressAt, pressAt + 3, pressAt + 9], [1, 0.93, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const pressed = frame >= pressAt + 3;

  return (
    <AbsoluteFill style={{backgroundColor: C.bg}}>
      <div style={{position: 'absolute', top: 620, left: '50%', transform: `translate(-50%, -50%) scale(${0.7 + 0.3 * bubble})`, opacity: bubble}}>
        <div style={{position: 'relative', background: C.paper, color: C.bg, fontFamily: SLAM, fontWeight: 900, fontSize: 150, padding: '36px 84px', borderRadius: 110}}>
          ШТА<span style={{color: C.accent}}>?!</span>
          <div
            style={{
              position: 'absolute',
              left: 110,
              bottom: -50,
              width: 0,
              height: 0,
              borderLeft: '26px solid transparent',
              borderRight: '46px solid transparent',
              borderTop: `60px solid ${C.paper}`,
            }}
          />
        </div>
      </div>
      <div style={{position: 'absolute', top: 960, left: '50%', transform: `translate(-50%, -50%) scale(${btn * press})`}}>
        <div
          style={{
            background: pressed ? '#2A2A33' : C.accent,
            color: C.paper,
            fontFamily: SLAM,
            fontWeight: 900,
            fontSize: 70,
            padding: '30px 70px',
            borderRadius: 26,
            whiteSpace: 'nowrap',
          }}
        >
          {pressed ? 'ВЫ ПОДПИСАНЫ ✓' : cta}
        </div>
      </div>
    </AbsoluteFill>
  );
};
