import * as THREE from 'three';
import { palette } from '../style/palette';
import type { Player } from './controls';
import type { World } from '../world/scene';

const MAX_DOTS = 280; // enough to cross from one island to the next
const SPACING = 0.24; // distance between dots along the path
const MARCH = 0.45; // how fast the dots drift towards the destination (units / s)
const START_GAP = 0.3; // keep the first dot out from under the character's feet
const END_GAP = 0.3; // and the last one off the marker
const EASE_IN = 0.18; // dots grow over this distance at each end
const LIFT = 0.035; // above the floor, clear of rugs and mats
const BEHIND = 0.28; // how strongly the route shows through walls and furniture
const FADE = 0.22; // seconds to fade out on arrival
const LAND = 0.35; // seconds for the marker to drop in

type Part = { mesh: THREE.Mesh; base: number };

/**
 * A marching dotted line from the character to where you clicked, ending in a
 * small printed target. Whatever is hidden by walls or furniture shows through faintly.
 */
export class PathGuide {
  readonly root = new THREE.Group();

  private readonly parts: Part[] = [];
  private readonly dotSets: THREE.InstancedMesh[] = [];
  private readonly marker = new THREE.Group();
  private readonly pin = new THREE.Group();
  private readonly ripple: THREE.Mesh[] = [];
  /** Marks a click the character cannot reach; the pin then sits where they will stop. */
  private readonly miss = new THREE.Group();

  private readonly corners: THREE.Vector3[] = [];
  private readonly lengths: number[] = [];
  private alpha = 0;
  private landedAt = -Infinity;
  private lastClick = { x: NaN, z: NaN };

  private readonly _pos = new THREE.Vector3();
  private readonly _quat = new THREE.Quaternion();
  private readonly _scale = new THREE.Vector3();
  private readonly _m = new THREE.Matrix4();

  constructor(
    private readonly player: Player,
    private readonly world: World,
  ) {
    const flat = (g: THREE.BufferGeometry) => g.rotateX(-Math.PI / 2);

    // dots: a paper halo under an ink dot, so the line reads on grass, road and rug alike
    const halo = flat(new THREE.CircleGeometry(0.07, 16));
    const dot = flat(new THREE.CircleGeometry(0.05, 16));
    const shared = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DOTS * 16), 16);
    shared.setUsage(THREE.DynamicDrawUsage);
    this.dots(halo, palette.paper, 0.75, 40, shared);
    this.dots(dot, palette.ink, 1, 41, shared);

    // marker: ink rim, red face, paper centre
    this.pin.add(
      this.flat(flat(new THREE.CircleGeometry(0.2, 36)), palette.ink, 0.95, 42),
      this.flat(flat(new THREE.CircleGeometry(0.165, 36)), palette.red, 1, 43, 0.001),
      this.flat(flat(new THREE.RingGeometry(0.085, 0.11, 32)), palette.paper, 1, 44, 0.002),
      this.flat(flat(new THREE.CircleGeometry(0.042, 16)), palette.paper, 1, 44, 0.002),
    );
    this.marker.add(this.pin);

    for (const angle of [Math.PI / 4, -Math.PI / 4]) {
      const bar = this.flat(new THREE.PlaneGeometry(0.26, 0.055).rotateX(-Math.PI / 2).rotateY(angle), palette.ink, 0.85, 42);
      this.miss.add(bar);
    }

    // two ripples, half a beat apart
    for (let i = 0; i < 2; i++) {
      const ring = this.flat(flat(new THREE.RingGeometry(0.2, 0.228, 40)), palette.red, 0.7, 39);
      this.ripple.push(ring);
      this.marker.add(ring);
    }
  }

  attach(scene: THREE.Object3D): void {
    this.root.add(...this.dotSets, this.marker, this.miss);
    this.root.visible = false;
    scene.add(this.root);
  }

  hide(): void {
    this.alpha = 0;
    this.root.visible = false;
  }

  /** `calm` holds every animation still, for visitors who ask for less motion. */
  update(dt: number, time: number, calm = false): void {
    const plan = this.player.walkPlan;

    if (plan) {
      const y = this.world.levelY[plan.level] + LIFT;
      this.corners.length = 0;
      this.corners.push(new THREE.Vector3(this.player.position.x, y, this.player.position.z));
      for (const [px, pz] of plan.path) this.corners.push(new THREE.Vector3(px, y, pz));
      const last = this.corners[this.corners.length - 1];
      if (this.corners.length === 1 || Math.hypot(last.x - plan.dest.x, last.z - plan.dest.z) > 0.02) {
        this.corners.push(new THREE.Vector3(plan.dest.x, y, plan.dest.z));
      }

      if (plan.click.x !== this.lastClick.x || plan.click.z !== this.lastClick.z) {
        this.lastClick = { ...plan.click };
        this.landedAt = time;
      }
      this.marker.position.set(plan.dest.x, y + 0.004, plan.dest.z);
      this.miss.visible = !plan.reachable;
      this.miss.position.set(plan.click.x, y + 0.004, plan.click.z);
      this.alpha = 1;
    } else {
      // arrived (or interrupted): let the last route fade rather than vanish
      this.alpha = calm ? 0 : Math.max(0, this.alpha - dt / FADE);
      if (this.alpha === 0) this.lastClick = { x: NaN, z: NaN };
      else this.trimToCharacter();
    }

    this.root.visible = this.alpha > 0 && this.corners.length > 1;
    if (!this.root.visible) return;

    for (const p of this.parts) (p.mesh.material as THREE.MeshBasicMaterial).opacity = p.base * this.alpha;
    this.layDots(calm ? 0 : time);
    this.animateMarker(calm ? Infinity : time - this.landedAt, calm ? 0 : time);
  }

  /** Once the target is gone, keep the fading line attached to the character. */
  private trimToCharacter(): void {
    if (!this.corners.length) return;
    this.corners[0].x = this.player.position.x;
    this.corners[0].z = this.player.position.z;
  }

  private layDots(time: number): void {
    this.lengths.length = 0;
    let total = 0;
    for (let i = 0; i < this.corners.length - 1; i++) {
      const len = Math.hypot(this.corners[i + 1].x - this.corners[i].x, this.corners[i + 1].z - this.corners[i].z);
      this.lengths.push(len);
      total += len;
    }

    const from = START_GAP;
    const to = total - END_GAP;
    let n = 0;
    if (to > from) {
      // dots drift forward, so the line points the way the character is going
      const offset = (time * MARCH) % SPACING;
      let seg = 0;
      let segStart = 0;
      for (let s = from + offset; s <= to && n < MAX_DOTS; s += SPACING) {
        while (seg < this.lengths.length - 1 && s > segStart + this.lengths[seg]) segStart += this.lengths[seg++];
        const a = this.corners[seg];
        const b = this.corners[seg + 1];
        const t = this.lengths[seg] > 0 ? (s - segStart) / this.lengths[seg] : 0;
        this._pos.set(a.x + (b.x - a.x) * t, a.y, a.z + (b.z - a.z) * t);

        // grow in at the character, shrink into the marker
        const k = Math.min(smooth((s - from) / EASE_IN), smooth((to - s) / EASE_IN));
        this._scale.setScalar(Math.max(0.001, k));
        this._m.compose(this._pos, this._quat, this._scale);
        this.dotSets[0].setMatrixAt(n++, this._m);
      }
    }

    for (const set of this.dotSets) set.count = n;
    this.dotSets[0].instanceMatrix.needsUpdate = true;
  }

  private animateMarker(sinceLanding: number, time: number): void {
    // drop in with a little overshoot, then sit still
    const t = Math.min(1, sinceLanding / LAND);
    // from most of its size, never from nothing
    const land = sinceLanding === Infinity ? 1 : 0.8 + 0.2 * backOut(t);
    this.pin.scale.setScalar(land);
    this.pin.position.y = (1 - t) * 0.12;

    this.ripple.forEach((ring, i) => {
      if (time === 0) {
        ring.visible = false;
        return;
      }
      ring.visible = true;
      const phase = (time * 0.9 + i * 0.5) % 1;
      ring.scale.setScalar(1 + phase * 1.6);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - phase) ** 1.5 * this.alpha;
    });
  }

  // ----- building blocks -------------------------------------------------

  /** A see-through basic material; `behind` draws only where something is in front of it. */
  private material(color: string, opacity: number, behind: boolean): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      depthFunc: behind ? THREE.GreaterDepth : THREE.LessEqualDepth,
    });
  }

  /** Instanced dots, plus a faint copy that shows through whatever covers them. */
  private dots(geometry: THREE.BufferGeometry, color: string, opacity: number, order: number, matrices: THREE.InstancedBufferAttribute): void {
    for (const behind of [false, true]) {
      const base = behind ? opacity * BEHIND : opacity;
      const mesh = new THREE.InstancedMesh(geometry, this.material(color, base, behind), MAX_DOTS);
      mesh.instanceMatrix = matrices;
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.renderOrder = order + (behind ? -20 : 0);
      this.parts.push({ mesh, base });
      this.dotSets.push(mesh);
    }
  }

  /** One flat piece of the marker, with its show-through twin as a child. */
  private flat(geometry: THREE.BufferGeometry, color: string, opacity: number, order: number, lift = 0): THREE.Mesh {
    const front = new THREE.Mesh(geometry, this.material(color, opacity, false));
    front.position.y = lift;
    front.renderOrder = order;
    const back = new THREE.Mesh(geometry, this.material(color, opacity * BEHIND, true));
    back.renderOrder = order - 20;
    front.add(back);
    this.parts.push({ mesh: front, base: opacity }, { mesh: back, base: opacity * BEHIND });
    return front;
  }
}

function smooth(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

function backOut(t: number): number {
  const c = 1.7;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
