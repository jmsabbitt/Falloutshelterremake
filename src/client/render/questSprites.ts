// Painted art for the quest screen (docs/art/ART-LIST.md §8): the sky and
// skyline behind the ruins, each theme's room walls, the room props and
// passages, and HALCY's map markers. None of it is needed at boot, so it
// loads the first time the quest screen opens (loadQuestArt). Anything the
// manifest lacks, or that fails to load, stays undefined and the view keeps
// drawing it with Graphics.

import { Assets, Rectangle, Texture } from 'pixi.js';
import type { Theme } from './ruinArt';

/** Where the sprite build lives: the same default base CharacterArt.load uses. */
const BASE = 'sprites/';

export type RuinWall = 'wall1' | 'wall2' | 'boss';
export type RuinProp = 'locker_shut' | 'locker_open' | 'console' | 'trophies' | 'hatch' | 'corridor' | 'ladder' | 'stairs';
export type MapMarker = 'objective' | 'unknown' | 'go';

/** Images that repeat (their edges must wrap). */
const TILED = new Set(['quest_backdrop:skyline', 'ruin_props:corridor', 'ruin_props:ladder']);
/**
 * Images laid edge to edge whose outermost pixel columns are off (a lighter
 * line from the build's resize), which shows as a seam at every repeat: they
 * use a frame a couple of pixels in from each side.
 */
const INSET_X = new Set(['backdrop:crust', 'backdrop:dirt']);
/** Keyed images with magenta spill in them (the hatch's daylight), cleaned on load. */
const DESPILL = new Set(['ruin_props:hatch']);

export class QuestArt {
  constructor(private tex: Map<string, Texture>) {}

  /** How many images loaded (0: draw everything). */
  get size(): number {
    return this.tex.size;
  }

  /** The quest sky (full bleed) or the skyline strip (keyed, tiles sideways). */
  backdrop(name: 'sky' | 'skyline'): Texture | undefined {
    return this.tex.get(`quest_backdrop:${name}`);
  }

  /** The surface ground strip and the earth under it, shared with the homestead (S1). */
  ground(name: 'crust' | 'dirt'): Texture | undefined {
    return this.tex.get(`backdrop:${name}`);
  }

  /** A theme's painted back wall; a missing variant falls back to the other plain wall. */
  wall(theme: Theme['id'], kind: RuinWall): Texture | undefined {
    const t = this.tex.get(`ruin_${theme}:${kind}`);
    if (t || kind === 'boss') return t;
    return this.tex.get(`ruin_${theme}:${kind === 'wall1' ? 'wall2' : 'wall1'}`);
  }

  prop(name: RuinProp): Texture | undefined {
    return this.tex.get(`ruin_props:${name}`);
  }

  marker(name: MapMarker): Texture | undefined {
    return this.tex.get(`ui_icons:map_${name}`);
  }
}

/** The manifest entries this screen reads, as "id:name" keys. */
function wanted(portraits: Record<string, Record<string, string>>): [string, string][] {
  const out: [string, string][] = [];
  const take = (id: string, names?: string[]) => {
    for (const [name, file] of Object.entries(portraits[id] ?? {})) if (!names || names.includes(name)) out.push([`${id}:${name}`, file]);
  };
  take('quest_backdrop');
  take('ruin_relay');
  take('ruin_homestead');
  take('ruin_scrapyard');
  take('ruin_props');
  take('backdrop', ['crust', 'dirt']);
  take('ui_icons', ['map_objective', 'map_unknown', 'map_go']);
  return out;
}

async function load(base: string): Promise<QuestArt | null> {
  let portraits: Record<string, Record<string, string>>;
  try {
    const resp = await fetch(`${base}manifest.json`);
    if (!resp.ok) return null;
    portraits = ((await resp.json()) as { portraits?: Record<string, Record<string, string>> }).portraits ?? {};
  } catch {
    return null;
  }
  const tex = new Map<string, Texture>();
  await Promise.all(
    wanted(portraits).map(async ([key, file]) => {
      try {
        let t = DESPILL.has(key) ? await despilled(`${base}${file}`) : await Assets.load<Texture>(`${base}${file}`);
        t.source.scaleMode = 'linear';
        if (TILED.has(key)) t.source.addressMode = 'repeat';
        if (INSET_X.has(key)) t = new Texture({ source: t.source, frame: new Rectangle(2, 0, t.source.width - 4, t.source.height) });
        tex.set(key, t);
      } catch (err) {
        console.warn(`questSprites: could not load ${file}`, err);
      }
    }),
  );
  return tex.size ? new QuestArt(tex) : null;
}

/**
 * Load a keyed image and pull the magenta out of it: the hatch's daylight
 * came out of the image tool tinted by the magenta key (opaque pink). Green
 * is lifted toward red and blue drops a little, so the pink reads as pale warm
 * light. Rust and steel (never greener than their blue) are left alone.
 */
async function despilled(url: string): Promise<Texture> {
  try {
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(bmp, 0, 0);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i]!;
      const g = d[i + 1]!;
      const b = d[i + 2]!;
      const spill = Math.min(r, b) - g;
      if (spill > 12) {
        d[i + 1] = Math.min(255, g + spill * 0.9);
        d[i + 2] = Math.max(0, b - spill * 0.35);
      }
    }
    ctx.putImageData(img, 0, 0);
    return Texture.from(canvas);
  } catch {
    return Assets.load<Texture>(url);
  }
}

let pending: Promise<QuestArt | null> | null = null;

/** Load the quest art once (later calls share the first load). Resolves to null when there is none. */
export function loadQuestArt(base = BASE): Promise<QuestArt | null> {
  pending ??= load(base);
  return pending;
}
