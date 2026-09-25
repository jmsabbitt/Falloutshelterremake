// Dev console helpers for M7 (window.homestead.m7): open the surface, meet
// the neighbours, and set the weather, for browser testing. Rooms go through
// the build and upgrade commands; the rest calls the same sim functions the
// game uses.

import { advance, canCaravan, canPlace, factionsContent, TOPSIDE_FLOOR, type WeatherKind } from '../sim';
import { refreshUnlocks } from '../sim/economy';
import { changeRep } from '../sim/systems/factions';
import { doResearch, researchNode } from '../sim/systems/research';
import { topsideContent } from '../sim/systems/weather';
import type { Game } from './game';

export function m7Console(game: Game) {
  /** Build a surface building on the first free spot; returns its room id or the reason. */
  const buildTop = (type: string): number | string => {
    const { state, content } = game;
    const cells = content.balance.grid.cellsPerFloor;
    for (let x = 0; x < cells; x++) {
      if (!canPlace(state, content, type, TOPSIDE_FLOOR, x).ok) continue;
      const res = game.run({ type: 'build', roomType: type, floor: TOPSIDE_FLOOR, x });
      if (!res.ok) return res.reason;
      return state.rooms[state.rooms.length - 1]?.id ?? -1;
    }
    return 'no free spot on the surface';
  };
  /** An adult who is inside and free (idle first). */
  const freeHand = (): number | undefined => {
    const { state } = game;
    const ok = state.residents.filter((r) => canCaravan(state, r) === null);
    return (ok.find((r) => r.roomId === null) ?? ok[0])?.id;
  };

  return {
    /** Research Topside Survey, then build a Trading Post (staffed) and a level-3 Signal Mast. */
    topside: () => {
      const { state, content } = game;
      state.scrip += 60_000;
      if (!state.research.done.includes('topside_survey')) {
        state.research.points += researchNode(content, 'topside_survey')?.cost ?? 0;
        doResearch(state, content, 'topside_survey');
      }
      state.peakPopulation = Math.max(state.peakPopulation, 30);
      refreshUnlocks(state, content);
      const out: Record<string, number | string> = {};
      if (!state.rooms.some((r) => r.type === 'trading_post')) out.trading_post = buildTop('trading_post');
      if (!state.rooms.some((r) => r.type === 'signal_mast')) out.signal_mast = buildTop('signal_mast');
      const mast = state.rooms.find((r) => r.type === 'signal_mast');
      while (mast && mast.level < 3 && game.run({ type: 'upgrade', roomId: mast.id }).ok) {
        /* keep going */
      }
      const post = state.rooms.find((r) => r.type === 'trading_post');
      const hand = freeHand();
      if (post && hand !== undefined && !state.residents.some((r) => r.roomId === post.id)) game.run({ type: 'assign', residentId: hand, roomId: post.id });
      advance(state, content, 0.1);
      game.flush();
      return out;
    },
    /** Build any surface building (solar_array, wind_turbine, rain_catcher, farm_plots, watchtower...). */
    build: (type: string) => {
      const out = buildTop(type);
      game.flush();
      return out;
    },
    /** Make contact with every faction. */
    meet: () => {
      const { state, content } = game;
      for (const f of factionsContent(content).factions) changeRep(state, content, f.id, 0);
      advance(state, content, 0.1);
      game.flush();
      return factionsContent(content).factions.map((f) => f.id);
    },
    /** Add Influence. */
    influence: (n = 100) => {
      game.state.influence += n;
      game.flush();
      return game.state.influence;
    },
    /** Change a faction's reputation by n. */
    rep: (factionId: string, n = 20) => {
      changeRep(game.state, game.content, factionId, n);
      game.flush();
      return game.state.factions[factionId]?.rep;
    },
    /** Set the weather now: clear, dust, taintstorm or heatwave (for `minutes`, default its middle length). */
    weather: (kind: WeatherKind = 'taintstorm', minutes?: number) => {
      const { state, content } = game;
      const def = topsideContent(content).weather.kinds[kind];
      if (!def) return `no weather called ${kind}`;
      const len = minutes ?? (def.minutes[0] + def.minutes[1]) / 2;
      state.weather = { kind, remaining: len * 60 };
      state.events.push({ type: 'weatherChanged', kind });
      game.flush();
      return state.weather;
    },
    /** Bring every caravan to the end of its current leg. */
    arrive: () => {
      const { state, content } = game;
      for (const c of state.caravans) c.remaining = Math.min(c.remaining, 0.01);
      advance(state, content, 0.1);
      game.flush();
      return state.caravans.map((c) => `${c.factionId}:${c.status}`);
    },
  };
}
