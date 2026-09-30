import { describe, expect, it } from 'vitest';
import { advance, applyCommand, bonus, canPlace, deserialize, idleAdults, loadContent, newGame, serialize, threatRating, totalFloors } from '../src/sim';

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

  it('collect keeps banked batches that do not fit, and upgrading pays old batches first', () => {
    const s = game();
    s.research.done.push('batch_bank_1');
    const gen = s.rooms.find((x) => x.type === 'generator')!;
    gen.ready = true;
    gen.banked = 1;
    const cap = 50; // starting power storage
    s.resources.power = cap - 1;
    applyCommand(s, content, { type: 'collect', roomId: gen.id });
    expect(gen.ready).toBe(true); // the second batch had nowhere to go
    expect(gen.banked).toBe(0);
    s.scrip = 100_000;
    s.resources.power = 0;
    applyCommand(s, content, { type: 'upgrade', roomId: gen.id });
    expect(gen.ready).toBe(false);
    expect(s.resources.power).toBeGreaterThan(0);
  });

  it('auto-assign sends only couples to quarters, and nobody to storerooms', () => {
    const s = game();
    applyCommand(s, content, { type: 'autoAssign' });
    const quarters = s.rooms.filter((x) => x.type === 'quarters').map((q) => q.id);
    for (const id of quarters) {
      const here = s.residents.filter((r) => r.roomId === id);
      expect(here.filter((r) => r.sex === 'f').length).toBe(here.filter((r) => r.sex === 'm').length);
    }
    const stores = s.rooms.filter((x) => x.type === 'storeroom').map((q) => q.id);
    expect(s.residents.some((r) => r.roomId !== null && stores.includes(r.roomId))).toBe(false);
  });

  it('threat rating rises with level and falls with defense research', () => {
    const s = game();
    const calm = threatRating(s, content).score;
    for (const r of s.residents) r.level = 30;
    const high = threatRating(s, content);
    expect(high.score).toBeGreaterThan(calm);
    s.research.done.push('hazard_certification', 'fire_drills');
    expect(threatRating(s, content).score).toBeLessThan(high.score);
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
