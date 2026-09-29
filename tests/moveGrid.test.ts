// Playtest 1, round 2: the wider grid (item 10) and moving rooms for scrip (item 8).
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  canMove,
  canPlace,
  connectedRoomIds,
  deserialize,
  loadContent,
  moveCost,
  newGame,
  SAVE_VERSION,
  serialize,
  starterDoorX,
  starterShaftX,
  TOPSIDE_FLOOR,
  type GameState,
  type Room,
} from '../src/sim';
import { buildCost } from '../src/sim/economy';
import { V11_GRID_SHIFT } from '../src/sim/save';
import { startIncident } from '../src/sim/systems/incidents';
import { createResident } from '../src/sim/residents';

const content = loadContent();
const T0 = 1_700_000_000_000;
const S = content.balance.grid.starterShaftX;
const W = content.balance.grid.cellsPerFloor;
const BASE = content.balance.grid.floors;

function fresh(seed = 5): GameState {
  const s = newGame(content, { seed, now: T0 });
  applyCommand(s, content, { type: 'admitAll' });
  s.scrip = 100_000;
  return s;
}

const byType = (s: GameState, type: string) => s.rooms.find((r) => r.type === type) as Room;

function addRoom(s: GameState, type: string, floor: number, x: number, extra: Partial<Room> = {}): Room {
  const room: Room = { id: s.nextId++, type, floor, x, segments: 1, level: 1, pool: 0, ready: false, powered: true, timer: 0, job: null, banked: 0, ...extra };
  s.rooms.push(room);
  return room;
}

describe('the wider grid', () => {
  it('puts the starter shaft at grid.starterShaftX with the door just left of it', () => {
    expect(starterShaftX(content)).toBe(S);
    expect(starterDoorX(content)).toBe(S - 6);
    expect(S % 3).toBe(0); // the left side packs into whole segments
    const s = fresh();
    expect(byType(s, 'door').x).toBe(S - 6);
    expect(s.rooms.filter((r) => r.type === 'elevator').map((r) => r.x)).toEqual([S, S, S]);
    expect(byType(s, 'generator').x).toBe(S + 1);
    expect(byType(s, 'canteen').x).toBe(S + 4);
  });

  it('can build all the way to both edges', () => {
    const s = fresh();
    // Left of the shaft on floor 1: eight segments, packed from the shaft out to x = 0.
    for (let x = S - 3; x >= 0; x -= 3) expect(applyCommand(s, content, { type: 'build', roomType: 'quarters', floor: 1, x }).ok, `x ${x}`).toBe(true);
    expect(s.rooms.filter((r) => r.floor === 1 && r.x < S).reduce((n, r) => n + r.segments, 0)).toBe(S / 3);
    // Right of the shaft: up to the last whole segment.
    for (let x = S + 7; x + 3 <= W; x += 3) expect(applyCommand(s, content, { type: 'build', roomType: 'waterworks', floor: 1, x }).ok, `x ${x}`).toBe(true);
    expect(canPlace(s, content, 'waterworks', 1, W - 2).ok).toBe(false);
    // Floor 0: the ground left of the door is open too.
    expect(canPlace(s, content, 'quarters', 0, S - 9).ok).toBe(true);
  });

  it('lets surface buildings chain along the whole ground from the door', () => {
    const s = fresh();
    s.research.done.push('topside_survey');
    s.unlockedRooms.push('solar_array');
    expect(canPlace(s, content, 'solar_array', TOPSIDE_FLOOR, 0).ok).toBe(false); // not linked yet
    expect(applyCommand(s, content, { type: 'build', roomType: 'solar_array', floor: TOPSIDE_FLOOR, x: S - 6 }).ok).toBe(true);
    for (let x = S - 9; x >= 0; x -= 3) addRoom(s, 'solar_array', TOPSIDE_FLOOR, x, { level: 2 });
    expect(connectedRoomIds(s, content).size).toBe(s.rooms.length);
  });
});

describe('save migration v10 -> v11', () => {
  it('shifts every room right by the grid offset, keeping the layout intact', () => {
    expect(SAVE_VERSION).toBe(11);
    expect(V11_GRID_SHIFT).toBe(S - 6);
    const s = fresh();
    s.deep.strata = 1;
    s.research.done.push('topside_survey');
    addRoom(s, 'elevator', 3, S);
    for (let f = 4; f <= BASE; f++) addRoom(s, 'elevator', f, S);
    addRoom(s, 'quarters', BASE, S + 1);
    addRoom(s, 'watchtower', TOPSIDE_FLOOR, S - 3);
    addRoom(s, 'storeroom', 2, S - 3);
    const want = s.rooms.map((r) => ({ id: r.id, floor: r.floor, x: r.x }));
    // What the same homestead looked like in a v10 save (shaft at x = 6).
    const { events: _e, ...rest } = structuredClone(s);
    rest.rooms = rest.rooms.map((r) => ({ ...r, x: r.x - V11_GRID_SHIFT }));
    expect(rest.rooms.find((r) => r.type === 'door')!.x).toBe(0);
    expect(rest.rooms.find((r) => r.type === 'storeroom')!.x).toBe(3);
    const loaded = deserialize(JSON.stringify({ format: 'homestead-save', version: 10, savedAt: 0, state: rest }));
    expect(loaded.rooms.map((r) => ({ id: r.id, floor: r.floor, x: r.x }))).toEqual(want);
    expect(connectedRoomIds(loaded, content).size).toBe(loaded.rooms.length);
    // And the migrated homestead now has room on its left.
    expect(canPlace(loaded, content, 'generator', 1, S - 6).ok).toBe(false); // storeroom is on floor 2
    expect(canPlace(loaded, content, 'generator', 1, S - 3).ok).toBe(true);
    // A v11 save round-trips unchanged.
    expect(serialize(deserialize(serialize(loaded, 0)), 0)).toBe(serialize(loaded, 0));
  });
});

describe('moving rooms', () => {
  it('moves a room whole, keeping its id, level, crew, pool, batches and power, for scrip', () => {
    const s = fresh();
    const gen = byType(s, 'canteen');
    gen.level = 2;
    gen.segments = 1;
    gen.pool = 12;
    gen.ready = true;
    gen.banked = 1;
    gen.powered = false;
    const crew = s.residents.filter((r) => !r.waiting).slice(0, 2);
    for (const r of crew) r.roomId = gen.id;
    const cost = moveCost(s, content, gen);
    expect(cost).toBe(Math.max(content.balance.grid.moveCostMin, Math.round(buildCost(s, content, 'canteen') * content.balance.grid.moveCostFraction)));
    const scrip = s.scrip;
    const res = applyCommand(s, content, { type: 'moveRoom', roomId: gen.id, floor: 1, x: S - 3 });
    expect(res.ok).toBe(true);
    const moved = s.rooms.find((r) => r.id === gen.id)!;
    expect(moved).toMatchObject({ floor: 1, x: S - 3, level: 2, segments: 1, pool: 12, ready: true, banked: 1, powered: false });
    expect(s.scrip).toBe(scrip - cost);
    for (const r of crew) expect(r.roomId).toBe(gen.id);
    expect(s.stats['roomsMoved']).toBe(1);
    expect(s.events.some((e) => e.type === 'roomMoved' && e.roomId === gen.id && e.fromX === S + 4 && e.x === S - 3)).toBe(true);
    expect(connectedRoomIds(s, content).size).toBe(s.rooms.length);
  });

  it('prices by segments, with a floor', () => {
    const s = fresh();
    const q = byType(s, 'quarters');
    const one = moveCost(s, content, q);
    q.segments = 3;
    expect(moveCost(s, content, q)).toBe(Math.max(content.balance.grid.moveCostMin, Math.round(buildCost(s, content, 'quarters') * content.balance.grid.moveCostFraction * 3)));
    expect(moveCost(s, content, q)).toBeGreaterThan(one);
    // The tutorial's free builds don't make moving free.
    const t = newGame(content, { seed: 1, now: T0, tutorial: true });
    const g = addRoom(t, 'generator', 1, S + 1);
    expect(moveCost(t, content, g)).toBeGreaterThanOrEqual(content.balance.grid.moveCostMin);
  });

  it('can slide over its own old cells', () => {
    const s = fresh();
    // Floor 2 runs out to a second shaft at S + 13; floor 1's canteen hangs off it, a gap from the generator.
    addRoom(s, 'storeroom', 2, S + 4, { segments: 3 });
    addRoom(s, 'elevator', 2, S + 13);
    addRoom(s, 'elevator', 1, S + 13);
    const can = byType(s, 'canteen');
    can.x = S + 7;
    can.segments = 2; // S+7 .. S+12
    expect(connectedRoomIds(s, content).size).toBe(s.rooms.length);
    expect(canMove(s, content, can, 1, S + 4).ok).toBe(true); // overlaps its own old cells
    expect(applyCommand(s, content, { type: 'moveRoom', roomId: can.id, floor: 1, x: S + 4 }).ok).toBe(true);
    expect(can.x).toBe(S + 4);
    // The second shaft still reaches the door through floor 2.
    expect(connectedRoomIds(s, content).size).toBe(s.rooms.length);
  });

  it('refuses the door, elevators, incidents, cut-offs, bad slots and empty pockets', () => {
    const s = fresh();
    const door = byType(s, 'door');
    const lift = byType(s, 'elevator');
    const gen = byType(s, 'generator');
    const can = byType(s, 'canteen');
    const move = (room: Room, floor: number, x: number) => applyCommand(s, content, { type: 'moveRoom', roomId: room.id, floor, x });
    expect(move(door, 0, S - 12)).toMatchObject({ ok: false, reason: 'the door stays' });
    expect(move(lift, 3, S).ok).toBe(false);
    // The generator links the canteen to the shaft.
    expect(move(gen, 2, S + 4)).toMatchObject({ ok: false, reason: 'would cut off other rooms' });
    expect(move(can, 1, S + 1)).toMatchObject({ ok: false, reason: 'space occupied' });
    expect(move(can, 1, W - 2)).toMatchObject({ ok: false, reason: 'out of bounds' });
    expect(move(can, 5, S + 1).ok).toBe(false); // nothing to attach to
    expect(move(can, TOPSIDE_FLOOR, S - 6).ok).toBe(false); // underground rooms stay underground
    expect(move(can, 1, S + 4)).toMatchObject({ ok: false, reason: 'it is already there' });
    startIncident(s, content, 'skitters', can);
    expect(move(can, 2, S + 4)).toMatchObject({ ok: false, reason: 'deal with the incident first' });
    s.incidents = [];
    s.scrip = 0;
    expect(move(can, 2, S + 4)).toMatchObject({ ok: false, reason: 'not enough scrip' });
    s.scrip = 10_000;
    expect(move(can, 2, S + 4).ok).toBe(true);
  });

  it('keeps deep rooms in the Deep and surface buildings on the surface', () => {
    const s = fresh();
    s.deep.strata = 1;
    for (let f = 3; f <= BASE + 1; f++) addRoom(s, 'elevator', f, S);
    const geo = addRoom(s, 'geothermal', BASE, S + 1);
    expect(canMove(s, content, geo, BASE - 1, S + 1)).toMatchObject({ ok: false, reason: 'only in the Deep' });
    expect(canMove(s, content, geo, BASE + 1, S - 3).ok).toBe(true);
    const tower = addRoom(s, 'watchtower', TOPSIDE_FLOOR, S - 3);
    expect(canMove(s, content, tower, 0, S + 4).ok).toBe(false);
    expect(canMove(s, content, tower, TOPSIDE_FLOOR, S - 6).ok).toBe(true);
    expect(canMove(s, content, tower, TOPSIDE_FLOOR, S + 3).ok).toBe(false); // off the door, nothing beside it
  });

  it('merges with a same-type, same-level neighbour under the build rules', () => {
    const s = fresh();
    const can = byType(s, 'canteen');
    const other = addRoom(s, 'canteen', 2, S + 1);
    const moved = applyCommand(s, content, { type: 'moveRoom', roomId: can.id, floor: 2, x: S + 4 });
    expect(moved.ok).toBe(true);
    const canteens = s.rooms.filter((r) => r.type === 'canteen');
    expect(canteens).toHaveLength(1);
    expect(canteens[0]).toMatchObject({ id: other.id, segments: 2, x: S + 1 });
    expect(s.events.some((e) => e.type === 'roomMoved' && e.roomId === other.id)).toBe(true);
  });

  it('keeps a crafting job running', () => {
    const s = fresh();
    s.unlockedRooms.push('weaponshop');
    const ws = addRoom(s, 'weaponshop', 2, S + 4, { job: { defId: 'wrench', remaining: 100, total: 200 } as unknown as Room['job'] });
    const smith = createResident(s, content, {});
    smith.waiting = false;
    smith.roomId = ws.id;
    s.residents.push(smith);
    expect(applyCommand(s, content, { type: 'moveRoom', roomId: ws.id, floor: 2, x: S - 9 }).ok).toBe(true);
    const after = s.rooms.find((r) => r.id === ws.id)!;
    expect(after.x).toBe(S - 9);
    expect(after.job).toMatchObject({ defId: 'wrench', remaining: 100 });
    expect(smith.roomId).toBe(ws.id);
  });
});
