import { describe, expect, it } from 'vitest';
import { advance, applyCommand, bonus, canPlace, deserialize, idleAdults, loadContent, newGame, serialize, totalFloors } from '../src/sim';

const content = loadContent();
const T0 = 1_700_000_000_000;

function game() {
  const s = newGame(content, { seed: 7, now: T0 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  return s;
}

describe('M6 core', () => {
  it('auto-assign fills free jobs with the best stat', () => {
    const s = game();
    expect(idleAdults(s).length).toBeGreaterThan(0);
    const r = applyCommand(s, content, { type: 'autoAssign' });
    expect(r.ok).toBe(true);
    const gen = s.rooms.find((x) => x.type === 'generator')!;
    const crew = s.residents.filter((x) => x.roomId === gen.id);
    expect(crew.length).toBeGreaterThan(0);
    // Whoever got the generator is at least as strong as anyone still idle.
    for (const idle of idleAdults(s)) expect(Math.max(...crew.map((c) => c.stats.brawn))).toBeGreaterThanOrEqual(idle.stats.brawn);
  });

  it('research bonuses sum through bonus()', () => {
    const s = game();
    expect(bonus(s, content, 'batchBank')).toBe(0);
    s.research.done.push('batch_bank_1');
    expect(bonus(s, content, 'batchBank')).toBe(1);
  });

  it('Holding Tanks bank an extra batch and collect pays for both', () => {
    const s = game();
    applyCommand(s, content, { type: 'autoAssign' });
    const gen = s.rooms.find((x) => x.type === 'generator')!;
    s.resources.power = 0;
    for (let i = 0; i < 2000 && !gen.ready; i++) advance(s, content, 1);
    expect(gen.ready).toBe(true);
    const pool = gen.pool;
    advance(s, content, 30);
    expect(gen.pool).toBe(pool); // no tanks: the room waits
    s.research.done.push('batch_bank_1');
    for (let i = 0; i < 2000 && gen.banked === 0; i++) advance(s, content, 1);
    expect(gen.banked).toBe(1);
    const before = s.resources.power;
    applyCommand(s, content, { type: 'collect', roomId: gen.id });
    expect(s.resources.power - before).toBeGreaterThan(0);
    expect(gen.banked).toBe(0);
  });

  it('the Deep is closed until excavated', () => {
    const s = game();
    expect(totalFloors(s, content)).toBe(content.balance.grid.floors);
    expect(canPlace(s, content, 'quarters', content.balance.grid.floors, 7).ok).toBe(false);
  });

  it('migrates a v5 save', () => {
    const s = newGame(content, { seed: 2, now: T0 });
    const file = JSON.parse(serialize(s));
    file.version = 5;
    delete file.state.research;
    delete file.state.deep;
    for (const r of file.state.residents) {
      delete r.traits;
      delete r.mastery;
    }
    for (const r of file.state.rooms) delete r.banked;
    const back = deserialize(JSON.stringify(file));
    expect(back.research.done).toEqual([]);
    expect(back.deep.strata).toBe(0);
    expect(back.residents.every((r) => Array.isArray(r.traits))).toBe(true);
    expect(back.rooms.every((r) => r.banked === 0)).toBe(true);
  });
});
