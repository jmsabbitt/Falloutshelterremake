import { describe, expect, it } from 'vitest';
import { applyCommand, loadContent, newGame, roomDef, type GameState } from '../src/sim';
import { gearFit } from '../src/client/ui/gear';
import type { Game } from '../src/client/game';

const content = loadContent();

function setup(): { s: GameState; game: Game } {
  const s = newGame(content, { seed: 4, now: 1_700_000_000_000 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  return { s, game: { state: s, content } as unknown as Game };
}

describe('gear fit', () => {
  it('ranks an outfit by the stat of the room each resident works in', () => {
    const { s, game } = setup();
    const [a, b] = s.residents.filter((r) => !r.waiting);
    const gen = s.rooms.find((r) => r.type === 'generator')!;
    const water = s.rooms.find((r) => r.type === 'waterworks')!;
    a!.roomId = gen.id;
    b!.roomId = water.id;
    const genStat = roomDef(content, gen).stat!;
    const outfit = Object.values(content.items).find((d) => d.kind === 'outfit' && (d.bonus[genStat] ?? 0) > 0 && !(d.bonus[roomDef(content, water).stat!] ?? 0))!;
    const fa = gearFit(game, a!, outfit, undefined);
    const fb = gearFit(game, b!, outfit, undefined);
    expect(fa.focus).toBe(genStat);
    expect(fa.score).toBeGreaterThan(fb.score);
  });

  it('ranks a weapon higher for someone fighting now or on the door, and low for someone expecting', () => {
    const { s, game } = setup();
    const [a, b, c] = s.residents.filter((r) => !r.waiting);
    const door = s.rooms.find((r) => r.type === 'door')!;
    const canteen = s.rooms.find((r) => r.type === 'canteen')!;
    a!.roomId = door.id;
    b!.roomId = canteen.id;
    c!.roomId = canteen.id;
    c!.pregnancy = { fatherId: a!.id, dueAt: 1e9 };
    const gun = content.items['scrap_carbine']!;
    const door1 = gearFit(game, a!, gun, undefined).score;
    const room1 = gearFit(game, b!, gun, undefined).score;
    expect(door1).toBeGreaterThan(room1);
    expect(gearFit(game, c!, gun, undefined).score).toBeLessThan(room1);
    s.incidents.push({ id: 999, type: 'skitters', roomId: canteen.id } as never);
    expect(gearFit(game, b!, gun, undefined).score).toBeGreaterThan(door1);
  });
});
