// Dev console helpers for prestige (window.homestead.prestige), for browser
// testing. charter() uses the same sim-safe edits as tests/prestige.test.ts;
// found() goes through Game.found, like the Found flow does.

import { canFound, charterFor, questContent } from '../sim';
import { createResident } from '../sim/residents';
import type { Game } from './game';

export function prestigeConsole(game: Game) {
  return {
    /** Make this homestead charter-ready: 100 admitted residents, Act 1 done, contracts for later cycles. */
    charter: () => {
      const { state, content } = game;
      const living = () => state.residents.filter((r) => !r.dead && !r.waiting).length;
      for (const r of state.residents) if (r.waiting) r.waiting = false;
      while (living() < 100) {
        const r = createResident(state, content);
        r.waiting = false;
        state.residents.push(r);
      }
      state.peakPopulation = Math.max(state.peakPopulation, living());
      const c = charterFor(state, content);
      const act1 = questContent(content).quests.map((q) => q.id).filter((id) => id.startsWith('act1'));
      for (const id of [...act1, ...(c.quests ?? [])]) {
        if (state.questsDone.includes(id)) continue;
        state.questsDone.push(id);
        state.stats['storyQuestsCompleted'] = (state.stats['storyQuestsCompleted'] ?? 0) + 1;
      }
      if (c.contracts) {
        const base = state.legacy.statsAtFounding['contractsCompleted'] ?? 0;
        state.stats['contractsCompleted'] = Math.max(state.stats['contractsCompleted'] ?? 0, base + c.contracts);
      }
      game.flush();
      return `${living()} residents, charter for homestead ${state.legacy.cycle}`;
    },
    /** Add unspent Legacy points. */
    legacy: (n = 50) => {
      game.state.legacy.points += n;
      game.flush();
      return game.state.legacy.points;
    },
    /** Found a new homestead with the top five residents by level and no heirlooms. */
    found: (siteId = 'plot7') => {
      const { state } = game;
      const party = state.residents
        .filter((r) => canFound(state, r) === null)
        .sort((a, b) => b.level - a.level || a.id - b.id)
        .slice(0, 5)
        .map((r) => r.id);
      const res = game.found({ siteId, partyIds: party, heirloomIds: [] });
      return res.ok ? { ok: true, legacy: res.legacy, homestead: game.state.homesteadNumber } : res;
    },
  };
}
