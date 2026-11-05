import React from 'react';
import {Composition, CalculateMetadataFunction} from 'remotion';
import {Short} from './Short';
import type {Timeline} from './types';

// Демо-таймлайн для `npm run studio` без озвучки
const demo: Timeline = {
  fps: 30,
  durationInFrames: 30 * 20,
  base: 'ep/demo',
  voice: null,
  accent: '#FF3D8B',
  words: [],
  sfx: [],
  music: null,
  scenes: [
    {type: 'hook', start: 0, end: 3, say: '', props: {text: 'Под домом есть комната', sub: 'и в ней всегда +4°'}},
    {type: 'draw', start: 3, end: 7, say: '', props: {preset: 'cellar'}},
    {type: 'model3d', start: 7, end: 11, say: '', props: {primitive: 'cellar', cutaway: true}},
    {type: 'number', start: 11, end: 14, say: '', props: {value: 4, suffix: '°C', label: 'круглый год'}},
    {type: 'physics3d', start: 14, end: 17, say: '', props: {count: 120, label: '120 банок'}},
    {type: 'outro', start: 17, end: 20, say: '', props: {}},
  ],
};

type Props = {timeline: Timeline};

const calculateMetadata: CalculateMetadataFunction<Props> = ({props}) => ({
  durationInFrames: props.timeline.durationInFrames,
  fps: props.timeline.fps,
});

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Short"
    component={Short}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={demo.durationInFrames}
    defaultProps={{timeline: demo}}
    calculateMetadata={calculateMetadata}
  />
);
