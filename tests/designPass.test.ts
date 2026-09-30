// Design changes from the playtest's open questions, each one a separate commit
// so it can be kept or dropped on its own.
import { describe, expect, it } from 'vitest';
import { advance, applyCommand, crateOrderPrice, loadContent, newGame, type GameState } from '../src/sim';
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

describe('the Halcyon Catalogue', () => {
  const o = content.balance.crates.order;
  function big(): GameState {
    const s = newGame(content, { seed: 3, now: 0 });
    s.peakPopulation = o.unlockPop;
    s.scrip = 100_000;
    return s;
  }

  it('stays shut until the homestead reaches its population', () => {
    const s = big();
    s.peakPopulation = o.unlockPop - 1;
    expect(applyCommand(s, content, { type: 'orderCrate' }).ok).toBe(false);
    expect(s.scrip).toBe(100_000);
  });

  it('sells a Supply Crate for scrip, and each order raises the next price', () => {
    const s = big();
    const first = crateOrderPrice(s, content);
    expect(first).toBe(o.baseScrip);
    expect(applyCommand(s, content, { type: 'orderCrate' }).ok).toBe(true);
    expect(s.stats['cratesFrom.order']).toBe(1);
    expect(s.scrip).toBe(100_000 - first);
    const second = crateOrderPrice(s, content);
    expect(second).toBeGreaterThan(first);
    applyCommand(s, content, { type: 'orderCrate' });
    expect(crateOrderPrice(s, content)).toBeGreaterThan(second);
  });

  it('comes back down in price as game time passes', () => {
    const s = big();
    applyCommand(s, content, { type: 'orderCrate' });
    applyCommand(s, content, { type: 'orderCrate' });
    s.time += o.decayHours * 3600;
    expect(crateOrderPrice(s, content)).toBe(Math.round((o.baseScrip * o.growth) / 50) * 50);
    s.time += o.decayHours * 3600;
    expect(crateOrderPrice(s, content)).toBe(o.baseScrip);
  });

  it('refuses when the scrip runs short', () => {
    const s = big();
    s.scrip = o.baseScrip - 1;
    expect(applyCommand(s, content, { type: 'orderCrate' }).ok).toBe(false);
    expect(s.scrip).toBe(o.baseScrip - 1);
  });
});
