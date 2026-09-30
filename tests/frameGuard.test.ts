// One exception inside a frame must not stop the game loop (Pixi only asks for
// the next frame after every ticker listener returns).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ticker } from 'pixi.js';
import { resetFrameGuardForTests, runStage } from '../src/client/frameGuard';

afterEach(() => {
  resetFrameGuardForTests();
  vi.restoreAllMocks();
});

describe('runStage', () => {
  it('logs a throwing stage once and keeps going', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    let after = 0;
    for (let i = 0; i < 5; i++) {
      expect(runStage('ui', () => { throw new Error('boom'); })).toBe(false);
      expect(runStage('view', () => { after++; })).toBe(true);
    }
    expect(after).toBe(5);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("keeps Pixi's ticker requesting frames when a frame throws", () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const frames: FrameRequestCallback[] = [];
    const g = globalThis as Record<string, unknown>;
    const raf = g.requestAnimationFrame;
    const caf = g.cancelAnimationFrame;
    g.requestAnimationFrame = (cb: FrameRequestCallback) => frames.push(cb);
    g.cancelAnimationFrame = () => {};
    try {
      const run = (guard: boolean) => {
        frames.length = 0;
        const ticker = new Ticker();
        let n = 0;
        ticker.add(() => {
          n++;
          const body = () => {
            if (n === 2) throw new Error('one bad frame');
          };
          if (guard) runStage('sim', body);
          else body();
        });
        ticker.start();
        let t = 0;
        for (let i = 0; i < 5 && frames.length; i++) {
          const cb = frames.shift()!;
          try {
            cb((t += 16));
          } catch {
            // an unguarded frame throws out of the ticker
          }
        }
        ticker.destroy();
        return n;
      };
      expect(run(false)).toBe(2); // without the guard the loop dies on the bad frame
      expect(run(true)).toBeGreaterThanOrEqual(4); // with it, every frame after the bad one still runs
    } finally {
      g.requestAnimationFrame = raf;
      g.cancelAnimationFrame = caf;
    }
  });
});
