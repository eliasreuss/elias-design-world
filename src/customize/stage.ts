import * as THREE from 'three';
import type { Library } from '../assets/library';
import { Character, type Gesture, type Outfit } from '../player/character';
import { drawAt } from '../style/materials';
import { light, palette } from '../style/palette';
import { PrintFx } from '../style/postfx';
import { box } from '../world/builders';

/**
 * The figure on its own little island, drawn with the world's own pen and paper by a second
 * renderer. It watches the pointer wherever it is on the page.
 *
 * The camera looks on from a little to the right and a little above: near enough face on to read
 * the face, high enough to see the top of the hat.
 */
const VIEW = new THREE.Vector3(0.42, 0.36, 1).normalize();
/** The heading that faces the camera, and how far above the figure's eye line the camera sits. */
const FACING = Math.atan2(VIEW.x, VIEW.z);
const RAISE = Math.atan2(VIEW.y, Math.hypot(VIEW.x, VIEW.z));
/** World units, bottom to top, that the stage always shows: the tallest figure in the tallest hat on its plinth, with air above. */
const FRAME_H = 3.4;
const FRAME_Y = 0.82;
/** …and across, so the plinth's corners never get cut off on a narrow screen. */
const FRAME_W = 2.9;

/**
 * How far away, in pixels, the eye is from the screen. The pointer's offset from the head against
 * this is the angle to look through: a pointer half this far off to the side is a look of about 27°.
 */
const REACH = 560;
/** The body only comes round for a look well off to the side, slowly, and only so far. */
const BODY_SHARE = 0.4;
const BODY_MAX = 0.45;

/** Left alone with the pointer still, it glances off somewhere every so often, and back. */
const GLANCE_AFTER = 5;
const GLANCE_FOR = 0.9;

/** The avatar's picture, in CSS pixels. */
const PORTRAIT = 112;
const PORTRAIT_VIEW = new THREE.Vector3(0.55, 0.6, 1).normalize();

function lights(scene: THREE.Scene, reach: number): void {
  const sun = new THREE.DirectionalLight(light.sun, light.sunIntensity);
  sun.position.set(...light.sunFrom).normalize().multiplyScalar(10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 22 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target, new THREE.HemisphereLight(light.sky, light.ground, light.ambientIntensity));
}

/** A square of the world to stand on: grass on top, earth down the sides, set corner-on to the camera like the islands are. */
function plinth(lib: Library): THREE.Group {
  const g = new THREE.Group();
  const earth = box(1.6, 0.4, 1.6, palette.earth);
  earth.position.y = -0.48;
  const grass = box(1.6, 0.08, 1.6, palette.grass);
  grass.position.y = -0.08;
  g.add(earth, grass);
  const tuft = lib.get('Grass_1_A_Color1', { scale: 0.7 });
  tuft.position.set(0.5, 0, 0.42);
  const rock = lib.get('Rock_1_A_Color1', { scale: 0.4 });
  rock.position.set(-0.52, 0, 0.5);
  g.add(tuft, rock);
  g.rotation.y = FACING + Math.PI / 4;
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as { isLineSegments2?: boolean }).isLineSegments2) return;
    mesh.receiveShadow = true;
  });
  return g;
}

export class Stage {
  readonly canvas = document.createElement('canvas');
  readonly figure: Character;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 60);
  private readonly fx: PrintFx;
  private readonly sitter: Character;
  private readonly portrait = { scene: new THREE.Scene(), camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 60), fx: null as unknown as PrintFx };

  private w = 1;
  private h = 1;
  private viewH = FRAME_H;
  private raf = 0;
  private last = 0;
  private readonly still: boolean;

  /** The pointer in client pixels, or null once it has left the window. */
  private pointer: { x: number; y: number } | null = null;
  private quiet = 0;
  private glance: { x: number; y: number; for: number } | null = null;
  /** A look the figure is told to take for a moment, whatever the pointer is doing. */
  private cue: { x: number; y: number; for: number } | null = null;
  private readonly body = { x: 0, v: 0 };
  /** Called every frame with where the head is on the page, for anything pinned to it. */
  onFrame: ((head: { x: number; y: number }) => void) | null = null;

  private readonly at = new THREE.Vector3();

  constructor(lib: Library, outfit: Outfit, still: boolean) {
    this.still = still;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0xffffff, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    lights(this.scene, 2);
    this.scene.add(plinth(lib));
    this.figure = new Character(lib, { ...outfit, waves: true });
    this.figure.turnTo(FACING);
    this.scene.add(this.figure.group);
    this.fx = new PrintFx(this.renderer, this.scene, this.camera);

    // the avatar's sitter: the same clothes, standing still for its picture
    lights(this.portrait.scene, 1.5);
    this.sitter = new Character(lib, { ...outfit, waves: false });
    this.sitter.turnTo(Math.atan2(PORTRAIT_VIEW.x, PORTRAIT_VIEW.z) - 0.2);
    this.sitter.look(0.12, -0.35, true);
    this.portrait.scene.add(this.sitter.group);
    this.portrait.fx = new PrintFx(this.renderer, this.portrait.scene, this.portrait.camera);

    window.addEventListener('pointermove', this.track, { passive: true });
    window.addEventListener('pointerdown', this.track, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => (this.pointer = null));
  }

  private readonly track = (e: PointerEvent): void => {
    this.pointer = { x: e.clientX, y: e.clientY };
    this.quiet = 0;
    this.glance = null;
  };

  wear(outfit: Outfit, animate: boolean): void {
    this.figure.wear({ ...outfit, waves: true }, animate);
    this.sitter.wear({ ...outfit, waves: false });
  }

  /** Look somewhere for a moment (yaw to its left, pitch down, radians off facing you), then back to the pointer. */
  lookFor(yaw: number, pitch: number, seconds: number): void {
    this.cue = { x: yaw, y: pitch, for: seconds };
  }

  play(gesture: Gesture): void {
    this.figure.play(gesture);
  }

  resize(width: number, height: number): void {
    this.w = Math.max(1, width);
    this.h = Math.max(1, height);
    this.renderer.setSize(this.w, this.h, false);
    this.fx.setSize(this.w, this.h);
    const aspect = this.w / this.h;
    this.viewH = Math.max(FRAME_H, FRAME_W / aspect);
    const half = this.viewH / 2;
    Object.assign(this.camera, { left: -half * aspect, right: half * aspect, top: half, bottom: -half });
    this.camera.position.copy(VIEW).multiplyScalar(20).add(this.at.set(0, FRAME_Y, 0));
    this.camera.lookAt(0, FRAME_Y, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    if (this.raf) this.render(performance.now() / 1000);
  }

  start(): void {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private readonly frame = (now: number): void => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.steer(dt);
    this.figure.update(dt, false);
    this.render(now / 1000);
    this.raf = requestAnimationFrame(this.frame);
  };

  private render(time: number): void {
    drawAt(this.w, this.h, this.h / this.viewH, () => this.fx.render(this.still ? 0 : time));
  }

  /** Where a point in the scene lands on the page, in client pixels. */
  private onPage(p: THREE.Vector3, out: { x: number; y: number }): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const s = this.at.copy(p).project(this.camera);
    out.x = r.left + ((s.x + 1) / 2) * r.width;
    out.y = r.top + ((1 - s.y) / 2) * r.height;
    return out;
  }

  private readonly head = { x: 0, y: 0 };

  private steer(dt: number): void {
    const head = this.onPage(this.figure.headPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.3, 0)), this.head);
    this.onFrame?.(head);

    // facing you is looking up at the camera a little, not straight ahead past it
    let yaw = 0;
    let pitch = -RAISE * 0.8;
    if (this.pointer) {
      yaw = Math.atan2(this.pointer.x - head.x, REACH);
      pitch = Math.atan2(this.pointer.y - head.y, REACH) - RAISE * 0.8;
      this.quiet += dt;
      if (!this.glance && this.quiet > GLANCE_AFTER) {
        const a = Math.random() * Math.PI * 2;
        this.glance = { x: Math.cos(a) * 0.6, y: Math.sin(a) * 0.3 - 0.1, for: GLANCE_FOR };
        this.quiet = 0;
      }
    }
    for (const look of [this.glance, this.cue]) {
      if (!look) continue;
      look.for -= dt;
      yaw = look.x;
      pitch = look.y;
    }
    if (this.glance && this.glance.for <= 0) this.glance = null;
    if (this.cue && this.cue.for <= 0) this.cue = null;
    yaw = THREE.MathUtils.clamp(yaw, -1.25, 1.25);
    pitch = THREE.MathUtils.clamp(pitch, -0.75, 0.55);

    const target = THREE.MathUtils.clamp(yaw * BODY_SHARE, -BODY_MAX, BODY_MAX);
    if (this.still) this.body.x = target;
    else {
      const f = dt * 60;
      this.body.v += ((target - this.body.x) * 0.025 - this.body.v * 0.2) * f;
      this.body.x += this.body.v * f;
    }
    this.figure.turnTo(FACING + this.body.x);
    this.figure.look(yaw - this.body.x, pitch, this.still);
  }

  /** Whether a point on the page is on the figure: from its feet to the top of its hat, a shoulder either side. */
  hits(x: number, y: number): boolean {
    const feet = this.onPage(this.figure.group.position, { x: 0, y: 0 });
    const top = this.onPage(this.figure.headPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.75, 0)), { x: 0, y: 0 });
    const half = (this.h / this.viewH) * 0.42;
    return y > top.y && y < feet.y && Math.abs(x - (feet.x + top.x) / 2) < half;
  }

  /**
   * The avatar's picture: head and shoulders, from a little higher up. Drawn on this same canvas at
   * the picture's size, read off, and put straight back, all before the page next paints.
   */
  snapshot(): string {
    const { scene, camera, fx } = this.portrait;
    this.sitter.update(1 / 60, false);
    const head = this.sitter.headPosition(new THREE.Vector3());
    const look = head.clone().add(new THREE.Vector3(0, 0.34, 0));
    const half = 0.62;
    Object.assign(camera, { left: -half, right: half, top: half, bottom: -half });
    camera.position.copy(PORTRAIT_VIEW).multiplyScalar(20).add(look);
    camera.lookAt(look);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    scene.updateMatrixWorld();

    this.renderer.setSize(PORTRAIT, PORTRAIT, false);
    fx.setSize(PORTRAIT, PORTRAIT);
    drawAt(PORTRAIT, PORTRAIT, PORTRAIT / (half * 2), () => fx.render(0));
    const url = this.canvas.toDataURL('image/png');
    this.renderer.setSize(this.w, this.h, false);
    this.fx.setSize(this.w, this.h);
    if (this.raf) this.render(performance.now() / 1000);
    return url;
  }

  /** Get the shaders built before the stage is first shown, so opening it doesn't stall. */
  warm(): void {
    this.renderer.compile(this.scene, this.camera);
  }
}
