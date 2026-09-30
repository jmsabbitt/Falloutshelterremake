// Design changes from the playtest's open questions, each one a separate commit
// so it can be kept or dropped on its own.
import { describe, expect, it } from 'vitest';
import { advance, applyCommand, loadContent, newGame } from '../src/sim';
import { startIncident } from '../src/sim/systems/incidents';

const content = loadContent();

describe('ending achievements', () => {
  it('are hidden until earned, so Goals does not spoil how the story ends', () => {
    for (const id of ['ending_renewal', 'ending_eviction', 'ending_holdover', 'ending_neighbours']) {
      expect(content.achievements.find((a) => a.id === id)?.hidden, id).toBe(true);
    }
    // "Reach an ending" names no ending, so it stays visible as a goal.
    expect(content.achievements.find((a) => a.id === 'ending_any')?.hidden).toBeFalsy();
  });
});

describe('incidents before the first Clinic', () => {
  function burning(withClinic: boolean) {
    const s = newGame(content, { seed: 9, now: 0 });
    applyCommand(s, content, { type: 'admitAll' });
    s.nextIncidentAt = 1e12;
    s.nextWandererAt = 1e12;
    if (withClinic) {
      s.unlockedRooms.push('clinic');
      s.scrip = 1e5;
      const slot = [...Array(40).keys()].find((x) => applyCommand(s, content, { type: 'build', roomType: 'clinic', floor: 2, x }).ok);
      expect(slot).toBeDefined();
    }
    const gen = s.rooms.find((r) => r.type === 'generator')!;
    const crew = s.residents.filter((r) => !r.waiting).slice(0, 2);
    for (const r of crew) {
      r.roomId = gen.id;
      r.hp = 3;
    }
    startIncident(s, content, 'fire', gen);
    advance(s, content, 20);
    return crew;
  }

  it('wound the crew but never kill them', () => {
    for (const r of burning(false)) {
      expect(r.dead).toBe(false);
      expect(r.hp).toBeGreaterThanOrEqual(1);
    }
  });

  it('can kill once a Clinic stands', () => {
    expect(burning(true).some((r) => r.dead)).toBe(true);
  });
});
