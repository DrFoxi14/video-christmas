import React from 'react';
import {ThreeCanvas} from '@remotion/three';
import {PerspectiveCamera} from '@react-three/drei';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import type {ScoreTimeline} from '../engine/types';
import {clamp01, onTwosFrame} from '../engine/stopMotion';
import {PaperLayer} from '../engine/PaperLayer';
import {PaperTitle} from '../engine/PaperTitle';
import {SceneTransition} from '../engine/SceneTransition';
import {resolveCueFrame, sceneFrameRange, storyboard} from './storyboard';

const intensityAt = (timeline: ScoreTimeline, frame: number): number => {
  const samples = timeline.dynamics;
  if (samples.length === 0) return 0.2;
  let left = samples[0];
  let right = samples[samples.length - 1];
  for (let index = 0; index < samples.length - 1; index++) {
    if (samples[index].frame <= frame && samples[index + 1].frame >= frame) {
      left = samples[index];
      right = samples[index + 1];
      break;
    }
  }
  if (left.frame === right.frame) return left.value;
  const mix = clamp01((frame - left.frame) / (right.frame - left.frame));
  return left.value + (right.value - left.value) * mix;
};

const cameraPunch = (timeline: ScoreTimeline, frame: number): number => {
  const step = onTwosFrame(frame);
  let punch = 0;
  for (const accent of timeline.accentTriggers) {
    const distance = step - onTwosFrame(accent.frame);
    if (distance < 0 || distance > 14) continue;
    const decay = Math.exp(-(distance / 2) / 3.25);
    punch = Math.max(punch, accent.intensity * decay);
  }
  return punch;
};

const cameraAt = (
  scene: (typeof storyboard)[number],
  start: number,
  end: number,
  frame: number,
) => {
  const amount = clamp01((onTwosFrame(frame) - start) / Math.max(1, end - start));
  const eased = amount * amount * (3 - 2 * amount);
  return {
    x: scene.cameraPath.from[0] + (scene.cameraPath.to[0] - scene.cameraPath.from[0]) * eased,
    y: scene.cameraPath.from[1] + (scene.cameraPath.to[1] - scene.cameraPath.from[1]) * eased,
    z: scene.cameraPath.from[2] + (scene.cameraPath.to[2] - scene.cameraPath.from[2]) * eased,
  };
};

export const Diorama: React.FC<{timeline: ScoreTimeline}> = ({timeline}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const ranges = storyboard.map((scene) => sceneFrameRange(timeline, scene));
  const activeIndex = Math.max(0, ranges.findIndex((range, index) =>
    frame >= range.start && (frame < range.end || index === ranges.length - 1),
  ));
  const scene = storyboard[activeIndex];
  const range = ranges[activeIndex];
  const previousScene = activeIndex > 0 ? storyboard[activeIndex - 1] : undefined;
  const previousRange = activeIndex > 0 ? ranges[activeIndex - 1] : undefined;
  const overlapsPrevious = Boolean(
    previousScene &&
    previousRange &&
    scene.transitionIn !== 'hard-cut' &&
    frame < range.start + 18,
  );
  const renderScenes = overlapsPrevious && previousScene ? [previousScene, scene] : [scene];

  const step = onTwosFrame(frame);
  const energy = intensityAt(timeline, step);
  const punch = cameraPunch(timeline, frame);
  const baseCamera = cameraAt(scene, range.start, range.end, frame);
  const cameraZ = baseCamera.z - energy * 0.38 - punch * 0.76;
  const cameraX = baseCamera.x + (energy - 0.25) * 0.11 + punch * 0.055;
  const cameraY = baseCamera.y + (energy - 0.25) * 0.045;
  const titleFrame = Math.round(timeline.durationFrames * 0.88);

  return (
    <ThreeCanvas
      width={width}
      height={height}
      shadows="soft"
      orthographic={false}
      gl={{antialias: true, alpha: false, powerPreference: 'high-performance'}}
      style={{width: '100%', height: '100%', backgroundColor: scene.palette.background}}
    >
      <color attach="background" args={[scene.palette.background]} />
      <fog attach="fog" args={[scene.palette.fog, 10, 31]} />
      <PerspectiveCamera
        makeDefault
        position={[cameraX, cameraY, cameraZ]}
        fov={scene.cameraPath.fov}
        near={0.1}
        far={55}
      />

      <ambientLight intensity={Math.min(0.145, scene.palette.ambient + energy * 0.035)} />
      <directionalLight
        position={[-11, 9, 4.5]}
        intensity={2.35 + energy * 1.7}
        color={scene.palette.keyLight}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-bias={-0.00018}
      />
      <directionalLight
        position={[8, 3, -4]}
        intensity={0.48 + energy * 0.2}
        color={scene.palette.rimLight}
      />
      <pointLight
        position={[0, 1.8, 3.6]}
        intensity={0.15 + punch * 0.9}
        color={scene.palette.keyLight}
        distance={17}
      />

      {renderScenes.map((renderScene) => {
        const renderRange = ranges[storyboard.indexOf(renderScene)];
        return renderScene.layers.map((layer) => (
          <PaperLayer
            key={renderScene.id + ':' + layer.id}
            id={renderScene.id + ':' + layer.id}
            svg={layer.svg}
            svgSrc={layer.svgSrc}
            color={layer.color}
            position={[0, 0, layer.z]}
            enterFrame={resolveCueFrame(timeline, layer.enterCue)}
            exitFrame={resolveCueFrame(timeline, layer.exitCue ?? {
              type: 'time',
              seconds: renderRange.end / timeline.fps,
              fallbackFrame: renderRange.end,
            })}
            transition={layer.transition}
            seed={layer.seed}
            jitter={layer.jitter}
          />
        ));
      })}

      <PaperTitle startFrame={titleFrame} />
      <SceneTransition
        kind={scene.transitionIn}
        startFrame={range.start}
        color={scene.transitionIn === 'page-flip' ? '#d8c8a8' : scene.palette.background}
      />
      <mesh position={[0, -4.56, 0.72]} receiveShadow>
        <boxGeometry args={[17, 0.08, 0.7]} />
        <meshStandardMaterial color="#263e4d" roughness={0.94} />
      </mesh>
    </ThreeCanvas>
  );
};
