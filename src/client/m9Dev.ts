// Dev console helpers for M9 (window.homestead.m9): legends, the new vault
// creatures and the Mauler meter, the Collection Log, the Warden's Seal and
// treasure maps, for browser testing. They call the same sim functions the
// game uses, or set state directly where the sim has no command for it.

import { advance, COLLECTION_CATEGORIES, collectionCatalogue, lootContent, recordCollection, recruitLegend, roomDef, sealRequirements, upgradeLegend, legendsContent, type IncidentType } from '../sim';
import { startIncident, startMauler } from '../sim/systems/incidents';
import type { Game } from './game';

export function m9Console(game: Game) {
  const settle = () => {
    advance(game.state, game.content, 0.05);
    game.flush();
  };
  return {
    /** A legend arrives at the door (dev source); admit = let them straight in. */
    legend: (id = 'marla_voss', admit = false) => {
      const why = recruitLegend(game.state, game.content, id, 'dev');
      if (admit) {
        const r = game.state.residents.find((x) => x.legendary === id && x.waiting);
        if (r) game.run({ type: 'admit', residentId: r.id });
      }
      settle();
      return why ?? 'ok';
    },
    /** Every legend joins (admitted), or the first n. */
    legends: (n = Infinity) => {
      const ids = legendsContent(game.content).legends.map((l) => l.id).slice(0, n);
      for (const id of ids) recruitLegend(game.state, game.content, id, 'dev');
      game.run({ type: 'admitAll' });
      settle();
      return ids;
    },
    /** Mark a legend as met but left at an outpost (for testing Recall). */
    outpost: (id = 'ada_quill') => {
      if (!game.state.legends.recruited.includes(id)) game.state.legends.recruited.push(id);
      settle();
    },
    /** Awaken a legend who is here (their questline reward). */
    awaken: (id = 'marla_voss') => {
      const why = upgradeLegend(game.state, game.content, id);
      game.flush();
      return why ?? 'ok';
    },
    /** Start an M9 creature: surge (in a power room), hollowed, glassbacks. */
    creature: (type: IncidentType = 'glassbacks', roomId?: number) => {
      const { state, content } = game;
      const room =
        state.rooms.find((r) => r.id === roomId) ??
        (type === 'surge' ? state.rooms.find((r) => roomDef(content, r).produces?.resource === 'power') : undefined) ??
        state.rooms.find((r) => r.type === 'generator') ??
        state.rooms.find((r) => roomDef(content, r).category !== 'door' && roomDef(content, r).category !== 'elevator');
      if (!room) return 'no room';
      const inc = startIncident(state, content, type, room);
      game.flush();
      return inc.id;
    },
    /** A Mauler is spotted (warning first, then the door). */
    mauler: () => {
      const inc = startMauler(game.state, game.content);
      game.flush();
      return inc?.id ?? 'no door';
    },
    /** Set the Mauler meter (0..1). */
    meter: (v = 0.8) => {
      game.state.maulerMeter = v;
    },
    /** Log a share of every collection category (1 = everything). */
    collect: (share = 0.5) => {
      const { state, content } = game;
      for (const cat of COLLECTION_CATEGORIES) {
        const all = collectionCatalogue(content, cat);
        for (const e of all.slice(0, Math.round(all.length * share))) recordCollection(state, content, cat, e.id);
      }
      settle();
    },
    /** Earn every achievement the Seal needs (all but `leave`), then let the sim award the Seal. */
    seal: (leave = 0) => {
      const { state, content } = game;
      const need = sealRequirements(content);
      for (const a of need.slice(0, need.length - leave)) if (state.achievements[a.id] === undefined) state.achievements[a.id] = state.time;
      settle();
      return state.stats['wardensSeal'] ?? 0;
    },
    /** A treasure map for a cache (the first one in the region by default). */
    map: (regionId = 'dustbowl') => {
      const { state, content } = game;
      const cache = lootContent(content).caches.find((c) => c.regionId === regionId && !state.loot.maps.some((m) => m.cacheId === c.id));
      if (!cache) return 'no cache left there';
      const id = state.nextId++;
      state.loot.maps.push({ id, cacheId: cache.id, regionId, found: false });
      state.events.push({ type: 'treasureMapFound', mapId: id, cacheId: cache.id, regionId });
      game.flush();
      return cache.id;
    },
  };
}
