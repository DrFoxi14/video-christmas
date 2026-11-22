import type {ScoreTimeline} from './types';

export const sampleDynamics = (timeline: ScoreTimeline, frame: number): number => {
  const samples = timeline.dynamics;
  if (!samples.length) return 0.2;
  const index = samples.findIndex((sample) => sample.frame >= frame);
  if (index <= 0) return samples[0].value;
  const before = samples[index - 1];
  const after = samples[index];
  const span = Math.max(1, after.frame - before.frame);
  const amount = Math.max(0, Math.min(1, (frame - before.frame) / span));
  return before.value + (after.value - before.value) * amount;
};
