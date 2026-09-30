// Keyboard access to the homestead: the arrow keys walk a highlight from room to
// room (the camera follows) and Enter or Space opens the room, exactly like a tap.
// The walking itself is a pure function so it can be tested without a canvas.

export type Direction = 'left' | 'right' | 'up' | 'down';

export interface RoomSpot {
  id: number;
  floor: number;
  /** Left cell and width in cells. */
  x: number;
  cells: number;
}

const KEYS: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

export function arrowDirection(key: string): Direction | null {
  return KEYS[key] ?? null;
}

const centre = (r: RoomSpot) => r.x + r.cells / 2;

/**
 * The room a step in `dir` lands on from `fromId`: the nearest room along the
 * same floor for left and right; for up and down, the nearest floor that has
 * rooms, and on it the room closest in x. Stays put at an edge. With no
 * current room (or one that is gone), starts at `startId` or the first room.
 */
export function stepRoom(rooms: readonly RoomSpot[], fromId: number | null, dir: Direction, startId?: number): number | null {
  if (!rooms.length) return null;
  const from = rooms.find((r) => r.id === fromId);
  if (!from) return (rooms.find((r) => r.id === startId) ?? rooms[0]!).id;
  const cx = centre(from);
  if (dir === 'left' || dir === 'right') {
    const sign = dir === 'right' ? 1 : -1;
    const next = rooms
      .filter((r) => r.floor === from.floor && (centre(r) - cx) * sign > 0)
      .sort((a, b) => Math.abs(centre(a) - cx) - Math.abs(centre(b) - cx))[0];
    return (next ?? from).id;
  }
  const floors = [...new Set(rooms.map((r) => r.floor))].filter((f) => (dir === 'down' ? f > from.floor : f < from.floor));
  if (!floors.length) return from.id;
  const floor = dir === 'down' ? Math.min(...floors) : Math.max(...floors);
  const next = rooms.filter((r) => r.floor === floor).sort((a, b) => Math.abs(centre(a) - cx) - Math.abs(centre(b) - cx))[0];
  return (next ?? from).id;
}
