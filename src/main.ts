import * as THREE from 'three';
import { Library } from './assets/library';
import { wanderingFeet } from './footsteps';
import { Interactions } from './interact/interactions';
import { Character } from './player/character';
import { Customize } from './customize/customize';
import { loadLook, outfitOf } from './customize/look';
import { Player } from './player/controls';
import { PathGuide } from './player/pathGuide';
import { setViewport } from './style/materials';
import { PrintFx } from './style/postfx';
import { buildWorld } from './world/scene';

const hero = document.getElementById('hero')!;
const canvas = document.getElementById('world') as HTMLCanvasElement;
const intro = document.getElementById('intro')!;
const headline = document.getElementById('headline')!;
const plot = document.getElementById('plot')!;
const classic = document.getElementById('classic')!;
const chip = document.getElementById('chip')!;
const enter = document.getElementById('enter') as HTMLButtonElement;
const loading = document.getElementById('loading')!;
const leave = document.getElementById('leave') as HTMLButtonElement;
const avatar = document.getElementById('avatar') as HTMLButtonElement;
const guide = document.getElementById('guide')!;
const guideLine = document.getElementById('guide-line')!;
const guideWord = document.getElementById('guide-word')!;

const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
const touch = window.matchMedia('(pointer: coarse)').matches;

// the icon's feet go for a walk while you point at the invitation, or at the world it invites you into
const feet = wanderingFeet(enter, enter.querySelector('.steps')!, plot, calm);
enter.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && feet.point('link', true));
enter.addEventListener('pointerleave', () => feet.point('link', false));

/** Until you have moved, the way to move is the big line: the one thing you need to know. */
const FIRST_STEP = touch ? 'Tap where you want to go.' : 'Arrow keys or WASD to walk, Shift to run, or click where you want to go.';
/** Every control, kept small once moving has stopped being the news. */
const HOW_TO_MOVE = touch
  ? 'Tap where you want to go.'
  : 'Arrow keys or WASD to walk, Shift to run, Space to jump. Or click where you want to go.';
const HOW_TO_USE = touch ? 'Tap it.' : 'Press E, or click it.';
/** Shown big once you have found your feet: what moving is for. */
const WHAT_NEXT = 'Take a look around.';

const FIT = 1; // how much of its box the museum fills between the words above and the classic link below
/** The museum is never wider than this many headline measures, so it sits in the same column as the words above it. */
const MEASURE = 1;
/** While walking, the camera shows about this much of the world: metres across on wide screens, metres tall on narrow ones. */
const PLAY_W = 26;
const PLAY_H = 17;

/** The world taking over the page, and handing it back, in seconds. */
const SHIFT_IN = 0.9;
const SHIFT_OUT = 0.65;

/** cubic-bezier(0.77, 0, 0.175, 1), the same ease-in-out the page uses, so camera and page move as one. */
function easeInOut(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const x1 = 0.77;
  const y1 = 0;
  const x2 = 0.175;
  const y2 = 1;
  const at = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (at(x1, x2, mid) < x) lo = mid;
    else hi = mid;
  }
  return at(y1, y2, (lo + hi) / 2);
}

/** Where the plot sits while the page is a portfolio, in pixels from the hero's top left; `measure` is the headline's longest line. */
const fit = { x: 0, y: 0, w: 1, h: 1, measure: Infinity };
const words = Array.from(headline.querySelectorAll<HTMLElement>('.w'));

/** Read the layout: the empty box between the words and the classic link tells the camera where the plot goes. */
function measure(): void {
  const h = hero.getBoundingClientRect();
  const p = plot.getBoundingClientRect();
  fit.x = p.left - h.left;
  fit.y = p.top - h.top;
  fit.w = Math.max(1, p.width);
  fit.h = Math.max(1, p.height);
  // the ink, not the box: the box runs the full column, the longest line usually doesn't
  let lo = Infinity;
  let hi = -Infinity;
  for (const word of words) {
    const r = word.getBoundingClientRect();
    lo = Math.min(lo, r.left);
    hi = Math.max(hi, r.right);
  }
  fit.measure = hi > lo ? hi - lo : Infinity;
}
/** Swap a line of the guide, replaying its little entrance only when the words change. */
function say(el: HTMLElement, text: string): void {
  if (el.textContent === text) return;
  el.textContent = text;
  el.classList.remove('swap');
  void el.offsetWidth;
  el.classList.add('swap');
}

async function start(): Promise<void> {
  // alpha: the page shows through wherever the world isn't, so its colour is set in one place (CSS)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0xffffff, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  // the signs and wall titles are painted with the page's own type, so it has to have arrived first
  await Promise.all([
    document.fonts.load("800 64px 'Hanken Grotesk Variable'"),
    document.fonts.load("600 64px 'Hanken Grotesk Variable'"),
    document.fonts.load("500 64px 'Besley Variable'"),
  ]).catch(() => {});

  const lib = await Library.load(import.meta.env.BASE_URL + 'models', (done, total) => {
    loading.textContent = `Unpacking the world… ${Math.round((done / total) * 100)}%`;
  });

  const scene = new THREE.Scene();
  const world = buildWorld(lib);
  scene.add(world.root);
  // on narrow screens the plot's box takes the museum's own shape, so the spare height goes to the gaps around it
  plot.style.setProperty('--plot-aspect', (world.main.w / world.main.h).toFixed(3));

  // the visitor comes back dressed the way they left
  const look = loadLook();
  const player = new Player(world, new Character(lib, outfitOf(look)));
  scene.add(player.character.group);

  // True isometric: orthographic camera looking down the (1, 1, 1) diagonal.
  const ISO = new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(60);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  /** What the camera rests on while the page is a portfolio: the museum, alone. */
  const rest = world.main.center.clone();
  const focus = rest.clone();
  const spot = new THREE.Vector3();
  const RIGHT = new THREE.Vector3(1, 0, -1).normalize();
  /** The museum's own left and right extremes: everything outside them belongs to the neighbours. */
  const sides = [-1, 1].map((s) => world.main.center.clone().addScaledVector(RIGHT, (s * world.main.w) / 2));
  /** Where a point lands across the canvas, in pixels. */
  const screenX = (p: THREE.Vector3): number => ((spot.copy(p).project(camera).x + 1) / 2) * width;
  let masked = '';
  let revealed = -1;
  /**
   * While the page is a portfolio there is only the museum. The house and the lab arrive as the
   * world takes over: a mask fades them in from the sides (flat, so their walls never turn to glass
   * on the way), and the bridges to them come with them.
   */
  function peek(): void {
    if (blend !== revealed) {
      revealed = blend;
      world.reveal(blend);
    }
    let mask = 'none';
    if (blend < 0.999) {
      const a = blend.toFixed(3);
      // fully gone up to each neighbour's inner corner, fully there from the museum's own edge
      const [l, r] = world.seams.map(screenX);
      const [ml, mr] = sides.map(screenX);
      const px = (n: number) => `${Math.round(n)}px`;
      mask =
        `linear-gradient(90deg, rgb(0 0 0 / ${a}) ${px(Math.min(l, ml - 1))}, #000 ${px(ml)}, ` +
        `#000 ${px(mr)}, rgb(0 0 0 / ${a}) ${px(Math.max(r, mr + 1))})`;
    }
    if (mask === masked) return;
    masked = mask;
    canvas.style.maskImage = mask;
    canvas.style.webkitMaskImage = mask;
  }

  const pathGuide = new PathGuide(player, world);
  pathGuide.attach(scene);
  const interactions = new Interactions(world, player, camera, canvas);
  const fx = new PrintFx(renderer, scene, camera);
  const customize = new Customize(
    lib,
    look,
    {
      wear: (outfit) => player.character.wear(outfit, !calm.matches),
      // while dressing, the world lets go of the keyboard: Space and the arrows belong to the sheet
      toggled: (open) => {
        player.setActive(playing && !open);
        interactions.active = playing && !open;
        hero.inert = open;
        hero.classList.toggle('dressing', open);
        if (!open) canvas.focus({ preventScroll: true });
      },
    },
    calm,
  );

  // handy for poking at the world from the browser console during development
  if (import.meta.env.DEV) Object.assign(window, { __iso: { world, player, camera, scene, fx, renderer } });

  let width = 1;
  let height = 1;
  let playing = false;
  /** 0 while the world sits under the headline, 1 once it has the page to itself. */
  let blend = 0;
  /** The same journey before easing: plain time, so it can turn round halfway without a jump. */
  let shift = 0;
  let arrive = calm.matches ? 0 : 1;

  /** Frame the plot: fitted to its box under the headline while looking, large and centred while playing. */
  function frameCamera(): void {
    const { lerp, smoothstep } = THREE.MathUtils;
    // on small screens the hero can be taller than the window; the world only ever plays in the part you can see
    const seen = Math.min(height, window.innerHeight);
    const wide = smoothstep(width / seen, 0.8, 1.3);

    // looking: the museum as big as the box allows, in the middle of it; the neighbours run off to the sides
    const { main } = world;
    const lookScale = Math.min(fit.w / main.w, fit.h / main.h, (fit.measure * MEASURE) / main.w) * FIT;
    const lookX = fit.x + fit.w / 2;
    const lookY = fit.y + fit.h / 2;

    // playing: the whole window, close enough to read the walls, lifted a touch to leave the bottom corner for the guide
    const playScale = Math.max(width / PLAY_W, seen / PLAY_H);
    const playX = width / 2;
    const playY = seen / 2 - lerp(0.06, 0.035, wide) * seen;

    // pixels per world unit; scale blends by ratio so the zoom reads as steady
    // `arrive` starts the plot a touch further away and lets it settle as the page opens
    const scale = (lookScale * (playScale / lookScale) ** blend) / (1 + arrive * 0.07);
    const x = lerp(lookX, playX, blend);
    const y = lerp(lookY, playY, blend);

    // slide the frustum instead of the camera so the plot moves on screen without changing the view of it
    const halfW = width / scale / 2;
    const halfH = height / scale / 2;
    const right = (x - width / 2) / scale;
    const up = (height / 2 - y) / scale;
    camera.left = -halfW - right;
    camera.right = halfW - right;
    camera.top = halfH - up;
    camera.bottom = -halfH - up;
    camera.updateProjectionMatrix();
    setViewport(width, height, scale);
  }

  function resize(): void {
    width = Math.max(1, hero.clientWidth);
    height = Math.max(1, hero.clientHeight);
    renderer.setSize(width, height, false);
    fx.setSize(width, height);
    measure();
    frameCamera();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(hero);
  // the box changes when the words above it reflow (fonts arriving, for one), and the headline sets the museum's width
  observer.observe(plot);
  observer.observe(intro);
  resize();

  /** How far you have walked this visit, to know when the first hint has done its job. */
  let walked = 0;
  const last = player.position.clone();

  function setMode(play: boolean): void {
    if (play === playing) return;
    playing = play;
    if (play) window.scrollTo(0, 0);
    document.documentElement.classList.toggle('in-world', play);
    hero.dataset.mode = play ? 'play' : 'look';

    intro.inert = play;
    classic.inert = play;
    leave.inert = !play;
    avatar.inert = !play;
    guide.inert = !play;
    player.setActive(play);
    interactions.active = play;
    // focus sits on the world while playing, so Space and Enter go to the character and not to a button
    (play ? canvas : enter).focus({ preventScroll: true });
    hero.classList.remove('over-world');
    if (play) feet.clear();
    if (play) {
      walked = 0;
      last.copy(player.position);
      player.character.play('Waving');
    }
  }

  // The house is a way in too: pointing at it lights up the button, clicking it steps inside.
  const pointer = new THREE.Vector2(2, 2);
  const raycaster = new THREE.Raycaster();
  let pointerMoved = false;
  // only asked while the page is a portfolio, when the museum is all there is to point at
  const overWorld = (): boolean => {
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObject(world.museum, true).length > 0;
  };
  let waved = -Infinity;
  const track = (e: MouseEvent): void => {
    // set straight on the element: a custom property here would restyle everything inside the hero
    chip.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    const rect = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    pointerMoved = true;
  };
  canvas.addEventListener('pointermove', track);
  canvas.addEventListener('pointerleave', () => {
    pointer.set(2, 2);
    pointerMoved = true;
  });
  canvas.addEventListener('click', (e) => {
    if (playing) return;
    track(e);
    if (overWorld()) setMode(true);
  });

  enter.addEventListener('click', () => setMode(true));
  leave.addEventListener('click', () => setMode(false));
  // capture phase: the panel gets first claim on Escape, and only a bare Escape leaves the house
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.code === 'Escape' && playing && !interactions.overlayOpen && !customize.isOpen) setMode(false);
    },
    true,
  );

  const timer = new THREE.Timer();
  const want = new THREE.Vector3();

  function frame(): void {
    timer.update();
    const elapsed = timer.getDelta();
    const dt = Math.min(elapsed, 0.05);
    const time = timer.getElapsed();

    player.update(dt);
    world.update(dt, time, player);
    pathGuide.update(dt, time, calm.matches);

    const goal = playing ? 1 : 0;
    if (shift !== goal || arrive !== 0) {
      // out is quicker than in: leaving should never feel like waiting
      // real time, not frame time: the page's half of this move runs on the clock, and the two must land together
      const step = Math.min(elapsed, 0.25) / (playing ? SHIFT_IN : SHIFT_OUT);
      shift = calm.matches ? goal : playing ? Math.min(1, shift + step) : Math.max(0, shift - step);
      blend = easeInOut(shift);
      arrive *= Math.exp(-dt * 2.4);
      if (arrive < 0.0005) arrive = 0;
      frameCamera();
    }

    if (pointerMoved && !playing) {
      const over = overWorld();
      // someone is at the door: say hello, but not every time the pointer wanders past
      if (over && !hero.classList.contains('over-world') && time - waved > 4) {
        waved = time;
        player.character.play('Waving');
      }
      hero.classList.toggle('over-world', over);
      if (!touch) feet.point('world', over);
    }
    pointerMoved = false;

    // at rest the camera holds the islands; in the world it goes wherever the visitor goes
    want.lerpVectors(rest, player.position, blend);
    focus.lerp(want, Math.min(1, dt * 3));
    camera.position.copy(focus).add(ISO);
    camera.lookAt(focus);
    camera.updateMatrixWorld();

    interactions.update(width, height);
    peek();
    if (playing) {
      const label = interactions.label;
      walked += Math.hypot(player.position.x - last.x, player.position.z - last.z);
      last.copy(player.position);
      // one thing at a time: how to move, then, once you are moving, what moving is for
      const moved = walked >= 2.5;
      const choosing = interactions.choosing;
      if (choosing) {
        say(guideWord, choosing);
        say(guideLine, touch ? 'Tap an arrow.' : 'Click an arrow, or press that arrow key.');
      } else {
        say(guideWord, label ? `${label}.` : moved ? WHAT_NEXT : FIRST_STEP);
        say(guideLine, label ? HOW_TO_USE : moved ? HOW_TO_MOVE : 'Have a look around.');
      }
    }

    // the grain boils; hold it still for anyone who has asked for less motion
    fx.render(calm.matches ? 0 : time);
    requestAnimationFrame(frame);
  }
  frame();

  hero.dataset.ready = '';
  enter.disabled = false;
}

start().catch((err) => {
  console.error(err);
  loading.dataset.failed = '';
  loading.textContent = 'The world didn’t load. Reloading the page usually fixes it.';
});
