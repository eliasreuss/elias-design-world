import * as THREE from 'three';
import { palette } from '../style/palette';
import { block, box, door, island, plane, railing, sign, wall } from './builders';
import { autoDoor } from './doors';
import { fadeable } from './fade';
import type { Choice, Place, Plot } from './plot';

// The lab: the island for smaller projects and experiments. Scaffolding for now: a
// two-storey tower, cut open, with a working lift up its side and nothing in it yet. The roof
// is a deck: the lift goes on up to it, and the zip line to the house starts there.
// Layout in metres, in the island's own coordinates: +x runs to screen right, +z to screen left.
export const LAB = { x0: 0, x1: 14.5, z0: 0, z1: 8.5 };
/** Where the bridge from the museum lands, along the island's near edge. */
export const LAB_BRIDGE_X = 1.0;

const TOWER = { x0: 5.15, x1: 9.95, z0: 1.3, z1: 6.1 };
export const STOREY = 3.0;
const STOREYS = 2;
const TOP = STOREY * STOREYS + 0.6;
const STUB_H = 0.5;
const T = 0.2; // wall thickness
const DOOR_X = 5.85;
/** The roof deck, and the box in its near corner you step off to ride the zip line: `h` is how high it stands. */
export const LAB_ROOF_Y = STOREY * STOREYS;
export const LAB_ZIP = { x: 5.85, z: 5.4, h: 1.0 };
/** The lift runs up the outside of the tower's right-hand face. */
const LIFT = { x0: 10.15, x1: 11.35, z0: 3.0, z1: 4.4 };

/**
 * `levels` are the level numbers the world has given the storeys and the roof, ground first.
 * `mast` is where the zip line is made fast, in the island's own coordinates.
 */
export function buildLab(plot: Plot, levels: number[], mast: THREE.Vector3): { place: Place } {
  const root = plot.root;
  const [GROUND] = levels;

  // ---------------------------------------------------------------- ground
  root.add(island(LAB.x0, LAB.x1, LAB.z0, LAB.z1));
  plot.floor(GROUND, LAB.x0, LAB.x1, LAB.z0, LAB.z1);
  const path = (x0: number, x1: number, z0: number, z1: number) => root.add(plane(x0, x1, z0, z1, 0.008, palette.pavement, { outline: false }));
  path(LAB_BRIDGE_X - 0.7, LAB_BRIDGE_X + 0.7, 7.7, LAB.z1);
  path(LAB_BRIDGE_X - 0.7, DOOR_X + 1.15, 6.9, 7.7);
  path(DOOR_X - 0.15, DOOR_X + 1.15, TOWER.z1 + T, 6.9);

  // ----------------------------------------------------- tower (cut open)
  // the two far walls run the full height, a window to each storey
  const windows = (length: number) =>
    Array.from({ length: STOREYS }, (_, k) => ({ x: length / 2 - 0.7, y: k * STOREY + 1.15, w: 1.4, h: 1.2, frame: palette.blue }));
  const far = wall(TOWER.x1 - TOWER.x0 + T, TOP, T, palette.blueLight, windows(TOWER.x1 - TOWER.x0 + T));
  plot.add(far, TOWER.x0 - T, 0, TOWER.z0 - T);
  root.add(plane(TOWER.x0 - T, TOWER.x1, TOWER.z0 - T, TOWER.z0, TOP + 0.004, palette.wallCut, { outline: false }));
  const left = wall(TOWER.z1 - TOWER.z0, TOP, T, palette.blueLight, windows(TOWER.z1 - TOWER.z0));
  left.rotation.y = -Math.PI / 2;
  plot.add(left, TOWER.x0, 0, TOWER.z0);
  root.add(plane(TOWER.x0 - T, TOWER.x0, TOWER.z0, TOWER.z1, TOP + 0.004, palette.wallCut, { outline: false }));
  // nobody walks behind them: you would lose them
  plot.solid(GROUND, LAB.x0, TOWER.x0, LAB.z0, TOWER.z1);
  plot.solid(GROUND, LAB.x0, LAB.x1, LAB.z0, TOWER.z0);

  root.add(plane(TOWER.x0, TOWER.x1 + T, TOWER.z0, TOWER.z1 + T, 0.008, palette.floor));
  const stub = (x0: number, x1: number, z0: number, z1: number) => {
    root.add(block(x0, x1, 0, STUB_H, z0, z1, palette.blueLight));
    root.add(plane(x0, x1, z0, z1, STUB_H + 0.004, palette.wallCut, { outline: false }));
    plot.solid(GROUND, x0, x1, z0, z1);
  };
  stub(TOWER.x0, DOOR_X, TOWER.z1, TOWER.z1 + T);
  stub(DOOR_X + 1, TOWER.x1 + T, TOWER.z1, TOWER.z1 + T);
  stub(TOWER.x1, TOWER.x1 + T, TOWER.z0, LIFT.z0);
  stub(TOWER.x1, TOWER.x1 + T, LIFT.z1, TOWER.z1);

  const front = door(palette.yellow, palette.blueLight);
  front.group.position.set(DOOR_X, 0, TOWER.z1);
  root.add(front.group);
  autoDoor(plot, front, Math.PI * 0.55);
  plot.solid(GROUND, DOOR_X - 0.14, DOOR_X + 0.12, TOWER.z1 - 0.8, TOWER.z1);

  // the upper storeys: a floor each, railed on the two open sides, with a gap for the lift.
  // Seen from above, a floor hides whoever is under it, so each one is its own group that
  // fades away while the visitor walks the storey below.
  const upper: THREE.Group[] = [];
  for (let k = 1; k < levels.length; k++) {
    const y = k * STOREY;
    const storey = new THREE.Group();
    root.add(storey);
    upper.push(storey);
    storey.add(block(TOWER.x0, TOWER.x1, y - 0.18, y, TOWER.z0, TOWER.z1, palette.floor));
    // the tower's floor and the lift's landing overlap, so there is a way through between them
    plot.floor(levels[k], TOWER.x0, TOWER.x1, TOWER.z0, TOWER.z1);
    plot.floor(levels[k], TOWER.x1 - 0.6, LIFT.x1, LIFT.z0, LIFT.z1);
    const front = railing(TOWER.x1 - TOWER.x0, 0.85, palette.metal);
    front.position.set(TOWER.x0, y, TOWER.z1 - 0.05);
    storey.add(front);
    for (const [z0, z1] of [
      [TOWER.z0, LIFT.z0],
      [LIFT.z1, TOWER.z1],
    ]) {
      const rail = railing(z1 - z0, 0.85, palette.metal);
      rail.rotation.y = -Math.PI / 2;
      rail.position.set(TOWER.x1 - 0.05, y, z0);
      storey.add(rail);
    }
    if (k < STOREYS) continue;
    // the roof: a launch box with two steps up to it, and the mast the line runs from
    const half = 0.6;
    storey.add(block(LAB_ZIP.x - half, LAB_ZIP.x + half, y, y + LAB_ZIP.h, LAB_ZIP.z - half, LAB_ZIP.z + half, palette.wood));
    for (const [i, rise] of [LAB_ZIP.h * (2 / 3), LAB_ZIP.h / 3].entries()) {
      const x = LAB_ZIP.x + half + i * 0.35;
      storey.add(block(x, x + 0.35, y, y + rise, LAB_ZIP.z - 0.4, LAB_ZIP.z + 0.4, palette.wood, { line: 1.1 }));
    }
    plot.solid(levels[k], LAB_ZIP.x - half, LAB_ZIP.x + half + 0.7, LAB_ZIP.z - half, LAB_ZIP.z + half);
    const post = box(0.12, mast.y + 0.2 - y, 0.12, palette.woodDark, { line: 1.1 });
    post.position.set(mast.x, y, mast.z);
    storey.add(post);
    const cap = box(0.22, 0.08, 0.22, palette.metal, { line: 1.1 });
    cap.position.set(mast.x, mast.y + 0.2, mast.z);
    storey.add(cap);
  }
  const fades = upper.map((storey) => fadeable(storey));
  const under = { x0: plot.ox + TOWER.x0 - 0.3, x1: plot.ox + TOWER.x1 + T, z0: plot.oz + TOWER.z0 - 0.3, z1: plot.oz + TOWER.z1 + T + 0.3 };
  plot.ticks.push((dt, _time, who) => {
    const inside = !!who && who.position.x > under.x0 && who.position.x < under.x1 && who.position.z > under.z0 && who.position.z < under.z1;
    const storey = who ? Math.max(0, levels.indexOf(who.level)) : 0;
    // every floor above the one you are on steps aside while you are in the tower
    fades.forEach((fade, i) => fade.to(inside && i + 1 > storey ? 0 : 1, dt));
  });

  // ------------------------------------------------------------------ lift
  // the shaft stands a guard-rail's height above the roof, so the cabin never rides out of its frame
  const SHAFT = LAB_ROOF_Y + 1.1;
  const shaft = new THREE.Group();
  for (const x of [LIFT.x0, LIFT.x1]) {
    for (const z of [LIFT.z0, LIFT.z1]) {
      const post = box(0.1, SHAFT, 0.1, palette.metal, { line: 1.1 });
      post.position.set(x, 0, z);
      shaft.add(post);
    }
  }
  for (let k = 1; k <= STOREYS; k++) {
    const y = k * STOREY - 0.14;
    shaft.add(block(LIFT.x1 - 0.04, LIFT.x1 + 0.04, y, y + 0.08, LIFT.z0, LIFT.z1, palette.metal, { line: 1.1 }));
    for (const z of [LIFT.z0, LIFT.z1]) {
      shaft.add(block(LIFT.x0, LIFT.x1, y, y + 0.08, z - 0.04, z + 0.04, palette.metal, { line: 1.1 }));
    }
  }
  root.add(shaft);
  shaft.add(block(LIFT.x1 - 0.04, LIFT.x1 + 0.04, SHAFT - 0.1, SHAFT - 0.02, LIFT.z0, LIFT.z1, palette.metal, { line: 1.1 }));
  for (const z of [LIFT.z0, LIFT.z1]) {
    shaft.add(block(LIFT.x0, LIFT.x1, SHAFT - 0.1, SHAFT - 0.02, z - 0.04, z + 0.04, palette.metal, { line: 1.1 }));
  }

  const midX = (LIFT.x0 + LIFT.x1) / 2;
  const midZ = (LIFT.z0 + LIFT.z1) / 2;
  const cabin = new THREE.Group();
  cabin.name = 'lift-cabin';
  const deck = box(LIFT.x1 - LIFT.x0 - 0.16, 0.1, LIFT.z1 - LIFT.z0 - 0.16, palette.yellow);
  deck.position.y = -0.1;
  cabin.add(deck);
  // a guard on the three sides you cannot step off
  const guard = (w: number, d: number, x: number, z: number) => {
    const g = box(w, 0.06, d, palette.yellow, { line: 1.1 });
    g.position.set(x, 0.9, z);
    cabin.add(g);
  };
  const halfX = (LIFT.x1 - LIFT.x0) / 2 - 0.1;
  const halfZ = (LIFT.z1 - LIFT.z0) / 2 - 0.1;
  guard(0.06, halfZ * 2, halfX, 0);
  guard(halfX * 2, 0.06, 0, -halfZ);
  guard(halfX * 2, 0.06, 0, halfZ);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const p = box(0.06, 0.9, 0.06, palette.yellow, { line: 1.1 });
      p.position.set(sx * halfX, 0, sz * halfZ);
      cabin.add(p);
    }
  }
  plot.add(cabin, midX, 0, midZ);

  // the frame is too thin to click, so give the whole shaft a generous invisible hit area
  const hit = new THREE.Mesh(new THREE.BoxGeometry(LIFT.x1 - LIFT.x0, SHAFT, LIFT.z1 - LIFT.z0), new THREE.MeshBasicMaterial());
  hit.position.set(midX, SHAFT / 2, midZ);
  hit.visible = false;
  hit.userData.noShadow = true;
  hit.userData.unseen = true;
  root.add(hit);

  const stops = levels.map((_, k) => k * STOREY);
  const inside = plot.at(midX, 0, midZ);
  const landingAt = (k: number) => plot.at(TOWER.x1 - 0.5, stops[k], midZ);
  const cabinAt = (k: number) => plot.at(midX, stops[k], midZ);
  /** True from using the lift until stepping off it. The visitor's level only changes once they are off,
   *  so during a ride the cabin waits at the stop they are standing at rather than the storey they left. */
  let riding = false;
  const nearestStop = (y: number) => stops.reduce((best, s) => (Math.abs(s - y) < Math.abs(best - y) ? s : best));
  plot.ticks.push((dt, _time, who) => {
    if (!who) return;
    const aboard = Math.abs(who.position.x - inside.x) < 0.7 && Math.abs(who.position.z - inside.z) < 0.8;
    // carry whoever is aboard; otherwise wait at the stop they are at, or the storey they are on
    const storey = Math.max(0, levels.indexOf(who.level));
    const want = aboard ? who.position.y : riding ? nearestStop(who.position.y) : stops[storey];
    cabin.position.y = aboard ? want : cabin.position.y + (want - cabin.position.y) * Math.min(1, dt * 4);
  });

  // Every ride passes the middle storey and stops there to ask the way: up to the roof, down to the
  // ground, or left, off onto the second floor. Whichever end you came from is not offered back.
  const MIDDLE = 1;
  const TOP_STOP = levels.length - 1;
  levels.forEach((level, k) => {
    const landing = landingAt(k);
    plot.usables.push({
      level,
      anchor: plot.at(midX, stops[k] + 2.3, midZ),
      stand: landing,
      radius: 1.0,
      target: hit,
      label: () => (k === TOP_STOP ? 'Take the lift down' : k === 0 ? 'Take the lift up' : 'Take the lift'),
      use: (ui) => {
        const { player } = ui;
        riding = true;
        // ride on to stop `b` and step off there
        const ride = (b: number) => player.follow([cabinAt(b), landingAt(b)], levels[b], () => (riding = false), true);
        const all: Choice[] = [
          { dir: 'up', label: 'Up to the roof', pick: () => ride(TOP_STOP) },
          { dir: 'down', label: 'Down to the ground', pick: () => ride(0) },
          { dir: 'left', label: k === MIDDLE ? 'Step back off' : 'Off at the second floor', pick: () => ride(MIDDLE) },
        ];
        const ways = all.filter((way) => (way.dir === 'up' ? k !== TOP_STOP : way.dir === 'down' ? k !== 0 : true));
        const ask = k === MIDDLE ? 'Up to the roof, or down to the ground?' : `${ways[0].label}, or off at the second floor?`;
        const path = k === MIDDLE ? [landing, cabinAt(k)] : [landing, cabinAt(k), cabinAt(MIDDLE)];
        player.follow(path, levels[MIDDLE], () => ui.choose(plot.at(midX, stops[MIDDLE] + 2.3, midZ), ask, ways), true);
      },
    });
  });

  // ---------------------------------------------------------------- garden
  // the sign stands off to the side of the path, never between the camera and the tower
  plot.add(sign('The lab', 'Small experiments'), 3.0, 0, 6.45);
  plot.solid(GROUND, 1.9, 4.1, 6.3, 6.6);
  // pines behind the tower, where nobody walks
  plot.put('Tree_4_A_Color1', 1.4, 0, 3.4, { scale: 0.85, rotation: 1.4 });
  plot.put('Tree_4_A_Color1', 3.2, 0, 0.9, { scale: 0.65, rotation: 0.3 });
  plot.put('Tree_1_A_Color1', 13.3, 0, 1.6, { scale: 0.7, rotation: 2.4 });
  plot.solid(GROUND, 13.0, 13.6, 1.3, 1.9);
  plot.put('Bush_3_A_Color1', 8.4, 0, 6.85, { scale: 1.15, rotation: 1.1, collide: GROUND, pad: -0.15 });
  plot.put('Bush_4_A_Color1', 4.4, 0, 8.05, { scale: 1.0, rotation: 2.0, collide: GROUND, pad: -0.1 });
  plot.put('Rock_1_A_Color1', 12.2, 0, 2.9, { scale: 1.3, rotation: 2.2, collide: GROUND, pad: -0.1 });
  plot.put('Bush_4_A_Color1', 12.9, 0, 6.2, { scale: 1.3, rotation: 0.5, collide: GROUND, pad: -0.1 });

  return {
    place: { name: 'The lab', note: 'Small projects & experiments', anchor: plot.at(LAB.x1, -0.9, LAB.z1) },
  };
}
