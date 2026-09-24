// Dev console helpers for M6 (window.homestead.research and .deep), for
// browser testing. They go through the same sim functions the game uses.

import { advance, canExcavate, deepContent, researchContent } from '../sim';
import { discover } from '../sim/systems/deep';
import { doResearch } from '../sim/systems/research';
import type { Game } from './game';

export function researchConsole(game: Game) {
  return {
    /** Add research points. */
    points: (n = 1000) => {
      game.state.research.points += n;
      game.flush();
      return Math.floor(game.state.research.points);
    },
    /** Research every node (in an order that satisfies requirements), free of charge. */
    all: () => {
      const { state, content } = game;
      const nodes = researchContent(content).nodes;
      let progress = true;
      while (progress) {
        progress = false;
        for (const n of nodes) {
          if (state.research.done.includes(n.id) || !n.requires.every((id) => state.research.done.includes(id))) continue;
          state.research.points += n.cost;
          if (doResearch(state, content, n.id) === null) progress = true;
        }
      }
      game.flush();
      return state.research.done.length;
    },
  };
}

export function deepConsole(game: Game) {
  return {
    /** Finish the running dig now (or start and finish the next one if it can be dug). */
    dig: () => {
      const { state, content } = game;
      if (!state.deep.dig) {
        const why = canExcavate(state, content);
        if (why) return why;
        game.run({ type: 'excavate' });
      }
      if (state.deep.dig) state.deep.dig.remaining = 1e-6;
      advance(state, content, 0.1);
      game.flush();
      return `strata ${state.deep.strata}`;
    },
    /** Set the number of excavated strata (0..4). */
    open: (n = 1) => {
      const { state, content } = game;
      state.deep.strata = Math.max(0, Math.min(deepContent(content).strata.length, Math.floor(n)));
      state.deep.dig = null;
      game.layoutVersion++;
      game.flush();
      return `strata ${state.deep.strata}`;
    },
    /** Find a discovery (by id, or the next unfound one in the open strata). */
    discover: (id?: string) => {
      const { state, content } = game;
      const pick =
        id ??
        Object.values(deepContent(content).discoveries).find((d) => d.stratum <= Math.max(1, state.deep.strata) && !state.deep.discoveries.includes(d.id))?.id;
      const ok = pick ? discover(state, content, pick) : false;
      game.flush();
      return ok ? pick : 'nothing to find';
    },
  };
}
