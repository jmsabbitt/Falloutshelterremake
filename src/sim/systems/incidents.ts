// Incidents (research 03 §1). Combat is two HP pools trading damage over time:
// the incident loses the defenders' summed weapon damage per second, and deals
// its own DPS split across the defenders.
//
// - Internal incidents (fire, skitters, burrowers) start in a room and, once
//   that room is left undefended for a moment, spread to its neighbours. They
//   never re-enter a room they have visited, so every chain burns out.
// - Rustmen raiders break down the door, then move room to room outward from
//   it, stealing scrip wherever nobody fights back.
// - Pregnant residents and children take cover instead of fighting.
// - M6 deep threats (deepOnly) only start in rooms on deep floors, never
//   leave the Deep, and grow tougher with each stratum. A cave-in is dug out
//   with Brawn and doesn't spread (left alone, it settles by itself); a flood
//   is fixed with Knack and spreads sideways; Deepcrawlers come from dirt
//   edges like Burrowers. Deep Bracing (research) makes all of them rarer and
//   weaker; see deep.json -> tuning.incidents.
// - M9 creatures (GDD §7.1):
//   - Electrical surges start in a power room and spread only into powered
//     neighbours, draining power while they burn. Any resident in the room
//     helps ground it (a flat amount each, like fire).
//   - The Hollowed are Glare-sick drifters: part of their damage is taint, and
//     whoever turns them back takes a last dose of it (residue). Never lethal
//     by taint alone: taint stops at max HP - 1, as with water shortages.
//   - Glassbacks drain power while alive and jump to a neighbouring room every
//     jumpSeconds whether or not anyone is fighting them, keeping their HP.
//     After maxJumps they burrow back out.
//   - Maulers never come off the incident timer. The Mauler meter
//     (state.maulerMeter) rises with noise (door openings) and wealth
//     (population, scrip, staffed radios) and falls slowly; defense research
//     and staffed Watchtowers cut the rise. When it fills, a Mauler is
//     spotted (a warning, longer with Watchtowers), then batters the door and
//     walks room to room like raiders, eating food where nobody fights it.
//   Offline, none of them do harm: surges ground themselves, Glassbacks and the
//   Hollowed wander off, and a Mauler leaves (offlineSettleSeconds, counted
//   while away). The meter keeps rising offline but stops short of full.

import type { Content } from '../content';
import { addScrip, population, scripIncome } from '../economy';
import { connectedRoomIds, floorOccupancy, roomCells, roomDef } from '../grid';
import { bonus, incidentRate } from '../bonuses';
import { bump, combatDamage, effectiveMaxHp, effectiveStat, fleesIncidents, grantXp, livingResidents, workersInRoom } from '../residents';
import { chance, nextFloat, nextInt, pick } from '../rng';
import type { GameState, Incident, IncidentType, Resident, Room, StatKey } from '../types';
import { grantItem } from './items';
import { ruleFlag, rulesetMods } from './rulesets';
import { deepIncidentChance, deepIncidentScale, isDeepFloor, stratumOf } from './deep';
import { traitDamageTakenMult } from './traits';
import { raidRateMult } from './factions';
import { raidDefense } from './weather';

export interface IncidentDef {
  name: string;
  natural: number;
  rush: number | null;
  hpPerSegment?: number;
  hpPerRoomLevel?: number;
  dpsPerSegment?: number;
  fixedDamage?: number;
  spreads?: boolean;
  needsDirt?: boolean;
  powerDrainPerSec?: number;
  external?: boolean;
  hp?: number;
  hpPerAvgLevel?: number;
  dps?: number;
  roomSeconds?: number;
  stealScripPerSec?: number;
  lootPerAvgLevel?: number;
  lootBase?: number;
  /** M6: only starts on deep floors, and never spreads out of the Deep. */
  deepOnly?: boolean;
  /** M6: shallowest stratum it appears in. */
  minStratum?: number;
  /** M6: residents fight it with this stat (x workPerStat, plus level) instead of weapons. */
  workStat?: string;
  workPerStat?: number;
  /** M6: left unattended this long, it clears by itself (and stops blocking the room). */
  settleSeconds?: number;
  /** M6: spreads left and right only. */
  sideways?: boolean;
  /** M6: overrides incidents.spreadDelaySeconds. */
  spreadDelaySeconds?: number;
  /** M9: only starts in power-producing rooms (surges). */
  startsInPower?: boolean;
  /** M9: only spreads into powered rooms. */
  spreadsPowered?: boolean;
  /** M9: share of the damage dealt as taint instead of HP (the Hollowed). */
  taintShare?: number;
  /** M9: taint every defender takes when it is beaten. */
  residueTaint?: number;
  /** M9: moves to a neighbouring room this often, fought or not (Glassbacks). */
  jumpSeconds?: number;
  /** M9: after this many jumps it leaves. */
  maxJumps?: number;
  /** M9: offline, it goes away after this long (no harm, no reward). */
  offlineSettleSeconds?: number;
  /** M9: never picked by the incident timer (Maulers come from the meter). */
  meterOnly?: boolean;
  /** M9: food eaten per second where nobody fights it (Maulers). */
  eatFoodPerSec?: number;
  /** M9: seconds of warning before it reaches the door, before Watchtowers. */
  warnSeconds?: number;
  /** M9: item it may drop when beaten. */
  itemDrop?: { id: string; chance: number };
}

/** M9 creature ids. */
export const SURGE: IncidentType = 'surge';
export const HOLLOWED: IncidentType = 'hollowed';
export const GLASSBACKS: IncidentType = 'glassbacks';
export const MAULERS: IncidentType = 'maulers';

/** M9 creature events. */
export type CreatureEvent =
  | { type: 'maulerStirring'; meter: number }
  | { type: 'incidentMoved'; incidentId: number; roomId: number; incident: IncidentType }
  | { type: 'incidentEscaped'; incidentId: number; roomId: number; incident: IncidentType };

function emit(state: GameState, ev: CreatureEvent): void {
  state.events.push(ev);
}

export interface MaulerTuning {
  perResidentPerHour: number;
  perThousandScripPerHour: number;
  scripCounted: number;
  perRadioPerHour: number;
  perDoorOpening: number;
  doorStats: string[];
  decayPerHour: number;
  researchCut: number;
  doorHpCut: number;
  towerCut: number;
  maxTowerCut: number;
  minMult: number;
  offlineCap: number;
  stirringAt: number;
  escapedResetTo: number;
  threatMult: number;
}

export function maulerTuning(content: Content): MaulerTuning {
  return (content.balance.incidents as unknown as { mauler: MaulerTuning }).mauler;
}

export function incidentDef(content: Content, type: IncidentType): IncidentDef {
  return (content.balance.incidents.types as Record<string, IncidentDef>)[type] as IncidentDef;
}

function averageLevel(state: GameState): number {
  const living = livingResidents(state);
  if (!living.length) return 1;
  return living.reduce((s, r) => s + r.level, 0) / living.length;
}

function levelScale(state: GameState, content: Content): number {
  return 1 + content.balance.incidents.hpPerAvgLevel * (averageLevel(state) - 1);
}

export function defenders(state: GameState, room: Room): Resident[] {
  return state.residents.filter((r) => r.roomId === room.id && !r.dead && !r.waiting && !fleesIncidents(state, r));
}

/**
 * Offline, incidents are frozen (no harm), except ones that clear themselves
 * when left alone (cave-ins): their settle timer keeps running, so a room
 * isn't blocked for a whole absence.
 */
export function settleIncidentsOffline(state: GameState, content: Content, dt: number): void {
  tickMaulerMeter(state, content, dt, true);
  for (const inc of [...state.incidents]) {
    const def = incidentDef(content, inc.type);
    // M9 creatures leave on their own while nobody is watching.
    const settle = def.settleSeconds ?? def.offlineSettleSeconds;
    if (settle === undefined) continue;
    inc.emptyFor += dt;
    if (inc.emptyFor < settle) continue;
    state.incidents = state.incidents.filter((i) => i !== inc);
    bump(state, 'incidentsSettled');
    if (inc.type === MAULERS) maulerLeft(state, content);
    state.events.push({ type: 'incidentResolved', incidentId: inc.id, roomId: inc.roomId, incident: inc.type, loot: 0 });
  }
}

/** A Mauler that got away: the meter doesn't start from empty. */
function maulerLeft(state: GameState, content: Content): void {
  bump(state, 'maulersEscaped');
  state.maulerMeter = Math.max(state.maulerMeter, maulerTuning(content).escapedResetTo);
}

/**
 * Choose which incident happens. Rustmen weigh more or less by the clans'
 * reputation (factions.raidRateMult); without raiders in the running the
 * old uniform pick is kept, so the rng sequence doesn't change.
 */
function pickIncidentType<T extends IncidentType>(state: GameState, content: Content, options: T[]): T {
  // M9: under a Glass Sky the Hollowed turn up twice as often.
  const glassSky = options.includes(HOLLOWED as T) && ruleFlag(state, content, 'glassSky');
  if (!options.includes('rustmen' as T) && !glassSky) return pick(state.rng, options);
  const weights = options.map((t) =>
    t === 'rustmen' ? raidRateMult(state, content) * rulesetMods(state, content).raidWeight : t === HOLLOWED && glassSky ? 2 : 1,
  );
  let x = nextFloat(state.rng) * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < options.length; i++) {
    x -= weights[i] as number;
    if (x < 0) return options[i] as T;
  }
  return options[options.length - 1] as T;
}

/** Rooms that can host incidents: not the door, not elevators. */
function incidentRooms(state: GameState, content: Content): Room[] {
  return state.rooms.filter((r) => {
    const cat = roomDef(content, r).category;
    return cat !== 'door' && cat !== 'elevator';
  });
}

/** A room touches dirt when an empty cell (or the grid edge) is beside it. Elevators shield it. */
export function touchesDirt(state: GameState, content: Content, room: Room): boolean {
  const occ = floorOccupancy(state, content, room.floor);
  const w = roomCells(content, room);
  const left = room.x - 1;
  const right = room.x + w;
  const edge = content.balance.grid.cellsPerFloor;
  return left < 0 || occ[left] === null || right >= edge || occ[right] === null;
}

function newIncident(state: GameState, content: Content, type: IncidentType, room: Room, visited: number[]): Incident {
  const def = incidentDef(content, type);
  const scale = levelScale(state, content);
  const deep = def.deepOnly ? deepIncidentScale(state, content, room.floor) : { hp: 1, dps: 1 };
  const hp = (def.hpPerSegment ?? 30) * room.segments * (1 + (def.hpPerRoomLevel ?? 0) * (room.level - 1)) * scale * deep.hp;
  const inc: Incident = {
    id: state.nextId++,
    type,
    roomId: room.id,
    hp,
    maxHp: hp,
    dps: (def.dpsPerSegment ?? 1) * room.segments * scale * deep.dps,
    visited: [...visited, room.id],
    emptyFor: 0,
    roomTime: 0,
    doorHp: 0,
    stolen: 0,
  };
  state.incidents.push(inc);
  return inc;
}

export function startIncident(state: GameState, content: Content, type: IncidentType, room: Room): Incident {
  const inc = newIncident(state, content, type, room, []);
  state.incidentTimer = 0;
  state.events.push({ type: 'incidentStarted', incidentId: inc.id, roomId: room.id, incident: type });
  return inc;
}

export function startRaid(state: GameState, content: Content): Incident | null {
  const door = state.rooms.find((r) => roomDef(content, r).category === 'door');
  if (!door) return null;
  const def = incidentDef(content, 'rustmen');
  const scale = 1 + (def.hpPerAvgLevel ?? 0) * (averageLevel(state) - 1);
  const doorHp = doorStrength(state, content, door);
  const hp = (def.hp ?? 90) * scale;
  const inc: Incident = {
    id: state.nextId++,
    type: 'rustmen',
    roomId: door.id,
    hp,
    maxHp: hp,
    dps: (def.dps ?? 3) * scale,
    visited: [door.id],
    emptyFor: 0,
    roomTime: 0,
    doorHp,
    stolen: 0,
  };
  // Watchtowers (M7) spot raiders on the horizon.
  const warn = raidDefense(state, content).warnSeconds;
  if (warn > 0) {
    inc.warning = warn;
    inc.warningTotal = warn;
  }
  state.incidents.push(inc);
  state.incidentTimer = 0;
  state.events.push({ type: 'incidentStarted', incidentId: inc.id, roomId: door.id, incident: 'rustmen' });
  return inc;
}

/** Door HP against anything trying to get in: level, research, rulesets. */
function doorStrength(state: GameState, content: Content, door: Room): number {
  return (roomDef(content, door).doorHp?.[door.level - 1] ?? 0) * (1 + bonus(state, content, 'doorHp')) * rulesetMods(state, content).doorHp;
}

/**
 * A Mauler is spotted heading for the door (M9). It is telegraphed: the
 * warning always runs, and Watchtowers lengthen it. The meter empties.
 */
export function startMauler(state: GameState, content: Content): Incident | null {
  const door = state.rooms.find((r) => roomDef(content, r).category === 'door');
  if (!door) return null;
  const def = incidentDef(content, MAULERS);
  const scale = 1 + (def.hpPerAvgLevel ?? 0) * (averageLevel(state) - 1);
  const hp = (def.hp ?? 900) * scale;
  const inc: Incident = {
    id: state.nextId++,
    type: MAULERS,
    roomId: door.id,
    hp,
    maxHp: hp,
    dps: (def.dps ?? 9) * scale,
    visited: [door.id],
    emptyFor: 0,
    roomTime: 0,
    doorHp: doorStrength(state, content, door),
    stolen: 0,
  };
  const warn = (def.warnSeconds ?? 0) + raidDefense(state, content).warnSeconds;
  if (warn > 0) {
    inc.warning = warn;
    inc.warningTotal = warn;
  }
  state.incidents.push(inc);
  state.incidentTimer = 0;
  state.maulerMeter = 0;
  bump(state, 'maulers');
  state.events.push({ type: 'incidentStarted', incidentId: inc.id, roomId: door.id, incident: MAULERS });
  return inc;
}

/** Summed door-noise counters (every expedition, quest, caravan and arrival through the door). */
function doorNoise(state: GameState, t: MaulerTuning): number {
  return t.doorStats.reduce((s, k) => s + (state.stats[k] ?? 0), 0);
}

/** Staffed radio rooms: broadcasting is noise too. */
function staffedRadios(state: GameState, content: Content): number {
  return state.rooms.filter((r) => roomDef(content, r).category === 'radio' && workersInRoom(state, r.id).length > 0).length;
}

/** How fast the meter rises, relative to an undefended standard site (research, Watchtowers, site and rules). */
export function maulerRateMult(state: GameState, content: Content): number {
  const t = maulerTuning(content);
  const research = t.researchCut * bonus(state, content, 'incidentDefense') + t.doorHpCut * bonus(state, content, 'doorHp');
  const towers = Math.min(t.maxTowerCut, t.towerCut * raidDefense(state, content).towers);
  return Math.max(t.minMult, (1 - research) * (1 - towers)) * incidentRate(state, content);
}

/** Steady rise per hour from wealth (before door noise and decay), after maulerRateMult. */
export function maulerWealthPerHour(state: GameState, content: Content): number {
  const t = maulerTuning(content);
  const wealth =
    population(state) * t.perResidentPerHour +
    (Math.min(Math.max(0, state.scrip), t.scripCounted) / 1000) * t.perThousandScripPerHour +
    staffedRadios(state, content) * t.perRadioPerHour;
  return wealth * maulerRateMult(state, content);
}

/**
 * The Mauler meter. Every step, online and offline. Below the Mauler's
 * population threshold it only decays. While a Mauler is inside it holds.
 * Offline it may rise, but never past offlineCap: nothing arrives while away.
 * Linear in dt, so 1 s and 60 s steps agree.
 */
export function tickMaulerMeter(state: GameState, content: Content, dt: number, offline: boolean): void {
  const t = maulerTuning(content);
  if (!t) return;
  const noise = doorNoise(state, t);
  const seen = state.loot.noiseSeen;
  // Replaced rather than mutated: reminders.ts replays this on a shallow copy of the state.
  if (seen !== noise) state.loot = { ...state.loot, noiseSeen: noise };
  const opened = seen === undefined || noise < seen ? 0 : noise - seen;
  const before = state.maulerMeter ?? 0;
  if (state.incidents.some((i) => i.type === MAULERS)) return;
  const decay = (t.decayPerHour * dt) / 3600;
  if (population(state) < incidentDef(content, MAULERS).natural) {
    state.maulerMeter = Math.max(0, before - decay);
    return;
  }
  const rise = (maulerWealthPerHour(state, content) * dt) / 3600 + opened * t.perDoorOpening * maulerRateMult(state, content);
  const cap = offline ? Math.max(before, t.offlineCap) : 1;
  const next = Math.max(0, Math.min(cap, before + rise - decay));
  state.maulerMeter = next;
  if (!offline && before < t.stirringAt && next >= t.stirringAt) emit(state, { type: 'maulerStirring', meter: next });
}

export interface MaulerStatus {
  meter: number;
  /** Net change per hour from wealth and decay (door openings add on top). */
  perHour: number;
  /** Past the stirring mark: something big is paying attention. */
  stirring: boolean;
  /** A Mauler is on its way in or inside. */
  active: boolean;
  /** The homestead is too small to interest one (the meter only falls). */
  dormant: boolean;
}

export function maulerStatus(state: GameState, content: Content): MaulerStatus {
  const t = maulerTuning(content);
  const dormant = population(state) < incidentDef(content, MAULERS).natural;
  const meter = state.maulerMeter ?? 0;
  return {
    meter,
    perHour: (dormant ? 0 : maulerWealthPerHour(state, content)) - t.decayPerHour,
    stirring: meter >= t.stirringAt,
    active: state.incidents.some((i) => i.type === MAULERS),
    dormant,
  };
}

/** Incident started by a failed rush: an internal one suited to the population and room. */
export function startRushIncident(state: GameState, content: Content, room: Room): Incident {
  const pop = population(state);
  const options = (['fire', 'skitters', 'burrowers'] as const).filter((t) => {
    const def = incidentDef(content, t);
    if (def.rush === null || pop < def.rush) return false;
    return !def.needsDirt || touchesDirt(state, content, room);
  });
  return startIncident(state, content, options.length ? pick(state.rng, options) : 'fire', room);
}

export function scheduleIncident(state: GameState, content: Content): void {
  const t = content.balance.incidents.timer;
  state.incidentTimer = 0;
  // Harsher sites (Legacy) bring incidents around more often.
  state.nextIncidentAt = nextInt(state.rng, t.minSeconds, t.maxSeconds) / incidentRate(state, content);
}

/** Incident types that only happen in the Deep. */
export function deepIncidentTypes(content: Content): IncidentType[] {
  return (Object.keys(content.balance.incidents.types) as IncidentType[]).filter((t) => incidentDef(content, t).deepOnly);
}

/** Rooms a deep incident of this type could start in right now. */
export function deepIncidentRooms(state: GameState, content: Content, type: IncidentType): Room[] {
  const def = incidentDef(content, type);
  if (!def.deepOnly || population(state) < def.natural) return [];
  return incidentRooms(state, content).filter(
    (r) =>
      isDeepFloor(content, r.floor) &&
      stratumOf(content, r.floor) >= (def.minStratum ?? 1) &&
      (!def.needsDirt || touchesDirt(state, content, r)),
  );
}

/**
 * The timer fired: maybe the Deep acts up instead of the usual roster. Rolls
 * nothing at all while no incident room is on a deep floor, so homesteads
 * without a Deep see exactly the incidents they always did.
 */
function maybeDeepIncident(state: GameState, content: Content, rooms: Room[]): boolean {
  const deepRooms = rooms.filter((r) => isDeepFloor(content, r.floor));
  if (!deepRooms.length) return false;
  if (!chance(state.rng, deepIncidentChance(state, content, deepRooms.length, rooms.length))) return false;
  const choices = deepIncidentTypes(content)
    .map((type) => ({ type, rooms: deepIncidentRooms(state, content, type) }))
    .filter((c) => c.rooms.length > 0);
  if (!choices.length) return false;
  const c = pick(state.rng, choices);
  startIncident(state, content, c.type, pick(state.rng, c.rooms));
  return true;
}

/** Power-producing rooms, where surges start. */
function powerRooms(content: Content, rooms: Room[]): Room[] {
  return rooms.filter((r) => roomDef(content, r).produces?.resource === 'power');
}

/** Background incident timer (online only). Also runs the Mauler meter. */
export function tickIncidentTimer(state: GameState, content: Content, dt: number): void {
  tickMaulerMeter(state, content, dt, false);
  if (state.incidents.length > 0) return;
  // A full meter brings a Mauler as soon as the homestead is otherwise quiet.
  if ((state.maulerMeter ?? 0) >= 1 && population(state) >= incidentDef(content, MAULERS).natural && startMauler(state, content)) return;
  state.incidentTimer += dt;
  if (state.incidentTimer < state.nextIncidentAt) return;
  const pop = population(state);
  const rooms = incidentRooms(state, content);
  const dirtRooms = rooms.filter((r) => touchesDirt(state, content, r));
  const power = powerRooms(content, rooms);
  const options = (['fire', 'skitters', 'burrowers', 'rustmen', SURGE, HOLLOWED, GLASSBACKS] as IncidentType[]).filter((t) => {
    const def = incidentDef(content, t);
    if (!def || def.meterOnly || pop < def.natural) return false;
    if (def.needsDirt) return dirtRooms.length > 0;
    if (def.startsInPower) return power.length > 0;
    return def.external ? true : rooms.length > 0;
  });
  scheduleIncident(state, content);
  if (maybeDeepIncident(state, content, rooms)) return;
  if (!options.length) return;
  const type = pickIncidentType(state, content, options);
  if (type === 'rustmen') startRaid(state, content);
  else {
    const def = incidentDef(content, type);
    startIncident(state, content, type, pick(state.rng, def.needsDirt ? dirtRooms : def.startsInPower ? power : rooms));
  }
}

/** Neighbouring rooms an internal incident can spread to (left, right, above, below). */
function spreadTargets(state: GameState, content: Content, room: Room, visited: number[], def: IncidentDef): Room[] {
  const w = roomCells(content, room);
  const eligible = (r: Room) => {
    const cat = roomDef(content, r).category;
    // Deep threats stay in the Deep.
    if (def.deepOnly && !isDeepFloor(content, r.floor)) return false;
    // M9: surges only run along powered rooms.
    if (def.spreadsPowered && !r.powered) return false;
    return cat !== 'door' && cat !== 'elevator' && !visited.includes(r.id);
  };
  const sameFloor = state.rooms.filter((r) => r.floor === room.floor && r.id !== room.id);
  const left = sameFloor.find((r) => r.x + roomCells(content, r) === room.x);
  const right = sameFloor.find((r) => r.x === room.x + w);
  const vertical = (floor: number) =>
    state.rooms
      .filter((r) => r.floor === floor && r.x < room.x + w && r.x + roomCells(content, r) > room.x)
      .sort((a, b) => a.x - b.x)
      .find(eligible);
  const around = def.sideways ? [left, right] : [left, right, vertical(room.floor - 1), vertical(room.floor + 1)];
  return around.filter((r): r is Room => !!r && eligible(r));
}

/** Where raiders go next: the nearest unvisited room, walking out from the door. */
function nextRaidRoom(state: GameState, content: Content, inc: Incident): Room | null {
  const connected = connectedRoomIds(state, content);
  const door = state.rooms.find((r) => roomDef(content, r).category === 'door');
  const order = state.rooms
    .filter((r) => connected.has(r.id) && !inc.visited.includes(r.id) && roomDef(content, r).category !== 'elevator')
    .sort((a, b) => {
      const da = door ? a.floor * 100 + Math.abs(a.x - door.x) : 0;
      const db = door ? b.floor * 100 + Math.abs(b.x - door.x) : 0;
      return da - db;
    });
  return order[0] ?? null;
}

/** Damage per second a resident does against a stat-worked incident (digging, patching pipes). */
function workDamage(content: Content, def: IncidentDef, r: Resident): number {
  const stat = effectiveStat(content, r, def.workStat as StatKey);
  return stat * (def.workPerStat ?? 0.5) + content.balance.incidents.damagePerLevel * (r.level - 1);
}

function resolve(state: GameState, content: Content, inc: Incident, room: Room): void {
  state.incidents = state.incidents.filter((i) => i !== inc);
  const def = incidentDef(content, inc.type);
  for (const r of defenders(state, room)) grantXp(state, content, r, content.balance.incidents.xpOnResolvePerResident);
  let loot = 0;
  if (def.external) {
    // What they stole comes back as it was; the rest is a find, and scales like one.
    loot = Math.round(inc.stolen) + scripIncome(content, (def.lootBase ?? 0) + (def.lootPerAvgLevel ?? 0) * averageLevel(state));
    addScrip(state, content, loot);
  }
  // M9: the Hollowed leave a last dose of Glare on whoever turned them back.
  if (def.residueTaint) for (const r of defenders(state, room)) addTaint(r, def.residueTaint);
  if (def.itemDrop && content.items[def.itemDrop.id] && chance(state.rng, def.itemDrop.chance)) {
    grantItem(state, content, def.itemDrop.id);
    bump(state, `incidentDrops.${inc.type}`);
  }
  bump(state, 'incidentsResolved');
  bump(state, `incidentsResolved.${inc.type}`);
  state.events.push({ type: 'incidentResolved', incidentId: inc.id, roomId: room.id, incident: inc.type, loot });
}

/** Taint from the Hollowed: never past max HP - 1 (taint alone doesn't kill here). */
function addTaint(r: Resident, amount: number): void {
  r.taint = Math.min(r.maxHp - 1, r.taint + amount);
  r.hp = Math.min(r.hp, effectiveMaxHp(r));
}

/** Leaves the homestead without being beaten (Glassbacks out of jumps, a Mauler out of rooms). */
function escape(state: GameState, content: Content, inc: Incident, room: Room): void {
  state.incidents = state.incidents.filter((i) => i !== inc);
  if (inc.type === 'rustmen') bump(state, 'raidsEscaped');
  else if (inc.type === MAULERS) maulerLeft(state, content);
  else bump(state, `escaped.${inc.type}`);
  if (inc.type !== 'rustmen') emit(state, { type: 'incidentEscaped', incidentId: inc.id, roomId: room.id, incident: inc.type });
  state.events.push({ type: 'incidentResolved', incidentId: inc.id, roomId: room.id, incident: inc.type, loot: 0 });
}

/** Glassbacks: hop to a random neighbouring room (not straight back if there's a choice). */
function jump(state: GameState, content: Content, inc: Incident, room: Room, def: IncidentDef): void {
  const jumps = inc.visited.length - 1;
  const free = (r: Room) => !state.incidents.some((i) => i !== inc && i.roomId === r.id);
  const around = spreadTargets(state, content, room, [room.id], def).filter(free);
  const prev = inc.visited[inc.visited.length - 2];
  const fresh = around.filter((r) => r.id !== prev);
  const choices = fresh.length ? fresh : around;
  if (jumps >= (def.maxJumps ?? 6) || !choices.length) {
    escape(state, content, inc, room);
    return;
  }
  const next = pick(state.rng, choices);
  inc.roomId = next.id;
  inc.visited.push(next.id);
  inc.roomTime = 0;
  inc.emptyFor = 0;
  emit(state, { type: 'incidentMoved', incidentId: inc.id, roomId: next.id, incident: inc.type });
}

export function tickIncidents(state: GameState, content: Content, dt: number): void {
  const spreadDelay = content.balance.incidents.spreadDelaySeconds;
  for (const inc of [...state.incidents]) {
    const room = state.rooms.find((r) => r.id === inc.roomId);
    if (!room) {
      state.incidents = state.incidents.filter((i) => i !== inc);
      continue;
    }
    const def = incidentDef(content, inc.type);

    // Spotted from a Watchtower: they are still crossing the flats.
    if (inc.warning !== undefined && inc.warning > 0) {
      inc.warning = Math.max(0, inc.warning - dt);
      continue;
    }
    // Staffed Watchtowers (M7) take the edge off a raid.
    const tower = def.external ? raidDefense(state, content) : null;

    // Raiders first have to get through the door.
    if (inc.doorHp > 0) {
      inc.doorHp -= inc.dps * dt * (tower?.doorDamageMult ?? 1);
      if (inc.doorHp <= 0) {
        inc.doorHp = 0;
        state.events.push({ type: 'doorBreached', incidentId: inc.id });
      }
      continue;
    }

    inc.roomTime += dt;
    const crew = defenders(state, room);
    if (def.powerDrainPerSec) state.resources.power = Math.max(0, state.resources.power - def.powerDrainPerSec * dt);

    if (crew.length > 0) {
      inc.emptyFor = 0;
      const damage =
        def.workStat !== undefined
          ? crew.reduce((s, r) => s + workDamage(content, def, r), 0)
          : def.fixedDamage !== undefined
            ? crew.length * def.fixedDamage
            : crew.reduce((s, r) => s + combatDamage(content, r), 0);
      inc.hp -= damage * dt;
      // Defense research (drills, armour plating) takes the edge off.
      const perResident = (inc.dps * dt * Math.max(0.2, 1 - bonus(state, content, 'incidentDefense')) * (tower?.damageMult ?? 1)) / crew.length;
      const taintShare = def.taintShare ?? 0;
      for (const r of crew) {
        const dealt = perResident * traitDamageTakenMult(content, r);
        // The Hollowed: part of it is Glare-sickness rather than wounds.
        if (taintShare > 0) addTaint(r, dealt * taintShare);
        r.hp -= dealt * (1 - taintShare);
        if (r.hp <= 0) {
          r.hp = 0;
          r.dead = true;
          r.courtship = null;
          bump(state, 'deaths');
          bump(state, `deaths.${inc.type}`);
          state.events.push({ type: 'residentDied', residentId: r.id });
        }
      }
      if (inc.hp <= 0) {
        resolve(state, content, inc, room);
        continue;
      }
    } else {
      inc.emptyFor += dt;
    }

    if (def.jumpSeconds !== undefined) {
      if (inc.roomTime >= def.jumpSeconds) jump(state, content, inc, room, def);
      continue;
    }

    if (def.external) {
      if (crew.length === 0) {
        const take = Math.min(state.scrip, (def.stealScripPerSec ?? 0) * dt);
        state.scrip -= take;
        inc.stolen += take;
        // A Mauler left alone eats the pantry.
        if (def.eatFoodPerSec) state.resources.food = Math.max(0, state.resources.food - def.eatFoodPerSec * dt);
      }
      const roomSeconds = def.roomSeconds ?? 20;
      const stillFighting = defenders(state, room).length > 0;
      if ((!stillFighting && inc.roomTime >= roomSeconds / 2) || inc.roomTime >= roomSeconds * 2) {
        const next = nextRaidRoom(state, content, inc);
        if (!next) {
          // They got away with what they stole.
          escape(state, content, inc, room);
          continue;
        }
        inc.roomId = next.id;
        inc.visited.push(next.id);
        inc.roomTime = 0;
      }
    } else if (def.settleSeconds !== undefined && inc.emptyFor >= def.settleSeconds) {
      // Nobody came to dig it out; the rubble settles and the room reopens.
      // Nobody earns XP, and it doesn't count as resolved for achievements.
      state.incidents = state.incidents.filter((i) => i !== inc);
      bump(state, 'incidentsSettled');
      state.events.push({ type: 'incidentResolved', incidentId: inc.id, roomId: room.id, incident: inc.type, loot: 0 });
    } else if (def.spreads && inc.emptyFor >= (def.spreadDelaySeconds ?? spreadDelay)) {
      // An unattended room burns out and the incident moves into its neighbours.
      state.incidents = state.incidents.filter((i) => i !== inc);
      const visited = [...inc.visited];
      const spawned: Incident[] = [];
      for (const target of spreadTargets(state, content, room, visited, def)) {
        if (state.incidents.some((i) => i.roomId === target.id)) continue;
        spawned.push(newIncident(state, content, inc.type, target, visited));
        visited.push(target.id);
      }
      // Siblings share the full chain history so none of them can double back.
      for (const s of spawned) {
        s.visited = [...visited];
        state.events.push({ type: 'incidentSpread', incidentId: s.id, roomId: s.roomId, incident: inc.type });
      }
    }
  }
}
