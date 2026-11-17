import * as THREE from 'three';
import { palette } from '../style/palette';

/**
 * A face drawn on the head rather than printed in its texture, so it can blink and look about.
 *
 * Everything here is in head-bone units: the head is ~0.84 wide, its face is a gently curved front
 * at z ~0.54, and the eyes sit about half way up it. The eyes are points on that surface, not a
 * decal in front of it: when the head turns, they go round with it, and the one heading for the
 * edge foreshortens on its own. That is what makes a face read as being on something round.
 */
export type FaceStyle = 'bright' | 'dots' | 'square' | 'happy' | 'wink';

/** z on the face for a point (x, y) on it. */
export type Surface = (x: number, y: number) => number;

/**
 * Every eye but the happy one is a rounded rectangle. A blink rebuilds it at its new height
 * rather than scaling it, so the corners stay round instead of going elliptical as it shuts.
 */
type Eye = { w: number; h: number; r: number };

const EYES: Record<Exclude<FaceStyle, 'happy'>, Eye> = {
  bright: { w: 0.07, h: 0.125, r: 0.035 },
  /** the open one; the other is shut in a smile */
  wink: { w: 0.07, h: 0.125, r: 0.035 },
  dots: { w: 0.082, h: 0.082, r: 0.041 },
  square: { w: 0.088, h: 0.088, r: 0.02 },
};

/** Mouths are one stroke: how wide, how far the middle dips below the ends, how thick, and how far off centre. */
const MOUTHS: Record<FaceStyle, { w: number; sag: number; t: number; x?: number }> = {
  wink: { w: 0.15, sag: 0.05, t: 0.028, x: 0.03 },
  bright: { w: 0.2, sag: 0.055, t: 0.028 },
  dots: { w: 0.09, sag: 0.022, t: 0.026 },
  square: { w: 0.11, sag: 0, t: 0.026 },
  happy: { w: 0.15, sag: 0.05, t: 0.028 },
};

const EYE_X = 0.17;
const EYE_Y = 0.5;
const MOUTH_Y = 0.35;
/** Lifted this far off the skin so it never fights it. */
const LIFT = 0.006;
/** How far the eyes can slide across the face before the head has to turn. */
const ROAM_X = 0.045;
const ROAM_Y = 0.03;

const ink = new THREE.MeshBasicMaterial({
  color: palette.ink,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -4,
});

function rounded({ w, h, r }: Eye): THREE.ShapeGeometry {
  const c = Math.min(r, w / 2, h / 2);
  const x = -w / 2;
  const y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + c, y);
  s.lineTo(x + w - c, y);
  s.absarc(x + w - c, y + c, c, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - c);
  s.absarc(x + w - c, y + h - c, c, 0, Math.PI / 2, false);
  s.lineTo(x + c, y + h);
  s.absarc(x + c, y + h - c, c, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + c);
  s.absarc(x + c, y + c, c, Math.PI, Math.PI * 1.5, false);
  return new THREE.ShapeGeometry(s, 6);
}

/** A pen stroke along a polyline, round at the ends and the joints, lying on the face. */
function stroke(points: [number, number][], t: number, z: Surface): THREE.BufferGeometry {
  const pos: number[] = [];
  const r = t / 2;
  const put = (x: number, y: number) => pos.push(x, y, z(x, y));
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = (-(by - ay) / len) * r;
    const ny = ((bx - ax) / len) * r;
    put(ax + nx, ay + ny);
    put(ax - nx, ay - ny);
    put(bx + nx, by + ny);
    put(bx + nx, by + ny);
    put(ax - nx, ay - ny);
    put(bx - nx, by - ny);
  }
  const SEG = 12;
  for (const [cx, cy] of points) {
    for (let k = 0; k < SEG; k++) {
      const a0 = (k / SEG) * Math.PI * 2;
      const a1 = ((k + 1) / SEG) * Math.PI * 2;
      put(cx, cy);
      put(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
      put(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return geo;
}

/** A shallow arc, as points: `bend` above zero bows the middle up, below zero dips it. */
function arc(cx: number, cy: number, w: number, bend: number, steps = 8): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const u = (i / steps) * 2 - 1;
    out.push([cx + (u * w) / 2, cy + bend * (1 - u * u)]);
  }
  return out;
}

const flat: Surface = () => 0;

/** Several pen strokes as one piece. */
function mergeStrokes(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const p of parts) {
    pos.push(...(p.getAttribute('position').array as Float32Array));
    p.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return geo;
}

export class Face {
  readonly group = new THREE.Group();
  private readonly eyes: THREE.Mesh[] = [];
  /** Shut eyes are arcs: they squash to blink instead of being rebuilt. */
  private readonly shut = new Set<THREE.Mesh>();
  /** The dots face wears lashes: two flicks off each eye's outer top edge, riding on the eye. */
  private readonly lashes: THREE.Mesh[] = [];
  private lid = 1;
  /** How far the eyes have slid across the face, in head-bone units, for anything worn over them. */
  readonly gaze = { x: 0, y: 0 };

  constructor(
    readonly style: FaceStyle,
    private readonly surface: Surface,
  ) {
    for (const side of [-1, 1]) {
      // the happy eyes are shut in a smile, an arc bowed upwards; a wink shuts just the one on its left
      const closed = style === 'happy' || (style === 'wink' && side === 1);
      const geo = closed ? stroke(arc(0, -0.012, 0.1, 0.036), 0.028, flat) : rounded(EYES[style as keyof typeof EYES]);
      const eye = new THREE.Mesh(geo, ink);
      if (closed) this.shut.add(eye);
      eye.userData.side = side;
      this.eyes.push(eye);
      this.group.add(eye);
      if (style === 'dots') {
        // two short flicks out and up from the eye's outer top edge, the outer one longer
        const r = EYES.dots.w / 2;
        const flick = (deg: number, dx: number, dy: number): [number, number][] => {
          const a = (deg * Math.PI) / 180;
          const x = side * r * Math.cos(a);
          const y = r * Math.sin(a);
          return [[x, y], [x + side * dx, y + dy]];
        };
        const lash = new THREE.Mesh(
          mergeStrokes([stroke(flick(62, 0.02, 0.032), 0.016, flat), stroke(flick(24, 0.034, 0.02), 0.016, flat)]),
          ink,
        );
        lash.raycast = () => {};
        eye.add(lash);
        this.lashes.push(lash);
      }
    }
    const m = MOUTHS[style];
    const mx = m.x ?? 0;
    const line: [number, number][] = m.sag ? arc(mx, MOUTH_Y, m.w, -m.sag) : [[mx - m.w / 2, MOUTH_Y], [mx + m.w / 2, MOUTH_Y]];
    const mouth = new THREE.Mesh(
      stroke(line, m.t, (x, y) => surface(x, y) + LIFT),
      ink,
    );
    this.group.add(mouth);
    for (const o of [...this.eyes, mouth]) {
      o.castShadow = false;
      o.receiveShadow = false;
      o.raycast = () => {};
    }
    this.set(0, 0, 1);
  }

  /** Where the eyes have got to (each -1..1 of how far they roam) and how open they are (0..1). */
  set(gx: number, gy: number, lid: number): void {
    const ox = THREE.MathUtils.clamp(gx, -1, 1) * ROAM_X;
    const oy = THREE.MathUtils.clamp(gy, -1, 1) * ROAM_Y;
    this.gaze.x = ox;
    this.gaze.y = oy;
    for (const eye of this.eyes) {
      const x = eye.userData.side * EYE_X + ox;
      const y = EYE_Y + oy;
      eye.position.set(x, y, this.surface(x, y) + LIFT);
    }
    if (Math.abs(lid - this.lid) < 0.02) return;
    this.lid = lid;
    for (const eye of this.shut) eye.scale.y = Math.max(0.3, lid);
    // lashes come down with the lid: they sit on the eye's top edge wherever that has got to
    for (const lash of this.lashes) {
      lash.position.y = (EYES.dots.h * (lid - 1)) / 2;
      lash.scale.y = Math.max(0.35, lid);
    }
    if (this.style === 'happy') return;
    // written as a size, never a scale: the corners keep their radius however far the lids are down
    const spec = EYES[this.style];
    const next = rounded({ w: spec.w, h: Math.max(0.012, spec.h * lid), r: spec.r });
    for (const eye of this.eyes) {
      if (this.shut.has(eye)) continue;
      eye.geometry.dispose();
      eye.geometry = next;
    }
  }

  dispose(): void {
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.group.removeFromParent();
  }
}

const surfaces = new WeakMap<THREE.BufferGeometry, Surface>();

/**
 * The front of the head as a height field, read once off the head's own mesh by firing rays at it
 * from the front, and shared by every copy. Points off the measured patch use its nearest edge.
 */
export function faceSurface(skull: THREE.BufferGeometry, headAt: THREE.Vector3): Surface {
  const known = surfaces.get(skull);
  if (known) return known;
  const X0 = -0.4;
  const X1 = 0.4;
  const Y0 = 0.15;
  const Y1 = 0.8;
  const N = 24;
  const pos = skull.getAttribute('position');
  const index = skull.index;
  const count = index ? index.count : pos.count;
  const tris: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [];
  const at = (i: number) =>
    new THREE.Vector3().fromBufferAttribute(pos, index ? index.getX(i) : i).sub(headAt);
  const n = new THREE.Vector3();
  for (let i = 0; i < count; i += 3) {
    const a = at(i);
    const b = at(i + 1);
    const c = at(i + 2);
    // only what faces forward, inside the patch
    n.subVectors(b, a).cross(c.clone().sub(a));
    if (n.z <= 0) continue;
    if (Math.max(a.x, b.x, c.x) < X0 - 0.05 || Math.min(a.x, b.x, c.x) > X1 + 0.05) continue;
    if (Math.max(a.y, b.y, c.y) < Y0 - 0.05 || Math.min(a.y, b.y, c.y) > Y1 + 0.05) continue;
    tris.push([a, b, c]);
  }
  const grid = new Float32Array((N + 1) * (N + 1));
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));
  const hit = new THREE.Vector3();
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      ray.origin.set(X0 + ((X1 - X0) * i) / N, Y0 + ((Y1 - Y0) * j) / N, 3);
      let z = -Infinity;
      for (const [a, b, c] of tris) {
        if (ray.intersectTriangle(a, b, c, false, hit)) z = Math.max(z, hit.z);
      }
      grid[j * (N + 1) + i] = Number.isFinite(z) ? z : 0.54;
    }
  }
  const surface: Surface = (x, y) => {
    const u = THREE.MathUtils.clamp(((x - X0) / (X1 - X0)) * N, 0, N - 1e-4);
    const v = THREE.MathUtils.clamp(((y - Y0) / (Y1 - Y0)) * N, 0, N - 1e-4);
    const i = Math.floor(u);
    const j = Math.floor(v);
    const fu = u - i;
    const fv = v - j;
    const g = (a: number, b: number) => grid[b * (N + 1) + a];
    return (
      (g(i, j) * (1 - fu) + g(i + 1, j) * fu) * (1 - fv) + (g(i, j + 1) * (1 - fu) + g(i + 1, j + 1) * fu) * fv
    );
  };
  surfaces.set(skull, surface);
  return surface;
}
