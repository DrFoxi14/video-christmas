# Importing the attached Finale score

The uploaded archive identifies itself as a MakeMusic notation container and contains a binary score.dat payload. It is not a MIDI file or a MusicXML document. This repository intentionally does not guess pitches, tempos, dynamics, or bar lines from that opaque payload.

## Preferred conversion

In Finale, open the original score and choose **File → Export → MusicXML**. Save it as assets/score/slava-pentru-imparat.musicxml. Then run:

```bash
npm run score:parse -- --input assets/score/slava-pentru-imparat.musicxml --out src/data/timeline.json --fps 24
```

For MIDI, export **File → Export → MIDI File…** and run the same parser against the .mid file. MusicXML is preferable when you want measure numbers, time signatures, instrument names, and score-level directions to remain explicit.

After parsing, copy the mastered WAV to public/audio/master.wav and pass the Remotion props value audioSrc=audio/master.wav to Studio or render.

## Why export first?

Finale's .musx is its proprietary native project format. MusicXML is the documented interchange format for moving notation between scorewriters. MuseScore's migration guide recommends exporting MusicXML from Finale; it also states that MuseScore Studio does not currently open .musx directly. See the MuseScore Finale conversion guide and MakeMusic MusicXML export instructions:

- https://musescore.org/en/finale-to-musescore
- https://makemusic.zendesk.com/hc/en-us/articles/25868952458519-Exporting-MusicXML-Files-from-Finale
