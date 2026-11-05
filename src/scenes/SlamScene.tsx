import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import type {SceneProps} from '../Short';
import {Accented} from '../components/Accented';
import {C, MONO, SLAM, expoOut} from '../lib/theme';
import {clamp01} from '../lib/util';

// Слэм-слово на чистом фоне: большой заголовок Unbounded, сверху моно-подпись.
// props: text ("слова *акцент*"), kicker?, size?
export const SlamScene: React.FC<SceneProps> = ({scene, durationInFrames}) => {
  const {text = '', kicker = '', size} = scene.props;
  const frame = useCurrentFrame();
  const words = text.split(' ');
  const longest = Math.max(...text.replace(/\*/g, '').split(/\s+/).map((w: string) => w.length), 1);
  const fs = size ?? Math.max(70, Math.min(150, Math.floor(940 / (longest * 0.86))));
  const zoom = 1 + 0.04 * clamp01(frame / durationInFrames);
  return (
    <AbsoluteFill style={{backgroundColor: C.bg, transform: `scale(${zoom})`}}>
      <div style={{position: 'absolute', left: 60, right: 60, top: 640, transform: 'translateY(-50%)', textAlign: 'center'}}>
        {kicker ? (
          <div style={{fontFamily: MONO, fontWeight: 500, fontSize: 34, color: C.dim, letterSpacing: 6, marginBottom: 24, opacity: expoOut(clamp01(frame / 10))}}>
            {kicker}
          </div>
        ) : null}
        <div style={{fontFamily: SLAM, fontWeight: 900, fontSize: fs, lineHeight: 1.02, color: C.paper, textTransform: 'uppercase'}}>
          {words.map((w: string, i: number) => {
            const o = expoOut(clamp01((frame - i * 1.5) / 9));
            return (
              <span key={i} style={{display: 'inline-block', opacity: o, transform: `translateY(${(1 - o) * 40}px)`, margin: '0 0.12em'}}>
                <Accented text={w} accent={C.accent} />
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
