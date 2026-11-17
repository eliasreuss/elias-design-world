import * as THREE from 'three';
import { hull, outline, toon } from './materials';
import { textureSwatches } from './palette';

export interface StylizeOptions {
  /** Textures sharing a key are recoloured once and reused. */
  textureKey?: string;
  /** Ink hard edges as well as the silhouette. Defaults to on for low-poly models. */
  edges?: boolean;
  /** Override colour, multiplied with the recoloured texture. */
  tint?: THREE.ColorRepresentation;
  castShadow?: boolean;
}

const swatches = textureSwatches.map((hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
});

const textureCache = new Map<string, THREE.Texture>();

/**
 * Repaint a texture in the world palette: shrink it (dropping fine detail),
 * then pull every pixel most of the way to its nearest swatch.
 */
export function paletteTexture(src: THREE.Texture, key: string, size = 192, amount = 0.72): THREE.Texture {
  const cached = textureCache.get(key);
  if (cached) return cached;

  const image = src.image as CanvasImageSource & { width: number; height: number };
  const w = Math.min(size, image.width);
  const h = Math.min(size, image.height);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    let best = swatches[0];
    let bestD = Infinity;
    for (const s of swatches) {
      // weighted towards green, roughly how the eye judges closeness
      const dr = r - s[0];
      const dg = g - s[1];
      const db = b - s[2];
      const dist = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
      if (dist < bestD) {
        bestD = dist;
        best = s;
      }
    }
    d[i] = r + (best[0] - r) * amount;
    d[i + 1] = g + (best[1] - g) * amount;
    d[i + 2] = b + (best[2] - b) * amount;
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = src.flipY;
  tex.wrapS = src.wrapS;
  tex.wrapT = src.wrapT;
  tex.channel = src.channel;
  // crisp, slightly chunky texels suit the flat look
  tex.magFilter = THREE.NearestFilter;
  textureCache.set(key, tex);
  return tex;
}

const materialCache = new Map<string, THREE.MeshToonMaterial>();

/** Swap an imported model's materials for the world's toon look and ink it. */
export function stylize(root: THREE.Object3D, opts: StylizeOptions = {}): void {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });

  for (const mesh of meshes) {
    const src = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    const key = `${opts.textureKey ?? src.name}|${opts.tint ?? ''}|${src.side}`;
    let mat = materialCache.get(key);
    if (!mat) {
      const map = src.map ? paletteTexture(src.map, opts.textureKey ?? src.name) : null;
      mat = toon({ map, color: opts.tint ?? (map ? 0xffffff : src.color), side: src.side });
      materialCache.set(key, mat);
    }
    mesh.material = mat;
    mesh.castShadow = opts.castShadow ?? true;
    mesh.receiveShadow = true;

    const triangles = (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
    const edges = opts.edges ?? triangles < 1500;
    if (edges && !(mesh as THREE.SkinnedMesh).isSkinnedMesh) outline(mesh, 1.25, 40);
    hull(mesh);
  }
}
