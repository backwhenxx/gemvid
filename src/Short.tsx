import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Timeline, TimedScene} from './types';
import {Captions} from './components/Captions';
import {BrandMark, Grain, Vignette} from './components/Brand';
import {C, applyPalette, expoOut} from './lib/theme';
import {HookScene} from './scenes/HookScene';
import {NumberScene} from './scenes/NumberScene';
import {Model3DScene} from './scenes/Model3DScene';
import {Physics3DScene} from './scenes/Physics3DScene';
import {Physics2DScene} from './scenes/Physics2DScene';
import {DrawScene} from './scenes/DrawScene';
import {ImageScene} from './scenes/ImageScene';
import {VideoScene} from './scenes/VideoScene';
import {OutroScene} from './scenes/OutroScene';
import {SectionScene} from './scenes/SectionScene';
import {GaugeScene} from './scenes/GaugeScene';
import {Fan3DScene} from './scenes/Fan3DScene';
import {SlamScene} from './scenes/SlamScene';
import {DamScene} from './scenes/dam/DamScene';
import {TrenchScene} from './scenes/trench/TrenchScene';
import {SepticScene} from './scenes/septic/SepticScene';
import {TowerScene} from './scenes/tower/TowerScene';
import {SubwayScene} from './scenes/subway/SubwayScene';
import {SteamScene} from './scenes/steam/SteamScene';
import {ShanghaiScene} from './scenes/shanghai/ShanghaiScene';
import {PanamaScene} from './scenes/panama/PanamaScene';
import {YakhScene} from './scenes/yakh/YakhScene';
import {MayakScene} from './scenes/mayak/MayakScene';
import {AviaScene} from './scenes/avia/AviaScene';
import {TonnelScene} from './scenes/tonnel/TonnelScene';
import {WordCaptions} from './components/WordCaptions';

export type SceneProps = {
  scene: TimedScene;
  prev: TimedScene | null;
  base: string;
  accent: string;
  durationInFrames: number;
  // Видимая длина сцены (без 10 кадров нахлёста под следующую). Все движения считать по ней: p = frame / life.
  life?: number;
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
  section: SectionScene,
  gauge: GaugeScene,
  fan3d: Fan3DScene,
  slam: SlamScene,
  dam: DamScene,
  trench: TrenchScene,
  septic: SepticScene,
  tower: TowerScene,
  subway: SubwayScene,
  steam: SteamScene,
  shanghai: ShanghaiScene,
  panama: PanamaScene,
  yakh: YakhScene,
  mayak: MayakScene,
  avia: AviaScene,
  tonnel: TonnelScene,
};

// Переход «рост из точки»: новая сцена раскрывается кругом поверх предыдущей. Без кроссфейдов.
const TR = 10;
const Grow: React.FC<{on: boolean; at: [number, number]; children: React.ReactNode}> = ({on, at, children}) => {
  const frame = useCurrentFrame();
  const r = on ? expoOut(frame / TR) * 2300 : 4000;
  return (
    <AbsoluteFill style={{backgroundColor: C.bg, clipPath: on && frame < TR ? `circle(${r}px at ${at[0]}px ${at[1]}px)` : undefined}}>
      {children}
    </AbsoluteFill>
  );
};

const BrandUntil: React.FC<{until: number}> = ({until}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return frame / fps < until ? <BrandMark /> : null;
};

export const Short: React.FC<{timeline: Timeline}> = ({timeline}) => {
  const {fps} = useVideoConfig();
  applyPalette(timeline.palette);
  const {scenes, base, accent} = timeline;
  const outro = scenes.find((s) => s.type === 'outro');

  return (
    <AbsoluteFill style={{backgroundColor: C.bg}}>
      {scenes.map((s, i) => {
        const from = Math.round(s.start * fps);
        const isLast = i === scenes.length - 1;
        const life = Math.max(1, Math.round(s.end * fps) - from);
        const dur = life + (isLast ? 0 : TR);
        const C2 = REGISTRY[s.type] ?? SlamScene;
        const grow = i > 0 && !s.props.cont;
        return (
          <Sequence key={i} from={from} durationInFrames={dur} name={`${i + 1}. ${s.type}`}>
            <Grow on={grow} at={s.props.growAt ?? [540, 860]}>
              <C2 scene={s} prev={scenes[i - 1] ?? null} base={base} accent={accent} durationInFrames={dur} life={life} />
            </Grow>
          </Sequence>
        );
      })}

      <Vignette />
      <Grain />
      {timeline.brand === false ? null : <BrandUntil until={outro ? outro.start : 1e9} />}
      {timeline.captionStyle === 'word' ? (
        <WordCaptions words={timeline.words} />
      ) : (
        <Captions words={timeline.words} keys={timeline.keys} hideFrom={outro ? outro.start : undefined} />
      )}

      {timeline.voice ? <Audio src={staticFile(`${base}/${timeline.voice}`)} /> : null}
      {timeline.music ? <Audio src={staticFile(timeline.music.file)} volume={timeline.music.volume} loop /> : null}
      {(timeline.ambience ?? []).map((a, i) => {
        const from = Math.round(a.from * fps);
        const dur = Math.max(1, Math.round(a.to * fps) - from);
        return (
          <Sequence key={`amb${i}`} from={from} durationInFrames={dur} name="фон" layout="none">
            <Audio src={staticFile(a.file)} loop volume={(f) => a.volume * Math.min(1, f / 15, (dur - f) / 15)} />
          </Sequence>
        );
      })}
      {timeline.sfx.map((c, i) => (
        <Sequence key={`sfx${i}`} from={Math.max(0, Math.round(c.at * fps))} name="sfx" layout="none">
          <Audio src={staticFile(c.file)} volume={c.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

export type {TimedScene};
