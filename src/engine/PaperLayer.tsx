import React, {useEffect, useMemo} from 'react';
import {ExtrudeGeometry, MeshStandardMaterial} from 'three';
import {SVGLoader} from 'three/examples/jsm/loaders/SVGLoader.js';
import {useCurrentFrame} from 'remotion';
import {createPaperMaps, disposePaperMaps} from './PaperMaterial';
import {microRotation, onTwosFrame, paperBoilOffset, springFoldAngle} from './stopMotion';

export type PaperTransition = 'fold' | 'slide-left' | 'slide-right' | 'rise' | 'none';

export interface PaperLayerProps {
  id: string;
  svg: string;
  color: string;
  position?: [number, number, number];
  enterFrame?: number;
  transition?: PaperTransition;
  thickness?: number;
  seed?: number;
  scale?: number;
  jitter?: number;
}

export const PaperLayer: React.FC<PaperLayerProps> = ({
  id,
  svg,
  color,
  position = [0, 0, 0],
  enterFrame = 0,
  transition = 'none',
  thickness = 0.04,
  seed = 1,
  scale = 0.01,
  jitter = 0.008,
}) => {
  const frame = useCurrentFrame();
  const steppedFrame = onTwosFrame(frame);
  const progress = Math.max(0, Math.min(1, (steppedFrame - enterFrame) / 18));
  const rotationJitter = microRotation(id, frame, jitter);
  const boil = paperBoilOffset(id, frame);
  const maps = useMemo(() => createPaperMaps(color, seed), [color, seed]);

  const materials = useMemo(() => {
    const face = new MeshStandardMaterial({
      map: maps.albedo,
      bumpMap: maps.bump,
      bumpScale: 0.028,
      roughnessMap: maps.roughness,
      roughness: 0.94,
      metalness: 0,
    });
    const edge = new MeshStandardMaterial({color: '#342b29', roughness: 1, metalness: 0});
    return [face, edge] as const;
  }, [maps]);

  const geometries = useMemo(() => {
    const parsed = new SVGLoader().parse(svg);
    const output: ExtrudeGeometry[] = [];
    for (const path of parsed.paths) {
      for (const shape of SVGLoader.createShapes(path)) {
        const geometry = new ExtrudeGeometry(shape, {
          depth: thickness,
          bevelEnabled: true,
          bevelSegments: 1,
          bevelSize: 0.008,
          bevelThickness: 0.008,
          steps: 1,
          curveSegments: 10,
        });
        geometry.computeVertexNormals();
        output.push(geometry);
      }
    }
    return output;
  }, [svg, thickness]);

  useEffect(() => {
    maps.albedo.offset.set(boil.u, boil.v);
    maps.bump.offset.set(boil.u * 1.4, boil.v * 1.3);
    maps.roughness.offset.set(boil.u, boil.v);
  }, [maps, boil.u, boil.v]);

  useEffect(() => () => {
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    disposePaperMaps(maps);
  }, [geometries, materials, maps]);

  if (steppedFrame < enterFrame) return null;
  const slideX = transition === 'slide-left'
    ? (1 - progress) * 18
    : transition === 'slide-right'
      ? -(1 - progress) * 18
      : 0;
  const slideY = transition === 'rise' ? -(1 - progress) * 10 : 0;
  const foldX = transition === 'fold' ? springFoldAngle(frame, enterFrame) : 0;

  return (
    <group
      position={[position[0] + slideX, position[1] + slideY - 4.5, position[2]]}
      rotation={[foldX + rotationJitter.x, rotationJitter.y, rotationJitter.z]}
    >
      <group position={[0, 4.5, 0]}>
        <group position={[-8, 0, 0]} scale={[scale, -scale, scale]}>
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
