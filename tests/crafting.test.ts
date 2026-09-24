import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  canCraft,
  catchUp,
  craftSeconds,
  craftTimeLeft,
  deserialize,
  itemCapacity,
  loadContent,
  newGame,
  recipeFor,
  reforgeCost,
  scrapPreview,
  serialize,
  workshopRecipes,
  type GameState,
  type Rarity,
  type Resident,
  type Room,
} from '../src/sim';
import { createResident, emptyStats } from '../src/sim/residents';
import { reforgeChance, tickCrafting } from '../src/sim/systems/crafting';
import { startIncident } from '../src/sim/systems/incidents';

const content = loadContent();
const T0 = 1_700_000_000_000;

function calm(seed = 21): GameState {
  const s = newGame(content, { seed, now: T0 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  s.scrip = 100_000;
  s.resources.power = 1000;
  return s;
}

/** Add a workshop on a free floor (connectivity doesn't matter to the crafting sim). */
function workshop(s: GameState, type: 'weaponshop' | 'outfitshop', level = 1): Room {
  const room: Room = { id: s.nextId++, type, floor: 5, x: 0, segments: 1, level, pool: 0, ready: false, powered: true, timer: 0, job: null, banked: 0 };
  s.rooms.push(room);
  return room;
}

/** An adult with every stat at `value`, working in `room`. */
function worker(s: GameState, room: Room, value = 5): Resident {
  const r = createResident(s, content, { stats: emptyStats(value) });
  r.waiting = false;
  r.roomId = room.id;
  s.residents.push(r);
  return r;
}

function stock(s: GameState, defId: string, times = 1) {
  const recipe = recipeFor(content, defId);
  if (!recipe) throw new Error(`no recipe ${defId}`);
  for (const [id, n] of Object.entries(recipe.salvage)) s.salvage[id] = (s.salvage[id] ?? 0) + n * times;
}

function store(s: GameState, defId: string): number {
  const id = s.nextId++;
  s.items.push({ id, defId });
  return id;
}

const rarityOfSalvage = (id: string): Rarity => content.salvage[id]!.rarity;

describe('recipes', () => {
  it('every weapon and outfit has exactly one sensible recipe', () => {
    const recipes = content.crafting.recipes;
    expect(Object.keys(content.weapons)).toHaveLength(15);
    expect(Object.keys(content.outfits)).toHaveLength(21);
    expect(recipes).toHaveLength(36);
    const ranges: Record<Rarity, { scrip: [number, number]; hours: [number, number]; level: number; salvage: Rarity[] }> = {
      common: { scrip: [20, 60], hours: [0.5, 1], level: 1, salvage: ['common'] },
      rare: { scrip: [250, 600], hours: [3, 6], level: 2, salvage: ['common', 'rare'] },
      legendary: { scrip: [6000, 15000], hours: [12, 24], level: 3, salvage: ['rare', 'legendary'] },
    };
    for (const def of Object.values(content.items)) {
      expect(recipes.filter((r) => r.defId === def.id), def.id).toHaveLength(1);
      const r = recipeFor(content, def.id)!;
      const want = ranges[def.rarity];
      expect(r.workshop).toBe(def.kind === 'weapon' ? 'weaponshop' : 'outfitshop');
      expect(r.minLevel).toBe(want.level);
      expect(r.scrip).toBeGreaterThanOrEqual(want.scrip[0]);
      expect(r.scrip).toBeLessThanOrEqual(want.scrip[1]);
      expect(r.seconds / 3600).toBeGreaterThanOrEqual(want.hours[0]);
      expect(r.seconds / 3600).toBeLessThanOrEqual(want.hours[1]);
      const ids = Object.keys(r.salvage);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        expect(content.salvage[id], `${def.id}: ${id}`).toBeDefined();
        expect(want.salvage).toContain(rarityOfSalvage(id));
      }
      // Rares and legendaries need salvage of their own tier.
      if (def.rarity !== 'common') expect(ids.some((id) => rarityOfSalvage(id) === def.rarity)).toBe(true);
    }
    expect(content.crafting.fragmentsNeeded).toEqual({ rare: 3, legendary: 5 });
  });

  it('workshops list their own recipes', () => {
    const s = calm();
    expect(workshopRecipes(content, workshop(s, 'weaponshop'))).toHaveLength(15);
    expect(workshopRecipes(content, workshop(s, 'outfitshop'))).toHaveLength(21);
  });

  it('crafting achievements watch counters the system bumps', () => {
    const counters = new Set([
      'itemsCrafted',
      'crafted.common',
      'crafted.rare',
      'crafted.legendary',
      'itemsScrapped',
      'reforges',
      'reforgeUpgrades.legendary',
      'reforgePityUpgrades',
    ]);
    const achievements = content.crafting.achievements;
    expect(achievements.length).toBeGreaterThanOrEqual(10);
    for (const a of achievements) expect(counters.has(a.stat), a.id).toBe(true);
    const ids = content.achievements.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('crafting', () => {
  it('gates on workshop, level, recipe, power, crew, job, incident, salvage and scrip', () => {
    const s = calm();
    const ws = workshop(s, 'weaponshop');
    const gen = s.rooms.find((r) => r.type === 'generator')!;
    expect(canCraft(s, content, gen, 'wrench')).toMatch(/workshop/);
    expect(canCraft(s, content, ws, 'work_overalls')).toMatch(/Outfit Workshop/);
    expect(canCraft(s, content, ws, 'wrench')).toMatch(/worker/);
    worker(s, ws);
    expect(canCraft(s, content, ws, 'wrench')).toMatch(/more/);
    stock(s, 'wrench');
    s.scrip = 0;
    expect(canCraft(s, content, ws, 'wrench')).toMatch(/scrip/);
    s.scrip = 1000;
    expect(canCraft(s, content, ws, 'wrench')).toBeNull();

    ws.powered = false;
    expect(canCraft(s, content, ws, 'wrench')).toMatch(/power/);
    ws.powered = true;
    const fire = startIncident(s, content, 'fire', ws);
    expect(canCraft(s, content, ws, 'wrench')).toMatch(/incident/);
    s.incidents = s.incidents.filter((i) => i.id !== fire.id);

    // Rares need a level 2 workshop and a known recipe.
    stock(s, 'rivet_rifle');
    expect(canCraft(s, content, ws, 'rivet_rifle')).toMatch(/level 2/);
    ws.level = 2;
    expect(canCraft(s, content, ws, 'rivet_rifle')).toMatch(/recipe/);
    s.recipes.push('rivet_rifle');
    expect(canCraft(s, content, ws, 'rivet_rifle')).toBeNull();
    expect(canCraft(s, content, ws, 'sunbeam_rifle')).toMatch(/level 3/);

    expect(applyCommand(s, content, { type: 'craft', roomId: ws.id, defId: 'wrench' }).ok).toBe(true);
    expect(canCraft(s, content, ws, 'rivet_rifle')).toMatch(/already/);
    expect(applyCommand(s, content, { type: 'craft', roomId: ws.id, defId: 'rivet_rifle' }).ok).toBe(false);
  });

  it('children do not count as crew', () => {
    const s = calm();
    const ws = workshop(s, 'weaponshop');
    const kid = worker(s, ws);
    kid.adultAt = s.time + 3600;
    expect(canCraft(s, content, ws, 'wrench')).toMatch(/worker/);
  });

  it('spends costs on start and refunds them on cancel', () => {
    const s = calm();
    const ws = workshop(s, 'weaponshop');
    worker(s, ws);
    stock(s, 'scrap_carbine');
    const salvage = { ...s.salvage };
    const scrip = s.scrip;
    expect(applyCommand(s, content, { type: 'craft', roomId: ws.id, defId: 'scrap_carbine' }).ok).toBe(true);
    const recipe = recipeFor(content, 'scrap_carbine')!;
    expect(s.scrip).toBe(scrip - recipe.scrip);
    for (const id of Object.keys(recipe.salvage)) expect(s.salvage[id]).toBe(0);
    expect(ws.job).toEqual({ defId: 'scrap_carbine', remaining: recipe.seconds, total: recipe.seconds });
    expect(s.events.some((e) => e.type === 'craftStarted')).toBe(true);

    advance(s, content, 30);
    expect(applyCommand(s, content, { type: 'cancelCraft', roomId: ws.id }).ok).toBe(true);
    expect(ws.job).toBeNull();
    expect(s.salvage).toEqual(salvage);
    expect(s.scrip).toBeGreaterThanOrEqual(scrip); // production may add a little, never less
    expect(s.stats['salvageFound'] ?? 0).toBe(0);
    expect(applyCommand(s, content, { type: 'cancelCraft', roomId: ws.id }).ok).toBe(false);
  });

  it('crew speed follows base × (1 − 0.9 × total/102)', () => {
    const s = calm();
    const ws = workshop(s, 'weaponshop');
    const base = recipeFor(content, 'wrench')!.seconds; // brawn
    expect(craftSeconds(s, content, ws, 'wrench')).toBe(Infinity);
    const a = worker(s, ws, 4);
    const b = worker(s, ws, 6);
    expect(craftSeconds(s, content, ws, 'wrench')).toBeCloseTo(base * (1 - 0.9 * (10 / 102)));
    // Outfits count toward the craft stat.
    a.outfit = 'titan_harness'; // +7 brawn
    expect(craftSeconds(s, content, ws, 'wrench')).toBeCloseTo(base * (1 - 0.9 * (17 / 102)));
    void b;

    // A full crew of 10s in +7 outfits hits the 10% floor, and more can't beat it.
    const t = calm();
    const full = workshop(t, 'weaponshop');
    for (let i = 0; i < 6; i++) worker(t, full, 10).outfit = 'titan_harness';
    expect(craftSeconds(t, content, full, 'wrench')).toBeCloseTo(base * 0.1);
  });

  it('counts down in base-seconds, and crew changes change the speed', () => {
    const s = calm();
    const ws = workshop(s, 'weaponshop');
    const w1 = worker(s, ws, 5);
    stock(s, 'wrench');
    applyCommand(s, content, { type: 'craft', roomId: ws.id, defId: 'wrench' });
    const job = ws.job!;
    const slow = craftSeconds(s, content, ws, 'wrench');
    tickCrafting(s, content, 60);
    expect(job.total - job.remaining).toBeCloseTo((60 * job.total) / slow);
    expect(craftTimeLeft(s, content, ws)).toBeCloseTo(slow - 60);

    for (let i = 0; i < 5; i++) worker(s, ws, 10);
    const fast = craftSeconds(s, content, ws, 'wrench');
    expect(fast).toBeLessThan(slow);
    const before = job.remaining;
    tickCrafting(s, content, 60);
    expect(before - job.remaining).toBeCloseTo((60 * job.total) / fast);
    void w1;
  });

  it('stalls with no crew, no power, or an incident', () => {
    const s = calm();
    const ws = workshop(s, 'outfitshop');
    const w = worker(s, ws);
    stock(s, 'lab_smock');
    applyCommand(s, content, { type: 'craft', roomId: ws.id, defId: 'lab_smock' });
    const job = ws.job!;
    const start = job.remaining;

    w.roomId = null;
    tickCrafting(s, content, 60);
    expect(job.remaining).toBe(start);
    expect(craftTimeLeft(s, content, ws)).toBe(Infinity);
    w.roomId = ws.id;

    // No stored power: the power check turns every room off.
    s.resources.power = 0;
    advance(s, content, 10);
    expect(ws.powered).toBe(false);
    expect(job.remaining).toBe(start);
    expect(craftTimeLeft(s, content, ws)).toBe(Infinity);
    s.resources.power = 1000;
    ws.powered = true;

    const fire = startIncident(s, content, 'fire', ws);
    tickCrafting(s, content, 60);
    expect(job.remaining).toBe(start);
    expect(craftTimeLeft(s, content, ws)).toBe(Infinity);
    s.incidents = s.incidents.filter((i) => i.id !== fire.id);

    tickCrafting(s, content, 60);
    expect(job.remaining).toBeLessThan(start);
  });

  it('offline catch-up finishes a job, then collect grants the item and crew xp', () => {
    const s = calm();
    const ws = workshop(s, 'weaponshop', 3);
    const crew = [worker(s, ws, 6), worker(s, ws, 6)];
    s.recipes.push('glare_lance');
    stock(s, 'glare_lance');
    expect(applyCommand(s, content, { type: 'craft', roomId: ws.id, defId: 'glare_lance' }).ok).toBe(true);
    const need = craftTimeLeft(s, content, ws);
    expect(need).toBeGreaterThan(20 * 3600);
    expect(need).toBeLessThan(24 * 3600);
    s.events = [];

    // Halfway through an absence the job is partly done...
    const half = deserialize(serialize(s, T0));
    catchUp(half, content, half.lastRealTime + 10 * 3600 * 1000);
    const halfJob = half.rooms.find((r) => r.id === ws.id)!.job!;
    expect(halfJob.remaining).toBeGreaterThan(0);
    expect(halfJob.remaining).toBeLessThan(halfJob.total * 0.6);
    // ...and a full day away finishes it.
    catchUp(s, content, s.lastRealTime + 24 * 3600 * 1000);
    expect(ws.job!.remaining).toBe(0);
    expect(craftTimeLeft(s, content, ws)).toBe(0);
    expect(s.events.filter((e) => e.type === 'craftFinished')).toHaveLength(1);

    const xp0 = crew.map((r) => r.xp + r.level * 1e6);
    expect(applyCommand(s, content, { type: 'collectCraft', roomId: ws.id }).ok).toBe(true);
    expect(ws.job).toBeNull();
    expect(s.items.map((i) => i.defId)).toContain('glare_lance');
    crew.forEach((r, i) => expect(r.xp + r.level * 1e6).toBeGreaterThan(xp0[i]!));
    expect(s.stats['itemsCrafted']).toBe(1);
    expect(s.stats['crafted.legendary']).toBe(1);
    expect(s.achievements['craft_first']).toBeDefined();
    expect(s.achievements['craft_legendary']).toBeDefined();
    expect(s.events.some((e) => e.type === 'craftCollected')).toBe(true);
  });

  it('refuses to collect into full storage rather than selling', () => {
    const s = calm();
    const ws = workshop(s, 'weaponshop');
    worker(s, ws);
    stock(s, 'wrench');
    applyCommand(s, content, { type: 'craft', roomId: ws.id, defId: 'wrench' });
    expect(applyCommand(s, content, { type: 'collectCraft', roomId: ws.id })).toEqual({ ok: false, reason: 'still crafting' });
    tickCrafting(s, content, 24 * 3600);
    while (s.items.length < itemCapacity(s, content)) store(s, 'rusty_revolver');
    const scrip = s.scrip;
    const res = applyCommand(s, content, { type: 'collectCraft', roomId: ws.id });
    expect(res).toEqual({ ok: false, reason: 'storage is full' });
    expect(ws.job).not.toBeNull();
    expect(s.scrip).toBe(scrip);
    s.items.pop();
    expect(applyCommand(s, content, { type: 'collectCraft', roomId: ws.id }).ok).toBe(true);
    expect(s.items.at(-1)!.defId).toBe('wrench');
  });

  it('a save round-trips mid-job', () => {
    const s = calm();
    const ws = workshop(s, 'outfitshop', 2);
    worker(s, ws, 7);
    worker(s, ws, 3);
    s.recipes.push('gamblers_vest');
    stock(s, 'gamblers_vest');
    applyCommand(s, content, { type: 'craft', roomId: ws.id, defId: 'gamblers_vest' });
    advance(s, content, 600);
    const copy = deserialize(serialize(s, T0));
    expect(copy.rooms.find((r) => r.id === ws.id)!.job).toEqual(ws.job);
    advance(s, content, 3600);
    advance(copy, content, 3600);
    expect(copy.rooms.find((r) => r.id === ws.id)!.job).toEqual(ws.job);
    expect(copy.rng).toEqual(s.rng);
  });
});

describe('scrapping', () => {
  it('returns recipe salvage minus a loss, never exceeding the recipe', () => {
    const s = calm();
    const recipe = recipeFor(content, 'scrap_carbine')!;
    let total = 0;
    for (let i = 0; i < 200; i++) {
      s.salvage = {};
      const id = store(s, 'scrap_carbine');
      expect(applyCommand(s, content, { type: 'scrap', itemId: id }).ok).toBe(true);
      const got = Object.values(s.salvage).reduce((a, b) => a + b, 0);
      expect(got).toBeGreaterThanOrEqual(1);
      for (const [sid, n] of Object.entries(s.salvage)) expect(n).toBeLessThanOrEqual(recipe.salvage[sid] ?? 0);
      total += got;
    }
    const preview = Object.values(scrapPreview(content, 'scrap_carbine')).reduce((a, b) => a + b, 0);
    // 7 units minus an average loss of 1.2.
    expect(preview).toBeCloseTo(5.8, 1);
    expect(total / 200).toBeCloseTo(preview, 0);
    expect(s.items).toHaveLength(0);
    expect(s.stats['itemsScrapped']).toBe(200);
    expect(s.events.some((e) => e.type === 'itemScrapped')).toBe(true);
  });

  it('legendaries always give back at least one legendary salvage', () => {
    const s = calm();
    const recipe = recipeFor(content, 'four_leaf_tux')!;
    const legendaryIds = Object.keys(recipe.salvage).filter((id) => rarityOfSalvage(id) === 'legendary');
    for (let i = 0; i < 100; i++) {
      s.salvage = {};
      applyCommand(s, content, { type: 'scrap', itemId: store(s, 'four_leaf_tux') });
      expect(legendaryIds.reduce((n, id) => n + (s.salvage[id] ?? 0), 0)).toBeGreaterThanOrEqual(1);
    }
    const preview = scrapPreview(content, 'four_leaf_tux');
    for (const id of Object.keys(preview)) expect(preview[id]).toBeLessThanOrEqual(recipe.salvage[id]!);
  });

  it('scrapping an unknown rare gives a fragment; three teach the recipe', () => {
    const s = calm();
    applyCommand(s, content, { type: 'scrap', itemId: store(s, 'arc_pistol') });
    expect(s.fragments['arc_pistol']).toBe(1);
    expect(s.events.some((e) => e.type === 'fragmentFound' && e.defId === 'arc_pistol')).toBe(true);
    applyCommand(s, content, { type: 'scrap', itemId: store(s, 'arc_pistol') });
    applyCommand(s, content, { type: 'scrap', itemId: store(s, 'arc_pistol') });
    expect(s.recipes).toContain('arc_pistol');
    expect(s.fragments['arc_pistol']).toBeUndefined();
    // Once known, no more fragments for it.
    applyCommand(s, content, { type: 'scrap', itemId: store(s, 'arc_pistol') });
    expect(s.fragments['arc_pistol']).toBeUndefined();
    // Commons never give their own fragment.
    applyCommand(s, content, { type: 'scrap', itemId: store(s, 'wrench') });
    expect(s.fragments['wrench']).toBeUndefined();
  });

  it('sometimes gives a fragment toward a legendary of the same kind', () => {
    const s = calm(5);
    for (let i = 0; i < 400; i++) applyCommand(s, content, { type: 'scrap', itemId: store(s, 'lab_smock') });
    const frags = Object.keys(s.fragments);
    expect(frags.length).toBeGreaterThan(0);
    for (const id of frags) {
      expect(content.items[id]!.kind).toBe('outfit');
      expect(content.items[id]!.rarity).toBe('legendary');
    }
  });

  it('only stored items can be scrapped', () => {
    const s = calm();
    expect(applyCommand(s, content, { type: 'scrap', itemId: 999_999 }).ok).toBe(false);
  });
});

describe('reforging', () => {
  it('validates its inputs', () => {
    const s = calm();
    const a = store(s, 'wrench');
    const b = store(s, 'flare_gun');
    const c = store(s, 'service_pistol');
    const outfit = store(s, 'lab_smock');
    const rare = store(s, 'arc_pistol');
    const bad = (itemIds: number[]) => applyCommand(s, content, { type: 'reforge', itemIds });
    expect(bad([a, b]).ok).toBe(false);
    expect(bad([a, a, b]).ok).toBe(false);
    expect(bad([a, b, 424242]).ok).toBe(false);
    expect(bad([a, b, outfit])).toEqual({ ok: false, reason: 'items must all be weapons or all outfits' });
    expect(bad([a, b, rare])).toEqual({ ok: false, reason: 'items must share a rarity' });
    s.scrip = reforgeCost(content, 'common') - 1;
    expect(bad([a, b, c])).toEqual({ ok: false, reason: 'not enough scrip' });
    expect(s.items).toHaveLength(5);

    s.scrip = 10_000;
    expect(bad([a, b, c]).ok).toBe(true);
    expect(s.scrip).toBe(10_000 - reforgeCost(content, 'common'));
    expect(s.items).toHaveLength(3);
    const ev = s.events.find((e) => e.type === 'reforged');
    expect(ev && ev.type === 'reforged' && ev.inputs).toEqual(['wrench', 'flare_gun', 'service_pistol']);
  });

  it('works with full storage, since the inputs leave first', () => {
    const s = calm();
    const ids = [store(s, 'wrench'), store(s, 'wrench'), store(s, 'wrench')];
    while (s.items.length < itemCapacity(s, content)) store(s, 'lab_smock');
    const n = s.items.length;
    expect(applyCommand(s, content, { type: 'reforge', itemIds: ids }).ok).toBe(true);
    expect(s.items).toHaveLength(n - 2);
    expect(s.events.some((e) => e.type === 'storageFull')).toBe(false);
  });

  it('guarantees an upgrade after three failures in a row', () => {
    const s = calm(3);
    s.scrip = 999_999;
    let streak = 0;
    let upgrades = 0;
    for (let i = 0; i < 200; i++) {
      const ids = [store(s, 'wrench'), store(s, 'wrench'), store(s, 'wrench')];
      const guaranteed = s.reforgePity >= 3;
      expect(reforgeChance(s, content, 'common')).toBe(guaranteed ? 1 : 0.35);
      applyCommand(s, content, { type: 'reforge', itemIds: ids });
      const ev = s.events.filter((e) => e.type === 'reforged').at(-1)!;
      if (ev.type !== 'reforged') throw new Error();
      const def = content.items[ev.result]!;
      expect(def.kind).toBe('weapon');
      if (ev.upgraded) {
        expect(def.rarity).toBe('rare');
        expect(s.reforgePity).toBe(0);
        upgrades++;
        streak = 0;
      } else {
        expect(guaranteed).toBe(false);
        expect(def.rarity).toBe('common');
        expect(ev.result).not.toBe('wrench'); // a different item where possible
        streak++;
        expect(s.reforgePity).toBe(streak);
      }
      expect(streak).toBeLessThanOrEqual(3);
      s.items = [];
      s.events = [];
    }
    // 35% with a pity floor lands around 41% overall.
    expect(upgrades / 200).toBeGreaterThan(0.3);
    expect(upgrades / 200).toBeLessThan(0.55);
    expect(s.stats['reforges']).toBe(200);
    expect(s.stats['reforgePityUpgrades']).toBeGreaterThan(0);
  });

  it('forced pity turns rares into a legendary', () => {
    const s = calm();
    s.reforgePity = 3;
    const ids = [store(s, 'scout_jacket'), store(s, 'dinner_jacket'), store(s, 'scout_jacket')];
    applyCommand(s, content, { type: 'reforge', itemIds: ids });
    const def = content.items[s.items[0]!.defId]!;
    expect(def.rarity).toBe('legendary');
    expect(def.kind).toBe('outfit');
    expect(s.reforgePity).toBe(0);
    expect(s.achievements['reforge_legendary']).toBeDefined();
  });

  it('legendary inputs reroll into a different legendary', () => {
    const s = calm();
    s.scrip = 999_999;
    for (let i = 0; i < 30; i++) {
      const ids = [store(s, 'sunbeam_rifle'), store(s, 'thunderclap'), store(s, 'peacemaker')];
      applyCommand(s, content, { type: 'reforge', itemIds: ids });
      expect(s.items.map((x) => x.defId)).toEqual(['glare_lance']);
      s.items = [];
    }
    expect(s.reforgePity).toBe(0);
    expect(s.stats['reforgeRerolls']).toBe(30);
  });
});

describe('determinism', () => {
  it('the same seed gives the same scraps and reforges', () => {
    const run = () => {
      const s = calm(77);
      for (let i = 0; i < 20; i++) applyCommand(s, content, { type: 'scrap', itemId: store(s, 'coilgun') });
      for (let i = 0; i < 20; i++) {
        applyCommand(s, content, { type: 'reforge', itemIds: [store(s, 'lab_smock'), store(s, 'lab_smock'), store(s, 'lab_smock')] });
      }
      return JSON.stringify({ salvage: s.salvage, items: s.items, fragments: s.fragments, recipes: s.recipes, pity: s.reforgePity });
    };
    expect(run()).toBe(run());
  });
});
