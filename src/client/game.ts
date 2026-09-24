// Owns the live GameState and is the only place the client talks to the sim.

import {
  advance,
  applyCommand,
  catchUp,
  deserialize,
  drainEvents,
  loadContent,
  newGame,
  serialize,
  type CatchUpSummary,
  type Command,
  type CommandResult,
  type Content,
  type GameEvent,
  type GameState,
} from '../sim';
import { canExplore, MAX_SUPPLIES } from '../sim';
import { createResident } from '../sim/residents';
import { startIncident, startRaid } from '../sim/systems/incidents';
import { grantItem } from '../sim/systems/items';
import { addFragment, addSalvage, unlockRecipe } from '../sim/systems/inventory';
import type { CrateTier, IncidentType } from '../sim';
import { questConsole } from './questDev';
import { clearSave, readSave, writeSave } from './storage';

type Listener = (events: GameEvent[]) => void;

/** Catch-up summary plus what happened to explorers while the player was away. */
export interface AwaySummary extends CatchUpSummary {
  /** Resident ids of explorers who arrived home during the absence. */
  explorersHome: number[];
  /** Resident ids of explorers who fell during the absence. */
  explorersFallen: number[];
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
  private lastSave = 0;
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

  /** Called every frame with real elapsed seconds. */
  update(dtSeconds: number): void {
    const now = Date.now();
    if (dtSeconds > MAX_FRAME_S) {
      this.resume();
      return;
    }
    advance(this.state, this.content, dtSeconds);
    this.state.lastRealTime = now;
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

  save(): void {
    this.state.lastRealTime = Date.now();
    writeSave(serialize(this.state));
    this.lastSave = Date.now();
  }

  exportSave(): string {
    return serialize(this.state);
  }

  importSave(json: string): void {
    this.state = deserialize(json);
    catchUp(this.state, this.content, Date.now());
    this.layoutVersion++;
    this.save();
    this.flush();
  }

  reset(): void {
    clearSave();
    this.state = newGame(this.content);
    this.layoutVersion++;
    this.claimDaily();
    this.save();
  }

  /** Hand queued sim events to listeners (the dev console calls this after direct edits). */
  flush(): void {
    const events = drainEvents(this.state);
    if (events.some((e) => e.type === 'roomsMerged')) this.layoutVersion++;
    for (const fn of this.listeners) fn(events);
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
    };
    console.info('%cHomestead dev console: window.homestead', 'color:#f2a541');
  }
}
