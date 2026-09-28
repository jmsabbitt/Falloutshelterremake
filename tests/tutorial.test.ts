import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  buildCost,
  canPlace,
  connectedRoomIds,
  deserialize,
  loadContent,
  newGame,
  population,
  SAVE_VERSION,
  serialize,
  storageCapacity,
  topStats,
  effectiveStats,
  type GameState,
  type Room,
} from '../src/sim';

const content = loadContent();
/** The starter elevator shaft (the door is the six cells left of it). */
const S = content.balance.grid.starterShaftX;
const T0 = 1_700_000_000_000;

const tut = (seed = 5): GameState => newGame(content, { seed, now: T0, tutorial: true });
const step = (s: GameState) => s.tutorial?.step;
const ok = (s: GameState, cmd: Parameters<typeof applyCommand>[2]) => {
  const res = applyCommand(s, content, cmd);
  expect(res).toMatchObject({ ok: true });
  return res;
};
const roomOf = (s: GameState, type: string): Room => {
  const r = s.rooms.find((x) => x.type === type);
  if (!r) throw new Error(`no ${type}`);
  return r;
};
/** An idle founder who is best at the room's stat (or anyone idle). */
function bestFor(s: GameState, type: string) {
  const stat = content.rooms[type]?.stat;
  const idle = s.residents.filter((r) => !r.waiting && !r.dead && r.roomId === null);
  return idle.find((r) => stat && topStats(effectiveStats(content, r)).includes(stat)) ?? idle[0];
}

describe('tutorial new game', () => {
  it('starts with only the door and a three-floor elevator shaft', () => {
    const s = tut();
    expect(s.rooms.map((r) => `${r.type}@${r.floor},${r.x}`).sort()).toEqual([`door@0,${S - 6}`, `elevator@0,${S}`, `elevator@1,${S}`, `elevator@2,${S}`]);
    expect(connectedRoomIds(s, content).size).toBe(4);
    expect(s.tutorial).toEqual({ step: 'admit', done: false, bedrolls: content.balance.start.waitingResidents });
    expect(s.residents.filter((r) => r.waiting)).toHaveLength(content.balance.start.waitingResidents);
  });

  it('has free slots on both sides of the shaft on floors 1 and 2, and to its right on floor 0', () => {
    const s = tut();
    for (const floor of [1, 2]) {
      expect(canPlace(s, content, 'generator', floor, S - 3).ok).toBe(true);
      expect(canPlace(s, content, 'generator', floor, S + 1).ok).toBe(true);
    }
    expect(canPlace(s, content, 'generator', 0, S + 1).ok).toBe(true);
    expect(canPlace(s, content, 'generator', 0, S - 3).ok).toBe(false);
  });

  it('is off by default: the classic layout, with no tutorial state', () => {
    const s = newGame(content, { seed: 5, now: T0 });
    expect(s.rooms.map((r) => r.type).sort()).toEqual(['canteen', 'door', 'elevator', 'elevator', 'elevator', 'generator', 'quarters', 'waterworks']);
    expect(s.tutorial).toBeUndefined();
    expect(buildCost(s, content, 'generator')).toBeGreaterThan(0);
  });

  it('lets the founders in on bedrolls before there are Quarters', () => {
    const s = tut();
    ok(s, { type: 'admitAll' });
    expect(population(s)).toBe(content.balance.start.waitingResidents);
    expect(storageCapacity(s, content, 'population')).toBe(content.balance.start.waitingResidents);
    // Quarters replace the bedrolls rather than adding to them.
    ok(s, { type: 'build', roomType: 'quarters', floor: 0, x: S + 1 });
    expect(storageCapacity(s, content, 'population')).toBe(8);
  });
});

describe('tutorial steps', () => {
  it('advance on the right commands, with free core builds on either side of the shaft', () => {
    const s = tut();
    const scrip = s.scrip;
    ok(s, { type: 'admitAll' });
    expect(step(s)).toBe('build_power');

    // Only the step's room is free.
    expect(buildCost(s, content, 'generator')).toBe(0);
    expect(buildCost(s, content, 'canteen')).toBeGreaterThan(0);
    // Left of the shaft.
    ok(s, { type: 'build', roomType: 'generator', floor: 1, x: S - 3 });
    expect(s.scrip).toBe(scrip);
    expect(step(s)).toBe('staff_power');
    expect(buildCost(s, content, 'generator')).toBeGreaterThan(0);
    // It comes stocked and nearly through its first batch.
    expect(s.resources.power).toBe(content.balance.start.resources.power);
    expect(roomOf(s, 'generator').pool).toBeGreaterThan(0);

    ok(s, { type: 'assign', residentId: bestFor(s, 'generator')!.id, roomId: roomOf(s, 'generator').id });
    expect(step(s)).toBe('build_water');
    expect(buildCost(s, content, 'waterworks')).toBe(0);
    ok(s, { type: 'build', roomType: 'waterworks', floor: 2, x: S + 1 });
    expect(step(s)).toBe('staff_water');
    ok(s, { type: 'assign', residentId: bestFor(s, 'waterworks')!.id, roomId: roomOf(s, 'waterworks').id });
    expect(step(s)).toBe('build_food');
    ok(s, { type: 'build', roomType: 'canteen', floor: 1, x: S + 1 });
    expect(step(s)).toBe('staff_food');
    ok(s, { type: 'assign', residentId: bestFor(s, 'canteen')!.id, roomId: roomOf(s, 'canteen').id });
    expect(s.scrip).toBe(scrip);
    expect(step(s)).toBe('collect');

    // The first batch comes quickly.
    for (let i = 0; i < 120 && !s.rooms.some((r) => r.ready); i++) advance(s, content, 1);
    const ready = s.rooms.find((r) => r.ready);
    expect(ready).toBeDefined();
    ok(s, { type: 'collect', roomId: ready!.id });
    expect(step(s)).toBe('crate');

    ok(s, { type: 'openCrate', tier: 'standard' });
    if (s.items.length) {
      expect(step(s)).toBe('equip');
      const who = s.residents.find((r) => !r.waiting && !r.dead)!;
      ok(s, { type: 'equip', residentId: who.id, itemId: s.items[0]!.id });
    }
    expect(step(s)).toBe('done');
    expect(s.tutorial?.done).toBe(true);
    // Back to normal prices.
    expect(buildCost(s, content, 'generator')).toBeGreaterThan(0);
  });

  it('builds charge scrip outside their own step', () => {
    const s = tut();
    const scrip = s.scrip;
    // Still on 'admit': nothing is free yet.
    ok(s, { type: 'build', roomType: 'generator', floor: 1, x: S + 1 });
    expect(s.scrip).toBeLessThan(scrip);
  });

  it('skips past steps already done (built early, collected early)', () => {
    const s = tut();
    ok(s, { type: 'admitAll' });
    ok(s, { type: 'build', roomType: 'generator', floor: 1, x: S + 1 });
    ok(s, { type: 'assign', residentId: bestFor(s, 'generator')!.id, roomId: roomOf(s, 'generator').id });
    // The canteen out of order: it costs, but its step is then already met.
    ok(s, { type: 'build', roomType: 'canteen', floor: 1, x: S + 4 });
    expect(step(s)).toBe('build_water');
    ok(s, { type: 'build', roomType: 'waterworks', floor: 2, x: S - 3 });
    expect(step(s)).toBe('staff_water');
  });

  it('emits an event per step and survives a save and load', () => {
    const s = tut();
    s.events = [];
    ok(s, { type: 'admitAll' });
    expect(s.events.some((e) => e.type === 'tutorialStep' && e.step === 'build_power')).toBe(true);
    const loaded = deserialize(serialize(s, 0));
    expect(loaded.tutorial).toEqual(s.tutorial);
    expect(buildCost(loaded, content, 'generator')).toBe(0);
  });
});

describe('skipping the tutorial', () => {
  it('builds the missing core rooms free and connected, and ends it', () => {
    const s = tut();
    ok(s, { type: 'admitAll' });
    ok(s, { type: 'build', roomType: 'generator', floor: 2, x: S - 3 });
    const scrip = s.scrip;
    ok(s, { type: 'skipTutorial' });
    expect(s.tutorial?.done).toBe(true);
    expect(s.scrip).toBe(scrip);
    for (const type of ['generator', 'canteen', 'waterworks']) expect(s.rooms.filter((r) => r.type === type)).toHaveLength(1);
    expect(connectedRoomIds(s, content).size).toBe(s.rooms.length);
    expect(s.resources.food).toBe(content.balance.start.resources.food);
    expect(s.resources.water).toBe(content.balance.start.resources.water);
    // Nothing more to skip.
    expect(applyCommand(s, content, { type: 'skipTutorial' }).ok).toBe(false);
  });

  it('from the very start leaves a working homestead', () => {
    const s = tut();
    ok(s, { type: 'skipTutorial' });
    ok(s, { type: 'admitAll' });
    advance(s, content, 120);
    expect(s.resources.power).toBeGreaterThan(0);
    expect(s.residents.every((r) => r.hp > 0 && !r.dead)).toBe(true);
    expect(applyCommand(s, content, { type: 'skipTutorial' }).ok).toBe(false);
  });

  it('is refused in homesteads without a tutorial', () => {
    const s = newGame(content, { seed: 3, now: T0 });
    expect(applyCommand(s, content, { type: 'skipTutorial' }).ok).toBe(false);
  });
});

describe('save migration v9 -> v10', () => {
  it('marks existing homesteads as done with the tutorial', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(10);
    const s = newGame(content, { seed: 11, now: T0 });
    const { events: _e, tutorial: _t, ...rest } = s;
    const old = JSON.stringify({ format: 'homestead-save', version: 9, savedAt: 0, state: rest });
    const loaded = deserialize(old);
    expect(loaded.tutorial).toEqual({ step: 'done', done: true });
    expect(buildCost(loaded, content, 'generator')).toBeGreaterThan(0);
    // No bedrolls for old homesteads.
    expect(storageCapacity(loaded, content, 'population')).toBe(8);
  });
});
