// Dev console helpers for Act 4 and the endings (window.homestead.ending):
// jump to Act 4, meet the true ending's conditions, win the finale, and play
// or replay each ending. They set state directly where the sim has no command
// for it (as the other dev consoles do), then flush so the UI sees the events.

import { advance, endingOptions, endingsContent, epilogue, questContent, recruitLegend } from '../sim';
import { openFinale } from '../sim/systems/endings';
import { createResident } from '../sim/residents';
import type { Game } from './game';
import { questConsole } from './questDev';
import type { EndingsUI } from './ui/endings';

export function endingConsole(game: Game, ui: EndingsUI) {
  const settle = () => {
    advance(game.state, game.content, 0.05);
    game.flush();
  };
  const qc = () => questContent(game.content);
  const line = (id: string) => qc().questlines.find((l) => l.id === id)?.quests ?? [];

  const api = {
    /** Jump to the start of Act 4: Homestead Four, Acts 1-3 done, population 150, an office and a strong party. */
    act4: (level = 46) => {
      const s = game.state;
      s.legacy.cycle = Math.max(4, s.legacy.cycle);
      for (const id of [...line('act1'), ...line('act2'), ...line('act3')]) if (!s.questsDone.includes(id)) s.questsDone.push(id);
      while (s.residents.filter((r) => !r.dead).length < 12) {
        const r = createResident(s, game.content);
        r.waiting = false;
        s.residents.push(r);
      }
      s.peakPopulation = Math.max(s.peakPopulation, 150);
      const office = questConsole(game).office();
      office.level = 3;
      for (const r of s.residents.filter((x) => !x.dead && !x.waiting).slice(0, 3)) {
        r.level = level;
        r.maxHp = r.hp = 100 + 11 * level;
        r.weapon = 'coilgun';
      }
      s.resources.medpatch = Math.max(s.resources.medpatch, 10);
      settle();
      return 'Act 4 is open: Quests → Act 4: Rent Day';
    },
    /** Meet the true ending's conditions here: 3 Friendly factions, 5 legends, 2 stories, 3 outposts, the Deep to the Seal. */
    conditions: () => {
      const s = game.state;
      for (const f of ['caravaners', 'tinkers', 'lamplighters']) s.factions[f] = { rep: Math.max(40, s.factions[f]?.rep ?? 0), met: true };
      for (const id of ['captain_orla', 'brother_wick', 'june_halloran', 'marla_voss', 'pip']) recruitLegend(s, game.content, id, 'dev');
      for (const r of s.residents) if (r.legendary && r.waiting) r.waiting = false;
      for (const id of [...line('legend_brother_wick'), ...line('legend_june_halloran')]) if (!s.questsDone.includes(id)) s.questsDone.push(id);
      while (s.legacy.outposts.length < 3) {
        const n = s.legacy.outposts.length + 1;
        s.legacy.outposts.push({ id: n, homesteadNumber: 100 + n * 37, cycle: n, siteId: 'plot7', population: 30, rates: { scrip: 60, salvage: 1.2, cratesPerHour: 0.05 }, stored: { scrip: 0, salvage: 0, crates: 0 } });
      }
      s.deep.strata = Math.max(s.deep.strata, 4);
      settle();
      return endingOptions(s, game.content).find((o) => o.def.true)?.conditions.map((c) => `${c.done ? '✓' : '✗'} ${c.label} ${c.have}/${c.need}`);
    },
    /** Win the finale (every Act 4 quest done): the ending choice opens. */
    finale: () => {
      const s = game.state;
      api.act4();
      for (const id of line('act4')) if (!s.questsDone.includes(id)) s.questsDone.push(id);
      if (s.story.current) s.story.current = null;
      s.story.open = false;
      openFinale(s, game.content);
      settle();
      return 'The Freeholder is knocking';
    },
    /** Open the choice screen (after finale()). */
    choice: () => ui.openChoice(),
    /** Choose an ending and play its epilogue (renewal, eviction, holdover, neighbours). */
    play: (id = 'renewal') => {
      const s = game.state;
      if (!s.story.open || s.story.current) api.finale();
      if (endingsContent(game.content).endings.find((e) => e.id === id)?.true) api.conditions();
      ui.close();
      const res = game.run({ type: 'chooseEnding', endingId: id });
      if (!res.ok) return res.reason;
      ui.playEpilogue(id, epilogue(s, game.content, id), false);
      return 'ok';
    },
    /** Replay a reached ending. */
    replay: (id = 'renewal') => ui.replay(id),
    /** Endings and where they stand. */
    list: () => endingOptions(game.state, game.content).map((o) => `${o.reached ? '✓' : ' '} ${o.def.id}${o.locked ? ` (locked: ${o.locked})` : ''}`),
    /** Forget every ending reached (dev only). */
    reset: () => {
      game.state.story = { endings: {}, current: null, open: false, title: null };
      game.flush();
    },
  };
  return api;
}
