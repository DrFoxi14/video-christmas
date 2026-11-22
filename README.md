# Video Christmas — deterministic paper-cutout score engine

A code-driven 2.5D stop-motion composition rendered with Remotion and Three.js. No generative video models are used: cutouts, lighting, camera motion, reveals, typography, and timing are deterministic functions of the score timeline.

## Requirements

- Node.js 20+
- npm 10+
- Chromium supported by Remotion (Remotion downloads its pinned browser automatically)

## Quick start

```bash
npm install
npm run score:demo
npm run preview
```

The demo generator writes `public/score/demo.mid` and `public/audio/demo-preview.wav`; the parser writes `src/data/timeline.json`. Remotion Studio opens the `PaperScore` composition at 1920×1080 and 24 fps.

## Use your own score

1. Copy a MIDI file to `assets/score/input.mid` or MusicXML (`.musicxml`, `.xml`, `.mxl`) to `assets/score/input.musicxml`.
2. Copy the mastered WAV to `public/audio/master.wav`.
3. Parse the score:

```bash
npm run score:parse -- --input assets/score/input.mid --out src/data/timeline.json --fps 24
# or
npm run score:parse -- --input assets/score/input.musicxml --out src/data/timeline.json --fps 24
```

4. Preview with the master track:

```bash
npx remotion studio src/index.ts --props='{"audioSrc":"audio/master.wav"}'
```

The parser supports MIDI and MusicXML/MXL. Finale `.musx` is a proprietary container and is not decoded by this project; export the attached Finale score to MusicXML or MIDI first, then run the parser. See `docs/FINALE-IMPORT.md`.

## Render

```bash
# 5-second 720p verification pass
npm run render:test

# Full 1080p H.264 MP4
npm run render:1080p

# 4K H.264 MP4
npm run render:4k

# 4K ProRes 422 HQ master
npm run render:prores
```

For a master WAV, pass `--props='{"audioSrc":"audio/master.wav"}'` to any render command. `--gl=angle` enables the WebGL backend needed by Three.js in headless Chromium.

## Architecture

- `scripts/generate-demo-score.ts` creates a 15-second orchestral MIDI plus deterministic synthesized WAV.
- `scripts/parse-score.ts` normalizes MIDI / MusicXML into exact millisecond and 24-fps frame events, tempo map, measures, track families, dynamics, and accent triggers.
- `src/engine/` provides procedural cardstock maps, extruded SVG paper layers, on-twos timing, seeded paper boil, and hinge spring curves.
- `src/scenes/storyboard.ts` binds scene entrances and reveals to score events / measures.
- `src/Video.tsx` renders the layered diorama and audio in Remotion.

## Determinism

All composition animation is derived from the integer Remotion frame and the committed score timeline. Randomness is seeded by stable layer IDs and quantized frame indices. There are no runtime AI calls, remote assets, or nondeterministic video generation steps.
