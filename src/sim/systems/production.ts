// Time-pool production (see research 01 §4.1):
// every second each worker adds their room stat × (1 + happiness bonus) to the
// room's pool; when the pool reaches poolBase × segments a batch is ready and
// the room waits to be collected.

import { tableValue, type Content } from '../content';
import { addScrip, resourceCapacity } from '../economy';
import { roomDef } from '../grid';
import { bonus, productionMult } from '../bonuses';
import { bump, effectiveStat, grantXp, workersInRoom } from '../residents';
import { chance, nextFloat } from '../rng';
import type { GameState, ResourceKey, Room } from '../types';
import { masteryForBatches, workerMult } from './traits';
import { weatherMult } from './weather';

export function vaultHappiness(state: GameState): number {
  const living = state.residents.filter((r) => !r.dead && !r.waiting);
  if (living.length === 0) return 0;
  return living.reduce((s, r) => s + r.happiness, 0) / living.length;
}

export function happinessBonus(state: GameState, content: Content): number {
  return vaultHappiness(state) / content.balance.happiness.productionBonusDivisor;
}

export function roomStatTotal(state: GameState, content: Content, room: Room): number {
  const def = roomDef(content, room);
  if (!def.stat) return 0;
  const stat = def.stat;
  return workersInRoom(state, room.id).reduce((s, r) => s + effectiveStat(content, r, stat) * workerMult(state, content, r, room), 0);
}

export function poolSize(content: Content, room: Room): number {
  const p = roomDef(content, room).produces;
  return p ? p.poolBase * room.segments : 0;
}

/** Seconds per batch with the current crew, or Infinity if nobody works there. */
export function cycleSeconds(state: GameState, content: Content, room: Room): number {
  const rate = roomStatTotal(state, content, room) * (1 + happinessBonus(state, content)) * productionMult(state, content, roomDef(content, room).produces?.resource) * weatherMult(state, content, room);
  return rate > 0 ? poolSize(content, room) / rate : Infinity;
}

/**
 * Pool points per second the room is filling at right now, exactly as
 * tickProduction fills it: 0 while unpowered, burning or without a crew.
 */
export function productionRate(state: GameState, content: Content, room: Room): number {
  const def = roomDef(content, room);
  if (!def.produces || !room.powered || state.incidents.some((i) => i.roomId === room.id)) return 0;
  return roomStatTotal(state, content, room) * (1 + happinessBonus(state, content)) * productionMult(state, content, def.produces.resource) * weatherMult(state, content, room);
}

/**
 * Seconds until the room's next batch is ready to collect: 0 when one is
 * ready, Infinity while it isn't filling (no crew, no power, an incident).
 */
export function secondsToReady(state: GameState, content: Content, room: Room): number {
  if (!roomDef(content, room).produces) return Infinity;
  if (room.ready) return 0;
  const rate = productionRate(state, content, room);
  return rate > 0 ? Math.max(0, poolSize(content, room) - room.pool) / rate : Infinity;
}

export function batchOutput(content: Content, room: Room): number {
  const p = roomDef(content, room).produces;
  return p ? tableValue(p.output, room.level, room.segments) : 0;
}

export interface ProductionOptions {
  /**
   * Offline catch-up: finished batches collect themselves into storage while
   * it has space (collectRoom, paying balance.offline.autoCollectEfficiency of
   * the scrip, XP and mastery), so rooms keep working instead of all stalling
   * on their first batch. Once storage is full the rest wait, ready or banked.
   */
  offlineCollect?: boolean;
}

export function tickProduction(state: GameState, content: Content, dt: number, opts: ProductionOptions = {}): void {
  const happy = 1 + happinessBonus(state, content);
  const burning = new Set(state.incidents.map((i) => i.roomId));
  // Holding Tanks (research) let a room keep working past its first finished batch.
  const bank = Math.floor(bonus(state, content, 'batchBank'));
  const eff = content.balance.offline.autoCollectEfficiency ?? 1;
  // Storage doesn't change size during the step; look each cap up once.
  const caps = new Map<ResourceKey, number>();
  const collect = (room: Room) => {
    if (!opts.offlineCollect || !room.ready) return;
    const res = roomDef(content, room).produces?.resource;
    if (!res) return;
    if (!caps.has(res)) caps.set(res, resourceCapacity(state, content, res));
    if (state.resources[res] < (caps.get(res) as number)) collectRoom(state, content, room, { efficiency: eff, offline: true });
    // Storage is full: the batch is sold on for its per-batch scrip (no lucky
    // rolls), so the room keeps earning while the player is away.
    else sellOverflow(state, content, room, eff);
  };
  // Bonuses are the same for every room of a resource this step; look them up once.
  const mults = new Map<string, number>();
  for (const room of state.rooms) {
    const def = roomDef(content, room);
    if (!def.produces) continue;
    // Batches finished earlier (or waiting on storage) go in first.
    collect(room);
    if (!room.powered || burning.has(room.id)) continue;
    if (room.ready && (room.banked ?? 0) >= bank) continue;
    const res = def.produces.resource;
    if (!mults.has(res)) mults.set(res, productionMult(state, content, res));
    const rate = roomStatTotal(state, content, room) * happy * (mults.get(res) as number) * weatherMult(state, content, room);
    if (rate <= 0) continue;
    room.pool += rate * dt;
    const size = poolSize(content, room);
    // Long offline steps can finish more than one batch; keep the overflow.
    while (room.pool >= size) {
      room.pool -= size;
      if (!room.ready) room.ready = true;
      else if ((room.banked ?? 0) < bank) room.banked = (room.banked ?? 0) + 1;
      collect(room);
      if (room.ready && (room.banked ?? 0) >= bank) {
        room.pool = 0; // full: the room waits
        break;
      }
    }
  }
}

/** A room's per-batch scrip: more for wider rooms and higher levels. */
export function batchScrip(content: Content, room: Room): number {
  const bs = content.balance.bonusScrip;
  return bs.basePerSegment * (1 + bs.perLevel * (room.level - 1)) * room.segments;
}

/**
 * Offline, a finished batch with no room in storage: paid out as its
 * per-batch scrip at `eff`, and the room starts on the next one. Quiet (no
 * event per batch); the away summary reports the total.
 */
function sellOverflow(state: GameState, content: Content, room: Room, eff: number): void {
  if (!room.ready || workersInRoom(state, room.id).length === 0) return;
  const batches = 1 + (room.banked ?? 0);
  room.ready = false;
  room.banked = 0;
  const scrip = Math.round(batchScrip(content, room) * batches * eff * (content.balance.offline.overflowScrip ?? 1));
  if (scrip <= 0) return;
  addScrip(state, content, scrip);
  bump(state, 'collectScrip', scrip);
  bump(state, 'offlineSoldScrip', scrip);
}

/** Bonus scrip roll on collection (research 01 §4.2). Returns scrip awarded. */
export function rollBonusScrip(state: GameState, content: Content, room: Room): number {
  const crew = workersInRoom(state, room.id);
  if (crew.length === 0) return 0;
  const bs = content.balance.bonusScrip;
  const avgFortune = crew.reduce((s, r) => s + effectiveStat(content, r, 'fortune'), 0) / crew.length;
  if (!chance(state.rng, Math.min(bs.maxChance, bs.chancePerFortune * avgFortune))) return 0;
  for (const tier of bs.tiers) {
    if (nextFloat(state.rng) < tier.chance) {
      if (tier.mult >= 6) bump(state, 'jackpots');
      return (tier.base + room.level) * room.segments * tier.mult;
    }
  }
  return 0;
}

export interface CollectOptions {
  /** Share of the per-batch scrip, bonus scrip, XP and mastery paid (offline auto-collect pays less). Default 1. */
  efficiency?: number;
  /** Collected by offline catch-up rather than by the player. */
  offline?: boolean;
}

/**
 * Collect ready batches: the first always, then banked ones while storage has
 * room (the rest stay banked). Returns the amount actually added.
 */
export function collectRoom(state: GameState, content: Content, room: Room, opts: CollectOptions = {}): number {
  const def = roomDef(content, room);
  if (!def.produces || !room.ready) return 0;
  const eff = Math.max(0, opts.efficiency ?? 1);
  const key = def.produces.resource;
  const cap = resourceCapacity(state, content, key);
  const out = batchOutput(content, room);
  const held = 1 + (room.banked ?? 0);
  const space = Math.max(0, cap - state.resources[key]);
  const batches = Math.min(held, Math.max(1, Math.ceil(space / Math.max(1, out))));
  const before = state.resources[key];
  state.resources[key] = Math.min(cap, before + out * batches);
  const amount = state.resources[key] - before;
  const left = held - batches;
  room.ready = left > 0;
  room.banked = Math.max(0, left - 1);

  // A little scrip for every batch, so income isn't only lucky rolls; bonus rolls come on top.
  const base = workersInRoom(state, room.id).length ? Math.round(batchScrip(content, room) * batches * eff) : 0;
  if (base) {
    addScrip(state, content, base);
    bump(state, 'collectScrip', base);
  }
  let bonusScrip = 0;
  for (let i = 0; i < batches; i++) bonusScrip += rollBonusScrip(state, content, room);
  bonusScrip = Math.round(bonusScrip * eff);
  if (bonusScrip > 0) {
    addScrip(state, content, bonusScrip);
    bump(state, 'bonusScripEvents');
    bump(state, 'bonusScripTotal', bonusScrip);
  }

  const xp = content.balance.resident.xpPerCollectPerSegment * room.segments * (1 + 0.25 * (room.level - 1)) * batches * eff;
  const workers = workersInRoom(state, room.id);
  if (xp > 0) for (const r of workers) grantXp(state, content, r, xp);
  masteryForBatches(state, content, room, workers, batches * eff);

  bump(state, 'collections');
  bump(state, `produced.${key}`, amount);
  if (opts.offline) bump(state, `offlineCollected.${key}`, amount);
  state.events.push({ type: 'collected', roomId: room.id, resource: key, amount, bonusScrip, baseScrip: base, ...(opts.offline ? { offline: true } : {}) });
  return amount;
}
