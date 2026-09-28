import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  buildCost,
  catchUp,
  connectedRoomIds,
  cycleSeconds,
  deserialize,
  loadContent,
  newGame,
  population,
  rushFailChance,
  serialize,
  storageCapacity,
  upgradeCost,
  type GameState,
  type Room,
} from '../src/sim';
import { createResident, grantXp } from '../src/sim/residents';

const content = loadContent();
/** The starter elevator shaft (the door is the six cells left of it). */
const S = content.balance.grid.starterShaftX;
const T0 = 1_700_000_000_000;

function fresh(seed = 42): GameState {
  const s = newGame(content, { seed, now: T0 });
  applyCommand(s, content, { type: 'admitAll' });
  return s;
}

function room(state: GameState, type: string): Room {
  const r = state.rooms.find((x) => x.type === type);
  if (!r) throw new Error(`no ${type}`);
  return r;
}

function staff(state: GameState, roomId: number, count: number) {
  const idle = state.residents.filter((r) => !r.waiting && !r.dead && r.roomId === null).slice(0, count);
  for (const r of idle) expect(applyCommand(state, content, { type: 'assign', residentId: r.id, roomId }).ok).toBe(true);
  return idle;
}

describe('new game', () => {
  it('starts with a connected starter layout and residents at the door', () => {
    const s = newGame(content, { seed: 1, now: T0 });
    expect(connectedRoomIds(s, content).size).toBe(s.rooms.length);
    expect(s.residents.filter((r) => r.waiting)).toHaveLength(content.balance.start.waitingResidents);
    expect(population(s)).toBe(0);
  });

  it('is deterministic for a given seed', () => {
    expect(serialize(newGame(content, { seed: 7, now: T0 }), 0)).toBe(serialize(newGame(content, { seed: 7, now: T0 }), 0));
  });

  it('admits residents up to living capacity', () => {
    const s = fresh();
    expect(population(s)).toBe(6);
    expect(storageCapacity(s, content, 'population')).toBe(8);
  });
});

describe('building and merging', () => {
  it('requires attaching to the network', () => {
    const s = fresh();
    expect(applyCommand(s, content, { type: 'build', roomType: 'generator', floor: 5, x: S + 4 }).ok).toBe(false);
    expect(applyCommand(s, content, { type: 'build', roomType: 'generator', floor: 1, x: S + 7 }).ok).toBe(true);
  });

  it('rejects overlapping and out-of-bounds placement', () => {
    const s = fresh();
    expect(applyCommand(s, content, { type: 'build', roomType: 'canteen', floor: 1, x: S + 2 }).ok).toBe(false);
    expect(applyCommand(s, content, { type: 'build', roomType: 'canteen', floor: 1, x: S + 19 }).ok).toBe(false);
  });

  it('merges same-type same-level neighbours up to 3 wide', () => {
    const s = fresh();
    s.scrip = 10_000;
    applyCommand(s, content, { type: 'build', roomType: 'waterworks', floor: 2, x: S + 4 });
    applyCommand(s, content, { type: 'build', roomType: 'waterworks', floor: 2, x: S + 7 });
    const water = s.rooms.filter((r) => r.type === 'waterworks');
    expect(water).toHaveLength(1);
    expect(water[0]?.segments).toBe(3);
    // A 4th segment stays separate.
    applyCommand(s, content, { type: 'build', roomType: 'waterworks', floor: 2, x: S + 10 });
    expect(s.rooms.filter((r) => r.type === 'waterworks').map((r) => r.segments).sort()).toEqual([1, 3]);
    expect(s.achievements['triple_room']).toBeDefined();
  });

  it('scales build cost with rooms already built', () => {
    const s = fresh();
    const before = buildCost(s, content, 'canteen');
    s.scrip = 10_000;
    applyCommand(s, content, { type: 'build', roomType: 'canteen', floor: 1, x: S + 7 });
    expect(buildCost(s, content, 'canteen')).toBe(before + 25);
  });

  it('prices upgrades by width', () => {
    const s = fresh();
    const gen = room(s, 'generator');
    expect(upgradeCost(content, gen)).toBe(250);
    gen.segments = 3;
    expect(upgradeCost(content, gen)).toBe(500);
  });

  it('blocks locked rooms until the population threshold', () => {
    const s = fresh();
    s.scrip = 10_000;
    const r = applyCommand(s, content, { type: 'build', roomType: 'clinic', floor: 2, x: S + 4 });
    expect(r.ok).toBe(false);
  });

  it('refuses demolition that would disconnect rooms', () => {
    const s = fresh();
    const shaft = s.rooms.find((r) => r.type === 'elevator' && r.floor === 1) as Room;
    expect(applyCommand(s, content, { type: 'demolish', roomId: shaft.id }).ok).toBe(false);
  });
});

describe('production', () => {
  it('matches the time-pool formula', () => {
    const s = fresh();
    const gen = room(s, 'generator');
    const [worker] = staff(s, gen.id, 1);
    if (!worker) throw new Error('no worker');
    worker.stats.brawn = 5;
    // Freeze happiness at 0 so there is no production bonus.
    const still = { ...content, balance: { ...content.balance, happiness: { ...content.balance.happiness, changePerMin: 0 } } };
    for (const r of s.residents) r.happiness = 0;
    expect(cycleSeconds(s, still, gen)).toBeCloseTo(1320 / 5, 5);
    advance(s, still, 263);
    expect(gen.ready).toBe(false);
    advance(s, still, 2);
    expect(gen.ready).toBe(true);
  });

  it('stops at one batch until collected, then adds output', () => {
    const s = fresh();
    const gen = room(s, 'generator');
    staff(s, gen.id, 2);
    s.resources.power = 10;
    advance(s, content, 3600);
    expect(gen.ready).toBe(true);
    const before = s.resources.power;
    expect(applyCommand(s, content, { type: 'collect', roomId: gen.id }).ok).toBe(true);
    expect(s.resources.power).toBeGreaterThan(before);
    expect(s.achievements['first_collect']).toBeDefined();
  });

  it('turns off far rooms first when power runs low', () => {
    const s = fresh();
    s.resources.power = 0;
    advance(s, content, 1);
    expect(s.rooms.filter((r) => r.type !== 'generator' && r.type !== 'door' && r.type !== 'elevator').every((r) => !r.powered)).toBe(true);
  });
});

describe('rush', () => {
  it('follows the fail formula with a 10% floor and strain', () => {
    const s = fresh();
    const gen = room(s, 'generator');
    const [w] = staff(s, gen.id, 1);
    if (!w) throw new Error('no worker');
    w.stats.brawn = 1;
    w.stats.fortune = 1;
    expect(rushFailChance(s, content, gen)).toBeCloseTo(0.37, 5);
    w.stats.brawn = 10;
    w.stats.fortune = 10;
    expect(rushFailChance(s, content, gen)).toBeCloseTo(0.1, 5);
    s.rushStrain = 2;
    expect(rushFailChance(s, content, gen)).toBeCloseTo(0.3, 5);
  });

  it('either readies the room or starts a fire, and the fire can be put out', () => {
    let sawFire = false;
    let sawSuccess = false;
    for (let seed = 0; seed < 40 && !(sawFire && sawSuccess); seed++) {
      const s = fresh(seed);
      const gen = room(s, 'generator');
      staff(s, gen.id, 2);
      const r = applyCommand(s, content, { type: 'rush', roomId: gen.id });
      expect(r.ok).toBe(true);
      if (s.incidents.length) {
        sawFire = true;
        advance(s, content, 120);
        expect(s.incidents).toHaveLength(0);
        expect(s.stats['incidentsResolved.fire']).toBe(1);
      } else {
        sawSuccess = true;
        expect(gen.ready).toBe(true);
      }
    }
    expect(sawFire && sawSuccess).toBe(true);
  });
});

describe('residents', () => {
  it('gains HP per level from grit at the time of levelling', () => {
    const s = fresh();
    const r = createResident(s, content);
    r.stats.grit = 10;
    s.residents.push(r);
    r.waiting = false;
    grantXp(s, content, r, 1_000_000_000);
    expect(r.level).toBe(50);
    expect(r.maxHp).toBeCloseTo(105 + 49 * 7.5, 5);
  });

  it('can be revived for scrip', () => {
    const s = fresh();
    const r = s.residents[0] as GameState['residents'][number];
    r.dead = true;
    r.hp = 0;
    s.scrip = 500;
    expect(applyCommand(s, content, { type: 'revive', residentId: r.id }).ok).toBe(true);
    expect(r.dead).toBe(false);
    expect(s.scrip).toBe(400);
  });
});

describe('time', () => {
  it('runs 24 hours headless with a staffed vault without residents dying', () => {
    const s = fresh(3);
    // Assign like a player would: best knack to food, best sight to water, rest to power.
    const pool = s.residents.filter((r) => !r.waiting);
    const take = (stat: 'knack' | 'sight' | 'brawn', roomType: string) => {
      pool.sort((a, b) => b.stats[stat] - a.stats[stat]);
      for (const r of pool.splice(0, 2)) applyCommand(s, content, { type: 'assign', residentId: r.id, roomId: room(s, roomType).id });
    };
    take('knack', 'canteen');
    take('sight', 'waterworks');
    take('brawn', 'generator');
    for (let minute = 0; minute < 24 * 60; minute++) {
      advance(s, content, 60);
      applyCommand(s, content, { type: 'collectAll' });
    }
    expect(s.time).toBeCloseTo(86_400, 3);
    expect(s.residents.some((r) => r.dead)).toBe(false);
    expect(s.resources.food).toBeGreaterThan(0);
    expect(s.stats['collections']).toBeGreaterThan(100);
  }, 30_000);

  it('offline catch-up is safe: no damage, rooms stop at one batch, consumption stops', () => {
    const s = fresh(5);
    staff(s, room(s, 'generator').id, 2);
    const hpBefore = s.residents.map((r) => r.hp);
    s.resources.food = 0;
    s.resources.water = 0;
    const summary = catchUp(s, content, T0 + 10 * 3600 * 1000);
    expect(summary.seconds).toBe(36_000);
    expect(room(s, 'generator').ready).toBe(true);
    s.residents.forEach((r, i) => expect(r.hp).toBeGreaterThanOrEqual((hpBefore[i] ?? 0) - 1e-9));
    const power = s.resources.power;
    catchUp(s, content, T0 + 20 * 3600 * 1000);
    // Only the first few minutes of an absence consume; the generator is waiting on a tap.
    expect(s.resources.power).toBeGreaterThanOrEqual(power - 10);
  });

  it('caps very long absences', () => {
    const s = fresh();
    const summary = catchUp(s, content, T0 + 30 * 24 * 3600 * 1000);
    expect(summary.cappedAt).toBe(content.balance.offline.maxCatchUpHours * 3600);
  });
});

describe('save format', () => {
  it('round-trips', () => {
    const s = fresh(9);
    staff(s, room(s, 'generator').id, 2);
    advance(s, content, 600);
    const loaded = deserialize(serialize(s, 0));
    expect(serialize(loaded, 0)).toBe(serialize(s, 0));
  });

  it('rejects garbage and future versions', () => {
    expect(() => deserialize('{"hello":1}')).toThrow();
    expect(() => deserialize(JSON.stringify({ format: 'homestead-save', version: 999, state: {} }))).toThrow();
  });
});
