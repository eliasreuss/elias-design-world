/**
 * The footprints in the invitation go for a walk while you point at it, or at the world.
 * They follow one drawn route: out of the icon, round the house with a curl or two on the way, and round
 * again for as long as you stay. Let go and the trail behind them fades, and the two feet, caught out,
 * look about them, turn round, and run home.
 */

const STRIDE = 11; // px between one print and the next, along the route
const SPREAD = 4; // px either side of the line they walk
const SPLAY = (7 * Math.PI) / 180; // toes turn out a little, as in the icon
const BEAT_START = 320; // ms per step when they set off
const BEAT_SETTLED = 240; // ...and once they have found their feet
const MARGIN = 28; // px the route keeps from the edge of the window
const MAX_PRINTS = 700;
const LINGER = 2000; // ms of pointing before they set off, so passing over is not enough

/**
 * Caught out: when you let go they freeze with a start, glance one way, then the other, then turn and run.
 * Each beat sets how far the feet have swung round from the way they were walking, and how long they hold it.
 */
const DISCOVERED = [
  { twist: 0, hold: 260 }, // the start: a little jump where they stand
  { twist: -0.7, hold: 340 }, // look left
  { twist: 0.7, hold: 340 }, // look right
  { twist: -0.3, hold: 220 }, // a last check
  { twist: Math.PI, hold: 200 }, // turn round
];
const RUN_BEAT = 62; // ms per step running home
const RUN_STRIDE_MIN = 16; // px per running step...
const RUN_STRIDE_MAX = 28; // ...longer when home is far, so the run never drags
const RUN_STEPS = 44; // aim to be home in about this many steps
const RUN_TURN = 0.55; // rad per step they can turn while running

// one foot pointing along +x: the same sole and heel as the icon
const FOOT =
  '<svg viewBox="0.6 -2.2 11.4 4.4" fill="currentColor" aria-hidden="true">' +
  '<ellipse cx="8.6" cy="0" rx="3.2" ry="2"/><circle cx="2.4" cy="0" r="1.6"/></svg>';

interface Point {
  x: number;
  y: number;
}

interface Spot extends Point {
  heading: number;
}

interface Print {
  el: HTMLElement;
  px: number;
  py: number;
  angle: number;
  /** how far the feet have swung round the walker, in radians */
  twist: number;
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The walk, as footfall spots one stride apart: a lead-in from the icon, then a lap round the house
 * that `lap` says where to start repeating from.
 */
function drawRoute(from: Point, house: DOMRect): { spots: Spot[]; lap: number } {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const cx = house.left + house.width / 2;
  const cy = house.top + house.height / 2;
  // the drawing is about one and a half times as wide as its box is tall; the route keeps a little air round it
  const rx = Math.min(house.height * 0.75, house.width * 0.45) + 56;
  const ry = house.height / 2 + 26;
  const ring = (t: number): Point => {
    const r = 1 + 0.05 * Math.sin(3 * t + 0.6); // not a perfect oval: a path someone actually walked
    return { x: cx + Math.cos(t) * rx * r, y: cy + Math.sin(t) * ry * r };
  };

  // the lap, densely, clockwise on screen, starting up and to the right of the house
  const t0 = -0.5;
  const lap: Point[] = [];
  for (let i = 0; i <= 1200; i++) lap.push(ring(t0 + (i / 1200) * Math.PI * 2));

  // two curls on the way round, each a little loop-the-loop on the outside of the path
  const lengths = [0];
  for (let i = 1; i < lap.length; i++) lengths.push(lengths[i - 1] + Math.hypot(lap[i].x - lap[i - 1].x, lap[i].y - lap[i - 1].y));
  const total = lengths[lengths.length - 1];
  const curls = [
    { at: 0.17, r: 26, span: 50 },
    { at: 0.62, r: 22, span: 44 },
  ];
  const curled = lap.map((p, i) => {
    const s = lengths[i];
    const a = lap[Math.max(0, i - 1)];
    const b = lap[Math.min(lap.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const tx = (b.x - a.x) / len;
    const ty = (b.y - a.y) / len;
    const out = { x: ty, y: -tx }; // outward, for a clockwise lap
    let x = p.x;
    let y = p.y;
    for (const c of curls) {
      const u = (s - (c.at * total - c.span / 2)) / c.span;
      if (u <= 0 || u >= 1) continue;
      const along = c.r * Math.sin(u * Math.PI * 2);
      const away = c.r * (1 - Math.cos(u * Math.PI * 2));
      x += tx * along + out.x * away;
      y += ty * along + out.y * away;
    }
    return { x, y };
  });

  // the lead-in: out of the icon heading right, swinging into the lap so it joins without a corner
  const start = curled[0];
  const nx = curled[6].x - start.x;
  const ny = curled[6].y - start.y;
  const nl = Math.hypot(nx, ny) || 1;
  const p1 = { x: from.x + 90, y: from.y };
  const p2 = { x: start.x - (nx / nl) * 90, y: start.y - (ny / nl) * 90 };
  const lead: Point[] = [];
  for (let i = 0; i < 120; i++) {
    const t = i / 120;
    const m = 1 - t;
    lead.push({
      x: m * m * m * from.x + 3 * m * m * t * p1.x + 3 * m * t * t * p2.x + t * t * t * start.x,
      y: m * m * m * from.y + 3 * m * m * t * p1.y + 3 * m * t * t * p2.y + t * t * t * start.y,
    });
  }

  // keep it all on screen, then pace it out into footfalls
  const dense = [...lead, ...curled].map((p) => ({
    x: Math.max(MARGIN, Math.min(w - MARGIN, p.x)),
    y: Math.max(MARGIN, Math.min(h - MARGIN, p.y)),
  }));
  const spots: Spot[] = [];
  let lapAt = 0;
  let need = STRIDE; // how far to the next footfall
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1];
    const b = dense[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    const heading = Math.atan2(b.y - a.y, b.x - a.x);
    let pos = 0;
    while (seg - pos >= need) {
      pos += need;
      const f = pos / seg;
      spots.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, heading });
      need = STRIDE;
    }
    need -= seg - pos;
    if (i === lead.length) lapAt = spots.length;
  }
  return { spots, lap: lapAt };
}

export interface Feet {
  /** something the feet answer to is being pointed at, or no longer is */
  point(source: string, on: boolean): void;
  /** gone at once, no run home: for when the page itself is going away */
  clear(): void;
}

export function wanderingFeet(
  button: HTMLButtonElement,
  icon: SVGElement,
  house: HTMLElement,
  calm: MediaQueryList,
): Feet {
  const layer = document.createElement('div');
  layer.className = 'trail';
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);

  let prints: Print[] = [];
  let state: 'still' | 'walking' | 'turning' | 'running' = 'still';
  let route: { spots: Spot[]; lap: number } = { spots: [], lap: 0 };
  let next = 0; // the spot on the route they step to next
  let joining = false; // back from a run home: walking over to the route before following it
  let walkedFor = 0;
  let x = 0; // where the walker stands, between its feet
  let y = 0;
  let heading = 0;
  let side = 1; // +1 right foot next, -1 left
  let runStride = RUN_STRIDE_MIN;

  // a twist swings the feet round the walker, not each round itself, so turning round swaps left and right
  const place = (p: Print): void => {
    const c = Math.cos(p.twist);
    const s = Math.sin(p.twist);
    const dx = p.px - x;
    const dy = p.py - y;
    const px = p.twist ? x + dx * c - dy * s : p.px;
    const py = p.twist ? y + dx * s + dy * c : p.py;
    p.el.style.transform = `translate(${px}px, ${py}px) rotate(${p.angle + p.twist}rad)`;
  };

  let look = 0; // which beat of DISCOVERED they are on
  const twist = (to: number): void => {
    for (const p of prints) {
      p.twist = to;
      place(p);
    }
  };

  const fade = (p: Print): void => {
    p.el.classList.add('gone');
    p.el.addEventListener('transitionend', () => p.el.remove(), { once: true });
    window.setTimeout(() => p.el.remove(), 800); // in case the transition never runs
  };

  const home = (): Point => {
    const box = icon.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  };

  /** a print where the walker now stands, on the foot whose turn it is */
  const lay = (): void => {
    const el = document.createElement('span');
    el.className = 'print';
    el.innerHTML = FOOT;
    const p: Print = {
      el,
      px: x - Math.sin(heading) * SPREAD * side,
      py: y + Math.cos(heading) * SPREAD * side,
      angle: heading + SPLAY * side,
      twist: 0,
    };
    place(p);
    layer.append(el);
    prints.push(p);
    side = -side;
  };

  /** one stride straight-ish towards a point, turning at most `turn` on the way; true once there */
  const towards = (target: Point, stride: number, turn: number): boolean => {
    const dx = target.x - x;
    const dy = target.y - y;
    if (Math.hypot(dx, dy) <= stride) return true;
    heading = wrap(heading + Math.max(-turn, Math.min(turn, wrap(Math.atan2(dy, dx) - heading))));
    x += Math.cos(heading) * stride;
    y += Math.sin(heading) * stride;
    lay();
    return false;
  };

  const walkStep = (): void => {
    walkedFor++;
    const spots = route.spots;
    if (!spots.length) return;
    if (next >= spots.length) next = route.lap; // round again
    if (joining) {
      if (!towards(spots[next], STRIDE, 0.45)) return;
      joining = false;
    }
    ({ x, y, heading } = spots[next]);
    next++;
    lay();
    if (prints.length > MAX_PRINTS) fade(prints.shift()!);
  };

  const runStep = (): void => {
    if (towards(home(), runStride, RUN_TURN)) {
      // home: the feet vanish and the icon has its feet back
      prints.forEach(fade);
      prints = [];
      state = 'still';
      button.classList.remove('wandering');
      return;
    }
    // running, only the two feet are ever down
    while (prints.length > 2) fade(prints.shift()!);
  };

  // one clock for every phase: steps are owed by time, not by timers, so a busy frame catches up instead of dawdling
  let frame = 0;
  let owed = 0;
  let lastTime = 0;

  const beat = (): number => {
    if (state === 'running') return RUN_BEAT;
    if (state === 'turning') return DISCOVERED[look].hold;
    return BEAT_START - (BEAT_START - BEAT_SETTLED) * Math.min(1, walkedFor / 20);
  };

  const tick = (now: number): void => {
    owed += Math.min(now - lastTime, 250);
    lastTime = now;
    while (state !== 'still' && owed >= beat()) {
      owed -= beat();
      if (state === 'walking') walkStep();
      else if (state === 'turning') {
        look++;
        if (look < DISCOVERED.length) twist(DISCOVERED[look].twist);
        else {
          // they turned round on the spot: run on from that way
          state = 'running';
          heading = wrap(heading + Math.PI);
          side = -side;
        }
      } else runStep();
    }
    frame = state === 'still' ? 0 : requestAnimationFrame(tick);
  };

  const run = (): void => {
    owed = 0;
    lastTime = performance.now();
    if (!frame) frame = requestAnimationFrame(tick);
  };

  const start = (): void => {
    if (state === 'walking') return;
    if (state === 'turning') {
      // caught mid-turn: face forward again and carry on along the route
      twist(0);
      for (const p of prints) p.el.classList.remove('startled');
    } else if (state === 'running') {
      // caught on the way home: walk back to the route where it is nearest, and pick it up from there
      let best = 0;
      let bestDist = Infinity;
      route.spots.forEach((s, i) => {
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      next = best;
      joining = true;
    } else {
      // setting off: the prints come out the size the icon draws them, along a route fitted to the page as it is now
      const box = icon.getBoundingClientRect();
      const scale = box.width / 20;
      layer.style.setProperty('--fw', `${11.4 * scale}px`);
      layer.style.setProperty('--fh', `${4.4 * scale}px`);
      ({ x, y } = home());
      route = drawRoute({ x, y }, house.getBoundingClientRect());
      next = 0;
      side = 1;
      joining = false;
      walkedFor = 0;
    }
    state = 'walking';
    button.classList.add('wandering');
    if (!prints.length) walkStep(); // the first step comes straight away
    run();
  };

  const stop = (): void => {
    if (state !== 'walking') return;
    if (!prints.length) {
      state = 'still';
      button.classList.remove('wandering');
      return;
    }
    // the trail behind fades, and the last two feet turn round where they stand
    const feet = prints.splice(-2);
    prints.forEach(fade);
    prints = feet;
    // they stand between their two feet: that is what they look about from, and where they run from
    if (feet.length === 2) {
      x = (feet[0].px + feet[1].px) / 2;
      y = (feet[0].py + feet[1].py) / 2;
    }
    look = 0;
    twist(DISCOVERED[0].twist);
    for (const p of feet) p.el.classList.add('startled');
    const target = home();
    runStride = Math.max(RUN_STRIDE_MIN, Math.min(RUN_STRIDE_MAX, Math.hypot(target.x - x, target.y - y) / RUN_STEPS));
    state = 'turning';
    run();
  };

  const pointing = new Set<string>();
  let lingering = 0;
  return {
    point(source, on) {
      if (on && (calm.matches || button.disabled)) return;
      const was = pointing.size > 0;
      if (on) pointing.add(source);
      else pointing.delete(source);
      const is = pointing.size > 0;
      if (is && !was) {
        // already out: carry on at once; at home: only once you have stayed a while
        if (state === 'still') lingering = window.setTimeout(start, LINGER);
        else start();
      }
      if (!is && was) {
        window.clearTimeout(lingering);
        stop();
      }
    },
    clear() {
      window.clearTimeout(lingering);
      pointing.clear();
      prints.forEach(fade);
      prints = [];
      state = 'still';
      button.classList.remove('wandering');
    },
  };
}
