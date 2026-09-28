import { describe, expect, it } from 'vitest';
import { advance, applyCommand, canPlace, catchUp, connectedRoomIds, cycleSeconds, loadContent, newGame, type GameState, type Resident, type Room } from '../src/sim';
import { refreshUnlocks } from '../src/sim/economy';
import { TOPSIDE_FLOOR } from '../src/sim/grid';
import { createResident } from '../src/sim/residents';
import { researchContent } from '../src/sim/systems/research';
import {
  isTopside,
  nextWeather,
  raidDefense,
  signalRange,
  stormShielding,
  tickWeather,
  topsideContent,
  weatherMult,
} from '../src/sim/systems/weather';
import type { WeatherKind } from '../src/sim/types';

const content = loadContent();
/** The starter elevator shaft (the door is the six cells left of it). */
const S = content.balance.grid.starterShaftX;
const T0 = 1_700_000_000_000;
const tc = topsideContent(content);
const TOPSIDE_ROOMS = ['solar_array', 'wind_turbine', 'rain_catcher', 'farm_plots', 'watchtower', 'trading_post', 'signal_mast'];

function game(seed = 7): GameState {
  const s = newGame(content, { seed, now: T0 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  return s;
}

/** A room placed directly (placement has its own tests). */
function addRoom(s: GameState, type: string, floor = TOPSIDE_FLOOR, x = S - 6, level = 1): Room {
  const room: Room = { id: s.nextId++, type, floor, x, segments: 1, level, pool: 0, ready: false, powered: true, timer: 0, job: null, banked: 0 };
  s.rooms.push(room);
  return room;
}

/** Residents with a set stat value (no traits, mastery or outfit) working in a room. */
function staff(s: GameState, room: Room, stat: keyof Resident['stats'], values: number[]): Resident[] {
  return values.map((v) => {
    const r = createResident(s, content);
    r.waiting = false;
    r.stats[stat] = v;
    r.traits = [];
    r.mastery = {};
    r.outfit = null;
    r.roomId = room.id;
    s.residents.push(r);
    return r;
  });
}

function setWeather(s: GameState, kind: WeatherKind, remaining = 1e6): void {
  s.weather = { kind, remaining };
}

describe('topside content', () => {
  it('has the shared room ids, all topside and gated by Topside research', () => {
    const topsideNodes = new Set(researchContent(content).nodes.filter((n) => n.branch === 'topside').map((n) => n.id));
    expect(topsideNodes.has('topside_survey')).toBe(true);
    for (const id of TOPSIDE_ROOMS) {
      const def = content.rooms[id];
      expect(def, id).toBeDefined();
      expect(def!.topside, id).toBe(true);
      expect(def!.buildable, id).toBe(true);
      expect(topsideNodes.has(def!.requiresResearch ?? ''), id).toBe(true);
      expect(def!.upgrade?.length, id).toBe(2);
    }
    expect(content.rooms['solar_array']!.stat).toBe('sight');
    expect(content.rooms['wind_turbine']!.stat).toBe('brawn');
    expect(content.rooms['rain_catcher']!.stat).toBe('wits');
    expect(content.rooms['farm_plots']!.stat).toBe('knack');
    expect(content.rooms['watchtower']!.stat).toBe('sight');
    expect(content.rooms['trading_post']!.stat).toBe('charm');
    expect(content.rooms['signal_mast']!.stat).toBe('charm');
  });

  it('the Topside branch has 5-7 nodes over tiers 1-3 with the effect keys the spec names', () => {
    const nodes = researchContent(content).nodes.filter((n) => n.branch === 'topside');
    expect(nodes.length).toBeGreaterThanOrEqual(5);
    expect(nodes.length).toBeLessThanOrEqual(7);
    expect([...new Set(nodes.map((n) => n.tier))].sort()).toEqual([1, 2, 3]);
    const effects = new Set(nodes.flatMap((n) => n.effects?.map((e) => e.effect) ?? []));
    for (const key of ['weatherproofing', 'stormShielding', 'signalRange']) expect(effects.has(key), key).toBe(true);
    expect(researchContent(content).branches.some((b) => b.id === 'topside')).toBe(true);
    const all = content.achievements.find((a) => a.id === 'research_topside');
    expect(all?.target).toBe(nodes.length);
  });

  it('surface producers beat their underground equivalents in clear weather', () => {
    const pairs: [string, string][] = [
      ['solar_array', 'generator'],
      ['wind_turbine', 'generator'],
      ['rain_catcher', 'waterworks'],
      ['farm_plots', 'canteen'],
    ];
    for (const [top, under] of pairs) {
      const a = content.rooms[top]!.produces!;
      const b = content.rooms[under]!.produces!;
      expect(a.resource, top).toBe(b.resource);
      for (let l = 0; l < 3; l++) for (let w = 0; w < 3; w++) expect(a.output[l]![w]! / a.poolBase, `${top} ${l} ${w}`).toBeGreaterThan(b.output[l]![w]! / b.poolBase);
    }
  });

  it('weather kinds are well formed and there are about six achievements that watch bumped counters', () => {
    for (const [id, k] of Object.entries(tc.weather.kinds)) {
      expect(k.weight, id).toBeGreaterThan(0);
      expect(k.minutes[0], id).toBeGreaterThan(0);
      expect(k.minutes[1], id).toBeGreaterThanOrEqual(k.minutes[0]);
      expect(k.production, id).toBeGreaterThan(0);
    }
    expect(tc.weather.kinds.taintstorm.taintPerMin).toBeGreaterThan(0);
    const achievements = (content.topside as unknown as { achievements: { id: string; stat: string }[] }).achievements;
    expect(achievements.length).toBeGreaterThanOrEqual(6);
    const known = ['topsideBuildings', 'weatherChanges', 'stormsWeathered', 'stormTaint', 'watchtowerLevel', 'researchDoneHomestead.topside'];
    for (const a of achievements) {
      expect(known, a.id).toContain(a.stat);
      expect(content.achievements.filter((x) => x.id === a.id).length, a.id).toBe(1);
    }
  });
});

describe('weather', () => {
  it('rotates through weighted kinds, never repeating, with durations in range', () => {
    const s = game();
    const seen: { kind: WeatherKind; remaining: number }[] = [];
    let prev = s.weather.kind;
    for (let i = 0; i < 400; i++) {
      tickWeather(s, content, s.weather.remaining, true);
      expect(s.weather.kind).not.toBe(prev);
      prev = s.weather.kind;
      seen.push({ ...s.weather });
    }
    const counts: Record<string, number> = {};
    for (const w of seen) counts[w.kind] = (counts[w.kind] ?? 0) + 1;
    for (const k of Object.keys(tc.weather.kinds)) expect(counts[k] ?? 0, k).toBeGreaterThan(10);
    // The heaviest weight shows up most.
    expect(counts['clear']).toBeGreaterThan(counts['dust']!);
    expect(counts['dust']).toBeGreaterThan(counts['heatwave']!);
    expect(s.stats['weatherChanges']).toBe(400);
    expect(s.events.filter((e) => e.type === 'weatherChanged').length).toBe(400);
  });

  it('durations come from the kind\'s minutes', () => {
    const s = game();
    for (let n = 0; n < 200; n++) {
      const w = nextWeather(s, content, 'clear', n);
      const [lo, hi] = tc.weather.kinds[w.kind].minutes;
      expect(w.remaining).toBeGreaterThanOrEqual(lo * 60);
      expect(w.remaining).toBeLessThanOrEqual(hi * 60);
    }
  });

  it('is deterministic and does not touch state.rng', () => {
    const a = game(3);
    const b = game(3);
    const rng = [...a.rng];
    tickWeather(a, content, 48 * 3600, true);
    expect(a.rng).toEqual(rng);
    for (let i = 0; i < 48 * 60; i++) tickWeather(b, content, 60, true);
    expect(b.weather.kind).toBe(a.weather.kind);
    expect(b.weather.remaining).toBeCloseTo(a.weather.remaining, 6);
    expect(b.stats['weatherChanges']).toBe(a.stats['weatherChanges']);
  });

  it('one 60 s step equals sixty 1 s steps, across a change', () => {
    const a = game();
    const b = game();
    setWeather(a, 'dust', 30.5);
    setWeather(b, 'dust', 30.5);
    tickWeather(a, content, 60, true);
    for (let i = 0; i < 60; i++) tickWeather(b, content, 1, true);
    expect(a.weather.kind).not.toBe('dust');
    expect(b.weather.kind).toBe(a.weather.kind);
    expect(b.weather.remaining).toBeCloseTo(a.weather.remaining, 9);
    expect(a.events.filter((e) => e.type === 'weatherChanged')).toEqual(b.events.filter((e) => e.type === 'weatherChanged'));
  });

  it('keeps changing through offline catch-up', () => {
    const s = game();
    const before = s.stats['weatherChanges'] ?? 0;
    catchUp(s, content, s.lastRealTime + 12 * 3600 * 1000);
    expect((s.stats['weatherChanges'] ?? 0) - before).toBeGreaterThan(5);
  });
});

describe('weather and production', () => {
  it('is 1 underground and the kind\'s multiplier topside', () => {
    const s = game();
    const gen = s.rooms.find((r) => r.type === 'generator')!;
    const tower = addRoom(s, 'watchtower');
    const solar = addRoom(s, 'solar_array', TOPSIDE_FLOOR, S - 3);
    const wind = addRoom(s, 'wind_turbine', TOPSIDE_FLOOR, S);
    expect(isTopside(tower)).toBe(true);
    expect(isTopside(gen)).toBe(false);
    for (const kind of Object.keys(tc.weather.kinds) as WeatherKind[]) {
      setWeather(s, kind);
      expect(weatherMult(s, content, gen), kind).toBe(1);
      expect(weatherMult(s, content, tower), kind).toBe(tc.weather.kinds[kind].production);
      expect(weatherMult(s, content, solar), kind).toBe(tc.buildings!['solar_array']![kind]);
    }
    setWeather(s, 'heatwave');
    expect(weatherMult(s, content, solar)).toBeGreaterThan(1);
    setWeather(s, 'dust');
    expect(weatherMult(s, content, solar)).toBeLessThan(0.5);
    expect(weatherMult(s, content, wind)).toBeGreaterThanOrEqual(1); // the steady one
  });

  it('weatherproofing shrinks penalties only, and Heliotropic Mounts add output', () => {
    const s = game();
    const solar = addRoom(s, 'solar_array');
    setWeather(s, 'dust');
    const raw = weatherMult(s, content, solar);
    s.research.done.push('topside_survey', 'weather_seals');
    expect(weatherMult(s, content, solar)).toBeCloseTo(1 - (1 - raw) * 0.6);
    setWeather(s, 'heatwave');
    expect(weatherMult(s, content, solar)).toBe(tc.buildings!['solar_array']!.heatwave);
    s.research.done.push('heliotropic_mounts');
    expect(weatherMult(s, content, solar)).toBeCloseTo(tc.buildings!['solar_array']!.heatwave! * 1.15);
  });

  it('scales cycle time and production', () => {
    const s = game();
    const solar = addRoom(s, 'solar_array');
    staff(s, solar, 'sight', [5, 5]);
    setWeather(s, 'clear');
    const clear = cycleSeconds(s, content, solar);
    setWeather(s, 'dust');
    expect(cycleSeconds(s, content, solar)).toBeCloseTo(clear / tc.buildings!['solar_array']!.dust!);

    const a = game();
    const b = game();
    const ra = addRoom(a, 'farm_plots');
    const rb = addRoom(b, 'farm_plots');
    staff(a, ra, 'knack', [6]);
    staff(b, rb, 'knack', [6]);
    setWeather(a, 'clear');
    setWeather(b, 'dust');
    advance(a, content, 30);
    advance(b, content, 30);
    expect(rb.pool / ra.pool).toBeCloseTo(tc.buildings!['farm_plots']!.dust!, 5);
  });
});

describe('taint storms', () => {
  function stormGame() {
    const s = game();
    const farm = addRoom(s, 'farm_plots');
    const [worker] = staff(s, farm, 'knack', [5]);
    const home = s.residents.find((r) => !r.dead && !r.waiting && r.roomId !== farm.id)!;
    setWeather(s, 'taintstorm');
    return { s, farm, worker: worker!, home };
  }
  const perMin = tc.weather.kinds.taintstorm.taintPerMin!;

  it('give Glare to topside workers, online only', () => {
    const { s, worker, home } = stormGame();
    for (let i = 0; i < 60; i++) tickWeather(s, content, 1, false);
    expect(worker.taint).toBeCloseTo(perMin);
    expect(home.taint).toBe(0);
    expect(s.stats['stormTaint']).toBeCloseTo(perMin);
    tickWeather(s, content, 600, true);
    expect(worker.taint).toBeCloseTo(perMin);
  });

  it('do nothing in other weather, and hp follows the reduced max', () => {
    const { s, worker } = stormGame();
    setWeather(s, 'dust');
    for (let i = 0; i < 60; i++) tickWeather(s, content, 1, false);
    expect(worker.taint).toBe(0);
    setWeather(s, 'taintstorm');
    worker.hp = worker.maxHp;
    tickWeather(s, content, 60, false);
    expect(worker.hp).toBeCloseTo(worker.maxHp - worker.taint);
  });

  it('never push taint past the cap', () => {
    const { s, worker } = stormGame();
    for (let i = 0; i < 24 * 60; i++) tickWeather(s, content, 60, false);
    expect(worker.taint).toBeCloseTo(worker.maxHp * tc.storm!.taintCap);
    expect(worker.dead).toBe(false);
  });

  it('are softened by research and a staffed watchtower', () => {
    const { s, worker } = stormGame();
    s.research.done.push('topside_survey', 'glare_awnings');
    expect(stormShielding(s, content)).toBeCloseTo(0.4);
    tickWeather(s, content, 60, false);
    expect(worker.taint).toBeCloseTo(perMin * 0.6);
    const tower = addRoom(s, 'watchtower', TOPSIDE_FLOOR, S - 3);
    staff(s, tower, 'sight', [5, 5]);
    expect(stormShielding(s, content)).toBeCloseTo(0.4 + tc.watchtower!.stormShelter[0]!);
    s.research.done.push('weather_seals', 'storm_drills');
    expect(stormShielding(s, content)).toBeCloseTo(tc.storm!.maxShielding);
  });

  it('count as weathered when they pass with buildings topside', () => {
    const { s } = stormGame();
    setWeather(s, 'taintstorm', 5);
    tickWeather(s, content, 10, true);
    expect(s.stats['stormsWeathered']).toBe(1);
  });
});

describe('placement and research gating', () => {
  function ready(): GameState {
    const s = game();
    s.scrip = 1e6;
    s.peakPopulation = 60;
    refreshUnlocks(s, content);
    return s;
  }

  it('topside rooms need Topside Survey', () => {
    const s = ready();
    expect(s.unlockedRooms).not.toContain('solar_array');
    const r = applyCommand(s, content, { type: 'build', roomType: 'solar_array', floor: TOPSIDE_FLOOR, x: S - 6 });
    expect(r.ok).toBe(false);
    s.research.points = 1000;
    expect(applyCommand(s, content, { type: 'research', nodeId: 'topside_survey' }).ok).toBe(true);
    for (const id of TOPSIDE_ROOMS) expect(s.unlockedRooms, id).toContain(id);
    expect(applyCommand(s, content, { type: 'build', roomType: 'solar_array', floor: TOPSIDE_FLOOR, x: S - 6 }).ok).toBe(true);
  });

  it('go on the row above the door, attached through the door, and nowhere else', () => {
    const s = ready();
    s.research.done.push('topside_survey');
    refreshUnlocks(s, content);
    expect(canPlace(s, content, 'solar_array', 0, S + 7).ok).toBe(false); // underground
    expect(canPlace(s, content, 'solar_array', TOPSIDE_FLOOR, S + 6).ok).toBe(false); // not over the door, nothing beside it
    expect(canPlace(s, content, 'generator', TOPSIDE_FLOOR, S - 6).ok).toBe(false); // underground rooms stay underground
    expect(canPlace(s, content, 'solar_array', TOPSIDE_FLOOR, S - 3).ok).toBe(true); // overlaps the door (S - 6 to S - 1)
    expect(applyCommand(s, content, { type: 'build', roomType: 'watchtower', floor: TOPSIDE_FLOOR, x: S - 3 }).ok).toBe(true);
    // Now the row grows sideways from it.
    expect(applyCommand(s, content, { type: 'build', roomType: 'trading_post', floor: TOPSIDE_FLOOR, x: S }).ok).toBe(true);
    expect(applyCommand(s, content, { type: 'build', roomType: 'signal_mast', floor: TOPSIDE_FLOOR, x: S + 6 }).ok).toBe(true);
    expect(applyCommand(s, content, { type: 'build', roomType: 'solar_array', floor: TOPSIDE_FLOOR, x: S - 6 }).ok).toBe(true);
    const ids = connectedRoomIds(s, content);
    for (const room of s.rooms.filter(isTopside)) expect(ids.has(room.id), room.type).toBe(true);
    // One trading post and one signal mast.
    expect(applyCommand(s, content, { type: 'build', roomType: 'signal_mast', floor: TOPSIDE_FLOOR, x: S + 9 }).ok).toBe(false);
    advance(s, content, 1);
    expect(s.stats['topsideBuildings']).toBe(4);
    expect(s.achievements['topside_first']).toBeDefined();
  });

  it('solar arrays merge sideways like any production room', () => {
    const s = ready();
    s.research.done.push('topside_survey');
    refreshUnlocks(s, content);
    expect(applyCommand(s, content, { type: 'build', roomType: 'solar_array', floor: TOPSIDE_FLOOR, x: S - 6 }).ok).toBe(true);
    expect(applyCommand(s, content, { type: 'build', roomType: 'solar_array', floor: TOPSIDE_FLOOR, x: S - 3 }).ok).toBe(true);
    const arrays = s.rooms.filter((r) => r.type === 'solar_array');
    expect(arrays.length).toBe(1);
    expect(arrays[0]!.segments).toBe(2);
  });

  it('Signal Booster adds a mast level for the factions', () => {
    const s = game();
    expect(signalRange(s, content)).toBe(0);
    s.research.done.push('topside_survey', 'weather_seals', 'signal_booster');
    expect(signalRange(s, content)).toBe(1);
  });
});

describe('watchtower raid defense', () => {
  it('is neutral without a staffed tower', () => {
    const s = game();
    expect(raidDefense(s, content)).toEqual({ doorDamageMult: 1, damageMult: 1, warnSeconds: 0, towers: 0 });
    addRoom(s, 'watchtower');
    expect(raidDefense(s, content).towers).toBe(0);
  });

  it('softens raids by level and crew Sight, up to the caps', () => {
    const t = tc.watchtower!;
    const s = game();
    const tower = addRoom(s, 'watchtower');
    const crew = staff(s, tower, 'sight', [5, 5]);
    let d = raidDefense(s, content);
    expect(d.towers).toBe(1);
    expect(d.doorDamageMult).toBeCloseTo(1 - t.doorShare[0]!);
    expect(d.damageMult).toBeCloseTo(1 - t.damageShare[0]!);
    expect(d.warnSeconds).toBeCloseTo(t.warnSeconds[0]!);
    // Half the Sight, half the effect.
    crew[1]!.roomId = null;
    d = raidDefense(s, content);
    expect(d.doorDamageMult).toBeCloseTo(1 - t.doorShare[0]! / 2);
    crew[1]!.roomId = tower.id;
    tower.level = 3;
    d = raidDefense(s, content);
    expect(d.doorDamageMult).toBeCloseTo(1 - t.doorShare[2]!);
    const second = addRoom(s, 'watchtower', TOPSIDE_FLOOR, S - 3, 3);
    staff(s, second, 'sight', [10]);
    d = raidDefense(s, content);
    expect(d.towers).toBe(2);
    expect(d.doorDamageMult).toBeCloseTo(1 - t.maxDoorShare);
    expect(d.damageMult).toBeCloseTo(1 - t.maxDamageShare);
    expect(d.warnSeconds).toBeLessThanOrEqual(t.maxWarnSeconds);
    advance(s, content, 1);
    expect(s.stats['watchtowerLevel']).toBe(3);
  });

  it('ignores residents who are away', () => {
    const s = game();
    const tower = addRoom(s, 'watchtower');
    const [r] = staff(s, tower, 'sight', [8]);
    r!.caravan = 1;
    expect(raidDefense(s, content).towers).toBe(0);
  });
});
