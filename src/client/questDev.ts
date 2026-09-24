// Dev console helpers for quests (window.homestead.quest), for browser
// testing. They edit state directly where no command exists, then flush
// events so the UI hears about it, the same way the other console helpers do.

import { advance, canPlace, canQuest, effectiveMaxHp, isChild, type Room } from '../sim';
import { createResident } from '../sim/residents';
import type { Game } from './game';

export function questConsole(game: Game) {
  return {
    /** Build a Command Office at a free spot (free of charge), or push one like the tests do. */
    office: (): Room => {
      const { state, content } = game;
      const have = state.rooms.find((r) => r.type === 'office');
      if (have) return have;
      const { floors, cellsPerFloor } = content.balance.grid;
      let spot: { floor: number; x: number } | null = null;
      for (let f = 0; f < floors && !spot; f++) {
        for (let x = 0; x < cellsPerFloor; x++) {
          if (canPlace(state, content, 'office', f, x).ok) {
            spot = { floor: f, x };
            break;
          }
        }
      }
      const room: Room = { id: state.nextId++, type: 'office', floor: spot?.floor ?? 0, x: spot?.x ?? 13, segments: 1, level: 1, pool: 0, ready: false, powered: true, timer: 0, job: null };
      state.rooms.push(room);
      if (!state.unlockedRooms.includes('office')) state.unlockedRooms.push('office');
      game.layoutVersion++;
      game.flush();
      return room;
    },
    /** Buff three residents who can quest (spawning adults if needed): level, health and a weapon. */
    party: (level = 10, weapon = 'scrap_carbine') => {
      const { state, content } = game;
      const pick = () => state.residents.filter((r) => !r.waiting && canQuest(state, r) === null && !isChild(state, r));
      while (pick().length < 3) {
        const r = createResident(state, content);
        r.waiting = false;
        state.residents.push(r);
      }
      const chosen = pick().slice(0, 3);
      for (const r of chosen) {
        r.level = level;
        r.maxHp = 105 + level * 10;
        r.hp = effectiveMaxHp(r);
        if (content.weapons[weapon]) r.weapon = weapon;
      }
      state.resources.medpatch = Math.max(state.resources.medpatch, 10);
      game.flush();
      return chosen.map((r) => `${r.firstName} ${r.lastName} (#${r.id})`);
    },
    /** Finish every quest's travel now (out or home). */
    skip: () => {
      for (const q of game.state.quests) if (q.status === 'travelling' || q.status === 'returning') q.travelRemaining = 0.01;
      advance(game.state, game.content, 0.05);
      game.flush();
    },
    /** Beat every enemy in the current room, through the normal combat code (XP, drops, events). */
    win: () => {
      for (let i = 0; i < 40; i++) {
        let any = false;
        for (const q of game.state.quests) {
          if (q.status !== 'onsite') continue;
          const e = q.enemies.find((x) => x.hp > 0);
          if (!e) continue;
          any = true;
          e.hp = 1;
          for (const m of q.party) {
            m.target = e.uid;
            m.attackTimer = 0;
          }
        }
        if (!any) break;
        advance(game.state, game.content, 0.02);
      }
      game.flush();
    },
    /** Fill everyone's crit meter (to try the ring). */
    crit: () => {
      for (const q of game.state.quests) for (const m of q.party) m.crit = 1;
    },
  };
}
