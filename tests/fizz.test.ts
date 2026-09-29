import { describe, expect, it } from 'vitest';
import { advance, applyCommand, deserialize, fizzHeld, fizzScripCost, loadContent, newGame, serialize, type GameState } from '../src/sim';
import { claimDaily } from '../src/sim/systems/crates';
import { addFizz } from '../src/sim/systems/fizz';

const content = loadContent();
const T0 = 1_700_000_000_000;
const HOUR = 3600;

function calm(seed = 21): GameState {
  const s = newGame(content, { seed, now: T0 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  s.scrip = 50_000;
  s.resources.medpatch = 100;
  s.resources.purge = 100;
  return s;
}

/** Send someone out and let them explore for `hours`. */
function out(s: GameState, hours: number): number {
  const r = s.residents.find((x) => !x.waiting && !x.dead)!;
  const res = applyCommand(s, content, { type: 'explore', residentId: r.id, regionId: 'dustbowl', medpatch: 10, purge: 10 });
  expect(res.ok).toBe(true);
  advance(s, content, hours * HOUR);
  return s.expeditions[0]!.id;
}

describe('Halcyon Fizz', () => {
  it('a new homestead starts with a bottle', () => {
    expect(fizzHeld(calm())).toBe(content.balance.fizz.start);
  });

  it('brings a returning explorer home at once for a bottle', () => {
    const s = calm();
    const id = out(s, 2);
    applyCommand(s, content, { type: 'recall', expeditionId: id });
    expect(s.expeditions[0]!.status).toBe('returning');
    const before = fizzHeld(s);
    const res = applyCommand(s, content, { type: 'fizz', target: 'explorer', id: id, pay: 'fizz' });
    expect(res.ok).toBe(true);
    expect(s.expeditions[0]!.status).toBe('returned');
    expect(fizzHeld(s)).toBe(before - 1);
    expect(applyCommand(s, content, { type: 'collectExpedition', expeditionId: id }).ok).toBe(true);
  });

  it('turns an explorer who is still out round and home in one go', () => {
    const s = calm();
    const id = out(s, 1);
    expect(applyCommand(s, content, { type: 'fizz', target: 'explorer', id: id, pay: 'fizz' }).ok).toBe(true);
    expect(s.expeditions[0]!.status).toBe('returned');
  });

  it('costs scrip by the minute left when there is no bottle, and refuses without either', () => {
    const s = calm();
    s.fizz = 0;
    const id = out(s, 4);
    applyCommand(s, content, { type: 'recall', expeditionId: id });
    const e = s.expeditions[0]!;
    const cost = fizzScripCost(s, content, 'explorer', e.id);
    expect(cost).toBe(Math.max(content.balance.fizz.minScrip, Math.ceil((e.returnRemaining / 60) * content.balance.fizz.scripPerMinute)));
    expect(applyCommand(s, content, { type: 'fizz', target: 'explorer', id: id, pay: 'fizz' }).ok).toBe(false);
    const scrip = s.scrip;
    expect(applyCommand(s, content, { type: 'fizz', target: 'explorer', id: id, pay: 'scrip' }).ok).toBe(true);
    expect(s.scrip).toBe(scrip - cost);
    expect(e.status).toBe('returned');
  });

  it('can only be carried up to the limit, and comes with every few days of the daily streak', () => {
    const s = calm();
    s.fizz = 0;
    expect(addFizz(s, content, content.balance.fizz.maxHeld + 3)).toBe(3);
    expect(fizzHeld(s)).toBe(content.balance.fizz.maxHeld);
    s.fizz = 0;
    for (let d = 1; d <= content.balance.fizz.dailyEvery; d++) claimDaily(s, content, d);
    expect(fizzHeld(s)).toBe(1);
  });

  it('older saves without a count load with none', () => {
    const s = calm();
    delete (s as { fizz?: number }).fizz;
    const back = deserialize(serialize(s, T0));
    expect(fizzHeld(back)).toBe(0);
  });
});

describe('Settling In', () => {
  it('a legendary crate on the third day played, in a row or not', () => {
    const s = calm();
    s.crates.legendary = 0;
    const claim = (day: number) => {
      applyCommand(s, content, { type: 'claimDaily', day });
      advance(s, content, 1);
    };
    claim(100);
    claim(104);
    expect(s.crates.legendary).toBe(0);
    claim(111);
    expect(s.achievements['days_3']).toBeDefined();
    expect(s.crates.legendary).toBe(1);
    claim(112);
    expect(s.crates.legendary).toBe(1);
  });
});
