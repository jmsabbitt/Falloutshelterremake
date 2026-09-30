// Fixes from the new-player playtest in a real browser: what the game tells the
// player when storage is full, who the Send dialog offers first, and names that
// must not repeat.
import { describe, expect, it } from 'vitest';
import { applyCommand, explorerCandidates, loadContent, newGame, questContent, resourceCapacity, type CrateCard, type GameState } from '../src/sim';
import { openCrate } from '../src/sim/systems/crates';
import { batchOutput, collectRoom } from '../src/sim/systems/production';

const content = loadContent();

function game(seed = 4): GameState {
  const s = newGame(content, { seed, now: 0 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  return s;
}

/** Open standard crates until one holds power, food or water; `fill` sets how much space is left first. */
function resourceCard(fill: (s: GameState) => void): { s: GameState; card: Extract<CrateCard, { kind: 'resource' }>; space: number } {
  for (let seed = 1; seed < 400; seed++) {
    const s = game(seed);
    fill(s);
    const space = Object.fromEntries((['power', 'food', 'water'] as const).map((k) => [k, resourceCapacity(s, content, k) - s.resources[k]]));
    const cards = openCrate(s, content, 'standard');
    const card = cards.find((c): c is Extract<CrateCard, { kind: 'resource' }> => c.kind === 'resource' && ['power', 'food', 'water'].includes(c.resource));
    if (card) return { s, card, space: space[card.resource]! };
  }
  throw new Error('no crate held a resource');
}

describe('crate cards when storage is full', () => {
  it('say how much was kept, so the headline never counts what was sold', () => {
    const { card } = resourceCard((s) => {
      for (const k of ['power', 'food', 'water'] as const) s.resources[k] = resourceCapacity(s, content, k);
    });
    expect(card.refund).toBeGreaterThan(0);
    expect(card.kept).toBe(0);
  });

  it('keep what fits and sell only the rest', () => {
    const { card, space } = resourceCard((s) => {
      for (const k of ['power', 'food', 'water'] as const) s.resources[k] = resourceCapacity(s, content, k) - 5;
    });
    expect(space).toBe(5);
    expect(card.kept).toBe(5);
    expect(card.refund).toBe(Math.round((card.amount - 5) * content.balance.crates.overflowScripPerUnit));
  });

  it('leave kept off when everything fitted', () => {
    const { card } = resourceCard((s) => {
      for (const k of ['power', 'food', 'water'] as const) s.resources[k] = 0;
    });
    expect(card.refund).toBeUndefined();
    expect(card.kept).toBeUndefined();
  });
});

describe('collecting into full storage', () => {
  it('reports what spilled, so the view can say "storage full"', () => {
    const s = game();
    const gen = s.rooms.find((r) => r.type === 'generator')!;
    gen.ready = true;
    s.resources.power = resourceCapacity(s, content, 'power');
    s.events.length = 0;
    collectRoom(s, content, gen);
    const ev = s.events.find((e) => e.type === 'collected');
    expect(ev && ev.type === 'collected' && ev.spilled).toBeCloseTo(batchOutput(content, gen), 5);
  });

  it('reports nothing spilled when the batch fits', () => {
    const s = game();
    const gen = s.rooms.find((r) => r.type === 'generator')!;
    gen.ready = true;
    s.resources.power = 0;
    s.events.length = 0;
    collectRoom(s, content, gen);
    const ev = s.events.find((e) => e.type === 'collected');
    expect(ev && ev.type === 'collected' && ev.spilled).toBeUndefined();
  });
});

describe('the Send explorer dialog', () => {
  it('offers someone idle before a worker when they are otherwise equal', () => {
    const s = game();
    const room = s.rooms.find((r) => r.type === 'generator')!;
    const adults = s.residents.filter((r) => !r.waiting);
    for (const r of adults) {
      r.roomId = room.id;
      r.weapon = null;
      r.hp = r.maxHp;
      r.level = 1;
    }
    // The newcomer has the highest id, so the old id tie-break would put them last.
    const newcomer = adults[adults.length - 1]!;
    newcomer.roomId = null;
    expect(explorerCandidates(s, content)[0]!.id).toBe(newcomer.id);
  });

  it('still puts a better-armed worker ahead of an unarmed idler', () => {
    const s = game();
    const room = s.rooms.find((r) => r.type === 'generator')!;
    const [idler, armed] = s.residents.filter((r) => !r.waiting);
    idler!.roomId = null;
    armed!.roomId = room.id;
    armed!.weapon = Object.keys(content.weapons)[0]!;
    expect(explorerCandidates(s, content)[0]!.id).toBe(armed!.id);
  });
});

describe('names', () => {
  it('every achievement has its own name', () => {
    const seen = new Map<string, string>();
    for (const a of content.achievements) {
      expect(seen.get(a.name), `${a.id} shares "${a.name}"`).toBeUndefined();
      seen.set(a.name, a.id);
    }
  });

  it('only questline achievements share a story quest\'s name (the Charter asks for a quest by name)', () => {
    const titles = new Set(questContent(content).quests.filter((q) => q.line).map((q) => q.title));
    expect(titles.size).toBeGreaterThan(10);
    const clash = content.achievements.filter((a) => titles.has(a.name) && !a.stat.startsWith('questline.')).map((a) => a.id);
    expect(clash).toEqual([]);
  });
});
