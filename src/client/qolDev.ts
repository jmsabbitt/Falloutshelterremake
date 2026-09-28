// Dev console helpers for the M6 quality-of-life client (window.homestead.qol),
// for browser testing at scale. Rooms go through the build and upgrade
// commands; residents are edited the way the other dev helpers do it.

import { starterShaftX } from '../sim/grid';
import { createResident, hpPerLevel } from '../sim/residents';
import type { Game } from './game';

/** Room types per floor: the run right of the starter shaft, and the run left of it (from the shaft outwards). */
const PLAN: { right: string[]; left?: string[] }[] = [
  { right: ['quarters', 'quarters', 'quarters', 'quarters', 'quarters', 'quarters'] },
  { right: ['generator', 'canteen', 'canteen', 'generator', 'generator', 'generator'] },
  { right: ['waterworks', 'waterworks', 'waterworks', 'canteen', 'canteen', 'canteen'] },
  { right: ['quarters', 'quarters', 'quarters', 'clinic', 'clinic', 'clinic'], left: ['purgelab', 'purgelab'] },
  { right: ['weaponshop', '', '', 'outfitshop'] },
  { right: ['quarters', 'quarters', 'quarters', 'waterworks', 'waterworks', 'waterworks'], left: ['storeroom', 'storeroom'] },
  { right: ['generator', 'generator', 'generator', 'canteen', 'canteen', 'canteen'], left: ['radio', 'radio'] },
  { right: ['office', '', 'lab', 'lab', 'lab'], left: ['storeroom', 'storeroom'] },
  { right: ['quarters', 'quarters', 'quarters', 'generator', 'generator', 'generator'], left: ['clinic', 'clinic'] },
  { right: ['waterworks', 'waterworks', 'waterworks', 'canteen', 'canteen', 'canteen'], left: ['purgelab', 'purgelab'] },
];

export function qolConsole(game: Game) {
  return {
    /**
     * A lived-in mid-game homestead: ten floors of merged rooms and `pop`
     * admitted residents of every kind (levels, rarities, injured, children,
     * fallen, explorers), with jobs filled by auto-assign and some left idle.
     */
    bigVault: (pop = 200) => {
      const { state, content } = game;
      state.scrip += 10_000_000;
      for (const def of content.roomList) {
        if (def.buildable && !def.requiresResearch && def.minFloor === undefined && !state.unlockedRooms.includes(def.id)) state.unlockedRooms.push(def.id);
      }
      const S = starterShaftX(content);
      for (let f = 3; f < PLAN.length; f++) game.run({ type: 'build', roomType: 'elevator', floor: f, x: S });
      PLAN.forEach((row, floor) => {
        row.right.forEach((type, i) => type && game.run({ type: 'build', roomType: type, floor, x: S + 1 + i * 3 }));
        row.left?.forEach((type, i) => game.run({ type: 'build', roomType: type, floor, x: S - 3 - i * 3 }));
      });
      // Upgrade: every Quarters to the top, the rest to a mix of levels.
      for (const room of [...state.rooms]) {
        const target = room.type === 'quarters' ? 3 : 1 + (room.id % 3);
        while (room.level < target && game.run({ type: 'upgrade', roomId: room.id }).ok) {
          /* keep going */
        }
      }
      for (const r of state.residents) r.waiting = false;
      let i = 0;
      while (state.residents.filter((r) => !r.dead).length < pop) {
        const rarity = i % 29 === 0 ? 'legendary' : i % 9 === 0 ? 'rare' : 'common';
        const r = createResident(state, content, { rarity });
        r.waiting = false;
        r.level = 1 + ((i * 37) % 45);
        r.maxHp = content.balance.resident.baseHp + (r.level - 1) * hpPerLevel(content, r);
        r.hp = r.maxHp;
        r.happiness = 35 + ((i * 53) % 66);
        if (i % 7 === 3) r.hp = r.maxHp * 0.35;
        if (i % 11 === 5) r.taint = r.maxHp * 0.2;
        if (i % 23 === 7) r.adultAt = state.time + 3600 * (1 + (i % 5));
        state.residents.push(r);
        i++;
      }
      state.residents.filter((r) => r.adultAt === null).slice(40, 43).forEach((r) => ((r.dead = true), (r.hp = 0)));
      for (const k of ['power', 'food', 'water'] as const) state.resources[k] = 100_000;
      state.resources.medpatch = 25;
      state.resources.purge = 15;
      game.run({ type: 'autoAssign' });
      // Pull a few out of their jobs so the idle filter has something to show.
      state.residents.filter((r) => r.roomId !== null).slice(-12).forEach((r) => (r.roomId = null));
      game.layoutVersion++;
      game.flush();
      return `${state.residents.filter((r) => !r.dead).length} residents, ${state.rooms.length} rooms`;
    },
    /** Pretend the player was away for `hours`: rewind the wall clock and resume, as on returning to the tab. */
    away: (hours = 6) => {
      game.state.lastRealTime = Date.now() - hours * 3_600_000;
      game.resume();
      return game.lastAway ? `${game.lastAway.events.length} events while away` : 'nothing happened';
    },
  };
}
