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

const writeWav = (path: string, notes: DemoNote[], durationSeconds: number) => {
  const sampleRate = 44100;
  const channels = 2;
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const pcm = Buffer.alloc(sampleCount * channels * 2);

  for (let i = 0; i < sampleCount; i++) {
    const time = i / sampleRate;
    let sample = 0;
    for (const note of notes) {
      const local = time - note.start;
      if (local < 0 || local > note.duration) continue;
      const attack = Math.min(1, local / (note.family === 'percussion' ? 0.008 : 0.48));
      const release = Math.min(1, (note.duration - local) / (note.family === 'percussion' ? 0.12 : 0.5));
      const envelope = Math.max(0, Math.min(attack, release));
      const frequency = 440 * Math.pow(2, (note.pitch - 69) / 12);
      let voice: number;
      if (note.family === 'percussion') {
        const transient = Math.exp(-local * 14) * Math.sin(2 * Math.PI * frequency * 1.8 * local);
        const low = Math.exp(-local * 11) * Math.sin(2 * Math.PI * 48 * local);
        voice = transient * 0.55 + low * 0.7;
      } else {
        const partials =
          Math.sin(2 * Math.PI * frequency * local) * 0.62 +
          Math.sin(2 * Math.PI * frequency * 2 * local) * 0.23 +
          Math.sin(2 * Math.PI * frequency * 3.01 * local) * 0.1;
        const vibrato = 1 + Math.sin(local * 4.1) * 0.0015;
        voice = Math.sin(2 * Math.PI * frequency * vibrato * local) * 0.62 + partials * 0.38;
      }
      const gain = note.family === 'strings' ? 0.13 : note.family === 'brass' ? 0.17 : note.family === 'bass' ? 0.2 : 0.22;
      sample += voice * envelope * note.velocity * gain;
    }
    const fadeOut = time > 14.28 ? Math.max(0, 1 - (time - 14.28) / 0.04) : 1;
    sample = Math.max(-0.94, Math.min(0.94, sample * fadeOut));
    const pcmValue = Math.round(sample * 32767);
    pcm.writeInt16LE(pcmValue, i * 4);
    pcm.writeInt16LE(pcmValue, i * 4 + 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, Buffer.concat([header, pcm]));
};

const midi = new Midi();
midi.header.setTempo(72, 0);
midi.header.setTempo(96, midi.header.ppq * 8);
midi.header.setTempo(120, midi.header.ppq * 16);

for (const family of ['strings', 'brass', 'percussion', 'bass'] as const) {
  const track = midi.addTrack();
  track.name = groupName[family];
  if (family === 'strings') track.instrument.number = 48;
  if (family === 'brass') track.instrument.number = 60;
  if (family === 'bass') track.instrument.number = 43;
  if (family === 'percussion') {
    track.channel = 9;
    track.instrument.percussion = true;
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
const wavPath = resolve('public/audio/demo-preview.wav');
mkdirSync(dirname(midiPath), {recursive: true});
writeFileSync(midiPath, Buffer.from(midi.toArray()));
writeWav(wavPath, demoNotes, 15);

console.log('Generated 15-second orchestral demo:');
console.log('  MIDI:', midiPath);
console.log('  WAV: ', wavPath);
console.log('  Notes:', demoNotes.length, '| tempo map: 72 → 96 → 120 BPM');
