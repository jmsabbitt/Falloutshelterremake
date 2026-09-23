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
import { createResident } from '../sim/residents';
import { clearSave, readSave, writeSave } from './storage';

type Listener = (events: GameEvent[]) => void;

const AUTOSAVE_MS = 20_000;
/** Longest frame we simulate directly; longer gaps go through offline catch-up. */
const MAX_FRAME_S = 2;

export class Game {
  readonly content: Content = loadContent();
  state: GameState;
  /** Set when a save was loaded and time was skipped. */
  lastCatchUp: CatchUpSummary | null = null;
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
      const summary = catchUp(this.state, this.content, Date.now());
      if (summary.seconds > 60) this.lastCatchUp = summary;
    } else {
      this.state = newGame(this.content);
    }
    this.flush();

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
    const summary = catchUp(this.state, this.content, Date.now());
    if (summary.seconds > 60) this.lastCatchUp = summary;
    this.flush();
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
    this.save();
    this.flush();
  }

  private flush(): void {
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
      skip: (seconds: number) => {
        advance(game.state, game.content, seconds);
        game.flush();
      },
      reset: () => game.reset(),
    };
    console.info('%cHomestead dev console: window.homestead', 'color:#f2a541');
  }
}
