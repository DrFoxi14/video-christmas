import type {ScoreTimeline} from '../engine/types';

export type Cue =
  | {type: 'time'; seconds: number; fallbackFrame: number}
  | {type: 'measure'; number: number; fallbackFrame: number}
  | {type: 'accent'; kind?: string; index: number; fallbackFrame: number};

export interface StoryLayer {
  id: string;
  color: string;
  svg: string;
  z: number;
  cue: Cue;
  transition: 'fold' | 'slide-left' | 'slide-right' | 'rise' | 'none';
  seed: number;
  jitter?: number;
}

export const storyboard: StoryLayer[] = [
  {
    id: 'parchment-stage',
    color: '#d8c8a8',
    z: -2.8,
    cue: {type: 'time', seconds: 0, fallbackFrame: 0},
    transition: 'none',
    seed: 18,
    svg: '<svg viewBox="0 0 1600 900"><rect x="0" y="0" width="1600" height="900" rx="3" fill="#fff"/></svg>',
  },
  {
    id: 'distant-clouds',
    color: '#e7dfc9',
    z: -1.3,
    cue: {type: 'measure', number: 1, fallbackFrame: 0},
    transition: 'slide-left',
    seed: 42,
    svg: '<svg viewBox="0 0 1600 900"><path d="M70 255 C75 208 126 184 170 205 C193 151 272 151 299 209 C344 198 384 231 381 271 L70 271 Z"/><path d="M1110 190 C1120 143 1176 131 1210 158 C1240 100 1320 112 1336 165 C1390 154 1445 187 1443 225 L1110 225 Z"/></svg>',
  },
  {
    id: 'golden-rays',
    color: '#e8bd70',
    z: -0.95,
    cue: {type: 'measure', number: 2, fallbackFrame: 80},
    transition: 'rise',
    seed: 76,
    jitter: 0.003,
    svg: '<svg viewBox="0 0 1600 900"><path d="M690 0 L745 0 L820 610 L786 610 Z"/><path d="M780 0 L815 0 L875 600 L845 600 Z"/><path d="M900 0 L948 0 L875 600 L846 600 Z"/><path d="M1010 0 L1065 0 L915 610 L878 610 Z"/></svg>',
  },
  {
    id: 'mountain-back',
    color: '#75899a',
    z: -0.48,
    cue: {type: 'time', seconds: 0.4, fallbackFrame: 10},
    transition: 'slide-right',
    seed: 101,
    svg: '<svg viewBox="0 0 1600 900"><path d="M0 590 L155 428 L256 520 L405 300 L520 456 L665 365 L812 520 L935 405 L1090 545 L1268 350 L1410 495 L1538 414 L1600 470 L1600 900 L0 900 Z"/></svg>',
  },
  {
    id: 'cathedral-arches',
    color: '#b78c68',
    z: 0.05,
    cue: {type: 'measure', number: 3, fallbackFrame: 160},
    transition: 'fold',
    seed: 143,
    jitter: 0.002,
    svg: '<svg viewBox="0 0 1600 900"><path d="M115 900 L115 420 C115 230 265 85 450 85 C635 85 785 230 785 420 L785 900 L690 900 L690 423 C690 282 580 175 450 175 C320 175 210 282 210 423 L210 900 Z"/><path d="M870 900 L870 475 C870 300 1000 170 1160 170 C1320 170 1450 300 1450 475 L1450 900 L1360 900 L1360 478 C1360 350 1270 260 1160 260 C1050 260 960 350 960 478 L960 900 Z"/></svg>',
  },
  {
    id: 'front-ridge',
    color: '#344f5d',
    z: 0.52,
    cue: {type: 'accent', kind: 'percussion', index: 0, fallbackFrame: 146},
    transition: 'slide-left',
    seed: 189,
    svg: '<svg viewBox="0 0 1600 900"><path d="M0 755 L185 650 L335 710 L505 580 L685 695 L860 600 L1035 720 L1200 615 L1380 690 L1510 630 L1600 685 L1600 900 L0 900 Z"/></svg>',
  },
  {
    id: 'floating-star',
    color: '#e4bf7c',
    z: 0.88,
    cue: {type: 'accent', kind: 'brass', index: 0, fallbackFrame: 216},
    transition: 'fold',
    seed: 221,
    svg: '<svg viewBox="0 0 1600 900"><path d="M800 220 L842 330 L960 336 L870 412 L900 530 L800 468 L700 530 L730 412 L640 336 L758 330 Z"/></svg>',
  },
  {
    id: 'foreground-cutout',
    color: '#1f3548',
    z: 1.12,
    cue: {type: 'accent', kind: 'percussion', index: -1, fallbackFrame: 266},
    transition: 'rise',
    seed: 252,
    svg: '<svg viewBox="0 0 1600 900"><path d="M0 830 C150 755 260 790 390 740 C535 690 650 770 795 735 C960 695 1090 800 1235 750 C1390 700 1510 760 1600 720 L1600 900 L0 900 Z"/></svg>',
  },
];

export const resolveCueFrame = (timeline: ScoreTimeline, cue: Cue): number => {
  if (cue.type === 'time') return Math.round(cue.seconds * timeline.fps);
  if (cue.type === 'measure') {
    return timeline.measures.find((measure) => measure.number === cue.number)?.frame ?? cue.fallbackFrame;
  }
  const matching = timeline.accentTriggers.filter((accent) => !cue.kind || accent.kind === cue.kind);
  const selected = cue.index < 0 ? matching[matching.length + cue.index] : matching[cue.index];
  return selected?.frame ?? cue.fallbackFrame;
};
