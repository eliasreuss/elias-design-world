import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { stylize, type StylizeOptions } from '../style/stylize';

const FURNITURE = [
  'table_medium', 'chair_A_wood', 'chair_C', 'couch_pillows', 'table_low', 'cabinet_medium',
  'lamp_standing', 'pictureframe_large_A', 'rug_rectangle_stripes_A', 'shelf_B_large_decorated',
  'cactus_medium_A', 'armchair_pillows',
] as const;

const PROPS = [
  'Oil_Lamp_01', 'Books_Row_01', 'Teapot_01', 'Teacup_01', 'Plant_Fern_01', 'Flower_Vase_01',
  'Watering_Can_01', 'Broom_01', 'Doormat_01', 'Hat_Boxes_01', 'Basket_Wicker_01', 'Bread_Basket_01',
  'Clock_Alarm_01', 'Candles_Group_01', 'Side_Table_01', 'Plant_Cactus_01',
] as const;

const TREES = [
  'Tree_1_A_Color1', 'Tree_2_A_Color1', 'Tree_3_A_Color1', 'Tree_4_A_Color1',
  'Bush_1_A_Color1', 'Bush_2_A_Color1', 'Bush_3_A_Color1', 'Bush_4_A_Color1', 'Rock_1_A_Color1',
  'Grass_1_A_Color1', 'Grass_2_A_Color1',
] as const;

const ANIMATION_FILES = ['Rig_Medium_MovementBasic', 'Rig_Medium_General', 'Rig_Medium_Simulation'];

export type AssetName = (typeof FURNITURE)[number] | (typeof PROPS)[number] | (typeof TREES)[number];

/** KayKit furniture is modelled big; this brings it to a 1.7 m character. */
export const FURNITURE_SCALE = 0.72;
/** The cozy props are true to life, which reads too small from this far away. */
export const PROP_SCALE = 1.7;

export interface PlaceOptions extends StylizeOptions {
  scale?: number;
  rotation?: number;
}

export class Library {
  private constructor(
    private readonly models: Map<string, THREE.Object3D>,
    readonly character: THREE.Object3D,
    readonly clips: THREE.AnimationClip[],
  ) {}

  static async load(base = '/models', onProgress?: (done: number, total: number) => void): Promise<Library> {
    const loader = new GLTFLoader();
    const jobs: Promise<unknown>[] = [];
    let done = 0;
    const track = <T>(p: Promise<T>): Promise<T> => {
      jobs.push(p);
      return p.then((v) => {
        onProgress?.(++done, jobs.length);
        return v;
      });
    };

    const models = new Map<string, THREE.Object3D>();
    for (const name of FURNITURE) {
      track(loader.loadAsync(`${base}/furniture/${name}.gltf`)).then((g) => models.set(name, g.scene));
    }
    for (const name of PROPS) {
      track(loader.loadAsync(`${base}/props/${name}.glb`)).then((g) => models.set(name, g.scene));
    }
    for (const name of TREES) {
      track(loader.loadAsync(`${base}/trees/${name}.gltf`)).then((g) => models.set(name, g.scene));
    }
    const character = track(loader.loadAsync(`${base}/character/Mannequin_Medium.glb`));
    const anims = ANIMATION_FILES.map((f) => track(loader.loadAsync(`${base}/character/${f}.glb`)));

    const [man, ...animGltfs] = await Promise.all([character, ...anims]);
    await Promise.all(jobs);
        const clips = animGltfs.flatMap((g) => g.animations);
    // tool-holding slots exist in the rig files but not on the mannequin
    for (const clip of clips) clip.tracks = clip.tracks.filter((t) => !t.name.startsWith('handslot'));
    plainHead(man.scene);
    plainClothes(man.scene);
    // the head keeps its shape (the face is measured off it) but gets soft normals: the ear discs
    // pressed flat above were left with hard edges, which showed as a ring once the head turned
    const skull = man.scene.getObjectByName('Mannequin_Medium_Head') as THREE.Mesh | undefined;
    if (skull?.isMesh) iron(skull.geometry, 0, false);
    return new Library(models, man.scene, clips);
  }

  /** A stylized copy of a model, base at y = 0. */
  get(name: AssetName, opts: PlaceOptions = {}): THREE.Group {
    const src = this.models.get(name);
    if (!src) throw new Error(`asset not loaded: ${name}`);
    const model = src.clone(true);
    const isProp = (PROPS as readonly string[]).includes(name);
    const isTree = (TREES as readonly string[]).includes(name);
    stylize(model, { textureKey: isProp ? name : isTree ? 'forest' : 'furniture', ...opts });

    const wrap = new THREE.Group();
    wrap.name = name;
    wrap.add(model);
    wrap.scale.setScalar((opts.scale ?? 1) * (isProp ? PROP_SCALE : isTree ? 1 : FURNITURE_SCALE));
    wrap.rotation.y = opts.rotation ?? 0;
    return wrap;
  }

  /** A fresh, independently animatable copy of the character. */
  getCharacter(): THREE.Object3D {
    return cloneSkinned(this.character);
  }
}

/**
 * The mannequin's head without its test-dummy markings: the red and blue lower half and the
 * grey discs on the sides go plain skin, and the discs are pressed flush into the head. The
 * face stays. Done once on the loaded model; every copy shares the geometry.
 */
function plainHead(model: THREE.Object3D): void {
  const head = model.getObjectByName('Mannequin_Medium_Head') as THREE.Mesh | undefined;
  if (!head?.isMesh) return;
  const geo = head.geometry;
  const uv = geo.getAttribute('uv');
  const pos = geo.getAttribute('position');
  const normal = geo.getAttribute('normal');
  // the head's sides are flat at |x| = SIDE; each disc sits in a ring about this centre
  const SIDE = 0.418;
  const DISC_Y = 1.711;
  const DISC_R = 0.285;
  for (let i = 0; i < uv.count; i++) {
    // the upper half of the texture is the colour strips; the face's own blank skin is lower left
    if (uv.getY(i) < 0.5) uv.setXY(i, 0.06, 0.6);
    const x = pos.getX(i);
    if (Math.abs(x) > 0.38 && Math.hypot(pos.getY(i) - DISC_Y, pos.getZ(i)) < DISC_R) {
      pos.setX(i, Math.sign(x) * SIDE);
      normal.setXYZ(i, Math.sign(x), 0, 0);
    }
  }
  uv.needsUpdate = true;
  pos.needsUpdate = true;
  normal.needsUpdate = true;
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
}

/**
 * The mannequin's clothes, ironed. They come modelled as hard little facets with panels and a belt
 * sculpted in, and under three-step toon light every facet and ridge turns into its own patch, so
 * the jacket reads as lumpy. Each piece is smoothed once here (the shape kept, the ridges and dents
 * let out) and given soft normals, so the light falls across it in a few clean bands, like a
 * painted coat. Every copy shares the result. The head is left alone: its face is measured off it.
 */
function plainClothes(model: THREE.Object3D): void {
  const passes: [RegExp, number][] = [
    [/Body/, 16],
    [/Arm/, 12],
    [/Leg/, 6],
  ];
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const hit = mesh.isMesh && passes.find(([re]) => re.test(mesh.name));
    if (hit) iron(mesh.geometry, hit[1]);
  });
}

/**
 * Taubin smoothing (a shrinking step, then a growing one, so the piece keeps its size) over the
 * mesh with its seams closed, then normals averaged across the seams. Vertices that share a place
 * move together, so nothing tears where the texture or the old hard edges split them.
 */
function iron(geo: THREE.BufferGeometry, passes: number, prune = true): void {
  const pos = geo.getAttribute('position');
  const normal = geo.getAttribute('normal');
  const n = pos.count;
  const ids = new Map<string, number>();
  const id = new Int32Array(n);
  const p: number[] = [];
  for (let i = 0; i < n; i++) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    let k = ids.get(key);
    if (k === undefined) {
      k = p.length / 3;
      ids.set(key, k);
      p.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    id[i] = k;
  }
  const m = p.length / 3;
  const P = Float32Array.from(p);
  const index = geo.index;
  const corner = (t: number) => id[index ? index.getX(t) : t];
  const tris = (index ? index.count : n) / 3;
  const near: Set<number>[] = Array.from({ length: m }, () => new Set());
  for (let t = 0; t < tris; t++) {
    const a = corner(t * 3);
    const b = corner(t * 3 + 1);
    const c = corner(t * 3 + 2);
    near[a].add(b).add(c);
    near[b].add(a).add(c);
    near[c].add(a).add(b);
  }
  // stuck-on bits (the body's chest pocket) go entirely: each is folded down to a point, so it draws nothing
  const root = Int32Array.from({ length: m }, (_, v) => v);
  const find = (v: number): number => (root[v] === v ? v : (root[v] = find(root[v])));
  for (let v = 0; v < m; v++) for (const u of near[v]) root[find(u)] = find(v);
  const count = new Map<number, number>();
  for (let v = 0; v < m; v++) count.set(find(v), (count.get(find(v)) ?? 0) + 1);
  const largest = Math.max(...count.values());
  for (const [r, size] of count) {
    if (!prune || size >= largest * 0.1) continue;
    const members = [];
    const mid = [0, 0, 0];
    for (let v = 0; v < m; v++) {
      if (find(v) !== r) continue;
      members.push(v);
      for (let k = 0; k < 3; k++) mid[k] += P[v * 3 + k] / size;
    }
    for (const v of members) {
      P.set(mid, v * 3);
      near[v].clear();
    }
  }

  const next = new Float32Array(m * 3);
  const step = (by: number) => {
    for (let v = 0; v < m; v++) {
      const around = near[v];
      for (let k = 0; k < 3; k++) {
        let sum = 0;
        for (const u of around) sum += P[u * 3 + k];
        const mean = around.size ? sum / around.size : P[v * 3 + k];
        next[v * 3 + k] = P[v * 3 + k] + by * (mean - P[v * 3 + k]);
      }
    }
    P.set(next);
  };
  for (let i = 0; i < passes; i++) {
    step(0.5);
    step(-0.53);
  }

  // soft normals: each place gets the area-weighted average of the faces round it
  const N = new Float32Array(m * 3);
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const at = (v: number) => new THREE.Vector3(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
  for (let t = 0; t < tris; t++) {
    const a = corner(t * 3);
    const b = corner(t * 3 + 1);
    const c = corner(t * 3 + 2);
    const pa = at(a);
    const face = e1.subVectors(at(b), pa).cross(e2.subVectors(at(c), pa));
    for (const v of [a, b, c]) {
      N[v * 3] += face.x;
      N[v * 3 + 1] += face.y;
      N[v * 3 + 2] += face.z;
    }
  }
  const nv = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const v = id[i];
    pos.setXYZ(i, P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
    nv.set(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]).normalize();
    normal.setXYZ(i, nv.x, nv.y, nv.z);
  }
  pos.needsUpdate = true;
  normal.needsUpdate = true;
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
}

/** World-space footprint of an object, for colliders. */
export function footprint(obj: THREE.Object3D, pad = 0): { x0: number; x1: number; z0: number; z1: number } {
  obj.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as { isLineSegments2?: boolean }).isLineSegments2) return;
    if ((mesh.material as THREE.Material).userData.isHull) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    box.union(part.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld));
  });
  return { x0: box.min.x - pad, x1: box.max.x + pad, z0: box.min.z - pad, z1: box.max.z + pad };
}
