import {readFileSync, writeFileSync, mkdirSync, unlinkSync} from 'node:fs';
import {basename, dirname, extname, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {XMLParser} from 'fast-xml-parser';
import {unzipSync} from 'fflate';
import type {
  DynamicEvent,
  HarmonyEvent,
  ScoreTimeline,
  SectionDensitySample,
  VoiceEntryEvent,
  VoiceName,
} from '../src/engine/types';

const require = createRequire(import.meta.url);
const {Midi} = require('@tonejs/midi') as typeof import('@tonejs/midi');
type AnyRecord = Record<string, any>;

const args = process.argv.slice(2);
const readFlag = (name: string, fallback?: string) => {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const inline = args.find((arg) => arg.startsWith(name + '='));
  return inline ? inline.slice(name.length + 1) : fallback;
};
const positional = args.filter((arg, index) =>
  !arg.startsWith('--') && args[index - 1] !== '--out' && args[index - 1] !== '--fps' && args[index - 1] !== '--midi',
);
const input = positional[0] ?? readFlag('--input');
const midiInput = readFlag('--midi') ?? positional[1];
const output = resolve(readFlag('--out', 'src/data/timeline.json')!);
const fps = Math.max(1, Number(readFlag('--fps', '24')));

if (!input) {
  console.error('Usage: npm run parse:score -- score.musicxml [tempo.mid] [--out src/data/timeline.json] [--fps 24]');
  process.exit(1);
}
if (!['.musicxml', '.xml', '.mxl'].includes(extname(input).toLowerCase())) {
  throw new Error('The first argument must be MusicXML (.musicxml, .xml, or .mxl).');
}

const tempOutput = resolve(tmpdir(), 'video-christmas-score-' + process.pid + '.json');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const baseArgs = ['run', 'score:parse', '--', '--input', resolve(input), '--out', tempOutput, '--fps', String(fps)];
const baseRun = spawnSync(npm, baseArgs, {
  cwd: process.cwd(),
  encoding: 'utf8',
  shell: process.platform === 'win32',
  stdio: 'inherit',
});
if (baseRun.status !== 0) {
  throw new Error('The base MIDI/MusicXML timeline parser failed.');
}

const timeline = JSON.parse(readFileSync(tempOutput, 'utf8')) as ScoreTimeline;
try { unlinkSync(tempOutput); } catch { /* temporary file cleanup is best-effort */ }

const toNumber = (value: unknown, fallback = 0): number => {
  const result = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isFinite(result) ? result : fallback;
};
const asArray = <T,>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const textOf = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && '#text' in value) {
    return String((value as {'#text': unknown})['#text'] ?? '');
  }
  return '';
};
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

const readXml = (path: string): string => {
  if (extname(path).toLowerCase() !== '.mxl') return readFileSync(path, 'utf8');
  const archive = unzipSync(new Uint8Array(readFileSync(path)));
  const containerPath = Object.keys(archive).find((key) => /meta-inf\/container\.xml$/i.test(key));
  if (containerPath) {
    const container = new TextDecoder().decode(archive[containerPath]);
    const rootPath = container.match(/full-path=["']([^"']+)["']/i)?.[1];
    if (rootPath && archive[rootPath]) return new TextDecoder().decode(archive[rootPath]);
  }
  const xmlPath = Object.keys(archive).find((key) =>
    /\.(musicxml|xml)$/i.test(key) && !/meta-inf\/container\.xml$/i.test(key),
  );
  if (!xmlPath) throw new Error('No MusicXML document was found inside the MXL archive.');
  return new TextDecoder().decode(archive[xmlPath]);
};

const parseXmlRoot = (path: string): AnyRecord => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    trimValues: true,
  });
  const parsed = parser.parse(readXml(path)) as AnyRecord;
  const root = parsed['score-partwise'];
  if (!root) throw new Error('Only score-partwise MusicXML is currently supported.');
  return root as AnyRecord;
};

const oldTempoMap = timeline.tempoMap.length
  ? timeline.tempoMap
  : [{tick: 0, quarter: 0, timeSeconds: 0, milliseconds: 0, frame: 0, bpm: 120}];

const quarterAtSeconds = (seconds: number): number => {
  let previous = oldTempoMap[0];
  for (let index = 1; index < oldTempoMap.length; index++) {
    const next = oldTempoMap[index];
    if (seconds <= next.timeSeconds) {
      return previous.quarter + Math.max(0, seconds - previous.timeSeconds) * previous.bpm / 60;
    }
    previous = next;
  }
  return previous.quarter + Math.max(0, seconds - previous.timeSeconds) * previous.bpm / 60;
};

let midiQuarterToSeconds: ((quarter: number) => number) | undefined;
if (midiInput) {
  const midi = new Midi(readFileSync(resolve(midiInput)));
  const ppq = midi.header.ppq || 480;
  const midiTempos = midi.header.tempos
    .map((event) => ({quarter: event.ticks / ppq, bpm: event.bpm}))
    .sort((a, b) => a.quarter - b.quarter);
  if (!midiTempos.length || midiTempos[0].quarter > 0) {
    midiTempos.unshift({quarter: 0, bpm: midiTempos[0]?.bpm ?? 120});
  }
  midiQuarterToSeconds = (quarter: number) => {
    let currentQuarter = 0;
    let currentSeconds = 0;
    let bpm = midiTempos[0].bpm;
    for (const event of midiTempos) {
      if (event.quarter <= currentQuarter) {
        bpm = event.bpm;
        continue;
      }
      if (event.quarter >= quarter) break;
      currentSeconds += (event.quarter - currentQuarter) * 60 / bpm;
      currentQuarter = event.quarter;
      bpm = event.bpm;
    }
    return currentSeconds + Math.max(0, quarter - currentQuarter) * 60 / bpm;
  };

  const convertSeconds = (seconds: number) => midiQuarterToSeconds!(quarterAtSeconds(seconds));
  for (const note of timeline.notes) {
    const startQuarter = quarterAtSeconds(note.startSeconds);
    const endQuarter = quarterAtSeconds(note.startSeconds + note.durationSeconds);
    note.startSeconds = midiQuarterToSeconds(startQuarter);
    note.durationSeconds = Math.max(0, midiQuarterToSeconds(endQuarter) - note.startSeconds);
    note.startMs = Math.round(note.startSeconds * 1000);
    note.endMs = Math.round((note.startSeconds + note.durationSeconds) * 1000);
    note.frame = Math.round(note.startSeconds * fps);
    note.endFrame = Math.round((note.startSeconds + note.durationSeconds) * fps);
  }
  for (const measure of timeline.measures) {
    measure.tick = Math.round(measure.quarter * ppq);
    measure.timeSeconds = midiQuarterToSeconds(measure.quarter);
    measure.milliseconds = Math.round(measure.timeSeconds * 1000);
    measure.frame = Math.round(measure.timeSeconds * fps);
  }
  for (const sample of timeline.dynamics) {
    sample.timeSeconds = convertSeconds(sample.timeSeconds);
    sample.frame = Math.round(sample.timeSeconds * fps);
  }
  for (const accent of timeline.accentTriggers) {
    accent.timeSeconds = convertSeconds(accent.timeSeconds);
    accent.milliseconds = Math.round(accent.timeSeconds * 1000);
    accent.frame = Math.round(accent.timeSeconds * fps);
  }
  timeline.tempoMap = midiTempos.map((event, index) => {
    const timeSeconds = midiQuarterToSeconds!(event.quarter);
    return {
      tick: Math.round(event.quarter * ppq),
      quarter: event.quarter,
      timeSeconds,
      milliseconds: Math.round(timeSeconds * 1000),
      frame: Math.round(timeSeconds * fps),
      bpm: event.bpm,
    };
  });
  const oldDurationQuarter = quarterAtSeconds(timeline.durationSeconds);
  timeline.durationSeconds = Math.max(
    midiQuarterToSeconds(oldDurationQuarter),
    ...timeline.notes.map((note) => note.startSeconds + note.durationSeconds),
  );
  timeline.durationFrames = Math.ceil(timeline.durationSeconds * fps);
  timeline.ppq = ppq;
}

const root = parseXmlRoot(resolve(input));
const partNames = new Map<string, string>();
const scoreParts = asArray<AnyRecord>(root['part-list']?.['score-part']);
for (const part of scoreParts) {
  const id = String(part['@_id'] ?? '');
  const instrument = asArray<AnyRecord>(part['score-instrument'])[0];
  const instrumentName = textOf(instrument?.['instrument-name']);
  const name = textOf(part['part-name']) || instrumentName || id || 'Unnamed part';
  if (id) partNames.set(id, name);
}
const parts = asArray<AnyRecord>(root.part);
if (!parts.length) throw new Error('The MusicXML file contains no part elements.');

type RawVoiceNote = {
  groupId: string;
  partId: string;
  partName: string;
  voiceNumber: string;
  measureIndex: number;
  quarter: number;
  pitch: number;
  durationQuarter: number;
  phraseStart: boolean;
  syllable: string;
};
const rawVoiceNotes: RawVoiceNote[] = [];
const measurePitchClasses = new Map<number, Set<number>>();
const dynamicEvents: DynamicEvent[] = [];
const partPitchSamples = new Map<string, number[]>();
const keyMarks = new Map<number, {fifths: number; mode: string}>();
const dynamicValues: Record<string, number> = {
  pppp: 0.12, ppp: 0.18, pp: 0.26, p: 0.36, mp: 0.5,
  mf: 0.64, f: 0.78, ff: 0.9, fff: 0.97, ffff: 1,
};

parts.forEach((part, partIndex) => {
  const partId = String(part['@_id'] ?? 'P' + (partIndex + 1));
  const partName = partNames.get(partId) ?? partId;
  const measures = asArray<AnyRecord>(part.measure);
  let divisions = 1;
  const cursorByVoice = new Map<string, number>();
  const lastOnsetByVoice = new Map<string, number>();
  const previousWasRest = new Map<string, boolean>();

  measures.forEach((measure, measureIndex) => {
    cursorByVoice.clear();
    lastOnsetByVoice.clear();
    const measureMarker = timeline.measures[measureIndex];
    if (!measureMarker) return;
    const attributes = measure.attributes as AnyRecord | undefined;
    if (attributes?.divisions !== undefined) divisions = Math.max(1, toNumber(attributes.divisions, divisions));
    if (attributes?.key) {
      const key = asArray<AnyRecord>(attributes.key)[0];
      keyMarks.set(measureIndex, {
        fifths: toNumber(key?.fifths, 0),
        mode: textOf(key?.mode) || 'major',
      });
    }

    const notes = asArray<AnyRecord>(measure.note);
    for (const note of notes) {
      const voiceNumber = textOf(note.voice) || '1';
      const groupId = partId + ':' + voiceNumber;
      const durationQuarter = toNumber(note.duration) / divisions;
      const isChord = note.chord !== undefined;
      const localQuarter = isChord
        ? (lastOnsetByVoice.get(voiceNumber) ?? cursorByVoice.get(voiceNumber) ?? 0)
        : (cursorByVoice.get(voiceNumber) ?? 0);
      if (!isChord) lastOnsetByVoice.set(voiceNumber, localQuarter);
      const isRest = note.rest !== undefined;
      if (isRest) {
        previousWasRest.set(voiceNumber, true);
      } else if (note.pitch) {
        const pitch = note.pitch as AnyRecord;
        const step = textOf(pitch.step).toUpperCase();
        const pitchMap: Record<string, number> = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};
        const midiPitch = (toNumber(pitch.octave, 4) + 1) * 12 + (pitchMap[step] ?? 0) + toNumber(pitch.alter);
        const hadRest = previousWasRest.get(voiceNumber) ?? true;
        const lyrics = asArray<AnyRecord>(note.lyric).flatMap((lyric) => {
          const text = textOf(lyric.text);
          return text ? [text] : [];
        });
        rawVoiceNotes.push({
          groupId,
          partId,
          partName,
          voiceNumber,
          measureIndex,
          quarter: measureMarker.quarter + localQuarter,
          pitch: midiPitch,
          durationQuarter,
          phraseStart: hadRest,
          syllable: lyrics.join(''),
        });
        previousWasRest.set(voiceNumber, false);
        const pc = ((midiPitch % 12) + 12) % 12;
        const pcs = measurePitchClasses.get(measureIndex) ?? new Set<number>();
        pcs.add(pc);
        measurePitchClasses.set(measureIndex, pcs);
        const samples = partPitchSamples.get(groupId) ?? [];
        samples.push(midiPitch);
        partPitchSamples.set(groupId, samples);
      }
      if (!isChord) cursorByVoice.set(voiceNumber, localQuarter + durationQuarter);
    }

    const directions = asArray<AnyRecord>(measure.direction);
    for (const direction of directions) {
      const offsetQuarter = toNumber(direction.offset) / divisions;
      for (const directionType of asArray<AnyRecord>(direction['direction-type'])) {
        if (directionType.dynamics) {
          const dynamicNode = directionType.dynamics as AnyRecord;
          const mark = Object.keys(dynamicNode).find((key) => !key.startsWith('@_'));
          if (mark && dynamicValues[mark] !== undefined) {
            const label = mark.toLowerCase();
            dynamicEvents.push({
              id: 'dynamic-' + measureIndex + '-' + dynamicEvents.length,
              kind: /subito/i.test(textOf(directionType.words)) ? 'subito' : 'mark',
              frame: 0,
              timeSeconds: 0,
              value: dynamicValues[label],
              label,
              confidence: 0.98,
            });
            const event = dynamicEvents[dynamicEvents.length - 1];
            (event as DynamicEvent & {quarter?: number}).quarter = measureMarker.quarter + offsetQuarter;
          }
        }
        const wedge = directionType.wedge as AnyRecord | undefined;
        if (wedge) {
          const wedgeType = String(wedge['@_type'] ?? '');
          const kind = wedgeType === 'crescendo'
            ? 'crescendo'
            : wedgeType === 'diminuendo'
              ? 'decrescendo'
              : wedgeType === 'stop'
                ? 'hairpin-end'
                : undefined;
          if (kind) {
            const event = {
              id: 'hairpin-' + measureIndex + '-' + dynamicEvents.length,
              kind,
              frame: 0,
              timeSeconds: 0,
              label: wedgeType,
              confidence: 0.94,
            } as DynamicEvent & {quarter?: number};
            event.quarter = measureMarker.quarter + offsetQuarter;
            dynamicEvents.push(event);
          }
        }
        const words = textOf(directionType.words);
        if (/subito\s+(p|pp|f|ff)/i.test(words)) {
          const mark = words.match(/(pppp|ppp|pp|p|mp|mf|ff|fff|f)/i)?.[1]?.toLowerCase();
          const event = {
            id: 'subito-' + measureIndex + '-' + dynamicEvents.length,
            kind: 'subito',
            frame: 0,
            timeSeconds: 0,
            value: mark ? dynamicValues[mark] : undefined,
            label: words,
            confidence: 0.9,
          } as DynamicEvent & {quarter?: number};
          event.quarter = measureMarker.quarter + offsetQuarter;
          dynamicEvents.push(event);
        }
      }
    }
  });
});

const sortedMedian = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 60;
  return sorted[Math.floor(sorted.length / 2)];
};
const inferVoice = (partName: string, pitches: number[]): {voice: VoiceName; confidence: number} => {
  const explicit = partName.toLowerCase();
  if (/sopran|discant/.test(explicit)) return {voice: 'soprano', confidence: 0.99};
  if (/alto|contralto/.test(explicit)) return {voice: 'alto', confidence: 0.99};
  if (/tenor/.test(explicit)) return {voice: 'tenor', confidence: 0.99};
  if (/bass|basso/.test(explicit)) return {voice: 'bass', confidence: 0.99};
  const median = sortedMedian(pitches);
  if (median >= 67) return {voice: 'soprano', confidence: 0.7};
  if (median >= 59) return {voice: 'alto', confidence: 0.66};
  if (median >= 50) return {voice: 'tenor', confidence: 0.62};
  return {voice: 'bass', confidence: 0.68};
};

const voices = new Map<string, {voice: VoiceName; confidence: number; trackName: string}>();
for (const note of rawVoiceNotes) {
  if (!voices.has(note.groupId)) {
    const inferred = inferVoice(note.partName, partPitchSamples.get(note.groupId) ?? []);
    voices.set(note.groupId, {...inferred, trackName: note.partName});
  }
}
const syllablesByGroupMeasure = new Map<string, string[]>();
for (const note of rawVoiceNotes) {
  const key = note.groupId + ':' + note.measureIndex;
  if (note.syllable) {
    const items = syllablesByGroupMeasure.get(key) ?? [];
    items.push(note.syllable);
    syllablesByGroupMeasure.set(key, items);
  }
}

const timeAtQuarter = (quarter: number): number => {
  if (midiQuarterToSeconds) return midiQuarterToSeconds(quarter);
  const tempos = timeline.tempoMap.length ? timeline.tempoMap : oldTempoMap;
  let previous = tempos[0];
  for (let index = 1; index < tempos.length; index++) {
    const next = tempos[index];
    if (quarter <= next.quarter) {
      return previous.timeSeconds + Math.max(0, quarter - previous.quarter) * 60 / previous.bpm;
    }
    previous = next;
  }
  return previous.timeSeconds + Math.max(0, quarter - previous.quarter) * 60 / previous.bpm;
};

const voiceEntries: VoiceEntryEvent[] = [];
for (const note of rawVoiceNotes) {
  if (!note.phraseStart) continue;
  const voiceInfo = voices.get(note.groupId);
  if (!voiceInfo) continue;
  const timeSeconds = timeAtQuarter(note.quarter);
  const lyrics = syllablesByGroupMeasure.get(note.groupId + ':' + note.measureIndex) ?? [];
  voiceEntries.push({
    id: 'voice-' + note.groupId + '-' + note.measureIndex + '-' + Math.round(note.quarter * 1000),
    voice: voiceInfo.voice,
    trackId: note.partId,
    trackName: voiceInfo.trackName,
    measureNumber: note.measureIndex + 1,
    frame: Math.round(timeSeconds * fps),
    timeSeconds,
    syllables: lyrics,
    phraseStart: true,
    confidence: voiceInfo.confidence,
  });
}
voiceEntries.sort((a, b) => a.frame - b.frame);

const markTimeEvents = dynamicEvents.map((event) => {
  const quarter = (event as DynamicEvent & {quarter?: number}).quarter ?? 0;
  const timeSeconds = timeAtQuarter(quarter);
  return {
    ...event,
    timeSeconds,
    frame: Math.round(timeSeconds * fps),
  };
}).map((event) => {
  const clean = {...event} as DynamicEvent & {quarter?: number};
  delete clean.quarter;
  return clean as DynamicEvent;
});

const chordAt = (pitchClasses: number[]) => {
  if (!pitchClasses.length) return {root: undefined, quality: 'other' as const, confidence: 0};
  let best = {root: 0, quality: 'other' as 'major' | 'minor' | 'other', confidence: 0};
  for (let rootPitch = 0; rootPitch < 12; rootPitch++) {
    for (const quality of ['major', 'minor'] as const) {
      const intervals = quality === 'major' ? [0, 4, 7] : [0, 3, 7];
      const matches = intervals.filter((interval) => pitchClasses.includes((rootPitch + interval) % 12)).length;
      const extras = pitchClasses.length - matches;
      const confidence = clamp(matches / 3 - extras * 0.055, 0, 1);
      if (confidence > best.confidence) best = {root: rootPitch, quality, confidence};
    }
  }
  return best;
};

const harmonyEvents: HarmonyEvent[] = [];
let previousPitchClasses: number[] = [];
let previousChord: ReturnType<typeof chordAt> | undefined;
const keyAtMeasure = (measureIndex: number) => {
  let current = {fifths: 0, mode: 'major'};
  for (const [index, key] of [...keyMarks.entries()].sort((a, b) => a[0] - b[0])) {
    if (index > measureIndex) break;
    current = key;
  }
  return current;
};

timeline.measures.forEach((measure, index) => {
  const pitchClasses = [...(measurePitchClasses.get(index) ?? new Set<number>())].sort((a, b) => a - b);
  const chord = chordAt(pitchClasses);
  if (previousPitchClasses.length && pitchClasses.length) {
    const intersection = pitchClasses.filter((pc) => previousPitchClasses.includes(pc)).length;
    const union = new Set([...pitchClasses, ...previousPitchClasses]).size;
    const distance = union ? 1 - intersection / union : 0;
    if (distance >= 0.42 && chord.confidence >= 0.48) {
      harmonyEvents.push({
        id: 'harmony-shift-' + measure.number,
        kind: 'harmonic-shift',
        measureNumber: measure.number,
        frame: measure.frame,
        timeSeconds: measure.timeSeconds,
        pitchClasses,
        root: chord.root,
        quality: chord.quality,
        confidence: clamp(distance * chord.confidence, 0, 1),
        label: 'Measure ' + measure.number + ': pitch-class change',
      });
    }
  }

  if (previousChord?.root !== undefined && chord.root !== undefined) {
    const key = keyAtMeasure(index);
    const majorTonic = ((7 * key.fifths) % 12 + 12) % 12;
    const tonic = key.mode.toLowerCase() === 'minor' ? (majorTonic + 9) % 12 : majorTonic;
    const dominant = (tonic + 7) % 12;
    if (previousChord.root === dominant && chord.root === tonic) {
      const confidence = Math.min(previousChord.confidence, chord.confidence) *
        (previousChord.quality === 'major' ? 0.94 : 0.68);
      if (confidence >= 0.35) {
        harmonyEvents.push({
          id: 'cadence-v-i-' + measure.number,
          kind: 'cadence',
          measureNumber: measure.number,
          frame: measure.frame,
          timeSeconds: measure.timeSeconds,
          pitchClasses,
          root: chord.root,
          quality: chord.quality,
          confidence,
          label: 'Probable V–I cadence (' + (key.mode || 'major') + ')',
        });
      }
    }
  }
  if (pitchClasses.length) {
    previousPitchClasses = pitchClasses;
    previousChord = chord;
  }
});

const buildSectionDensity = (): SectionDensitySample[] => {
  const families = ['strings', 'brass', 'woodwinds', 'percussion', 'bass', 'choir'] as const;
  const deltas = Object.fromEntries(families.map((family) => [
    family,
    new Int32Array(timeline.durationFrames + 1),
  ])) as Record<typeof families[number], Int32Array>;
  for (const note of timeline.notes) {
    if (!families.includes(note.family as typeof families[number])) continue;
    const start = clamp(note.frame, 0, timeline.durationFrames - 1);
    const end = clamp(Math.max(start, note.endFrame), start, timeline.durationFrames - 1);
    deltas[note.family as typeof families[number]][start] += 1;
    deltas[note.family as typeof families[number]][end + 1] -= 1;
  }
  const active = Object.fromEntries(families.map((family) => [family, 0])) as Record<typeof families[number], number>;
  const output: SectionDensitySample[] = [];
  for (let frame = 0; frame < timeline.durationFrames; frame++) {
    for (const family of families) active[family] += deltas[family][frame];
    output.push({
      frame,
      strings: clamp(active.strings / 8, 0, 1),
      brass: clamp(active.brass / 5, 0, 1),
      woodwinds: clamp(active.woodwinds / 5, 0, 1),
      percussion: clamp(active.percussion / 4, 0, 1),
      bass: clamp(active.bass / 4, 0, 1),
      choir: clamp(active.choir / 6, 0, 1),
    });
  }
  return output;
};

timeline.voiceEntries = voiceEntries;
timeline.dynamicEvents = markTimeEvents;
timeline.harmonyEvents = harmonyEvents.sort((a, b) => a.frame - b.frame);
timeline.sectionDensity = buildSectionDensity();
timeline.source = {
  ...timeline.source,
  kind: 'musicxml',
  file: input,
  title: basename(input).replace(/\.(musicxml|xml|mxl)$/i, ''),
};

mkdirSync(dirname(output), {recursive: true});
writeFileSync(output, JSON.stringify(timeline, null, 2) + '\n');

const voiceCounts = new Map<string, number>();
for (const entry of voiceEntries) voiceCounts.set(entry.voice, (voiceCounts.get(entry.voice) ?? 0) + 1);
const dynamicCounts = markTimeEvents.reduce((counts, event) => {
  counts[event.kind] = (counts[event.kind] ?? 0) + 1;
  return counts;
}, {} as Record<string, number>);
const cadenceCount = harmonyEvents.filter((event) => event.kind === 'cadence').length;
const shiftCount = harmonyEvents.filter((event) => event.kind === 'harmonic-shift').length;

console.log('\nScore rehearsal summary');
console.table([
  {metric: 'Measures', detected: timeline.measures.length},
  {metric: 'SATB phrase entrances', detected: voiceEntries.length},
  {metric: 'Soprano / Alto / Tenor / Bass', detected: [
    voiceCounts.get('soprano') ?? 0,
    voiceCounts.get('alto') ?? 0,
    voiceCounts.get('tenor') ?? 0,
    voiceCounts.get('bass') ?? 0,
  ].join(' / ')},
  {metric: 'Dynamic marks / hairpins', detected: markTimeEvents.length},
  {metric: 'Probable V–I cadences', detected: cadenceCount},
  {metric: 'Harmonic shifts', detected: shiftCount},
  {metric: 'Duration', detected: timeline.durationSeconds.toFixed(2) + ' s'},
]);
console.log('\nVoice entrances');
console.table(voiceEntries.slice(0, 40).map((entry) => ({
  measure: entry.measureNumber,
  voice: entry.voice,
  time: entry.timeSeconds.toFixed(2) + 's',
  lyrics: entry.syllables.join(' '),
  confidence: entry.confidence.toFixed(2),
})));
console.log('\nDynamics');
console.table(markTimeEvents.map((event) => ({
  time: event.timeSeconds.toFixed(2) + 's',
  type: event.kind,
  mark: event.label,
})));
console.log('\nHarmony');
console.table(harmonyEvents.map((event) => ({
  measure: event.measureNumber,
  type: event.kind,
  chord: event.root === undefined ? 'unknown' : event.root + ' ' + (event.quality ?? ''),
  confidence: event.confidence.toFixed(2),
})));
console.log('\nTimeline written:', output);
if (midiInput) console.log('Tempo reference:', midiInput);
