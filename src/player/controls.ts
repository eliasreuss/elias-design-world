import * as THREE from 'three';
import type { AABB, World } from '../world/scene';
import type { Character } from './character';
import { findPath } from './pathfind';

const SPEED = 2.8;
const RUN_MULT = 1.7;
const JUMP_SPEED = 4.6;
const GRAVITY = 15;
const CLIMB_SPEED = 1.4;
const RADIUS = 0.22;
/** Extra room kept when planning, so paths never graze a corner. */
const PATH_CLEARANCE = 0.05;

const KEYS: Record<string, [number, number]> = {
  // screen up / down / left / right mapped onto the isometric ground axes
  KeyW: [-1, -1],
  ArrowUp: [-1, -1],
  KeyS: [1, 1],
  ArrowDown: [1, 1],
  KeyA: [-1, 1],
  ArrowLeft: [-1, 1],
  KeyD: [1, -1],
  ArrowRight: [1, -1],
};

interface Route {
  points: THREE.Vector3[];
  index: number;
  level: number;
  done?: () => void;
  /** Carried rather than climbing: stand still while the route goes up or down. */
  ride: boolean;
  /** Metres a second, when the route is neither a walk nor a climb. */
  speed?: number;
  /** Feet off the ground the whole way: hanging from something. */
  air?: boolean;
}

export interface WalkPlan {
  /** Where the visitor clicked. */
  click: { x: number; z: number };
  /** Where the walk will end: the click, or the nearest reachable spot to it. */
  dest: { x: number; z: number };
  reachable: boolean;
  /** Remaining corners, nearest first. */
  path: [number, number][];
  level: number;
}

export class Player {
  readonly position = new THREE.Vector3();
  level = 0;
  /** Set to true to ignore input (e.g. while an overlay is open). */
  frozen = false;

  /** Keys only move the character once the visitor has stepped into the world. */
  private active = false;
  private readonly held = new Set<string>();
  private target: { x: number; z: number; arrive?: () => void; within: number; path: [number, number][] } | null = null;
  private route: Route | null = null;
  private stuck = 0;
  private shift = false;
  private jumpY = 0;
  private jumpV = 0;

  constructor(
    private readonly world: World,
    readonly character: Character,
  ) {
    this.position.copy(world.spawn);
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.code in KEYS) {
        this.held.add(e.code);
        e.preventDefault();
      }
    });
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.key === 'Shift') this.shift = true;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat && !this.frozen && !this.route && this.jumpY === 0) this.jumpV = JUMP_SPEED;
      }
    });
    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      if (e.key === 'Shift') this.shift = false;
    });
    window.addEventListener('blur', () => {
      this.held.clear();
      this.shift = false;
    });
  }

  /** The route the character is currently walking after a click, for drawing a guide. */
  get walkPlan(): WalkPlan | null {
    const t = this.target;
    if (!t || this.route) return null;
    // the path ends where the character will actually stop, which is short of the click if it is out of reach
    const [ex, ez] = t.path[t.path.length - 1];
    const reachable = Math.hypot(ex - t.x, ez - t.z) <= Math.max(t.within, 0.3);
    const dest = reachable ? { x: t.x, z: t.z } : { x: ex, z: ez };
    return { click: { x: t.x, z: t.z }, dest, reachable, path: t.path, level: this.level };
  }

  get busy(): boolean {
    return this.route !== null;
  }

  /** Hand the keyboard to the character, or give it back to the page. */
  setActive(on: boolean): void {
    this.active = on;
    if (on) return;
    this.held.clear();
    this.shift = false;
    this.target = null;
  }

  /** Walk around obstacles to a point; `arrive` fires once within `within` of it. */
  walkTo(x: number, z: number, arrive?: () => void, within = 0.06): void {
    if (this.route) return;
    const path = findPath([this.position.x, this.position.z], [x, z], this.world.bounds[this.level], (px, pz) =>
      this.blocked(px, pz, PATH_CLEARANCE),
    );
    this.target = path ? { x, z, arrive, within, path } : null;
    if (!path && Math.hypot(x - this.position.x, z - this.position.z) <= Math.max(within, 0.3)) arrive?.();
    this.stuck = 0;
  }

  /** Follow fixed waypoints (ladders, lifts), ignoring collision, ending on `level`. */
  follow(points: THREE.Vector3[], level: number, done?: () => void, ride = false, how: { speed?: number; air?: boolean } = {}): void {
    this.target = null;
    this.route = { points, index: 0, level, done, ride, ...how };
  }

  update(dt: number): void {
    let moving = false;
    let climbing = false;
    const hanging = !!this.route?.air;
    if (this.route) {
      const carried = this.route.ride;
      climbing = this.advanceRoute(dt);
      moving = !(carried && climbing);
      if (carried) climbing = false;
    } else if (!this.frozen) {
      moving = this.walk(dt);
    }
    if (this.jumpV !== 0 || this.jumpY > 0) {
      this.jumpV -= GRAVITY * dt;
      this.jumpY += this.jumpV * dt;
      if (this.jumpY <= 0) {
        this.jumpY = 0;
        this.jumpV = 0;
      }
    }
    this.character.update(dt, moving, climbing, moving && !climbing && !this.route && this.shift, this.jumpY > 0 || hanging);
    this.character.group.position.copy(this.position);
    this.character.group.position.y += this.jumpY;
  }

  private advanceRoute(dt: number): boolean {
    const route = this.route!;
    const goal = route.points[route.index];
    const delta = goal.clone().sub(this.position);
    const climbing = Math.abs(delta.y) > 0.01;
    const step = (route.speed ?? (climbing ? CLIMB_SPEED : SPEED)) * dt;
    if (Math.abs(delta.x) + Math.abs(delta.z) > 0.01) this.character.face(delta.x, delta.z);
    if (delta.length() <= step) {
      this.position.copy(goal);
      if (++route.index >= route.points.length) {
        this.level = route.level;
        this.route = null;
        route.done?.();
      }
    } else {
      this.position.addScaledVector(delta.normalize(), step);
    }
    return climbing;
  }

  private walk(dt: number): boolean {
    let dx = 0;
    let dz = 0;
    for (const code of this.held) {
      dx += KEYS[code][0];
      dz += KEYS[code][1];
    }

    if (dx !== 0 || dz !== 0) {
      this.target = null;
    } else if (this.target) {
      const t = this.target;
      const px = this.position.x;
      const pz = this.position.z;
      while (t.path.length > 1 && Math.hypot(t.path[0][0] - px, t.path[0][1] - pz) < 0.1) t.path.shift();
      const [gx, gz] = t.path[0];
      const atEnd = t.path.length === 1 && Math.hypot(gx - px, gz - pz) < 0.04;
      if (Math.hypot(t.x - px, t.z - pz) <= t.within || atEnd) {
        this.target = null;
        if (Math.hypot(t.x - px, t.z - pz) <= Math.max(t.within, 0.3)) t.arrive?.();
        return false;
      }
      dx = gx - px;
      dz = gz - pz;
    }
    const len = Math.hypot(dx, dz);
    if (len === 0) return false;

    const run = this.shift ? RUN_MULT : 1;
    let step = SPEED * run * dt;
    if (this.target) step = Math.min(step, len);
    dx = (dx / len) * step;
    dz = (dz / len) * step;
    this.character.face(dx, dz);

    // move each axis separately so the character slides along obstacles
    const before = this.position.clone();
    if (!this.blocked(this.position.x + dx, this.position.z)) this.position.x += dx;
    if (!this.blocked(this.position.x, this.position.z + dz)) this.position.z += dz;

    if (this.target) {
      // give up on a click target we cannot make progress towards
      const progressed = before.distanceTo(this.position) > step * 0.3;
      this.stuck = progressed ? 0 : this.stuck + dt;
      if (this.stuck > 0.35) this.target = null;
    }
    return true;
  }

  private blocked(x: number, z: number, extra = 0): boolean {
    const r = RADIUS + extra;
    // on the ground somewhere: an island, a bridge, a floor
    const held = this.world.floors[this.level].some((f) => x >= f.x0 + r && x <= f.x1 - r && z >= f.z0 + r && z <= f.z1 - r);
    if (!held) return true;
    return this.world.colliders[this.level].some((c: AABB) => {
      return c.enabled !== false && x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r;
    });
  }
}
