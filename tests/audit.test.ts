// Regression tests for issues found in the M6 sim audit.
import { describe, expect, it } from 'vitest';
import { advance, applyCommand, catchUp, livingResidents, loadContent, newGame, type GameState } from '../src/sim';
import { createResident } from '../src/sim/residents';

const content = loadContent();
const T0 = 1_700_000_000_000;

function game(seed = 3): GameState {
  const s = newGame(content, { seed, now: T0 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  return s;
}

describe('audit fixes', () => {
  it('bosses only count when the quest succeeds', () => {
    const s = game();
    s.rooms.push({ id: s.nextId++, type: 'office', floor: 0, x: 13, segments: 1, level: 1, pool: 0, ready: false, powered: true, timer: 0, job: null, banked: 0 });
    const ids = livingResidents(s).slice(0, 3).map((r) => r.id);
    applyCommand(s, content, { type: 'startQuest', questId: 'act1_1', residentIds: ids, medpatch: 0 });
    const q = s.quests[0]!;
    advance(s, content, q.travelTotal + 1);
    // Pretend the boss fell in the boss room, then retreat.
    q.loot.bosses = 1;
    applyCommand(s, content, { type: 'abandonQuest', questId: q.id });
    advance(s, content, q.travelTotal + 1);
    applyCommand(s, content, { type: 'collectQuest', questId: q.id });
    expect(s.stats['bossesDefeated'] ?? 0).toBe(0);
    for (const id of ids) expect(s.residents.find((r) => r.id === id)!.hp).toBeGreaterThan(0);
  });

  it('winding the clock back cannot grant the same offline time twice', () => {
    const s = game();
    catchUp(s, content, T0 - 3 * 86_400_000);
    expect(s.lastRealTime).toBe(T0);
    const summary = catchUp(s, content, T0 + 60_000);
    expect(summary.seconds).toBe(60);
  });

  it('a revived resident does not overfill their old room', () => {
    const s = game();
    const gen = s.rooms.find((r) => r.type === 'generator')!;
    const [a, b, c] = livingResidents(s);
    applyCommand(s, content, { type: 'assign', residentId: a!.id, roomId: gen.id });
    applyCommand(s, content, { type: 'assign', residentId: b!.id, roomId: gen.id });
    a!.dead = true;
    applyCommand(s, content, { type: 'assign', residentId: c!.id, roomId: gen.id });
    s.scrip = 10_000;
    applyCommand(s, content, { type: 'revive', residentId: a!.id });
    expect(s.residents.filter((r) => r.roomId === gen.id && !r.dead).length).toBeLessThanOrEqual(2);
  });

  it('courtship ends when the couple is no longer in the quarters', () => {
    const s = game();
    const q = s.rooms.find((r) => r.type === 'quarters')!;
    const f = livingResidents(s).find((r) => r.sex === 'f')!;
    const m = livingResidents(s).find((r) => r.sex === 'm')!;
    f.roomId = q.id;
    m.roomId = q.id;
    advance(s, content, 1);
    expect(f.courtship).not.toBeNull();
    f.roomId = null;
    m.roomId = null;
    advance(s, content, 400);
    expect(f.pregnancy).toBeNull();
  });

  it('a child keeps its father in the family tree after he is laid to rest', () => {
    const s = game();
    const mother = livingResidents(s).find((r) => r.sex === 'f')!;
    const father = createResident(s, content, { sex: 'm' });
    father.waiting = false;
    s.residents.push(father);
    mother.pregnancy = { fatherId: father.id, dueAt: s.time + 1 };
    s.residents = s.residents.filter((r) => r !== father);
    advance(s, content, 2);
    const child = s.residents.find((r) => r.motherId === mother.id)!;
    expect(child.fatherId).toBe(father.id);
  });

  it('refuses malformed commands', () => {
    const s = game();
    expect(applyCommand(s, content, { type: 'openCrate', tier: 'bogus' as never }).ok).toBe(false);
    expect(applyCommand(s, content, { type: 'claimDaily', day: Number.NaN }).ok).toBe(false);
    expect(applyCommand(s, content, { type: 'questCrit', questId: 1, residentId: 1, quality: Number.NaN }).ok).toBe(false);
    expect(Number.isFinite(s.resources.medpatch)).toBe(true);
  });
});
