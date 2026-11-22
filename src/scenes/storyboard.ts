import type {HarmonyEvent, ScoreTimeline, VoiceName} from '../engine/types';

export type TransitionKind = 'hard-cut' | 'page-flip' | 'curtain-close' | 'blackout';

export type Cue =
  | {type: 'time'; seconds: number; fallbackFrame: number}
  | {type: 'measure'; number: number; fallbackFrame: number}
  | {type: 'progress'; ratio: number; fallbackFrame?: number}
  | {type: 'accent'; kind?: string; index: number; fallbackFrame: number}
  | {type: 'voice-entry'; voice: VoiceName | 'tutti'; index: number; fallbackFrame: number}
  | {type: 'cadence'; index: number; fallbackFrame: number; minConfidence?: number}
  | {type: 'harmonic-shift'; index: number; fallbackFrame: number; minConfidence?: number};

export interface StoryLayer {
  id: string;
  color: string;
  svgSrc?: string;
  svg?: string;
  z: number;
  enterCue: Cue;
  exitCue?: Cue;
  transition: 'fold' | 'slide-left' | 'slide-right' | 'rise' | 'none';
  seed: number;
  jitter?: number;
}

export interface ScenePalette {
  background: string;
  fog: string;
  keyLight: string;
  rimLight: string;
  ambient: number;
}

export interface StoryScene {
  id: string;
  startCue: Cue;
  endCue: Cue;
  palette: ScenePalette;
  cameraPath: {
    from: [number, number, number];
    to: [number, number, number];
    fov: number;
  };
  transitionIn: TransitionKind;
  transitionOut: TransitionKind;
  layers: StoryLayer[];
}

const cutout = (file: string) => 'assets/cutouts/' + file;
const progress = (ratio: number, fallbackFrame: number): Cue => ({
  type: 'progress',
  ratio,
  fallbackFrame,
});

export const storyboard: StoryScene[] = [
  {
    id: 'the-night-before',
    startCue: progress(0, 0),
    endCue: progress(0.24, 86),
    palette: {
      background: '#111d31',
      fog: '#26374c',
      keyLight: '#f4d7a1',
      rimLight: '#91b8dc',
      ambient: 0.09,
    },
    cameraPath: {from: [-0.45, 0.12, 17.2], to: [0.15, 0.02, 16.4], fov: 35},
    transitionIn: 'hard-cut',
    transitionOut: 'page-flip',
    layers: [
      {id: 'night-clouds', color: '#c7c5bd', svgSrc: cutout('cloud-banks.svg'), z: -1.25, enterCue: progress(0, 0), transition: 'slide-left', seed: 42, jitter: 0.0015},
      {id: 'distant-hills', color: '#62798b', svgSrc: cutout('layered-hills.svg'), z: -0.72, enterCue: progress(0.025, 8), transition: 'slide-right', seed: 101},
      {id: 'far-village', color: '#34495c', svgSrc: cutout('bethlehem-village.svg'), z: -0.12, enterCue: progress(0.09, 32), transition: 'rise', seed: 126},
      {id: 'foreground-paper', color: '#1e3348', svgSrc: cutout('foreground-ridge.svg'), z: 0.9, enterCue: progress(0.16, 58), transition: 'fold', seed: 189, jitter: 0.002},
    ],
  },
  {
    id: 'the-journey',
    startCue: progress(0.24, 86),
    endCue: progress(0.5, 180),
    palette: {
      background: '#201b2a',
      fog: '#40364a',
      keyLight: '#e7bd83',
      rimLight: '#a3b8d0',
      ambient: 0.1,
    },
    cameraPath: {from: [0.55, -0.1, 16.9], to: [-0.35, 0.18, 15.9], fov: 34},
    transitionIn: 'page-flip',
    transitionOut: 'curtain-close',
    layers: [
      {id: 'journey-clouds', color: '#b7a99b', svgSrc: cutout('cloud-banks.svg'), z: -1.35, enterCue: progress(0.24, 86), transition: 'slide-left', seed: 242},
      {id: 'journey-hills', color: '#726477', svgSrc: cutout('layered-hills.svg'), z: -0.58, enterCue: progress(0.26, 94), transition: 'slide-right', seed: 278},
      {id: 'distant-arches', color: '#80614e', svgSrc: cutout('gothic-arches.svg'), z: 0.1, enterCue: {type: 'harmonic-shift', index: 0, fallbackFrame: 112, minConfidence: 0.35}, transition: 'fold', seed: 302},
      {id: 'journey-foreground', color: '#352e3c', svgSrc: cutout('foreground-ridge.svg'), z: 0.96, enterCue: progress(0.34, 122), transition: 'rise', seed: 328},
    ],
  },
  {
    id: 'the-manger',
    startCue: progress(0.5, 180),
    endCue: progress(0.78, 281),
    palette: {
      background: '#182335',
      fog: '#394b5d',
      keyLight: '#ffe1a4',
      rimLight: '#b6c9df',
      ambient: 0.11,
    },
    cameraPath: {from: [-0.1, 0.08, 16.2], to: [0.0, 0.3, 15.3], fov: 33},
    transitionIn: 'curtain-close',
    transitionOut: 'page-flip',
    layers: [
      {id: 'manger-arches', color: '#a77f60', svgSrc: cutout('gothic-arches.svg'), z: -0.55, enterCue: progress(0.5, 180), transition: 'fold', seed: 411, jitter: 0.0015},
      {id: 'manger-silhouette', color: '#4d5662', svgSrc: cutout('manger-silhouette.svg'), z: 0.0, enterCue: {type: 'voice-entry', voice: 'soprano', index: 0, fallbackFrame: 194}, transition: 'rise', seed: 428},
      {id: 'golden-radiance', color: '#e5bd73', svgSrc: cutout('fine-rays.svg'), z: 0.48, enterCue: {type: 'cadence', index: 0, fallbackFrame: 224, minConfidence: 0.45}, transition: 'fold', seed: 466, jitter: 0.001},
      {id: 'nativity-star', color: '#f3d69c', svgSrc: cutout('starburst.svg'), z: 0.82, enterCue: {type: 'voice-entry', voice: 'tutti', index: 0, fallbackFrame: 244}, transition: 'fold', seed: 482},
    ],
  },
  {
    id: 'glory',
    startCue: progress(0.78, 281),
    endCue: progress(1, 360),
    palette: {
      background: '#2b211b',
      fog: '#574334',
      keyLight: '#fff0c9',
      rimLight: '#e0bd89',
      ambient: 0.12,
    },
    cameraPath: {from: [0.0, 0.18, 16.0], to: [0, 0.0, 14.8], fov: 32},
    transitionIn: 'page-flip',
    transitionOut: 'blackout',
    layers: [
      {id: 'glory-arches', color: '#b68c64', svgSrc: cutout('gothic-arches.svg'), z: -0.62, enterCue: progress(0.78, 281), transition: 'fold', seed: 511},
      {id: 'glory-clouds', color: '#d8c19d', svgSrc: cutout('cloud-banks.svg'), z: -0.18, enterCue: progress(0.8, 288), transition: 'slide-left', seed: 532},
      {id: 'glory-rays', color: '#f0cb83', svgSrc: cutout('fine-rays.svg'), z: 0.38, enterCue: {type: 'cadence', index: -1, fallbackFrame: 320, minConfidence: 0.4}, transition: 'rise', seed: 548},
      {id: 'glory-star', color: '#f7dda9', svgSrc: cutout('starburst.svg'), z: 0.78, enterCue: progress(0.88, 317), transition: 'fold', seed: 561},
      {id: 'glory-foreground', color: '#352a24', svgSrc: cutout('foreground-ridge.svg'), z: 1.02, enterCue: progress(0.92, 331), transition: 'rise', seed: 579},
    ],
  },
];

const selectIndex = <T,>(items: T[], index: number): T | undefined => {
  if (!items.length) return undefined;
  return index < 0 ? items[items.length + index] : items[index];
};

export const resolveCueFrame = (timeline: ScoreTimeline, cue: Cue): number => {
  if (cue.type === 'time') return Math.round(cue.seconds * timeline.fps);
  if (cue.type === 'progress') {
    return cue.fallbackFrame ?? Math.round(Math.max(0, Math.min(1, cue.ratio)) * timeline.durationFrames);
  }
  if (cue.type === 'measure') {
    return timeline.measures.find((measure) => measure.number === cue.number)?.frame ?? cue.fallbackFrame;
  }
  if (cue.type === 'accent') {
    const matching = timeline.accentTriggers.filter((accent) => !cue.kind || accent.kind === cue.kind);
    return selectIndex(matching, cue.index)?.frame ?? cue.fallbackFrame;
  }
  if (cue.type === 'voice-entry') {
    const matching = (timeline.voiceEntries ?? []).filter((event) =>
      cue.voice === 'tutti' || event.voice === cue.voice,
    );
    return selectIndex(matching, cue.index)?.frame ?? cue.fallbackFrame;
  }
  const candidates: HarmonyEvent[] = (timeline.harmonyEvents ?? [])
    .filter((event) => event.kind === cue.type && event.confidence >= (cue.minConfidence ?? 0));
  return selectIndex(candidates, cue.index)?.frame ?? cue.fallbackFrame;
};

export const sceneFrameRange = (timeline: ScoreTimeline, scene: StoryScene) => ({
  start: Math.max(0, resolveCueFrame(timeline, scene.startCue)),
  end: Math.min(timeline.durationFrames, Math.max(
    resolveCueFrame(timeline, scene.startCue) + 1,
    resolveCueFrame(timeline, scene.endCue),
  )),
});
