export type TrackFamily =
  | 'strings'
  | 'brass'
  | 'woodwinds'
  | 'percussion'
  | 'bass'
  | 'keyboard'
  | 'choir'
  | 'other';

export interface TempoPoint {
  tick: number;
  quarter: number;
  timeSeconds: number;
  milliseconds: number;
  frame: number;
  bpm: number;
}

export interface MeasureMarker {
  number: number;
  tick: number;
  quarter: number;
  timeSeconds: number;
  milliseconds: number;
  frame: number;
  numerator: number;
  denominator: number;
}

export interface TimelineNote {
  trackId: string;
  trackName: string;
  family: TrackFamily;
  pitch: number;
  velocity: number;
  startSeconds: number;
  durationSeconds: number;
  startMs: number;
  endMs: number;
  frame: number;
  endFrame: number;
  percussion: boolean;
}

export interface TimelineTrack {
  id: string;
  name: string;
  family: TrackFamily;
  noteCount: number;
  program?: number;
  percussion: boolean;
}

export interface DynamicSample {
  frame: number;
  timeSeconds: number;
  value: number;
}

export interface AccentTrigger {
  id: string;
  kind: 'percussion' | 'brass' | 'crescendo' | 'sub-hit';
  frame: number;
  timeSeconds: number;
  milliseconds: number;
  intensity: number;
  trackName: string;
  pitch?: number;
}

export interface ScoreTimeline {
  version: 1;
  source: {kind: 'midi' | 'musicxml' | 'demo-seed'; file: string; title?: string};
  fps: number;
  durationSeconds: number;
  durationFrames: number;
  ppq: number;
  tempoMap: TempoPoint[];
  measures: MeasureMarker[];
  tracks: TimelineTrack[];
  notes: TimelineNote[];
  dynamics: DynamicSample[];
  accentTriggers: AccentTrigger[];
}
