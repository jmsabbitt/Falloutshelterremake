import { describe, expect, it } from 'vitest';
import { applyCommand, canPlace, catchUp, loadContent, newGame, totalFloors, type Content, type GameState, type Room } from '../src/sim';
import { refreshUnlocks } from '../src/sim/economy';
import { createResident } from '../src/sim/residents';
import {
  canExcavate,
  deepContent,
  deepIncidentChance,
  digCost,
  digSeconds,
  discover,
  isDeepFloor,
  refineryBatch,
  refineryPerHour,
  startExcavation,
  stratumOf,
  tickDeep,
  workDiscoveryThreshold,
} from '../src/sim/systems/deep';
import { deepIncidentTypes, startIncident, tickIncidents, tickIncidentTimer } from '../src/sim/systems/incidents';
import { tickProduction } from '../src/sim/systems/production';
import type { Resident } from '../src/sim';

const content = loadContent();
const T0 = 1_700_000_000_000;
const BASE = content.balance.grid.floors;

function game(seed = 21): GameState {
  const s = newGame(content, { seed, now: T0 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  s.scrip = 500_000;
  s.peakPopulation = 200;
  return s;
}

function addRoom(s: GameState, type: string, floor: number, x: number, extra: Partial<Room> = {}): Room {
  const room: Room = { id: s.nextId++, type, floor, x, segments: 1, level: 1, pool: 0, ready: false, powered: true, timer: 0, job: null, banked: 0, ...extra };
  s.rooms.push(room);
  return room;
}

/** Elevators at x = 6 from floor 3 down to `to` (the starter shaft covers 0..2). */
function shaft(s: GameState, to: number): void {
  for (let f = 3; f <= to; f++) if (!s.rooms.some((r) => r.type === 'elevator' && r.floor === f)) addRoom(s, 'elevator', f, 6);
}

function research(s: GameState, ...ids: string[]): void {
  for (const id of ids) if (!s.research.done.includes(id)) s.research.done.push(id);
  refreshUnlocks(s, content);
}

function worker(s: GameState, room: Room, stats: Partial<Resident['stats']> = {}): Resident {
  const r = createResident(s, content, {});
  r.waiting = false;
  Object.assign(r.stats, stats);
  r.roomId = room.id;
  s.residents.push(r);
  return r;
}

/** A homestead with `strata` already dug and a shaft to its bottom. */
function dug(strata: number, seed = 21): GameState {
  const s = game(seed);
  s.deep.strata = strata;
  shaft(s, totalFloors(s, content) - 1);
  return s;
}

/** Content with an extra research node granting these effects (stream A owns the real tree). */
function withNode(effects: { effect: string; value: number }[]): Content {
  const research = content.research as unknown as { nodes: unknown[] };
  return { ...content, research: { ...research, nodes: [...research.nodes, { id: 'test_node', effects }] } } as unknown as Content;
}

describe('excavation', () => {
  it('gates on research, the shaft, scrip and a running dig', () => {
    const s = game();
    expect(canExcavate(s, content)).toMatch(/research/);
    research(s, 'deep_survey');
    expect(canExcavate(s, content)).toMatch(/elevator/);
    shaft(s, BASE - 2);
    expect(canExcavate(s, content)).toMatch(/elevator/); // one floor short
    shaft(s, BASE - 1);
    s.scrip = digCost(content, 1) - 1;
    expect(canExcavate(s, content)).toMatch(/scrip/);
    s.scrip = digCost(content, 1) + 100;
    expect(canExcavate(s, content)).toBeNull();

    expect(applyCommand(s, content, { type: 'excavate' }).ok).toBe(true);
    expect(s.scrip).toBe(100);
    expect(s.deep.dig).toMatchObject({ stratum: 1, total: digSeconds(content, 1) });
    expect(s.stats['digsStarted']).toBe(1);
    expect(canExcavate(s, content)).toMatch(/already/);
    expect(applyCommand(s, content, { type: 'excavate' }).ok).toBe(false);
  });

  it('an unconnected elevator on the bottom floor does not count', () => {
    const s = game();
    research(s, 'deep_survey');
    addRoom(s, 'elevator', BASE - 1, 6);
    expect(canExcavate(s, content)).toMatch(/elevator/);
  });

  it('takes digHours, then opens the stratum, with a discovery', () => {
    const s = game();
    research(s, 'deep_survey');
    shaft(s, BASE - 1);
    expect(startExcavation(s, content)).toBeNull();
    const total = digSeconds(content, 1);
    expect(total).toBe(deepContent(content).tuning.digHours[0]! * 3600);
    s.events = [];
    for (let t = 0; t < total - 5; t++) tickDeep(s, content, 1, false);
    expect(s.deep.strata).toBe(0);
    for (let t = 0; t < 10; t++) tickDeep(s, content, 1, false);
    expect(s.deep.strata).toBe(1);
    expect(s.deep.dig).toBeNull();
    expect(s.events.some((e) => e.type === 'digFinished' && e.stratum === 1)).toBe(true);
    expect(s.stats['strataExcavated']).toBe(1);
    expect(s.stats['deepestStratum']).toBe(1);
    expect(s.deep.discoveries).toEqual(['s1_placard']);
    expect(s.events.some((e) => e.type === 'discovery' && e.discoveryId === 's1_placard')).toBe(true);
  });

  it('keeps digging offline, and a 60 s step equals sixty 1 s steps', () => {
    const s = game();
    research(s, 'deep_survey');
    shaft(s, BASE - 1);
    startExcavation(s, content);
    catchUp(s, content, s.lastRealTime + (digSeconds(content, 1) + 120) * 1000);
    expect(s.deep.strata).toBe(1);
    expect(s.achievements['deep_first_stratum']).toBeDefined();

    const a = dug(1);
    const b = dug(1);
    research(a, 'deep_survey_2');
    research(b, 'deep_survey_2');
    startExcavation(a, content);
    startExcavation(b, content);
    for (let i = 0; i < 60; i++) tickDeep(a, content, 1, true);
    tickDeep(b, content, 60, true);
    expect(a.deep.dig!.remaining).toBeCloseTo(b.deep.dig!.remaining, 6);
  });

  it('digSpeed research shortens the dig', () => {
    const fast = withNode([{ effect: 'digSpeed', value: 1 }]);
    const s = game();
    s.research.done.push('deep_survey', 'test_node');
    shaft(s, BASE - 1);
    expect(startExcavation(s, fast)).toBeNull();
    for (let t = 0; t < digSeconds(fast, 1) / 2 + 1; t++) tickDeep(s, fast, 1, true);
    expect(s.deep.strata).toBe(1);
  });

  it('needs each survey in turn and stops after the fourth stratum', () => {
    const s = dug(1);
    expect(canExcavate(s, content)).toMatch(/research/);
    research(s, 'deep_survey_2');
    expect(canExcavate(s, content)).toBeNull();
    const d = dug(4);
    research(d, 'deep_survey', 'deep_survey_2', 'deep_survey_3', 'deep_survey_4');
    expect(canExcavate(d, content)).toMatch(/no further/);
  });
});

describe('deep floors and rooms', () => {
  it('opens five floors per stratum; the base grid stays at 25', () => {
    const s = game();
    expect(BASE).toBe(25);
    expect(canPlace(s, content, 'elevator', BASE, 6).ok).toBe(false);
    s.deep.strata = 1;
    shaft(s, BASE - 1);
    expect(totalFloors(s, content)).toBe(BASE + 5);
    expect(canPlace(s, content, 'elevator', BASE, 6).ok).toBe(true);
    expect(canPlace(s, content, 'quarters', BASE, 7).ok).toBe(false); // nothing to attach to yet
    shaft(s, BASE + 4);
    expect(canPlace(s, content, 'quarters', BASE + 4, 7).ok).toBe(true);
    const below = canPlace(s, content, 'elevator', BASE + 5, 6);
    expect(below.ok).toBe(false);
    expect(!below.ok && below.reason).toMatch(/excavate/);
    expect(isDeepFloor(content, BASE - 1)).toBe(false);
    expect(stratumOf(content, BASE)).toBe(1);
    expect(stratumOf(content, BASE + 5)).toBe(2);
  });

  it('deep rooms need their research and a deep floor', () => {
    const s = dug(1);
    const build = (roomType: string, floor: number, x: number) => applyCommand(s, content, { type: 'build', roomType, floor, x });
    expect(build('geothermal', BASE, 7).ok).toBe(false);
    research(s, 'geothermal_taps', 'fungal_farming', 'ore_refining');
    for (const id of ['geothermal', 'fungalfarm', 'refinery']) {
      expect(content.rooms[id]!.minFloor).toBe(BASE);
      expect(s.unlockedRooms).toContain(id);
    }
    const shallow = build('geothermal', BASE - 1, 7);
    expect(shallow.ok).toBe(false);
    expect(!shallow.ok && shallow.reason).toMatch(/Deep/);
    expect(build('geothermal', BASE, 7).ok).toBe(true);
    expect(build('fungalfarm', BASE + 1, 7).ok).toBe(true);
    expect(build('refinery', BASE + 2, 7).ok).toBe(true);
    // Ordinary rooms are fine down here too.
    expect(build('quarters', BASE + 3, 7).ok).toBe(true);
    // The Aquifer Pump waits for the Cisterns.
    research(s, 'deep_survey_2');
    expect(build('aquifer', BASE + 4, 7).ok).toBe(false);
  });

  it('deep rooms merge, and deep production beats the surface version', () => {
    const s = dug(1);
    research(s, 'geothermal_taps');
    expect(applyCommand(s, content, { type: 'build', roomType: 'geothermal', floor: BASE, x: 7 }).ok).toBe(true);
    expect(applyCommand(s, content, { type: 'build', roomType: 'geothermal', floor: BASE, x: 10 }).ok).toBe(true);
    const taps = s.rooms.filter((r) => r.type === 'geothermal');
    expect(taps).toHaveLength(1);
    expect(taps[0]!.segments).toBe(2);
    const gen = content.rooms['generator']!.produces!.output;
    const geo = content.rooms['geothermal']!.produces!.output;
    for (let l = 0; l < 3; l++) for (let w = 0; w < 3; w++) expect(geo[l]![w]!).toBeGreaterThan(gen[l]![w]!);
  });
});

describe('discoveries', () => {
  it('has four strata of original lore, each with at least four finds and one breakthrough', () => {
    const deep = deepContent(content);
    expect(deep.strata.map((s) => s.index)).toEqual([1, 2, 3, 4]);
    expect(deep.strata.map((s) => s.requiresResearch)).toEqual(['deep_survey', 'deep_survey_2', 'deep_survey_3', 'deep_survey_4']);
    for (const st of deep.strata) {
      expect(st.name.length).toBeGreaterThan(5);
      expect(st.description.length).toBeGreaterThan(40);
      const finds = Object.values(deep.discoveries).filter((d) => d.stratum === st.index);
      expect(finds.length).toBeGreaterThanOrEqual(4);
      expect(finds.filter((d) => d.onDig)).toHaveLength(1);
    }
    for (const [id, d] of Object.entries(deep.discoveries)) {
      expect(d.id).toBe(id);
      expect(d.text.length).toBeGreaterThan(40);
      if (d.reward?.recipe) expect(content.items[d.reward.recipe]).toBeDefined();
    }
  });

  it('pays rewards through the usual helpers', () => {
    const s = game();
    const crates = s.crates.standard;
    expect(discover(s, content, 's1_node')).toBe(true);
    expect(s.crates.standard).toBe(crates + 1);
    expect(discover(s, content, 's1_node')).toBe(false);
    expect(s.stats['discoveries']).toBe(1);

    expect(discover(s, content, 's3_lesson')).toBe(true);
    expect(s.recipes).toContain('tunneler_gear');

    const salvage = () => Object.values(s.salvage).reduce((a, b) => a + b, 0);
    const before = salvage();
    discover(s, content, 's1_canister');
    expect(salvage()).toBeGreaterThanOrEqual(before + 3);

    const frags = () => Object.values(s.fragments).reduce((a, b) => a + b, 0) + s.recipes.length;
    const f0 = frags();
    discover(s, content, 's2_brochure');
    expect(frags()).toBe(f0 + 1);
  });

  it('turns up more while residents work deep floors, online only', () => {
    const s = dug(1);
    s.deep.discoveries = ['s1_placard'];
    const farm = addRoom(s, 'fungalfarm', BASE, 7);
    worker(s, farm);
    worker(s, farm);
    const need = workDiscoveryThreshold(content, 1);

    // Offline time doesn't count.
    catchUp(s, content, s.lastRealTime + 10 * 3600 * 1000);
    expect(s.stats['deepWorkSeconds'] ?? 0).toBe(0);
    expect(s.deep.discoveries).toHaveLength(1);

    s.stats['deepWorkSeconds'] = need - 10;
    s.events = [];
    for (let i = 0; i < 4; i++) tickDeep(s, content, 1, false);
    expect(s.deep.discoveries).toHaveLength(1);
    for (let i = 0; i < 2; i++) tickDeep(s, content, 1, false);
    expect(s.deep.discoveries).toHaveLength(2);
    expect(s.deep.discoveries[1]).toBe('s1_rota'); // in order, never the breakthrough find
    expect(s.events.some((e) => e.type === 'discovery')).toBe(true);
    expect(s.stats['discoveries.work']).toBe(1);

    // The next one takes longer.
    expect(workDiscoveryThreshold(content, 2) - workDiscoveryThreshold(content, 1)).toBeGreaterThan(need);
  });

  it('stops counting once a stratum is catalogued, so a new stratum starts fresh', () => {
    const s = dug(1);
    s.deep.discoveries = Object.values(deepContent(content).discoveries).filter((d) => d.stratum === 1).map((d) => d.id);
    const farm = addRoom(s, 'fungalfarm', BASE, 7);
    worker(s, farm);
    for (let i = 0; i < 100; i++) tickDeep(s, content, 1, false);
    expect(s.stats['deepWorkSeconds'] ?? 0).toBe(0);
  });

  it('nobody working deep, nothing found', () => {
    const s = dug(1);
    s.stats['deepWorkSeconds'] = 1e9;
    addRoom(s, 'fungalfarm', BASE, 7);
    for (let i = 0; i < 10; i++) tickDeep(s, content, 1, false);
    expect(s.deep.discoveries).toHaveLength(0);
  });
});

describe('refinery', () => {
  it('turns Knack into salvage at the tuned rate, online and offline', () => {
    const s = dug(1);
    const ref = addRoom(s, 'refinery', BASE, 7);
    worker(s, ref, { knack: 6 });
    worker(s, ref, { knack: 6 });
    const perHour = refineryPerHour(s, content, ref);
    expect(perHour).toBeGreaterThan(1);
    expect(perHour).toBeLessThan(10);
    for (let i = 0; i < 3600; i++) tickDeep(s, content, 1, true);
    expect(s.stats['refinedSalvage']).toBeGreaterThanOrEqual(Math.floor(perHour) - 1);
    expect(s.stats['refinedSalvage']).toBeLessThanOrEqual(Math.ceil(perHour) + 1);

    // One 60 s step makes as much as sixty 1 s steps.
    const a = dug(1, 5);
    const b = dug(1, 5);
    for (const g of [a, b]) {
      const r = addRoom(g, 'refinery', BASE, 7);
      worker(g, r, { knack: 9 });
      r.pool = refineryBatch(content, r) - 30;
    }
    for (let i = 0; i < 60; i++) tickDeep(a, content, 1, true);
    tickDeep(b, content, 60, true);
    expect(a.stats['refinedSalvage']).toBe(b.stats['refinedSalvage']);
    expect(a.rooms.at(-1)!.pool).toBeCloseTo(b.rooms.at(-1)!.pool, 6);
  });

  it('is mostly steel and circuitry, and better levels find rarer pieces', () => {
    const rareShare = (level: number) => {
      const s = dug(1, 30 + level);
      const ref = addRoom(s, 'refinery', BASE, 7, { level, segments: 3 });
      for (let i = 0; i < 6; i++) worker(s, ref, { knack: 10 });
      const size = refineryBatch(content, ref);
      // 1,500 pieces, fed straight in.
      ref.pool = size * 1500;
      tickDeep(s, content, 0, true);
      const made = s.stats['refinedSalvage']!;
      expect(made).toBe(1500);
      const byMaterial: Record<string, number> = {};
      for (const [id, n] of Object.entries(s.salvage)) {
        const m = content.salvage[id]!.material;
        byMaterial[m] = (byMaterial[m] ?? 0) + n;
      }
      expect(((byMaterial['steel'] ?? 0) + (byMaterial['circuitry'] ?? 0)) / made).toBeGreaterThan(0.7);
      return ((s.stats['refinedSalvage.rare'] ?? 0) + (s.stats['refinedSalvage.legendary'] ?? 0)) / made;
    };
    const l1 = rareShare(1);
    const l3 = rareShare(3);
    expect(l1).toBeGreaterThan(0.02);
    expect(l3).toBeGreaterThan(l1 * 2);
  });

  it('stops without power, crew, or during an incident', () => {
    const s = dug(1);
    const ref = addRoom(s, 'refinery', BASE, 7);
    tickDeep(s, content, 600, true);
    expect(ref.pool).toBe(0);
    worker(s, ref, { knack: 5 });
    ref.powered = false;
    tickDeep(s, content, 600, true);
    expect(ref.pool).toBe(0);
    ref.powered = true;
    startIncident(s, content, 'cavein', ref);
    tickDeep(s, content, 600, true);
    expect(ref.pool).toBe(0);
    s.incidents = [];
    tickDeep(s, content, 60, true);
    expect(ref.pool).toBeGreaterThan(0);
  });
});

describe('deep threats', () => {
  /** A deep homestead with a mixed layout and enough people for every deep threat. */
  function crowded(strata = 2, seed = 3): GameState {
    const s = dug(strata, seed);
    for (let f = 3; f < totalFloors(s, content); f++) addRoom(s, 'quarters', f, 7);
    while (s.residents.filter((r) => !r.waiting).length < 40) {
      const r = createResident(s, content, {});
      r.waiting = false;
      s.residents.push(r);
    }
    return s;
  }

  function fire(s: GameState): void {
    s.incidents = [];
    s.incidentTimer = 0;
    s.nextIncidentAt = 0;
    tickIncidentTimer(s, content, 1);
  }

  it('start only in rooms on deep floors, alongside the usual roster', () => {
    const s = crowded();
    const deepTypes = new Set(deepIncidentTypes(content));
    expect([...deepTypes].sort()).toEqual(['cavein', 'deepcrawlers', 'flood']);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      fire(s);
      for (const inc of s.incidents) {
        seen.add(inc.type);
        const room = s.rooms.find((r) => r.id === inc.roomId)!;
        if (deepTypes.has(inc.type)) {
          expect(isDeepFloor(content, room.floor)).toBe(true);
          if (inc.type === 'flood') expect(stratumOf(content, room.floor)).toBeGreaterThanOrEqual(2);
        }
      }
    }
    for (const t of ['cavein', 'flood', 'deepcrawlers', 'fire', 'skitters']) expect(seen.has(t)).toBe(true);
  });

  it('never start without deep rooms, and never offline', () => {
    const s = game(8);
    for (let f = 3; f < BASE; f++) addRoom(s, 'quarters', f, 7);
    shaft(s, BASE - 1);
    while (s.residents.filter((r) => !r.waiting).length < 40) {
      const r = createResident(s, content, {});
      r.waiting = false;
      s.residents.push(r);
    }
    const deepTypes = new Set(deepIncidentTypes(content));
    for (let i = 0; i < 200; i++) {
      fire(s);
      for (const inc of s.incidents) expect(deepTypes.has(inc.type)).toBe(false);
    }

    const d = crowded();
    d.nextIncidentAt = 1;
    d.incidentTimer = 0;
    catchUp(d, content, d.lastRealTime + 6 * 3600 * 1000);
    expect(d.incidents).toHaveLength(0);
  });

  it('a cave-in blocks production, does not spread, is dug out with Brawn, and settles if left', () => {
    const s = dug(1);
    addRoom(s, 'fungalfarm', BASE, 7);
    const mid = addRoom(s, 'geothermal', BASE, 10);
    addRoom(s, 'fungalfarm', BASE, 13);

    // Production stops while the room is buried.
    const tap = addRoom(s, 'geothermal', BASE + 2, 7);
    worker(s, tap, { brawn: 6 });
    const buried = startIncident(s, content, 'cavein', tap);
    tickProduction(s, content, 10);
    expect(tap.pool).toBe(0);
    s.incidents = s.incidents.filter((i) => i !== buried);
    tickProduction(s, content, 10);
    expect(tap.pool).toBeGreaterThan(0);

    // Left alone it never spreads, and eventually settles by itself.
    startIncident(s, content, 'cavein', mid);
    const settle = content.balance.incidents.types.cavein.settleSeconds;
    for (let t = 0; t < settle - 1; t++) tickIncidents(s, content, 1);
    expect(s.incidents.map((i) => i.roomId)).toEqual([mid.id]);
    tickIncidents(s, content, 2);
    expect(s.incidents).toHaveLength(0);
    expect(s.stats['incidentsSettled']).toBe(1);
    expect(s.stats['incidentsResolved.cavein'] ?? 0).toBe(0);

    // Brawny diggers clear it much faster than weak ones.
    const clearTime = (brawn: number) => {
      const g = dug(1, 9);
      const room = addRoom(g, 'geothermal', BASE, 7);
      worker(g, room, { brawn });
      worker(g, room, { brawn });
      startIncident(g, content, 'cavein', room);
      let t = 0;
      while (g.incidents.length && t < 600) {
        tickIncidents(g, content, 1);
        t++;
      }
      expect(g.stats['incidentsResolved.cavein']).toBe(1);
      return t;
    };
    expect(clearTime(10)).toBeLessThan(clearTime(2) * 0.6);
  });

  it('a flood spreads sideways only', () => {
    const s = dug(2);
    const f = BASE + 6;
    const a = addRoom(s, 'fungalfarm', f, 7);
    const b = addRoom(s, 'geothermal', f, 10);
    const c = addRoom(s, 'refinery', f, 13);
    const above = addRoom(s, 'geothermal', f - 1, 10);
    const below = addRoom(s, 'geothermal', f + 1, 10);
    startIncident(s, content, 'flood', b);
    for (let i = 0; i < 25; i++) tickIncidents(s, content, 1);
    const rooms = s.incidents.map((i) => i.roomId).sort();
    expect(rooms).toEqual([a.id, c.id].sort());
    expect(rooms).not.toContain(above.id);
    expect(rooms).not.toContain(below.id);
  });

  it('Deepcrawlers come from dirt edges and never climb out of the Deep', () => {
    const s = dug(1);
    const top = addRoom(s, 'quarters', BASE - 1, 7);
    const deep = addRoom(s, 'fungalfarm', BASE, 7);
    const next = addRoom(s, 'geothermal', BASE, 10);
    startIncident(s, content, 'deepcrawlers', deep);
    for (let i = 0; i < 15; i++) tickIncidents(s, content, 1);
    const rooms = s.incidents.map((i) => i.roomId);
    expect(rooms).toContain(next.id);
    expect(rooms).not.toContain(top.id);
  });

  it('get tougher with depth, and Deep Bracing makes them clearly easier', () => {
    const s = dug(2);
    const shallow = addRoom(s, 'geothermal', BASE, 7);
    const deeper = addRoom(s, 'geothermal', BASE + 5, 7);
    const a = startIncident(s, content, 'cavein', shallow);
    const b = startIncident(s, content, 'cavein', deeper);
    // Depth is split between HP and damage (sqrt each), so danger grows linearly.
    expect(b.maxHp).toBeGreaterThan(a.maxHp * 1.05);
    expect(b.dps).toBeGreaterThan(a.dps * 1.05);

    research(s, 'deep_bracing');
    const c = startIncident(s, content, 'cavein', shallow);
    expect(c.maxHp).toBeLessThanOrEqual(a.maxHp * 0.8);
    expect(c.dps).toBeLessThanOrEqual(a.dps * 0.8);

    const unbraced = deepIncidentChance(game(), content, 10, 20);
    const g = game();
    research(g, 'deep_bracing');
    expect(deepIncidentChance(g, content, 10, 20)).toBeLessThanOrEqual(unbraced * 0.7);
  });

  it('a fair fight: a level-10 crew of two clears a stratum-1 cave-in without serious injury', () => {
    const s = dug(1, 12);
    for (const r of s.residents) r.level = 10;
    const room = addRoom(s, 'geothermal', BASE, 7);
    const crew = [worker(s, room, { brawn: 5 }), worker(s, room, { brawn: 5 })];
    for (const r of crew) r.level = 10;
    startIncident(s, content, 'cavein', room);
    for (let i = 0; i < 120 && s.incidents.length; i++) tickIncidents(s, content, 1);
    expect(s.incidents).toHaveLength(0);
    for (const r of crew) expect(r.hp).toBeGreaterThan(r.maxHp * 0.7);
  });
});
