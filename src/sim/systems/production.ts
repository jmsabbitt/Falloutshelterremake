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
import type { GameState, Room } from '../types';
import { workerMult } from './traits';

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
  const rate = roomStatTotal(state, content, room) * (1 + happinessBonus(state, content)) * productionMult(state, content, roomDef(content, room).produces?.resource);
  return rate > 0 ? poolSize(content, room) / rate : Infinity;
}

export function batchOutput(content: Content, room: Room): number {
  const p = roomDef(content, room).produces;
  return p ? tableValue(p.output, room.level, room.segments) : 0;
}

export function tickProduction(state: GameState, content: Content, dt: number): void {
  const happy = 1 + happinessBonus(state, content);
  const burning = new Set(state.incidents.map((i) => i.roomId));
  // Holding Tanks (research) let a room keep working past its first finished batch.
  const bank = Math.floor(bonus(state, content, 'batchBank'));
  // Bonuses are the same for every room of a resource this step; look them up once.
  const mults = new Map<string, number>();
  for (const room of state.rooms) {
    const def = roomDef(content, room);
    if (!def.produces || !room.powered || burning.has(room.id)) continue;
    if (room.ready && (room.banked ?? 0) >= bank) continue;
    const res = def.produces.resource;
    if (!mults.has(res)) mults.set(res, productionMult(state, content, res));
    const rate = roomStatTotal(state, content, room) * happy * (mults.get(res) as number);
    if (rate <= 0) continue;
    room.pool += rate * dt;
    const size = poolSize(content, room);
    // Long offline steps can finish more than one batch; keep the overflow.
    while (room.pool >= size) {
      room.pool -= size;
      if (!room.ready) room.ready = true;
      else if ((room.banked ?? 0) < bank) room.banked = (room.banked ?? 0) + 1;
      if (room.ready && (room.banked ?? 0) >= bank) {
        room.pool = 0; // full: the room waits
        break;
      }
    }
  }
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

/**
 * Collect ready batches: the first always, then banked ones while storage has
 * room (the rest stay banked). Returns the amount actually added.
 */
export function collectRoom(state: GameState, content: Content, room: Room): number {
  const def = roomDef(content, room);
  if (!def.produces || !room.ready) return 0;
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

  let bonusScrip = 0;
  for (let i = 0; i < batches; i++) bonusScrip += rollBonusScrip(state, content, room);
  if (bonusScrip > 0) {
    addScrip(state, content, bonusScrip);
    bump(state, 'bonusScripEvents');
    bump(state, 'bonusScripTotal', bonusScrip);
  }

  const xp = content.balance.resident.xpPerCollectPerSegment * room.segments * (1 + 0.25 * (room.level - 1)) * batches;
  for (const r of workersInRoom(state, room.id)) grantXp(state, content, r, xp);

  bump(state, 'collections');
  bump(state, `produced.${key}`, amount);
  state.events.push({ type: 'collected', roomId: room.id, resource: key, amount, bonusScrip });
  return amount;
}
