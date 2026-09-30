// A save that doesn't land (the browser's storage quota is full) is reported,
// not silently dropped, and "start over" never runs without its undo copy.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadContent, newGame, serialize } from '../src/sim';
import { readSave, readUndo, resetStorageForTests, writeSave } from '../src/client/storage';

class FakeStorage {
  map = new Map<string, string>();
  full = false;
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
    if (this.full) throw new Error('QuotaExceededError');
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

async function started() {
  const { Game } = await import('../src/client/game');
  const s = newGame(content, { seed: 7, now: Date.now() });
  s.homesteadNumber = 555;
  writeSave(serialize(s), 0);
  return new Game();
}

describe('failed saves', () => {
  it('save() reports failure and tells listeners once until a save lands again', async () => {
    const game = await started();
    let told = 0;
    game.onSaveError(() => told++);
    expect(game.save()).toBe(true);
    local.full = true;
    expect(game.save()).toBe(false);
    expect(game.save()).toBe(false);
    expect(told).toBe(1);
    expect(game.saveFailing).toBe(true);
    local.full = false;
    expect(game.save()).toBe(true);
    expect(game.saveFailing).toBe(false);
    local.full = true;
    game.save();
    expect(told).toBe(2);
  });

  it('start over does nothing when the undo copy cannot be kept', async () => {
    const game = await started();
    local.full = true;
    expect(game.reset()).toBe(false);
    expect(game.state.homesteadNumber).toBe(555);
    local.full = false;
    expect(readUndo()).toBeNull();
    expect(game.reset()).toBe(true);
    expect(JSON.parse(readUndo()!).state.homesteadNumber).toBe(555);
    expect(readSave(0)).not.toBeNull();
  });
});
