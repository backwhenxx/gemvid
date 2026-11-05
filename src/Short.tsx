import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig} from 'remotion';
import type {Timeline, TimedScene} from './types';
import {Captions} from './components/Captions';
import {CutFlash} from './components/CutFlash';
import {HookScene} from './scenes/HookScene';
import {NumberScene} from './scenes/NumberScene';
import {Model3DScene} from './scenes/Model3DScene';
import {Physics3DScene} from './scenes/Physics3DScene';
import {Physics2DScene} from './scenes/Physics2DScene';
import {DrawScene} from './scenes/DrawScene';
import {ImageScene} from './scenes/ImageScene';
import {VideoScene} from './scenes/VideoScene';
import {OutroScene} from './scenes/OutroScene';

export type SceneProps = {
  scene: TimedScene;
  prev: TimedScene | null;
  base: string;
  accent: string;
  durationInFrames: number;
};

const REGISTRY: Record<string, React.FC<SceneProps>> = {
  hook: HookScene,
  number: NumberScene,
  model3d: Model3DScene,
  physics3d: Physics3DScene,
  physics2d: Physics2DScene,
  draw: DrawScene,
  image: ImageScene,
  video: VideoScene,
  outro: OutroScene,
};

export const Short: React.FC<{timeline: Timeline}> = ({timeline}) => {
  const {fps} = useVideoConfig();
  const {scenes, base, accent} = timeline;

  return (
    <AbsoluteFill style={{backgroundColor: '#07070c'}}>
      {scenes.map((s, i) => {
        const from = Math.round(s.start * fps);
        const dur = Math.max(1, Math.round(s.end * fps) - from);
        const C = REGISTRY[s.type] ?? HookScene;
        return (
          <Sequence key={i} from={from} durationInFrames={dur} name={`${i + 1}. ${s.type}`}>
            <C scene={s} prev={scenes[i - 1] ?? null} base={base} accent={accent} durationInFrames={dur} />
          </Sequence>
        );
      })}

      <CutFlash scenes={scenes} />
      <Captions words={timeline.words} accent={accent} />

      {timeline.voice ? <Audio src={staticFile(`${base}/${timeline.voice}`)} /> : null}
      {timeline.music ? (
        <Audio src={staticFile(timeline.music.file)} volume={timeline.music.volume} loop />
      ) : null}
      {timeline.sfx.map((c, i) => (
        <Sequence key={`sfx${i}`} from={Math.max(0, Math.round(c.at * fps))} name="sfx" layout="none">
          <Audio src={staticFile(c.file)} volume={c.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
