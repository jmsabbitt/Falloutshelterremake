// Owns the live GameState and is the only place the client talks to the sim.

import {
  advance,
  applyCommand,
  catchUp,
  deserialize,
  drainEvents,
  foundHomestead,
  loadContent,
  newCustomGame,
  newGame,
  serialize,
  type CatchUpSummary,
  type Command,
  type CommandResult,
  type Content,
  type CustomGameOptions,
  type FoundOptions,
  type GameEvent,
  type GameState,
} from '../sim';
import { canExplore, MAX_SUPPLIES } from '../sim';
import { createResident } from '../sim/residents';
import { startIncident, startRaid } from '../sim/systems/incidents';
import { grantItem } from '../sim/systems/items';
import { addFragment, addSalvage, unlockRecipe } from '../sim/systems/inventory';
import type { CrateTier, IncidentType, StatKey } from '../sim';
import { deepConsole, researchConsole } from './depthDev';
import { prestigeConsole } from './prestigeDev';
import { questConsole } from './questDev';
import { qolConsole } from './qolDev';
import { m7Console } from './m7Dev';
import { customConsole } from './customDev';
import { clearSave, CUSTOM_SLOT, liveSlot, readActiveMode, readSave, writeActiveMode, writeBackup, writeSave, writeUndo, type PlayMode } from './storage';

type Listener = (events: GameEvent[]) => void;
type LifecycleListener = (phase: 'suspend' | 'resume') => void;
type CommandListener = (cmd: Command, result: CommandResult) => void;

/** M5: what founding a new homestead returns to the client. */
export type FoundResult = { ok: true; legacy: number; backup: string; backedUp: boolean; oldNumber: number; stayers: number } | { ok: false; reason: string };

/** Catch-up summary plus what happened to explorers while the player was away. */
export interface AwaySummary extends CatchUpSummary {
  /** Resident ids of explorers who arrived home during the absence. */
  explorersHome: number[];
  /** Resident ids of explorers who fell during the absence. */
  explorersFallen: number[];
  /** Stat points trained (or earned by levelling) while away: resident id, stat and new value. */
  trained: { residentId: number; stat: StatKey; value: number }[];
  /** Caravans back at the post, quest parties at their destination or home, and crafting finished. */
  caravansHome: number;
  questsArrived: number;
  questsHome: number;
  crafted: number;
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
/** M9: Custom Game speeds (the sim knows nothing of them: the loop feeds it more time). */
export const TIME_SCALES = [1, 2, 5, 10, 100] as const;
export type TimeScale = (typeof TIME_SCALES)[number];

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
  /** The command whose events are being handed out right now, or null (events from the clock). */
  running: Command['type'] | null = null;
  private lifecycleListeners = new Set<LifecycleListener>();
  private commandListeners = new Set<CommandListener>();
  private lastSuspend = 0;
  private suspended = false;
  /** M9: Custom Game time scale; ignored (and reset) outside a custom game. */
  private scale: TimeScale = 1;

  constructor() {
    // M9: come back to whichever game was playing: the homestead, or the Custom Game.
    let loaded: GameState | null = null;
    const active = readActiveMode();
    if (active === 'custom') loaded = Game.load(readSave(CUSTOM_SLOT), 'custom');
    if (!loaded) loaded = Game.load(readSave(0), null);
    if (loaded) {
      this.state = loaded;
      this.catchUpNow();
    } else {
      this.state = newGame(this.content, { tutorial: true });
    }
    this.claimDaily();

    // M8: the app (or tab) going away saves and schedules notifications; coming back catches up.
    // Natively the platform layer also calls suspend()/wake() from the app pause/resume events.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.suspend();
      else this.wake();
    });
    window.addEventListener('pagehide', () => this.suspend());
  }

  /** A stored save, or null if it is missing, unreadable or (when `mode` is given) from the other game. */
  private static load(json: string | null, mode: 'custom' | null): GameState | null {
    if (!json) return null;
    try {
      const s = deserialize(json);
      return mode && s.mode !== mode ? null : s;
    } catch (err) {
      console.warn('Could not load save, starting fresh:', err);
      return null;
    }
  }

  /** M8: listen for the app being suspended (hidden, paused, closed) or woken again. */
  onLifecycle(fn: LifecycleListener): () => void {
    this.lifecycleListeners.add(fn);
    return () => this.lifecycleListeners.delete(fn);
  }

  /** M8: listen for every command the player runs, with its result (e.g. to ask for notification permission). */
  onCommand(fn: CommandListener): () => void {
    this.commandListeners.add(fn);
    return () => this.commandListeners.delete(fn);
  }

  /** M8: the app is going to the background: save now, then tell listeners (notifications are scheduled). */
  suspend(): void {
    this.save();
    const now = Date.now();
    // visibilitychange, pagehide and the native pause event often arrive together.
    if (now - this.lastSuspend < 1000) return;
    this.lastSuspend = now;
    this.suspended = true;
    for (const fn of this.lifecycleListeners) fn('suspend');
  }

  /** M8: back in the foreground: catch up as after any absence, then tell listeners (notifications are cleared). */
  wake(): void {
    this.resume();
    if (!this.suspended) return;
    this.suspended = false;
    this.lastSuspend = 0;
    for (const fn of this.lifecycleListeners) fn('resume');
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
    const backedUp = writeBackup(old.legacy.cycle, backup, this.mode);
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
    return { json, ok: writeBackup(this.state.legacy.cycle, json, this.mode) };
  }

  /** Called every frame with real elapsed seconds. */
  update(dtSeconds: number): void {
    const now = Date.now();
    if (dtSeconds > MAX_FRAME_S) {
      this.resume();
      return;
    }
    advance(this.state, this.content, dtSeconds * this.timeScale);
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
    const from = this.state.events.length;
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
    const raised = this.state.events.slice(from);
    const count = (type: GameEvent['type']) => raised.filter((ev) => ev.type === type).length;
    const trained = raised.flatMap((ev) => (ev.type === 'statTrained' ? [{ residentId: ev.residentId, stat: ev.stat, value: ev.value }] : []));
    this.lastCatchUp = { ...summary, explorersHome, explorersFallen, trained, caravansHome: count('caravanReturned'), questsArrived: count('questArrived'), questsHome: count('questReturned'), crafted: count('craftFinished') };
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
    if (result.ok && ['build', 'upgrade', 'demolish', 'moveRoom', 'extendShaft', 'skipTutorial', 'custom'].includes(cmd.type)) this.layoutVersion++;
    this.running = cmd.type;
    try {
      this.flush();
    } finally {
      this.running = null;
    }
    for (const fn of this.commandListeners) fn(cmd, result);
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

  /**
   * Autosave into the live slot of this game's mode: slot 0 for the homestead,
   * the custom slot for a Custom Game. A custom state never lands in slot 0.
   */
  save(): void {
    this.stampClock();
    const mode = this.mode;
    writeSave(serialize(this.state), liveSlot(mode));
    writeActiveMode(mode);
    this.lastSave = Date.now();
  }

  // ---------------------------------------------------------------- M9: Custom Game

  /** Which game is live. */
  get mode(): PlayMode {
    return this.state.mode === 'custom' ? 'custom' : 'normal';
  }

  get isCustom(): boolean {
    return this.mode === 'custom';
  }

  /** The Custom Game speed (always 1 outside one). */
  get timeScale(): TimeScale {
    return this.isCustom ? this.scale : 1;
  }

  setTimeScale(n: number): boolean {
    if (!this.isCustom || !(TIME_SCALES as readonly number[]).includes(n)) return false;
    this.scale = n as TimeScale;
    return true;
  }

  /** A Custom Game is stored (playing or set aside). */
  hasCustomSave(): boolean {
    return this.isCustom || readSave(CUSTOM_SLOT) !== null;
  }

  /**
   * Start a new Custom Game from a preset or options, in its own save slot.
   * The live game is saved to its own slot first; a previous Custom Game is replaced.
   */
  startCustom(preset: string | CustomGameOptions): { ok: true } | { ok: false; reason: string } {
    const res = newCustomGame(this.content, preset, { seed: Math.floor(Math.random() * 2 ** 32), now: Date.now() });
    if (!res.ok) return res;
    this.save();
    this.scale = 1;
    this.replaceState(res.state);
    return { ok: true };
  }

  /** Switch to the other game (homestead ↔ Custom Game), saving this one first. */
  switchTo(mode: PlayMode): { ok: true } | { ok: false; reason: string } {
    if (mode === this.mode) return { ok: true };
    const json = readSave(liveSlot(mode));
    let next: GameState;
    if (json) {
      try {
        next = deserialize(json);
      } catch (err) {
        return { ok: false, reason: `that save could not be read (${(err as Error).message})` };
      }
    } else if (mode === 'normal') {
      next = newGame(this.content, { tutorial: true });
    } else {
      return { ok: false, reason: 'there is no Custom Game to go back to' };
    }
    // Belt and braces: whatever is in a slot, it plays (and saves) as the slot's mode says.
    if ((next.mode === 'custom') !== (mode === 'custom')) return { ok: false, reason: 'that save belongs to the other game' };
    this.save();
    this.scale = 1;
    catchUp(next, this.content, Date.now());
    this.replaceState(next);
    this.claimDaily();
    return { ok: true };
  }

  /** Throw the stored Custom Game away (switching to the homestead first if it is live). */
  deleteCustom(): void {
    if (this.isCustom) this.switchTo('normal');
    clearSave(CUSTOM_SLOT);
  }

  exportSave(): string {
    return serialize(this.state);
  }

  /** M6: write the current homestead to a save slot (1–3). */
  saveToSlot(slot: number): boolean {
    this.stampClock();
    return writeSave(serialize(this.state), slot);
  }

  /**
   * Keep one step of undo before a live slot is overwritten. M9: that is the
   * slot of the incoming game's mode, which may not be the one playing now
   * (loading a custom save while on the homestead replaces the Custom Game).
   */
  private keepUndo(nextMode: PlayMode = this.mode): void {
    this.stampClock();
    if (nextMode === this.mode) {
      writeUndo(serialize(this.state));
      return;
    }
    const stored = readSave(liveSlot(nextMode));
    if (stored) writeUndo(stored);
  }

  /**
   * Load a save (a file, a slot or a backup) in place of the current homestead. Throws if it can't be read.
   * M9: a custom save goes to the custom slot and a normal one to slot 0; the
   * game being left is saved to its own slot first.
   */
  importSave(json: string): void {
    const next = deserialize(json);
    const nextMode: PlayMode = next.mode === 'custom' ? 'custom' : 'normal';
    this.keepUndo(nextMode);
    if (nextMode !== this.mode) this.save();
    this.scale = 1;
    catchUp(next, this.content, Date.now());
    this.replaceState(next);
  }

  /**
   * Start over. M9: in a Custom Game this ends the sandbox and goes back to the
   * homestead, which is never touched.
   */
  reset(): void {
    if (this.isCustom) {
      this.keepUndo();
      this.deleteCustom();
      return;
    }
    this.keepUndo();
    clearSave();
    this.replaceState(newGame(this.content, { tutorial: true }));
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
      /** M6 helpers: research.points(n), research.all(); deep.dig(), deep.open(n), deep.discover(id?). */
      research: researchConsole(game),
      deep: deepConsole(game),
      /** M6 quality-of-life helpers: bigVault(pop), away(hours). */
      qol: qolConsole(game),
      /** M7 helpers: topside(), build(type), meet(), influence(n), rep(factionId, n), weather(kind, minutes?), arrive(). */
      m7: m7Console(game),
      /** M9 Custom Game: presets(), start(presetId | options), cmd(action, args), speed(n), back(), resume(). */
      custom: customConsole(game),
    };
    console.info('%cHomestead dev console: window.homestead', 'color:#f2a541');
  }
}
