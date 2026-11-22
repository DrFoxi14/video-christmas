import React from 'react';
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
  if (kind === 'hard-cut' || frame < startFrame || frame > startFrame + duration) return null;
  const progress = clamp01((frame - startFrame) / duration);
  const material = (opacity = 1) => new MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    side: DoubleSide,
    depthWrite: false,
  });

  if (kind === 'page-flip') {
    return (
      <mesh position={[0, 0, 5.7]} rotation={[0, Math.PI * progress, 0]}>
        <planeGeometry args={[24, 15]} />
        <primitive object={material(1)} attach="material" />
      </mesh>
    );
  }

  if (kind === 'blackout') {
    const opacity = Math.max(0, 1 - Math.abs(progress - 0.5) * 2);
    return (
      <mesh position={[0, 0, 5.7]}>
        <planeGeometry args={[24, 15]} />
        <primitive object={material(opacity)} attach="material" />
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
        <primitive object={material(1)} attach="material" />
      </mesh>
      <mesh position={[spread, 0, 0]}>
        <planeGeometry args={[12, 15]} />
        <primitive object={material(1)} attach="material" />
      </mesh>
    </group>
  );
};
