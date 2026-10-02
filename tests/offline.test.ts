// Playtest 1, items 12 and 13: the batch countdown (secondsToReady) and
// offline auto-collection during catchUp.

import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  batchScrip,
  catchUp,
  cycleSeconds,
  loadContent,
  newGame,
  poolSize,
  productionRate,
  resourceCapacity,
  secondsToReady,
  serialize,
  type GameState,
  type Room,
} from '../src/sim';

const content = loadContent();
const T0 = 1_700_000_000_000;
const HOUR = 3600 * 1000;

function room(s: GameState, type: string): Room {
  const r = s.rooms.find((x) => x.type === type);
  if (!r) throw new Error(`no ${type}`);
  return r;
}

/** Starter homestead with two workers in each of the generator, canteen and waterworks. */
function staffed(seed = 11): GameState {
  const s = newGame(content, { seed, now: T0 });
  applyCommand(s, content, { type: 'admitAll' });
  const idle = s.residents.filter((r) => !r.waiting && !r.dead && r.roomId === null);
  const types = ['generator', 'canteen', 'waterworks'];
  idle.slice(0, 6).forEach((r, i) => {
    expect(applyCommand(s, content, { type: 'assign', residentId: r.id, roomId: room(s, types[i % 3] as string).id }).ok).toBe(true);
  });
  return s;
}

const SUPPLIES = ['power', 'food', 'water'] as const;

describe('secondsToReady', () => {
  it('counts down what is left of the batch, and the batch is ready when it hits 0', () => {
    const s = staffed();
    const gen = room(s, 'generator');
    advance(s, content, 10);
    const left = secondsToReady(s, content, gen);
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan(cycleSeconds(s, content, gen));
    expect(left).toBeCloseTo((poolSize(content, gen) - gen.pool) / productionRate(s, content, gen), 6);
    advance(s, content, Math.max(0, left - 2));
    expect(gen.ready).toBe(false);
    advance(s, content, 4);
    expect(gen.ready).toBe(true);
    expect(secondsToReady(s, content, gen)).toBe(0);
  });

  it('is Infinity without a crew or without power', () => {
    const s = staffed();
    const quarters = room(s, 'quarters');
    expect(secondsToReady(s, content, quarters)).toBe(Infinity); // makes nothing
    const can = room(s, 'canteen');
    can.powered = false;
    expect(secondsToReady(s, content, can)).toBe(Infinity);
    can.powered = true;
    for (const r of s.residents) if (r.roomId === can.id) applyCommand(s, content, { type: 'assign', residentId: r.id, roomId: null });
    expect(secondsToReady(s, content, can)).toBe(Infinity);
  });
});

describe('offline auto-collection', () => {
  it('8 hours away: storage comes back topped up, and rooms kept working past their first batch', () => {
    const s = staffed();
    for (const k of SUPPLIES) s.resources[k] = 5;
    const collections = s.stats['collections'] ?? 0;
    const summary = catchUp(s, content, T0 + 8 * HOUR);
    for (const k of SUPPLIES) {
      const cap = resourceCapacity(s, content, k);
      expect(s.resources[k], k).toBeGreaterThanOrEqual(cap - 1);
      expect(summary.collected[k] ?? 0, k).toBeGreaterThan(cap * 0.5);
    }
    // Each room had room for several batches: far more than one each came in.
    expect((s.stats['collections'] ?? 0) - collections).toBeGreaterThan(6);
    // Once storage is full, later batches are sold on for their scrip.
    expect(summary.sold).toBeGreaterThan(0);
  });

  it('with storage full, rooms keep working and sell each batch for its per-batch scrip', () => {
    const s = staffed(5);
    // Holding Tanks: banked batches are sold too.
    s.research.done.push('batch_bank_1');
    for (const k of SUPPLIES) s.resources[k] = resourceCapacity(s, content, k);
    const scrip = s.scrip;
    const summary = catchUp(s, content, T0 + 6 * HOUR);
    const eff = content.balance.offline.autoCollectEfficiency;
    // Every room sold well over one batch in six hours.
    const one = ['generator', 'canteen', 'waterworks'].reduce((n, t) => n + batchScrip(content, room(s, t)) * eff, 0);
    expect(summary.sold).toBeGreaterThan(one * 3);
    expect(s.scrip - scrip).toBeGreaterThanOrEqual(summary.sold);
    // Only the first minutes consume, and auto-collection tops that back up.
    for (const k of SUPPLIES) expect(s.resources[k]).toBeGreaterThanOrEqual(resourceCapacity(s, content, k) - 1);
  });

  it('a room with nobody in it sells nothing', () => {
    const s = staffed(5);
    for (const r of s.residents) r.roomId = null;
    for (const r of s.rooms) r.ready = true;
    for (const k of SUPPLIES) s.resources[k] = resourceCapacity(s, content, k);
    expect(catchUp(s, content, T0 + 2 * HOUR).sold).toBe(0);
  });

  it('is deterministic, and one long absence lands close to several short ones', () => {
    const a = staffed(21);
    const b = staffed(21);
    const c = staffed(21);
    for (const s of [a, b, c]) for (const k of SUPPLIES) s.resources[k] = 0;
    catchUp(a, content, T0 + 8 * HOUR);
    catchUp(b, content, T0 + 8 * HOUR);
    expect(serialize(a, 0)).toBe(serialize(b, 0));
    for (let h = 2; h <= 8; h += 2) catchUp(c, content, T0 + h * HOUR);
    for (const k of SUPPLIES) expect(Math.abs(a.resources[k] - c.resources[k]), k).toBeLessThanOrEqual(resourceCapacity(a, content, k) * 0.1);
    const ca = a.stats['collections'] ?? 0;
    const cc = c.stats['collections'] ?? 0;
    // Each absence consumes for its first few minutes, and the rooms keep up with that, so
    // every extra absence adds at most those minutes' worth of batches.
    const window = content.balance.offline.consumptionMinutes * 60;
    const perWindow = ['generator', 'canteen', 'waterworks'].reduce((n, t) => n + Math.ceil(window / cycleSeconds(a, content, room(a, t))) + 1, 0);
    expect(cc).toBeGreaterThanOrEqual(ca);
    expect(cc).toBeLessThanOrEqual(ca + 3 * perWindow);
  });

  it('a fast room finishing several batches in one coarse step collects each of them', () => {
    const s = staffed(3);
    const gen = room(s, 'generator');
    for (const r of s.residents) if (r.roomId === gen.id) r.stats.brawn = 60;
    s.resources.power = 0;
    // Batches take seconds, far shorter than the 60 s offline steps.
    expect(cycleSeconds(s, content, gen)).toBeLessThan(15);
    const summary = catchUp(s, content, T0 + 2 * HOUR);
    expect(s.resources.power).toBeGreaterThanOrEqual(resourceCapacity(s, content, 'power') - 1);
    expect(summary.collected.power ?? 0).toBeGreaterThan(0);
    expect(gen.pool).toBeLessThan(poolSize(content, gen));
    // Past full storage, each of those quick batches was sold on.
    expect(summary.sold).toBeGreaterThan(batchScrip(content, gen) * content.balance.offline.autoCollectEfficiency * 100);
  });

  it('pays scrip and XP at the offline rate, and marks the batches as gathered while away', () => {
    const eff = content.balance.offline.autoCollectEfficiency;
    expect(eff).toBeGreaterThan(0);
    expect(eff).toBeLessThan(1);
    const s = staffed(8);
    for (const k of SUPPLIES) s.resources[k] = 0;
    s.events = [];
    catchUp(s, content, T0 + 3 * HOUR);
    const got = s.events.filter((e) => e.type === 'collected');
    expect(got.length).toBeGreaterThan(3);
    for (const e of got) if (e.type === 'collected') expect(e.offline).toBe(true);
    // Base scrip per batch is basePerSegment × segments at full rate; offline pays the share.
    const base = content.balance.bonusScrip.basePerSegment;
    for (const e of got) if (e.type === 'collected') expect(e.baseScrip ?? 0).toBeLessThanOrEqual(Math.ceil(base * eff * 2));
  });

  it('while playing nothing collects itself (that is what Conveyor Belts are for)', () => {
    const s = staffed();
    for (const k of SUPPLIES) s.resources[k] = 0;
    advance(s, content, 1200);
    expect(s.stats['collections'] ?? 0).toBe(0);
  });
});
