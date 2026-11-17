import * as THREE from 'three';
import type { Library } from '../assets/library';
import type { Player } from '../player/controls';
import { inkLines } from '../style/materials';
import { light, palette } from '../style/palette';
import { box, bridge } from './builders';
import { fadeable } from './fade';
import { buildHome, HOME, HOME_BRIDGE_X, HOME_ZIP, TERRACE_Y } from './home';
import { buildLab, LAB, LAB_BRIDGE_X, LAB_ROOF_Y, LAB_ZIP, STOREY } from './lab';
import { buildMuseum, MUSEUM, MUSEUM_HOME_BRIDGE_X, MUSEUM_LAB_BRIDGE_X } from './museum';
import { Plot, type AABB, type Place, type Usable } from './plot';

export type { AABB, Choice, Panel, Place, Ui, Usable } from './plot';

/** A part of the world as the camera sees it: where its middle is, and how much screen it needs, in metres. */
export interface View {
  center: THREE.Vector3;
  w: number;
  h: number;
}

export interface World {
  root: THREE.Group;
  /** Floor height of each walkable level. */
  levelY: number[];
  /** Per level: the box around everything walkable, for path planning. */
  bounds: AABB[];
  /** Per level: the rectangles you can stand on. Islands, bridges, upper floors. */
  floors: AABB[][];
  /** Per level: the rectangles you cannot walk through. */
  colliders: AABB[][];
  spawn: THREE.Vector3;
  usables: Usable[];
  places: Place[];
  /** The museum alone: what the page frames while it is a portfolio. */
  main: View;
  /** The museum's island: the only part of the world there is while the page is a portfolio. */
  museum: THREE.Object3D;
  /** The inner edge of each neighbour, house then lab: where the museum's frame ends and theirs begins. */
  seams: [THREE.Vector3, THREE.Vector3];
  /** How much of the rest of the world is there, 0 to 1: the house and the lab (main.ts masks those) and the bridges to them. */
  reveal: (level: number) => void;
  update: (dt: number, time: number, who: Player | null) => void;
}

// The world is three islands in a row across the screen, which in this projection means a
// diagonal across the map: the house to the left (+z, -x), the lab to the right (-z, +x),
// the museum between them. Each island is laid out in its own coordinates, in its own file.
const GAP = 3.5; // water between islands, which is also how long the bridges are
const BRIDGE_W = 1.4;

/** Levels are numbered across the whole world. */
const GROUND = 0;
const TERRACE = 1;
const LAB_FIRST = 2;
const LAB_ROOF = 3;

// The zip line: from the lab's roof down to the house's terrace, right over the museum. One way, as they are.
/** How far below the line your feet hang. */
const ZIP_HANG = 2.15;
const ZIP_SPEED = 9;
/** You let go this far short of the far pole, this high over the terrace, and drop the rest. */
const ZIP_SHORT = 2.0;
const ZIP_DROP = 0.9;
/** How far the line sags below straight at its middle, in metres. */
const ZIP_SAG = 0.8;
/** How many straight pieces the sagging line is drawn and ridden in. */
const ZIP_PIECES = 32;

const RIGHT = new THREE.Vector3(1, 0, -1).normalize();
const UP = new THREE.Vector3(-1, 2, -1).normalize();

/** Measure what the isometric camera would need to show these objects whole: vertex by vertex, so the page can line type up with the drawing's real edges. */
function viewOf(objects: THREE.Object3D[]): View {
  const lo = new THREE.Vector2(Infinity, Infinity);
  const hi = new THREE.Vector2(-Infinity, -Infinity);
  const corner = new THREE.Vector3();
  for (const object of objects) {
    object.updateWorldMatrix(true, true);
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible || (mesh as { isLineSegments2?: boolean }).isLineSegments2) return;
      if ((mesh.material as THREE.Material).userData.isHull) return;
      const position = mesh.geometry.getAttribute('position');
      if (!position) return;
      for (let i = 0; i < position.count; i++) {
        corner.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        const x = corner.dot(RIGHT);
        const y = corner.dot(UP);
        lo.set(Math.min(lo.x, x), Math.min(lo.y, y));
        hi.set(Math.max(hi.x, x), Math.max(hi.y, y));
      }
    });
  }
  const center = RIGHT.clone()
    .multiplyScalar((lo.x + hi.x) / 2)
    .addScaledVector(UP, (lo.y + hi.y) / 2);
  return { center, w: hi.x - lo.x, h: hi.y - lo.y };
}

export function buildWorld(lib: Library): World {
  const root = new THREE.Group();
  const colliders: AABB[][] = [];
  const floors: AABB[][] = [];

  const museum = new Plot(lib, 0, 0, colliders, floors);
  const home = new Plot(lib, MUSEUM_HOME_BRIDGE_X - HOME_BRIDGE_X, MUSEUM.z1 + GAP - HOME.z0, colliders, floors);
  const lab = new Plot(lib, MUSEUM_LAB_BRIDGE_X - LAB_BRIDGE_X, MUSEUM.z0 - GAP - LAB.z1, colliders, floors);
  const plots = [home, museum, lab];
  root.add(...plots.map((p) => p.root));

  // the zip line hangs between two islands, so it is worked out here and each end told where it is.
  // `feetAt(d)` is where a rider's feet are `d` metres along it; the line itself runs ZIP_HANG above that.
  const launch = lab.at(LAB_ZIP.x, LAB_ROOF_Y + LAB_ZIP.h, LAB_ZIP.z);
  const farPole = home.at(HOME_ZIP.x, 0, HOME_ZIP.z);
  const along = new THREE.Vector3(farPole.x - launch.x, 0, farPole.z - launch.z);
  const zipRun = along.length() - ZIP_SHORT;
  along.normalize();
  const zipFall = (launch.y - (TERRACE_Y + ZIP_DROP)) / zipRun;
  // made fast at the mast (a little behind the launch box) and at the far pole, slack in between
  const zipStart = -0.8;
  const zipEnd = zipRun + ZIP_SHORT;
  const slack = (d: number) => {
    const t = (d - zipStart) / (zipEnd - zipStart);
    return ZIP_SAG * 4 * t * (1 - t);
  };
  const feetAt = (d: number) => launch.clone().addScaledVector(along, d).setY(launch.y - zipFall * d - slack(d));
  const lineAt = (d: number) => feetAt(d).setY(launch.y - zipFall * d - slack(d) + ZIP_HANG);
  const mastTop = lineAt(zipStart);
  const poleTop = lineAt(zipEnd);
  const line: number[] = [];
  for (let i = 0; i < ZIP_PIECES; i++) {
    const a = lineAt(zipStart + ((zipEnd - zipStart) * i) / ZIP_PIECES);
    const b = lineAt(zipStart + ((zipEnd - zipStart) * (i + 1)) / ZIP_PIECES);
    line.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  // the ride follows the same curve, so the rider stays under the line the whole way
  const ride = Array.from({ length: ZIP_PIECES }, (_, i) => feetAt((zipRun * (i + 1)) / ZIP_PIECES));

  const house = buildHome(home, TERRACE);
  const hall = buildMuseum(museum);
  const tower = buildLab(lab, [GROUND, LAB_FIRST, LAB_ROOF], new THREE.Vector3(mastTop.x - lab.ox, mastTop.y, mastTop.z - lab.oz));

  // ---------------------------------------------------------------- bridges
  // both run along z; each overlaps the land at either end so there is a way on and off
  const bridges = new THREE.Group();
  root.add(bridges);
  const span = (x: number, z0: number) => {
    const b = bridge(GAP, BRIDGE_W);
    b.position.set(x, 0, z0);
    b.rotation.y = -Math.PI / 2;
    bridges.add(b);
    floors[GROUND].push({ x0: x - BRIDGE_W / 2, x1: x + BRIDGE_W / 2, z0: z0 - 0.6, z1: z0 + GAP + 0.6 });
    return b;
  };
  span(MUSEUM_HOME_BRIDGE_X, MUSEUM.z1);
  span(MUSEUM_LAB_BRIDGE_X, MUSEUM.z0 - GAP);

  // --------------------------------------------------------------- zip line
  // the line, its far pole and the handle are only there while you are at the lab, where the ride starts,
  // and stay until you are off it at the other end
  const zipline = new THREE.Group();
  root.add(zipline);
  zipline.add(inkLines(line, 1.8));
  const pole = box(0.12, poleTop.y + 0.2 - TERRACE_Y, 0.12, palette.woodDark, { line: 1.1 });
  pole.position.set(farPole.x, TERRACE_Y, farPole.z);
  const poleCap = box(0.22, 0.08, 0.22, palette.metal, { line: 1.1 });
  poleCap.position.set(farPole.x, poleTop.y + 0.2, farPole.z);
  zipline.add(pole, poleCap);
  home.solid(TERRACE, HOME_ZIP.x - 0.14, HOME_ZIP.x + 0.14, HOME_ZIP.z - 0.14, HOME_ZIP.z + 0.14);

  // the handle: a runner on the line and a bar to hold, set square to the way it travels
  const handle = new THREE.Group();
  const runner = box(0.1, 0.12, 0.26, palette.metal, { line: 1.1 });
  runner.position.y = -0.06;
  const strap = box(0.035, 0.26, 0.035, palette.trunk, { line: 1 });
  strap.position.y = -0.32;
  const grip = box(0.56, 0.05, 0.05, palette.yellow, { line: 1.1 });
  grip.position.y = -0.36;
  handle.add(runner, strap, grip);
  handle.rotation.y = Math.atan2(along.x, along.z);
  handle.position.copy(lineAt(0));
  zipline.add(handle);
  let riding = false;
  /** From the first step up onto the box until the feet are on the terrace. */
  let zipping = false;
  let zipShown = 0;
  let revealed = 0;
  let handleAt = 0;

  // the launch box is in the lab's own drawing; this is the thing you click, a generous box around it
  const zipHit = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3.2, 1.4), new THREE.MeshBasicMaterial());
  zipHit.position.copy(launch).setY(launch.y + 0.6);
  zipHit.visible = false;
  zipHit.userData.noShadow = true;
  root.add(zipHit);
  const roofY = LAB_ROOF_Y;
  const zipStand = lab.at(LAB_ZIP.x + 1.65, roofY, LAB_ZIP.z);
  const zip: Usable = {
    level: LAB_ROOF,
    anchor: launch.clone().setY(launch.y + 2.5),
    stand: zipStand,
    radius: 1.0,
    target: zipHit,
    label: () => 'Ride the zip line',
    use: ({ player }) => {
      // up the two steps onto the box, off along the line, and a short drop onto the terrace
      const steps = [
        zipStand,
        lab.at(LAB_ZIP.x + 1.12, roofY + LAB_ZIP.h / 3, LAB_ZIP.z),
        lab.at(LAB_ZIP.x + 0.77, roofY + (LAB_ZIP.h * 2) / 3, LAB_ZIP.z),
        launch,
      ];
      const landing = feetAt(zipRun).setY(TERRACE_Y);
      zipping = true;
      player.follow(steps, LAB_ROOF, () => {
        riding = true;
        player.follow(
          ride,
          LAB_ROOF,
          () => player.follow([landing], TERRACE, () => (riding = zipping = false), true, { speed: 4, air: true }),
          true,
          { speed: ZIP_SPEED, air: true },
        );
      });
    },
  };

  // ---------------------------------------------------------------- light
  const middle = new THREE.Vector3((home.ox + HOME.x0 + lab.ox + LAB.x1) / 2, 0, (lab.oz + LAB.z0 + home.oz + HOME.z1) / 2);
  const reach = Math.hypot(lab.ox + LAB.x1 - (home.ox + HOME.x0), home.oz + HOME.z1 - (lab.oz + LAB.z0)) / 2 + 2;
  const sun = new THREE.DirectionalLight(light.sun, light.sunIntensity);
  sun.position
    .set(...light.sunFrom)
    .normalize()
    .multiplyScalar(reach + 20)
    .add(middle);
  sun.target.position.copy(middle);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: reach * 2 + 40 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  root.add(sun, sun.target);
  root.add(new THREE.HemisphereLight(light.sky, light.ground, light.ambientIntensity));

  // everything solid casts and catches the sun; ink lines and hulls never do
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as { isLineSegments2?: boolean }).isLineSegments2) return;
    if ((mesh.material as THREE.Material).userData.isHull) return;
    mesh.receiveShadow = true;
    if (!mesh.userData.noShadow) mesh.castShadow = mesh.castShadow || mesh.geometry.type !== 'PlaneGeometry';
  });

  // the bridges lead nowhere until there is somewhere to go, so they fade in with the islands they reach
  const crossings = fadeable(bridges);
  const zipFade = fadeable(zipline);
  zipFade.set(0);
  const atLab = (p: THREE.Vector3) =>
    p.x >= lab.ox + LAB.x0 && p.x <= lab.ox + LAB.x1 && p.z >= lab.oz + LAB.z0 && p.z <= lab.oz + LAB.z1;

  const bounds = floors.map((rects) => ({
    x0: Math.min(...rects.map((r) => r.x0)),
    x1: Math.max(...rects.map((r) => r.x1)),
    z0: Math.min(...rects.map((r) => r.z0)),
    z1: Math.max(...rects.map((r) => r.z1)),
  }));

  const levelY: number[] = [];
  levelY[GROUND] = 0;
  levelY[TERRACE] = house.terraceY;
  levelY[LAB_FIRST] = STOREY;
  levelY[LAB_ROOF] = LAB_ROOF_Y;

  return {
    root,
    levelY,
    bounds,
    floors,
    colliders,
    spawn: hall.spawn,
    usables: [...plots.flatMap((p) => p.usables), zip],
    places: [house.place, hall.place, tower.place],
    main: viewOf([museum.root]),
    museum: museum.root,
    // the house's corner nearest screen right, the lab's nearest screen left
    seams: [home.at(HOME.x1, 0, HOME.z0), lab.at(LAB.x0, 0, LAB.z1)],
    reveal: (level) => {
      crossings.set(level);
      revealed = level;
      // gone is gone: nothing to draw, and nothing to cast a shadow
      home.root.visible = lab.root.visible = level > 0;
    },
    update: (dt, time, who) => {
      for (const p of plots) for (const tick of p.ticks) tick(dt, time, who);
      // the handle goes down the line with whoever holds it, then runs back up for the next ride
      if (riding && who) handleAt = THREE.MathUtils.clamp(who.position.clone().sub(launch).setY(0).dot(along), 0, zipRun);
      else handleAt = Math.max(0, handleAt - dt * 7);
      handle.position.copy(lineAt(handleAt));
      const want = who && (zipping || atLab(who.position)) ? 1 : 0;
      zipShown += (want - zipShown) * Math.min(1, dt * 6);
      if (Math.abs(want - zipShown) < 0.01) zipShown = want;
      zipFade.set(zipShown * revealed);
    },
  };
}
