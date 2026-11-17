import * as THREE from 'three';
import { footprint, type AssetName, type Library, type PlaceOptions } from '../assets/library';
import type { Player } from '../player/controls';

export interface AABB {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  enabled?: boolean;
}

/** What opens over the world when something is read. A study is the big sheet, a note the small card. */
export interface Panel {
  kind: 'note' | 'study';
  eyebrow?: string;
  title: string;
  text: string;
}

/** What a thing in the world can ask of the page when it is used. */
export interface Ui {
  player: Player;
  open: (panel: Panel) => void;
  /** A line of speech, floating over `from` until the visitor walks off. */
  say: (from: THREE.Vector3, text: string) => void;
  /** Hold the visitor where they are and offer arrows pinned over `from`; one must be picked. */
  choose: (from: THREE.Vector3, prompt: string, options: Choice[]) => void;
}

/** One way to go from a `Ui.choose`: an arrow button, also bound to that arrow key. */
export interface Choice {
  dir: 'up' | 'down' | 'left' | 'right';
  label: string;
  pick: () => void;
}

/** Something the visitor can walk up to and use. Positions are in world space. */
export interface Usable {
  level: number;
  /** Where the little key prompt floats. */
  anchor: THREE.Vector3;
  /** Where the character should be (x, z) and how close counts as "there". */
  stand: THREE.Vector3;
  radius: number;
  /** Object that can be clicked to trigger this. */
  target: THREE.Object3D;
  label: () => string;
  use: (ui: Ui) => void;
}

/** A place worth naming on the map. */
export interface Place {
  name: string;
  note: string;
  /** Where its caption hangs: the near corner of the land it stands on. */
  anchor: THREE.Vector3;
}

type PutOptions = PlaceOptions & { collide?: number; pad?: number; parent?: THREE.Object3D };

/**
 * One island under construction. Everything is laid out in the island's own
 * coordinates; the plot knows where the island sits and reports colliders,
 * floors and anchors to the world in world space.
 */
export class Plot {
  readonly root = new THREE.Group();
  readonly usables: Usable[] = [];
  readonly ticks: ((dt: number, time: number, who: Player | null) => void)[] = [];

  constructor(
    readonly lib: Library,
    readonly ox: number,
    readonly oz: number,
    private readonly colliders: AABB[][],
    private readonly floors: AABB[][],
  ) {
    this.root.position.set(ox, 0, oz);
  }

  /** A point on this island, in world space. */
  at(x: number, y: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x + this.ox, y, z + this.oz);
  }

  /** Block movement through a rectangle on one level. */
  solid(level: number, x0: number, x1: number, z0: number, z1: number): AABB {
    const c = { x0: x0 + this.ox, x1: x1 + this.ox, z0: z0 + this.oz, z1: z1 + this.oz, enabled: true };
    (this.colliders[level] ??= []).push(c);
    return c;
  }

  /** Somewhere to stand: a rectangle of ground (or of an upper storey) the visitor may walk on. */
  floor(level: number, x0: number, x1: number, z0: number, z1: number): void {
    (this.floors[level] ??= []).push({ x0: x0 + this.ox, x1: x1 + this.ox, z0: z0 + this.oz, z1: z1 + this.oz });
    this.colliders[level] ??= [];
  }

  add<T extends THREE.Object3D>(obj: T, x = obj.position.x, y = obj.position.y, z = obj.position.z): T {
    obj.position.set(x, y, z);
    this.root.add(obj);
    return obj;
  }

  /** Drop an imported model onto the island, optionally blocking movement on a level. */
  put(name: AssetName, x: number, y: number, z: number, opts: PutOptions = {}): THREE.Group {
    const obj = this.lib.get(name, opts);
    obj.position.set(x, y, z);
    (opts.parent ?? this.root).add(obj);
    if (opts.collide !== undefined) {
      // already in world space: the footprint is measured through the island's own offset
      const f = footprint(obj, opts.pad ?? 0);
      (this.colliders[opts.collide] ??= []).push({ ...f, enabled: true });
    }
    return obj;
  }
}
