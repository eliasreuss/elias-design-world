import type { AABB } from '../world/scene';

type Point = [number, number];

/**
 * Grid A* over the walkable area, then string-pulled so the character walks
 * in straight lines between corners. If the goal is blocked or cut off, heads
 * for the closest point it can actually reach. Returns null if that is here.
 */
export function findPath(
  from: Point,
  to: Point,
  bounds: AABB,
  blocked: (x: number, z: number) => boolean,
  cell = 0.2,
): Point[] | null {
  const nx = Math.ceil((bounds.x1 - bounds.x0) / cell);
  const nz = Math.ceil((bounds.z1 - bounds.z0) / cell);
  const cx = (i: number) => bounds.x0 + (i + 0.5) * cell;
  const cz = (j: number) => bounds.z0 + (j + 0.5) * cell;
  const toI = (x: number) => Math.min(nx - 1, Math.max(0, Math.floor((x - bounds.x0) / cell)));
  const toJ = (z: number) => Math.min(nz - 1, Math.max(0, Math.floor((z - bounds.z0) / cell)));

  const free = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) free[j * nx + i] = blocked(cx(i), cz(j)) ? 0 : 1;

  const start = toJ(from[1]) * nx + toI(from[0]);
  free[start] = 1; // we are standing here, so it is walkable

  // nearest free cell to the goal
  let goal = toJ(to[1]) * nx + toI(to[0]);
  if (!free[goal]) {
    let best = -1;
    let bestD = Infinity;
    const gi = goal % nx;
    const gj = Math.floor(goal / nx);
    for (let r = 1; r < 12 && best < 0; r++) {
      for (let j = gj - r; j <= gj + r; j++) {
        for (let i = gi - r; i <= gi + r; i++) {
          if (i < 0 || j < 0 || i >= nx || j >= nz || !free[j * nx + i]) continue;
          const d = (i - gi) ** 2 + (j - gj) ** 2;
          if (d < bestD) {
            bestD = d;
            best = j * nx + i;
          }
        }
      }
    }
    if (best < 0) return null;
    goal = best;
  }

  const g = new Float32Array(nx * nz).fill(Infinity);
  const came = new Int32Array(nx * nz).fill(-1);
  const closed = new Uint8Array(nx * nz);
  const open: number[] = [start];
  const f = new Float32Array(nx * nz).fill(Infinity);
  const h = (n: number) => {
    const dx = Math.abs((n % nx) - (goal % nx));
    const dz = Math.abs(Math.floor(n / nx) - Math.floor(goal / nx));
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  g[start] = 0;
  f[start] = h(start);
  let closest = start;

  while (open.length) {
    let k = 0;
    for (let m = 1; m < open.length; m++) if (f[open[m]] < f[open[k]]) k = m;
    const n = open[k];
    open[k] = open[open.length - 1];
    open.pop();
    if (n === goal) break;
    if (closed[n]) continue;
    closed[n] = 1;
    if (h(n) < h(closest)) closest = n;
    const i = n % nx;
    const j = Math.floor(n / nx);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const m = jj * nx + ii;
        if (!free[m] || closed[m]) continue;
        // no cutting corners past obstacles
        if (di && dj && (!free[j * nx + ii] || !free[jj * nx + i])) continue;
        const cost = g[n] + (di && dj ? Math.SQRT2 : 1);
        if (cost < g[m]) {
          g[m] = cost;
          f[m] = cost + h(m);
          came[m] = n;
          open.push(m);
        }
      }
    }
  }
  const reached = goal === start || came[goal] >= 0;
  if (!reached) goal = closest;
  if (goal === start) return null;

  const cells: Point[] = [];
  for (let n = goal; n !== start && n >= 0; n = came[n]) cells.push([cx(n % nx), cz(Math.floor(n / nx))]);
  cells.reverse();
  // end exactly on the requested point when it is reachable
  if (reached && free[toJ(to[1]) * nx + toI(to[0])]) cells[cells.length - 1] = to;

  // string-pull: skip every waypoint we can already see past
  const clear = (a: Point, b: Point) => {
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (cell * 0.4));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      if (blocked(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false;
    }
    return true;
  };
  const path: Point[] = [];
  let here = from;
  let idx = 0;
  while (idx < cells.length) {
    let far = idx;
    for (let k = cells.length - 1; k > idx; k--) {
      if (clear(here, cells[k])) {
        far = k;
        break;
      }
    }
    path.push(cells[far]);
    here = cells[far];
    idx = far + 1;
  }
  return path;
}
