export const onTwosFrame = (frame: number): number => Math.floor(frame / 2) * 2;
export const onTwosIndex = (frame: number): number => Math.floor(frame / 2);

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const seededUnit = (seed: string, step: number): number => {
  let value = (hashString(seed) ^ Math.imul(step + 1, 0x45d9f3b)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967295;
};

export const paperBoilOffset = (seed: string, frame: number) => {
  const step = onTwosIndex(frame);
  return {
    u: (step % 9) * 0.00135 + (seededUnit(seed, step) - 0.5) * 0.0007,
    v: ((step * 3) % 11) * 0.0009 + (seededUnit(seed + ':v', step) - 0.5) * 0.0005,
  };
};

export const microRotation = (seed: string, frame: number, amount = 0.008) => {
  const step = onTwosIndex(frame);
  return {
    x: (seededUnit(seed + ':x', step) - 0.5) * amount,
    y: (seededUnit(seed + ':y', step) - 0.5) * amount,
    z: (seededUnit(seed + ':z', step) - 0.5) * amount * 0.65,
  };
};

export const springFoldAngle = (frame: number, startFrame: number, durationFrames = 18): number => {
  const stepped = onTwosFrame(frame);
  const t = Math.max(0, Math.min(1, (stepped - startFrame) / durationFrames));
  if (t <= 0) return -Math.PI / 2;
  const spring = 1 - Math.exp(-7 * t) * Math.cos(11 * t);
  return -Math.PI / 2 + (Math.PI / 2) * spring;
};

export const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
