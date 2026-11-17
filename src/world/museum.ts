import * as THREE from 'three';
import { palette } from '../style/palette';
import { block, box, ball, door, glow, island, lampPost, lit, paving, picture, plane, rug, sign, table, wash } from './builders';
import { autoDoor } from './doors';
import { person, stroller } from './folk';
import type { Place, Plot } from './plot';

// The museum of work: the island for the real work. One big room, cut open, with the case
// studies hung along its far wall. Layout in metres, in the island's own coordinates:
// +x runs to screen right, +z to screen left.
export const MUSEUM = { x0: -8.3, x1: 8, z0: -6.5, z1: 6.5 };
/** Where the bridges land: the house's along the near edge, the lab's along the far one. */
export const MUSEUM_HOME_BRIDGE_X = -7.4;
export const MUSEUM_LAB_BRIDGE_X = 7.3;

const ROOM = { x0: -6, x1: 5.5, z0: -4.5, z1: 3 };
const WALL_H = 3.4;
const STUB_H = 0.5;
const T = 0.2; // wall thickness
const FRONT_DOOR_X = -2;
const SIDE_DOOR_Z = -3.4;
const GROUND = 0;

/** The collection, in hanging order along the far wall. The studies are not written yet, so every sheet opens blank. */
const WORKS = ['Case study one', 'Case study two', 'Case study three', 'Case study four'];
const FRAME = { w: 2.0, h: 1.5, y: 1.0 };
/** Centre to centre along the wall: the four frames sit evenly, with the same margin at either end. */
const HANG = 2.75;
const hangAt = (i: number) => (ROOM.x0 + ROOM.x1) / 2 + (i - (WORKS.length - 1) / 2) * HANG;
/** How far out from the wall you stand to read one. The aisle in front of the wall is kept clear to here and beyond. */
const READ = 1.1;

// The room is planned in three bands, far to near: the aisle along the collection (nothing stands in
// it), the rug with the viewing bench, and the service edge along the near walls (desk, lamps, plants).
/** How much bare floor is left round the rug: it runs almost wall to wall, and the furniture stands on it. */
const RUG_MARGIN = 0.5;
const RUG = { x0: ROOM.x0 + RUG_MARGIN, x1: ROOM.x1 - RUG_MARGIN, z0: ROOM.z0 + RUG_MARGIN, z1: ROOM.z1 - RUG_MARGIN };
const BENCH = { x0: -0.4, x1: 3.6, z0: -1.8, z1: -1.2, h: 0.45 };
const DESK = { x0: -4.8, x1: -4.1, z0: -0.2, z1: 2.3, h: 1.0 };

// Outside: one promenade along the front joins the two bridges; the door gets a forecourt off it.
const WALK = { z0: 4.5, z1: 5.7 };
const EAST = { x0: MUSEUM_LAB_BRIDGE_X - 0.7, x1: MUSEUM.x1 };
const FRONT = ROOM.z1 + T; // the building's front face

export function buildMuseum(plot: Plot): { place: Place; spawn: THREE.Vector3 } {
  const root = plot.root;
  const solid = plot.solid.bind(plot);

  // ---------------------------------------------------------------- ground
  root.add(island(MUSEUM.x0, MUSEUM.x1, MUSEUM.z0, MUSEUM.z1));
  plot.floor(GROUND, MUSEUM.x0, MUSEUM.x1, MUSEUM.z0, MUSEUM.z1);
  const pave = (x0: number, x1: number, z0: number, z1: number, nx: number, nz: number) => root.add(paving(x0, x1, z0, z1, nx, nz));
  // the promenade, bridge to bridge along the front
  pave(MUSEUM_HOME_BRIDGE_X - 0.7, MUSEUM.x1, WALK.z0, WALK.z1, 20, 1);
  pave(MUSEUM_HOME_BRIDGE_X - 0.7, MUSEUM_HOME_BRIDGE_X + 0.7, WALK.z1, MUSEUM.z1, 1, 1);
  // the forecourt: wider than the door, so the entrance reads from across the water
  pave(FRONT_DOOR_X - 0.9, FRONT_DOOR_X + 1.9, FRONT, WALK.z0, 3, 2);
  // round the side to the lab's bridge, with a step off it to the side door
  pave(EAST.x0, EAST.x1, MUSEUM.z0, WALK.z0, 1, 14);
  pave(ROOM.x1 + T, EAST.x0, SIDE_DOOR_Z - 0.1, SIDE_DOOR_Z + 1.1, 1, 2);

  // ------------------------------------------------------- hall (cut open)
  root.add(plane(ROOM.x0, ROOM.x1 + T, ROOM.z0, ROOM.z1 + T, 0.008, palette.floor));

  // the two far walls carry the collection
  root.add(block(ROOM.x0 - T, ROOM.x0, 0, WALL_H, ROOM.z0 - T, ROOM.z1 + T, palette.plaster));
  root.add(plane(ROOM.x0 - T, ROOM.x0, ROOM.z0 - T, ROOM.z1 + T, WALL_H + 0.004, palette.wallCut, { outline: false }));
  root.add(block(ROOM.x0, ROOM.x1 + T, 0, WALL_H, ROOM.z0 - T, ROOM.z0, palette.plaster));
  root.add(plane(ROOM.x0, ROOM.x1 + T, ROOM.z0 - T, ROOM.z0, WALL_H + 0.004, palette.wallCut, { outline: false }));
  // nobody walks behind them: you would lose them
  solid(GROUND, MUSEUM.x0, ROOM.x0, MUSEUM.z0, ROOM.z1 + T);
  solid(GROUND, MUSEUM.x0, ROOM.x1 + T, MUSEUM.z0, ROOM.z0);

  // near walls are cut down to stubs so the room stays visible
  const stub = (x0: number, x1: number, z0: number, z1: number) => {
    root.add(block(x0, x1, 0, STUB_H, z0, z1, palette.plaster));
    root.add(plane(x0, x1, z0, z1, STUB_H + 0.004, palette.wallCut, { outline: false }));
    solid(GROUND, x0, x1, z0, z1);
  };
  stub(ROOM.x0, FRONT_DOOR_X, ROOM.z1, ROOM.z1 + T);
  stub(FRONT_DOOR_X + 1, ROOM.x1 + T, ROOM.z1, ROOM.z1 + T);
  stub(ROOM.x1, ROOM.x1 + T, ROOM.z0, SIDE_DOOR_Z);
  stub(ROOM.x1, ROOM.x1 + T, SIDE_DOOR_Z + 1, ROOM.z1);

  // both doors open for whoever walks up, into the room; the strip each swings into is kept clear
  const front = door(palette.blue, palette.plaster);
  front.group.position.set(FRONT_DOOR_X, 0, ROOM.z1);
  root.add(front.group);
  autoDoor(plot, front, Math.PI * 0.55, GROUND);
  solid(GROUND, FRONT_DOOR_X - 0.14, FRONT_DOOR_X + 0.12, ROOM.z1 - 0.8, ROOM.z1);
  const side = door(palette.blue, palette.plaster);
  side.group.position.set(ROOM.x1 + T, 0, SIDE_DOOR_Z);
  side.group.rotation.y = -Math.PI / 2;
  root.add(side.group);
  autoDoor(plot, side, -Math.PI * 0.55, GROUND);
  solid(GROUND, ROOM.x1 - 0.8, ROOM.x1, SIDE_DOOR_Z - 0.14, SIDE_DOOR_Z + 0.12);

  furnish(plot);
  garden(plot);

  return {
    place: { name: 'Museum of work', note: 'Case studies', anchor: plot.at(MUSEUM.x1, -0.9, MUSEUM.z1) },
    spawn: plot.at(FRONT_DOOR_X + 0.5, 0, 4.2),
  };
}

/** Everything inside the hall: the collection and its lighting, the rug and the bench, the desk, the lamps and the people. */
function furnish(plot: Plot): void {
  const root = plot.root;
  const solid = plot.solid.bind(plot);

  // ---------------------------------------------------------- the collection
  // lamplight on the wall: one soft, warm wash fanning down from each picture light
  const LAMP_Y = FRAME.y + FRAME.h + 0.3;

  WORKS.forEach((title, i) => {
    const x = hangAt(i);
    const frame = picture(FRAME.w, FRAME.h, i, palette.road);
    plot.add(frame, x, FRAME.y, ROOM.z0);

    // a brass picture light over each one
    plot.add(box(0.05, 0.05, 0.3, palette.yellow, { line: 1 }), x, LAMP_Y + 0.02, ROOM.z0 + 0.15);
    plot.add(box(1.0, 0.09, 0.16, palette.yellow, { line: 1.1 }), x, LAMP_Y, ROOM.z0 + 0.34);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.1), glow());
    plot.add(bulb, x, LAMP_Y - 0.015, ROOM.z0 + 0.34);
    plot.add(wash(2.7, LAMP_Y, 0.8), x, 0, ROOM.z0 + 0.004);
    // the label beside it
    plot.add(box(0.3, 0.22, 0.02, palette.paper, { line: 1 }), x + FRAME.w / 2 + 0.27, 1.28, ROOM.z0);

    plot.usables.push({
      level: GROUND,
      anchor: plot.at(x, LAMP_Y + 0.45, ROOM.z0 + 0.15),
      stand: plot.at(x, 0, ROOM.z0 + READ),
      radius: 0.95,
      target: frame,
      label: () => 'Read the case study',
      use: ({ open }) =>
        open({
          kind: 'study',
          eyebrow: `Case study · ${i + 1} of ${WORKS.length}`,
          title,
          text: 'This one isn’t written up yet. The frame is hung; the story is on its way.',
        }),
    });
  });

  // ------------------------------------------------------- the rug and bench
  root.add(rug(RUG.x0, RUG.x1, RUG.z0, RUG.z1, 0.012, palette.rug, palette.rugDeep, palette.paper));

  // one long bench facing the collection: a pale seat on dark slab legs
  const seatY = BENCH.h - 0.09;
  root.add(block(BENCH.x0, BENCH.x1, seatY, BENCH.h, BENCH.z0, BENCH.z1, palette.wood));
  const span = BENCH.x1 - BENCH.x0;
  for (const t of [0.07, 0.5, 0.93]) {
    const x = BENCH.x0 + span * t;
    root.add(block(x - 0.05, x + 0.05, 0, seatY, BENCH.z0 + 0.06, BENCH.z1 - 0.06, palette.road, { line: 1.1 }));
  }
  solid(GROUND, BENCH.x0, BENCH.x1, BENCH.z0, BENCH.z1);

  // ----------------------------------------------------------- the front desk
  // along the left-hand wall, side-on to the door: the first thing you see, and out of everyone's way
  root.add(block(DESK.x0 + 0.06, DESK.x1 - 0.06, 0, DESK.h - 0.08, DESK.z0 + 0.06, DESK.z1 - 0.06, palette.woodDark));
  root.add(block(DESK.x0, DESK.x1, DESK.h - 0.08, DESK.h, DESK.z0, DESK.z1, palette.wood));
  solid(GROUND, DESK.x0, DESK.x1, DESK.z0, DESK.z1);
  const deskX = (DESK.x0 + DESK.x1) / 2;
  const deskLamp = plot.put('Oil_Lamp_01', deskX, DESK.h, DESK.z1 - 0.35);
  lit(plot, deskLamp, deskX, DESK.h + 0.5, DESK.z1 - 0.35, 2.2, 3.2);
  plot.put('Books_Row_01', deskX, DESK.h, DESK.z0 + 0.6, { rotation: Math.PI / 2 + 0.1 });
  plot.put('Flower_Vase_01', deskX + 0.05, DESK.h, DESK.z0 + 0.2);
  plot.put('shelf_B_large_decorated', ROOM.x0 + 0.02, 1.5, 1.05, { rotation: Math.PI / 2 });
  plot.put('Plant_Fern_01', -5.45, 0, 2.6, { scale: 1.15, rotation: 1.4, collide: GROUND, pad: -0.15 });

  // --------------------------------------------------------- lamps and corners
  // a reading corner: an armchair and a lamp
  plot.put('armchair_pillows', -5.3, 0, -2.1, { rotation: Math.PI / 2, collide: GROUND, pad: -0.08 });
  const floorLamp = (x: number, z: number) => {
    const lamp = plot.put('lamp_standing', x, 0, z);
    solid(GROUND, x - 0.2, x + 0.2, z - 0.2, z + 0.2);
    lit(plot, lamp, x, 1.5, z, 2.4, 5);
  };
  floorLamp(-5.4, -0.85);
  floorLamp(5.0, -1.7);
  plot.put('Plant_Fern_01', -5.5, 0, -3.95, { scale: 1.1, rotation: 0.6, collide: GROUND, pad: -0.15 });

  // a small sculpture on a plinth, against the side wall
  const PLINTH = { x: 4.85, z: 0.6 };
  plot.add(box(0.62, 0.9, 0.62, palette.plaster), PLINTH.x, 0, PLINTH.z);
  plot.add(box(0.34, 0.16, 0.34, palette.blue, { line: 1.1 }), PLINTH.x, 0.9, PLINTH.z);
  const orb = ball(0.2, palette.red);
  plot.add(orb, PLINTH.x - 0.03, 1.25, PLINTH.z + 0.02);
  const fin = box(0.08, 0.62, 0.3, palette.yellow, { line: 1.1 });
  fin.rotation.z = -0.3;
  plot.add(fin, PLINTH.x + 0.1, 1.04, PLINTH.z - 0.02);
  solid(GROUND, PLINTH.x - 0.31, PLINTH.x + 0.31, PLINTH.z - 0.31, PLINTH.z + 0.31);
  plot.put('Plant_Fern_01', 4.95, 0, 2.45, { scale: 1.15, rotation: 2.2, collide: GROUND, pad: -0.15 });

  // ------------------------------------------------------------- the people
  person(plot, {
    x: -5.4,
    z: 1.05,
    heading: Math.PI / 2,
    // the one who works here: a peaked cap, glasses, tidy hair
    outfit: {
      jacket: palette.blue,
      trousers: palette.glass,
      idle: 'Idle_B',
      hat: 'cap',
      glasses: true,
      hair: { style: 'crop', color: palette.road },
      build: { height: 1.04, width: 0.96 },
    },
    label: 'Ask at the desk',
    stand: [DESK.x1 + 0.6, 1.05],
    lines: [
      'Welcome to the Museum of Work. The case studies are along the far wall: walk up to one to read it.',
      'The lab is out the side door and over the bridge. The house is back the way you came.',
    ],
  });
  // someone taking their time with number three
  person(plot, {
    x: 2.7,
    z: (BENCH.z0 + BENCH.z1) / 2,
    heading: Math.PI,
    seated: true,
    // wrapped up warm, and in no hurry
    outfit: {
      jacket: palette.red,
      trousers: palette.trousers,
      idle: 'Sit_Chair_Idle',
      hat: 'beanie',
      scarf: true,
      hair: { style: 'bob', color: palette.woodDark },
      build: { width: 1.06 },
    },
    label: 'Talk to the visitor',
    stand: [2.7, BENCH.z0 - 0.55],
    lines: ['I sat down for a minute. That was a while ago.', 'It’s a good bench.'],
  });
  // one who walks the wall: they stop a step back and to one side of each reading spot, so nobody
  // is ever stood where you need to be, then cut back past the reading corner, clear of the bench
  const view = (i: number, side: number, wait: number) => ({ x: hangAt(i) + side * 0.6, z: ROOM.z0 + 1.5, look: Math.PI, wait });
  stroller(plot, {
    // out for the day: sun hat, hair up, a rucksack
    outfit: {
      jacket: palette.leaf,
      trousers: palette.woodDark,
      idle: 'Idle_B',
      hat: 'bucket',
      pack: true,
      hair: { style: 'bun', color: palette.yellow },
      build: { height: 0.95 },
    },
    label: 'Talk to the visitor',
    lines: ['Kinda weird that this guy made a museum for his work, right?', 'He must’ve been bored!'],
    route: [view(0, 1, 7), view(1, 1, 9), view(2, 1, 8), view(3, -1, 6), { x: -3.7, z: -1.6, look: -Math.PI / 2, wait: 5 }],
  });
}

/** The land around the hall: beds against the building, lamps at the door, low planting along the water. */
function garden(plot: Plot): void {
  const root = plot.root;
  const solid = plot.solid.bind(plot);
  const bed = (x0: number, x1: number, z0: number, z1: number) => {
    root.add(plane(x0, x1, z0, z1, 0.007, palette.soil));
    solid(GROUND, x0, x1, z0, z1);
  };
  const tuft = (x: number, z: number, tall = false, turn = 0) =>
    plot.put(tall ? 'Grass_2_A_Color1' : 'Grass_1_A_Color1', x, 0, z, { scale: tall ? 0.6 : 0.9, rotation: turn, castShadow: false });

  // the door: a light either side of the forecourt
  const doorX = FRONT_DOOR_X + 0.5;
  // knee-high, so they mark the door without standing between you and the room
  for (const side of [-1, 1]) {
    const x = doorX + side * 1.62;
    plot.add(lampPost(0.75), x, 0, WALK.z0 - 0.3);
    solid(GROUND, x - 0.14, x + 0.14, WALK.z0 - 0.44, WALK.z0 - 0.16);
  }
  // one tall lamp where the house's bridge lands
  plot.add(lampPost(), -6.35, 0, WALK.z0 - 0.35);
  solid(GROUND, -6.49, -6.21, WALK.z0 - 0.49, WALK.z0 - 0.21);

  // left of the door: the sign, standing in its own bed
  bed(-6.15, -3.8, FRONT + 0.1, FRONT + 0.95);
  plot.add(sign('Museum of work'), -4.97, 0, FRONT + 0.62);
  plot.put('Bush_1_A_Color1', -5.85, 0, FRONT + 0.4, { scale: 1.5, rotation: 1 });
  plot.put('Bush_1_A_Color1', -4.1, 0, FRONT + 0.35, { scale: 1.3, rotation: 2.4 });
  tuft(-5.45, FRONT + 0.3, true, 0.4);
  tuft(-4.55, FRONT + 0.3, true, 2);

  // right of the door: a clipped row against the wall, then the bench
  bed(0.55, 3.45, FRONT + 0.1, FRONT + 0.95);
  [1.05, 2.0, 2.95].forEach((x, i) => plot.put('Bush_3_A_Color1', x, 0, FRONT + 0.52, { scale: 0.74, rotation: i * 1.3 }));
  plot.add(table(1.5, 0.45, 0.42, palette.woodDark), 4.5, 0, FRONT + 0.5);
  solid(GROUND, 3.75, 5.25, FRONT + 0.29, FRONT + 0.71);

  // along the water, in front of the promenade: low and evenly paced, and open opposite the door
  const EDGE = (WALK.z1 + MUSEUM.z1) / 2;
  plot.put('Bush_3_A_Color1', -5.3, 0, EDGE, { scale: 0.68, rotation: 0.4, collide: GROUND, pad: -0.08 });
  plot.put('Bush_3_A_Color1', 0.7, 0, EDGE, { scale: 0.68, rotation: 2.1, collide: GROUND, pad: -0.08 });
  plot.put('Bush_3_A_Color1', 6.5, 0, EDGE, { scale: 0.68, rotation: 3.3, collide: GROUND, pad: -0.08 });
  plot.put('Rock_1_A_Color1', 2.5, 0, EDGE, { scale: 1.0, rotation: 0.7, collide: GROUND, pad: -0.1 });
  plot.put('Tree_3_A_Color1', 4.6, 0, EDGE - 0.05, { scale: 0.55, rotation: 3 });
  solid(GROUND, 4.35, 4.85, EDGE - 0.3, EDGE + 0.2);
  tuft(-4.4, EDGE + 0.1, false, 0.3);
  tuft(-3.3, EDGE - 0.05, true, 1.2);
  tuft(-2.9, EDGE + 0.15, false, 2);
  tuft(1.6, EDGE + 0.1, false, 1);
  tuft(3.2, EDGE - 0.05, false, 2.6);
  tuft(5.5, EDGE + 0.1, true, 0.2);

  // the west end, where the house's bridge lands
  plot.put('Bush_4_A_Color1', -7.1, 0, 3.4, { scale: 1.4, rotation: 0.3, collide: GROUND, pad: -0.1 });
  tuft(-7.8, 4.1, true, 0.5);

  // the east side: a bed against the wall, and a lamp to find the side door by
  const gapX = (ROOM.x1 + T + EAST.x0) / 2;
  bed(ROOM.x1 + T + 0.1, EAST.x0 - 0.1, -0.6, 2.9);
  [0.0, 1.15, 2.3].forEach((z, i) => plot.put('Bush_3_A_Color1', gapX, 0, z, { scale: 0.62, rotation: 1 + i * 1.7 }));
  plot.add(lampPost(), gapX, 0, SIDE_DOOR_Z + 1.55);
  solid(GROUND, gapX - 0.14, gapX + 0.14, SIDE_DOOR_Z + 1.41, SIDE_DOOR_Z + 1.69);
  plot.put('Bush_4_A_Color1', 6.05, 0, -5.6, { scale: 1.0, rotation: 2, collide: GROUND, pad: -0.1 });
  tuft(6.2, -4.5, true, 1);

  // pines behind the walls: narrow enough not to push through them
  plot.put('Tree_4_A_Color1', -3.4, 0, -5.75, { scale: 0.9, rotation: 2 });
  plot.put('Tree_4_A_Color1', 2.6, 0, -5.8, { scale: 0.72, rotation: 1 });
  plot.put('Tree_4_A_Color1', -7.25, 0, -0.4, { scale: 0.85, rotation: 2.5 });
  plot.put('Tree_4_A_Color1', -7.3, 0, -3.7, { scale: 0.62, rotation: 0.4 });
}
