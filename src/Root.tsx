import React from 'react';
import {Composition} from 'remotion';
import timeline from './data/timeline.json';
import {Video, type VideoProps} from './Video';

export const RemotionRoot: React.FC = () => (
  <Composition<VideoProps>
    id="PaperScore"
    component={Video}
    durationInFrames={timeline.durationFrames}
    fps={timeline.fps}
    width={1920}
    height={1080}
    defaultProps={{audioSrc: 'audio/demo-preview.wav'}}
  />
);
