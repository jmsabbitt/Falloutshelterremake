// The simulation clock. `advance` is used while the game is open; `catchUp`
// fast-forwards over time spent away, under the "safe offline" rules:
//   - timers continue: production (each room still stops at one batch),
//     pregnancies, children growing up, radio and wanderer arrivals,
//     expeditions (explorers keep exploring), crafting jobs and quest travel
//   - nothing happens on a quest site: parties never fight offline
//   - consumption only runs for the first few minutes of an absence
//   - no incidents start or progress, no courtship, no shortage damage

import type { Content } from './content';
import { refreshUnlocks, resourceCapacity } from './economy';
import { roomDef } from './grid';
import { bonus } from './bonuses';
import { tickOutposts } from './systems/prestige';
import { collectRoom } from './systems/production';
import { tickArrivals } from './systems/arrivals';
import { tickCrafting } from './systems/crafting';
import { tickExpeditions } from './systems/exploration';
import { settle } from './systems/crates';
import { tickCourtship, tickFamily } from './systems/family';
import { settleIncidentsOffline, tickIncidents, tickIncidentTimer } from './systems/incidents';
import { tickNeeds, updatePower } from './systems/needs';
import { tickProduction } from './systems/production';
import { tickQuests } from './systems/quests';
import { tickResearch } from './systems/research';
import { tickDeep } from './systems/deep';
import { tickMastery } from './systems/traits';
import { tickWeather } from './systems/weather';
import { tickFactions } from './systems/factions';
import { tickRushStrain } from './systems/rush';
import type { GameState } from './types';

const MAX_ONLINE_STEP = 1;

interface StepOptions {
  offline: boolean;
  consume: boolean;
}

// Note: systems/reminders.ts replays the offline part of this order (power, production,
// needs, incidents, time, crafting, research, mastery, weather). Keep them in step.
function step(state: GameState, content: Content, dt: number, opts: StepOptions): void {
  const from = state.events.length;
  updatePower(state, content);
  tickProduction(state, content, dt);
  tickNeeds(state, content, dt, { consume: opts.consume, harm: !opts.offline });
  if (opts.offline) settleIncidentsOffline(state, content, dt);
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
  tickResearch(state, content, dt, opts.offline);
  tickDeep(state, content, dt, opts.offline);
  tickMastery(state, content, dt);
  tickWeather(state, content, dt, opts.offline);
  tickFactions(state, content, dt);
  // Conveyor Belts (Legacy): finished batches collect themselves while playing.
  if (!opts.offline && bonus(state, content, 'autoCollect') > 0) {
    for (const room of state.rooms) {
      if (!room.ready) continue;
      // Leave batches banked while storage is full, rather than wasting them.
      const res = roomDef(content, room).produces?.resource;
      if (res && state.resources[res] >= resourceCapacity(state, content, res)) continue;
      collectRoom(state, content, room);
    }
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
  /** M6: research points earned, salvage refined, and finished batches waiting (banked ones included). */
  research: number;
  refined: number;
  batches: number;
}

/** Fast-forward from state.lastRealTime to `nowMs`. */
export function catchUp(state: GameState, content: Content, nowMs: number): CatchUpSummary {
  const off = content.balance.offline;
  const maxSeconds = (off.maxCatchUpHours + bonus(state, content, 'offlineHours')) * 3600;
  const raw = Math.max(0, (nowMs - state.lastRealTime) / 1000);
  const seconds = Math.min(raw, maxSeconds);
  const consumeWindow = off.consumptionMinutes * 60;
  state.offlineConsumed = 0;
  const births0 = state.stats['births'] ?? 0;
  const arrivals0 = (state.stats['arrivals.radio'] ?? 0) + (state.stats['arrivals.wanderer'] ?? 0);
  const research0 = state.stats['researchPoints'] ?? 0;
  const refined0 = state.stats['refinedSalvage'] ?? 0;

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
  // Never move the clock backwards: winding the device clock back and forward
  // again must not grant the same offline time twice.
  state.lastRealTime = Math.max(state.lastRealTime, nowMs);
  return {
    seconds,
    cappedAt: raw > maxSeconds ? maxSeconds : null,
    readyRooms: state.rooms.filter((r) => r.ready).length,
    births: (state.stats['births'] ?? 0) - births0,
    arrivals: (state.stats['arrivals.radio'] ?? 0) + (state.stats['arrivals.wanderer'] ?? 0) - arrivals0,
    research: Math.floor((state.stats['researchPoints'] ?? 0) - research0),
    refined: (state.stats['refinedSalvage'] ?? 0) - refined0,
    batches: state.rooms.reduce((n, r) => n + (r.ready ? 1 + (r.banked ?? 0) : 0), 0),
  };
}

/** Remove and return pending events (for the UI, sounds, notifications). */
export function drainEvents(state: GameState) {
  const events = state.events;
  state.events = [];
  return events;
}
