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

import type { Content } from '../content';
import { addScrip, population } from '../economy';
import { connectedRoomIds, floorOccupancy, roomCells, roomDef } from '../grid';
import { incidentRate } from '../legacy';
import { bump, combatDamage, fleesIncidents, grantXp, livingResidents } from '../residents';
import { nextInt, pick } from '../rng';
import type { GameState, Incident, IncidentType, Resident, Room } from '../types';

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
  const hp = (def.hpPerSegment ?? 30) * room.segments * (1 + (def.hpPerRoomLevel ?? 0) * (room.level - 1)) * scale;
  const inc: Incident = {
    id: state.nextId++,
    type,
    roomId: room.id,
    hp,
    maxHp: hp,
    dps: (def.dpsPerSegment ?? 1) * room.segments * scale,
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
  const doorHp = roomDef(content, door).doorHp?.[door.level - 1] ?? 0;
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
  if (!options.length) return;
  const type = pick(state.rng, options);
  if (type === 'rustmen') startRaid(state, content);
  else startIncident(state, content, type, pick(state.rng, incidentDef(content, type).needsDirt ? dirtRooms : rooms));
}

/** Neighbouring rooms an internal incident can spread to (left, right, above, below). */
function spreadTargets(state: GameState, content: Content, room: Room, visited: number[]): Room[] {
  const w = roomCells(content, room);
  const eligible = (r: Room) => {
    const cat = roomDef(content, r).category;
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
  return [left, right, vertical(room.floor - 1), vertical(room.floor + 1)].filter((r): r is Room => !!r && eligible(r));
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

    // Raiders first have to get through the door.
    if (inc.doorHp > 0) {
      inc.doorHp -= inc.dps * dt;
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
      const damage = def.fixedDamage !== undefined ? crew.length * def.fixedDamage : crew.reduce((s, r) => s + combatDamage(content, r), 0);
      inc.hp -= damage * dt;
      const perResident = (inc.dps * dt) / crew.length;
      for (const r of crew) {
        r.hp -= perResident;
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
    } else if (def.spreads && inc.emptyFor >= spreadDelay) {
      // An unattended room burns out and the incident moves into its neighbours.
      state.incidents = state.incidents.filter((i) => i !== inc);
      const visited = [...inc.visited];
      const spawned: Incident[] = [];
      for (const target of spreadTargets(state, content, room, visited)) {
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
