// Halcyon Fizz buttons: "Home now" (or "Arrive now") on anything on the road.
// With a bottle it uses one; without, it offers the same for scrip.

import type { Game } from '../game';
import { fizzHeld, fizzScripCost, type FizzTarget } from '../../sim';
import { fmt, h } from './dom';

export function fizzButton(
  game: Game,
  target: FizzTarget,
  id: number,
  opts: { label?: string; done: string; after: (ok: boolean, text: string) => void },
): HTMLElement | null {
  const { state, content } = game;
  const cost = fizzScripCost(state, content, target, id);
  if (!cost) return null;
  const label = opts.label ?? 'Home now';
  const held = fizzHeld(state);
  const run = (pay: 'fizz' | 'scrip') => {
    const res = game.run({ type: 'fizz', target, id, pay });
    opts.after(res.ok, res.ok ? opts.done : res.reason);
  };
  if (held > 0) return h('button', { class: 'primary fizz-btn', title: `Drink a Halcyon Fizz (${held} left)`, onclick: () => run('fizz') }, `🥤 ${label}`);
  return h('button', { class: 'fizz-btn', disabled: state.scrip < cost, title: 'No Halcyon Fizz left: pay scrip instead', onclick: () => run('scrip') }, `${label} · ${fmt(cost)} scrip`);
}
