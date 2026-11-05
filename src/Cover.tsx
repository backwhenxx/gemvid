import React from 'react';
import {AbsoluteFill} from 'remotion';
import type {Timeline, TimedScene} from './types';
import {SectionScene} from './scenes/SectionScene';
import {BrandMark, Grain, Vignette} from './components/Brand';
import {Accented} from './components/Accented';
import {BODY, C, SLAM, applyPalette} from './lib/theme';

// Обложка (= первый кадр в ленте): заголовок в верхней трети, под ним мир ролика, низ пустой
export type CoverSpec = {lines: string[]; sub?: string; bg?: Record<string, any>};

export const Cover: React.FC<{timeline: Timeline; cover: CoverSpec}> = ({timeline, cover}) => {
  applyPalette(timeline.palette);
  const bgScene: TimedScene = {
    type: 'section',
    start: 0,
    end: 10,
    say: '',
    props: cover.bg ?? {cam: [{cx: 545, cy: 292, s: 0.48}, {cx: 545, cy: 292, s: 0.48}], miner: true, ruler: false},
  };
  const longest = Math.max(...cover.lines.map((l) => l.replace(/\*/g, '').length), 1);
  const fs = Math.min(128, Math.floor(960 / (longest * 0.8)));
  return (
    <AbsoluteFill style={{backgroundColor: C.bg}}>
      <SectionScene scene={bgScene} prev={null} base={timeline.base} accent={C.accent} durationInFrames={300} />
      <AbsoluteFill style={{background: `linear-gradient(180deg, ${C.bg} 0%, ${C.bg}EE 22%, ${C.bg}00 38%, ${C.bg}00 70%, ${C.bg} 86%)`}} />
      <div style={{position: 'absolute', left: 60, right: 60, top: 230, textAlign: 'center'}}>
        <div style={{fontFamily: SLAM, fontWeight: 900, fontSize: fs, lineHeight: 1.04, color: C.paper, textTransform: 'uppercase'}}>
          {cover.lines.map((l, i) => (
            <div key={i}>
              <Accented text={l} accent={C.accent} />
            </div>
          ))}
        </div>
        {cover.sub ? (
          <div style={{marginTop: 26, fontFamily: BODY, fontWeight: 600, fontSize: 42, color: C.paper, opacity: 0.7}}>{cover.sub}</div>
        ) : null}
      </div>
      <Vignette />
      <Grain />
      <div style={{transform: 'scale(1.25)', transformOrigin: '0 0', position: 'absolute', inset: 0}}>
        <BrandMark />
      </div>
    </AbsoluteFill>
  );
};
