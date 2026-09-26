// Sprite loader: legends' bespoke bodies load lazily, stand in for the shared
// body only once loaded, never become a body type's default, and stay
// untinted. Pixi is replaced by a small stand-in, so no canvas is needed.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Resident } from '../src/sim';

const { load } = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock('pixi.js', () => {
  class Texture {
    source: unknown;
    constructor(o?: { source?: unknown }) {
      this.source = o?.source;
    }
  }
  class Rectangle {
    constructor(
      public x: number,
      public y: number,
      public width: number,
      public height: number,
    ) {}
  }
  class Container {
    children: unknown[] = [];
    scale = { set: () => {} };
    addChild(c: unknown) {
      this.children.push(c);
      return c;
    }
  }
  class Sprite {
    tint = 0xffffff;
    anchor = { set: () => {} };
    constructor(public texture?: unknown) {}
  }
  return { Assets: { load: (url: string) => load(url) }, Texture, Rectangle, Container, Sprite };
});

import { CharacterArt, Figure, LAYERS, type Anim, type Character } from '../src/client/render/sprites';

const anim = (layers: readonly string[]): Anim => ({
  frames: 2,
  fps: 10,
  loop: true,
  idleFrame: 0,
  anchorX: 0.5,
  anchorY: 1,
  layers: Object.fromEntries(layers.map((l) => [l, [{}, {}]])) as unknown as Anim['layers'],
});
const shared = (sex: 'f' | 'm'): Character => ({ id: `resident_${sex}`, sex, refHeight: 128, layers: LAYERS, anims: { walk: anim(LAYERS) } });
const strip = { frames: 2, fps: 10, loop: true, idleFrame: 0, frameW: 60, frameH: 130, anchorX: 0.5, anchorY: 1 };
const legendBody = { id: 'legend_pip', sex: 'f' as const, refHeight: 128, anims: { walk: { ...strip, files: { full: 'legend_pip/walk_full.webp' } } } };
const resident = (sex: 'f' | 'm', legendary?: string) => ({ id: 1, sex, legendary, appearance: { skin: 0, hair: 0 }, outfit: null }) as unknown as Resident;
const settle = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  load.mockReset();
  vi.restoreAllMocks();
});

describe('legend bodies', () => {
  it('show the shared body until the bespoke one loads, then swap', async () => {
    load.mockResolvedValue({ source: { scaleMode: 'nearest' } });
    const f = shared('f');
    const art = new CharacterArt([f], [], new Map(), {}, { pip: legendBody });
    const pip = resident('f', 'pip');
    expect(art.forResident(pip)).toBe(f);
    expect(art.forResident(pip)).toBe(f); // still loading: asked for once
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith('sprites/legend_pip/walk_full.webp');
    expect(art.version).toBe(0);
    expect(art.bodyVersion).toBe(0);
    await settle();
    expect(art.version).toBe(1);
    expect(art.bodyVersion).toBe(1);
    const own = art.forResident(pip)!;
    expect(own).not.toBe(f);
    expect(own.legend).toBe('pip');
    expect(own.layers).toEqual(['full']);
    // Everyone else keeps the shared body, and legends without art do too.
    expect(art.forResident(resident('f'))).toBe(f);
    expect(art.forResident(resident('f', 'granny_ash'))).toBe(f);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('never become the default body for their sex', async () => {
    load.mockResolvedValue({ source: {} });
    const art = new CharacterArt([shared('m')], [], new Map(), {}, { pip: legendBody });
    art.forResident(resident('f', 'pip'));
    await settle();
    expect(art.forResident(resident('f', 'pip'))?.legend).toBe('pip');
    expect(art.forResident(resident('f'))).toBeUndefined();
  });

  it('fall back to the shared body for good when loading fails', async () => {
    load.mockRejectedValue(new Error('404'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = shared('f');
    const art = new CharacterArt([f], [], new Map(), {}, { pip: legendBody });
    const pip = resident('f', 'pip');
    art.forResident(pip);
    await settle();
    for (let i = 0; i < 5; i++) expect(art.forResident(pip)).toBe(f);
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(art.version).toBe(0);
    expect(art.bodyVersion).toBe(0);
  });

  it('are the only lazy art that makes resident figures redress', async () => {
    load.mockResolvedValue({ source: {} });
    const art = new CharacterArt([shared('f')], [], new Map(), { boss: { refHeight: 128, anims: { idle: { ...strip, files: { full: 'boss/idle_full.webp' } } } } }, { pip: legendBody });
    art.preload(['boss']);
    await settle();
    expect(art.version).toBe(1); // a creature arrived...
    expect(art.bodyVersion).toBe(0); // ...but no resident's body changed
    art.forResident(resident('f', 'pip'));
    await settle();
    expect(art.version).toBe(2);
    expect(art.bodyVersion).toBe(1);
  });

  it('draw as painted: one untinted layer', () => {
    const tints = { base: 0xffffff, suit: 0x3f8f8a, skin: 0xf1c9a5, hair: 0x2b1e16, trim: 0xf2a541 };
    const body = new Figure({ id: 'legend_pip', sex: 'f', refHeight: 128, layers: ['full'], legend: 'pip', anims: { walk: anim(['full']) } }, 50);
    body.setTints(tints);
    expect(body.children).toHaveLength(1);
    expect((body.children[0] as unknown as { tint: number }).tint).toBe(0xffffff);
    const tinted = new Figure(shared('f'), 50);
    tinted.setTints(tints);
    expect(tinted.children).toHaveLength(LAYERS.length);
    expect((tinted.children as unknown as { tint: number }[]).map((s) => s.tint)).toEqual(LAYERS.map((l) => tints[l]));
  });
});
