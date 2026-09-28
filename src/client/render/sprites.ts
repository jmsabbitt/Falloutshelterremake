// Character sprite art. The sprite pipeline (tools/sprites/build.py) turns a
// generated sheet into horizontal frame strips split into grey-shaded layers;
// here each layer is tinted at runtime, so one sheet covers every skin tone,
// hair colour and outfit. If the manifest is missing, or a resident's body
// type has no art yet, the view keeps drawing the placeholder figure.
// Legendary residents can have a bespoke body instead (art/raw/legend_<id>/):
// one painted, untinted layer, loaded the first time the legend is drawn.

import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Content, Resident, WeaponGrip } from '../../sim';
import appearance from '../../content/appearance.json';

export const LAYERS = ['base', 'suit', 'skin', 'hair', 'trim'] as const;
type Layer = (typeof LAYERS)[number];
/** A strip's layer: a tint layer, or "full" for art drawn as painted (creatures, legend bodies). */
type LayerName = Layer | 'full';
/** The one layer of a legend's bespoke body. */
const FULL: readonly LayerName[] = ['full'];

interface AnimManifest {
  frames: number;
  fps: number;
  loop: boolean;
  frameW: number;
  frameH: number;
  anchorX: number;
  anchorY: number;
  idleFrame?: number;
  /** Characters have every tint layer; creatures and legend bodies only "full". */
  files: Partial<Record<LayerName, string>>;
}

/** A legendary resident's own body: built like a creature, facing right like residents. */
interface LegendManifest {
  /** The art/raw folder it was built from ("legend_<id>"). */
  id?: string;
  sex: 'f' | 'm';
  refHeight: number;
  anims: Record<string, AnimManifest>;
}

interface Manifest {
  version: number;
  characters: Record<string, { sex: 'f' | 'm'; refHeight: number; anims: Record<string, AnimManifest> }>;
  /** Enemies, keyed by their look; one full-colour layer each ("full"). */
  creatures?: Record<string, { refHeight: number; anims: Record<string, AnimManifest> }>;
  /** Single images by id then name; "room_<type>" ids hold room back walls by level. */
  portraits?: Record<string, Record<string, string>>;
  /** Legends' bespoke bodies, keyed by legends.json id. */
  legends?: Record<string, LegendManifest>;
}

export interface Anim {
  frames: number;
  fps: number;
  loop: boolean;
  idleFrame: number;
  anchorX: number;
  anchorY: number;
  /** Textures per layer (every one in the character's `layers`), one per frame. */
  layers: Partial<Record<LayerName, Texture[]>>;
}

export interface Character {
  id: string;
  sex: 'f' | 'm';
  refHeight: number;
  /** The layers a Figure stacks, bottom first: LAYERS for a tinted body, ["full"] for a legend's own. */
  layers: readonly LayerName[];
  /** Set on a legend's bespoke body (the legends.json id); never a body type's default. */
  legend?: string;
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

/** An enemy's art: untinted strips, facing left (toward the party). */
export interface Creature {
  id: string;
  refHeight: number;
  anims: Record<string, { frames: number; fps: number; loop: boolean; anchorX: number; anchorY: number; textures: Texture[] }>;
}

/** Creature looks the vault view draws in incidents: loaded at start-up. */
const EAGER_CREATURES = new Set(['skitter', 'burrower', 'rustman', 'deepcrawler', 'hollowed', 'glassback']);

async function loadCreature(base: string, id: string, c: { refHeight: number; anims: Record<string, AnimManifest> }): Promise<Creature | null> {
  try {
    const anims: Creature['anims'] = {};
    await Promise.all(
      Object.entries(c.anims).map(async ([name, a]) => {
        anims[name] = { frames: a.frames, fps: a.fps, loop: a.loop, anchorX: a.anchorX, anchorY: a.anchorY, textures: await loadStrip(base, a, a.files.full) };
      }),
    );
    return { id, refHeight: c.refHeight, anims };
  } catch (err) {
    console.warn(`sprites: could not load ${id}`, err);
    return null;
  }
}

export class CharacterArt {
  private bySex = new Map<string, Character>();
  private byLook = new Map<string, Creature>();
  /** Creature art in the manifest that isn't loaded yet (bosses and one-quest enemies load on first use). */
  private pending = new Map<string, { refHeight: number; anims: Record<string, AnimManifest> }>();
  private loading = new Set<string>();
  /** Legends' bespoke bodies that have loaded, and those not asked for yet, by legend id. */
  private byLegend = new Map<string, Character>();
  private pendingLegends = new Map<string, LegendManifest>();
  private lazyLoaded = 0;
  private bodiesLoaded = 0;

  constructor(
    readonly characters: Character[],
    creatures: Creature[] = [],
    /** Room back-wall art by "type:level". */
    private rooms = new Map<string, Texture>(),
    lazy: Record<string, { refHeight: number; anims: Record<string, AnimManifest> }> = {},
    legends: Record<string, LegendManifest> = {},
    private base = 'sprites/',
  ) {
    // The first character listed for a body type is its default.
    for (const c of characters) if (!this.bySex.has(c.sex)) this.bySex.set(c.sex, c);
    for (const c of creatures) this.byLook.set(c.id, c);
    for (const [id, c] of Object.entries(lazy)) if (!this.byLook.has(id)) this.pending.set(id, c);
    for (const [id, c] of Object.entries(legends)) this.pendingLegends.set(id, c);
  }

  /** Goes up by one each time lazily loaded art (a creature or a legend body) arrives. */
  get version(): number {
    return this.lazyLoaded;
  }

  /**
   * Goes up by one each time a legend's bespoke body arrives. The views put it
   * in their resident figures' look keys, so those redress and swap bodies.
   * Creature loads don't change it: resident figures never draw creature art.
   */
  get bodyVersion(): number {
    return this.bodiesLoaded;
  }

  /** Start loading creature art in the background (for a quest that is about to be shown). */
  preload(ids: Iterable<string>): void {
    for (const id of ids) this.request(id);
  }

  private request(id: string): void {
    const c = this.pending.get(id);
    if (!c || this.loading.has(id)) return;
    this.loading.add(id);
    void loadCreature(this.base, id, c).then((creature) => {
      this.pending.delete(id);
      this.loading.delete(id);
      if (creature) {
        this.byLook.set(id, creature);
        this.lazyLoaded++;
      }
    });
  }

  /**
   * Start loading a legend's bespoke body, once: it leaves the pending list
   * as it starts, so a failed load (warned about by loadCharacter) keeps the
   * shared body for good instead of retrying every frame.
   */
  private requestLegend(id: string): void {
    const c = this.pendingLegends.get(id);
    if (!c) return;
    this.pendingLegends.delete(id);
    void loadCharacter(this.base, c.id ?? `legend_${id}`, c, FULL, id).then((body) => {
      if (!body) return;
      this.byLegend.set(id, body);
      this.lazyLoaded++;
      this.bodiesLoaded++;
    });
  }

  /**
   * The first of `ids` that has art: loaded art is returned, and art still loading
   * returns undefined (so a bespoke boss never gets its shared look stuck on it).
   */
  creatureFor(...ids: string[]): Creature | undefined {
    for (const id of ids) {
      const c = this.byLook.get(id);
      if (c) return c;
      if (this.pending.has(id)) {
        this.request(id);
        return undefined;
      }
    }
    return undefined;
  }

  /**
   * Painted backdrop art (art/raw/backdrop): "surface" (the sky and far landscape,
   * tiled sideways, standing on the horizon), "crust" (the ground strip under it)
   * and "dirt" (the earth around and behind the rooms, tiled). Undefined: draw it.
   */
  backdrop(name: 'surface' | 'crust' | 'dirt'): Texture | undefined {
    return this.rooms.get(`backdrop:${name}`);
  }

  /** A room's back-wall art at a level (falling back to a lower level's), or undefined to draw it. */
  roomWall(type: string, level: number): Texture | undefined {
    for (let l = level; l >= 1; l--) {
      const t = this.rooms.get(`${type}:${l}`);
      if (t) return t;
    }
    return undefined;
  }

  /**
   * Painted art for a merged room drawn as one wider room ("1w2", "2w3": level 1
   * two segments wide, level 2 three wide), falling back to a lower level at the
   * same width. Undefined: tile the single-width wall instead.
   */
  roomWallWide(type: string, level: number, segments: number): Texture | undefined {
    if (segments < 2) return undefined;
    for (let l = level; l >= 1; l--) {
      const t = this.rooms.get(`${type}:${l}w${segments}`);
      if (t) return t;
    }
    return undefined;
  }

  /** The art for an enemy look, or undefined to draw it with Graphics. */
  forLook(look: string): Creature | undefined {
    return this.creatureFor(look);
  }

  /**
   * The character used for a resident, or undefined to use the placeholder. A
   * legend with a bespoke body gets it once it has loaded, and the shared body
   * for their sex until then (asking starts the load).
   */
  forResident(res: Resident): Character | undefined {
    if (res.legendary) {
      const own = this.byLegend.get(res.legendary);
      if (own) return own;
      this.requestLegend(res.legendary);
    }
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
    // Every strip loads in parallel; a character that fails to load is skipped.
    const loaded = await Promise.all(Object.entries(manifest.characters ?? {}).map(([id, c]) => loadCharacter(base, id, c, LAYERS)));
    const characters = loaded.filter((c): c is Character => c !== null);
    // Only the looks the vault itself shows load up front; every other creature
    // (quest enemies and bosses) loads the first time it is asked for.
    const all = manifest.creatures ?? {};
    const eager = Object.entries(all).filter(([id]) => EAGER_CREATURES.has(id));
    const lazy = Object.fromEntries(Object.entries(all).filter(([id]) => !EAGER_CREATURES.has(id)));
    const creatures = (await Promise.all(eager.map(([id, c]) => loadCreature(base, id, c)))).filter((c): c is Creature => c !== null);
    const rooms = new Map<string, Texture>();
    await Promise.all(
      Object.entries(manifest.portraits ?? {})
        .filter(([id]) => id.startsWith('room_') || id === 'backdrop')
        .flatMap(([id, files]) =>
          Object.entries(files).map(async ([level, file]) => {
            try {
              const t = await Assets.load<Texture>(`${base}${file}`);
              t.source.scaleMode = 'linear';
              // Backdrops tile, so their edges must wrap.
              if (id === 'backdrop') t.source.addressMode = 'repeat';
              rooms.set(id === 'backdrop' ? `backdrop:${level}` : `${id.slice(5)}:${level}`, t);
            } catch (err) {
              console.warn(`sprites: could not load ${file}`, err);
            }
          }),
        ),
    );
    // Legend bodies load the first time their legend is drawn (see forResident).
    const legends = manifest.legends ?? {};
    return characters.length || creatures.length || rooms.size || Object.keys(lazy).length || Object.keys(legends).length ? new CharacterArt(characters, creatures, rooms, lazy, legends, base) : null;
  }
}

/** One strip image cut into its frames. */
async function loadStrip(base: string, a: AnimManifest, file: string | undefined): Promise<Texture[]> {
  if (!file) throw new Error('a layer is missing from the manifest');
  const strip = await Assets.load<Texture>(`${base}${file}`);
  strip.source.scaleMode = 'linear';
  return Array.from({ length: a.frames }, (_, i) => new Texture({ source: strip.source, frame: new Rectangle(i * a.frameW, 0, a.frameW, a.frameH) }));
}

async function loadAnim(base: string, a: AnimManifest, names: readonly LayerName[]): Promise<Anim> {
  const layers: Anim['layers'] = {};
  await Promise.all(
    names.map(async (layer) => {
      layers[layer] = await loadStrip(base, a, a.files[layer]);
    }),
  );
  return { frames: a.frames, fps: a.fps, loop: a.loop, idleFrame: a.idleFrame ?? 0, anchorX: a.anchorX, anchorY: a.anchorY, layers };
}

/** Every animation of a body with the given layers; null (with a warning) if any strip fails. */
async function loadCharacter(
  base: string,
  id: string,
  c: { sex: 'f' | 'm'; refHeight: number; anims: Record<string, AnimManifest> },
  layers: readonly LayerName[],
  legend?: string,
): Promise<Character | null> {
  try {
    const anims: Record<string, Anim> = {};
    await Promise.all(Object.entries(c.anims).map(async ([name, a]) => (anims[name] = await loadAnim(base, a, layers))));
    return { id, sex: c.sex, refHeight: c.refHeight, layers, ...(legend ? { legend } : {}), anims };
  } catch (err) {
    console.warn(`sprites: could not load ${id}`, err);
    return null;
  }
}

/** What a resident is doing, which picks the animation a Figure plays. */
export type Action = 'walk' | 'idle' | 'work' | 'fight' | 'fallen' | 'carry';

/**
 * The fight animation for a resident's weapon grip (null: unarmed). Art can add
 * `fight_pistol`, `fight_longgun`, `fight_heavy`, `fight_melee` and
 * `fight_unarmed` to a sprite.json and they are picked up here with no code
 * change; until then guns use the generic `fight` sheet (which holds a
 * shotgun), and the unarmed stand idle rather than borrow that gun.
 */
/** How a resident holds their weapon (a weapon missing from content counts as a pistol), or null when unarmed. */
export function weaponGrip(content: Content, res: Resident): WeaponGrip | null {
  if (!res.weapon) return null;
  return content.weapons[res.weapon]?.grip ?? 'pistol';
}

export function fightAnim(fig: { has(anim: string): boolean }, grip: WeaponGrip | null): string {
  if (!grip) return fig.has('fight_unarmed') ? 'fight_unarmed' : 'idle';
  const own = `fight_${grip}`;
  return fig.has(own) ? own : 'fight';
}

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
 * A stack of tinted layer sprites (one untinted sprite for a legend's own
 * body) showing one frame of one animation. The sheets face right; mirror
 * the parent to face left.
 */
export class Figure extends Container {
  private parts: Sprite[] = [];
  private anim: Anim;
  private animName = '';
  private action: string | null = null;
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
    for (const layer of character.layers) {
      const s = new Sprite(this.anim.layers[layer]?.[0]);
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

  /** True if the character has its own art for an action or named animation (no fallback needed). */
  has(anim: Action | string): boolean {
    return !!this.character.anims[anim];
  }

  /** Tint the layers; a painted "full" layer (a legend's own body) stays as drawn. */
  setTints(tints: Record<Layer, number>): void {
    this.character.layers.forEach((layer, i) => {
      this.parts[i]!.tint = layer === 'full' ? 0xffffff : tints[layer];
    });
  }

  /**
   * Show an action at a clock value in seconds. Walking and carrying take the
   * walk phase; other actions take any steadily increasing clock. Any other
   * name plays that animation from the manifest (e.g. "fight_pistol"),
   * falling back to idle.
   */
  play(action: Action | string, time: number): void {
    const { anims } = this.character;
    const chain = FALLBACK[action as Action] ?? [action, 'idle', 'walk'];
    const name = chain.find((n) => anims[n]) ?? Object.keys(anims)[0]!;
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
    this.character.layers.forEach((layer, n) => {
      const strip = this.anim.layers[layer] ?? [];
      this.parts[n]!.texture = strip[i] ?? strip[0]!;
    });
  }
}

/**
 * An enemy drawn from creature art: idle loops, attack plays once from when
 * it started (or holds part-way through during a wind-up), death plays once
 * and holds. Sheets face left.
 */
export class CreatureFigure extends Container {
  private sprite: Sprite;
  private anim: Creature['anims'][string];
  private animName = '';
  private frame = -1;

  constructor(
    readonly creature: Creature,
    /** Displayed height, in world units. */
    height: number,
  ) {
    super();
    this.anim = creature.anims.idle ?? (Object.values(creature.anims)[0] as Creature['anims'][string]);
    this.sprite = new Sprite(this.anim.textures[0]);
    this.addChild(this.sprite);
    this.scale.set(height / creature.refHeight);
    this.play('idle', 0);
  }

  /** Seconds one play-through of an animation takes (0 if the creature lacks it). */
  duration(name: string): number {
    const a = this.creature.anims[name];
    return a ? a.frames / a.fps : 0;
  }

  /**
   * Show an animation `t` seconds in. `hold` (0..1) instead shows that point
   * of the clip, for a wind-up that holds the raised pose. Falls back to idle.
   */
  play(name: string, t: number, hold?: number): void {
    const want = this.creature.anims[name] ? name : 'idle';
    if (want !== this.animName && this.creature.anims[want]) {
      this.animName = want;
      this.anim = this.creature.anims[want]!;
      this.sprite.anchor.set(this.anim.anchorX, this.anim.anchorY);
      this.frame = -1;
    }
    const a = this.anim;
    let i: number;
    if (hold !== undefined && want === name) i = Math.min(a.frames - 1, Math.floor(hold * a.frames));
    else {
      const n = Math.floor(Math.max(0, t) * a.fps);
      i = a.loop ? n % a.frames : Math.min(n, a.frames - 1);
    }
    if (i === this.frame) return;
    this.frame = i;
    this.sprite.texture = a.textures[i] ?? a.textures[0]!;
  }
}
