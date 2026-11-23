import React, {useEffect, useMemo} from 'react';
import {BoxGeometry, CanvasTexture, MeshStandardMaterial, SRGBColorSpace} from 'three';
import {useCurrentFrame} from 'remotion';
import {onTwosFrame} from './stopMotion';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export const PaperTitle: React.FC<{startFrame: number}> = ({startFrame}) => {
  const frame = onTwosFrame(useCurrentFrame());
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2400;
    canvas.height = 520;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create the title foil canvas.');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowColor = 'rgba(48, 24, 5, 0.48)';
    context.shadowBlur = 13;
    context.shadowOffsetY = 8;
    context.font = '700 170px Georgia, Times New Roman, serif';
    context.lineWidth = 5;
    context.strokeStyle = '#6c4827';
    context.fillStyle = '#f3d79f';
    context.strokeText('SLAVĂ', 1200, 190);
    context.fillText('SLAVĂ', 1200, 190);
    context.shadowBlur = 7;
    context.shadowOffsetY = 4;
    context.font = '600 94px Georgia, Times New Roman, serif';
    context.strokeText('PENTRU ÎMPĂRAT', 1200, 370);
    context.fillText('PENTRU ÎMPĂRAT', 1200, 370);
    const result = new CanvasTexture(canvas);
    result.colorSpace = SRGBColorSpace;
    result.anisotropy = 8;
    result.needsUpdate = true;
    return result;
  }, []);

  const geometry = useMemo(() => new BoxGeometry(11.5, 2.55, 0.065), []);
  const materials = useMemo(() => {
    const edge = new MeshStandardMaterial({color: '#a97839', roughness: 0.62, metalness: 0.32});
    const face = new MeshStandardMaterial({
      map: texture,
      color: '#fff2d6',
      roughness: 0.58,
      metalness: 0.18,
      transparent: true,
    });
    return [edge, edge, edge, edge, face, face];
  }, [texture]);

  useEffect(() => () => {
    geometry.dispose();
    texture.dispose();
    materials.forEach((material) => material.dispose());
  }, [geometry, texture, materials]);

  if (frame < startFrame) return null;
  const progress = clamp01((frame - startFrame) / 14);
  const spring = 1 - Math.exp(-7 * progress) * Math.cos(11 * progress);
  const pop = Math.min(1.04, Math.max(0.001, spring));

  return (
    <group
      position={[0, -2.05 + Math.sin(frame / 8) * 0.025, 1.65]}
      rotation={[-0.035, (1 - progress) * -0.24, 0]}
      scale={[pop, pop, pop]}
    >
      <mesh geometry={geometry} material={materials} castShadow receiveShadow />
    </group>
  );
};
