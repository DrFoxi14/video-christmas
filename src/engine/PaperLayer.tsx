import React, {useLayoutEffect, useEffect, useMemo} from 'react';
import {useLoader} from '@react-three/fiber';
import {ExtrudeGeometry, MeshStandardMaterial} from 'three';
import {SVGLoader} from 'three/examples/jsm/loaders/SVGLoader.js';
import {staticFile, useCurrentFrame} from 'remotion';
import {createPaperMaps, disposePaperMaps} from './PaperMaterial';
import {microRotation, onTwosFrame, paperBoilOffset, springFoldAngle} from './stopMotion';

export type PaperTransition = 'fold' | 'slide-left' | 'slide-right' | 'rise' | 'none';

export interface PaperLayerProps {
  id: string;
  svg?: string;
  svgSrc?: string;
  color: string;
  position?: [number, number, number];
  enterFrame?: number;
  exitFrame?: number;
  transition?: PaperTransition;
  thickness?: number;
  seed?: number;
  scale?: number;
  jitter?: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export const PaperLayer: React.FC<PaperLayerProps> = ({
  id,
  svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><path d="M0 0 H1600 V900 H0 Z"/></svg>',
  svgSrc,
  color,
  position = [0, 0, 0],
  enterFrame = 0,
  exitFrame,
  transition = 'none',
  thickness = 0.04,
  seed = 1,
  scale = 0.01,
  jitter = 0.008,
}) => {
  const frame = useCurrentFrame();
  const steppedFrame = onTwosFrame(frame);
  const progressIn = clamp01((steppedFrame - enterFrame) / 18);
  const progressOut = exitFrame === undefined ? 0 : clamp01((steppedFrame - exitFrame) / 18);
  const visibleUntil = exitFrame === undefined ? Number.POSITIVE_INFINITY : exitFrame + 18;
  const rotationJitter = microRotation(id, frame, jitter);
  const boil = paperBoilOffset(id, frame);
  const assetUrl = svgSrc
    ? staticFile(svgSrc)
    : 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const parsedSvg = useLoader(SVGLoader, assetUrl);
  const maps = useMemo(() => createPaperMaps(color, seed), [color, seed]);

  const materials = useMemo(() => {
    const face = new MeshStandardMaterial({
      map: maps.albedo,
      bumpMap: maps.bump,
      bumpScale: 0.028,
      roughnessMap: maps.roughness,
      roughness: 0.94,
      metalness: 0,
      transparent: true,
      opacity: 1,
    });
    const edge = new MeshStandardMaterial({
      color: '#342b29',
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 1,
    });
    return [face, edge] as const;
  }, [maps]);

  const geometries = useMemo(() => {
    const output: ExtrudeGeometry[] = [];
    for (const path of parsedSvg.paths) {
      for (const shape of SVGLoader.createShapes(path)) {
        const geometry = new ExtrudeGeometry(shape, {
          depth: thickness,
          bevelEnabled: true,
          bevelSegments: 1,
          bevelSize: 0.12,
          bevelThickness: 0.004,
          steps: 1,
          curveSegments: 18,
        });
        geometry.computeVertexNormals();
        output.push(geometry);
      }
    }
    return output;
  }, [parsedSvg, thickness]);

  useLayoutEffect(() => {
    maps.albedo.offset.set(boil.u, boil.v);
    maps.bump.offset.set(boil.u * 1.4, boil.v * 1.3);
    maps.roughness.offset.set(boil.u, boil.v);
    const opacity = 1 - progressOut;
    materials.forEach((material) => {
      material.opacity = opacity;
      material.needsUpdate = true;
    });
  }, [maps, materials, boil.u, boil.v, progressOut]);

  useEffect(() => () => {
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    disposePaperMaps(maps);
  }, [geometries, materials, maps]);

  if (steppedFrame < enterFrame || steppedFrame > visibleUntil) return null;

  const slideX = transition === 'slide-left'
    ? (1 - progressIn) * 18 - progressOut * 5
    : transition === 'slide-right'
      ? -(1 - progressIn) * 18 + progressOut * 5
      : 0;
  const slideY = transition === 'rise' ? -(1 - progressIn) * 10 - progressOut * 2 : 0;
  const foldIn = transition === 'fold' ? springFoldAngle(frame, enterFrame) : 0;
  const foldOut = progressOut * Math.PI * 0.48;
  const rotationX = foldIn + foldOut + rotationJitter.x;

  return (
    <group
      position={[position[0] + slideX, position[1] + slideY - 4.5, position[2]]}
      rotation={[rotationX, rotationJitter.y, rotationJitter.z]}
    >
      <group position={[0, 9, 0]}>
        <group position={[-8, 0, 0]} scale={[scale * progressIn, -scale * progressIn, 1]}>
          {geometries.map((geometry, index) => (
            <mesh
              key={id + '-' + index}
              geometry={geometry}
              material={materials as unknown as MeshStandardMaterial[]}
              castShadow
              receiveShadow
            />
          ))}
        </group>
      </group>
    </group>
  );
};
