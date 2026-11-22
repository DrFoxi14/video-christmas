import React from 'react';
import {ThreeCanvas} from '@remotion/three';
import {PerspectiveCamera} from '@react-three/drei';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import type {ScoreTimeline} from '../engine/types';
import {clamp01, onTwosFrame} from '../engine/stopMotion';
import {PaperLayer} from '../engine/PaperLayer';
import {resolveCueFrame, storyboard} from './storyboard';

const intensityAt = (timeline: ScoreTimeline, frame: number): number => {
  const samples = timeline.dynamics;
  if (samples.length === 0) return 0.25;
  let left = samples[0];
  let right = samples[samples.length - 1];
  for (let i = 0; i < samples.length - 1; i++) {
    if (samples[i].frame <= frame && samples[i + 1].frame >= frame) {
      left = samples[i];
      right = samples[i + 1];
      break;
    }
  }
  if (left.frame === right.frame) return left.value;
  const mix = clamp01((frame - left.frame) / (right.frame - left.frame));
  return left.value + (right.value - left.value) * mix;
};

const accentPulse = (timeline: ScoreTimeline, frame: number): number => {
  let pulse = 0;
  for (const accent of timeline.accentTriggers) {
    const distance = onTwosFrame(frame) - onTwosFrame(accent.frame);
    if (distance >= 0 && distance < 10) {
      pulse = Math.max(pulse, accent.intensity * (1 - distance / 10));
    }
  }
  return pulse;
};

export const Diorama: React.FC<{timeline: ScoreTimeline}> = ({timeline}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const step = onTwosFrame(frame);
  const energy = intensityAt(timeline, frame);
  const cameraEnergy = intensityAt(timeline, step);
  const pulse = accentPulse(timeline, frame);
  const hardAccent = timeline.accentTriggers.some((accent) =>
    onTwosFrame(accent.frame) === step &&
    accent.intensity >= 0.72 &&
    (accent.kind === 'percussion' || accent.kind === 'brass' || accent.kind === 'sub-hit'),
  );
  // The camera only steps on twos and every move is anchored to a score event or dynamic.
  const cameraZ = 16.6 - cameraEnergy * 0.55 - pulse * 0.42 - (hardAccent ? 0.68 : 0);
  const cameraX = (cameraEnergy - 0.25) * 0.14 + (hardAccent ? 0.12 : 0);
  const cameraY = (cameraEnergy - 0.25) * 0.055;

  return (
    <ThreeCanvas
      width={width}
      height={height}
      shadows="soft"
      orthographic={false}
      gl={{antialias: true, alpha: false, powerPreference: 'high-performance'}}
      style={{width: '100%', height: '100%', backgroundColor: '#142338'}}
    >
      <color attach="background" args={['#142338']} />
      <fog attach="fog" args={['#142338', 11, 32]} />
      <PerspectiveCamera makeDefault position={[cameraX, cameraY, cameraZ]} fov={35} near={0.1} far={50} />
      <ambientLight intensity={0.26 + energy * 0.16} />
      <directionalLight
        position={[-5.5, 8, 10]}
        intensity={2.15 + energy * 2.05}
        color={energy > 0.65 ? '#ffe4b7' : '#ffd39a'}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-bias={-0.00018}
      />
      <directionalLight position={[7, 2.5, 5]} intensity={0.34 + energy * 0.22} color="#91b8e8" />
      <pointLight position={[0, 2.6, 4]} intensity={0.2 + pulse * 1.15} color="#f5c77f" distance={18} />

      {storyboard.map((layer) => (
        <PaperLayer
          key={layer.id}
          id={layer.id}
          svg={layer.svg}
          color={layer.color}
          position={[0, 0, layer.z]}
          enterFrame={resolveCueFrame(timeline, layer.cue)}
          transition={layer.transition}
          seed={layer.seed}
          jitter={layer.jitter}
        />
      ))}
      <mesh position={[0, -4.56, 0.72]} receiveShadow>
        <boxGeometry args={[17, 0.08, 0.7]} />
        <meshStandardMaterial color="#263e4d" roughness={0.94} />
      </mesh>
    </ThreeCanvas>
  );
};
