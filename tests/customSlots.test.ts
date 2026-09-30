// M9 stream D2: the Custom Game's own save slot. The pure slot logic in
// storage.ts, and the Game switching between the homestead and a Custom Game
// without ever writing a custom state over the homestead's save.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deserialize, loadContent, newGame, serialize } from '../src/sim';
import {
  bootMode,
  CUSTOM_SLOT,
  deleteBackup,
  isLiveSlot,
  listBackups,
  liveSlot,
  readActiveMode,
  readBackup,
  readSave,
  resetStorageForTests,
  writeActiveMode,
  writeBackup,
  writeSave,
} from '../src/client/storage';

class FakeStorage {
  map = new Map<string, string>();
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
  // Just enough of a browser for the Game class (it listens for visibility changes).
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

describe('slot logic', () => {
  it('maps each mode to its own live slot', () => {
    expect(liveSlot('normal')).toBe(0);
    expect(liveSlot(undefined)).toBe(0);
    expect(liveSlot('custom')).toBe(CUSTOM_SLOT);
    expect(isLiveSlot(0)).toBe(true);
    expect(isLiveSlot(CUSTOM_SLOT)).toBe(true);
    expect(isLiveSlot(2)).toBe(false);
  });

  it('boots into the custom game only when it was last and still exists', () => {
    expect(bootMode('custom', true)).toBe('custom');
    expect(bootMode('custom', false)).toBe('normal');
    expect(bootMode('normal', true)).toBe('normal');
    expect(bootMode(null, true)).toBe('normal');
    expect(bootMode('garbage', true)).toBe('normal');
  });

  it('stores the custom save and its backups apart from the homestead', () => {
    writeSave('{"normal":1}', 0);
    writeSave('{"custom":1}', CUSTOM_SLOT);
    expect(readSave(0)).toBe('{"normal":1}');
    expect(readSave(CUSTOM_SLOT)).toBe('{"custom":1}');
    expect(local.getItem('homestead.save.custom')).toBe('{"custom":1}');
    writeBackup(1, '{"b":1}');
    for (let c = 1; c <= 5; c++) writeBackup(c, `{"cb":${c}}`, 'custom');
    // Five custom foundings don't push out the one real backup.
    expect(listBackups()).toEqual([1]);
    expect(listBackups('custom')).toEqual([3, 4, 5]);
  });

  it('reads and deletes each game\'s own backups', () => {
    writeBackup(2, '{"home":2}');
    writeBackup(2, '{"custom":2}', 'custom');
    expect(readBackup(2)).toBe('{"home":2}');
    expect(readBackup(2, 'custom')).toBe('{"custom":2}');
    deleteBackup(2, 'custom');
    expect(listBackups('custom')).toEqual([]);
    expect(readBackup(2)).toBe('{"home":2}');
  });

  it('remembers which game was playing', () => {
    expect(readActiveMode()).toBe('normal');
    writeActiveMode('custom');
    expect(readActiveMode()).toBe('normal'); // no custom save yet
    writeSave('{}', CUSTOM_SLOT);
    expect(readActiveMode()).toBe('custom');
  });
});

describe('Game and the custom slot', () => {
  it('ending a Custom Game keeps the sandbox if the homestead cannot be reopened', async () => {
    const { Game } = await import('../src/client/game');
    const game = new Game();
    expect(game.startCustom('boomtown').ok).toBe(true);
    game.save();
    const sandbox = readSave(CUSTOM_SLOT);
    // The homestead's save is unreadable now (from a newer build, say).
    const future = JSON.parse(readSave(0)!) as { version: number };
    future.version += 1;
    writeSave(JSON.stringify(future), 0);
    expect(game.reset()).toBe(false);
    expect(game.mode).toBe('custom');
    expect(readSave(CUSTOM_SLOT)).toBe(sandbox);
  });

  it('never overwrites the homestead: save, start custom, play, switch back', async () => {
    const { Game } = await import('../src/client/game');
    // A homestead is saved.
    const home = newGame(content, { seed: 7, now: Date.now() });
    home.scrip = 4321;
    home.homesteadNumber = 555;
    writeSave(serialize(home), 0);
    const game = new Game();
    expect(game.state.homesteadNumber).toBe(555);
    expect(game.mode).toBe('normal');

    // Start a custom game (the homestead is saved to slot 0 on the way out) and play it hard.
    expect(game.startCustom('boomtown').ok).toBe(true);
    const before = readSave(0);
    expect(deserialize(before!).mode).toBe('normal');
    expect(game.mode).toBe('custom');
    expect(game.state.mode).toBe('custom');
    expect(game.setTimeScale(100)).toBe(true);
    game.update(0.5); // 50 s of sim time
    expect(game.run({ type: 'custom', action: 'setResource', resource: 'scrip', amount: 99999 }).ok).toBe(true);
    game.save();
    expect(readSave(0)).toBe(before);
    expect(deserialize(readSave(CUSTOM_SLOT)!).scrip).toBe(99999);
    expect(readActiveMode()).toBe('custom');

    // A reload comes back to the custom game.
    const again = new Game();
    expect(again.mode).toBe('custom');
    expect(again.state.scrip).toBe(99999);

    // Back to the homestead: as it was.
    expect(game.switchTo('normal').ok).toBe(true);
    expect(game.mode).toBe('normal');
    expect(game.timeScale).toBe(1);
    expect(game.state.homesteadNumber).toBe(555);
    expect(game.state.scrip).toBeGreaterThanOrEqual(4321);
    expect(game.setTimeScale(10)).toBe(false);
    expect(game.run({ type: 'custom', action: 'unlockAll' }).ok).toBe(false);
    expect(readActiveMode()).toBe('normal');
    expect(deserialize(readSave(CUSTOM_SLOT)!).scrip).toBe(99999);

    // And into the custom game again, then reset it: the homestead is untouched.
    expect(game.switchTo('custom').ok).toBe(true);
    expect(game.state.scrip).toBe(99999);
    game.reset();
    expect(game.mode).toBe('normal');
    expect(game.state.homesteadNumber).toBe(555);
    expect(readSave(CUSTOM_SLOT)).toBeNull();
  });

  it('loading a custom save from a slot leaves the homestead slot alone', async () => {
    const { Game } = await import('../src/client/game');
    const home = newGame(content, { seed: 3, now: Date.now() });
    home.homesteadNumber = 321;
    writeSave(serialize(home), 0);
    const game = new Game();
    const custom = newGame(content, { seed: 4, now: Date.now(), mode: 'custom' });
    custom.homesteadNumber = 999;
    game.importSave(serialize(custom));
    expect(game.mode).toBe('custom');
    expect(deserialize(readSave(0)!).homesteadNumber).toBe(321);
    expect(deserialize(readSave(CUSTOM_SLOT)!).homesteadNumber).toBe(999);
  });
});
