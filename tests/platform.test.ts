// M8 stream P: the pure parts of the platform layer. Settings parsing, quiet
// hours, reminder → notification planning, save compression, and the native
// Preferences mirror (with a fake Preferences and a fake localStorage).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deserialize, loadContent, newGame, serialize, type Reminder } from '../src/sim';
import { MAX_NOTIFICATIONS, notificationId, planNotifications, quietShift } from '../src/client/platform/notifyPlan';
import { defaultSettings, getSettings, KIND_GROUP, parseSettings, reloadSettings, SETTINGS_KEY, updateSettings } from '../src/client/platform/settings';
import {
  COMPRESS_OVER,
  LIVE_COMPRESS_OVER,
  decodeSave,
  encodeSave,
  flushStorage,
  initStorage,
  listBackups,
  LZ_PREFIX,
  readBackup,
  readJson,
  readSave,
  readUndo,
  resetStorageForTests,
  saveStats,
  writeBackup,
  writeSave,
  writeUndo,
  clearSave,
  type PrefsLike,
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

class FakePrefs implements PrefsLike {
  map = new Map<string, string>();
  async get({ key }: { key: string }) {
    return { value: this.map.get(key) ?? null };
  }
  async set({ key, value }: { key: string; value: string }) {
    this.map.set(key, value);
  }
  async remove({ key }: { key: string }) {
    this.map.delete(key);
  }
  async keys() {
    return { keys: [...this.map.keys()] };
  }
}

let local: FakeStorage;
beforeEach(() => {
  local = new FakeStorage();
  (globalThis as { localStorage?: unknown }).localStorage = local;
  resetStorageForTests();
  reloadSettings();
});
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
  resetStorageForTests();
});

const content = loadContent();
/** A save big enough to be compressed: a new game plus a lot of residents' worth of log. */
function bigSaveJson(): string {
  const s = newGame(content);
  const json = serialize(s);
  const file = JSON.parse(json) as { state: Record<string, unknown> };
  file.state.padding = Array.from({ length: 800 }, (_, i) => ({ id: i, name: `Resident ${i}`, note: 'hauled water, fixed the generator, complained about the canteen' }));
  return JSON.stringify(file);
}

describe('settings', () => {
  it('has the documented defaults, with the names stream T reads', () => {
    const d = defaultSettings();
    expect(d.batterySaver).toBe(false);
    expect(d.reducedMotion).toBe(false);
    expect(d.haptics).toBe(true);
    expect(d.notifications).toBe(true);
    expect(d.quietHours).toEqual({ enabled: true, start: 22, end: 8 });
    expect(Object.values(d.notify).every(Boolean)).toBe(true);
  });

  it('parses junk, partial and old values into complete settings', () => {
    expect(parseSettings(null)).toEqual(defaultSettings());
    expect(parseSettings('nope')).toEqual(defaultSettings());
    const s = parseSettings({ batterySaver: true, notify: { family: false }, quietHours: { start: 23, end: 99 }, extra: 1, haptics: 'yes' });
    expect(s.batterySaver).toBe(true);
    expect(s.notify).toEqual({ expeditions: true, production: true, family: false, offers: true });
    expect(s.quietHours).toEqual({ enabled: true, start: 23, end: 8 });
    expect(s.haptics).toBe(true);
    expect('extra' in s).toBe(false);
  });

  it('stores JSON under homestead.settings and reads it back', () => {
    updateSettings({ batterySaver: true, reducedMotion: true });
    const raw = JSON.parse(local.getItem(SETTINGS_KEY) ?? '{}') as Record<string, unknown>;
    expect(raw.batterySaver).toBe(true);
    expect(raw.reducedMotion).toBe(true);
    reloadSettings();
    expect(getSettings().batterySaver).toBe(true);
  });

  it('puts every reminder kind in a group', () => {
    for (const g of Object.values(KIND_GROUP)) expect(['expeditions', 'production', 'family', 'offers']).toContain(g);
  });
});

describe('quiet hours', () => {
  const q = { enabled: true, start: 22, end: 8 };
  const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m).getTime();

  it('moves late-night and early-morning times to when quiet hours end', () => {
    expect(quietShift(at(10, 23, 30), q)).toBe(at(11, 8));
    expect(quietShift(at(11, 3, 15), q)).toBe(at(11, 8));
    expect(quietShift(at(10, 22, 0), q)).toBe(at(11, 8));
  });

  it('leaves daytime alone, and does nothing when off or empty', () => {
    expect(quietShift(at(10, 8, 0), q)).toBeNull();
    expect(quietShift(at(10, 12, 0), q)).toBeNull();
    expect(quietShift(at(10, 21, 59), q)).toBeNull();
    expect(quietShift(at(10, 23, 0), { ...q, enabled: false })).toBeNull();
    expect(quietShift(at(10, 23, 0), { enabled: true, start: 5, end: 5 })).toBeNull();
  });

  it('handles a window that does not wrap midnight', () => {
    const nap = { enabled: true, start: 13, end: 15 };
    expect(quietShift(at(10, 14, 0), nap)).toBe(at(10, 15));
    expect(quietShift(at(10, 16, 0), nap)).toBeNull();
  });
});

describe('reminders to notifications', () => {
  const noon = new Date(2026, 8, 10, 12, 0).getTime();
  const rem = (key: string, kind: Reminder['kind'], inSeconds: number): Reminder => ({ key, kind, inSeconds, title: `${key} done`, body: `The ${key} is done.` });
  const daytime = { ...defaultSettings(), quietHours: { enabled: false, start: 22, end: 8 } };

  it('gives stable, valid, unique ids per key', () => {
    expect(notificationId('caravan.12')).toBe(notificationId('caravan.12'));
    expect(notificationId('caravan.12')).not.toBe(notificationId('caravan.13'));
    for (const k of ['', 'a', 'explorer.1', 'x'.repeat(500)]) {
      const id = notificationId(k);
      expect(Number.isInteger(id) && id > 0 && id <= 0x7fffffff).toBe(true);
    }
    const plan = planNotifications([rem('explorer.1', 'explorer', 600), rem('caravan.2', 'caravan', 900)], daytime, noon);
    expect(plan.map((n) => n.id)).toEqual([notificationId('explorer.1'), notificationId('caravan.2')]);
    expect(plan[0]?.at).toBe(noon + 600_000);
  });

  it('sorts, caps at the limit and skips anything under a minute away', () => {
    const many = Array.from({ length: 50 }, (_, i) => rem(`craft.${i}`, 'craft', 3600 - i * 30));
    const plan = planNotifications([...many, rem('soon', 'explorer', 30)], daytime, noon);
    expect(plan).toHaveLength(MAX_NOTIFICATIONS);
    expect(plan.some((n) => n.key === 'soon')).toBe(false);
    for (let i = 1; i < plan.length; i++) expect(plan[i]!.at).toBeGreaterThanOrEqual(plan[i - 1]!.at);
    expect(planNotifications(many, daytime, noon, 5)).toHaveLength(5);
  });

  it('drops switched-off groups, and everything when notifications are off', () => {
    const list = [rem('birth.1', 'birth', 600), rem('explorer.1', 'explorer', 700), rem('trade', 'trade', 800)];
    const noFamily = { ...daytime, notify: { ...daytime.notify, family: false } };
    expect(planNotifications(list, noFamily, noon).map((n) => n.key)).toEqual(['explorer.1', 'trade']);
    expect(planNotifications(list, { ...daytime, notifications: false }, noon)).toEqual([]);
  });

  it('holds overnight events until morning, folding several into one report', () => {
    const s = defaultSettings();
    const evening = new Date(2026, 8, 10, 21, 0).getTime();
    const eight = new Date(2026, 8, 11, 8, 0).getTime();
    const one = planNotifications([rem('explorer.1', 'explorer', 3 * 3600)], s, evening);
    expect(one).toEqual([expect.objectContaining({ key: 'explorer.1', at: eight })]);
    const three = planNotifications([rem('explorer.1', 'explorer', 3 * 3600), rem('caravan.1', 'caravan', 5 * 3600), rem('craft.1', 'craft', 7 * 3600), rem('early', 'deep', 1800)], s, evening);
    expect(three.map((n) => n.key)).toEqual(['early', expect.stringMatching(/^morning\./)]);
    const report = three[1]!;
    expect(report.at).toBe(eight);
    expect(report.title.length).toBeLessThanOrEqual(40);
    expect(report.body.length).toBeLessThanOrEqual(110);
    expect(report.title).toContain('3');
  });
});

describe('save compression', () => {
  it('round-trips a big save through LZ with a versioned prefix', () => {
    const json = bigSaveJson();
    expect(json.length).toBeGreaterThan(COMPRESS_OVER);
    const stored = encodeSave(json);
    expect(stored.startsWith(LZ_PREFIX)).toBe(true);
    expect(stored.length).toBeLessThan(json.length / 3);
    expect(decodeSave(stored)).toBe(json);
  });

  it('keeps small saves as plain JSON, and old plain saves still load', () => {
    const json = serialize(newGame(content));
    expect(encodeSave(json, Number.MAX_SAFE_INTEGER)).toBe(json);
    local.setItem('homestead.save.0', json);
    const back = readSave();
    expect(back).toBe(json);
    expect(() => deserialize(back!)).not.toThrow();
  });

  it('writes compressed saves, backups and undo that read back as JSON', () => {
    const json = bigSaveJson();
    expect(writeSave(json, 2)).toBe(true);
    expect(local.getItem('homestead.save.2')?.startsWith(LZ_PREFIX)).toBe(true);
    expect(readSave(2)).toBe(json);
    expect(saveStats(2)).toEqual({ json: json.length, stored: local.getItem('homestead.save.2')!.length, compressed: true });
    // The live autosave stays plain until it is really big (it is written every 20 s).
    expect(writeSave(json)).toBe(true);
    expect(local.getItem('homestead.save.0')).toBe(json);
    const huge = bigSaveJson().replace('"padding":[', `"padding":[${'{"x":"filler filler filler"},'.repeat(9000)}`);
    expect(huge.length).toBeGreaterThan(LIVE_COMPRESS_OVER);
    writeSave(huge);
    expect(local.getItem('homestead.save.0')?.startsWith(LZ_PREFIX)).toBe(true);
    expect(readSave()).toBe(huge);
    expect(writeBackup(4, json)).toBe(true);
    expect(readBackup(4)).toBe(json);
    expect(writeUndo(json)).toBe(true);
    expect(readUndo()).toBe(json);
    // A second reader (a fresh page) decodes from storage, not the cache.
    resetStorageForTests();
    expect(readSave(2)).toBe(json);
    expect(readSave()).toBe(huge);
    expect(() => deserialize(readSave(2)!)).not.toThrow();
  });

  it('treats an unreadable compressed save as missing', () => {
    expect(decodeSave(`${LZ_PREFIX}`)).toBeNull();
  });
});

describe('native Preferences mirror', () => {
  it('migrates localStorage into Preferences on the first native launch', async () => {
    local.setItem('homestead.save.0', '{"a":1}');
    local.setItem('homestead.settings', '{"batterySaver":true}');
    local.setItem('other.app', 'x');
    const prefs = new FakePrefs();
    const init = await initStorage({ prefs });
    expect(init).toEqual({ mode: 'preferences', toPrefs: 2, toLocal: 0 });
    expect(prefs.map.get('homestead.save.0')).toBe('{"a":1}');
    expect(prefs.map.has('other.app')).toBe(false);
    expect(readSave()).toBe('{"a":1}');
  });

  it('restores everything when the OS wiped the WebView storage', async () => {
    const prefs = new FakePrefs();
    prefs.map.set('homestead.save.0', '{"kept":true}');
    prefs.map.set('homestead.save.backup.3', '{"b":3}');
    prefs.map.set('homestead.settings', '{"reducedMotion":true}');
    const init = await initStorage({ prefs });
    expect(init.toLocal).toBe(3);
    expect(readSave()).toBe('{"kept":true}');
    expect(listBackups()).toEqual([3]);
    // Stream T reads the settings straight from localStorage: it must be back there too.
    expect(local.getItem('homestead.settings')).toBe('{"reducedMotion":true}');
    expect(readJson<{ reducedMotion: boolean }>('homestead.settings')?.reducedMotion).toBe(true);
  });

  it('reads Preferences first when both have a key', async () => {
    const prefs = new FakePrefs();
    prefs.map.set('homestead.save.0', '{"from":"prefs"}');
    local.setItem('homestead.save.0', '{"from":"local"}');
    await initStorage({ prefs });
    expect(readSave()).toBe('{"from":"prefs"}');
    expect(local.getItem('homestead.save.0')).toBe('{"from":"prefs"}');
  });

  it('writes through to both stores, and removes from both', async () => {
    const prefs = new FakePrefs();
    await initStorage({ prefs });
    const json = bigSaveJson();
    writeSave(json, 2);
    writeSave('{"slot":1}', 1);
    updateSettings({ haptics: false });
    await flushStorage();
    expect(prefs.map.get('homestead.save.2')).toBe(local.getItem('homestead.save.2'));
    expect(decodeSave(prefs.map.get('homestead.save.2')!)).toBe(json);
    expect(prefs.map.get('homestead.save.1')).toBe('{"slot":1}');
    expect(JSON.parse(prefs.map.get(SETTINGS_KEY)!).haptics).toBe(false);
    clearSave(1);
    await flushStorage();
    expect(prefs.map.has('homestead.save.1')).toBe(false);
    expect(local.getItem('homestead.save.1')).toBeNull();
  });

  it('keeps working natively when the WebView quota is full', async () => {
    const prefs = new FakePrefs();
    await initStorage({ prefs });
    local.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(writeSave('{"big":true}')).toBe(true);
    await flushStorage();
    expect(prefs.map.get('homestead.save.0')).toBe('{"big":true}');
    expect(readSave()).toBe('{"big":true}');
  });

  it('keeps only the newest three backups in both stores', async () => {
    const prefs = new FakePrefs();
    await initStorage({ prefs });
    for (const c of [1, 2, 3, 4, 5]) expect(writeBackup(c, `{"c":${c}}`)).toBe(true);
    await flushStorage();
    expect(listBackups()).toEqual([3, 4, 5]);
    expect([...prefs.map.keys()].filter((k) => k.includes('backup')).sort()).toEqual(['homestead.save.backup.3', 'homestead.save.backup.4', 'homestead.save.backup.5']);
  });
});
