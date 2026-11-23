import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {dirname, extname, resolve} from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {Midi} = require('@tonejs/midi') as typeof import('@tonejs/midi');
import {XMLParser} from 'fast-xml-parser';
import {unzipSync} from 'fflate';
import type {
  AccentTrigger, DynamicSample, MeasureMarker, ScoreTimeline, TempoPoint,
  TimelineNote, TimelineTrack, TrackFamily,
} from '../src/engine/types';

type RawNote = {
  trackId: string;
  trackName: string;
  family: TrackFamily;
  pitch: number;
  velocity: number;
  startSeconds: number;
  durationSeconds: number;
  percussion: boolean;
};

type ParseResult = {
  sourceKind: 'midi' | 'musicxml';
  ppq: number;
  notes: RawNote[];
  tempos: Array<{tick: number; quarter: number; timeSeconds: number; bpm: number}>;
  measures: Array<{number: number; tick: number; quarter: number; timeSeconds: number; numerator: number; denominator: number}>;
  tracks: TimelineTrack[];
  durationSeconds: number;
};

const args = process.argv.slice(2);
const argValue = (name: string, fallback?: string): string | undefined => {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const prefix = name + '=';
  const inline = args.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : fallback;
};

const input = argValue('--input');
if (!input) {
  console.error('Usage: npm run score:parse -- --input <score.mid|score.musicxml|score.mxl> [--out src/data/timeline.json] [--fps 24] [--duration 15]');
  process.exit(1);
}
const output = resolve(argValue('--out', 'src/data/timeline.json')!);
const fps = Number(argValue('--fps', '24'));
const forcedDuration = argValue('--duration') ? Number(argValue('--duration')) : undefined;

const toNumber = (value: unknown, fallback = 0): number => {
  const number = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isFinite(number) ? number : fallback;
};
const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const textOf = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && '#text' in value) {
    return String((value as {'#text': unknown})['#text']);
  }
  return '';
};

const classify = (name: string, program?: number, percussion = false): TrackFamily => {
  if (percussion || /percussion|drum|timp|cymbal|snare|bass drum/i.test(name)) return 'percussion';
  if (/contrabass|double bass|low strings|sub[- ]?bass|bass guitar/i.test(name)) return 'bass';
  if (/violin|viola|cello|string|orchestra|bowed/i.test(name) || (program !== undefined && program >= 40 && program <= 51)) return 'strings';
  if (/trumpet|horn|trombone|tuba|brass|cornet/i.test(name) || (program !== undefined && program >= 56 && program <= 63)) return 'brass';
  if (/flute|oboe|clarinet|bassoon|piccolo|sax|woodwind/i.test(name) || (program !== undefined && program >= 64 && program <= 79)) return 'woodwinds';
  if (/choir|voice|vocal|chorus|soprano|alto|tenor/i.test(name) || (program !== undefined && program >= 52 && program <= 55)) return 'choir';
  if (/piano|organ|keyboard|harpsichord|celesta/i.test(name) || (program !== undefined && program <= 7)) return 'keyboard';
  if (/bass|low/i.test(name)) return 'bass';
  return 'other';
};

const noteToTimeline = (note: RawNote, fps: number): TimelineNote => ({
  trackId: note.trackId,
  trackName: note.trackName,
  family: note.family,
  pitch: note.pitch,
  velocity: Math.max(0, Math.min(1, note.velocity)),
  startSeconds: note.startSeconds,
  durationSeconds: note.durationSeconds,
  startMs: Math.round(note.startSeconds * 1000),
  endMs: Math.round((note.startSeconds + note.durationSeconds) * 1000),
  frame: Math.round(note.startSeconds * fps),
  endFrame: Math.round((note.startSeconds + note.durationSeconds) * fps),
  percussion: note.percussion,
});

const parseMidi = (path: string): ParseResult => {
  const midi = new Midi(readFileSync(path));
  const ppq = midi.header.ppq || 480;
  const notes: RawNote[] = [];
  const tracks: TimelineTrack[] = midi.tracks.map((track, index) => {
    const name = track.name || track.instrument.name || ('Track ' + (index + 1));
    const percussion = Boolean(track.instrument.percussion) || track.channel === 9;
    const family = classify(name + ' ' + (track.instrument.name || ''), track.instrument.number, percussion);
    for (const note of track.notes) {
      notes.push({
        trackId: 'track-' + index,
        trackName: name,
        family,
        pitch: note.midi,
        velocity: note.velocity,
        startSeconds: note.time,
        durationSeconds: note.duration,
        percussion,
      });
    }
    return {
      id: 'track-' + index,
      name,
      family,
      noteCount: track.notes.length,
      program: track.instrument.number,
      percussion,
    };
  });

  const tempos = midi.header.tempos.map((item) => ({
    tick: item.ticks,
    quarter: item.ticks / ppq,
    timeSeconds: midi.header.ticksToSeconds(item.ticks),
    bpm: item.bpm,
  })).sort((a, b) => a.tick - b.tick);
  if (tempos.length === 0 || tempos[0].tick !== 0) {
    tempos.unshift({tick: 0, quarter: 0, timeSeconds: 0, bpm: tempos[0]?.bpm ?? 120});
  }

  const signatures = midi.header.timeSignatures.length
    ? midi.header.timeSignatures
    : [{ticks: 0, timeSignature: [4, 4] as [number, number]}];
  const endTick = Math.max(
    ...midi.tracks.flatMap((track) => track.notes.map((note) => note.ticks + note.durationTicks)),
    0,
  );
  const measures: ParseResult['measures'] = [];
  let measureNumber = 1;
  for (let signatureIndex = 0; signatureIndex < signatures.length; signatureIndex++) {
    const signature = signatures[signatureIndex];
    const nextSignature = signatures[signatureIndex + 1];
    const startTick = signature.ticks;
    const endSegment = nextSignature?.ticks ?? endTick + ppq * 16;
    const numerator = signature.timeSignature[0] || 4;
    const denominator = signature.timeSignature[1] || 4;
    const barTicks = ppq * numerator * 4 / denominator;
    for (let tick = startTick; tick < endSegment && tick <= endTick; tick += barTicks) {
      measures.push({
        number: measureNumber++,
        tick,
        quarter: tick / ppq,
        timeSeconds: midi.header.ticksToSeconds(tick),
        numerator,
        denominator,
      });
    }
  }

  return {
    sourceKind: 'midi',
    ppq,
    notes,
    tempos,
    measures,
    tracks,
    durationSeconds: Math.max(0, ...notes.map((note) => note.startSeconds + note.durationSeconds)),
  };
};

const parseMusicXml = (path: string): ParseResult => {
  let xml: string;
  if (extname(path).toLowerCase() === '.mxl') {
    const archive = unzipSync(new Uint8Array(readFileSync(path)));
    const xmlPath = Object.keys(archive).find((name) =>
      /\.(musicxml|xml)$/i.test(name) && !name.toLowerCase().includes('meta-inf/container.xml'),
    );
    if (!xmlPath) throw new Error('No MusicXML document found inside the MXL archive.');
    xml = new TextDecoder().decode(archive[xmlPath]);
  } else {
    xml = readFileSync(path, 'utf8');
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    trimValues: true,
  });
  const partNames = new Map<string, {name: string; program?: number}>();
  const partListMatch = xml.match(/<part-list\b[^>]*>([\s\S]*?)<\/part-list>/i);
  if (partListMatch) {
    const partTags = partListMatch[1].matchAll(/<score-part\b([^>]*)>([\s\S]*?)<\/score-part>/gi);
    for (const match of partTags) {
      const id = (match[1].match(/id=["']([^"']+)["']/i) || [])[1] || 'part';
      const body = match[2];
      const explicitName = (body.match(/<part-name\b[^>]*>([\s\S]*?)<\/part-name>/i) || [])[1]?.replace(/<[^>]+>/g, '').trim();
      const instrumentName = (body.match(/<instrument-name\b[^>]*>([\s\S]*?)<\/instrument-name>/i) || [])[1]?.replace(/<[^>]+>/g, '').trim();
      const name = explicitName || instrumentName || id;
      const programValue = (body.match(/<midi-program\b[^>]*>([\s\S]*?)<\/midi-program>/i) || [])[1];
      partNames.set(id, {name, program: programValue ? Math.max(0, toNumber(programValue) - 1) : undefined});
    }
  }

  const partBlocks = [...xml.matchAll(/<part\s+id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/part>/gi)];
  if (partBlocks.length === 0) throw new Error('No score-partwise <part> elements were found in this MusicXML file.');

  const allNotes: Array<RawNote & {measureIndex: number; localQuarter: number; durationQuarter: number}> = [];
  const measureLengths: number[] = [];
  const tempoMarks: Array<{measureIndex: number; localQuarter: number; bpm: number}> = [];
  const timeMarks: Array<{measureIndex: number; numerator: number; denominator: number}> = [];
  const tracks: TimelineTrack[] = [];
  const stepMap: Record<string, number> = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};

  partBlocks.forEach((partMatch, partIndex) => {
    const partId = partMatch[1];
    const partName = partNames.get(partId)?.name ?? partId;
    const program = partNames.get(partId)?.program;
    let divisions = 1;
    let numerator = 4;
    let denominator = 4;
    let dynamic = 0.68;
    const percussion = /percussion|drum|timp|cymbal|snare/i.test(partName);
    const family = classify(partName, program, percussion);
    let noteCount = 0;
    const measureMatches = [...partMatch[2].matchAll(/<measure\b([^>]*)>([\s\S]*?)<\/measure>/gi)];

    measureMatches.forEach((measureMatch, measureIndex) => {
      const body = measureMatch[2];
      let cursor = 0;
      let maxLocal = 0;
      const lastOnsetByVoice = new Map<string, number>();
      const tokenRegex = /<(note|backup|forward|direction|attributes)\b[\s\S]*?<\/\1\s*>/gi;
      for (const tokenMatch of body.matchAll(tokenRegex)) {
        const parsed = parser.parse(tokenMatch[0]) as Record<string, any>;
        const tag = Object.keys(parsed)[0];
        const item = parsed[tag] as Record<string, any>;
        if (tag === 'attributes') {
          if (item.divisions !== undefined) divisions = Math.max(1, toNumber(item.divisions, divisions));
          if (item.time) {
            numerator = Math.max(1, toNumber(item.time.beats, numerator));
            denominator = Math.max(1, toNumber(item.time['beat-type'], denominator));
            timeMarks.push({measureIndex, numerator, denominator});
          }
          continue;
        }
        if (tag === 'backup' || tag === 'forward') {
          const delta = toNumber(item.duration) / divisions;
          cursor = Math.max(0, cursor + (tag === 'backup' ? -delta : delta));
          maxLocal = Math.max(maxLocal, cursor);
          continue;
        }
        if (tag === 'direction') {
          const offset = toNumber(item.offset) / divisions;
          const soundTempo = toNumber(item.sound?.['@_tempo']);
          const directionTypes = asArray(item['direction-type']);
          let metronomeTempo = 0;
          for (const directionType of directionTypes) {
            const metronome = directionType?.metronome;
            if (metronome) {
              const perMinute = toNumber(metronome['per-minute']);
              if (perMinute > 0) {
                const beatUnit = textOf(metronome['beat-unit']) || 'quarter';
                const beatScale = beatUnit.includes('whole') ? 4 :
                  beatUnit.includes('half') ? 2 :
                    beatUnit.includes('eighth') ? 0.5 :
                      beatUnit.includes('16th') ? 0.25 : 1;
                metronomeTempo = perMinute * beatScale;
              }
            }
            const dynamics = directionType?.dynamics;
            if (dynamics && typeof dynamics === 'object') {
              const mark = Object.keys(dynamics)[0];
              const values: Record<string, number> = {
                pppp: 0.16, ppp: 0.22, pp: 0.3, p: 0.4, mp: 0.52,
                mf: 0.66, f: 0.8, ff: 0.91, fff: 0.98,
              };
              if (values[mark]) dynamic = values[mark];
            }
          }
          const bpm = soundTempo || metronomeTempo;
          if (bpm > 0) tempoMarks.push({measureIndex, localQuarter: Math.max(0, cursor + offset), bpm});
          continue;
        }
        if (tag !== 'note') continue;

        const durationQuarter = toNumber(item.duration) / divisions;
        const voice = String(item.voice ?? '1');
        const isChord = item.chord !== undefined;
        const localQuarter = isChord ? (lastOnsetByVoice.get(voice) ?? cursor) : cursor;
        if (!isChord) lastOnsetByVoice.set(voice, cursor);

        if (item.pitch && item.rest === undefined) {
          const pitch = item.pitch;
          const pitchStep = String(pitch.step ?? 'C').toUpperCase();
          const midiPitch = (toNumber(pitch.octave, 4) + 1) * 12 +
            (stepMap[pitchStep] ?? 0) + toNumber(pitch.alter);
          allNotes.push({
            trackId: 'part-' + partIndex,
            trackName: partName,
            family,
            pitch: midiPitch,
            velocity: dynamic,
            startSeconds: 0,
            durationSeconds: 0,
            percussion,
            measureIndex,
            localQuarter,
            durationQuarter,
          });
          noteCount++;
        }
        if (!isChord) cursor += durationQuarter;
        maxLocal = Math.max(maxLocal, localQuarter + durationQuarter, cursor);
      }
      measureLengths[measureIndex] = Math.max(
        measureLengths[measureIndex] ?? 0,
        maxLocal,
        numerator * 4 / denominator,
      );
    });

    tracks.push({
      id: 'part-' + partIndex,
      name: partName,
      family,
      noteCount,
      program,
      percussion,
    });
  });

  const measureStarts: number[] = [];
  let totalQuarter = 0;
  for (let i = 0; i < measureLengths.length; i++) {
    measureStarts[i] = totalQuarter;
    totalQuarter += measureLengths[i];
  }

  const tempoEvents = tempoMarks
    .map((mark) => ({quarter: (measureStarts[mark.measureIndex] ?? 0) + mark.localQuarter, bpm: mark.bpm}))
    .sort((a, b) => a.quarter - b.quarter);
  if (tempoEvents.length === 0 || tempoEvents[0].quarter > 0) tempoEvents.unshift({quarter: 0, bpm: 120});
  const dedupedTempos = tempoEvents.filter((event, index) =>
    index === 0 || event.quarter !== tempoEvents[index - 1].quarter,
  );

  const quarterToSeconds = (quarter: number): number => {
    let cursor = 0;
    let seconds = 0;
    let bpm = dedupedTempos[0]?.bpm ?? 120;
    for (const event of dedupedTempos) {
      if (event.quarter <= cursor) {
        bpm = event.bpm;
        continue;
      }
      if (event.quarter >= quarter) break;
      seconds += (event.quarter - cursor) * 60 / bpm;
      cursor = event.quarter;
      bpm = event.bpm;
    }
    return seconds + Math.max(0, quarter - cursor) * 60 / bpm;
  };

  const notes: RawNote[] = allNotes.map((note) => {
    const startQuarter = (measureStarts[note.measureIndex] ?? 0) + note.localQuarter;
    const endQuarter = startQuarter + note.durationQuarter;
    return {
      trackId: note.trackId,
      trackName: note.trackName,
      family: note.family,
      pitch: note.pitch,
      velocity: note.velocity,
      startSeconds: quarterToSeconds(startQuarter),
      durationSeconds: quarterToSeconds(endQuarter) - quarterToSeconds(startQuarter),
      percussion: note.percussion,
    };
  });

  const tempoMap = dedupedTempos.map((event) => ({
    tick: Math.round(event.quarter * 480),
    quarter: event.quarter,
    timeSeconds: quarterToSeconds(event.quarter),
    bpm: event.bpm,
  }));
  const measures = measureStarts.map((quarter, index) => {
    const signature = timeMarks.filter((item) => item.measureIndex <= index).slice(-1)[0];
    return {
      number: index + 1,
      tick: Math.round(quarter * 480),
      quarter,
      timeSeconds: quarterToSeconds(quarter),
      numerator: signature?.numerator ?? 4,
      denominator: signature?.denominator ?? 4,
    };
  });

  return {
    sourceKind: 'musicxml',
    ppq: 480,
    notes,
    tempos: tempoMap,
    measures,
    tracks,
    durationSeconds: quarterToSeconds(totalQuarter),
  };
};

const buildDynamics = (notes: TimelineNote[], durationFrames: number, fps: number): DynamicSample[] => {
  // Difference arrays keep this linear in score length + render duration, even for large scores.
  const activeVelocityDelta = new Float64Array(durationFrames + 1);
  const activeCountDelta = new Int32Array(durationFrames + 1);
  const sortedStarts = [...notes].sort((a, b) => a.startSeconds - b.startSeconds);

  for (const note of notes) {
    const firstFrame = Math.max(0, Math.ceil(note.startSeconds * fps - 1e-9));
    const lastFrame = Math.min(
      durationFrames - 1,
      Math.floor((note.startSeconds + note.durationSeconds) * fps + 1e-9),
    );
    if (firstFrame > lastFrame) continue;
    activeVelocityDelta[firstFrame] += note.velocity;
    activeVelocityDelta[lastFrame + 1] -= note.velocity;
    activeCountDelta[firstFrame] += 1;
    activeCountDelta[lastFrame + 1] -= 1;
  }

  const samples: DynamicSample[] = [];
  let activeVelocity = 0;
  let activeCount = 0;
  let recentStart = 0;
  let recentEnd = 0;
  let recentCount = 0;

  for (let frame = 0; frame < durationFrames; frame++) {
    const time = frame / fps;
    activeVelocity += activeVelocityDelta[frame];
    activeCount += activeCountDelta[frame];

    while (recentEnd < sortedStarts.length && sortedStarts[recentEnd].startSeconds <= time) {
      recentCount += 1;
      recentEnd += 1;
    }
    while (
      recentStart < recentEnd &&
      sortedStarts[recentStart].startSeconds < time - 0.6
    ) {
      recentCount -= 1;
      recentStart += 1;
    }

    const meanVelocity = activeCount > 0 ? activeVelocity / activeCount : 0;
    const density = Math.min(1, recentCount / 10);
    const raw = Math.min(1, meanVelocity * 0.62 + density * 0.38);
    const previous = samples[samples.length - 1]?.value ?? raw;
    samples.push({
      frame,
      timeSeconds: time,
      value: Math.max(0, Math.min(1, previous * 0.48 + raw * 0.52)),
    });
  }
  return samples;
};

const buildAccents = (notes: TimelineNote[], dynamics: DynamicSample[], fps: number): AccentTrigger[] => {
  const candidates: AccentTrigger[] = [];
  for (const note of notes) {
    if (note.family === 'percussion' && note.velocity >= 0.58) {
      candidates.push({
        id: 'perc-' + note.trackId + '-' + note.frame,
        kind: note.pitch <= 40 ? 'sub-hit' : 'percussion',
        frame: note.frame,
        timeSeconds: note.startSeconds,
        milliseconds: note.startMs,
        intensity: note.velocity,
        trackName: note.trackName,
        pitch: note.pitch,
      });
    } else if (note.family === 'brass' && note.velocity >= 0.72) {
      candidates.push({
        id: 'brass-' + note.trackId + '-' + note.frame,
        kind: 'brass',
        frame: note.frame,
        timeSeconds: note.startSeconds,
        milliseconds: note.startMs,
        intensity: note.velocity,
        trackName: note.trackName,
        pitch: note.pitch,
      });
    } else if (note.family === 'bass' && note.pitch <= 31 && note.velocity >= 0.85) {
      candidates.push({
        id: 'sub-' + note.trackId + '-' + note.frame,
        kind: 'sub-hit',
        frame: note.frame,
        timeSeconds: note.startSeconds,
        milliseconds: note.startMs,
        intensity: note.velocity,
        trackName: note.trackName,
        pitch: note.pitch,
      });
    }
  }

  for (let i = 2; i < dynamics.length - 2; i++) {
    const sample = dynamics[i];
    if (
      sample.value >= 0.88 &&
      sample.value >= dynamics[i - 1].value &&
      sample.value >= dynamics[i + 1].value
    ) {
      candidates.push({
        id: 'crescendo-' + sample.frame,
        kind: 'crescendo',
        frame: sample.frame,
        timeSeconds: sample.timeSeconds,
        milliseconds: Math.round(sample.timeSeconds * 1000),
        intensity: sample.value,
        trackName: 'Score dynamics',
      });
    }
  }

  candidates.sort((a, b) => a.frame - b.frame);
  const filtered: AccentTrigger[] = [];
  for (const candidate of candidates) {
    const previous = filtered[filtered.length - 1];
    if (previous && candidate.frame - previous.frame < Math.round(0.22 * fps)) {
      if (candidate.intensity > previous.intensity) filtered[filtered.length - 1] = candidate;
    } else {
      filtered.push(candidate);
    }
  }
  return filtered;
};

const parsed = extname(input).toLowerCase() === '.mid' || extname(input).toLowerCase() === '.midi'
  ? parseMidi(resolve(input))
  : parseMusicXml(resolve(input));

const durationSeconds = forcedDuration && forcedDuration > 0
  ? forcedDuration
  : Math.max(0.1, parsed.durationSeconds);
const durationFrames = Math.ceil(durationSeconds * fps);
const timelineNotes = parsed.notes.map((note) => noteToTimeline(note, fps));
const dynamics = buildDynamics(timelineNotes, durationFrames, fps);
const accentTriggers = buildAccents(timelineNotes, dynamics, fps);
const tempoMap: TempoPoint[] = parsed.tempos.map((tempo) => ({
  tick: tempo.tick,
  quarter: tempo.quarter,
  timeSeconds: tempo.timeSeconds,
  milliseconds: Math.round(tempo.timeSeconds * 1000),
  frame: Math.round(tempo.timeSeconds * fps),
  bpm: tempo.bpm,
}));
const measures: MeasureMarker[] = parsed.measures.map((measure) => ({
  number: measure.number,
  tick: measure.tick,
  quarter: measure.quarter,
  timeSeconds: measure.timeSeconds,
  milliseconds: Math.round(measure.timeSeconds * 1000),
  frame: Math.round(measure.timeSeconds * fps),
  numerator: measure.numerator,
  denominator: measure.denominator,
}));

const timeline: ScoreTimeline = {
  version: 1,
  source: {kind: parsed.sourceKind, file: input, title: input.split(/[\\/]/).pop()},
  fps,
  durationSeconds,
  durationFrames,
  ppq: parsed.ppq,
  tempoMap,
  measures,
  tracks: parsed.tracks,
  notes: timelineNotes,
  dynamics,
  accentTriggers,
};

mkdirSync(dirname(output), {recursive: true});
writeFileSync(output, JSON.stringify(timeline, null, 2) + '\n');
console.log('Parsed score:', input);
console.log('  Source:', parsed.sourceKind, '| notes:', timelineNotes.length, '| tracks:', parsed.tracks.length);
console.log('  Duration:', durationSeconds.toFixed(3), 's /', durationFrames, 'frames @', fps, 'fps');
console.log('  Tempo points:', tempoMap.length, '| measures:', measures.length, '| accent triggers:', accentTriggers.length);
console.log('  Timeline:', output);
