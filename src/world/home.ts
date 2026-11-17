import * as THREE from 'three';
import { fill, outline, toon } from '../style/materials';
import { light, palette } from '../style/palette';
import { ball, block, box, crate, cylinder, disc, door, island, ladder, lampPost, lit, paving, plane, railing, rug, sign, table, volleyball, wall, windowFrame } from './builders';
import { autoDoor } from './doors';
import { housecat } from './folk';
import type { Place, Plot } from './plot';

// Elias' house: the island about Elias. A living room, cut open, with a roof terrace over the
// block beside it, and a garden round both. Layout in metres, in the island's own coordinates:
// +x runs to screen right, +z to screen left.
export const HOME = { x0: -4.8, x1: 9.2, z0: -1.8, z1: 7.2 };
/** Where the bridge from the museum lands, along the island's far edge. */
export const HOME_BRIDGE_X = 8.4;

const ROOM = { x0: 0, x1: 6, z0: 0, z1: 5 };
export const TERRACE_Y = 2.6;
/** Where the zip line from the lab is made fast: a pole in the terrace's near corner. */
export const HOME_ZIP = { x: -3.45, z: 4.4 };
const WALL_H = 3.0;
const STUB_H = 0.5;
const T = 0.2; // wall thickness
const DOOR_X = 2.2;
const GROUND = 0;

// The living room is planned round one rug: the couch along the terrace wall, the fire in the far
// wall, an armchair in the corner between them. Everything else is floor, so the way from the door
// to the ladder, the fire and the ball is never more than a straight line or two.
const RUG = { x0: 0.9, x1: 4.3, z0: 0.85, z1: 3.35 };
/** The fireplace, centred between the two windows; its chimney climbs the outside of the same wall. */
const FIRE = { x: 3.25, w: 1.5, d: 0.42, h: 1.2, mouth: 0.8, lintel: 0.75 };
const CHIMNEY_TOP = 4.25;
/** The record dresser, against the terrace's far parapet. */
const DRESSER = { x: -1.3, z: 0.37, top: 0.72 };

// Outside: the walk comes off the bridge, down the side yard and along the front to the door.
const SIDE_WALK = { x0: HOME_BRIDGE_X - 0.6, x1: HOME_BRIDGE_X + 0.6 };
const FRONT_WALK = { z0: 5.95, z1: 6.95 };
const FRONT = ROOM.z1 + T; // the building's front face

/** `terrace` is the level number the world has given the roof terrace. */
export function buildHome(plot: Plot, terrace: number): { place: Place; terraceY: number } {
  const root = plot.root;
  const solid = plot.solid.bind(plot);
  const put = plot.put.bind(plot);

  // ---------------------------------------------------------------- ground
  root.add(island(HOME.x0, HOME.x1, HOME.z0, HOME.z1));
  plot.floor(GROUND, HOME.x0, HOME.x1, HOME.z0, HOME.z1);
  // ------------------------------------------------- terrace block (solid)
  root.add(block(-4, 0, 0, TERRACE_Y, -T, 5, palette.wall));
  solid(GROUND, -4, 0, -T, 5);
  root.add(plane(-4 + T, 0, 0, 5, TERRACE_Y + 0.004, palette.floor, { outline: false }));
  plot.floor(terrace, -4 + T, -0.1, 0, 4.9);
  // parapets on the two far sides
  root.add(block(-4, 0, TERRACE_Y, TERRACE_Y + 0.9, -T, 0, palette.wall));
  root.add(block(-4, -4 + T, TERRACE_Y, TERRACE_Y + 0.9, 0, 5, palette.wall));
  root.add(plane(-4, 0, -T, 0, TERRACE_Y + 0.904, palette.wallCut, { outline: false }));
  root.add(plane(-4, -4 + T, 0, 5, TERRACE_Y + 0.904, palette.wallCut, { outline: false }));
  // garden face: window and a blue panel
  const blockWindow = windowFrame(1.3, 1.1, 0.08, palette.red);
  blockWindow.position.set(-2.6, 1.0, 5);
  root.add(blockWindow);
  root.add(block(-1.2, -0.3, 0, TERRACE_Y, 5, 5.03, palette.blue));

  // railings on the two near sides, with a gap at the ladder
  const rail1 = railing(3.75, 0.85, palette.metal);
  rail1.position.set(-3.8, TERRACE_Y, 4.95);
  root.add(rail1);
  const rail2 = railing(3.4, 0.85, palette.metal);
  rail2.position.set(-0.05, TERRACE_Y, 0.05);
  rail2.rotation.y = -Math.PI / 2;
  root.add(rail2);
  const rail3 = railing(0.65, 0.85, palette.metal);
  rail3.position.set(-0.05, TERRACE_Y, 4.3);
  rail3.rotation.y = -Math.PI / 2;
  root.add(rail3);

  // ------------------------------------------------------- room (cut open)
  const room = new THREE.Group();
  root.add(room);
  room.add(plane(ROOM.x0, ROOM.x1 + T, ROOM.z0, ROOM.z1 + T, 0.008, palette.floor));

  // back wall with two windows
  const back = wall(ROOM.x1 + T, WALL_H, T, palette.wall, [
    { x: 0.8, y: 1.1, w: 1.4, h: 1.2, frame: palette.red },
    { x: 4.3, y: 1.1, w: 1.4, h: 1.2, frame: palette.red },
  ]);
  back.position.set(0, 0, -T);
  room.add(back);
  room.add(plane(0, ROOM.x1 + T, -T, 0, WALL_H + 0.004, palette.wallCut, { outline: false }));

  // near walls are cut down to stubs so the room stays visible
  const stub = (x0: number, x1: number, z0: number, z1: number) => {
    room.add(block(x0, x1, 0, STUB_H, z0, z1, palette.wall));
    room.add(plane(x0, x1, z0, z1, STUB_H + 0.004, palette.wallCut, { outline: false }));
    solid(GROUND, x0, x1, z0, z1);
  };
  stub(ROOM.x1, ROOM.x1 + T, 0, ROOM.z1 + T);
  stub(0, DOOR_X, ROOM.z1, ROOM.z1 + T);
  stub(DOOR_X + 1, ROOM.x1, ROOM.z1, ROOM.z1 + T);

  // door
  const frontDoor = door(palette.red, palette.wall);
  frontDoor.group.position.set(DOOR_X, 0, ROOM.z1);
  room.add(frontDoor.group);
  // it swings outwards for whoever walks up; the strip it swings into, against the wall, is kept clear
  autoDoor(plot, frontDoor, -Math.PI * 0.55, GROUND);
  solid(GROUND, DOOR_X - 0.14, DOOR_X + 0.12, ROOM.z1 + T, ROOM.z1 + 0.95);

  furnish(plot, room);
  roof(plot, terrace);
  garden(plot);

  // ladder from the room up to the terrace
  const LADDER_Z = 3.85;
  const lean = Math.atan2(0.85, TERRACE_Y + 0.4);
  const roomLadder = ladder(Math.hypot(0.85, TERRACE_Y + 0.4), 0.5, palette.wood);
  roomLadder.position.set(0.9, 0, LADDER_Z);
  roomLadder.rotation.z = lean;
  root.add(roomLadder);
  // the rails are too thin to click, so give it a generous invisible hit area
  const ladderLength = Math.hypot(0.85, TERRACE_Y + 0.4);
  const ladderHit = new THREE.Mesh(new THREE.BoxGeometry(0.4, ladderLength, 0.7), new THREE.MeshBasicMaterial());
  ladderHit.position.y = ladderLength / 2;
  ladderHit.visible = false;
  ladderHit.userData.noShadow = true;
  roomLadder.add(ladderHit);
  solid(GROUND, 0, 0.9, LADDER_Z - 0.3, LADDER_Z + 0.3);

  // ------------------------------------------------------------ behaviour
  const bottom = plot.at(1.25, 0, LADDER_Z);
  const top = plot.at(-0.5, TERRACE_Y, LADDER_Z);
  const foot = plot.at(1.0, 0, LADDER_Z);
  const head = plot.at(0.28, TERRACE_Y, LADDER_Z);
  plot.usables.push(
    {
      level: GROUND,
      anchor: bottom.clone().setY(2.2),
      stand: bottom,
      radius: 0.9,
      target: roomLadder,
      label: () => 'Climb up',
      use: ({ player }) => player.follow([bottom, foot, head, top], terrace),
    },
    {
      level: terrace,
      anchor: top.clone().setY(TERRACE_Y + 2.2),
      stand: top,
      radius: 0.9,
      target: roomLadder,
      label: () => 'Climb down',
      use: ({ player }) => player.follow([top, head, foot, bottom], GROUND),
    },
  );

  return {
    place: { name: 'Elias’ house', note: 'About Elias', anchor: plot.at(HOME.x1, -0.9, HOME.z1) },
    terraceY: TERRACE_Y,
  };
}

/** A flat round facing +z, for speaker cones and record labels: drawn on, so it throws no shadow. */
function roundel(radius: number, color: string): THREE.Mesh {
  const mesh = outline(new THREE.Mesh(new THREE.CircleGeometry(radius, 24), fill(color)), 1);
  mesh.userData.noShadow = true;
  return mesh;
}

/**
 * A sheet for a frame: a canvas you draw on, hung as lit paper so it takes the room's light like
 * everything else. Faces +z, centred on x, base at y = 0. `draw` works in a w-by-h space of 100 units a metre.
 */
function sheet(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.Mesh {
  const px = 4;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * 100 * px);
  canvas.height = Math.round(h * 100 * px);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(px, px);
  ctx.fillStyle = palette.paper;
  ctx.fillRect(0, 0, w * 100, h * 100);
  ctx.strokeStyle = ctx.fillStyle = palette.ink;
  ctx.lineCap = ctx.lineJoin = 'round';
  draw(ctx, w * 100, h * 100);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0), toon({ map }));
  mesh.userData.noShadow = true;
  return mesh;
}

/** A frame round a sheet. Faces +z with its back at z = 0, centred on x, base at y = 0. */
function framed(w: number, h: number, rim: number, color: string, art: THREE.Mesh): THREE.Group {
  const g = new THREE.Group();
  const outer = box(w, h, 0.07, color);
  outer.position.z = 0.035;
  g.add(outer);
  art.position.set(0, rim, 0.074);
  g.add(art);
  return g;
}

/** The drawing over the couch: the pencil sketch this house was built from. A stand-in until the real one is hung. */
function sketchOfTheHouse(w: number, h: number): THREE.Mesh {
  return sheet(w, h, (ctx, W, H) => {
    // two little buildings, drawn the way the world is: from above and to one side
    const iso = (x: number, y: number, z: number): [number, number] => [W / 2 + (x - z) * 5.2, H * 0.62 + (x + z) * 2.6 - y * 6];
    const stroke = (pts: [number, number, number][], width = 0.9, close = false) => {
      ctx.lineWidth = width;
      ctx.beginPath();
      pts.forEach((q, i) => (i ? ctx.lineTo(...iso(...q)) : ctx.moveTo(...iso(...q))));
      if (close) ctx.closePath();
      ctx.stroke();
    };
    const hut = (x: number, z: number, a: number, b: number, up: number) => {
      stroke([[x, 0, z + b], [x + a, 0, z + b], [x + a, 0, z], [x + a, up, z], [x, up, z], [x, up, z + b], [x, 0, z + b]]);
      stroke([[x, up, z], [x, 0, z], [x + a, 0, z]], 0.6);
      stroke([[x, 0, z], [x, 0, z + b]], 0.6);
    };
    hut(-9.5, -1, 5, 4, 2.6);
    hut(1.5, -3, 7, 5.5, 2.6);
    // the path between them, and a note in each margin with a line to what it is about
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(...iso(-4.5, 0, 1.5));
    ctx.bezierCurveTo(...iso(-3, 0, 4), ...iso(0, 0, -1), ...iso(1.5, 0, 1));
    ctx.stroke();
    const note = (x: number, y: number, bw: number, bh: number, tx: number, ty: number) => {
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.roundRect(x, y, bw, bh, 2.5);
      ctx.stroke();
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.moveTo(x + 3, y + 3.5 + i * 3);
        ctx.lineTo(x + bw - 3 - i * 5, y + 3.5 + i * 3);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(x + bw / 2, y + (ty > y ? bh : 0));
      ctx.quadraticCurveTo(x + bw / 2, ty, tx, ty);
      ctx.stroke();
    };
    note(W * 0.06, H * 0.08, 26, 10, W * 0.3, H * 0.42);
    note(W * 0.62, H * 0.06, 24, 10, W * 0.7, H * 0.4);
    note(W * 0.1, H * 0.8, 30, 10, W * 0.24, H * 0.66);
    // the marker that says: these are the things you can use
    ctx.strokeStyle = palette.jacket;
    ctx.lineWidth = 1.1;
    for (const [x, y, r] of [[0.33, 0.47, 3.2], [0.72, 0.45, 3.6], [0.6, 0.7, 2.8]]) {
      ctx.beginPath();
      ctx.ellipse(W * x, H * y, r * 1.3, r, 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

/** The diploma over the fire: a seal, a title, a few lines of small print. */
function diploma(w: number, h: number): THREE.Mesh {
  return sheet(w, h, (ctx, W, H) => {
    ctx.lineWidth = 0.5;
    ctx.strokeRect(2.5, 2.5, W - 5, H - 5);
    // the seal: a cog, as on the real thing
    const cx = W / 2;
    const cy = H * 0.26;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 32; i++) {
      const r = i % 4 < 2 ? 5.6 : 4.4;
      const a = (i / 32) * Math.PI * 2;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = `800 11px ${"'Hanken Grotesk Variable', 'Helvetica Neue', Arial, sans-serif"}`;
    ctx.fillText('MSc', cx, H * 0.56);
    ctx.lineWidth = 0.6;
    for (const [y, half] of [[0.68, 0.3], [0.76, 0.24], [0.84, 0.16]]) {
      ctx.beginPath();
      ctx.moveTo(cx - W * half, H * y);
      ctx.lineTo(cx + W * half, H * y);
      ctx.stroke();
    }
  });
}

/** Everything inside the living room: the rug and the seats round it, the fire, the pictures, the lamp and the ball. */
function furnish(plot: Plot, room: THREE.Group): void {
  const solid = plot.solid.bind(plot);
  const put = plot.put.bind(plot);

  room.add(rug(RUG.x0, RUG.x1, RUG.z0, RUG.z1, 0.012, palette.trousers, '#3f5f7c', palette.paper));

  // ------------------------------------------------------------ the couch
  // along the terrace wall, looking into the room, with the drawing of the house over it
  put('couch_pillows', 0.62, 0, 2.1, { parent: room, rotation: Math.PI / 2, collide: GROUND });
  const drawing = framed(1.5, 1.0, 0.07, palette.woodDark, sketchOfTheHouse(1.36, 0.86));
  drawing.position.set(0, 1.4, 2.1);
  drawing.rotation.y = Math.PI / 2;
  room.add(drawing);
  put('table_low', 2.55, 0, 2.1, { parent: room, rotation: Math.PI / 2, scale: 0.75, collide: GROUND });
  put('Teapot_01', 2.55, 0.27, 1.8, { parent: room, rotation: -0.5 });
  put('Teacup_01', 2.67, 0.27, 2.2, { parent: room });
  put('Teacup_01', 2.39, 0.27, 2.52, { parent: room, rotation: 2 });

  // the corner behind the couch: a plant on a stand, and the volleyball, never far from hand
  put('Side_Table_01', 0.45, 0, 0.45, { parent: room, scale: 0.6, collide: GROUND });
  put('Plant_Fern_01', 0.45, 0.57, 0.45, { parent: room, scale: 0.8, rotation: 0.8 });
  const BALL = { x: 1.42, z: 0.5, r: 0.2 };
  const vball = volleyball(BALL.r);
  vball.position.set(BALL.x, BALL.r, BALL.z);
  vball.rotation.set(0.5, 0.4, 0.3);
  room.add(vball);
  solid(GROUND, BALL.x - 0.16, BALL.x + 0.16, BALL.z - 0.16, BALL.z + 0.16);

  // -------------------------------------------------------------- the fire
  const fx0 = FIRE.x - FIRE.w / 2;
  const fx1 = FIRE.x + FIRE.w / 2;
  const mx0 = FIRE.x - FIRE.mouth / 2;
  const mx1 = FIRE.x + FIRE.mouth / 2;
  // a stone hearth, two piers and a lintel round a sooty firebox, a timber mantel, and the breast above it
  room.add(block(fx0 - 0.1, fx1 + 0.1, 0, 0.06, 0, FIRE.d + 0.3, palette.pavement));
  room.add(block(fx0, mx0, 0.06, FIRE.h, 0, FIRE.d, palette.plaster));
  room.add(block(mx1, fx1, 0.06, FIRE.h, 0, FIRE.d, palette.plaster));
  room.add(block(mx0, mx1, FIRE.lintel, FIRE.h, 0, FIRE.d, palette.plaster));
  // soot takes no light: lit from this close, even black would glare
  const soot = new THREE.MeshBasicMaterial({ color: palette.road });
  for (const [x0, x1, y0, y1, z1] of [
    [mx0, mx1, 0.06, FIRE.lintel, 0.04],
    [mx0, mx0 + 0.03, 0.06, FIRE.lintel, FIRE.d - 0.02],
    [mx1 - 0.03, mx1, 0.06, FIRE.lintel, FIRE.d - 0.02],
    [mx0, mx1, 0.06, 0.075, FIRE.d - 0.02],
  ]) {
    const lining = block(x0, x1, y0, y1, 0, z1, palette.road, { outline: false });
    lining.material = soot;
    room.add(lining);
  }
  room.add(block(fx0 - 0.12, fx1 + 0.12, FIRE.h, FIRE.h + 0.09, 0, FIRE.d + 0.08, palette.woodDark));
  room.add(block(FIRE.x - 0.55, FIRE.x + 0.55, FIRE.h + 0.09, WALL_H, 0, 0.2, palette.plaster));
  room.add(plane(FIRE.x - 0.55, FIRE.x + 0.55, 0, 0.2, WALL_H + 0.004, palette.wallCut, { outline: false }));
  solid(GROUND, fx0 - 0.1, fx1 + 0.1, 0, FIRE.d + 0.3);

  // two logs and three flames
  for (const [x, turn] of [[-0.1, 0.35], [0.12, -0.4]]) {
    const log = box(0.5, 0.11, 0.11, palette.woodDark, { line: 1 });
    log.position.set(FIRE.x + x, 0.06, 0.24);
    log.rotation.y = turn;
    room.add(log);
  }
  const flames = [
    [-0.14, 0.26, 0.2, palette.wallCut],
    [0.02, 0.4, 0.24, palette.yellow],
    [0.16, 0.22, 0.21, palette.wallCut],
  ].map(([x, h, z, color]) => {
    const ember = toon({ color: color as string, emissive: light.lamp });
    ember.emissiveIntensity = 0.8;
    const height = h as number;
    const flame = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.085, height, 5).translate(0, height / 2, 0), ember), 0.9);
    flame.position.set(FIRE.x + (x as number), 0.15, z as number);
    flame.userData.noShadow = true;
    room.add(flame);
    return flame;
  });
  const fireLight = new THREE.PointLight(light.lamp, 3, 5, 1.6);
  fireLight.position.set(FIRE.x, 0.45, FIRE.d + 0.45);
  room.add(fireLight);
  plot.ticks.push((_dt, time) => {
    const flicker = 0.86 + Math.sin(time * 11) * 0.07 + Math.sin(time * 27 + 1.3) * 0.06;
    fireLight.intensity = 3.2 * flicker;
    flames.forEach((f, i) => {
      f.scale.y = 0.85 + Math.sin(time * (7 + i * 2.3) + i * 2) * 0.16;
      f.rotation.y = time * (1.5 + i * 0.4);
    });
  });

  // the mantel, and the diploma over it
  const mantel = FIRE.h + 0.09;
  put('Candles_Group_01', FIRE.x - 0.58, mantel, 0.27, { parent: room, scale: 0.8 });
  put('Clock_Alarm_01', FIRE.x + 0.55, mantel, 0.3, { parent: room, rotation: -0.25 });
  const degree = framed(0.62, 0.78, 0.06, palette.woodDark, diploma(0.5, 0.66));
  degree.position.set(FIRE.x, mantel + 0.42, 0.2);
  room.add(degree);

  // the armchair by the fire, turned in towards the room
  put('armchair_pillows', 5.1, 0, 1.15, { parent: room, rotation: -0.7, collide: GROUND, pad: -0.2 });

  // ---------------------------------------------------------- lamp and door
  // a standing lamp in the near corner, by the foot of the ladder
  const LAMP = { x: 0.5, z: 4.55 };
  const lamp = put('lamp_standing', LAMP.x, 0, LAMP.z, { parent: room });
  solid(GROUND, LAMP.x - 0.2, LAMP.x + 0.2, LAMP.z - 0.2, LAMP.z + 0.2);
  lit(plot, lamp, LAMP.x, 1.5, LAMP.z, 2.4, 5);
  // by the door: somewhere to put things down on the way in
  put('Hat_Boxes_01', 5.5, 0, 4.5, { parent: room, rotation: 0.4, collide: GROUND });

  // --------------------------------------------------------------- the cat
  // it does the rounds: the fire, a look out towards the door, the ball, and back to the fire.
  // Every leg of the route is open floor, clear of the rug's furniture.
  housecat(plot, {
    color: palette.metal,
    size: 1.5,
    label: 'Talk to the cat',
    lines: ['Dude, I’m a cat. I can’t talk.', 'But if I could, I’d probably tell you to hire this guy.'],
    route: [
      { x: FIRE.x + 0.1, z: 1.12, look: Math.PI + 0.15, wait: 9 },
      { x: 4.0, z: 2.9 },
      { x: 4.3, z: 4.15, look: -1.9, wait: 5 },
      { x: 1.95, z: 4.2 },
      { x: 1.6, z: 3.3 },
      { x: 1.6, z: 1.05, look: Math.PI + 0.35, wait: 6 },
    ],
  });
}

/** The roof terrace: records and somewhere to sit and hear them. The middle is kept clear: it is where the zip line sets you down. */
function roof(plot: Plot, terrace: number): void {
  const root = plot.root;
  const solid = plot.solid.bind(plot);
  const put = plot.put.bind(plot);
  const Y = TERRACE_Y;

  // ------------------------------------------------------- the record dresser
  put('cabinet_medium', DRESSER.x, Y, DRESSER.z, { collide: terrace });
  const hifi = new THREE.Group();
  hifi.position.set(DRESSER.x, Y + DRESSER.top, DRESSER.z);
  root.add(hifi);
  // the deck: a plinth, a platter, a record with a red label, and the arm resting beside it
  const deck = box(0.52, 0.07, 0.42, palette.wood, { line: 1.1 });
  deck.position.set(0, 0, 0.04);
  hifi.add(deck);
  const record = cylinder(0.17, 0.17, 0.025, palette.road);
  record.position.set(-0.05, 0.07, 0.04);
  hifi.add(record);
  const label = disc(0.06, palette.red);
  label.position.set(-0.05, 0.098, 0.04);
  label.userData.noShadow = true;
  hifi.add(label);
  const pivot = cylinder(0.028, 0.028, 0.07, palette.metal);
  pivot.position.set(0.2, 0.07, -0.1);
  hifi.add(pivot);
  const arm = box(0.022, 0.022, 0.27, palette.metal, { line: 1 });
  arm.geometry.translate(0, 0, 0.135);
  arm.position.set(0.2, 0.115, -0.1);
  arm.rotation.y = -0.42;
  hifi.add(arm);
  // a speaker at either end
  for (const side of [-1, 1]) {
    const speaker = box(0.27, 0.42, 0.25, palette.woodDark, { line: 1.1 });
    speaker.position.set(side * 0.56, 0, 0);
    hifi.add(speaker);
    for (const [r, y] of [[0.085, 0.14], [0.04, 0.31]]) {
      const cone = roundel(r, palette.road);
      cone.position.set(side * 0.56, y, 0.127);
      hifi.add(cone);
    }
  }
  // what is on: its sleeve, stood up against the parapet behind the deck
  const playing = box(0.4, 0.4, 0.02, palette.red, { line: 1.1 });
  playing.position.set(0, 0.01, -0.29);
  playing.rotation.x = -0.16;
  hifi.add(playing);
  const sun = roundel(0.11, palette.yellow);
  sun.position.set(0.04, 0.22, 0.012);
  playing.add(sun);

  // the rest of the collection, in a crate beside it
  const CRATE = { x: -2.42, z: 0.36 };
  const records = crate(0.52, 0.3, 0.46, palette.wood);
  records.position.set(CRATE.x, Y, CRATE.z);
  root.add(records);
  const sleeves = [palette.blue, palette.paper, palette.red, palette.yellow, palette.leaf, palette.road, palette.wallCut, palette.plaster];
  sleeves.forEach((color, i) => {
    const sleeve = box(0.42, 0.42, 0.022, color, { line: 1 });
    sleeve.position.set(CRATE.x + (((i * 5) % 3) - 1) * 0.008, Y + 0.05, CRATE.z - 0.17 + i * 0.048);
    sleeve.rotation.x = (((i * 7) % 5) - 2) * 0.035;
    root.add(sleeve);
  });
  solid(terrace, CRATE.x - 0.26, CRATE.x + 0.26, CRATE.z - 0.23, CRATE.z + 0.23);

  // ------------------------------------------------------------ the seat
  // a chair turned towards the music, and a lantern on the table beside it
  put('chair_C', -3.2, Y, 1.75, { rotation: 1.95, collide: terrace });
  put('Side_Table_01', -3.38, Y, 2.65, { scale: 0.7, collide: terrace });
  const lantern = put('Oil_Lamp_01', -3.38, Y + 0.665, 2.65, { rotation: 1 });
  lit(plot, lantern, -3.38, Y + 1.0, 2.65, 1.8, 3.2);
  put('Teacup_01', -3.2, Y + 0.665, 2.82, { rotation: 0.7 });

  // green in the far corner, and more by the pole
  put('Plant_Fern_01', -3.3, Y, 0.55, { scale: 1.1, rotation: 2.2, collide: terrace, pad: -0.15 });
  const POT = { x: -3.35, z: 3.8 };
  const pot = box(0.56, 0.42, 0.56, palette.wallCut);
  pot.position.set(POT.x, Y, POT.z);
  root.add(pot);
  put('Tree_4_A_Color1', POT.x, Y + 0.42, POT.z, { scale: 0.34, rotation: 1 });
  solid(terrace, POT.x - 0.28, POT.x + 0.28, POT.z - 0.28, POT.z + 0.28);
}

/** The land round the house: the walk from the bridge to the door, beds against the walls, a kitchen garden, and a bench under the tree. */
function garden(plot: Plot): void {
  const root = plot.root;
  const solid = plot.solid.bind(plot);
  const put = plot.put.bind(plot);
  const bed = (x0: number, x1: number, z0: number, z1: number) => {
    root.add(plane(x0, x1, z0, z1, 0.007, palette.soil));
    solid(GROUND, x0, x1, z0, z1);
  };
  const tuft = (x: number, z: number, tall = false, turn = 0) =>
    put(tall ? 'Grass_2_A_Color1' : 'Grass_1_A_Color1', x, 0, z, { scale: tall ? 0.6 : 0.9, rotation: turn, castShadow: false });
  /** A shrub in flower: a handful of small blooms over its crown. */
  const blooms = (x: number, z: number, y: number, color: string, n = 5) => {
    for (let i = 0; i < n; i++) {
      const a = i * 2.4 + x;
      const r = 0.1 + ((i * 3) % 4) * 0.035;
      const bloom = box(0.07, 0.07, 0.07, color, { line: 1 });
      bloom.position.set(x + Math.cos(a) * r, y - r * 0.5, z + Math.sin(a) * r);
      bloom.rotation.y = a;
      root.add(bloom);
    }
  };

  // ------------------------------------------------------------- the walk
  // off the bridge, down the side yard, along the front, and a forecourt at the door
  root.add(paving(SIDE_WALK.x0, SIDE_WALK.x1, HOME.z0, FRONT_WALK.z0, 1, 7));
  root.add(paving(DOOR_X - 0.2, SIDE_WALK.x1, FRONT_WALK.z0, FRONT_WALK.z1, 6, 1));
  root.add(paving(DOOR_X - 0.2, DOOR_X + 1.2, FRONT, FRONT_WALK.z0, 1, 1));
  put('Doormat_01', DOOR_X + 0.5, 0.014, FRONT + 0.4, { castShadow: false });
  // stepping stones across the lawn to the bench
  for (const [x, z] of [[1.35, 6.42], [0.6, 6.3], [-0.15, 6.38], [-0.9, 6.22], [-1.6, 6.02]]) {
    root.add(paving(x - 0.27, x + 0.27, z - 0.22, z + 0.22, 1, 1, 0));
  }

  // ------------------------------------------------------------- the door
  // a low light and a bed in flower to its left, the letterbox and another bed to its right
  plot.add(lampPost(0.75), DOOR_X - 0.42, 0, FRONT + 0.42);
  solid(GROUND, DOOR_X - 0.56, DOOR_X - 0.28, FRONT + 0.28, FRONT + 0.56);
  bed(0.2, 1.55, FRONT + 0.1, FRONT + 0.7);
  put('Bush_4_A_Color1', 0.62, 0, FRONT + 0.4, { scale: 1.15, rotation: 0.6 });
  blooms(0.62, FRONT + 0.4, 0.52, palette.red);
  put('Bush_3_A_Color1', 1.22, 0, FRONT + 0.4, { scale: 0.5, rotation: 2 });

  const BOX = { x: DOOR_X + 1.45, z: FRONT + 0.45 };
  plot.add(box(0.07, 0.9, 0.07, palette.metal, { line: 1.1 }), BOX.x, 0, BOX.z);
  plot.add(box(0.3, 0.22, 0.22, palette.yellow), BOX.x, 0.9, BOX.z);
  solid(GROUND, BOX.x - 0.15, BOX.x + 0.15, BOX.z - 0.11, BOX.z + 0.11);
  bed(3.95, ROOM.x1, FRONT + 0.1, FRONT + 0.7);
  put('Bush_4_A_Color1', 4.35, 0, FRONT + 0.4, { scale: 1.1, rotation: 1.8 });
  blooms(4.35, FRONT + 0.4, 0.5, palette.yellow);
  put('Bush_3_A_Color1', 4.98, 0, FRONT + 0.4, { scale: 0.5, rotation: 0.3 });
  put('Bush_4_A_Color1', 5.62, 0, FRONT + 0.4, { scale: 1.0, rotation: 3 });
  blooms(5.62, FRONT + 0.4, 0.46, palette.red);

  // ------------------------------------------------------- the front lawn
  // a bench against the warm wall under the window, a tree in the corner, and open grass between
  plot.add(table(1.5, 0.45, 0.42, palette.woodDark), -2.6, 0, FRONT + 0.32);
  solid(GROUND, -3.35, -1.85, FRONT + 0.11, FRONT + 0.53);
  put('Tree_3_A_Color1', -4.05, 0, 6.45, { scale: 0.6, rotation: 3 });
  solid(GROUND, -4.3, -3.8, 6.2, 6.7);
  tuft(-3.7, 5.6, true, 0.4);
  tuft(-1.55, 5.45, false, 1.2);
  tuft(-2.6, 6.85, false, 2);
  tuft(-0.4, 6.95, true, 1);
  tuft(1.0, 7.0, false, 0.3);
  tuft(-4.5, 5.5, false, 2.6);

  // ------------------------------------------------------- the side yard
  // a kitchen garden against the house: two raised beds, kept low so the room stays in view over them
  const raised = (z0: number, z1: number, plant: (z: number, i: number) => void) => {
    const [x0, x1] = [6.55, 7.4];
    root.add(block(x0, x1, 0, 0.24, z0, z1, palette.wood));
    root.add(plane(x0 + 0.07, x1 - 0.07, z0 + 0.07, z1 - 0.07, 0.244, palette.soil, { line: 1 }));
    solid(GROUND, x0, x1, z0, z1);
    const n = Math.round((z1 - z0 - 0.3) / 0.38);
    for (let i = 0; i <= n; i++) plant(z0 + 0.22 + (i * (z1 - z0 - 0.44)) / n, i);
  };
  raised(0.75, 2.35, (z, i) => {
    put('Bush_1_A_Color1', 6.8, 0.24, z, { scale: 1.25, rotation: i * 1.9 });
    put('Bush_1_A_Color1', 7.16, 0.24, z, { scale: 1.25, rotation: i * 2.7 + 1 });
  });
  raised(2.95, 4.55, (z, i) => {
    put('Grass_1_A_Color1', 6.8, 0.22, z, { scale: 0.62, rotation: i * 1.3, castShadow: false });
    put('Bush_1_A_Color1', 7.16, 0.24, z, { scale: 1.25, rotation: i * 2.1 });
  });
  put('Watering_Can_01', 6.95, 0, 2.65, { rotation: 2.6, collide: GROUND });
  put('Basket_Wicker_01', 6.95, 0, 4.98, { scale: 0.8, rotation: 0.4, collide: GROUND });
  tuft(7.55, 0.5, false, 1);
  tuft(7.6, 5.5, true, 0.6);

  // ------------------------------------------------- where the bridge lands
  // the first thing you meet coming off it: the sign in its own bed, and a lamp at the water's edge
  bed(5.55, 7.7, -1.5, -0.7);
  plot.add(sign('Elias’ house', 'About Elias'), 6.62, 0, -1.1);
  put('Bush_1_A_Color1', 7.4, 0, -0.9, { scale: 1.5, rotation: 1 });
  put('Bush_1_A_Color1', 6.3, 0, -0.9, { scale: 1.3, rotation: 2.4 });
  tuft(6.85, -0.85, true, 0.4);
  put('Bush_3_A_Color1', 6.75, 0, 0.05, { scale: 0.7, rotation: 0.5 });
  put('Bush_3_A_Color1', 7.3, 0, -0.1, { scale: 0.55, rotation: 2 });
  plot.add(lampPost(), 9.05, 0, -1.0);
  solid(GROUND, 8.91, 9.19, -1.14, -0.86);

  // ------------------------------------------------------ behind the house
  // nobody walks behind the house or round the far side of the terrace: you would lose them
  solid(GROUND, HOME.x0, -4, HOME.z0, 5.2);
  solid(GROUND, HOME.x0, 7.7, HOME.z0, 0.3);
  // the chimney, up the outside of the wall the fire is in
  root.add(block(FIRE.x - 0.34, FIRE.x + 0.34, 0, CHIMNEY_TOP, -T - 0.5, -T, palette.wall));
  root.add(block(FIRE.x - 0.4, FIRE.x + 0.4, CHIMNEY_TOP, CHIMNEY_TOP + 0.12, -T - 0.56, -T + 0.06, palette.wallCut));
  const chimneyPot = cylinder(0.13, 0.16, 0.3, palette.red);
  plot.add(chimneyPot, FIRE.x, CHIMNEY_TOP + 0.12, -T - 0.25);
  smoke(plot, FIRE.x, CHIMNEY_TOP + 0.45, -T - 0.25);
  // trees for a backdrop, set either side of the zip line's way in
  put('Tree_1_A_Color1', -2.9, 0, -1.2, { scale: 0.85, rotation: 0.5 });
  put('Tree_2_A_Color1', 4.45, 0, -1.3, { scale: 0.75 });
}

/** Smoke from the chimney: a few slow puffs that swell as they rise, drift off, and thin away to nothing. */
function smoke(plot: Plot, x: number, y: number, z: number): void {
  const PUFFS = 4;
  const RISE = 2.1;
  const puffs = Array.from({ length: PUFFS }, () => {
    const puff = ball(0.17, palette.plaster);
    puff.userData.noShadow = true;
    puff.receiveShadow = false;
    return plot.add(puff, x, y, z);
  });
  const { smoothstep } = THREE.MathUtils;
  plot.ticks.push((_dt, time) => {
    puffs.forEach((puff, i) => {
      const t = (time * 0.11 + i / PUFFS) % 1;
      const size = smoothstep(t, 0, 0.12) * (0.5 + t * 0.9) * (1 - smoothstep(t, 0.7, 1));
      puff.visible = size > 0.04;
      puff.scale.setScalar(Math.max(size, 0.04));
      puff.position.set(x + t * t * 0.7 + Math.sin(t * 7 + i * 2.1) * 0.07, y + t * RISE, z - t * t * 0.4);
    });
  });
}
