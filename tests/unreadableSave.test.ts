// A live save that can't be read at boot (from a newer build, or damaged) is
// set aside before the fresh homestead's first autosave, never destroyed.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deserialize, loadContent, newGame, serialize, SAVE_VERSION } from '../src/sim';
import { readSave, readSetAside, resetStorageForTests, writeSave } from '../src/client/storage';

class FakeStorage {
  map = new Map<string, string>();
  quota = Infinity;
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    const used = [...this.map].reduce((a, [key, val]) => a + (key === k ? 0 : val.length), 0);
    if (used + String(v).length > this.quota) throw new Error('QuotaExceededError');
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

const g = globalThis as Record<string, unknown>;
let local: FakeStorage;
beforeEach(() => {
  local = new FakeStorage();
  g.localStorage = local;
  g.document = { addEventListener: () => {}, hidden: false };
  g.window = { addEventListener: () => {} };
  resetStorageForTests();
});
afterEach(() => {
  delete g.localStorage;
  delete g.document;
  delete g.window;
  resetStorageForTests();
});

const content = loadContent();

/** A real homestead's save, stamped as coming from a newer build than this one. */
function futureSave(): string {
  const s = newGame(content, { seed: 7, now: Date.now() });
  s.scrip = 124_456;
  const file = JSON.parse(serialize(s)) as { version: number };
  file.version = SAVE_VERSION + 1;
  return JSON.stringify(file);
}

describe('booting with an unreadable save', () => {
  it('sets the save aside before autosaving a fresh homestead over slot 0', async () => {
    const { Game } = await import('../src/client/game');
    const stored = futureSave();
    writeSave(stored, 0);
    const game = new Game();
    expect(game.state.scrip).not.toBe(124_456);
    game.update(0.1); // the first frame autosaves
    expect(deserialize(readSave(0)!).scrip).toBe(game.state.scrip);
    expect(readSetAside()).toBe(stored);
  });

  it('leaves slot 0 alone if the save cannot be set aside', async () => {
    const { Game } = await import('../src/client/game');
    const stored = futureSave();
    writeSave(stored, 0);
    local.quota = stored.length + 100; // no room for a second copy
    const game = new Game();
    game.update(0.1);
    game.save();
    expect(readSave(0)).toBe(stored);
    expect(readSetAside()).toBeNull();
    // Starting over is the player's choice: after that the game saves as usual.
    local.quota = Infinity;
    game.reset();
    expect(deserialize(readSave(0)!).homesteadNumber).toBe(game.state.homesteadNumber);
  });

  it('a readable save loads as before and nothing is set aside', async () => {
    const { Game } = await import('../src/client/game');
    const s = newGame(content, { seed: 7, now: Date.now() });
    s.homesteadNumber = 555;
    writeSave(serialize(s), 0);
    expect(new Game().state.homesteadNumber).toBe(555);
    expect(readSetAside()).toBeNull();
  });
});
