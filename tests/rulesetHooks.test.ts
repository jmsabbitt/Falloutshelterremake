// M9: the ruleset hooks wired into economy, traits and weather.
import { describe, expect, it } from 'vitest';
import { advance, applyCommand, loadContent, newGame, recipeFor, resourceCapacity, storageCapacity } from '../src/sim';
import { createResident } from '../src/sim/residents';
import { grantItem, sell } from '../src/sim/systems/items';
import { startRaid } from '../src/sim/systems/incidents';
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
  it('Lean Times leaves sales and refunds alone: they are not income', () => {
    const s = game(['lean_times']);
    s.nextIncidentAt = 1e12;
    s.nextWandererAt = 1e12;
    s.scrip = 1000;
    addScrip(s, content, 100, { income: false });
    expect(s.scrip).toBe(1100);
    // Cancelling a craft gives back exactly what it cost.
    const ws = { ...s.rooms[0]!, id: s.nextId++, type: 'weaponshop', floor: 5, x: 0, job: null };
    s.rooms.push(ws);
    const w = createResident(s, content);
    w.waiting = false;
    w.roomId = ws.id;
    s.residents.push(w);
    const recipe = recipeFor(content, 'scrap_carbine')!;
    for (const [id, n] of Object.entries(recipe.salvage)) s.salvage[id] = n;
    expect(applyCommand(s, content, { type: 'craft', roomId: ws.id, defId: 'scrap_carbine' }).ok).toBe(true);
    expect(s.scrip).toBe(1100 - recipe.scrip);
    expect(applyCommand(s, content, { type: 'cancelCraft', roomId: ws.id }).ok).toBe(true);
    expect(s.scrip).toBe(1100);
    // Selling pays the full price.
    grantItem(s, content, 'scrap_carbine');
    const value = sell(s, content, s.items[s.items.length - 1]!.id)!;
    expect(value).toBeGreaterThan(0);
    expect(s.scrip).toBe(1100 + value);
  });
  it('Lean Times gives back everything raiders stole when they are beaten', () => {
    // The same raid with and without Lean Times: only the find differs.
    const run = (rules: string[]) => {
      const s = newGame(content, { seed: 3, now: 1_700_000_000_000, rules });
      applyCommand(s, content, { type: 'admitAll' });
      s.scrip = 1000;
      s.nextIncidentAt = 1e12;
      s.nextWandererAt = 1e12;
      for (const r of s.residents) r.roomId = null; // nobody defends at first
      const inc = startRaid(s, content)!;
      inc.warning = 0;
      inc.doorHp = 0;
      advance(s, content, 8);
      const stolen = Math.round(inc.stolen);
      const low = s.scrip;
      inc.hp = 0.01;
      s.residents.find((r) => !r.waiting && !r.dead)!.roomId = inc.roomId;
      advance(s, content, 1);
      expect(s.incidents).toHaveLength(0);
      return { stolen, back: s.scrip - low };
    };
    const normal = run([]);
    const lean = run(['lean_times']);
    expect(lean.stolen).toBeGreaterThan(0);
    const findNormal = normal.back - normal.stolen;
    expect(lean.back).toBe(lean.stolen + findNormal / 2);
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
