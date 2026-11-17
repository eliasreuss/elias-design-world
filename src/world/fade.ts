import * as THREE from 'three';

export interface Fade {
  /** Ease towards `goal` (0 gone, 1 solid) over a fraction of a second. */
  to: (goal: number, dt: number) => void;
  /** Jump straight to a level, for a fade something else is already easing. */
  set: (level: number) => void;
}

/**
 * Let a group fade in and out as one, ink and all. Its materials are shared with the rest of
 * the world, so the group gets its own copies first; it stays opaque (and cheap) while solid.
 */
export function fadeable(group: THREE.Object3D, speed = 7): Fade {
  const mats: THREE.Material[] = [];
  const meshes: THREE.Mesh[] = [];
  const copies = new Map<THREE.Material, THREE.Material>();
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.material || Array.isArray(mesh.material)) return;
    let own = copies.get(mesh.material);
    if (!own) {
      const base = mesh.material;
      own = base.clone();
      // clone() drops the shader patches that give surfaces their grain and hulls their width
      own.onBeforeCompile = base.onBeforeCompile;
      own.customProgramCacheKey = base.customProgramCacheKey;
      own.userData = { ...base.userData };
      copies.set(base, own);
      mats.push(own);
    }
    mesh.material = own;
    if ((mesh as THREE.Mesh).isMesh) meshes.push(mesh);
  });
  const casts = meshes.map((m) => m.castShadow);

  let level = 1;
  function apply(): void {
    const solid = level === 1;
    for (const m of mats) {
      if (m.transparent !== !solid) {
        m.transparent = !solid;
        m.needsUpdate = true;
      }
      m.opacity = level;
      m.depthWrite = solid;
    }
    group.visible = level > 0;
    // a floor you can see through shouldn't still throw its shadow on you
    meshes.forEach((m, i) => (m.castShadow = casts[i] && level > 0.5));
  }
  return {
    to(goal, dt) {
      if (level === goal) return;
      level += (goal - level) * Math.min(1, dt * speed);
      if (Math.abs(goal - level) < 0.01) level = goal;
      apply();
    },
    set(next) {
      if (level === next) return;
      level = next;
      apply();
    },
  };
}
