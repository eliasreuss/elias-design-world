import * as THREE from 'three';
import type { Library } from '../assets/library';
import { hull, toon } from '../style/materials';
import { palette } from '../style/palette';
import { ball, box, cylinder } from '../world/builders';
import { Face, faceSurface, type FaceStyle, type Surface } from './face';

export type { FaceStyle };

const HEIGHT = 1.75;
/** The KayKit head is half the figure; shrink it towards illustration proportions. */
const HEAD_SCALE = 0.62;
const FADE = 0.2;

/** What a figure wears. The visitor's own clothes are the default. */
export interface Outfit {
  jacket?: string;
  trousers?: string;
  /** false goes bare-headed. The hat is always the jacket's colour. */
  hat?: HatStyle | false;
  hair?: { style: HairStyle; color: string };
  glasses?: boolean;
  /** A scarf round the neck, a shade off the jacket. */
  scarf?: boolean;
  /** A small rucksack. */
  pack?: boolean;
  /** Little gold drops at the ears. */
  earrings?: boolean;
  /** A gold-rimmed monocle over the right eye. */
  monocle?: boolean;
  /** A face drawn on, which blinks and looks about. Left out, the face printed on the mannequin stays. */
  face?: FaceStyle;
  /** Stature, as shares of the standard figure: 1 is the visitor's own. */
  build?: { height?: number; width?: number };
  /** The loop played while standing about. */
  idle?: 'Idle_A' | 'Idle_B' | 'Sit_Chair_Idle';
  /** Wave now and then when left alone. */
  waves?: boolean;
}

export type HatStyle = 'boxy' | 'cap' | 'beanie' | 'bucket' | 'top';
export type HairStyle = 'crop' | 'bob' | 'bun' | 'long';
export type Gesture = 'Interact' | 'Waving' | 'PickUp' | 'Cheering' | 'Hit_A';

const FINE = { line: 1.1 };
/** A shade of a colour: below 1 is darker, above is lighter. */
const shade = (color: string, by: number) => `#${new THREE.Color(color).multiplyScalar(by).getHexString()}`;
/** Every shade of the jacket anything is cut from: the jacket itself, the hat's band, the scarf and the pack's lid. */
const JACKET_SHADES = [1, 0.78, 0.72];

type Slot = 'hat' | 'hair' | 'glasses' | 'scarf' | 'pack' | 'earrings' | 'monocle';

/**
 * How a piece arrives when it is put on in front of you. A hat is dropped onto the head from half a
 * head up and lands with a little give; glasses slide down the nose; a scarf or a pack pops on.
 * `lift` is in the units of the bone it rides on, `from` is the scale it starts at, `back` the
 * overshoot (0 for none).
 */
const ARRIVE: Record<Slot, { lift: number; from: number; ms: number; back: number }> = {
  hat: { lift: 0.5, from: 0.9, ms: 480, back: 1.5 },
  hair: { lift: 0, from: 0.9, ms: 300, back: 1.2 },
  glasses: { lift: 0.14, from: 1, ms: 280, back: 0 },
  scarf: { lift: 0, from: 0.8, ms: 360, back: 1.8 },
  pack: { lift: 0.06, from: 0.8, ms: 360, back: 1.8 },
  earrings: { lift: 0.1, from: 0.6, ms: 340, back: 1.8 },
  monocle: { lift: 0.12, from: 0.7, ms: 320, back: 1.6 },
};
/** Taking something off is quicker than putting it on: it hops up, shrinks a little and is gone. */
const LEAVE_MS = 150;

interface Move {
  obj: THREE.Object3D;
  slot: Slot;
  t: number;
  leaving: boolean;
  pos: THREE.Vector3;
  scale: THREE.Vector3;
}

/** One spring for everything that settles: semi-implicit, in sixtieths of a second, cut into small steps so a long frame can't blow it up. */
interface Spring {
  x: number;
  v: number;
}
function spring(s: Spring, to: number, k: number, d: number, frames: number): void {
  const n = Math.max(1, Math.ceil(frames));
  const f = frames / n;
  for (let i = 0; i < n; i++) {
    s.v += ((to - s.x) * k - s.v * d) * f;
    s.x += s.v * f;
  }
}

const easeOut = (u: number) => 1 - (1 - u) ** 3;
const easeBack = (u: number, c: number) => 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2;

const blanks = new WeakMap<THREE.Texture, THREE.Texture>();
/**
 * The mannequin's texture with its printed face painted out, for a figure wearing a drawn one. The
 * face sits in the lower-left square; its own blank left edge is stretched across it, which keeps
 * the skin's soft gradient. Made once and shared.
 */
function blankFace(tex: THREE.Texture): THREE.Texture {
  const known = blanks.get(tex);
  if (known) return known;
  const img = tex.image as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const g = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  g.drawImage(img, 0, 0);
  g.drawImage(img, W * 0.06, H / 2, 2, H / 2, 0, H / 2, W / 2, H / 2);
  const out = tex.clone();
  // a clone shares its source: give this one its own, or the original gets painted over too
  out.source = new THREE.TextureSource(canvas);
  out.needsUpdate = true;
  blanks.set(tex, out);
  return out;
}

/** The KayKit mannequin, repainted and inked. Faces +z at rotation 0, origin at the feet. */
export class Character {
  readonly group = new THREE.Group();
  private readonly model: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private base: THREE.AnimationAction;
  private gesture: THREE.AnimationAction | null = null;
  /** How brisk the walk is, as a share of the visitor's own pace: the legs keep time with the ground. */
  gait = 1;
  private heading = Math.PI * 0.25;
  private idleFor = 0;
  private readonly head: THREE.Object3D | null;
  private readonly chest: THREE.Object3D | null;
  private readonly headRest = new THREE.Quaternion();
  private readonly chestRest = new THREE.Quaternion();
  private readonly headAt: THREE.Vector3;
  private readonly idle: string;
  private readonly waves: boolean;

  /** Model units to metres, and the share of that the figure is wide. */
  private readonly size: number;
  private readonly breadth: number;
  /** Height as a share of the standard figure, sprung so a change grows rather than jumps. */
  private readonly tall: Spring & { to: number } = { x: 1, v: 0, to: 1 };

  private readonly skin: THREE.MeshToonMaterial | null = null;
  private readonly printed: THREE.Texture | null = null;
  private readonly surface: Surface | null = null;
  private readonly legs: THREE.MeshToonMaterial[] = [];
  /** Everything cut from the jacket's cloth, and how far off the jacket's own colour each piece is. */
  private tints: { mat: THREE.MeshToonMaterial; by: number; piece?: THREE.Object3D }[] = [];
  private readonly jacketNow = new THREE.Color();
  private readonly jacketTo = new THREE.Color();

  private outfit: Outfit = {};
  private readonly worn = new Map<Slot, { key: string; obj: THREE.Object3D }>();
  private moves: Move[] = [];
  private features: Face | null = null;
  /** A change of face happens behind a blink: shut, swap, open. */
  private swap: { t: number; to: FaceStyle | null; done: boolean } | null = null;
  private blinkIn = 1.5 + Math.random() * 2;
  private blinkSince = Infinity;

  /** Where the figure is looking, in radians off the way its body faces: x turns it to its left, y tips it down. */
  private readonly aim = { x: 0, y: 0 };
  /** The head comes round on a soft spring; the eyes get there first, on a quick one. */
  private readonly headTurn = { x: { x: 0, v: 0 }, y: { x: 0, v: 0 } };
  private readonly eyeTurn = { x: { x: 0, v: 0 }, y: { x: 0, v: 0 } };

  constructor(lib: Library, outfit: Outfit = {}) {
    const jacket = outfit.jacket ?? palette.jacket;
    this.idle = outfit.idle ?? 'Idle_A';
    this.waves = outfit.waves ?? true;
    const model = lib.getCharacter();
    this.model = model;
    model.updateMatrixWorld(true);
    const top = new THREE.Box3().setFromObject(model).max.y;
    this.head = model.getObjectByName('head') ?? null;
    this.chest = model.getObjectByName('chest') ?? null;
    if (this.head) this.headRest.copy(this.head.quaternion);
    if (this.chest) this.chestRest.copy(this.chest.quaternion);
    const headAt = this.head ? this.head.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
    this.headAt = headAt;
    const neck = headAt.y;
    this.size = HEIGHT / (neck + (top - neck) * HEAD_SCALE);
    this.breadth = this.size * (outfit.build?.width ?? 1);

    const meshes: THREE.SkinnedMesh[] = [];
    model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.SkinnedMesh);
    });
    for (const mesh of meshes) {
      const src = mesh.material as THREE.MeshStandardMaterial;
      if (/Arm|Body/.test(mesh.name)) {
        const mat = toon({ color: jacket });
        this.tints.push({ mat, by: 1 });
        mesh.material = mat;
      } else if (/Leg/.test(mesh.name)) {
        const mat = toon({ color: outfit.trousers ?? palette.trousers });
        this.legs.push(mat);
        mesh.material = mat;
      } else {
        const mat = toon({ map: src.map, color: new THREE.Color(palette.skin).multiplyScalar(1.15) });
        mesh.material = mat;
        if (mesh.name === 'Mannequin_Medium_Head') {
          this.skin = mat;
          this.printed = src.map;
          this.surface = faceSurface(mesh.geometry, headAt);
        }
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      hull(mesh);
    }
    this.group.add(model);

    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of lib.clips) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.base = this.action(this.idle);
    this.base.play();
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.gesture) this.endGesture();
    });
    this.wear(outfit);
  }

  /**
   * Put an outfit on. Only what changed is touched. With `animate` the change plays out in front of
   * you: a new hat drops on, glasses slide down, the jacket's colour runs across, a change of
   * height grows, and a new face arrives behind a blink.
   *
   * Head pieces are in head-bone units: the head is ~0.84 wide and ~1 deep, its top at ~0.96, its
   * face at z ~0.54. Chest pieces are in chest-bone units: the neck is at y ~0.27.
   */
  wear(outfit: Outfit, animate = false): void {
    this.outfit = outfit;
    const jacket = outfit.jacket ?? palette.jacket;
    this.jacketTo.set(jacket);
    if (!animate) this.jacketNow.copy(this.jacketTo);
    for (const mat of this.legs) mat.color.set(outfit.trousers ?? palette.trousers);
    this.tall.to = outfit.build?.height ?? 1;
    if (!animate) {
      this.tall.x = this.tall.to;
      this.tall.v = 0;
    }
    this.stand();

    const { head, chest } = this;
    if (head) {
      const hatStyle = outfit.hat === false ? null : (outfit.hat ?? 'boxy');
      this.put('hat', hatStyle, () => hat(hatStyle!, jacket), head, animate);
      const h = outfit.hair;
      const skull = this.model.getObjectByName('Mannequin_Medium_Head') as THREE.Mesh | undefined;
      this.put('hair', h && skull ? `${h.style} ${h.color}` : null, () => hair(skull!.geometry, this.headAt, h!.style, h!.color), head, animate);
      this.put('glasses', outfit.glasses ? 'on' : null, glasses, head, animate);
      this.put('earrings', outfit.earrings ? 'on' : null, earrings, head, animate);
      this.put('monocle', outfit.monocle ? 'on' : null, () => monocle(this.surface), head, animate);
    }
    if (chest) {
      this.put('scarf', outfit.scarf ? 'on' : null, () => scarf(shade(jacket, 0.72)), chest, animate);
      this.put('pack', outfit.pack ? 'on' : null, () => pack(jacket), chest, animate);
    }

    const face = outfit.face ?? null;
    const showing = this.swap ? this.swap.to : (this.features?.style ?? null);
    if (face !== showing) {
      if (animate && this.features && face) this.swap = { t: 0, to: face, done: false };
      else {
        this.swap = null;
        this.drawFace(face);
      }
    }
    this.paint();
  }

  /** Swap one worn piece for another, or take it off (`key` null). Nothing happens if it is already on. */
  private put(slot: Slot, key: string | null, make: () => THREE.Object3D, on: THREE.Object3D, animate: boolean): void {
    const was = this.worn.get(slot);
    if ((was?.key ?? null) === key) return;
    if (was) {
      this.worn.delete(slot);
      this.moves = this.moves.filter((m) => m.obj !== was.obj);
      if (animate) this.moves.push(this.move(was.obj, slot, true));
      else this.discard(was.obj);
    }
    if (key === null) return;
    const obj = make();
    this.own(obj);
    on.add(obj);
    this.worn.set(slot, { key, obj });
    if (animate) {
      const m = this.move(obj, slot, false);
      this.moves.push(m);
      this.place(m, 0);
    }
  }

  private move(obj: THREE.Object3D, slot: Slot, leaving: boolean): Move {
    return { obj, slot, t: 0, leaving, pos: obj.position.clone(), scale: obj.scale.clone() };
  }

  /** Where a coming or going piece is, `u` of the way through. */
  private place(m: Move, u: number): void {
    const a = ARRIVE[m.slot];
    if (m.leaving) {
      const e = easeOut(u);
      m.obj.position.copy(m.pos).setY(m.pos.y + (a.lift || 0.08) * 0.5 * e);
      m.obj.scale.copy(m.scale).multiplyScalar(1 - 0.35 * e);
      return;
    }
    const e = a.back ? easeBack(u, a.back) : easeOut(u);
    m.obj.position.copy(m.pos).setY(m.pos.y + a.lift * (1 - e));
    m.obj.scale.copy(m.scale).multiplyScalar(a.from + (1 - a.from) * e);
  }

  /** Cut a new piece's jacket-coloured parts from this figure's own cloth, so they follow the jacket as it changes. */
  private own(piece: THREE.Object3D): void {
    const hexes = JACKET_SHADES.map((by) => shade(`#${this.jacketTo.getHexString()}`, by).slice(1));
    piece.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const mat = mesh.material as THREE.MeshToonMaterial | undefined;
      if (!mesh.isMesh || !mat?.isMeshToonMaterial) return;
      const i = hexes.indexOf(mat.color.getHexString());
      if (i < 0) return;
      const mine = toon({ color: mat.color });
      mesh.material = mine;
      this.tints.push({ mat: mine, by: JACKET_SHADES[i], piece });
    });
  }

  private discard(piece: THREE.Object3D): void {
    this.tints = this.tints.filter((t) => {
      if (t.piece !== piece) return true;
      t.mat.dispose();
      return false;
    });
    piece.traverse((o) => {
      const mesh = o as THREE.Mesh;
      // an inked hull borrows its owner's geometry, which goes (or, for hair, stays) with the owner
      const borrowed = (mesh.material as THREE.Material | undefined)?.userData?.isHull;
      if (mesh.isMesh && !mesh.userData.shared && !borrowed) mesh.geometry.dispose();
    });
    piece.removeFromParent();
  }

  private paint(): void {
    for (const t of this.tints) t.mat.color.copy(this.jacketNow).multiplyScalar(t.by);
  }

  private stand(): void {
    const tall = this.tall.x;
    this.model.scale.set(this.breadth, this.size * tall, this.breadth);
  }

  private drawFace(style: FaceStyle | null): void {
    this.features?.dispose();
    this.features = null;
    if (!this.skin || !this.printed) return;
    this.skin.map = style ? blankFace(this.printed) : this.printed;
    if (!style || !this.head || !this.surface) return;
    this.features = new Face(style, this.surface);
    this.head.add(this.features.group);
  }

  private action(name: string): THREE.AnimationAction {
    const a = this.actions.get(name);
    if (!a) throw new Error(`missing animation ${name}`);
    return a;
  }

  /** Turn towards a direction of travel on the ground plane. */
  face(dx: number, dz: number): void {
    this.heading = Math.atan2(dx, dz);
  }

  /** Stand facing a compass heading straight away, with no turn. */
  turnTo(heading: number): void {
    this.heading = heading;
    this.group.rotation.y = heading;
  }

  /**
   * Look somewhere, in radians off the way the body faces: `yaw` to its left, `pitch` down. The
   * eyes go first and the head follows; `now` skips the following, for a still picture.
   */
  look(yaw: number, pitch: number, now = false): void {
    this.aim.x = yaw;
    this.aim.y = pitch;
    if (!now) return;
    for (const s of [this.headTurn, this.eyeTurn]) {
      s.x.x = yaw;
      s.y.x = pitch;
      s.x.v = s.y.v = 0;
    }
  }

  /** Blink now, rather than whenever it was going to. */
  blink(): void {
    this.blinkIn = 0;
  }

  /** Where the head is, in world space. */
  headPosition(target: THREE.Vector3): THREE.Vector3 {
    return this.head ? this.head.getWorldPosition(target) : this.group.getWorldPosition(target);
  }

  /** Play a one-off animation (e.g. reaching for a switch) over the current loop. */
  play(name: Gesture): void {
    const next = this.action(name);
    if (this.gesture === next) return;
    this.gesture?.fadeOut(FADE);
    next.reset().setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
    next.fadeIn(FADE).play();
    this.base.fadeOut(FADE);
    this.gesture = next;
  }

  private endGesture(): void {
    if (!this.gesture) return;
    this.gesture.fadeOut(FADE);
    this.base.reset().fadeIn(FADE).play();
    this.gesture = null;
  }

  update(dt: number, moving: boolean, climbing = false, running = false, airborne = false): void {
    // shortest-way turn
    let diff = this.heading - this.group.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.group.rotation.y += diff * Math.min(1, dt * 12);

    if (moving && this.gesture) this.endGesture();
    const want = this.action(airborne ? 'Jump_Idle' : moving ? (running ? 'Running_A' : 'Walking_A') : this.idle);
    want.timeScale = climbing ? 0.8 : running ? 1.05 : moving ? 1.75 * this.gait : 1;
    if (want !== this.base) {
      want.reset().fadeIn(FADE).play();
      if (!this.gesture) this.base.fadeOut(FADE);
      this.base = want;
    }

    // give a little wave when left alone for a while
    this.idleFor = moving || this.gesture ? 0 : this.idleFor + dt;
    if (this.waves && this.idleFor > 7) {
      this.idleFor = -6;
      this.play('Waving');
    }

    // the look is laid over the animation each frame, so start from the pose before it
    this.head?.quaternion.copy(this.headRest);
    this.chest?.quaternion.copy(this.chestRest);
    this.mixer.update(dt);

    const frames = dt * 60;
    if (Math.abs(this.tall.to - this.tall.x) > 1e-4 || Math.abs(this.tall.v) > 1e-4) {
      spring(this.tall, this.tall.to, 0.1, 0.32, frames);
      this.stand();
    }
    // the head keeps its shape whatever the height: only the body stretches
    this.head?.scale.set(HEAD_SCALE, HEAD_SCALE / this.tall.x, HEAD_SCALE);

    this.turnHead(frames);
    this.settle(dt);
    if (!this.jacketNow.equals(this.jacketTo)) {
      this.jacketNow.lerp(this.jacketTo, 1 - Math.exp(-dt * 16));
      const r = this.jacketNow.r - this.jacketTo.r;
      const g = this.jacketNow.g - this.jacketTo.g;
      const b = this.jacketNow.b - this.jacketTo.b;
      if (r * r + g * g + b * b < 1e-6) this.jacketNow.copy(this.jacketTo);
      this.paint();
    }
  }

  private turnHead(frames: number): void {
    const { aim, headTurn: h, eyeTurn: e } = this;
    spring(h.x, aim.x, 0.07, 0.3, frames);
    spring(h.y, aim.y, 0.07, 0.3, frames);
    spring(e.x, aim.x, 0.32, 0.6, frames);
    spring(e.y, aim.y, 0.32, 0.6, frames);
    const yaw = h.x.x;
    const pitch = h.y.x;
    // the chest takes a quarter of the turn and the head the rest; a look into a corner tips the
    // head over a touch, the way a curious look does
    if (this.chest) this.chest.quaternion.multiply(q.setFromEuler(euler.set(pitch * 0.25, yaw * 0.28, 0, 'YXZ')));
    if (this.head) this.head.quaternion.multiply(q.setFromEuler(euler.set(pitch * 0.75, yaw * 0.72, -yaw * pitch * 0.4, 'YXZ')));

    if (!this.features) return;
    // the eyes lead: whatever the head hasn't caught up on yet, they make up by sliding across the face
    const gx = (e.x.x - yaw) * 2.4 + e.x.x * 0.5;
    const gy = -((e.y.x - pitch) * 2.6 + e.y.x * 0.6);
    this.features.set(gx, gy, this.lid(frames / 60));
    // a monocle's lens keeps the eye in the middle of it however the eye moves
    const lens = this.worn.get('monocle')?.obj.userData.lens as THREE.Object3D | undefined;
    if (lens) lens.position.set(-0.17 + this.features.gaze.x, 0.5 + this.features.gaze.y, lens.position.z);
  }

  /** How open the eyes are: a blink is 160 ms down and up, now and then twice in a row. */
  private lid(dt: number): number {
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkSince = 0;
      this.blinkIn = Math.random() < 0.18 ? 0.3 : 2.4 + Math.random() * 3.4;
    }
    this.blinkSince += dt;
    let lid = this.blinkSince < 0.16 ? 1 - Math.sin((this.blinkSince / 0.16) * Math.PI) : 1;
    const s = this.swap;
    if (s) {
      s.t += dt;
      const shut = 0.08;
      const open = 0.14;
      if (s.t < shut) lid = Math.min(lid, 1 - s.t / shut);
      else {
        if (!s.done) {
          s.done = true;
          this.drawFace(s.to);
        }
        lid = Math.min(lid, (s.t - shut) / open);
        if (s.t >= shut + open) this.swap = null;
      }
    }
    return THREE.MathUtils.clamp(lid, 0.08, 1);
  }

  /** Move whatever is being put on or taken off along. */
  private settle(dt: number): void {
    if (!this.moves.length) return;
    this.moves = this.moves.filter((m) => {
      m.t += dt * 1000;
      const ms = m.leaving ? LEAVE_MS : ARRIVE[m.slot].ms;
      const u = Math.min(1, m.t / ms);
      this.place(m, u);
      if (u < 1) return true;
      if (m.leaving) this.discard(m.obj);
      return false;
    });
  }
}

const q = new THREE.Quaternion();
const euler = new THREE.Euler();

function hat(style: HatStyle, color: string): THREE.Group {
  const g = new THREE.Group();
  g.position.set(0, 0.86, 0.02);
  g.rotation.x = -0.1;
  const dark = shade(color, 0.78);
  if (style === 'boxy') {
    g.add(box(1.02, 0.07, 1.02, color, FINE));
    const crown = box(0.72, 0.36, 0.72, color, FINE);
    crown.position.y = 0.06;
    g.add(crown);
  } else if (style === 'cap') {
    // a staff cap: a low crown, a darker band, and a peak out over the eyes
    const band = box(0.84, 0.08, 0.92, dark, FINE);
    const crown = box(0.78, 0.2, 0.86, color, FINE);
    crown.position.y = 0.08;
    const peak = box(0.6, 0.04, 0.28, dark, FINE);
    peak.position.set(0, 0, 0.58);
    peak.rotation.x = 0.16;
    g.add(band, crown, peak);
  } else if (style === 'beanie') {
    // pulled down over the ears: a turned-up cuff, a round top, a bobble
    g.position.y = 0.74;
    g.scale.z = 1.14;
    const cuff = cylinder(0.47, 0.47, 0.15, dark);
    const dome = ball(0.45, color, 0.72);
    dome.position.y = 0.13;
    const bobble = ball(0.12, dark);
    bobble.position.y = 0.5;
    g.add(dome, cuff, bobble);
  } else if (style === 'top') {
    // a top hat: a flat brim, a tall crown just narrowing to the top, and a darker band round its foot
    const brim = cylinder(0.6, 0.6, 0.05, color);
    const crown = cylinder(0.38, 0.4, 0.66, color);
    crown.position.y = 0.04;
    const band = cylinder(0.405, 0.405, 0.12, dark);
    band.position.y = 0.05;
    g.add(brim, band, crown);
  } else {
    // bucket: a round crown and a brim that slopes away all round
    const brim = cylinder(0.5, 0.76, 0.14, color);
    brim.position.y = -0.06;
    const crown = cylinder(0.44, 0.52, 0.3, color);
    crown.position.y = 0.08;
    const band = cylinder(0.525, 0.53, 0.08, dark);
    band.position.y = 0.08;
    g.add(brim, band, crown);
  }
  return g;
}

const hairCache = new Map<string, THREE.BufferGeometry>();

/**
 * Hair is the head's own surface, lifted a little way off it and cut along a hairline: it fits
 * whatever shape the head is. A crop stops at the ears, a bob comes down to the jaw.
 */
function hairShell(skull: THREE.BufferGeometry, headAt: THREE.Vector3, long: boolean): THREE.BufferGeometry {
  const key = long ? 'long' : 'short';
  const cached = hairCache.get(key);
  if (cached) return cached;
  const src = skull.index ? skull.toNonIndexed() : skull;
  const from = src.getAttribute('position');
  const fromN = src.getAttribute('normal');
  const low = long ? 0.1 : 0.42;
  const pos: number[] = [];
  const nor: number[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < from.count; i += 3) {
    const tri = [0, 1, 2].map((k) => v.fromBufferAttribute(from, i + k).sub(headAt).clone());
    const y = (tri[0].y + tri[1].y + tri[2].y) / 3;
    const z = (tri[0].z + tri[1].z + tri[2].z) / 3;
    // the back and sides down to the hairline, and the crown forward to a fringe
    if (!((z < 0.14 && y > low) || (y > 0.74 && z < 0.4))) continue;
    for (let k = 0; k < 3; k++) {
      v.fromBufferAttribute(fromN, i + k);
      pos.push(tri[k].x + v.x * 0.035, tri[k].y + v.y * 0.035, tri[k].z + v.z * 0.035);
      nor.push(v.x, v.y, v.z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  hairCache.set(key, geo);
  return geo;
}

function hair(skull: THREE.BufferGeometry, headAt: THREE.Vector3, style: HairStyle, color: string): THREE.Group {
  const g = new THREE.Group();
  const mat = toon({ color });
  mat.side = THREE.DoubleSide;
  const shell = new THREE.Mesh(hairShell(skull, headAt, style === 'bob' || style === 'long'), mat);
  // the shell's geometry is cached and shared: taking the hair off must not throw it away
  shell.userData.shared = true;
  shell.castShadow = true;
  shell.receiveShadow = true;
  g.add(hull(shell));
  if (style === 'bun') {
    const bun = ball(0.17, color);
    bun.position.set(0, 0.5, -0.6);
    g.add(bun);
  } else if (style === 'long') {
    // the bob's shell, the rest falling down the back to the shoulders, and a lock either side
    // that comes down past the jaw, so it reads as long from the front too (set back a little,
    // so earrings still show in front of it)
    const fall = box(0.8, 0.78, 0.2, color, FINE);
    fall.position.set(0, -0.26, -0.5);
    g.add(fall);
    for (const side of [-1, 1]) {
      const lock = box(0.11, 0.62, 0.36, color, FINE);
      lock.position.set(side * 0.43, -0.22, -0.2);
      g.add(lock);
    }
  }
  return g;
}

/**
 * A monocle, drawn on the face the way the eyes are rather than modelled: a thin ink rim with a
 * gold line inside it and a glint of glass, round the figure's right eye (on the left as you look
 * at it). It lies along the face's curve, and its lens rides with the eye as it looks about
 * (`userData.lens`), so the eye always sits in the middle of it.
 */
function monocle(surface: Surface | null): THREE.Group {
  const g = new THREE.Group();
  const x = -0.17;
  const y = 0.5;
  const z = surface ? surface(x, y) : 0.54;
  const lens = new THREE.Group();
  lens.position.set(x, y, z + 0.012);
  if (surface) {
    // square to the face where it sits: the head curves away towards its sides
    const e = 0.02;
    lens.rotation.y = Math.atan2(-(surface(x + e, y) - surface(x - e, y)) / (2 * e), 1);
    lens.rotation.x = Math.atan2((surface(x, y + e) - surface(x, y - e)) / (2 * e), 1);
  }
  const drawn = (color: string, lift: number) =>
    new THREE.MeshBasicMaterial({ color, polygonOffset: true, polygonOffsetFactor: -lift, polygonOffsetUnits: -lift * 2 });
  const ring = (inner: number, outer: number, color: string, lift: number, from = 0, sweep = Math.PI * 2) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 40, 1, from, sweep), drawn(color, lift));
    m.castShadow = false;
    m.raycast = () => {};
    lens.add(m);
  };
  ring(0.074, 0.1, palette.ink, 3);
  ring(0.08, 0.093, palette.yellow, 4);
  // the glint: a short pale arc high on the far side of the glass
  ring(0.052, 0.062, '#fffaf0', 4, 0.35, 0.9);
  g.add(lens);
  g.userData.lens = lens;
  return g;
}

/** A gold drop hanging from each ear, just proud of the head's sides (and of a bob, if there is one). */
function earrings(): THREE.Group {
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    const stud = ball(0.04, palette.yellow);
    stud.position.set(side * 0.475, 0.3, 0.04);
    const drop = ball(0.055, palette.yellow);
    drop.position.set(side * 0.485, 0.2, 0.04);
    g.add(stud, drop);
  }
  return g;
}

/** Square frames, open so the eyes show through. */
function glasses(): THREE.Group {
  const g = new THREE.Group();
  const bar = (w: number, h: number, x: number, y: number) => {
    const m = box(w, h, 0.04, palette.ink, { outline: false });
    m.position.set(x, y, 0);
    g.add(m);
  };
  const W = 0.27;
  const H = 0.2;
  const T = 0.035;
  for (const side of [-1, 1]) {
    const x = side * 0.2;
    bar(W, T, x, 0);
    bar(W, T, x, H - T);
    bar(T, H, x - W / 2 + T / 2, 0);
    bar(T, H, x + W / 2 - T / 2, 0);
  }
  bar(0.14, T, 0, H * 0.55);
  g.position.set(0, 0.42, 0.56);
  return g;
}

function scarf(color: string): THREE.Group {
  const g = new THREE.Group();
  const wrap = box(0.5, 0.15, 0.46, color, FINE);
  wrap.position.set(0, 0.2, 0.01);
  const tail = box(0.15, 0.36, 0.07, color, FINE);
  tail.position.set(0.13, -0.14, 0.24);
  tail.rotation.x = -0.1;
  g.add(wrap, tail);
  return g;
}

function pack(jacket: string): THREE.Group {
  const g = new THREE.Group();
  const bag = box(0.46, 0.5, 0.2, palette.woodDark, FINE);
  bag.position.set(0, -0.36, -0.42);
  const lid = box(0.5, 0.16, 0.24, shade(jacket, 0.72), FINE);
  lid.position.set(0, 0.02, -0.42);
  g.add(bag, lid);
  // straps over the shoulders, so it is plainly worn and not just stuck on
  for (const side of [-1, 1]) {
    const strap = box(0.07, 0.07, 0.56, palette.woodDark, FINE);
    strap.position.set(side * 0.2, 0.2, -0.26);
    g.add(strap);
  }
  return g;
}
