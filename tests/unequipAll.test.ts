import { describe, expect, it } from 'vitest';
import { applyCommand, itemCapacity, loadContent, newGame, type GameState } from '../src/sim';

const content = loadContent();

function geared(): GameState {
  const s = newGame(content, { seed: 9, now: 1_700_000_000_000 });
  applyCommand(s, content, { type: 'admitAll' });
  s.items = [];
  for (const r of s.residents) {
    r.weapon = 'scrap_carbine';
    r.outfit = 'lab_smock';
  }
  return s;
}

describe('unequip all', () => {
  it('takes weapons off everyone at home into storage, and leaves outfits on', () => {
    const s = geared();
    const home = s.residents.filter((r) => !r.waiting);
    const res = applyCommand(s, content, { type: 'unequipAll', slot: 'weapon' });
    expect(res.ok).toBe(true);
    expect(home.every((r) => r.weapon === null)).toBe(true);
    expect(home.every((r) => r.outfit === 'lab_smock')).toBe(true);
    expect(s.items.filter((i) => i.defId === 'scrap_carbine')).toHaveLength(home.length);
    expect(applyCommand(s, content, { type: 'unequipAll', slot: 'weapon' }).ok).toBe(false);
  });

  it('skips residents who are away, and only the picked ones when given', () => {
    const s = geared();
    const [a, b, c] = s.residents.filter((r) => !r.waiting);
    a!.expedition = 1;
    applyCommand(s, content, { type: 'unequipAll', slot: 'all', residentIds: [a!.id, b!.id] });
    expect(a!.weapon).toBe('scrap_carbine');
    expect(b!.weapon).toBeNull();
    expect(b!.outfit).toBeNull();
    expect(c!.weapon).toBe('scrap_carbine');
  });

  it('stops when storage is full, and says how many stayed on', () => {
    const s = geared();
    const cap = itemCapacity(s, content);
    while (s.items.length < cap - 2) s.items.push({ id: s.nextId++, defId: 'wrench' });
    const res = applyCommand(s, content, { type: 'unequipAll', slot: 'all' });
    expect(res.ok).toBe(true);
    expect(s.items.length).toBe(cap);
    expect(res.ok && res.detail).toMatch(/still worn/);
  });
});
