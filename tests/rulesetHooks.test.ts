// M9: the ruleset hooks wired into economy, traits and weather.
import { describe, expect, it } from 'vitest';
import { loadContent, newGame, resourceCapacity, storageCapacity } from '../src/sim';
import { addScrip } from '../src/sim/economy';
import { currentShift } from '../src/sim/systems/traits';
import { nextWeather } from '../src/sim/systems/weather';

const content = loadContent();
const game = (rules: string[]) => newGame(content, { seed: 9, now: 0, rules });

describe('ruleset hooks', () => {
  it('Famine shrinks food storage only', () => {
    expect(resourceCapacity(game(['famine']), content, 'food')).toBeLessThan(resourceCapacity(game([]), content, 'food'));
    expect(resourceCapacity(game(['famine']), content, 'water')).toBe(resourceCapacity(game([]), content, 'water'));
  });
  it('Lean Times halves scrip income but not spending', () => {
    const s = game(['lean_times']);
    s.scrip = 1000;
    addScrip(s, content, 100);
    expect(s.scrip).toBe(1050);
    addScrip(s, content, -200);
    expect(s.scrip).toBe(850);
  });
  it('Endless Night keeps the night shift', () => {
    const s = game(['endless_night']);
    for (let h = 0; h < 24; h++) {
      s.time = h * 3600;
      expect(currentShift(s, content)).toBe('night');
    }
  });
  it('Glass Sky never clears', () => {
    const s = game(['glass_sky']);
    for (let n = 0; n < 5; n++) expect(nextWeather(s, content, 'clear', n).kind).toBe('taintstorm');
  });
  it('Skeleton Crew caps living space', () => {
    const s = game(['skeleton_crew']);
    s.rooms.push(...Array.from({ length: 12 }, (_, i) => ({ ...s.rooms.find((r) => r.type === 'quarters' || r.type === 'living')!, id: 900 + i })));
    expect(storageCapacity(s, content, 'population')).toBeLessThanOrEqual(60);
  });
});
