import { describe, expect, it } from 'vitest';
import { applyCommand, loadContent, newGame, roomDef, type GameState } from '../src/sim';

const content = loadContent();

function home(): GameState {
  const s = newGame(content, { seed: 12, now: 1_700_000_000_000 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.items = [];
  return s;
}

describe('auto-equip', () => {
  it('gives each outfit to someone whose room uses its stat', () => {
    const s = home();
    const gen = s.rooms.find((r) => r.type === 'generator')!;
    const stat = roomDef(content, gen).stat!;
    const [a, b] = s.residents.filter((r) => !r.waiting);
    a!.roomId = gen.id;
    b!.roomId = null;
    const outfit = Object.values(content.items).find((d) => d.kind === 'outfit' && (d.bonus[stat] ?? 0) > 0)!;
    s.items.push({ id: s.nextId++, defId: outfit.id });
    b!.outfit = outfit.id;
    for (const r of s.residents) if (r !== a && r !== b) r.outfit = null;
    applyCommand(s, content, { type: 'autoEquip', slot: 'outfit' });
    // Two of them: the generator worker gets one; the other goes to whoever's next.
    expect(a!.outfit).toBe(outfit.id);
    expect(s.residents.filter((r) => r.outfit === outfit.id)).toHaveLength(2);
    expect(s.items.filter((i) => i.defId === outfit.id)).toHaveLength(0);
  });

  it('puts the best gun on the door and spreads the rest across rooms', () => {
    const s = home();
    const door = s.rooms.find((r) => r.type === 'door')!;
    const canteen = s.rooms.find((r) => r.type === 'canteen')!;
    const water = s.rooms.find((r) => r.type === 'waterworks')!;
    const [a, b, c, d] = s.residents.filter((r) => !r.waiting);
    for (const r of s.residents) r.weapon = null;
    a!.roomId = door.id;
    b!.roomId = canteen.id;
    c!.roomId = canteen.id;
    d!.roomId = water.id;
    for (const id of ['sunbeam_rifle', 'scrap_carbine', 'scrap_carbine']) s.items.push({ id: s.nextId++, defId: id });
    const res = applyCommand(s, content, { type: 'autoEquip', slot: 'weapon', residentIds: [a!.id, b!.id, c!.id, d!.id] });
    expect(res.ok).toBe(true);
    expect(a!.weapon).toBe('sunbeam_rifle');
    // One carbine each to the canteen and the water works, not both into the canteen.
    expect([b!.weapon, c!.weapon].filter(Boolean)).toHaveLength(1);
    expect(d!.weapon).toBe('scrap_carbine');
  });

  it('leaves residents who are away alone, keeps item counts, and fails with no gear', () => {
    const s = home();
    const [a, b] = s.residents.filter((r) => !r.waiting);
    for (const r of s.residents) {
      r.weapon = null;
      r.outfit = null;
    }
    expect(applyCommand(s, content, { type: 'autoEquip', slot: 'all' }).ok).toBe(false);
    a!.weapon = 'wrench';
    a!.expedition = 99;
    b!.weapon = 'scrap_carbine';
    applyCommand(s, content, { type: 'autoEquip', slot: 'weapon' });
    expect(a!.weapon).toBe('wrench');
    const carbines = s.residents.filter((r) => r.weapon === 'scrap_carbine').length + s.items.filter((i) => i.defId === 'scrap_carbine').length;
    expect(carbines).toBe(1);
  });
});
