import * as THREE from 'three';
import type { Door } from './builders';
import type { Plot } from './plot';

/**
 * Doors that see you coming. Each one swings open as anyone walks up to it and shuts a beat after
 * they have gone, so a doorway is never in the way and never needs a key pressed. Nothing blocks
 * the doorway itself: the door is always open by the time you reach it.
 */

/** Anyone besides the visitor who walks about on the ground and should be let through. */
export const passersby: THREE.Object3D[] = [];

/** Open within this many metres of the doorway's middle; shut again once everyone is further than `FAR`. */
const NEAR = 1.9;
const FAR = 2.3;
/** How long a door waits after you have gone before it swings to, so it doesn't slam on your heels. */
const LINGER = 0.5;

/**
 * Let a door open on its own. `open` is the pivot's angle when fully open (its sign is which way it
 * swings); `level` is the storey its doorway is on.
 */
export function autoDoor(plot: Plot, door: Door, open: number, level = 0): void {
  const middle = new THREE.Vector3();
  let placed = false;
  const swing = { x: door.pivot.rotation.y, v: 0 };
  let since = Infinity;

  plot.ticks.push((dt, _time, visitor) => {
    if (!placed) {
      door.group.updateWorldMatrix(true, false);
      middle.set(0.5, 0, 0.1).applyMatrix4(door.group.matrixWorld);
      placed = true;
    }
    const opened = swing.x / open > 0.5;
    const reach = opened ? FAR : NEAR;
    const close = (p: THREE.Vector3) => Math.hypot(p.x - middle.x, p.z - middle.z) < reach;
    let someone = !!visitor && visitor.level === level && close(visitor.position);
    for (const who of passersby) someone ||= close(who.getWorldPosition(at));
    since = someone ? 0 : since + dt;
    const goal = since < LINGER ? open : 0;

    // a soft spring: it swings open with a little give, and swings to more slowly than it opened
    const frames = Math.min(dt * 60, 3);
    const k = goal ? 0.09 : 0.05;
    swing.v += ((goal - swing.x) * k - swing.v * 0.3) * frames;
    swing.x += swing.v * frames;
    // shutting, it meets the frame and rebounds a touch rather than swinging on through it
    if (!goal && swing.x / open < 0) {
      swing.x = 0;
      swing.v = Math.abs(swing.v) > 0.004 ? -swing.v * 0.3 : 0;
    }
    door.pivot.rotation.y = swing.x;
  });
}

const at = new THREE.Vector3();
