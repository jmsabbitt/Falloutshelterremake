// Vault layout: placement, connectivity and merging.
//
// Each floor is a row of `cellsPerFloor` cells. A room segment is 3 cells,
// an elevator 1 cell, the door 6 cells. Floor 0 is the top floor (with the door).
// Residents walk through rooms and ride elevators, so a structure is connected
// if it touches a connected structure horizontally, or an elevator sits
// directly above/below a connected elevator.

import type { Content, RoomDef } from './content';
import { totalFloors } from './systems/deep';
import type { GameState, Room } from './types';

export function roomDef(content: Content, room: Room): RoomDef {
  const def = content.rooms[room.type];
  if (!def) throw new Error(`unknown room type ${room.type}`);
  return def;
}

export function roomCells(content: Content, room: Room): number {
  return roomDef(content, room).cells * room.segments;
}

/** Cell -> room id for one floor. */
export function floorOccupancy(state: GameState, content: Content, floor: number): (number | null)[] {
  const cells: (number | null)[] = new Array(content.balance.grid.cellsPerFloor).fill(null);
  for (const room of state.rooms) {
    if (room.floor !== floor) continue;
    const w = roomCells(content, room);
    for (let i = 0; i < w; i++) cells[room.x + i] = room.id;
  }
  return cells;
}

function neighbours(state: GameState, content: Content, room: Room): Room[] {
  const out: Room[] = [];
  const left = room.x - 1;
  const right = room.x + roomCells(content, room);
  const isElevator = room.type === 'elevator';
  for (const other of state.rooms) {
    if (other.id === room.id) continue;
    if (other.floor === room.floor) {
      const ol = other.x;
      const or = other.x + roomCells(content, other) - 1;
      if (or === left || ol === right) out.push(other);
    } else if (
      isElevator &&
      other.type === 'elevator' &&
      Math.abs(other.floor - room.floor) === 1 &&
      other.x === room.x
    ) {
      out.push(other);
    }
  }
  return out;
}

/** Ids of every room reachable from the door. */
export function connectedRoomIds(state: GameState, content: Content): Set<number> {
  const door = state.rooms.find((r) => r.type === 'door');
  const seen = new Set<number>();
  if (!door) return seen;
  const queue: Room[] = [door];
  seen.add(door.id);
  while (queue.length) {
    const cur = queue.shift() as Room;
    for (const n of neighbours(state, content, cur)) {
      if (!seen.has(n.id)) {
        seen.add(n.id);
        queue.push(n);
      }
    }
  }
  return seen;
}

export type PlacementCheck = { ok: true } | { ok: false; reason: string };

/** Can a new structure of `type` (1 segment) go at (floor, x)? */
export function canPlace(state: GameState, content: Content, type: string, floor: number, x: number): PlacementCheck {
  const def = content.rooms[type];
  if (!def) return { ok: false, reason: 'unknown room type' };
  const { cellsPerFloor } = content.balance.grid;
  if (floor < 0 || floor >= totalFloors(state, content)) return { ok: false, reason: floor >= content.balance.grid.floors ? 'excavate deeper first' : 'out of bounds' };
  if (x < 0 || x + def.cells > cellsPerFloor) return { ok: false, reason: 'out of bounds' };
  if (def.minFloor !== undefined && floor < def.minFloor) return { ok: false, reason: 'only in the Deep' };

  const occ = floorOccupancy(state, content, floor);
  for (let i = 0; i < def.cells; i++) {
    if (occ[x + i] !== null) return { ok: false, reason: 'space occupied' };
  }

  // Must attach to the connected network.
  const connected = connectedRoomIds(state, content);
  const probe: Room = { id: -1, type, floor, x, segments: 1, level: 1, pool: 0, ready: false, powered: true, timer: 0, job: null, banked: 0 };
  const attaches = neighbours(state, content, probe).some((n) => connected.has(n.id));
  if (!attaches) {
    return {
      ok: false,
      reason: type === 'elevator' ? 'must connect to an elevator or room' : 'must be next to an elevator or connected room',
    };
  }
  return { ok: true };
}

/**
 * Merge side-by-side rooms of the same type and level on a floor, up to the
 * type's max width. Returns the ids of rooms that grew.
 */
export function mergeFloor(state: GameState, content: Content, floor: number): number[] {
  const grown: number[] = [];
  let merged = true;
  while (merged) {
    merged = false;
    const onFloor = state.rooms.filter((r) => r.floor === floor).sort((a, b) => a.x - b.x);
    for (let i = 0; i + 1 < onFloor.length; i++) {
      const a = onFloor[i] as Room;
      const b = onFloor[i + 1] as Room;
      const def = roomDef(content, a);
      if (
        a.type === b.type &&
        a.level === b.level &&
        def.maxSegments > 1 &&
        a.x + roomCells(content, a) === b.x &&
        a.segments + b.segments <= def.maxSegments
      ) {
        a.segments += b.segments;
        a.pool += b.pool;
        // Keep every finished batch: banked ones plus one of the two ready flags.
        a.banked = (a.banked ?? 0) + (b.banked ?? 0) + (a.ready && b.ready ? 1 : 0);
        a.ready = a.ready || b.ready;
        for (const res of state.residents) if (res.roomId === b.id) res.roomId = a.id;
        for (const inc of state.incidents) if (inc.roomId === b.id) inc.roomId = a.id;
        state.rooms = state.rooms.filter((r) => r.id !== b.id);
        grown.push(a.id);
        merged = true;
        break;
      }
    }
  }
  return grown;
}
