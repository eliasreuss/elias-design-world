import * as THREE from 'three';
import type { Player } from '../player/controls';
import type { Choice, Panel, Ui, Usable, World } from '../world/scene';

// WASD picks too, like walking does; only the arrows are drawn
const ARROW_KEYS: Record<string, Choice['dir']> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
};
const ARROWS: Record<Choice['dir'], string> = { up: '↑', down: '↓', left: '←', right: '→' };

/** How long a line of speech stays up if the visitor just stands there, in seconds. */
const SPEECH_TIME = 7;

export class Interactions {
  private readonly items: Usable[];
  private readonly ui: Ui;
  private readonly prompt = document.getElementById('prompt')!;
  private readonly speech = document.getElementById('speech')!;
  private readonly overlay = document.getElementById('overlay')!;
  private readonly panel = document.getElementById('panel')!;
  private readonly panelEyebrow = document.getElementById('panel-eyebrow')!;
  private readonly panelTitle = document.getElementById('panel-title')!;
  private readonly panelText = document.getElementById('panel-text')!;
  private readonly closeButton = document.getElementById('close') as HTMLButtonElement;
  private readonly raycaster = new THREE.Raycaster();
  private readonly floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly projected = new THREE.Vector3();
  private readonly choiceEl = document.getElementById('choice')!;
  private current: Usable | null = null;
  /** An open `Ui.choose`: where its arrows hang, what it asks, and the ways on. */
  private choice: { from: THREE.Vector3; prompt: string; options: Choice[] } | null = null;
  /** The line being spoken: where from, where the listener stood, and when it runs out. */
  private said: { from: THREE.Vector3; heard: THREE.Vector3; until: number } | null = null;

  /** Nothing in the world reacts until the visitor has chosen to step in. */
  private on = false;

  constructor(
    private readonly world: World,
    private readonly player: Player,
    private readonly camera: THREE.Camera,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.items = world.usables;
    this.ui = {
      player,
      open: (panel) => this.open(panel),
      say: (from, text) => this.say(from, text),
      choose: (from, prompt, options) => this.choose(from, prompt, options),
    };

    window.addEventListener('keydown', (e) => {
      if (e.repeat || !this.on) return;
      if (this.choice) {
        const dir = ARROW_KEYS[e.code];
        const option = dir && this.choice.options.find((o) => o.dir === dir);
        if (option) {
          e.preventDefault();
          this.pick(option);
        }
        return;
      }
      if (this.overlayOpen) {
        if (e.code === 'Escape' || e.code === 'KeyE') this.setOverlay(false);
        return;
      }
      if (e.code === 'KeyE' || e.code === 'Enter') {
        e.preventDefault();
        if (this.current && !player.busy) this.current.use(this.ui);
      }
    });

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !this.on || this.overlayOpen || this.choice || player.busy) return;
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      this.click(ndc);
    });

    this.overlay.addEventListener('pointerdown', (e) => {
      if (e.target === this.overlay) this.setOverlay(false);
    });
    this.closeButton.addEventListener('click', () => this.setOverlay(false));
  }

  get active(): boolean {
    return this.on;
  }

  set active(on: boolean) {
    this.on = on;
    if (!on) this.hush();
  }

  /** The question an open choice is asking, or null when there is none. */
  get choosing(): string | null {
    return this.choice?.prompt ?? null;
  }

  private choose(from: THREE.Vector3, prompt: string, options: Choice[]): void {
    this.choice = { from, prompt, options };
    this.player.frozen = true;
    this.hush();
    this.choiceEl.replaceChildren(
      ...options.map((option) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.dir = option.dir;
        button.textContent = ARROWS[option.dir];
        button.setAttribute('aria-label', option.label);
        button.title = option.label;
        button.addEventListener('click', () => this.pick(option));
        return button;
      }),
    );
    this.choiceEl.hidden = false;
  }

  private pick(option: Choice): void {
    if (!this.choice) return;
    this.choice = null;
    this.choiceEl.hidden = true;
    this.choiceEl.replaceChildren();
    this.player.frozen = false;
    option.pick();
    this.canvas.focus({ preventScroll: true });
  }

  get overlayOpen(): boolean {
    return this.overlay.classList.contains('open');
  }

  /** What the nearest usable thing would do right now, or null when nothing is in reach. */
  get label(): string | null {
    return this.current ? this.current.label() : null;
  }

  private open(panel: Panel): void {
    this.panel.dataset.kind = panel.kind;
    this.panelEyebrow.textContent = panel.eyebrow ?? '';
    this.panelEyebrow.hidden = !panel.eyebrow;
    this.panelTitle.textContent = panel.title;
    this.panelText.textContent = panel.text;
    this.setOverlay(true);
  }

  private setOverlay(open: boolean): void {
    this.overlay.classList.toggle('open', open);
    this.overlay.inert = !open;
    this.player.frozen = open;
    if (open) this.hush();
    // the panel is a dialog: focus goes in with it and back to the world after
    if (open) this.closeButton.focus({ preventScroll: true });
    else this.canvas.focus({ preventScroll: true });
  }

  private say(from: THREE.Vector3, text: string): void {
    this.speech.textContent = text;
    this.speech.classList.remove('on');
    // restart the little entrance when one line follows another
    void this.speech.offsetWidth;
    this.speech.classList.add('on');
    this.said = { from, heard: this.player.position.clone(), until: performance.now() + SPEECH_TIME * 1000 };
  }

  private hush(): void {
    this.said = null;
    this.speech.classList.remove('on');
  }

  private inRange(item: Usable): boolean {
    const p = this.player.position;
    return item.level === this.player.level && Math.hypot(p.x - item.stand.x, p.z - item.stand.z) <= item.radius;
  }

  private click(ndc: THREE.Vector2): void {
    this.raycaster.setFromCamera(ndc, this.camera);
    const reachable = this.items.filter((i) => i.level === this.player.level);

    // clicked an interactive object: use it, walking over first if needed
    const hit = this.raycaster.intersectObjects(
      reachable.map((i) => i.target),
      true,
    )[0];
    if (hit) {
      const item = reachable.find((i) => {
        let o: THREE.Object3D | null = hit.object;
        while (o && o !== i.target) o = o.parent;
        return o === i.target;
      });
      if (item) {
        if (this.inRange(item)) item.use(this.ui);
        else this.player.walkTo(item.stand.x, item.stand.z, () => item.use(this.ui), item.radius * 0.8);
        return;
      }
    }

    // otherwise walk to the clicked spot on the current floor
    this.floor.constant = -this.world.levelY[this.player.level];
    const point = this.raycaster.ray.intersectPlane(this.floor, new THREE.Vector3());
    if (point) this.player.walkTo(point.x, point.z);
  }

  private pin(el: HTMLElement, at: THREE.Vector3, width: number, height: number): void {
    const s = this.projected.copy(at).project(this.camera);
    el.style.transform = `translate(${((s.x + 1) / 2) * width}px, ${((1 - s.y) / 2) * height}px)`;
  }

  /** Call every frame: picks the nearest usable object and pins the key prompt to it. */
  update(width: number, height: number): void {
    let best: Usable | null = null;
    let bestDist = Infinity;
    if (this.choice) this.pin(this.choiceEl, this.choice.from, width, height);
    if (this.on && !this.player.busy && !this.overlayOpen && !this.choice) {
      const p = this.player.position;
      for (const item of this.items) {
        if (!this.inRange(item)) continue;
        const d = Math.hypot(p.x - item.stand.x, p.z - item.stand.z) / item.radius;
        if (d < bestDist) {
          best = item;
          bestDist = d;
        }
      }
    }
    this.current = best;

    if (this.said) {
      // a line lasts until it has been read, or until the visitor has plainly moved on
      const walked = this.said.heard.distanceTo(this.player.position);
      if (performance.now() > this.said.until || walked > 2.2) this.hush();
      else this.pin(this.speech, this.said.from, width, height);
    }

    // the key prompt steps aside while whoever it points at is speaking
    const speaking = best !== null && this.said !== null && best.anchor.distanceTo(this.said.from) < 1;
    this.prompt.classList.toggle('on', best !== null && !speaking);
    if (best) this.pin(this.prompt, best.anchor, width, height);
  }
}
