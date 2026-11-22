import {CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture} from 'three';

export interface PaperMaps {
  albedo: CanvasTexture;
  bump: CanvasTexture;
  roughness: CanvasTexture;
}

const seededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967295;
  };
};

const makeCanvas = (size: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
};

/** Deterministic albedo, height and roughness maps for tactile cardstock. */
export const createPaperMaps = (tint: string, seed: number, size = 1024): PaperMaps => {
  const albedoCanvas = makeCanvas(size);
  const bumpCanvas = makeCanvas(size);
  const roughnessCanvas = makeCanvas(size);
  const albedoContext = albedoCanvas.getContext('2d');
  const bumpContext = bumpCanvas.getContext('2d');
  const roughnessContext = roughnessCanvas.getContext('2d');
  if (!albedoContext || !bumpContext || !roughnessContext) {
    throw new Error('Could not create procedural cardstock canvas textures.');
  }

  albedoContext.fillStyle = tint;
  albedoContext.fillRect(0, 0, size, size);
  const image = albedoContext.getImageData(0, 0, size, size);
  const bumpImage = bumpContext.createImageData(size, size);
  const roughImage = roughnessContext.createImageData(size, size);
  const random = seededRandom(seed);

  for (let i = 0; i < image.data.length; i += 4) {
    const grain = (random() - 0.5) * 22;
    const fiber = random() > 0.996 ? 18 : 0;
    image.data[i] = Math.max(0, Math.min(255, image.data[i] + grain + fiber));
    image.data[i + 1] = Math.max(0, Math.min(255, image.data[i + 1] + grain + fiber));
    image.data[i + 2] = Math.max(0, Math.min(255, image.data[i + 2] + grain + fiber));
    image.data[i + 3] = 255;
    const height = Math.max(0, Math.min(255, 128 + grain * 2 + fiber));
    bumpImage.data[i] = height;
    bumpImage.data[i + 1] = height;
    bumpImage.data[i + 2] = height;
    bumpImage.data[i + 3] = 255;
    const rough = Math.max(0, Math.min(255, 218 + grain));
    roughImage.data[i] = rough;
    roughImage.data[i + 1] = rough;
    roughImage.data[i + 2] = rough;
    roughImage.data[i + 3] = 255;
  }
  albedoContext.putImageData(image, 0, 0);
  bumpContext.putImageData(bumpImage, 0, 0);
  roughnessContext.putImageData(roughImage, 0, 0);

  const makeTexture = (canvas: HTMLCanvasElement, color: boolean): CanvasTexture => {
    const texture = new CanvasTexture(canvas);
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(2, 1);
    texture.anisotropy = 8;
    if (color) texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  };

  return {
    albedo: makeTexture(albedoCanvas, true),
    bump: makeTexture(bumpCanvas, false),
    roughness: makeTexture(roughnessCanvas, false),
  };
};

export const disposePaperMaps = (maps: PaperMaps): void => {
  (Object.values(maps) as Texture[]).forEach((texture) => texture.dispose());
};
