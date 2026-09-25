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

import type { Content } from '../content';
import { addScrip, population } from '../economy';
import { connectedRoomIds, floorOccupancy, roomCells, roomDef } from '../grid';
import { bonus, incidentRate } from '../bonuses';
import { bump, combatDamage, effectiveStat, fleesIncidents, grantXp, livingResidents } from '../residents';
import { chance, nextFloat, nextInt, pick } from '../rng';
import type { GameState, Incident, IncidentType, Resident, Room, StatKey } from '../types';
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
  for (const inc of [...state.incidents]) {
    const def = incidentDef(content, inc.type);
    if (def.settleSeconds === undefined) continue;
    inc.emptyFor += dt;
    if (inc.emptyFor < def.settleSeconds) continue;
    state.incidents = state.incidents.filter((i) => i !== inc);
    bump(state, 'incidentsSettled');
    state.events.push({ type: 'incidentResolved', incidentId: inc.id, roomId: inc.roomId, incident: inc.type, loot: 0 });
  }
}

/**
 * Choose which incident happens. Rustmen weigh more or less by the clans'
 * reputation (factions.raidRateMult); without raiders in the running the
 * old uniform pick is kept, so the rng sequence doesn't change.
 */
function pickIncidentType<T extends IncidentType>(state: GameState, content: Content, options: T[]): T {
  if (!options.includes('rustmen' as T)) return pick(state.rng, options);
  const weights = options.map((t) => (t === 'rustmen' ? raidRateMult(state, content) : 1));
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

/** Kept for callers from M1; a fire in the given room. */
export function startFire(state: GameState, content: Content, room: Room): Incident {
  return startIncident(state, content, 'fire', room);
}

export function startRaid(state: GameState, content: Content): Incident | null {
  const door = state.rooms.find((r) => roomDef(content, r).category === 'door');
  if (!door) return null;
  const def = incidentDef(content, 'rustmen');
  const scale = 1 + (def.hpPerAvgLevel ?? 0) * (averageLevel(state) - 1);
  const doorHp = (roomDef(content, door).doorHp?.[door.level - 1] ?? 0) * (1 + bonus(state, content, 'doorHp'));
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

/** Background incident timer (online only). */
export function tickIncidentTimer(state: GameState, content: Content, dt: number): void {
  if (state.incidents.length > 0) return;
  state.incidentTimer += dt;
  if (state.incidentTimer < state.nextIncidentAt) return;
  const pop = population(state);
  const rooms = incidentRooms(state, content);
  const dirtRooms = rooms.filter((r) => touchesDirt(state, content, r));
  const options = (['fire', 'skitters', 'burrowers', 'rustmen'] as const).filter((t) => {
    const def = incidentDef(content, t);
    if (pop < def.natural) return false;
    if (def.needsDirt) return dirtRooms.length > 0;
    return def.external ? true : rooms.length > 0;
  });
  scheduleIncident(state, content);
  if (maybeDeepIncident(state, content, rooms)) return;
  if (!options.length) return;
  const type = pickIncidentType(state, content, options);
  if (type === 'rustmen') startRaid(state, content);
  else startIncident(state, content, type, pick(state.rng, incidentDef(content, type).needsDirt ? dirtRooms : rooms));
}

/** Neighbouring rooms an internal incident can spread to (left, right, above, below). */
function spreadTargets(state: GameState, content: Content, room: Room, visited: number[], def: IncidentDef): Room[] {
  const w = roomCells(content, room);
  const eligible = (r: Room) => {
    const cat = roomDef(content, r).category;
    // Deep threats stay in the Deep.
    if (def.deepOnly && !isDeepFloor(content, r.floor)) return false;
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
    loot = Math.round(inc.stolen + (def.lootBase ?? 0) + (def.lootPerAvgLevel ?? 0) * averageLevel(state));
    addScrip(state, content, loot);
  }
  bump(state, 'incidentsResolved');
  bump(state, `incidentsResolved.${inc.type}`);
  state.events.push({ type: 'incidentResolved', incidentId: inc.id, roomId: room.id, incident: inc.type, loot });
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
      for (const r of crew) {
        r.hp -= perResident * traitDamageTakenMult(content, r);
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

    if (def.external) {
      if (crew.length === 0) {
        const take = Math.min(state.scrip, (def.stealScripPerSec ?? 0) * dt);
        state.scrip -= take;
        inc.stolen += take;
      }
      const roomSeconds = def.roomSeconds ?? 20;
      const stillFighting = defenders(state, room).length > 0;
      if ((!stillFighting && inc.roomTime >= roomSeconds / 2) || inc.roomTime >= roomSeconds * 2) {
        const next = nextRaidRoom(state, content, inc);
        if (!next) {
          // They got away with what they stole.
          state.incidents = state.incidents.filter((i) => i !== inc);
          bump(state, 'raidsEscaped');
          state.events.push({ type: 'incidentResolved', incidentId: inc.id, roomId: room.id, incident: inc.type, loot: 0 });
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
