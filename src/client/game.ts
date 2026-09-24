// Owns the live GameState and is the only place the client talks to the sim.

import {
  advance,
  applyCommand,
  catchUp,
  deserialize,
  drainEvents,
  foundHomestead,
  loadContent,
  newGame,
  serialize,
  type CatchUpSummary,
  type Command,
  type CommandResult,
  type Content,
  type FoundOptions,
  type GameEvent,
  type GameState,
} from '../sim';
import { canExplore, MAX_SUPPLIES } from '../sim';
import { createResident } from '../sim/residents';
import { startIncident, startRaid } from '../sim/systems/incidents';
import { grantItem } from '../sim/systems/items';
import { addFragment, addSalvage, unlockRecipe } from '../sim/systems/inventory';
import type { CrateTier, IncidentType } from '../sim';
import { prestigeConsole } from './prestigeDev';
import { questConsole } from './questDev';
import { qolConsole } from './qolDev';
import { clearSave, readSave, writeBackup, writeSave, writeUndo } from './storage';

type Listener = (events: GameEvent[]) => void;

/** M5: what founding a new homestead returns to the client. */
export type FoundResult = { ok: true; legacy: number; backup: string; backedUp: boolean; oldNumber: number; stayers: number } | { ok: false; reason: string };

/** Catch-up summary plus what happened to explorers while the player was away. */
export interface AwaySummary extends CatchUpSummary {
  /** Resident ids of explorers who arrived home during the absence. */
  explorersHome: number[];
  /** Resident ids of explorers who fell during the absence. */
  explorersFallen: number[];
}

/** M6: an absence as the notification centre keeps it: the summary and every event it raised. */
export interface AwayReport {
  summary: AwaySummary;
  events: GameEvent[];
  /** Wall-clock ms when the player came back. */
  at: number;
}

const AUTOSAVE_MS = 20_000;
/** Longest frame we simulate directly; longer gaps go through offline catch-up. */
const MAX_FRAME_S = 2;

export class Game {
  readonly content: Content = loadContent();
  state: GameState;
  /** Set when a save was loaded and time was skipped. */
  lastCatchUp: AwaySummary | null = null;
  private listeners = new Set<Listener>();
  /** Told when game.state is swapped for a different homestead (found, import, reset). */
  private replaceListeners = new Set<() => void>();
  private lastSave = 0;
  /** M6: the latest absence, kept (unlike lastCatchUp) until the homestead is replaced. */
  lastAway: AwayReport | null = null;
  /** M6: true while flush() is handing out the events raised during an offline catch-up. */
  flushingAway = false;
  /** Catch-up summary whose events have not been flushed yet. */
  private awayPending: AwaySummary | null = null;
  /** Bumped whenever rooms change shape, so the renderer can rebuild static art. */
  layoutVersion = 0;

  constructor() {
    const saved = readSave();
    let loaded: GameState | null = null;
    if (saved) {
      try {
        loaded = deserialize(saved);
      } catch (err) {
        console.warn('Could not load save, starting fresh:', err);
      }
    }
    if (loaded) {
      this.state = loaded;
      this.catchUpNow();
    } else {
      this.state = newGame(this.content);
    }
    this.claimDaily();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save();
      else this.resume();
    });
    window.addEventListener('pagehide', () => this.save());
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Listen for game.state being replaced wholesale; the view and UI re-sync. */
  onReplace(fn: () => void): () => void {
    this.replaceListeners.add(fn);
    return () => this.replaceListeners.delete(fn);
  }

  /**
   * Swap in a different homestead: drop pending events, save at once, and
   * tell the view and UI to throw away everything drawn for the old one.
   */
  replaceState(next: GameState): void {
    this.state = next;
    this.lastCatchUp = null;
    this.lastAway = null;
    this.awayPending = null;
    drainEvents(this.state);
    this.layoutVersion++;
    this.save();
    for (const fn of this.replaceListeners) fn();
    this.flush();
  }

  /**
   * M5: found a new homestead. Backs up the old save first (it can't be
   * undone), then replaces the state. The old state is left untouched on failure.
   */
  found(opts: Omit<FoundOptions, 'now'>): FoundResult {
    this.stampClock();
    const backup = serialize(this.state);
    const old = this.state;
    const backedUp = writeBackup(old.legacy.cycle, backup);
    const res = foundHomestead(old, this.content, { ...opts, now: Date.now() });
    if (!res.ok) return res;
    const outpost = res.state.legacy.outposts.find((o) => o.cycle === old.legacy.cycle);
    this.replaceState(res.state);
    return { ok: true, legacy: res.legacy, backup, backedUp, oldNumber: old.homesteadNumber, stayers: outpost?.population ?? 0 };
  }

  /** M5: write a backup of the current save now (the Found flow does this before confirming). */
  backupNow(): { json: string; ok: boolean } {
    this.stampClock();
    const json = serialize(this.state);
    return { json, ok: writeBackup(this.state.legacy.cycle, json) };
  }

  /** Called every frame with real elapsed seconds. */
  update(dtSeconds: number): void {
    const now = Date.now();
    if (dtSeconds > MAX_FRAME_S) {
      this.resume();
      return;
    }
    advance(this.state, this.content, dtSeconds);
    this.stampClock(now);
    this.flush();
    if (now - this.lastSave > AUTOSAVE_MS) this.save();
  }

  /** Coming back to the tab/app: fast-forward safely. */
  resume(): void {
    this.catchUpNow();
    this.claimDaily();
    this.flush();
  }

  /** Offline catch-up, noting which explorers came home or fell meanwhile. */
  private catchUpNow(): void {
    const before = new Map(this.state.expeditions.map((e) => [e.id, e.status]));
    const summary = catchUp(this.state, this.content, Date.now());
    if (summary.seconds <= 60) return;
    const explorersHome: number[] = [];
    const explorersFallen: number[] = [];
    for (const e of this.state.expeditions) {
      const was = before.get(e.id);
      if (was === undefined || was === e.status) continue;
      if (e.status === 'returned') explorersHome.push(e.residentId);
      else if (e.status === 'dead') explorersFallen.push(e.residentId);
    }
    this.lastCatchUp = { ...summary, explorersHome, explorersFallen };
    this.awayPending = this.lastCatchUp;
  }

  /** Local calendar day number, so the daily crate resets at local midnight. */
  static today(): number {
    const now = new Date();
    return Math.floor((now.getTime() - now.getTimezoneOffset() * 60_000) / 86_400_000);
  }

  claimDaily(): CommandResult {
    return this.run({ type: 'claimDaily', day: Game.today() });
  }

  run(cmd: Command): CommandResult {
    const result = applyCommand(this.state, this.content, cmd);
    if (result.ok && ['build', 'upgrade', 'demolish'].includes(cmd.type)) this.layoutVersion++;
    this.flush();
    return result;
  }

  /**
   * Record the wall clock as the last simulated moment. It never moves
   * backwards, so winding the device clock back and forward again can't
   * replay the same offline time.
   */
  private stampClock(now = Date.now()): void {
    this.state.lastRealTime = Math.max(this.state.lastRealTime, now);
  }

  save(): void {
    this.stampClock();
    writeSave(serialize(this.state));
    this.lastSave = Date.now();
  }

  exportSave(): string {
    return serialize(this.state);
  }

  /** M6: write the current homestead to a save slot (1–3). */
  saveToSlot(slot: number): boolean {
    this.stampClock();
    return writeSave(serialize(this.state), slot);
  }

  /** Keep the live save as one step of undo before it is replaced. */
  private keepUndo(): void {
    this.stampClock();
    writeUndo(serialize(this.state));
  }

  /** Load a save (a file, a slot or a backup) in place of the current homestead. Throws if it can't be read. */
  importSave(json: string): void {
    const next = deserialize(json);
    this.keepUndo();
    catchUp(next, this.content, Date.now());
    this.replaceState(next);
  }

  reset(): void {
    this.keepUndo();
    clearSave();
    this.replaceState(newGame(this.content));
    this.claimDaily();
    this.save();
  }

  /** Hand queued sim events to listeners (the dev console calls this after direct edits). */
  flush(): void {
    const events = drainEvents(this.state);
    if (events.some((e) => e.type === 'roomsMerged')) this.layoutVersion++;
    // The first flush after a catch-up carries what happened while away.
    const away = this.awayPending;
    this.awayPending = null;
    if (away) this.lastAway = { summary: away, events, at: Date.now() };
    this.flushingAway = !!away;
    try {
      for (const fn of this.listeners) fn(events);
    } finally {
      this.flushingAway = false;
    }
  }

  /**
   * Developer console. This is the seed of the future Custom Game mode:
   * everything goes through the same sim functions.
   */
  installConsole(): void {
    const game = this;
    (window as unknown as Record<string, unknown>).homestead = {
      get state() {
        return game.state;
      },
      content: game.content,
      run: (cmd: Command) => game.run(cmd),
      addScrip: (n: number) => {
        game.state.scrip += n;
      },
      fill: () => {
        for (const k of ['power', 'food', 'water'] as const) game.state.resources[k] = 10_000;
      },
      spawn: (n = 1) => {
        for (let i = 0; i < n; i++) game.state.residents.push(createResident(game.state, game.content));
      },
      raid: () => {
        startRaid(game.state, game.content);
        game.flush();
      },
      incident: (type: IncidentType, roomId?: number) => {
        const room = game.state.rooms.find((r) => r.id === roomId) ?? game.state.rooms.find((r) => r.type === 'generator');
        if (room) startIncident(game.state, game.content, type, room);
        game.flush();
      },
      give: (defId: string) => grantItem(game.state, game.content, defId),
      crate: (tier: CrateTier = 'standard', n = 1) => {
        game.state.crates[tier] += n;
      },
      /** Add salvage by id, e.g. salvage('tin_cans', 20). */
      salvage: (id: string, n = 10) => {
        const added = addSalvage(game.state, game.content, id, n);
        game.flush();
        return added;
      },
      /** Add blueprint fragments toward an item's recipe. */
      fragments: (defId: string, n = 1) => {
        const added = addFragment(game.state, game.content, defId, n);
        game.flush();
        return added;
      },
      /** Learn an item's recipe outright. */
      learn: (defId: string) => {
        const ok = unlockRecipe(game.state, game.content, defId, 'found');
        game.flush();
        return ok;
      },
      /** Send a resident (or the first one who can go) to the first open region. */
      explore: (residentId?: number) => {
        const { state, content } = game;
        const res =
          residentId !== undefined
            ? state.residents.find((r) => r.id === residentId)
            : state.residents.find((r) => canExplore(state, content, r) === null);
        if (!res) return { ok: false, reason: 'nobody can explore right now' };
        return game.run({
          type: 'explore',
          residentId: res.id,
          regionId: state.regionsUnlocked[0] ?? 'dustbowl',
          medpatch: Math.min(5, MAX_SUPPLIES, Math.floor(state.resources.medpatch)),
          purge: Math.min(5, MAX_SUPPLIES, Math.floor(state.resources.purge)),
        });
      },
      skip: (seconds: number) => {
        advance(game.state, game.content, seconds);
        game.flush();
      },
      reset: () => game.reset(),
      /** M4 quest helpers: office(), party(level, weapon), skip(), win(), crit(). */
      quest: questConsole(game),
      /** M5 prestige helpers: charter(), legacy(n), found(siteId?). */
      prestige: prestigeConsole(game),
      /** M6 quality-of-life helpers: bigVault(pop), away(hours). */
      qol: qolConsole(game),
    };
    console.info('%cHomestead dev console: window.homestead', 'color:#f2a541');
  }
}
