// M9 stream C: rare-item paths. Boss first-kill drops, treasure maps and
// caches, region exclusives and the lootOnly items.

import { describe, expect, it } from 'vitest';

// Legends who have come to the door (recruitLegend is real now that stream L has landed).
const legends = (s: GameState) => s.residents.filter((r) => r.legendary).map((r) => r.legendary);

import { applyCommand, loadContent, newGame, type Expedition, type GameState, type Quest, type Resident } from '../src/sim';
import questsJson from '../src/content/quests.json';
import { regionDef, tickExpeditions } from '../src/sim/systems/exploration';
import {
  cacheDef,
  deliverCarried,
  exclusiveRegionOf,
  isLootOnly,
  lootContent,
  mapChance,
  onBossDefeated,
  regionExclusives,
  rollRegionExclusive,
  rollTreasureMap,
  tickLoot,
  tripRoll,
} from '../src/sim/systems/loot';

const content = loadContent();
const T0 = 1_700_000_000_000;
const HOUR = 3600;


function calm(seed = 21): GameState {
  const s = newGame(content, { seed, now: T0 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  s.scrip = 50_000;
  s.resources.medpatch = 100;
  s.resources.purge = 100;
  return s;
}

function explorer(s: GameState): Resident {
  const r = s.residents.find((x) => !x.waiting && !x.dead && x.expedition === null)!;
  for (const k of Object.keys(r.stats) as (keyof Resident['stats'])[]) r.stats[k] = Math.max(r.stats[k], 12);
  r.level = 30;
  r.maxHp = 400;
  r.hp = 400;
  r.weapon = 'coilgun';
  r.outfit = 'tunneler_gear';
  return r;
}

function send(s: GameState, r: Resident, regionId = 'dustbowl'): Expedition {
  if (!s.regionsUnlocked.includes(regionId)) s.regionsUnlocked.push(regionId);
  const res = applyCommand(s, content, { type: 'explore', residentId: r.id, regionId, medpatch: 25, purge: 25 });
  if (!res.ok) throw new Error(res.reason);
  return s.expeditions.find((x) => x.residentId === r.id)!;
}

function bringHome(s: GameState, e: Expedition): void {
  if (e.status === 'exploring') applyCommand(s, content, { type: 'recall', expeditionId: e.id });
  tickExpeditions(s, content, e.returnRemaining + 1);
  expect(applyCommand(s, content, { type: 'collectExpedition', expeditionId: e.id }).ok).toBe(true);
}

function fakeQuest(s: GameState, defId = 'act1_6'): Quest {
  const q = {
    id: s.nextId++,
    defId,
    outcome: null,
    status: 'onsite',
    log: [],
    loot: { scrip: 0, items: [], salvage: {}, fragments: {}, recipes: [], crates: {}, medpatch: 0, purge: 0, xp: 0 },
  } as unknown as Quest;
  s.quests.push(q);
  return q;
}

/** Everything a resident owns after a trip: storage and what they wear. */
function owned(s: GameState): string[] {
  return [...s.items.map((i) => i.defId), ...s.residents.flatMap((r) => [r.weapon, r.outfit].filter((x): x is string => !!x))];
}

describe('content', () => {
  const bosses = Object.entries((content.quests as unknown as { enemies: Record<string, { boss?: boolean }> }).enemies)
    .filter(([, d]) => d.boss)
    .map(([id]) => id);

  it('every Act 1/2 boss has a first-kill item that exists', () => {
    const table = lootContent(content).bossFirstKill;
    expect(bosses.length).toBeGreaterThanOrEqual(15);
    // Every Act 1/2 boss (quests.json) is covered; Act 3 and legend bosses are added as they land.
    const act12 = Object.entries(questsJson.enemies as Record<string, { boss?: boolean }>).filter(([, d]) => d.boss).map(([id]) => id);
    for (const id of act12) expect(table, id).toHaveProperty(id);
    for (const [boss, item] of Object.entries(table)) {
      expect(bosses, boss).toContain(boss);
      expect(content.items[item], item).toBeDefined();
    }
  });

  it('adds about a dozen lootOnly items with names, flavour and fair stats', () => {
    const mine = Object.values(content.items).filter((d) => isLootOnly(content, d.id));
    expect(mine.length).toBeGreaterThanOrEqual(12);
    for (const d of mine) {
      expect(d.rarity).not.toBe('common');
      expect((d as { flavor?: string }).flavor?.length).toBeGreaterThan(20);
      if (d.kind === 'weapon') expect(d.max).toBeLessThanOrEqual(26);
    }
    // Each lootOnly item has at least one path.
    const L = lootContent(content);
    const paths = new Set<string>([
      ...Object.values(L.bossFirstKill),
      ...L.caches.flatMap((c) => c.reward.items ?? []),
      ...Object.keys(L.regionExclusives).flatMap((r) => regionExclusives(content, r)?.items ?? []),
      'mauler_tusk',
    ]);
    for (const d of mine) expect(paths, d.id).toContain(d.id);
  });

  it('caches point at known items and each region has exclusives', () => {
    for (const c of lootContent(content).caches) {
      for (const id of c.reward.items ?? []) expect(content.items[id], id).toBeDefined();
      expect(['dustbowl', 'glassflats', 'stillwater']).toContain(c.regionId);
    }
    expect(lootContent(content).caches.some((c) => c.reward.legend === 'granny_ash')).toBe(true);
    for (const r of ['dustbowl', 'glassflats', 'stillwater']) expect(regionExclusives(content, r)?.items.length).toBeGreaterThanOrEqual(2);
  });
});

describe('boss first kills', () => {
  it('pays the guaranteed drop once, committed when the quest succeeds', () => {
    const s = calm();
    const q1 = fakeQuest(s);
    onBossDefeated(s, content, q1, 'rust_warlord');
    expect(q1.loot.firstKill).toEqual(['barons_greatcoat']);
    expect(q1.log.some((l) => l.includes("Baron's Greatcoat"))).toBe(true);
    // A second party beating it before the first gets home doesn't double up.
    const q2 = fakeQuest(s);
    let extra = 0;
    for (let i = 0; i < 40; i++) {
      q2.loot.items = [];
      onBossDefeated(s, content, q2, 'rust_warlord');
      extra += q2.loot.items.length;
    }
    expect(extra).toBeLessThan(10);
    expect(s.loot.bossKills).toEqual([]);
    q1.outcome = 'success';
    tickLoot(s);
    expect(s.loot.bossKills).toEqual(['rust_warlord']);
    expect(s.stats['bossFirstKills']).toBe(1);
    expect(s.achievements['first_kill_1'] ?? null).toBeNull(); // counted by checkAchievements at the next settle
    // After that: only the small repeat chance.
    let got = 0;
    for (let i = 0; i < 400; i++) {
      const q = fakeQuest(s);
      onBossDefeated(s, content, q, 'rust_warlord');
      got += q.loot.items.length;
      s.quests = s.quests.filter((x) => x !== q);
    }
    expect(got).toBeGreaterThan(0);
    expect(got).toBeLessThan(400 * lootContent(content).repeatChance * 2.5);
    expect(s.stats['bossFirstKills']).toBe(1);
  });

  it('a failed quest keeps the guarantee for next time', () => {
    const s = calm();
    const q1 = fakeQuest(s);
    onBossDefeated(s, content, q1, 'kiln_mother');
    q1.outcome = 'failed';
    tickLoot(s);
    expect(s.loot.bossKills).toEqual([]);
    const q2 = fakeQuest(s);
    onBossDefeated(s, content, q2, 'kiln_mother');
    expect(q2.loot.firstKill).toEqual(['bedrock_armor']);
  });

  it('the first Big Tin kill brings Rook to the door', () => {
    const s = calm();
    const q = fakeQuest(s, 'act2_4');
    onBossDefeated(s, content, q, 'big_tin');
    expect(q.loot.firstKill).toEqual(['tin_knuckles']);
    expect(legends(s)).toEqual(['rook']);
    q.outcome = 'success';
    tickLoot(s);
    onBossDefeated(s, content, fakeQuest(s, 'act2_4'), 'big_tin');
    expect(legends(s)).toEqual(['rook']);
  });

  it('killing a boss and then abandoning pays no first-kill drop and keeps the guarantee', () => {
    const s = calm();
    const home = (q: Quest) => Object.assign(q, { status: 'returned', party: [], supplies: { medpatch: 0 } });
    for (let run = 0; run < 3; run++) {
      const q = fakeQuest(s, 'act1_3');
      onBossDefeated(s, content, q, 'rust_tollman');
      expect(q.loot.firstKill).toEqual(['gamblers_vest']);
      home(q).outcome = 'abandoned';
      expect(applyCommand(s, content, { type: 'collectQuest', questId: q.id }).ok).toBe(true);
    }
    expect(s.items.filter((i) => i.defId === 'gamblers_vest')).toHaveLength(0);
    expect(s.loot.bossKills).toEqual([]);
    // A win pays it, and commits the kill even when collected before the next tick.
    const q = fakeQuest(s, 'act1_3');
    onBossDefeated(s, content, q, 'rust_tollman');
    home(q).outcome = 'success';
    expect(applyCommand(s, content, { type: 'collectQuest', questId: q.id }).ok).toBe(true);
    expect(s.items.filter((i) => i.defId === 'gamblers_vest')).toHaveLength(1);
    expect(s.loot.bossKills).toEqual(['rust_tollman']);
    expect(s.stats['bossFirstKills']).toBe(1);
  });

  it('carries across foundings (bossKills is lifetime)', () => {
    const s = calm();
    s.loot.bossKills.push('shatterjaw');
    const q = fakeQuest(s);
    for (let i = 0; i < 5; i++) onBossDefeated(s, content, q, 'shatterjaw');
    expect(q.loot.items.length).toBeLessThan(5);
  });
});

describe('treasure maps and caches', () => {
  it('a rare find: the map travels home and is revealed on collection', () => {
    const s = calm();
    const r = explorer(s);
    const e = send(s, r);
    expect(mapChance(content, 0)).toBeLessThan(0.05);
    expect(mapChance(content, 100)).toBe(lootContent(content).maps.max);
    let line: string | null = null;
    for (let t = 0; t < 5000 && line === null; t++) {
      e.elapsed = t * 7;
      line = rollTreasureMap(s, content, e, (id) => !!regionDef(content, id));
    }
    expect(line).not.toBeNull();
    expect(s.loot.carried).toHaveLength(1);
    expect(s.loot.maps).toHaveLength(0);
    bringHome(s, e);
    expect(s.loot.carried).toHaveLength(0);
    expect(s.loot.maps).toHaveLength(1);
    expect(s.loot.maps[0]!.found).toBe(false);
    expect(s.stats['treasureMaps']).toBe(1);
    expect(s.events.some((x) => (x as { type: string }).type === 'treasureMapFound')).toBe(true);
    // Never two maps to one cache.
    const again = send(s, explorer(s));
    const cacheId = s.loot.maps[0]!.cacheId;
    for (let t = 0; t < 5000; t++) {
      again.elapsed = t * 7;
      rollTreasureMap(s, content, again, (id) => !!regionDef(content, id));
    }
    expect((s.loot.carried ?? []).filter((c) => c.cacheId === cacheId)).toHaveLength(0);
  });

  it('an explorer sent to the region digs the cache up and brings it home', () => {
    const s = calm();
    s.loot.maps.push({ id: s.nextId++, cacheId: 'drover_stash', regionId: 'dustbowl', found: false });
    const r = explorer(s);
    const e = send(s, r);
    tickExpeditions(s, content, 5 * HOUR);
    expect(s.loot.maps[0]!.found).toBe(true);
    expect(e.journal.some((j) => j.text === cacheDef(content, 'drover_stash')!.text)).toBe(true);
    const scrip = s.scrip;
    bringHome(s, e);
    expect(owned(s)).toContain('prospector_pick');
    expect(s.scrip).toBeGreaterThan(scrip + 100);
    expect(s.stats['cachesDug']).toBe(1);
    expect(s.events.some((x) => (x as { type: string }).type === 'cacheDug')).toBe(true);
  });

  it('only in its own region', () => {
    const s = calm();
    s.loot.maps.push({ id: s.nextId++, cacheId: 'survey_capsule', regionId: 'glassflats', found: false });
    const e = send(s, explorer(s), 'dustbowl');
    tickExpeditions(s, content, 5 * HOUR);
    expect(s.loot.maps[0]!.found).toBe(false);
    expect(e.loot.items).not.toContain('surveyor_duster');
  });

  it("Granny Ash's cellar brings Granny home", () => {
    const s = calm();
    s.loot.maps.push({ id: s.nextId++, cacheId: 'ash_cellar', regionId: 'dustbowl', found: false });
    const e = send(s, explorer(s));
    tickExpeditions(s, content, 5 * HOUR);
    expect(s.loot.maps[0]!.found).toBe(true);
    expect(legends(s)).toEqual([]); // not until they are home
    bringHome(s, e);
    expect(legends(s)).toEqual(['granny_ash']);
  });

  it('a lost explorer puts the cache back in the ground', () => {
    const s = calm();
    s.loot.maps.push({ id: s.nextId++, cacheId: 'drover_stash', regionId: 'dustbowl', found: false });
    const r = explorer(s);
    send(s, r);
    tickExpeditions(s, content, 5 * HOUR);
    expect(s.loot.maps[0]!.found).toBe(true);
    s.residents = s.residents.filter((x) => x !== r); // laid to rest while away
    tickExpeditions(s, content, 1);
    expect(s.loot.carried).toHaveLength(0);
    expect(s.loot.maps[0]!.found).toBe(false);
  });

  it('1 s and 60 s steps dig the same cache at the same moment', () => {
    const a = calm();
    a.loot.maps.push({ id: a.nextId++, cacheId: 'drover_stash', regionId: 'dustbowl', found: false });
    const ea = send(a, explorer(a));
    const b = structuredClone(a);
    for (let i = 0; i < 2 * HOUR; i++) tickExpeditions(a, content, 1);
    for (let i = 0; i < 120; i++) tickExpeditions(b, content, 60);
    const eb = b.expeditions.find((x) => x.id === ea.id)!;
    expect(eb.journal.map((j) => [j.t, j.text])).toEqual(ea.journal.map((j) => [j.t, j.text]));
    expect(b.loot).toEqual(a.loot);
  });

  it('deliverCarried is a no-op for trips with nothing carried', () => {
    const s = calm();
    const e = send(s, explorer(s));
    const before = structuredClone(e.loot);
    deliverCarried(s, content, e);
    expect(e.loot).toEqual(before);
  });
});

describe('region exclusives', () => {
  it('drop only in their region', () => {
    const s = calm();
    const e = send(s, explorer(s));
    for (const region of ['dustbowl', 'glassflats', 'stillwater']) {
      e.regionId = region;
      const got = new Set<string>();
      for (let t = 0; t < 3000; t++) {
        e.elapsed = t * 11;
        const id = rollRegionExclusive(s, content, e);
        if (id) got.add(id);
      }
      expect(got.size).toBeGreaterThan(0);
      for (const id of got) expect(exclusiveRegionOf(content, id)).toBe(region);
    }
    expect(s.stats['regionExclusives']).toBeGreaterThan(0);
  });

  it('real trips find no lootOnly item except their own region exclusives', () => {
    for (const region of ['dustbowl', 'glassflats']) {
      for (let seed = 1; seed <= 4; seed++) {
        const s = calm(seed);
        const e = send(s, explorer(s), region);
        tickExpeditions(s, content, 8 * HOUR);
        const r = s.residents.find((x) => x.id === e.residentId)!;
        for (const id of [...e.loot.items, r.weapon, r.outfit, ...e.loot.recipes, ...Object.keys(e.loot.fragments)]) {
          if (!id || !isLootOnly(content, id)) continue;
          expect(exclusiveRegionOf(content, id), id).toBe(region);
        }
      }
    }
  });

  it('the rolls are a pure function of the trip and the moment', () => {
    const s = calm();
    const e = send(s, explorer(s));
    e.elapsed = 1234.5;
    expect(tripRoll(e, 1)).toBe(tripRoll(e, 1));
    expect(tripRoll(e, 1)).not.toBe(tripRoll(e, 2));
    const rng = [...s.rng];
    rollRegionExclusive(s, content, e);
    expect(s.rng).toEqual(rng);
  });
});
