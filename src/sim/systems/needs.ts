// Power grid, food/water consumption, shortages, health regen and happiness.

import { tableValue, type Content } from '../content';
import { resourceCapacity } from '../economy';
import { roomDef } from '../grid';
import { effectiveMaxHp, effectiveStats, livingResidents, topStats } from '../residents';
import type { GameState, Resident, Room } from '../types';
import { traitHappiness } from './traits';

export function powerDemandPerMin(state: GameState, content: Content): number {
  const table = content.balance.consumption.powerPerRoomPerMin;
  let demand = 0;
  for (const room of state.rooms) {
    if (roomDef(content, room).usesPower) demand += tableValue(table, room.level, room.segments);
  }
  return demand;
}

/** Residents consuming food and water: living, admitted residents. */
export function consumers(state: GameState): number {
  return livingResidents(state).length;
}

export function foodDemandPerMin(state: GameState, content: Content): number {
  return consumers(state) * content.balance.consumption.foodPerResidentPerMin;
}

export function waterDemandPerMin(state: GameState, content: Content): number {
  return consumers(state) * content.balance.consumption.waterPerResidentPerMin;
}

/** The "tick mark" on each resource bar: below it, a shortage begins. */
export function shortageThreshold(demandPerMin: number, content: Content): number {
  return demandPerMin * content.balance.consumption.shortageThresholdMinutes;
}

function distance(a: Room, b: Room): number {
  return Math.abs(a.floor - b.floor) * 10 + Math.abs(a.x - b.x);
}

/**
 * Decide which rooms have power. With enough stored power, all do. Below the
 * threshold, only a proportional share stays lit, nearest to generators first.
 */
export function updatePower(state: GameState, content: Content): void {
  const users = state.rooms.filter((r) => roomDef(content, r).usesPower);
  for (const r of state.rooms) r.powered = true;
  if (users.length === 0) return;
  const threshold = shortageThreshold(powerDemandPerMin(state, content), content);
  if (state.resources.power >= threshold) return;
  const frac = threshold > 0 ? state.resources.power / threshold : 1;
  const keep = Math.floor(users.length * frac);
  const sources = state.rooms.filter((r) => roomDef(content, r).produces?.resource === 'power');
  const ranked = users
    .map((r) => ({ r, d: sources.length ? Math.min(...sources.map((s) => distance(r, s))) : 0 }))
    .sort((a, b) => a.d - b.d || a.r.id - b.r.id);
  ranked.forEach((entry, i) => {
    entry.r.powered = i < keep;
  });
}

export interface NeedsOptions {
  /** Apply consumption this tick (offline catch-up stops consuming after a while). */
  consume: boolean;
  /** Apply shortage damage (never offline: coming back must be safe). */
  harm: boolean;
}

export function tickNeeds(state: GameState, content: Content, dt: number, opts: NeedsOptions): void {
  const minutes = dt / 60;
  if (opts.consume) {
    state.resources.power = Math.max(0, state.resources.power - powerDemandPerMin(state, content) * minutes);
    state.resources.food = Math.max(0, state.resources.food - foodDemandPerMin(state, content) * minutes);
    state.resources.water = Math.max(0, state.resources.water - waterDemandPerMin(state, content) * minutes);
  }
  // Storage can shrink when rooms are demolished.
  for (const key of ['power', 'food', 'water', 'medpatch', 'purge'] as const) {
    state.resources[key] = Math.min(state.resources[key], resourceCapacity(state, content, key));
  }

  const foodShort = shortageFraction(state.resources.food, shortageThreshold(foodDemandPerMin(state, content), content));
  const waterShort = shortageFraction(state.resources.water, shortageThreshold(waterDemandPerMin(state, content), content));
  const sh = content.balance.shortage;
  const regen = content.balance.resident.regenPerMin;

  for (const r of livingResidents(state)) {
    if (opts.harm && foodShort > 0) {
      r.hp = Math.max(1, r.hp - sh.foodHpLossPerMin * foodShort * minutes);
    } else if (foodShort === 0) {
      r.hp = Math.min(effectiveMaxHp(r), r.hp + regen * minutes);
    }
    if (opts.harm && waterShort > 0) {
      r.taint = Math.min(r.maxHp - 1, r.taint + sh.waterTaintPerMin * waterShort * minutes);
      r.hp = Math.min(r.hp, effectiveMaxHp(r));
    }
  }

  tickHappiness(state, content, dt, foodShort > 0 || waterShort > 0);
}

/** 0 when stock is at/above the threshold, up to 1 when empty. */
function shortageFraction(stock: number, threshold: number): number {
  if (threshold <= 0 || stock >= threshold) return 0;
  return 1 - stock / threshold;
}

export function isRightRoom(state: GameState, content: Content, r: Resident): boolean {
  if (r.roomId === null) return false;
  const room = state.rooms.find((x) => x.id === r.roomId);
  if (!room) return false;
  const stat = roomDef(content, room).stat;
  return stat !== null && topStats(effectiveStats(content, r)).includes(stat);
}

/** `deadRooms`: rooms holding a fallen resident (pass it when calling for everyone, to avoid an O(n²) scan). */
export function happinessTarget(
  state: GameState,
  content: Content,
  r: Resident,
  shortage: boolean,
  deadRooms?: Set<number>,
  occupants?: Map<number, Resident[]>,
): number {
  const h = content.balance.happiness;
  let target = h.base;
  if (isRightRoom(state, content, r)) target += h.rightRoomBonus;
  if (shortage) target -= content.balance.shortage.happinessPenalty;
  if (r.hp < effectiveMaxHp(r) * 0.5 || r.taint > r.maxHp * 0.25) target -= h.injuredPenalty;
  const deadHere = r.roomId !== null && (deadRooms ? deadRooms.has(r.roomId) : state.residents.some((o) => o.dead && o.roomId === r.roomId));
  if (deadHere) target -= 30;
  target += traitHappiness(state, content, r, occupants);
  return Math.max(0, Math.min(100, target));
}

function tickHappiness(state: GameState, content: Content, dt: number, shortage: boolean): void {
  const step = (content.balance.happiness.changePerMin * dt) / 60;
  // Index rooms once per step, so per-resident checks don't rescan everyone.
  const deadRooms = new Set<number>();
  const occupants = new Map<number, Resident[]>();
  for (const o of state.residents) {
    if (o.roomId === null) continue;
    if (o.dead) deadRooms.add(o.roomId);
    else {
      const list = occupants.get(o.roomId);
      if (list) list.push(o);
      else occupants.set(o.roomId, [o]);
    }
  }
  for (const r of livingResidents(state)) {
    const target = happinessTarget(state, content, r, shortage, deadRooms, occupants);
    if (r.happiness < target) r.happiness = Math.min(target, r.happiness + step);
    else if (r.happiness > target) r.happiness = Math.max(target, r.happiness - step);
  }
}
