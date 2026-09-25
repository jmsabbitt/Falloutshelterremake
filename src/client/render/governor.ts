// M8: frame-rate governor. Phones pay for every frame in battery and heat, and
// a colony sim spends most of its life on screen with nobody touching it. The
// governor stops the ticker while the page is hidden, drops the frame rate
// after a quiet spell (no input for IDLE_MS and nothing on screen that needs a
// smooth frame), and, with the battery saver on, caps it at 30 throughout.

import type { Ticker } from 'pixi.js';
import { prefs } from './prefs';

/** No input for this long, with nothing busy on screen, counts as idle. */
export const IDLE_MS = 20_000;

/** The frame cap for a moment: 0 means uncapped (the display's own rate). */
export function frameCap(batterySaver: boolean, idle: boolean): number {
  if (batterySaver) return idle ? 10 : 30;
  return idle ? 30 : 0;
}

export class FrameGovernor {
  private lastInput = performance.now();
  /** What the governor set last, for tests and the stats overlay. */
  cap = 0;

  constructor(
    private ticker: Ticker,
    /** True while something that should stay smooth is going on (a drag, a fight, a camera glide). */
    private busy: () => boolean,
  ) {
    const poke = () => this.poke();
    for (const type of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart']) window.addEventListener(type, poke, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      // Hidden: no frames at all. The game saves and catches up on its own visibility handler.
      if (document.hidden) this.ticker.stop();
      else {
        this.poke();
        this.ticker.start();
      }
    });
  }

  /** Something happened that the player is watching: back to full speed. */
  poke(): void {
    this.lastInput = performance.now();
    this.apply(false);
  }

  /** Once a frame. */
  update(): void {
    const idle = performance.now() - this.lastInput > IDLE_MS && !this.busy();
    this.apply(idle);
  }

  get idle(): boolean {
    return performance.now() - this.lastInput > IDLE_MS && !this.busy();
  }

  private apply(idle: boolean): void {
    const cap = frameCap(prefs().batterySaver, idle);
    this.cap = cap;
    // main.ts also sets the cap when the settings change; the governor has the last word each frame.
    if (this.ticker.maxFPS !== cap) this.ticker.maxFPS = cap;
  }
}
