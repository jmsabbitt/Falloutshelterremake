// M9 dev console helpers for the Custom Game (window.homestead.custom), for
// browser testing. Everything goes through Game and the `custom` command family,
// like the Custom Game screen and the sandbox toolbar do.

import { CUSTOM_ACTIONS, customPresets, type Command, type CustomGameOptions } from '../sim';
import type { Game } from './game';

export function customConsole(game: Game) {
  return {
    /** Preset ids and names. */
    presets: () => customPresets(game.content).map((p) => `${p.id}: ${p.name}`),
    /** Start a Custom Game (its own save slot) from a preset id or options. */
    start: (preset: string | CustomGameOptions = 'blank_slate') => game.startCustom(preset),
    /** Run a sandbox command, e.g. cmd('setResource', { resource: 'scrip', amount: 9999 }). */
    cmd: (action: (typeof CUSTOM_ACTIONS)[number], args: Record<string, unknown> = {}) => game.run({ type: 'custom', action, ...args } as Command),
    /** Time scale (1, 2, 5, 10 or 100; custom games only). */
    speed: (n: number) => (game.setTimeScale(n), game.timeScale),
    /** Back to the homestead (the Custom Game is kept). */
    back: () => game.switchTo('normal'),
    /** Back into the stored Custom Game. */
    resume: () => game.switchTo('custom'),
    mode: () => game.mode,
  };
}
