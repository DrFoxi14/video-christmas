export type TrackFamily =
  | 'strings'
  | 'brass'
  | 'woodwinds'
  | 'percussion'
  | 'bass'
  | 'keyboard'
  | 'choir'
  | 'other';

export type VoiceName = 'soprano' | 'alto' | 'tenor' | 'bass' | 'unknown';

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

export interface VoiceEntryEvent {
  id: string;
  voice: VoiceName;
  trackId: string;
  trackName: string;
  measureNumber: number;
  frame: number;
  timeSeconds: number;
  syllables: string[];
  phraseStart: boolean;
  confidence: number;
}

export interface DynamicEvent {
  id: string;
  kind: 'mark' | 'crescendo' | 'decrescendo' | 'subito' | 'hairpin-end';
  frame: number;
  timeSeconds: number;
  value?: number;
  label: string;
  confidence: number;
}

export interface HarmonyEvent {
  id: string;
  kind: 'harmonic-shift' | 'cadence';
  measureNumber: number;
  frame: number;
  timeSeconds: number;
  pitchClasses: number[];
  root?: number;
  quality?: 'major' | 'minor' | 'other';
  confidence: number;
  label: string;
}

export interface SectionDensitySample {
  frame: number;
  strings: number;
  brass: number;
  woodwinds: number;
  percussion: number;
  bass: number;
  choir: number;
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
  voiceEntries?: VoiceEntryEvent[];
  dynamicEvents?: DynamicEvent[];
  harmonyEvents?: HarmonyEvent[];
  sectionDensity?: SectionDensitySample[];
}
