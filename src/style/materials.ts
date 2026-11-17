import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { lineWidth, palette } from './palette';

// Banded light: three tones per surface, like flat gouache shading.
const toonRamp = (() => {
  const tex = new THREE.DataTexture(new Uint8Array([105, 175, 255]), 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();

/** Strength of the painted grain baked onto every surface. */
const grain = { value: 0.26 };

const GRAIN_GLSL = /* glsl */ `
  varying vec3 vGrainPos;
  uniform float uGrain;
  float gHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float gNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(gHash(i), gHash(i + vec3(1, 0, 0)), f.x), mix(gHash(i + vec3(0, 1, 0)), gHash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(gHash(i + vec3(0, 0, 1)), gHash(i + vec3(1, 0, 1)), f.x), mix(gHash(i + vec3(0, 1, 1)), gHash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  // Anchored to world space so the texture sticks to surfaces instead of swimming.
  float grainAt(vec3 p) {
    float broad = gNoise(p * vec3(2.2, 5.0, 2.2));
    float tooth = gNoise(p * 13.0) * 0.6 + gNoise(p * 26.0) * 0.4;
    return 1.0 + (broad - 0.5) * uGrain * 0.7 + (tooth - 0.5) * uGrain;
  }
  // Pen hatching where the light falls off, drawn in world space so it stays put.
  float hatchAt(vec3 p, float lit) {
    float shade = 1.0 - smoothstep(0.5, 0.72, lit);
    if (shade <= 0.0) return 1.0;
    float s = dot(p, vec3(1.0, 1.35, -1.0)) * 8.5;
    float w = fwidth(s);
    float line = 1.0 - smoothstep(0.0, w * 1.5, abs(fract(s) - 0.5) - 0.32);
    return 1.0 - line * shade * 0.22;
  }
`;

function addGrain<T extends THREE.Material>(mat: T): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGrain = grain;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrainPos;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvGrainPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GRAIN_GLSL}`)
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        float lit = dot(outgoingLight, vec3(0.333)) / max(dot(diffuseColor.rgb, vec3(0.333)), 1e-3);
        gl_FragColor.rgb *= grainAt(vGrainPos) * hatchAt(vGrainPos, lit);`,
      );
  };
  mat.customProgramCacheKey = () => 'grain';
  return mat;
}

export interface ToonOptions {
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  emissive?: THREE.ColorRepresentation;
  side?: THREE.Side;
}

/** Lit, banded, grainy surface. Use `fill` for shared palette colours. */
export function toon(opts: ToonOptions = {}): THREE.MeshToonMaterial {
  return addGrain(
    new THREE.MeshToonMaterial({
      color: opts.color ?? 0xffffff,
      map: opts.map ?? null,
      emissive: opts.emissive ?? 0x000000,
      gradientMap: toonRamp,
      side: opts.side ?? THREE.FrontSide,
      // Push fills back a touch so outlines sitting on the surface never z-fight.
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
  );
}

const fillCache = new Map<string, THREE.MeshToonMaterial>();

export function fill(color: string): THREE.MeshToonMaterial {
  let mat = fillCache.get(color);
  if (!mat) {
    mat = toon({ color });
    fillCache.set(color, mat);
  }
  return mat;
}

const inkCache = new Map<number, LineMaterial>();
// Lines thin out a little when the world is drawn small, so tiny props stay legible.
let lineScale = 1;

export function ink(width = lineWidth): LineMaterial {
  let mat = inkCache.get(width);
  if (!mat) {
    mat = new LineMaterial({ color: palette.ink, linewidth: width * lineScale });
    inkCache.set(width, mat);
  }
  return mat;
}

const noRaycast = () => {};

/** Constant-width pen lines from a flat list of segment endpoints. */
export function inkLines(positions: ArrayLike<number>, width = lineWidth): LineSegments2 {
  const geo = new LineSegmentsGeometry();
  geo.setPositions(positions as Float32Array);
  const lines = new LineSegments2(geo, ink(width));
  lines.raycast = noRaycast;
  return lines;
}

/** Ink every hard edge of a mesh. */
export function outline<T extends THREE.Mesh>(mesh: T, width = lineWidth, angle = 25): T {
  const edges = new THREE.EdgesGeometry(mesh.geometry, angle);
  mesh.add(inkLines(edges.attributes.position.array, width));
  edges.dispose();
  return mesh;
}

/** Silhouette thickness in world units, kept in sync with the pixel scale. */
const hullWidth = { value: 0.03 };

// Inverted hull, pushed out along world-space normals so it works for any scale
// and for skinned meshes (where `objectNormal` is already skinned).
const hullMaterial = (() => {
  const mat = new THREE.MeshBasicMaterial({ color: palette.ink, side: THREE.BackSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uHullW = hullWidth;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uHullW;')
      .replace(
        '#include <project_vertex>',
        /* glsl */ `
        #ifdef USE_SKINNING
          vec3 hullN = objectNormal;
        #else
          vec3 hullN = normal;
        #endif
        vec4 hullW = modelMatrix * vec4(transformed, 1.0);
        hullW.xyz += normalize(mat3(modelMatrix) * hullN) * uHullW;
        vec4 mvPosition = viewMatrix * hullW;
        gl_Position = projectionMatrix * mvPosition;
        `,
      );
  };
  mat.customProgramCacheKey = () => 'hull';
  mat.userData.isHull = true;
  return mat;
})();

/** Ink the silhouette of a round or organic mesh. */
export function hull<T extends THREE.Mesh>(mesh: T): T {
  let shell: THREE.Mesh;
  if ((mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh) {
    const skinned = mesh as unknown as THREE.SkinnedMesh;
    const s = new THREE.SkinnedMesh(skinned.geometry, hullMaterial);
    s.bind(skinned.skeleton, skinned.bindMatrix);
    s.bindMode = skinned.bindMode;
    s.frustumCulled = false;
    shell = s;
  } else {
    shell = new THREE.Mesh(mesh.geometry, hullMaterial);
  }
  shell.raycast = noRaycast;
  shell.castShadow = false;
  shell.receiveShadow = false;
  mesh.add(shell);
  return mesh;
}

/** The world's own canvas, which every other drawing hands the pens back to. */
let viewport: [number, number, number] = [1, 1, 48];

/** Call on resize so pixel-width lines and silhouettes stay consistent. */
export function setViewport(width: number, height: number, pixelsPerUnit: number): void {
  viewport = [width, height, pixelsPerUnit];
  pens(width, height, pixelsPerUnit);
}

/**
 * Draw on another canvas, at another scale, with the same pen. Line widths and silhouettes are
 * shared by every material, so they are set for this drawing and put back for the world after.
 */
export function drawAt(width: number, height: number, pixelsPerUnit: number, draw: () => void): void {
  pens(width, height, pixelsPerUnit);
  try {
    draw();
  } finally {
    pens(...viewport);
  }
}

function pens(width: number, height: number, pixelsPerUnit: number): void {
  lineScale = THREE.MathUtils.clamp(pixelsPerUnit / 48, 0.65, 1.2);
  for (const [base, mat] of inkCache) {
    mat.resolution.set(width, height);
    mat.linewidth = base * lineScale;
  }
  hullWidth.value = (lineWidth * lineScale) / pixelsPerUnit;
}
