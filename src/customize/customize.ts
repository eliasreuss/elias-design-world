import type { Library } from '../assets/library';
import type { Outfit } from '../player/character';
import { DEFAULT_LOOK, outfitOf, sameLook, saveLook, type Look } from './look';
import { Stage } from './stage';

export interface CustomizeHooks {
  /** Dress the visitor in the world as the look changes, so it is already done when the sheet closes. */
  wear(outfit: Outfit): void;
  /** The sheet opened or closed: the world gives up the keyboard while it is open, and takes it back after. */
  toggled(open: boolean): void;
}

/** A poke gets one of these, never the same one twice running. What is worn adds a line of its own. */
const LINES = ['Hi.', 'That tickles.', 'Okay, okay.', 'Still me.', 'Boop.', 'I’m listening.'];
const HAT_LINES: Record<Look['hat'], string> = {
  boxy: 'The classic.',
  cap: 'Ready for work.',
  beanie: 'Bit chilly in here.',
  bucket: 'Gone fishing.',
  top: 'Very distinguished.',
};
/** Typing a line: a letter at a time with a little unevenness, then held long enough to read. */
const KEY_MS = 36;
const HOLD_MS = 1600;

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class Customize {
  private readonly avatar = byId<HTMLButtonElement>('avatar');
  private readonly portrait = this.avatar.querySelector('img')!;
  private readonly root = byId('customize');
  private readonly panel = byId('customize-panel');
  private readonly form = byId<HTMLFormElement>('customize-form');
  private readonly stageEl = byId('stage');
  private readonly say = byId('stage-say');
  private readonly closer = byId<HTMLButtonElement>('customize-close');

  private stage: Stage | null = null;
  private look: Look;
  private openedWith: Look;
  private open = false;
  private shown = false;
  private shot = 0;
  private stopping = 0;
  private talk = 0;
  private lastLine = '';

  constructor(
    private readonly lib: Library,
    look: Look,
    private readonly hooks: CustomizeHooks,
    private readonly calm: MediaQueryList,
  ) {
    this.look = this.fill(look);
    this.openedWith = this.look;
    this.tint();

    this.avatar.addEventListener('click', () => this.show());
    this.closer.addEventListener('click', () => this.hide());
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.hide();
    });
    window.addEventListener('keydown', (e) => {
      if (this.open && e.code === 'Escape') {
        e.preventDefault();
        this.hide();
      }
    });
    this.form.addEventListener('submit', (e) => e.preventDefault());
    this.form.addEventListener('input', (e) => this.changed(e.target as HTMLInputElement));
    this.stageEl.addEventListener('pointerdown', (e) => this.poke(e));
    this.stageEl.addEventListener('pointermove', (e) => {
      this.stageEl.classList.toggle('over-figure', !!this.stage?.hits(e.clientX, e.clientY));
    });
    new ResizeObserver(() => this.fit()).observe(this.stageEl);
    window.addEventListener('resize', () => this.open && this.ring());

    // the stage is a second renderer: build it once the page has settled, then paint the avatar from it
    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 400));
    idle(() => {
      this.build();
      this.paint();
    });
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Set the form to a look, keeping only what the form offers; returns the look as it ended up. */
  private fill(look: Look): Look {
    const f = this.form.elements;
    const pick = (name: string, value: string, fallback: string) => {
      const radios = Array.from(f.namedItem(name) as RadioNodeList) as HTMLInputElement[];
      const hit = radios.find((r) => r.value === value) ?? radios.find((r) => r.value === fallback)!;
      hit.checked = true;
      return hit.value;
    };
    const out: Look = {
      face: pick('face', look.face, DEFAULT_LOOK.face) as Look['face'],
      jacket: pick('jacket', look.jacket, DEFAULT_LOOK.jacket),
      hair: pick('hair', look.hair, DEFAULT_LOOK.hair) as Look['hair'],
      hat: pick('hat', look.hat, DEFAULT_LOOK.hat) as Look['hat'],
      glasses: look.glasses,
      scarf: look.scarf,
      pack: look.pack,
      earrings: look.earrings,
      monocle: look.monocle,
    };
    for (const k of ['glasses', 'scarf', 'pack', 'earrings', 'monocle'] as const) (f.namedItem(k) as HTMLInputElement).checked = out[k];
    return out;
  }

  private read(): Look {
    const data = new FormData(this.form);
    return {
      face: data.get('face') as Look['face'],
      jacket: data.get('jacket') as string,
      hair: data.get('hair') as Look['hair'],
      hat: data.get('hat') as Look['hat'],
      glasses: data.has('glasses'),
      scarf: data.has('scarf'),
      pack: data.has('pack'),
      earrings: data.has('earrings'),
      monocle: data.has('monocle'),
    };
  }

  private changed(input: HTMLInputElement): void {
    const was = this.look;
    const look = this.read();
    if (sameLook(was, look)) return;
    this.look = look;
    const animate = !this.calm.matches;
    const outfit = outfitOf(look);
    this.stage?.wear(outfit, animate);
    this.hooks.wear(outfit);
    saveLook(look);

    if (input.type === 'radio') {
      this.ring(input.name, animate);
      this.nudge(input);
    } else if (input.type === 'checkbox' && input.checked) this.nudge(input);
    if (look.jacket !== was.jacket) this.tint();

    // it notices: a new hat gets a look up at it, glasses get a blink once they are on
    if (look.hat !== was.hat) this.stage?.lookFor(0.05, -0.75, 0.75);
    // hair let down: a turn of the head to show it off from the side, where it falls down the back
    if (look.hair === 'long' && was.hair !== 'long') this.stage?.lookFor(0.95, 0.05, 0.9);
    if (look.glasses && !was.glasses) window.setTimeout(() => this.stage?.figure.blink(), 260);

    // the avatar keeps up quietly in the background; it shows off the change when the sheet closes
    window.clearTimeout(this.shot);
    this.shot = window.setTimeout(() => this.paint(), 220);
  }

  /** The hat, scarf and pack pictures are drawn in the jacket's colour. */
  private tint(): void {
    this.panel.style.setProperty('--jacket', this.look.jacket);
  }

  /** Slide a group's ring onto its chosen swatch. Without `animate` it is simply there. */
  private ring(name?: string, animate = false): void {
    for (const group of this.form.querySelectorAll<HTMLElement>('.swatches[data-ring]')) {
      if (name && group.dataset.ring !== name) continue;
      const ring = group.querySelector<HTMLElement>('.ring')!;
      const chosen = group.querySelector<HTMLInputElement>('input:checked')?.closest<HTMLElement>('.swatch');
      if (!chosen) continue;
      ring.classList.toggle('instant', !animate);
      ring.style.transform = `translate(${chosen.offsetLeft}px, ${chosen.offsetTop}px)`;
      if (!animate) void ring.offsetWidth;
    }
  }

  /** The picture on a swatch gives a small hop when it is chosen. */
  private nudge(input: HTMLInputElement): void {
    const swatch = input.closest('.swatch');
    if (!swatch) return;
    swatch.classList.remove('picked');
    void (swatch as HTMLElement).offsetWidth;
    swatch.classList.add('picked');
  }

  private build(): Stage {
    if (this.stage) return this.stage;
    const stage = new Stage(this.lib, outfitOf(this.look), this.calm.matches);
    stage.canvas.className = 'stage-canvas';
    this.stageEl.prepend(stage.canvas);
    stage.onFrame = (head) => this.pin(head);
    stage.warm();
    this.stage = stage;
    this.fit();
    return stage;
  }

  private fit(): void {
    if (!this.stage) return;
    const r = this.stageEl.getBoundingClientRect();
    if (r.width && r.height) this.stage.resize(r.width, r.height);
  }

  /** Repaint the avatar's picture. With `pop` it shows the change with a little bounce. */
  private paint(pop = false): void {
    if (!this.stage) return;
    window.clearTimeout(this.shot);
    this.portrait.src = this.stage.snapshot();
    this.avatar.dataset.ready = '';
    if (!pop || this.calm.matches) return;
    this.avatar.classList.remove('fresh');
    void this.avatar.offsetWidth;
    this.avatar.classList.add('fresh');
  }

  show(): void {
    if (this.open) return;
    this.open = true;
    const stage = this.build();
    window.clearTimeout(this.stopping);
    this.openedWith = this.look;

    // the sheet grows out of the picture that opened it
    const a = this.avatar.getBoundingClientRect();
    this.panel.style.transformOrigin = `${a.left + a.width / 2 - this.panel.offsetLeft}px ${a.top + a.height / 2 - this.panel.offsetTop}px`;
    this.root.classList.add('open');
    this.root.inert = false;
    this.hooks.toggled(true);
    this.fit();
    stage.start();
    this.ring();
    this.closer.focus({ preventScroll: true });
    if (!this.shown && !this.calm.matches) window.setTimeout(() => this.open && stage.play('Waving'), 280);
    this.shown = true;
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('open');
    this.root.inert = true;
    this.hush();
    this.hooks.toggled(false);
    // keep drawing while the sheet fades, then rest
    this.stopping = window.setTimeout(() => this.stage?.stop(), 260);
    if (!sameLook(this.openedWith, this.look)) window.setTimeout(() => this.paint(true), 140);
  }

  private poke(e: PointerEvent): void {
    if (!this.stage?.hits(e.clientX, e.clientY)) return;
    const moves = ['Hit_A', 'Waving', 'Cheering'] as const;
    if (!this.calm.matches) this.stage.play(moves[Math.floor(Math.random() * moves.length)]);
    const pool = [...LINES, HAT_LINES[this.look.hat], ...(this.look.glasses ? ['Now I can see you.'] : [])].filter(
      (l) => l !== this.lastLine,
    );
    const line = pool[Math.floor(Math.random() * pool.length)];
    this.lastLine = line;
    void this.type(line);
  }

  private async type(line: string): Promise<void> {
    const mine = ++this.talk;
    const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
    this.say.textContent = '';
    this.say.classList.add('on');
    if (this.calm.matches) this.say.textContent = line;
    else {
      for (let k = 1; k <= line.length; k++) {
        await wait(KEY_MS + Math.random() * 30);
        if (mine !== this.talk) return;
        this.say.textContent = line.slice(0, k);
      }
    }
    await wait(HOLD_MS);
    if (mine === this.talk) this.say.classList.remove('on');
  }

  private hush(): void {
    this.talk++;
    this.say.classList.remove('on');
  }

  /** Keep the speech card up and to the right of the head, wherever the head has got to. */
  private pin(head: { x: number; y: number }): void {
    if (!this.say.classList.contains('on')) return;
    const r = this.stageEl.getBoundingClientRect();
    this.say.style.transform = `translate(${Math.round(head.x - r.left + 40)}px, ${Math.round(head.y - r.top - 28)}px)`;
  }
}
