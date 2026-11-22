import React from 'react';
import {Composition} from 'remotion';
import timeline from './data/timeline.json';
import {Video} from './Video';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="PaperScore"
    component={Video}
    durationInFrames={timeline.durationFrames}
    fps={timeline.fps}
    width={1920}
    height={1080}
  />
);
