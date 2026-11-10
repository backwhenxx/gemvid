import React from 'react';
import {AbsoluteFill} from 'remotion';
import type {Timeline, TimedScene} from './types';
import {SectionScene} from './scenes/SectionScene';
import {DamScene} from './scenes/dam/DamScene';
import {TrenchScene} from './scenes/trench/TrenchScene';
import {SepticScene} from './scenes/septic/SepticScene';
import {TowerScene} from './scenes/tower/TowerScene';
import {SubwayScene} from './scenes/subway/SubwayScene';
import {SteamScene} from './scenes/steam/SteamScene';
import {ShanghaiScene} from './scenes/shanghai/ShanghaiScene';
import {PanamaScene} from './scenes/panama/PanamaScene';
import {YakhScene} from './scenes/yakh/YakhScene';
import {BrandMark, Grain, Vignette} from './components/Brand';
import {Accented} from './components/Accented';
import {BODY, C, SLAM, applyPalette} from './lib/theme';

// Обложка (= первый кадр в ленте): заголовок в верхней трети, под ним мир ролика, низ пустой
export type CoverSpec = {lines: string[]; sub?: string; bg?: Record<string, any> | null; dam?: Record<string, any>; trench?: Record<string, any>; septic?: Record<string, any>; tower?: Record<string, any>; subway?: Record<string, any>; steam?: Record<string, any>; shanghai?: Record<string, any>; panama?: Record<string, any>; yakh?: Record<string, any>};

export const Cover: React.FC<{timeline: Timeline; cover: CoverSpec}> = ({timeline, cover}) => {
  applyPalette(timeline.palette);
  const bgScene: TimedScene = {
    type: 'section',
    start: 0,
    end: 10,
    say: '',
    props: cover.bg ?? {cam: [{cx: 545, cy: -200, s: 0.4}, {cx: 545, cy: -200, s: 0.4}], miner: true, ruler: false},
  };
  const longest = Math.max(...cover.lines.map((l) => l.replace(/\*/g, '').length), 1);
  // Unbounded широкий: ~1 em на букву, строка не должна переноситься
  const fs = Math.min(118, Math.floor(940 / (longest * 1.0)));
  return (
    <AbsoluteFill style={{backgroundColor: C.bg}}>
      {cover.yakh ? (
        <YakhScene scene={{type: 'yakh', start: 0, end: 10, say: '', props: cover.yakh}} prev={null} base={timeline.base} accent={C.accent} durationInFrames={300} />
      ) : cover.panama ? (
        <PanamaScene scene={{type: 'panama', start: 0, end: 10, say: '', props: cover.panama}} prev={null} base={timeline.base} accent={C.accent} durationInFrames={300} />
      ) : cover.shanghai ? (
        <ShanghaiScene scene={{type: 'shanghai', start: 0, end: 10, say: '', props: cover.shanghai}} prev={null} base={timeline.base} accent={C.accent} durationInFrames={300} />
      ) : cover.steam ? (
        <SteamScene scene={{type: 'steam', start: 0, end: 10, say: '', props: cover.steam}} prev={null} base={timeline.base} accent={C.accent} durationInFrames={300} />
      ) : cover.subway ? (
        <SubwayScene scene={{type: 'subway', start: 0, end: 10, say: '', props: cover.subway}} prev={null} base={timeline.base} accent={C.accent} durationInFrames={300} />
      ) : cover.tower ? (
        <TowerScene scene={{type: 'tower', start: 0, end: 10, say: '', props: cover.tower}} prev={null} base={timeline.base} accent={C.accent} durationInFrames={300} />
      ) : cover.septic ? (
        <SepticScene scene={{type: 'septic', start: 0, end: 10, say: '', props: cover.septic}} prev={null} base={timeline.base} accent={C.accent} durationInFrames={300} />
      ) : cover.trench ? (
        <TrenchScene scene={{type: 'trench', start: 0, end: 10, say: '', props: cover.trench}} prev={null} base={timeline.base} accent={C.accent} durationInFrames={300} />
      ) : cover.dam ? (
        <DamScene scene={{type: 'dam', start: 0, end: 10, say: '', props: cover.dam}} prev={null} base={timeline.base} accent={C.accent} durationInFrames={300} />
      ) : (
        <SectionScene scene={bgScene} prev={null} base={timeline.base} accent={C.accent} durationInFrames={300} />
      )}
      <AbsoluteFill
        style={{
          background:
            cover.dam || cover.trench || cover.septic || cover.tower || cover.subway || cover.steam || cover.shanghai || cover.panama || cover.yakh
              ? `linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.25) 26%, rgba(0,0,0,0) 40%, rgba(0,0,0,0) 74%, rgba(0,0,0,0.55) 100%)`
              : `linear-gradient(180deg, ${C.bg} 0%, ${C.bg}F0 30%, ${C.bg}00 46%, ${C.bg}00 72%, ${C.bg} 86%)`,
        }}
      />
      <div style={{position: 'absolute', left: 60, right: 60, top: 290, textAlign: 'center'}}>
        <div style={{fontFamily: SLAM, fontWeight: 900, fontSize: fs, lineHeight: 1.04, color: C.paper, textTransform: 'uppercase'}}>
          {cover.lines.map((l, i) => (
            <div key={i} style={{whiteSpace: 'nowrap'}}>
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
