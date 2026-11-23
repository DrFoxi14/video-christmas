# Video Christmas — score-driven 2.5D paper-cutout video engine

A deterministic Remotion + Three.js scene engine for orchestral and SATB scores. The deliverable is **video-only**: the rendered MP4 contains no audio stream. MusicXML drives the visual choreography; an optional MIDI file supplies the performed tempo map.

An additional Blender pipeline builds a detailed, fully dimensional miniature Nativity set from code and renders a silent 2.5D camera move. It is designed for unattended generation: one command creates the set, animates the camera and score-reactive lighting, and exports MP4. It does not require the user to model or arrange assets.

## Requirements

- Node.js 20+
- npm 10+
- Chromium supported by Remotion

## Quick start

~~~bash
npm install
npm run score:demo
npm run preview
~~~

The demo generator creates an orchestral MIDI and a 15-second fallback timeline. The preview is visual-only.

## Parse the real Finale score

In Finale, export the score as MusicXML (.musicxml, .xml, or compressed .mxl). Optionally export a matching MIDI file to provide the exact performed tempo map.

~~~bash
# MusicXML tempo indications are used
npm run parse:score -- assets/score/slava.musicxml

# MIDI tempo map takes precedence for playback timing
npm run parse:score -- assets/score/slava.musicxml assets/score/slava.mid

# Explicit output path and frame rate
npm run parse:score -- assets/score/slava.musicxml assets/score/slava.mid --out src/data/timeline.json --fps 24
~~~

The analyzer writes src/data/timeline.json and prints a rehearsal summary containing measure count, detected SATB phrase entrances and lyric syllables, dynamic marks/hairpins, harmonic shifts, and probable V–I cadences.

Voice names are taken from the part names where possible. If names are ambiguous, the analyzer estimates the voice from its pitch range and records a confidence value. Harmonic shifts and V–I cadences are heuristic events with confidence scores; review the rehearsal summary before treating them as final storyboard cues.

The MIDI file is optional. When supplied, its tempo map is used to recalculate note, measure, dynamic, accent, voice-entry, and harmony event timestamps. The MIDI must represent the same score and bar/beat layout as the MusicXML.

Finale .musx is not decoded by this project. Export MusicXML or MIDI first; see docs/FINALE-IMPORT.md.

## Render video-only output

~~~bash
# 15-second 720p full-demo verification pass
npm run render:test

# Full 1080p H.264 MP4
npm run render:1080p

# 4K H.264 MP4
npm run render:4k

# 4K ProRes 422 HQ master
npm run render:prores
~~~

The composition does not mount an audio track. A separate audio file is not required for preview or render.

## Visual architecture

- src/scenes/storyboard.ts defines four score-duration-scaled acts, each with its own palette, camera path, transition, and paper layers.
- src/engine/PaperLayer.tsx loads external SVG cutouts from public/assets/cutouts/, extrudes them into cardstock, and animates entrance/exit folds on twos.
- src/engine/PaperTitle.tsx renders the title as a physical gold-foil 3D object that casts shadows.
- src/engine/SceneTransition.tsx provides page-flip, curtain-close, hard-cut, and blackout transitions.
- src/scenes/Diorama.tsx uses a lateral key light, low ambient fill, scene-specific rim light, slow camera paths, and asymmetric accent punch decay.
- src/Video.tsx adds a subtle warm vignette and stepped film grain. There is no audio component.

## Determinism

All animation is derived from the integer Remotion frame and the committed score timeline. Paper grain and micro-jitter use stable seeded values and twos quantization. Runtime AI calls and remote rendering services are not used.


## Detailed Blender scene (automatic generation)

The Blender generator builds a layered 3D miniature set rather than a handful of placeholder shapes: a populated Bethlehem street, individually modelled stonework, timber-framed houses, tiled roofs, a detailed open-front stable with rafters and thatch, a manger, pottery, woven baskets, lanterns, hay, shepherds, Mary and Joseph, an infant, donkey, ox, sheep, olive trees, cypress trees, mountains, clouds and a star field. Materials include procedural surface texture; lighting and camera shots are animated in score time. The output is silent MP4.

Requirements: Blender 4.2+ (installed locally and available as `blender` on PATH). No external 3D asset pack or paid generation API is required.

~~~bash
# Fast 6-second preview, suitable for checking the generated set
npm run render:blender:smoke

# Render the full score timeline to 1080p
npm run render:blender
~~~

The full render also saves `out/nativity-scene.blend` so the generated scene can be inspected in Blender. A scene-detail gate checks that hundreds of architectural, terrain, prop, vegetation and roof elements were generated; it fails the build rather than accepting a sparse placeholder set. The GitHub Actions workflow produces a downloadable short MP4 preview so Windows users can watch it without installing Blender.
