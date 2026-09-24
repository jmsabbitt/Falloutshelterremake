// Character sprite art. The sprite pipeline (tools/sprites/build.py) turns a
// generated sheet into horizontal frame strips split into grey-shaded layers;
// here each layer is tinted at runtime, so one sheet covers every skin tone,
// hair colour and outfit. If the manifest is missing, or a resident's body
// type has no art yet, the view keeps drawing the placeholder figure.

import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Content, Resident } from '../../sim';
import appearance from '../../content/appearance.json';

export const LAYERS = ['base', 'suit', 'skin', 'hair', 'trim'] as const;
type Layer = (typeof LAYERS)[number];

interface AnimManifest {
  frames: number;
  fps: number;
  loop: boolean;
  frameW: number;
  frameH: number;
  anchorX: number;
  anchorY: number;
  idleFrame?: number;
  files: Record<Layer | 'full', string>;
}

interface Manifest {
  version: number;
  characters: Record<string, { sex: 'f' | 'm'; refHeight: number; anims: Record<string, AnimManifest> }>;
}

export interface Anim {
  frames: number;
  fps: number;
  loop: boolean;
  idleFrame: number;
  anchorX: number;
  anchorY: number;
  /** Textures per layer, one per frame. */
  layers: Record<Layer, Texture[]>;
}

export interface Character {
  id: string;
  sex: 'f' | 'm';
  refHeight: number;
  anims: Record<string, Anim>;
}

const hex = (s: string) => parseInt(s.replace('#', ''), 16);
const SKIN = appearance.skin.map(hex);
const HAIR = appearance.hair.map(hex);
const SUIT: Record<string, number> = Object.fromEntries(Object.entries(appearance.suit).map(([k, v]) => [k, hex(v)]));
const TRIM: Record<string, number> = Object.fromEntries(Object.entries(appearance.trim).map(([k, v]) => [k, hex(v)]));

/** The tints a resident's layers get, from their looks and what they wear. */
export function residentTints(res: Resident, content: Content, child: boolean): Record<Layer, number> {
  const outfit = res.outfit ? content.outfits[res.outfit] : undefined;
  const stat = outfit ? Object.keys(outfit.bonus)[0] : undefined;
  return {
    base: 0xffffff,
    skin: SKIN[res.appearance.skin % SKIN.length] ?? 0xffffff,
    hair: HAIR[res.appearance.hair % HAIR.length] ?? 0xffffff,
    suit: child ? SUIT.child! : ((stat ? SUIT[stat] : undefined) ?? SUIT.default!),
    trim: TRIM[outfit?.rarity ?? 'common'] ?? TRIM.common!,
  };
}

export class CharacterArt {
  private bySex = new Map<string, Character>();

  constructor(readonly characters: Character[]) {
    // The first character listed for a body type is its default.
    for (const c of characters) if (!this.bySex.has(c.sex)) this.bySex.set(c.sex, c);
  }

  /** The character used for a resident, or undefined to use the placeholder. */
  forResident(res: Resident): Character | undefined {
    return this.bySex.get(res.sex);
  }

  /** Load the manifest and every strip; resolves to null when there is no art. */
  static async load(base = 'sprites/'): Promise<CharacterArt | null> {
    let manifest: Manifest;
    try {
      const resp = await fetch(`${base}manifest.json`);
      if (!resp.ok) return null;
      manifest = (await resp.json()) as Manifest;
    } catch {
      return null;
    }
    const characters: Character[] = [];
    for (const [id, c] of Object.entries(manifest.characters ?? {})) {
      try {
        const anims: Record<string, Anim> = {};
        for (const [name, a] of Object.entries(c.anims)) {
          const layers = {} as Record<Layer, Texture[]>;
          for (const layer of LAYERS) {
            const strip = await Assets.load<Texture>(`${base}${a.files[layer]}`);
            strip.source.scaleMode = 'linear';
            layers[layer] = Array.from(
              { length: a.frames },
              (_, i) => new Texture({ source: strip.source, frame: new Rectangle(i * a.frameW, 0, a.frameW, a.frameH) }),
            );
          }
          anims[name] = {
            frames: a.frames,
            fps: a.fps,
            loop: a.loop,
            idleFrame: a.idleFrame ?? 0,
            anchorX: a.anchorX,
            anchorY: a.anchorY,
            layers,
          };
        }
        characters.push({ id, sex: c.sex, refHeight: c.refHeight, anims });
      } catch (err) {
        console.warn(`sprites: could not load ${id}`, err);
      }
    }
    return characters.length ? new CharacterArt(characters) : null;
  }
}

/** What a resident is doing, which picks the animation a Figure plays. */
export type Action = 'walk' | 'idle' | 'work' | 'fight' | 'fallen' | 'carry';

/**
 * Animations to try for each action, best first. Every chain ends on the walk
 * sheet, which every character has; standing actions hold its idleFrame.
 */
const FALLBACK: Record<Action, string[]> = {
  walk: ['walk'],
  carry: ['carry', 'walk'],
  idle: ['idle', 'walk'],
  work: ['work', 'idle', 'walk'],
  fight: ['fight', 'idle', 'walk'],
  fallen: ['fallen', 'idle', 'walk'],
};

/**
 * A stack of tinted layer sprites showing one frame of one animation. The
 * sheets face right; mirror the parent to face left.
 */
export class Figure extends Container {
  private parts: Sprite[] = [];
  private anim: Anim;
  private animName = '';
  private action: Action | null = null;
  /** Clock value when the current action began, so non-looping anims play once. */
  private startedAt = 0;
  private frame = -1;

  constructor(
    readonly character: Character,
    /** Displayed height of a full-size adult, in world units. */
    height: number,
  ) {
    super();
    this.anim = character.anims.walk ?? (Object.values(character.anims)[0] as Anim);
    for (const layer of LAYERS) {
      const s = new Sprite(this.anim.layers[layer][0]);
      this.parts.push(s);
      this.addChild(s);
    }
    this.scale.set(height / character.refHeight);
    this.play('idle', 0);
  }

  /** The animation on screen, after fallbacks. */
  get showing(): string {
    return this.animName;
  }

  /** True if the character has its own art for an action (no fallback needed). */
  has(action: Action): boolean {
    return !!this.character.anims[action];
  }

  setTints(tints: Record<Layer, number>): void {
    LAYERS.forEach((layer, i) => {
      this.parts[i]!.tint = tints[layer];
    });
  }

  /**
   * Show an action at a clock value in seconds. Walking and carrying take the
   * walk phase; other actions take any steadily increasing clock.
   */
  play(action: Action, time: number): void {
    const { anims } = this.character;
    const name = FALLBACK[action].find((n) => anims[n]) ?? Object.keys(anims)[0]!;
    if (action !== this.action) {
      this.action = action;
      this.startedAt = time;
    }
    if (name !== this.animName) {
      this.animName = name;
      this.anim = anims[name]!;
      for (const s of this.parts) s.anchor.set(this.anim.anchorX, this.anim.anchorY);
      this.frame = -1;
    }
    const a = this.anim;
    // A stand-in walk sheet holds its idle pose unless the action is a walk.
    if (name === 'walk' && action !== 'walk' && action !== 'carry') return this.setFrame(a.idleFrame);
    const moving = action === 'walk' || action === 'carry';
    const n = Math.floor((moving ? time : time - this.startedAt) * a.fps);
    this.setFrame(a.loop ? ((n % a.frames) + a.frames) % a.frames : Math.min(Math.max(n, 0), a.frames - 1));
  }

  private setFrame(i: number): void {
    if (i === this.frame) return;
    this.frame = i;
    LAYERS.forEach((layer, n) => {
      this.parts[n]!.texture = this.anim.layers[layer][i] ?? this.anim.layers[layer][0]!;
    });
  }
}
