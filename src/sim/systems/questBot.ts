// A scripted quest player, for tests, balancing and the headless bot. It
// plays the way a reasonable person would: explore every room (objective
// last), land crits with decent timing, use abilities when ready, patch up
// anyone below 40%, and take the first option at events.

import type { Content } from '../content';
import { effectiveMaxHp } from '../residents';
import { advance } from '../tick';
import { applyCommand } from '../commands';
import type { GameState, Quest } from '../types';
import { currentRoom, inCombat } from './quests';

export interface BotOptions {
  /** Crit timing quality (0..1). */
  critQuality?: number;
  useAbilities?: boolean;
  /** Seconds per decision step. */
  step?: number;
  /** Give up after this many seconds on site. */
  maxSeconds?: number;
}

/** Next room to walk to: nearest unvisited room, leaving the objective for last. */
function nextRoom(q: Quest): string | null {
  const here = currentRoom(q);
  if (!here) return null;
  const byId = new Map(q.rooms.map((r) => [r.id, r]));
  const prev = new Map<string, string>([[here.id, '']]);
  const queue = [here.id];
  const found: string[] = [];
  while (queue.length) {
    const id = queue.shift() as string;
    const room = byId.get(id);
    if (!room) continue;
    if (!room.visited) found.push(id);
    // Walking into the objective ends the quest, so never path through it.
    if (room.objective && id !== here.id) continue;
    for (const l of room.links) if (!prev.has(l)) {
      prev.set(l, id);
      queue.push(l);
    }
  }
  const goal = found.find((id) => !byId.get(id)?.objective) ?? found[0];
  if (!goal) return null;
  let step = goal;
  while (prev.get(step) && prev.get(step) !== here.id) step = prev.get(step) as string;
  return step;
}

/** Play the on-site part of a quest until it finishes or times out. Returns seconds taken. */
export function playQuest(state: GameState, content: Content, questId: number, opts: BotOptions = {}): number {
  const dt = opts.step ?? 0.25;
  const quality = opts.critQuality ?? 0.6;
  const limit = opts.maxSeconds ?? 1800;
  let t = 0;
  for (;;) {
    const q = state.quests.find((x) => x.id === questId);
    if (!q || q.status !== 'onsite' || t > limit) return t;
    if (q.pendingEvent) applyCommand(state, content, { type: 'questChoose', questId, option: 0 });
    for (const m of q.party) {
      const r = state.residents.find((x) => x.id === m.residentId);
      if (!r || m.downed) continue;
      if (r.hp < effectiveMaxHp(r) * 0.4 && q.supplies.medpatch > 0) applyCommand(state, content, { type: 'questHeal', questId, residentId: r.id });
      if (!inCombat(q)) continue;
      if (m.crit >= 1) applyCommand(state, content, { type: 'questCrit', questId, residentId: r.id, quality });
      if (opts.useAbilities !== false && m.abilityCooldown <= 0) applyCommand(state, content, { type: 'questAbility', questId, residentId: r.id });
    }
    if (!inCombat(q) && !q.moving && !q.pendingEvent) {
      const to = nextRoom(q);
      if (!to) return t; // nowhere left to go
      applyCommand(state, content, { type: 'questMove', questId, roomId: to });
    }
    advance(state, content, dt);
    t += dt;
  }
}
