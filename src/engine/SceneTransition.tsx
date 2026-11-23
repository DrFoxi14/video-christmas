import React, {useEffect, useLayoutEffect, useMemo} from 'react';
import {DoubleSide, MeshBasicMaterial} from 'three';
import {useCurrentFrame} from 'remotion';
import type {TransitionKind} from '../scenes/storyboard';
import {onTwosFrame} from './stopMotion';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export const SceneTransition: React.FC<{
  kind: TransitionKind;
  startFrame: number;
  color: string;
  duration?: number;
}> = ({kind, startFrame, color, duration = 18}) => {
  const frame = onTwosFrame(useCurrentFrame());
  const progress = clamp01((frame - startFrame) / duration);
  const opacity = kind === 'blackout'
    ? Math.max(0, 1 - Math.abs(progress - 0.5) * 2)
    : 1;
  const material = useMemo(() => new MeshBasicMaterial({
    color,
    transparent: kind === 'blackout',
    opacity: 1,
    side: DoubleSide,
    depthWrite: false,
  }), [color, kind]);

  useLayoutEffect(() => {
    material.opacity = opacity;
    material.needsUpdate = true;
  }, [material, opacity]);

  useEffect(() => () => material.dispose(), [material]);

  if (kind === 'hard-cut' || frame < startFrame || frame > startFrame + duration) return null;

  if (kind === 'page-flip') {
    return (
      <group position={[12, 0, 5.7]} rotation={[0, Math.PI * progress, 0]}>
        <mesh position={[-12, 0, 0]}>
          <planeGeometry args={[24, 15]} />
          <primitive object={material} attach="material" />
        </mesh>
      </group>
    );
  }

  if (kind === 'blackout') {
    return (
      <mesh position={[0, 0, 5.7]}>
        <planeGeometry args={[24, 15]} />
        <primitive object={material} attach="material" />
      </mesh>
    );
  }

  const spread = progress < 0.5
    ? 13 * (1 - progress * 2)
    : 13 * ((progress - 0.5) * 2);
  return (
    <group position={[0, 0, 5.7]}>
      <mesh position={[-spread, 0, 0]}>
        <planeGeometry args={[12, 15]} />
        <primitive object={material} attach="material" />
      </mesh>
      <mesh position={[spread, 0, 0]}>
        <planeGeometry args={[12, 15]} />
        <primitive object={material} attach="material" />
      </mesh>
    </group>
  );
};
