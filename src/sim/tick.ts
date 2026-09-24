// The simulation clock. `advance` is used while the game is open; `catchUp`
// fast-forwards over time spent away, under the "safe offline" rules:
//   - timers continue: production (each room still stops at one batch),
//     pregnancies, children growing up, radio and wanderer arrivals,
//     expeditions (explorers keep exploring), crafting jobs and quest travel
//   - nothing happens on a quest site: parties never fight offline
//   - consumption only runs for the first few minutes of an absence
//   - no incidents start or progress, no courtship, no shortage damage

import type { Content } from './content';
import { refreshUnlocks } from './economy';
import { perkValue } from './legacy';
import { tickOutposts } from './systems/prestige';
import { collectRoom } from './systems/production';
import { tickArrivals } from './systems/arrivals';
import { tickCrafting } from './systems/crafting';
import { tickExpeditions } from './systems/exploration';
import { settle } from './systems/crates';
import { tickCourtship, tickFamily } from './systems/family';
import { tickIncidents, tickIncidentTimer } from './systems/incidents';
import { tickNeeds, updatePower } from './systems/needs';
import { tickProduction } from './systems/production';
import { tickQuests } from './systems/quests';
import { tickRushStrain } from './systems/rush';
import type { GameState } from './types';

const MAX_ONLINE_STEP = 1;

interface StepOptions {
  offline: boolean;
  consume: boolean;
}

function step(state: GameState, content: Content, dt: number, opts: StepOptions): void {
  const from = state.events.length;
  updatePower(state, content);
  tickProduction(state, content, dt);
  tickNeeds(state, content, dt, { consume: opts.consume, harm: !opts.offline });
  if (!opts.offline) {
    tickIncidents(state, content, dt);
    tickIncidentTimer(state, content, dt);
    tickCourtship(state, content, dt);
  }
  tickRushStrain(state, content, dt);
  state.time += dt;
  tickFamily(state, content);
  tickArrivals(state, content, dt);
  tickExpeditions(state, content, dt);
  tickCrafting(state, content, dt);
  tickQuests(state, content, dt, opts.offline);
  tickOutposts(state, content, dt);
  // Conveyor Belts (Legacy): finished batches collect themselves while playing.
  if (!opts.offline && perkValue(state, content, 'autoCollect') > 0) {
    for (const room of state.rooms) if (room.ready) collectRoom(state, content, room);
  }
  refreshUnlocks(state, content);
  settle(state, content, from);
}

/** Advance the live game by `seconds` of play. */
export function advance(state: GameState, content: Content, seconds: number): void {
  let remaining = Math.max(0, seconds);
  while (remaining > 1e-9) {
    const dt = Math.min(MAX_ONLINE_STEP, remaining);
    step(state, content, dt, { offline: false, consume: true });
    remaining -= dt;
  }
}

export interface CatchUpSummary {
  seconds: number;
  cappedAt: number | null;
  readyRooms: number;
  births: number;
  arrivals: number;
}

/** Fast-forward from state.lastRealTime to `nowMs`. */
export function catchUp(state: GameState, content: Content, nowMs: number): CatchUpSummary {
  const off = content.balance.offline;
  const maxSeconds = (off.maxCatchUpHours + perkValue(state, content, 'offlineHours')) * 3600;
  const raw = Math.max(0, (nowMs - state.lastRealTime) / 1000);
  const seconds = Math.min(raw, maxSeconds);
  const consumeWindow = off.consumptionMinutes * 60;
  state.offlineConsumed = 0;
  const births0 = state.stats['births'] ?? 0;
  const arrivals0 = (state.stats['arrivals.radio'] ?? 0) + (state.stats['arrivals.wanderer'] ?? 0);

  let elapsed = 0;
  while (elapsed < seconds - 1e-9) {
    // Fine steps while consumption is running, coarse afterwards (production is
    // linear, and each room halts once a batch is ready).
    const consuming = state.offlineConsumed < consumeWindow;
    const size = consuming ? off.stepSeconds : 60;
    const dt = Math.min(size, seconds - elapsed, consuming ? consumeWindow - state.offlineConsumed : Infinity);
    step(state, content, dt, { offline: true, consume: consuming });
    if (consuming) state.offlineConsumed += dt;
    elapsed += dt;
  }
  state.lastRealTime = nowMs;
  return {
    seconds,
    cappedAt: raw > maxSeconds ? maxSeconds : null,
    readyRooms: state.rooms.filter((r) => r.ready).length,
    births: (state.stats['births'] ?? 0) - births0,
    arrivals: (state.stats['arrivals.radio'] ?? 0) + (state.stats['arrivals.wanderer'] ?? 0) - arrivals0,
  };
}

/** Remove and return pending events (for the UI, sounds, notifications). */
export function drainEvents(state: GameState) {
  const events = state.events;
  state.events = [];
  return events;
}
