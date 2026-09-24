// Time-pool production (see research 01 §4.1):
// every second each worker adds their room stat × (1 + happiness bonus) to the
// room's pool; when the pool reaches poolBase × segments a batch is ready and
// the room waits to be collected.

import { tableValue, type Content } from '../content';
import { addScrip, resourceCapacity } from '../economy';
import { roomDef } from '../grid';
import { productionMult } from '../legacy';
import { bump, effectiveStat, grantXp, workersInRoom } from '../residents';
import { chance, nextFloat } from '../rng';
import type { GameState, Room } from '../types';

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
  return workersInRoom(state, room.id).reduce((s, r) => s + effectiveStat(content, r, stat), 0);
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
  const bonus = 1 + happinessBonus(state, content);
  const burning = new Set(state.incidents.map((i) => i.roomId));
  for (const room of state.rooms) {
    const def = roomDef(content, room);
    if (!def.produces || room.ready || !room.powered || burning.has(room.id)) continue;
    const rate = roomStatTotal(state, content, room) * bonus * productionMult(state, content, def.produces.resource);
    if (rate <= 0) continue;
    room.pool += rate * dt;
    if (room.pool >= poolSize(content, room)) {
      room.pool = 0;
      room.ready = true;
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

/** Collect a ready batch. Returns the amount added (0 if nothing was ready). */
export function collectRoom(state: GameState, content: Content, room: Room): number {
  const def = roomDef(content, room);
  if (!def.produces || !room.ready) return 0;
  const key = def.produces.resource;
  const cap = resourceCapacity(state, content, key);
  const amount = batchOutput(content, room);
  const before = state.resources[key];
  state.resources[key] = Math.min(cap, before + amount);
  room.ready = false;

  const bonusScrip = rollBonusScrip(state, content, room);
  if (bonusScrip > 0) {
    addScrip(state, content, bonusScrip);
    bump(state, 'bonusScripEvents');
    bump(state, 'bonusScripTotal', bonusScrip);
  }

  const xp = content.balance.resident.xpPerCollectPerSegment * room.segments * (1 + 0.25 * (room.level - 1));
  for (const r of workersInRoom(state, room.id)) grantXp(state, content, r, xp);

  bump(state, 'collections');
  bump(state, `produced.${key}`, amount);
  state.events.push({ type: 'collected', roomId: room.id, resource: key, amount, bonusScrip });
  return amount;
}
