// Halcyon Fizz: Halcyon's own soda, the homestead's hurry-up. One bottle
// brings an explorer, a caravan or a quest party to the end of the road at
// once; without a bottle the same costs scrip by the minute of road left.
// Bottles come from Supply Crates, the daily streak and one at the start.

import type { Content } from '../content';
import { addScrip } from '../economy';
import { bump } from '../residents';
import type { GameState } from '../types';
import { expeditionSecondsLeft, rushExpeditionHome } from './exploration';
import { caravanSecondsLeft, rushCaravanHome } from './factions';
import { rushQuestTravel } from './quests';

export type FizzTarget = 'explorer' | 'caravan' | 'quest';
export type FizzPay = 'fizz' | 'scrip';

/** Bottles of Halcyon Fizz held. */
export function fizzHeld(state: GameState): number {
  return state.fizz ?? 0;
}

/** Add bottles, up to the carry limit; returns how many didn't fit. */
export function addFizz(state: GameState, content: Content, n: number): number {
  const max = content.balance.fizz.maxHeld;
  const kept = Math.max(0, Math.min(n, max - fizzHeld(state)));
  state.fizz = fizzHeld(state) + kept;
  if (kept > 0) bump(state, 'fizzEarned', kept);
  return n - kept;
}

/** Scrip instead of a bottle, for this many seconds of road left. */
export function fizzScripFor(content: Content, seconds: number): number {
  const f = content.balance.fizz;
  return Math.max(f.minScrip, Math.ceil((Math.max(0, seconds) / 60) * f.scripPerMinute));
}

/** Seconds of road left for a target, or null when there is nothing to hurry. */
export function fizzSecondsLeft(state: GameState, content: Content, target: FizzTarget, id: number): number | null {
  if (target === 'explorer') {
    const e = state.expeditions.find((x) => x.id === id);
    return e && (e.status === 'exploring' || e.status === 'returning') ? expeditionSecondsLeft(content, e) : null;
  }
  if (target === 'caravan') {
    const c = state.caravans.find((x) => x.id === id);
    return c && c.status !== 'returned' ? caravanSecondsLeft(c) : null;
  }
  const q = state.quests.find((x) => x.id === id);
  return q && (q.status === 'travelling' || q.status === 'returning') ? q.travelRemaining : null;
}

/** Scrip to hurry a target without a bottle (0 when there is nothing to hurry). */
export function fizzScripCost(state: GameState, content: Content, target: FizzTarget, id: number): number {
  const left = fizzSecondsLeft(state, content, target, id);
  return left === null ? 0 : fizzScripFor(content, left);
}

/** Hurry an explorer, caravan or quest party to the end of the road, paying a bottle or scrip. */
export function useFizz(state: GameState, content: Content, target: FizzTarget, id: number, pay: FizzPay): string | null {
  const left = fizzSecondsLeft(state, content, target, id);
  if (left === null) return target === 'explorer' ? 'only an explorer who is out or on the way home' : target === 'caravan' ? 'the caravan is already home' : 'the party is not on the road';
  const cost = fizzScripFor(content, left);
  if (pay === 'fizz' && fizzHeld(state) < 1) return 'no Halcyon Fizz left';
  if (pay === 'scrip' && state.scrip < cost) return 'not enough scrip';
  let err: string | null;
  if (target === 'explorer') err = rushExpeditionHome(state, content, state.expeditions.find((x) => x.id === id)!);
  else if (target === 'caravan') err = rushCaravanHome(state, content, state.caravans.find((x) => x.id === id)!);
  else err = rushQuestTravel(state, content, state.quests.find((x) => x.id === id)!);
  if (err) return err;
  if (pay === 'fizz') state.fizz = fizzHeld(state) - 1;
  else addScrip(state, content, -cost);
  bump(state, pay === 'fizz' ? 'fizzDrunk' : 'fizzBought');
  bump(state, `fizz.${target}`);
  return null;
}
