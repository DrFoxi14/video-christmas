import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import timelineJson from './data/timeline.json';
import type {ScoreTimeline} from './engine/types';
import {Diorama} from './scenes/Diorama';

const timeline = timelineJson as ScoreTimeline;

const FilmFinish: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const grainSeed = Math.floor(frame / 2) % 97;
  return (
    <AbsoluteFill style={{pointerEvents: 'none', mixBlendMode: 'overlay'}}>
      <svg
        viewBox="0 0 1600 900"
        width={width}
        height={height}
        style={{width: '100%', height: '100%'}}
        preserveAspectRatio="none"
      >
        <defs>
          <radialGradient id="warm-vignette">
            <stop offset="48%" stopColor="#000000" stopOpacity="0" />
            <stop offset="100%" stopColor="#1a0e08" stopOpacity="0.52" />
          </radialGradient>
          <filter id="paper-grain">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.82"
              numOctaves="2"
              seed={grainSeed}
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncA type="table" tableValues="0 0.24" />
            </feComponentTransfer>
          </filter>
        </defs>
        <rect width="1600" height="900" fill="url(#warm-vignette)" opacity="0.42" />
        <rect width="1600" height="900" filter="url(#paper-grain)" opacity="0.14" />
      </svg>
    </AbsoluteFill>
  );
};

export const Video: React.FC = () => (
  <AbsoluteFill style={{backgroundColor: '#111d31'}}>
    <Diorama timeline={timeline} />
    <FilmFinish />
  </AbsoluteFill>
);
