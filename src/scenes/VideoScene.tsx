import React from 'react';
import {AbsoluteFill, OffthreadVideo, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {SceneProps} from '../Short';
import {asset} from '../lib/util';

// Готовый клип (например, из Veo 3), обрезан под 9:16, звук клипа выключен.
// props: src, startFrom? (сек), keepAudio? (true — оставить звук клипа тихо)
export const VideoScene: React.FC<SceneProps> = ({scene, base, durationInFrames}) => {
  const {src, startFrom = 0, keepAudio = false} = scene.props;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const zoom = interpolate(frame, [0, durationInFrames], [1.02, 1.1]);
  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      <OffthreadVideo
        src={asset(base, src)}
        startFrom={Math.round(startFrom * fps)}
        muted={!keepAudio}
        volume={keepAudio ? 0.15 : 0}
        style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})`}}
      />
    </AbsoluteFill>
  );
};
