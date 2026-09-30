// Scrip income: room collections pay more per batch as rooms level up, and
// finds (crates, quests, expeditions) scale with balance.scripIncome.
import { describe, expect, it } from 'vitest';
import { applyCommand, loadContent, newGame, scripIncome, type GameState } from '../src/sim';
import { collectRoom } from '../src/sim/systems/production';

const content = loadContent();

function game(): GameState {
  const s = newGame(content, { seed: 4, now: 0 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  return s;
}

describe('scrip income', () => {
  it('pays a base per batch that grows with the room level', () => {
    const bs = content.balance.bonusScrip;
    const s = game();
    const gen = s.rooms.find((r) => r.type === 'generator')!;
    s.residents.find((r) => !r.waiting)!.roomId = gen.id;
    // No bonus rolls, so only the base is paid.
    const saved = bs.maxChance;
    bs.maxChance = 0;
    try {
      for (const level of [1, 3]) {
        gen.level = level;
        gen.ready = true;
        s.resources.power = 0;
        const before = s.scrip;
        collectRoom(s, content, gen);
        expect(s.scrip - before).toBe(Math.round(bs.basePerSegment * (1 + bs.perLevel * (level - 1)) * gen.segments));
      }
    } finally {
      bs.maxChance = saved;
    }
  });

  it('scales finds by the income multiplier', () => {
    expect(content.balance.scripIncome).toBeGreaterThan(1);
    expect(scripIncome(content, 100)).toBe(Math.round(100 * content.balance.scripIncome));
  });
});
