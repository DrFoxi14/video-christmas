import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {Midi} = require('@tonejs/midi') as typeof import('@tonejs/midi');

type DemoNote = {
  family: 'strings' | 'brass' | 'percussion' | 'bass';
  pitch: number;
  start: number;
  duration: number;
  velocity: number;
};

const demoNotes: DemoNote[] = [
  {family: 'strings', pitch: 48, start: 0, duration: 5.8, velocity: 0.24},
  {family: 'strings', pitch: 55, start: 0, duration: 5.8, velocity: 0.2},
  {family: 'strings', pitch: 60, start: 0, duration: 5.8, velocity: 0.17},
  {family: 'strings', pitch: 64, start: 3.4, duration: 5.2, velocity: 0.3},
  {family: 'strings', pitch: 67, start: 3.4, duration: 5.2, velocity: 0.25},
  {family: 'strings', pitch: 72, start: 6.7, duration: 5.4, velocity: 0.37},
  {family: 'strings', pitch: 76, start: 6.7, duration: 5.4, velocity: 0.32},
  {family: 'strings', pitch: 79, start: 9.1, duration: 4.7, velocity: 0.42},
  {family: 'strings', pitch: 83, start: 9.1, duration: 4.7, velocity: 0.35},
  {family: 'brass', pitch: 60, start: 8.92, duration: 0.82, velocity: 0.8},
  {family: 'brass', pitch: 67, start: 8.92, duration: 0.82, velocity: 0.74},
  {family: 'brass', pitch: 72, start: 11.18, duration: 0.78, velocity: 0.88},
  {family: 'brass', pitch: 76, start: 11.18, duration: 0.78, velocity: 0.82},
  {family: 'brass', pitch: 79, start: 13.72, duration: 0.46, velocity: 0.96},
  {family: 'brass', pitch: 83, start: 13.72, duration: 0.46, velocity: 0.92},
  {family: 'percussion', pitch: 49, start: 6.08, duration: 0.34, velocity: 0.74},
  {family: 'percussion', pitch: 49, start: 9.0, duration: 0.3, velocity: 0.88},
  {family: 'percussion', pitch: 57, start: 11.08, duration: 0.36, velocity: 0.91},
  {family: 'percussion', pitch: 49, start: 13.74, duration: 0.42, velocity: 1},
  {family: 'bass', pitch: 36, start: 0, duration: 4.5, velocity: 0.25},
  {family: 'bass', pitch: 31, start: 6.65, duration: 2.4, velocity: 0.42},
  {family: 'bass', pitch: 36, start: 9.0, duration: 2.2, velocity: 0.54},
  {family: 'bass', pitch: 31, start: 11.1, duration: 2.2, velocity: 0.62},
  {family: 'bass', pitch: 24, start: 13.72, duration: 0.56, velocity: 1},
];

const groupName: Record<DemoNote['family'], string> = {
  strings: 'Atmospheric Strings',
  brass: 'French Horns and Brass',
  percussion: 'Orchestral Percussion',
  bass: 'Low Strings / Sub',
};

const midi = new Midi();
midi.header.tempos = [
  {bpm: 72, ticks: 0},
  {bpm: 96, ticks: midi.header.ppq * 8},
  {bpm: 120, ticks: midi.header.ppq * 16},
];
midi.header.update();

for (const family of ['strings', 'brass', 'percussion', 'bass'] as const) {
  const track = midi.addTrack();
  track.name = groupName[family];
  if (family === 'strings') track.instrument.number = 48;
  if (family === 'brass') track.instrument.number = 60;
  if (family === 'bass') track.instrument.number = 43;
  if (family === 'percussion') {
    track.channel = 9;
  }
  for (const note of demoNotes.filter((item) => item.family === family)) {
    track.addNote({
      midi: note.pitch,
      time: note.start,
      duration: note.duration,
      velocity: note.velocity,
    });
  }
}

const midiPath = resolve('public/score/demo.mid');
mkdirSync(dirname(midiPath), {recursive: true});
writeFileSync(midiPath, Buffer.from(midi.toArray()));

console.log('Generated 15-second orchestral demo (visual timing reference only):');
console.log('  MIDI:', midiPath);
console.log('  Notes:', demoNotes.length, '| tempo map: 72 → 96 → 120 BPM');
console.log('  Render output: video-only; no audio track is created.');
