import React from 'react';
import {AbsoluteFill, Audio, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import timelineJson from './data/timeline.json';
import type {ScoreTimeline} from './engine/types';
import {resolveCueFrame} from './scenes/storyboard';
import {Diorama} from './scenes/Diorama';

export interface VideoProps {
  audioSrc?: string;
}

const timeline = timelineJson as ScoreTimeline;

export const Video: React.FC<VideoProps> = ({audioSrc = 'audio/demo-preview.wav'}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const finalCue = resolveCueFrame(timeline, {
    type: 'accent',
    kind: 'sub-hit',
    index: -1,
    fallbackFrame: Math.round(13.75 * timeline.fps),
  });
  const titleWidth = interpolate(frame, [finalCue, finalCue + 12], [0, 1600], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const titleOpacity = interpolate(frame, [finalCue, finalCue + 3], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{backgroundColor: '#142338'}}>
      <Diorama timeline={timeline} />
      <AbsoluteFill style={{pointerEvents: 'none'}}>
        <svg viewBox="0 0 1600 900" width={width} height={height} style={{width: '100%', height: '100%'}}>
          <defs>
            <clipPath id="final-title-reveal">
              <rect x="0" y="0" width={titleWidth} height="900" />
            </clipPath>
          </defs>
          <g opacity={titleOpacity} clipPath="url(#final-title-reveal)">
            <text
              x="800"
              y="405"
              textAnchor="middle"
              fontFamily="Georgia, 'Times New Roman', serif"
              fontSize="94"
              fontWeight="700"
              letterSpacing="17"
              fill="#f5e3bf"
              stroke="#654d37"
              strokeWidth="2.2"
              paintOrder="stroke"
            >
              SLAVĂ
            </text>
            <path d="M420 454 L1180 454" stroke="#d7ad69" strokeWidth="2" />
            <text
              x="800"
              y="523"
              textAnchor="middle"
              fontFamily="Georgia, 'Times New Roman', serif"
              fontSize="42"
              fontWeight="600"
              letterSpacing="9"
              fill="#f0d7a7"
            >
              PENTRU ÎMPĂRAT
            </text>
          </g>
        </svg>
      </AbsoluteFill>
      <Audio src={staticFile(audioSrc)} />
    </AbsoluteFill>
  );
};
