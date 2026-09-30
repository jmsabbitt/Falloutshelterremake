// Two tabs share one save. The tab that opened (or took back) the homestead last
// owns it; an older tab stops simulating and saving instead of writing its stale
// copy over the newer progress, until the player chooses "Play here".

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deserialize, loadContent, newGame, serialize } from '../src/sim';
import { readSave, resetStorageForTests, writeSave } from '../src/client/storage';

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
}

const g = globalThis as Record<string, unknown>;
let storageListeners: ((e: { key: string | null; newValue: string | null }) => void)[] = [];
beforeEach(() => {
  g.localStorage = new FakeStorage();
  g.document = { addEventListener: () => {}, hidden: false };
  storageListeners = [];
  g.window = {
    addEventListener: (type: string, fn: (e: { key: string | null; newValue: string | null }) => void) => {
      if (type === 'storage') storageListeners.push(fn);
    },
  };
  resetStorageForTests();
});
afterEach(() => {
  delete g.localStorage;
  delete g.document;
  delete g.window;
  resetStorageForTests();
});

const content = loadContent();

async function twoTabs() {
  const { Game } = await import('../src/client/game');
  const s = newGame(content, { seed: 7, now: Date.now() });
  s.scrip = 1000;
  writeSave(serialize(s), 0);
  const a = new Game();
  const b = new Game();
  return { a, b };
}

const storedScrip = () => Math.round(deserialize(readSave(0)!).scrip);

describe('the same homestead in two tabs', () => {
  it("an older tab doesn't write its copy over the newer tab's progress", async () => {
    const { a, b } = await twoTabs();
    b.state.scrip = 777_777;
    expect(b.save()).toBe(true);
    expect(storedScrip()).toBe(777_777);
    // Tab A comes back: it notices, pauses and refuses to save.
    a.wake();
    expect(a.inAnotherTab).toBe(true);
    expect(a.save()).toBe(false);
    expect(storedScrip()).toBe(777_777);
    expect(a.run({ type: 'collectAll' }).ok).toBe(false);
    const before = a.state.time;
    a.update(0.5);
    expect(a.state.time).toBe(before);
  });

  it('"Play here" loads the newest save and hands ownership back', async () => {
    const { a, b } = await twoTabs();
    b.state.scrip = 777_777;
    b.save();
    expect(a.checkOwner()).toBe(true);
    expect(a.playHere().ok).toBe(true);
    expect(a.inAnotherTab).toBe(false);
    expect(Math.round(a.state.scrip)).toBe(777_777);
    // Now B is the stale one.
    expect(b.save()).toBe(false);
    expect(b.inAnotherTab).toBe(true);
  });

  it('a claim from another tab is noticed through the storage event', async () => {
    const { a } = await twoTabs();
    const seen: boolean[] = [];
    a.onAnotherTab((on) => seen.push(on));
    // The second Game already claimed slot 0; the browser tells tab A with a storage event.
    for (const fn of storageListeners) fn({ key: 'homestead.owner.0', newValue: 'someone-else' });
    expect(seen).toEqual([true]);
  });
});
