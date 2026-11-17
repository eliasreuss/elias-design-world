import type { FaceStyle, HatStyle, Outfit } from '../player/character';
import { palette } from '../style/palette';

/** What the visitor has chosen to look like. Hair comes first, and is the one choice of two: bald, or long. */
export interface Look {
  hair: 'bald' | 'long';
  face: FaceStyle;
  jacket: string;
  hat: HatStyle;
  glasses: boolean;
  scarf: boolean;
  pack: boolean;
  earrings: boolean;
  monocle: boolean;
}

/** Everyone stands 1.80 m: a share of the standard 1.75 m figure. */
const HEIGHT = 1.8 / 1.75;
const LONG_HAIR = '#5a3a28';

export const DEFAULT_LOOK: Look = {
  hair: 'bald',
  face: 'bright',
  jacket: palette.jacket,
  hat: 'beanie',
  glasses: false,
  scarf: false,
  pack: false,
  earrings: false,
  monocle: false,
};

const KEY = 'look';

/** Kept in this browser between visits. Anything missing or odd falls back to the default, and the form has the final say on what is allowed. */
export function loadLook(): Look {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!saved || typeof saved !== 'object') return { ...DEFAULT_LOOK };
    const look = { ...DEFAULT_LOOK };
    for (const k of Object.keys(DEFAULT_LOOK) as (keyof Look)[]) {
      if (typeof saved[k] === typeof DEFAULT_LOOK[k]) (look as Record<string, unknown>)[k] = saved[k];
    }
    return look;
  } catch {
    return { ...DEFAULT_LOOK };
  }
}

export function saveLook(look: Look): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(look));
  } catch {
    // private window or storage switched off: the look lasts for this visit only
  }
}

export function sameLook(a: Look, b: Look): boolean {
  return (Object.keys(a) as (keyof Look)[]).every((k) => a[k] === b[k]);
}

export function outfitOf(look: Look): Outfit {
  return {
    jacket: look.jacket,
    hat: look.hat,
    // long hair is worn under whatever hat: it shows below the brim and down the back
    hair: look.hair === 'long' ? { style: 'long', color: LONG_HAIR } : undefined,
    face: look.face,
    glasses: look.glasses,
    scarf: look.scarf,
    pack: look.pack,
    earrings: look.earrings,
    monocle: look.monocle,
    build: { height: HEIGHT },
  };
}
