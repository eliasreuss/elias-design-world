import * as THREE from 'three';
import { fill, hull, inkLines, outline, toon } from '../style/materials';
import { light, palette } from '../style/palette';
import type { Plot } from './plot';

// Reusable primitives. Unless noted, each object's origin is at the centre of
// its base, +y is up, and it is already filled and inked.

export interface BoxOptions {
  outline?: boolean;
  /** Outline width in pixels, for small details that want a finer pen. */
  line?: number;
}

const FINE: BoxOptions = { line: 1.1 };

export function box(w: number, h: number, d: number, color: string, opts: BoxOptions = {}): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, h / 2, 0);
  const mesh = new THREE.Mesh(geo, fill(color));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (opts.outline !== false) outline(mesh, opts.line);
  return mesh;
}

/** Box given by its world extents. */
export function block(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  color: string,
  opts: BoxOptions = {},
): THREE.Mesh {
  const mesh = box(x1 - x0, y1 - y0, z1 - z0, color, opts);
  mesh.position.set((x0 + x1) / 2, y0, (z0 + z1) / 2);
  return mesh;
}

/** Flat horizontal rectangle given by its world extents. */
export function plane(
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y: number,
  color: string,
  opts: BoxOptions = {},
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, fill(color));
  mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  mesh.receiveShadow = true;
  if (opts.outline !== false) outline(mesh);
  return mesh;
}

export function disc(radius: number, color: string): THREE.Mesh {
  const geo = new THREE.CircleGeometry(radius, 40);
  geo.rotateX(-Math.PI / 2);
  return outline(new THREE.Mesh(geo, fill(color)));
}

export function cylinder(rTop: number, rBottom: number, h: number, color: string): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, h, 28);
  geo.translate(0, h / 2, 0);
  const mesh = new THREE.Mesh(geo, fill(color));
  outline(mesh);
  return hull(mesh);
}

export function ball(radius: number, color: string, squash = 1): THREE.Mesh {
  const geo = new THREE.SphereGeometry(radius, 28, 18);
  if (squash !== 1) {
    geo.scale(1, squash, 1);
    geo.computeVertexNormals();
  }
  return hull(new THREE.Mesh(geo, fill(color)));
}

export interface Hole {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Frame colour. Adds a framed, glazed window. Omit for a bare opening. */
  frame?: string;
}

/**
 * Wall running along +x from the origin, `thick` deep along +z.
 * Holes with y = 0 are door openings, anything else is a window opening.
 */
export function wall(length: number, height: number, thick: number, color: string, holes: Hole[] = []): THREE.Group {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  const doors = holes.filter((h) => h.y <= 0).sort((a, b) => a.x - b.x);
  const windows = holes.filter((h) => h.y > 0);

  shape.moveTo(0, 0);
  for (const d of doors) {
    shape.lineTo(d.x, 0);
    shape.lineTo(d.x, d.h);
    shape.lineTo(d.x + d.w, d.h);
    shape.lineTo(d.x + d.w, 0);
  }
  shape.lineTo(length, 0);
  shape.lineTo(length, height);
  shape.lineTo(0, height);
  shape.closePath();

  for (const w of windows) {
    const path = new THREE.Path();
    path.moveTo(w.x, w.y);
    path.lineTo(w.x + w.w, w.y);
    path.lineTo(w.x + w.w, w.y + w.h);
    path.lineTo(w.x, w.y + w.h);
    path.closePath();
    shape.holes.push(path);
  }

  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  group.add(outline(new THREE.Mesh(geo, fill(color))));

  for (const w of windows) {
    if (!w.frame) continue;
    const win = windowFrame(w.w, w.h, thick + 0.06, w.frame);
    win.position.set(w.x + w.w / 2, w.y, thick / 2);
    group.add(win);
  }
  return group;
}

/** Framed, glazed window in the XY plane, centred on x and z, base at y = 0. */
export function windowFrame(w: number, h: number, depth: number, color: string): THREE.Group {
  const g = new THREE.Group();
  const bar = 0.07;
  const pane = box(w - bar, h - bar, 0.02, palette.glass, { outline: false });
  pane.position.y = bar / 2;
  g.add(pane);

  const add = (bw: number, bh: number, x: number, y: number, d = depth) => {
    const b = box(bw, bh, d, color);
    b.position.set(x, y, 0);
    g.add(b);
  };
  add(w, bar, 0, 0);
  add(w, bar, 0, h - bar);
  add(bar, h - 2 * bar, -w / 2 + bar / 2, bar);
  add(bar, h - 2 * bar, w / 2 - bar / 2, bar);
  // mullions
  add(bar * 0.7, h - 2 * bar, 0, bar, depth * 0.7);
  add(w - 2 * bar, bar * 0.7, 0, h * 0.55, depth * 0.7);
  return g;
}

/** Steps rising along +x, `width` deep along +z, origin at the bottom front corner. */
export function stairs(steps: number, rise: number, run: number, width: number, color: string): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  for (let i = 0; i < steps; i++) {
    shape.lineTo(i * run, (i + 1) * rise);
    shape.lineTo((i + 1) * run, (i + 1) * rise);
  }
  shape.lineTo(steps * run, 0);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  return outline(new THREE.Mesh(geo, fill(color)));
}

/** Vertical ladder, `width` across z. Rotate about z to lean it. */
export function ladder(length: number, width: number, color: string): THREE.Group {
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    const rail = box(0.05, length, 0.06, color, FINE);
    rail.position.z = (side * width) / 2;
    g.add(rail);
  }
  const rungs = Math.floor(length / 0.3);
  for (let i = 1; i <= rungs; i++) {
    const rung = box(0.04, 0.04, width - 0.06, color, FINE);
    rung.position.y = (i * length) / (rungs + 1);
    g.add(rung);
  }
  return g;
}

export function table(w: number, h: number, d: number, color: string): THREE.Group {
  const g = new THREE.Group();
  const top = box(w, 0.08, d, color);
  top.position.y = h - 0.08;
  g.add(top);
  const leg = 0.08;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const l = box(leg, h - 0.08, leg, color);
      l.position.set(sx * (w / 2 - leg), 0, sz * (d / 2 - leg));
      g.add(l);
    }
  }
  return g;
}

/** Wooden crate with plank lines on the visible faces. */
export function crate(w: number, h: number, d: number, color: string): THREE.Mesh {
  const mesh = box(w, h, d, color);
  const x = w / 2;
  const z = d / 2;
  const seg: number[] = [];
  for (const t of [1 / 3, 2 / 3]) {
    const y = h * t;
    seg.push(x, y, -z, x, y, z); // right face
    seg.push(-x, y, z, x, y, z); // left face
    const tx = -x + w * t;
    seg.push(tx, h, -z, tx, h, z); // top
  }
  mesh.add(inkLines(seg, 1));
  return mesh;
}

export function tree(kind: 'round' | 'cone', height: number, color: string): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'round') {
    const r = height * 0.3;
    g.add(cylinder(0.08, 0.1, height - r, palette.trunk));
    const crown = ball(r, color, 0.95);
    crown.position.y = height - r;
    g.add(crown);
  } else {
    const trunkH = height * 0.12;
    g.add(cylinder(0.07, 0.08, trunkH + 0.05, palette.trunk));
    // blunt tip: a true cone apex makes the silhouette outline splay out
    const geo = new THREE.CylinderGeometry(0.035, height * 0.17, height - trunkH, 28);
    geo.translate(0, (height - trunkH) / 2 + trunkH, 0);
    const crown = new THREE.Mesh(geo, fill(color));
    outline(crown);
    g.add(hull(crown));
  }
  return g;
}

export interface Door {
  group: THREE.Group;
  pivot: THREE.Group;
}

/** Door in its own frame, 1 unit wide along +x, 0.2 deep along +z. Hinged at the left. */
export function door(color: string, frameColor: string): Door {
  const group = new THREE.Group();
  const h = 2.1;
  const post = 0.08;
  for (const x of [post / 2, 1 - post / 2]) {
    const p = box(post, h, 0.2, frameColor);
    p.position.set(x, 0, 0.1);
    group.add(p);
  }
  const lintel = box(1 - 2 * post, post, 0.2, frameColor);
  lintel.position.set(0.5, h - post, 0.1);
  group.add(lintel);

  const pivot = new THREE.Group();
  pivot.position.set(post, 0, 0.1);
  const pw = 1 - 2 * post;
  const panel = box(pw, h - post, 0.06, color);
  panel.position.x = pw / 2;
  pivot.add(panel);
  for (const z of [0.045, -0.045]) {
    const knob = box(0.05, 0.12, 0.03, palette.yellow);
    knob.position.set(pw - 0.12, 0.95, z);
    pivot.add(knob);
  }
  group.add(pivot);
  return { group, pivot };
}

/** Railing along +x from the origin. */
export function railing(length: number, height: number, color: string): THREE.Group {
  const g = new THREE.Group();
  const posts = Math.max(2, Math.round(length / 0.9) + 1);
  for (let i = 0; i < posts; i++) {
    const p = box(0.04, height, 0.04, color, FINE);
    p.position.x = (i * length) / (posts - 1);
    g.add(p);
  }
  for (const y of [height - 0.04, height * 0.5]) {
    const r = box(length, 0.04, 0.03, color, FINE);
    r.position.set(length / 2, y, 0);
    g.add(r);
  }
  return g;
}

/** Small sitting cat facing +z. */
export function cat(color: string): THREE.Group {
  const g = new THREE.Group();
  const body = box(0.16, 0.24, 0.22, color, FINE);
  g.add(body);
  const head = box(0.17, 0.15, 0.15, color, FINE);
  head.position.set(0, 0.22, 0.06);
  g.add(head);
  for (const sx of [-1, 1]) {
    const ear = box(0.05, 0.06, 0.04, color, FINE);
    ear.position.set(sx * 0.055, 0.37, 0.06);
    g.add(ear);
  }
  const tail = box(0.035, 0.3, 0.035, color, FINE);
  tail.position.set(0.04, 0.02, -0.13);
  tail.rotation.x = -0.35;
  g.add(tail);
  return g;
}

export interface WalkingCat {
  group: THREE.Group;
  /** Front left, front right, back left, back right: each hinged at the hip, so turning it about x swings it. */
  legs: THREE.Mesh[];
  /** Hinged where it leaves the body. */
  tail: THREE.Mesh;
}

/** The same cat on its feet, facing +z, with legs and a tail that can be moved. */
export function walkingCat(color: string): WalkingCat {
  const g = new THREE.Group();
  const body = box(0.15, 0.15, 0.36, color, FINE);
  body.position.y = 0.13;
  g.add(body);
  const head = box(0.17, 0.15, 0.15, color, FINE);
  head.position.set(0, 0.21, 0.23);
  g.add(head);
  for (const sx of [-1, 1]) {
    const ear = box(0.05, 0.06, 0.04, color, FINE);
    ear.position.set(sx * 0.055, 0.36, 0.23);
    g.add(ear);
  }
  const legs = [0.13, -0.13].flatMap((z) =>
    [-1, 1].map((sx) => {
      const leg = box(0.045, 0.15, 0.045, color, FINE);
      leg.geometry.translate(0, -0.15, 0);
      leg.position.set(sx * 0.05, 0.15, z);
      g.add(leg);
      return leg;
    }),
  );
  const tail = box(0.035, 0.3, 0.035, color, FINE);
  tail.position.set(0, 0.24, -0.17);
  tail.rotation.x = -0.6;
  g.add(tail);
  return { group: g, legs, tail };
}

// ------------------------------------------------------------- the islands

/** A chunk of land given by its world extents: turf on top, earth below, tapering as it goes down. */
export function island(x0: number, x1: number, z0: number, z1: number): THREE.Group {
  const g = new THREE.Group();
  g.add(block(x0, x1, -0.9, 0, z0, z1, palette.earth));
  g.add(block(x0 + 0.8, x1 - 0.8, -1.7, -0.9, z0 + 0.8, z1 - 0.8, palette.earthDeep));
  g.add(plane(x0, x1, z0, z1, 0.004, palette.grass));
  return g;
}

/** Plank bridge running along +x from the origin, centred on z, deck at y = 0. */
export function bridge(length: number, width: number): THREE.Group {
  const g = new THREE.Group();
  const planks = Math.round(length / 0.36);
  const step = length / planks;
  for (let i = 0; i < planks; i++) {
    const plank = box(step - 0.07, 0.07, width, palette.wood, FINE);
    plank.position.set(step * (i + 0.5), -0.07, 0);
    // laid by hand: no two planks quite square
    plank.rotation.y = (((i * 37) % 7) - 3) * 0.012;
    g.add(plank);
  }
  const edge = width / 2 - 0.06;
  for (const side of [-1, 1]) {
    const beam = box(length, 0.1, 0.1, palette.woodDark, FINE);
    beam.position.set(length / 2, -0.17, side * (edge - 0.1));
    g.add(beam);
    for (const x of [0.1, length - 0.1]) {
      const post = box(0.11, 1.05, 0.11, palette.woodDark, FINE);
      post.position.set(x, -0.1, side * edge);
      g.add(post);
    }
    // two ropes a side, sagging to the middle
    for (const y of [0.82, 0.44]) {
      const half = length / 2 - 0.1;
      const sag = 0.16;
      for (const dir of [-1, 1]) {
        const rope = box(Math.hypot(half, sag), 0.035, 0.035, palette.trunk, FINE);
        rope.geometry.translate(0, -0.0175, 0);
        rope.position.set(length / 2 + (dir * half) / 2, y - sag / 2, side * edge);
        rope.rotation.z = dir * Math.atan2(sag, half);
        g.add(rope);
      }
    }
  }
  return g;
}

export interface LetteringOptions {
  /** A CSS font family that the page has already loaded. */
  family?: string;
  weight?: number;
  color?: string;
  /** Extra space between letters, in ems. */
  tracking?: number;
}

export const SIGN_FONT = "'Hanken Grotesk Variable', 'Helvetica Neue', Arial, sans-serif";
export const TITLE_FONT = "'Besley Variable', Georgia, serif";

/**
 * Words painted on a see-through plane. Faces +z, centred on x, base at y = 0, `height` tall
 * (that is the line height: capitals come out at about 0.7 of it). `userData.width` is how wide it came out.
 */
export function lettering(text: string, height: number, opts: LetteringOptions = {}): THREE.Mesh {
  const px = 128;
  const font = `${opts.weight ?? 700} ${px}px ${opts.family ?? SIGN_FONT}`;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const spacing = `${(opts.tracking ?? 0) * px}px`;
  const setUp = () => {
    ctx.font = font;
    // not in every browser yet; the words just sit a little closer without it
    (ctx as unknown as { letterSpacing: string }).letterSpacing = spacing;
  };
  setUp();
  const pad = px * 0.15;
  canvas.width = Math.ceil(ctx.measureText(text).width + pad * 2);
  canvas.height = px;
  setUp();
  ctx.fillStyle = opts.color ?? palette.ink;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, pad, px * 0.8);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const width = (canvas.width / canvas.height) * height;
  const geo = new THREE.PlaneGeometry(width, height);
  geo.translate(0, height / 2, 0);
  // unlit, like the pen lines: paint does not shade
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map, alphaTest: 0.5 }));
  mesh.userData.noShadow = true;
  mesh.userData.width = width;
  mesh.raycast = () => {};
  return mesh;
}

/** A board on two posts, facing +z, centred on x. `note` is a smaller second line. */
export function sign(title: string, note = '', color: string = palette.paper): THREE.Group {
  const g = new THREE.Group();
  const w = 2.5;
  const h = note ? 1.12 : 0.78;
  const base = 0.85;
  for (const side of [-1, 1]) {
    const post = box(0.09, base + h - 0.1, 0.09, palette.woodDark, FINE);
    post.position.set(side * (w / 2 - 0.28), 0, -0.05);
    g.add(post);
  }
  const board = box(w, h, 0.07, color);
  board.position.set(0, base, 0.035);
  g.add(board);

  const fit = (mesh: THREE.Mesh) => {
    const over = (mesh.userData.width as number) / (w - 0.3);
    if (over > 1) mesh.scale.setScalar(1 / over);
    return mesh;
  };
  const head = fit(lettering(title.toUpperCase(), 0.5, { weight: 800, tracking: 0.02 }));
  head.position.set(0, base + h - 0.56 * head.scale.y - 0.06, 0.08);
  g.add(head);
  if (note) {
    const sub = fit(lettering(note, 0.3, { weight: 600 }));
    sub.position.set(0, base + 0.14, 0.08);
    g.add(sub);
  }
  return g;
}

/** Placeholder art: a few flat shapes, as [x, y, w, h, colour, turn] in fractions of the canvas, centred. */
type Shape = [number, number, number, number, string, number?];
const ART: Shape[][] = [
  [
    [-0.2, 0.12, 0.34, 0.5, palette.blue],
    [0.08, -0.22, 0.6, 0.12, palette.red, 0.4],
    [0.26, 0.2, 0.16, 0.44, palette.yellow],
  ],
  [
    [-0.28, -0.14, 0.14, 0.4, palette.red],
    [-0.08, -0.04, 0.14, 0.6, palette.yellow],
    [0.12, -0.2, 0.14, 0.28, palette.blue],
    [0.32, 0.0, 0.14, 0.68, palette.leaf],
  ],
  [
    [0, 0.18, 0.74, 0.3, palette.yellow],
    [-0.2, -0.2, 0.34, 0.3, palette.blue],
    [0.2, -0.2, 0.34, 0.3, palette.red],
  ],
  [
    [-0.08, 0.02, 0.5, 0.5, palette.red, 0.78],
    [0.24, -0.24, 0.3, 0.1, palette.ink],
    [0.24, 0.26, 0.3, 0.1, palette.blue],
  ],
  [
    [-0.22, 0, 0.28, 0.72, palette.leaf],
    [0.14, 0.2, 0.36, 0.1, palette.ink],
    [0.14, 0.02, 0.36, 0.1, palette.red],
    [0.07, -0.16, 0.22, 0.1, palette.yellow],
  ],
  [
    [0, -0.18, 0.76, 0.26, palette.blue],
    [-0.16, 0.16, 0.2, 0.2, palette.yellow, 0.78],
    [0.2, 0.14, 0.26, 0.34, palette.red],
  ],
];

/** A framed canvas for a wall. Faces +z with its back at z = 0, centred on x, base at y = 0. */
export function picture(w: number, h: number, art: number, frame: string = palette.woodDark): THREE.Group {
  const g = new THREE.Group();
  const rim = 0.1;
  const outer = box(w, h, 0.1, frame);
  outer.position.z = 0.05;
  g.add(outer);
  const cw = w - rim * 2;
  const ch = h - rim * 2;
  const canvas = box(cw, ch, 0.02, palette.paper, FINE);
  canvas.position.set(0, rim, 0.105);
  g.add(canvas);
  for (const [x, y, sw, sh, color, turn = 0] of ART[art % ART.length]) {
    const side = Math.min(cw, ch);
    // squares stay square whatever shape the canvas is
    const pw = turn ? sw * side : sw * cw;
    const ph = turn ? sh * side : sh * ch;
    const shape = box(pw, ph, 0.015, color, { line: 1 });
    shape.geometry.translate(0, -ph / 2, 0);
    shape.position.set(x * cw, rim + ch / 2 + y * ch, 0.125);
    shape.rotation.z = turn;
    g.add(shape);
  }
  return g;
}

// ------------------------------------------------------------ light and cloth

let glowing: THREE.MeshToonMaterial | null = null;
/** A lit lampshade: the one surface that gives light rather than taking it. Shared, so every lamp burns alike. */
export function glow(): THREE.MeshToonMaterial {
  if (!glowing) {
    glowing = toon({ color: palette.lampOff, emissive: light.lamp });
    glowing.emissiveIntensity = 0.55;
  }
  return glowing;
}

let coneTexture: THREE.CanvasTexture | null = null;
/** One soft cone of light, brightest under the lamp and gone by the foot, with feathered sides. */
function cone(): THREE.CanvasTexture {
  if (coneTexture) return coneTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const smooth = (e0: number, e1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < size; y++) {
    const down = y / (size - 1);
    // narrow at the lamp, spreading as it falls
    const half = 0.36 + down * 0.14;
    const fall = (1 - down) ** 1.2 * smooth(0, 0.06, down);
    for (let x = 0; x < size; x++) {
      const across = Math.abs(x / (size - 1) - 0.5);
      const a = fall * (1 - smooth(half * 0.55, half, across));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  coneTexture = new THREE.CanvasTexture(canvas);
  return coneTexture;
}

/**
 * Lamplight falling down a wall: a single soft wash, `w` wide at its foot and `h` tall, hanging from y = h.
 * Faces +z. Flat and see-through, like a glaze of gouache; never casts, never clicks.
 */
export function wash(w: number, h: number, opacity: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0);
  const mat = new THREE.MeshBasicMaterial({ color: light.wash, map: cone(), transparent: true, opacity, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.noShadow = true;
  mesh.raycast = () => {};
  return mesh;
}

/** A street lamp: a post with a lit lantern on top. Origin at the foot. */
export function lampPost(height = 2.1): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.22, 0.12, 0.22, palette.metal, FINE));
  const post = box(0.08, height, 0.08, palette.metal, FINE);
  g.add(post);
  const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.3).translate(0, 0.17, 0), glow());
  outline(lantern, FINE.line);
  lantern.position.y = height;
  g.add(lantern);
  const cap = box(0.4, 0.06, 0.4, palette.metal, FINE);
  cap.position.y = height + 0.34;
  g.add(cap);
  return g;
}

/**
 * A rug given by its extents, lying just above the floor at `y`: a deep border, a pale pinstripe, a field
 * with a second frame inside it, and a fringe on the two short ends.
 */
export function rug(x0: number, x1: number, z0: number, z1: number, y: number, field: string, border: string, trim: string): THREE.Group {
  const g = new THREE.Group();
  g.add(plane(x0, x1, z0, z1, y, border));
  const a = 0.3;
  g.add(plane(x0 + a, x1 - a, z0 + a, z1 - a, y + 0.004, trim, { outline: false }));
  const b = a + 0.07;
  g.add(plane(x0 + b, x1 - b, z0 + b, z1 - b, y + 0.008, field, { outline: false }));
  // an old rug's pattern: a second frame inside the field
  const c = b + 0.32;
  g.add(plane(x0 + c, x1 - c, z0 + c, z1 - c, y + 0.012, border, { outline: false }));
  g.add(plane(x0 + c + 0.07, x1 - c - 0.07, z0 + c + 0.07, z1 - c - 0.07, y + 0.016, field, { outline: false }));
  // the fringe runs off whichever two ends are shorter
  const alongX = x1 - x0 >= z1 - z0;
  const ticks: number[] = [];
  const [lo, hi] = alongX ? [z0, z1] : [x0, x1];
  for (let t = lo + 0.06; t < hi; t += 0.12) {
    for (const [end, out] of alongX ? [[x0, -1], [x1, 1]] : [[z0, -1], [z1, 1]]) {
      if (alongX) ticks.push(end, y, t, end + out * 0.13, y, t);
      else ticks.push(t, y, end, t, y, end + out * 0.13);
    }
  }
  g.add(inkLines(ticks, 1));
  return g;
}

/**
 * Paving given by its extents: `nx` by `nz` flagstones with grass in the joints, each drawn round with a
 * fine pen. `inset` pulls every stone in from its neighbours; more of it reads as stepping stones.
 */
export function paving(x0: number, x1: number, z0: number, z1: number, nx: number, nz: number, inset = 0.07): THREE.Group {
  const g = new THREE.Group();
  const w = (x1 - x0) / nx;
  const d = (z1 - z0) / nz;
  const pen: number[] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const [a, b, c, e] = [x0 + i * w + inset / 2, x0 + (i + 1) * w - inset / 2, z0 + j * d + inset / 2, z0 + (j + 1) * d - inset / 2];
      g.add(plane(a, b, c, e, 0.008, palette.pavement, { outline: false }));
      pen.push(a, 0, c, b, 0, c, b, 0, c, b, 0, e, b, 0, e, a, 0, e, a, 0, e, a, 0, c);
    }
  }
  const lines = inkLines(pen, 0.9);
  lines.position.y = 0.011;
  g.add(lines);
  return g;
}

/**
 * A volleyball, centred on its own middle: eighteen panels, three strips to each of six sides, every
 * side's strips running square to its neighbours', in the old indoor colours with the seams inked.
 */
export function volleyball(radius: number): THREE.Mesh {
  const colors = [palette.blue, palette.plaster, palette.yellow].map((c) => new THREE.Color(c));
  const position: number[] = [];
  const normal: number[] = [];
  const color: number[] = [];
  const index: number[] = [];
  const seams: number[] = [];
  const axis = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  const p = new THREE.Vector3();
  // a side of the cube blown up onto the ball; angles rather than lengths, so the three strips come out equal
  const at = (n: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, a: number, b: number) =>
    p.copy(n).addScaledVector(u, Math.tan(a)).addScaledVector(v, Math.tan(b)).normalize();
  const Q = Math.PI / 4;
  const ALONG = 12;
  const ACROSS = 3;
  for (let k = 0; k < 3; k++) {
    for (const side of [1, -1]) {
      const n = axis[k].clone().multiplyScalar(side);
      const u = axis[(k + 1) % 3];
      const v = axis[(k + 2) % 3].clone().multiplyScalar(side);
      for (let strip = 0; strip < 3; strip++) {
        const b0 = -Q + (strip * Q * 2) / 3;
        const b1 = b0 + (Q * 2) / 3;
        const first = position.length / 3;
        for (let i = 0; i <= ALONG; i++) {
          for (let j = 0; j <= ACROSS; j++) {
            at(n, u, v, -Q + (i / ALONG) * Q * 2, b0 + (j / ACROSS) * (b1 - b0));
            normal.push(p.x, p.y, p.z);
            position.push(p.x * radius, p.y * radius, p.z * radius);
            color.push(colors[strip].r, colors[strip].g, colors[strip].b);
          }
        }
        for (let i = 0; i < ALONG; i++) {
          for (let j = 0; j < ACROSS; j++) {
            const a = first + i * (ACROSS + 1) + j;
            const b = a + ACROSS + 1;
            index.push(a, b, a + 1, a + 1, b, b + 1);
          }
        }
        // the seam along this strip's far edge; the last one is the side's own edge, shared with a neighbour
        for (let i = 0; i < ALONG; i++) {
          for (const t of [i, i + 1]) {
            at(n, u, v, -Q + (t / ALONG) * Q * 2, b1).multiplyScalar(radius * 1.004);
            seams.push(p.x, p.y, p.z);
          }
        }
      }
      for (let i = 0; i < ALONG; i++) {
        for (const t of [i, i + 1]) {
          at(n, u, v, -Q + (t / ALONG) * Q * 2, -Q).multiplyScalar(radius * 1.004);
          seams.push(p.x, p.y, p.z);
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  geo.setIndex(index);
  const leather = toon();
  leather.vertexColors = true;
  const mesh = new THREE.Mesh(geo, leather);
  mesh.add(inkLines(seams, 1));
  return hull(mesh);
}

/** A lamp that is on: its own copy of the model's materials, glowing, and a warm light where the bulb is. */
export function lit(plot: Plot, lamp: THREE.Object3D, x: number, y: number, z: number, strength: number, reach: number): THREE.PointLight {
  lamp.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const mat = mesh.material as THREE.MeshToonMaterial | undefined;
    if (!mesh.isMesh || !mat?.isMeshToonMaterial) return;
    const own = mat.clone();
    own.onBeforeCompile = mat.onBeforeCompile;
    own.customProgramCacheKey = mat.customProgramCacheKey;
    own.emissive.set(light.lamp);
    own.emissiveIntensity = 0.4;
    mesh.material = own;
  });
  return plot.add(new THREE.PointLight(light.lamp, strength, reach, 1.6), x, y, z);
}
