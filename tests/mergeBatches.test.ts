// Finished batches are paid at the size and level they were made at: merging
// rooms (build or move) and upgrading never re-price them, and never lose them.

import { describe, expect, it } from 'vitest';
import { advance, applyCommand, loadContent, newGame, resourceCapacity, type GameState, type Room } from '../src/sim';

const content = loadContent();
const S = content.balance.grid.starterShaftX;

function calm(): GameState {
  const s = newGame(content, { seed: 3, now: 1_700_000_000_000 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  s.scrip = 100_000;
  return s;
}

function staff(s: GameState, room: Room, n: number): void {
  const idle = s.residents.filter((r) => !r.waiting && r.roomId === null);
  for (const r of idle.slice(0, n)) applyCommand(s, content, { type: 'assign', residentId: r.id, roomId: room.id });
}

function untilReady(s: GameState, ...rooms: Room[]): void {
  for (let t = 0; t < 5000 && !rooms.every((r) => r.ready); t++) advance(s, content, 1);
  expect(rooms.every((r) => r.ready)).toBe(true);
}

/** Collect a room until it has nothing left; returns the power gained. */
function drain(s: GameState, id: number): number {
  const before = s.resources.power;
  for (let i = 0; i < 10 && s.rooms.find((r) => r.id === id)?.ready; i++) applyCommand(s, content, { type: 'collect', roomId: id });
  return s.resources.power - before;
}

describe('merging rooms with finished batches', () => {
  it('building beside a ready room pays its batch at the old width', () => {
    const s = calm();
    expect(applyCommand(s, content, { type: 'build', roomType: 'generator', floor: 1, x: S - 3 }).ok).toBe(true);
    expect(applyCommand(s, content, { type: 'build', roomType: 'generator', floor: 1, x: S - 6 }).ok).toBe(true);
    const g = s.rooms.find((r) => r.type === 'generator' && r.floor === 1 && r.segments === 2)!;
    staff(s, g, 4);
    untilReady(s, g);
    s.resources.power = 0;
    const plain = structuredClone(s);
    const expected = drain(plain, g.id);
    expect(applyCommand(s, content, { type: 'build', roomType: 'generator', floor: 1, x: S - 9 }).ok).toBe(true);
    const g3 = s.rooms.find((r) => r.type === 'generator' && r.floor === 1 && r.segments === 3)!;
    const got = s.resources.power + drain(s, g3.id);
    expect(got).toBe(expected);
  });

  it('moving a ready room beside another pays both at their old widths', () => {
    const s = calm();
    expect(applyCommand(s, content, { type: 'build', roomType: 'generator', floor: 1, x: S - 3 }).ok).toBe(true);
    expect(applyCommand(s, content, { type: 'build', roomType: 'generator', floor: 2, x: S - 3 }).ok).toBe(true);
    const g1 = s.rooms.find((r) => r.type === 'generator' && r.floor === 1 && r.x === S - 3)!;
    const g2 = s.rooms.find((r) => r.type === 'generator' && r.floor === 2)!;
    staff(s, g1, 2);
    staff(s, g2, 2);
    untilReady(s, g1, g2);
    s.resources.power = 0;
    const plain = structuredClone(s);
    const expected = drain(plain, g1.id) + drain(plain, g2.id);
    expect(applyCommand(s, content, { type: 'moveRoom', roomId: g2.id, floor: 1, x: S - 6 }).ok).toBe(true);
    const merged = s.rooms.find((r) => r.type === 'generator' && r.floor === 1 && r.segments === 2)!;
    const got = s.resources.power + drain(s, merged.id);
    expect(got).toBe(expected);
  });
});

describe('upgrading a room with a finished batch', () => {
  it('refuses when the batch would not fit, instead of destroying it', () => {
    const s = calm();
    const g = s.rooms.find((r) => r.type === 'generator')!;
    staff(s, g, 2);
    untilReady(s, g);
    s.resources.power = resourceCapacity(s, content, 'power');
    const res = applyCommand(s, content, { type: 'upgrade', roomId: g.id });
    expect(res.ok).toBe(false);
    expect(g.ready).toBe(true);
    expect(g.level).toBe(1);
    // With room for it, the upgrade collects the batch at the old level first.
    s.resources.power = 0;
    expect(applyCommand(s, content, { type: 'upgrade', roomId: g.id }).ok).toBe(true);
    expect(s.resources.power).toBeGreaterThan(0);
    expect(g.level).toBe(2);
  });
});
