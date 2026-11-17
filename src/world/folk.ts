import * as THREE from 'three';
import { Character, type Outfit } from '../player/character';
import { cat, walkingCat } from './builders';
import { passersby } from './doors';
import type { Plot } from './plot';

export interface Person {
  /** Where they stand, in the island's own coordinates. */
  x: number;
  z: number;
  /** Which way they look when left alone: 0 faces +z, a quarter turn faces +x. */
  heading: number;
  outfit: Outfit;
  /** What the prompt offers. */
  label: string;
  /** Said one at a time, in order, round and round. */
  lines: string[];
  /** Where the visitor stands to talk, when it is not simply "close by" (a counter in the way, say). */
  stand?: [number, number];
  /** Sitting down: they stay put, and do not turn round to whoever speaks. */
  seated?: boolean;
}

/** Someone to talk to. They turn to whoever speaks to them, and back to what they were doing afterwards. */
export function person(plot: Plot, who: Person): Character {
  const figure = new Character(plot.lib, { waves: false, ...who.outfit });
  figure.turnTo(who.heading);
  plot.add(figure.group, who.x, 0, who.z);
  // whoever is sitting is already inside what they sit on
  if (!who.seated) plot.solid(0, who.x - 0.25, who.x + 0.25, who.z - 0.25, who.z + 0.25);

  const here = plot.at(who.x, 0, who.z);
  const stand = who.stand ? plot.at(who.stand[0], 0, who.stand[1]) : here;
  const radius = who.stand ? 1.0 : 1.5;
  let next = 0;
  let listening = false;

  plot.ticks.push((dt, _time, visitor) => {
    if (listening && visitor) {
      const away = Math.hypot(visitor.position.x - stand.x, visitor.position.z - stand.z);
      if (away > radius * 1.6 || visitor.level !== 0) {
        listening = false;
        if (!who.seated) figure.face(Math.sin(who.heading), Math.cos(who.heading));
      }
    }
    figure.update(dt, false);
  });

  plot.usables.push({
    level: 0,
    anchor: here.clone().setY(2.3),
    stand,
    radius,
    target: figure.group,
    label: () => who.label,
    use: ({ player, say }) => {
      listening = true;
      if (!who.seated) figure.face(player.position.x - here.x, player.position.z - here.z);
      say(here.clone().setY(2.15), who.lines[next++ % who.lines.length]);
    },
  });
  return figure;
}

/** A place on a stroll. With `wait` they stop there for that many seconds, looking along `look` if it is given. */
export interface Stop {
  x: number;
  z: number;
  look?: number;
  wait?: number;
}

export interface Stroller {
  outfit: Outfit;
  label: string;
  lines: string[];
  /** Walked in order, round and round, in straight lines: lay it where nothing is in the way. */
  route: Stop[];
  /** Metres a second. An ambling pace by default. */
  speed?: number;
}

/** The visitor's own walking speed, which the walk animation is timed to. */
const STRIDE = 2.8;
/** Strollers stop for anyone this close, and set off again once they have this much room. */
const GIVE_WAY = 1.15;
const ROOM_TO_GO = 1.5;

/**
 * Someone with somewhere to be: they walk their route, stop to look at things, and can be spoken to
 * wherever they are. They never walk into the visitor: they wait until there is room.
 */
export function stroller(plot: Plot, who: Stroller): Character {
  const figure = new Character(plot.lib, { waves: false, ...who.outfit });
  const speed = who.speed ?? 1.05;
  figure.gait = speed / STRIDE;
  const { route } = who;
  const turn = (heading: number) => figure.face(Math.sin(heading), Math.cos(heading));

  // island coordinates for walking, world coordinates for everything the visitor meets
  let x = route[0].x;
  let z = route[0].z;
  let next = 1 % route.length;
  let wait = route[0].wait ?? 0;
  if (route[0].look !== undefined) figure.turnTo(route[0].look);
  plot.add(figure.group, x, 0, z);
  // doors open for them as they do for the visitor
  passersby.push(figure.group);
  const body = plot.solid(0, x - 0.25, x + 0.25, z - 0.25, z + 0.25);
  const here = plot.at(x, 0, z);
  const anchor = here.clone().setY(2.3);
  let line = 0;
  let stopped = false;
  let listening = false;

  plot.ticks.push((dt, _time, visitor) => {
    const away = visitor && visitor.level === 0 ? Math.hypot(visitor.position.x - here.x, visitor.position.z - here.z) : Infinity;
    stopped = away < (stopped ? ROOM_TO_GO : GIVE_WAY);
    if (!stopped && listening) {
      listening = false;
      const at = route[(next + route.length - 1) % route.length];
      if (wait > 0 && at.look !== undefined) turn(at.look);
    }

    let moving = false;
    if (stopped) {
      // standing aside: the walk, and whatever they were looking at, can wait
    } else if (wait > 0) {
      wait -= dt;
    } else {
      const goal = route[next];
      const dx = goal.x - x;
      const dz = goal.z - z;
      const left = Math.hypot(dx, dz);
      const step = speed * dt;
      if (left <= step) {
        x = goal.x;
        z = goal.z;
        wait = goal.wait ?? 0;
        if (goal.look !== undefined) turn(goal.look);
        next = (next + 1) % route.length;
      } else {
        x += (dx / left) * step;
        z += (dz / left) * step;
        figure.face(dx, dz);
        moving = true;
      }
      figure.group.position.set(x, 0, z);
      here.copy(plot.at(x, 0, z));
      anchor.set(here.x, 2.3, here.z);
      Object.assign(body, { x0: here.x - 0.25, x1: here.x + 0.25, z0: here.z - 0.25, z1: here.z + 0.25 });
    }
    figure.update(dt, moving);
  });

  plot.usables.push({
    level: 0,
    anchor,
    // the same vector the tick keeps up to date: the prompt and the reach follow them round the room
    stand: here,
    radius: 1.5,
    target: figure.group,
    label: () => who.label,
    use: ({ player, say }) => {
      listening = true;
      stopped = true;
      figure.face(player.position.x - here.x, player.position.z - here.z);
      say(here.clone().setY(2.15), who.lines[line++ % who.lines.length]);
    },
  });
  return figure;
}

export interface HouseCat {
  color: string;
  label: string;
  lines: string[];
  /** Walked in order, round and round, in straight lines. It sits down wherever it is given a `wait`. */
  route: Stop[];
  /** Metres a second. */
  speed?: number;
  /** How much bigger than life it is drawn, so it reads from across the room. */
  size?: number;
}

/** A cat stops and sits for anyone this close, and is off again once they have backed away this far. */
const CAT_NEAR = 0.85;
const CAT_FAR = 1.25;

/**
 * A cat with the run of the place: it pads round its route, sits a while at each stop, and sits to
 * look at anyone who comes close or speaks to it. Nothing is ever blocked by it: you can step past a cat.
 */
export function housecat(plot: Plot, who: HouseCat): THREE.Group {
  const speed = who.speed ?? 0.75;
  const { route } = who;
  const walking = walkingCat(who.color);
  const sitting = cat(who.color);
  const group = new THREE.Group();
  group.add(walking.group, sitting);
  group.scale.setScalar(who.size ?? 1.2);
  // a cat is a small thing to click: a generous, unseen box round it
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.6).translate(0, 0.27, 0), new THREE.MeshBasicMaterial());
  hit.visible = false;
  hit.userData.noShadow = true;
  group.add(hit);

  let x = route[0].x;
  let z = route[0].z;
  let next = 1 % route.length;
  let wait = route[0].wait ?? 0;
  let heading = route[0].look ?? 0;
  let facing = heading;
  let stride = 0;
  let line = 0;
  let stopped = false;
  plot.add(group, x, 0, z);
  const here = plot.at(x, 0, z);
  const anchor = here.clone().setY(1.0);

  plot.ticks.push((dt, time, visitor) => {
    const dxv = visitor ? visitor.position.x - here.x : 0;
    const dzv = visitor ? visitor.position.z - here.z : 0;
    const away = visitor && visitor.level === 0 ? Math.hypot(dxv, dzv) : Infinity;
    const was = stopped;
    stopped = away < (stopped ? CAT_FAR : CAT_NEAR);
    // whoever is this close gets looked at; once they go, it turns back to what it was doing
    if (stopped) heading = Math.atan2(dxv, dzv);
    else if (was && wait > 0) heading = route[(next + route.length - 1) % route.length].look ?? heading;

    let moving = false;
    if (stopped) {
      // sat down in front of you: the round can wait
    } else if (wait > 0) {
      wait -= dt;
    } else {
      const goal = route[next];
      const dx = goal.x - x;
      const dz = goal.z - z;
      const left = Math.hypot(dx, dz);
      const step = speed * dt;
      if (left <= step) {
        x = goal.x;
        z = goal.z;
        wait = goal.wait ?? 0;
        if (goal.look !== undefined) heading = goal.look;
        next = (next + 1) % route.length;
      } else {
        x += (dx / left) * step;
        z += (dz / left) * step;
        heading = Math.atan2(dx, dz);
        moving = true;
      }
      group.position.set(x, 0, z);
      here.copy(plot.at(x, 0, z));
      anchor.set(here.x, 1.0, here.z);
    }

    // turn the short way round, quickly but not at once
    const turn = Math.atan2(Math.sin(heading - facing), Math.cos(heading - facing));
    facing += turn * Math.min(1, dt * 8);
    group.rotation.y = facing;

    // on its feet while it has somewhere to go; sat down whenever it stays put for more than a moment
    const sat = !moving && (stopped || wait > 0.4);
    sitting.visible = sat;
    walking.group.visible = !sat;
    stride = moving ? stride + dt * speed * 14 : 0;
    const swing = Math.sin(stride) * 0.55;
    // a walking cat moves its legs in diagonal pairs
    walking.legs.forEach((leg, i) => (leg.rotation.x = i === 0 || i === 3 ? swing : -swing));
    walking.group.position.y = moving ? Math.abs(Math.cos(stride)) * 0.012 : 0;
    walking.tail.rotation.z = Math.sin(time * 2.2) * 0.25;
  });

  plot.usables.push({
    level: 0,
    anchor,
    stand: here,
    radius: 1.3,
    target: group,
    label: () => who.label,
    use: ({ say }) => say(here.clone().setY(0.85), who.lines[line++ % who.lines.length]),
  });
  return group;
}
