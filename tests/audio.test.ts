// Sound is synthesised (platform/audio.ts): no audio files ship. These check the
// settings, which events make which sound, and that every sound builds a valid
// graph on a stand-in AudioContext once the player has interacted.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings, parseSettings } from '../src/client/platform/settings';
import type { GameEvent } from '../src/sim';

class Param {
  value = 0;
  setValueAtTime(v: number) {
    this.value = v;
  }
  exponentialRampToValueAtTime(v: number) {
    if (v <= 0) throw new RangeError('exponential ramp to a non-positive value');
    this.value = v;
  }
  setTargetAtTime(v: number) {
    this.value = v;
  }
}
class Node {
  gain = new Param();
  frequency = new Param();
  Q = new Param();
  type = '';
  buffer: unknown = null;
  loop = false;
  connect(n: Node) {
    return n;
  }
  start() {
    started.count++;
  }
  stop() {}
}
const started = { count: 0 };
class FakeAudioContext {
  state = 'running';
  currentTime = 1;
  sampleRate = 8000;
  destination = new Node();
  createGain = () => new Node();
  createOscillator = () => new Node();
  createBiquadFilter = () => new Node();
  createBufferSource = () => new Node();
  createDynamicsCompressor = () => new Node();
  createBuffer = (_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) });
  resume = async () => {};
  suspend = async () => {};
}

const g = globalThis as Record<string, unknown>;
const winListeners = new Map<string, ((e: unknown) => void)[]>();
beforeEach(() => {
  vi.resetModules();
  started.count = 0;
  winListeners.clear();
  g.AudioContext = FakeAudioContext;
  g.document = { hidden: false, addEventListener: () => {} };
  g.window = { addEventListener: (t: string, fn: (e: unknown) => void) => winListeners.set(t, [...(winListeners.get(t) ?? []), fn]) };
});
afterEach(() => {
  delete g.AudioContext;
  delete g.document;
  delete g.window;
});

function fakeGame() {
  const on: ((evs: GameEvent[]) => void)[] = [];
  return {
    flushingAway: false,
    on: (fn: (evs: GameEvent[]) => void) => on.push(fn),
    onCommand: () => {},
    onLifecycle: () => {},
    emit: (evs: GameEvent[]) => on.forEach((fn) => fn(evs)),
  };
}

describe('sound settings', () => {
  it('default to on, and clamp stored volumes to 0–1', () => {
    expect(defaultSettings().sound.muted).toBe(false);
    const s = parseSettings({ sound: { muted: true, master: 3, effects: -1, ambience: 'loud' } });
    expect(s.sound).toEqual({ muted: true, master: 1, effects: 0, ambience: defaultSettings().sound.ambience });
    expect(parseSettings({}).sound).toEqual(defaultSettings().sound);
  });
});

describe('sound effects', () => {
  it('map game events to sounds, and stay quiet for offline collection', async () => {
    const { soundFor } = await import('../src/client/platform/audio');
    expect(soundFor({ type: 'roomBuilt', roomId: 1, roomType: 'generator' })).toBe('build');
    expect(soundFor({ type: 'collected', roomId: 1, resource: 'water', amount: 5, bonusScrip: 0 })).toBe('collectWater');
    expect(soundFor({ type: 'collected', roomId: 1, resource: 'water', amount: 5, bonusScrip: 0, offline: true })).toBeNull();
    expect(soundFor({ type: 'crateOpened', tier: 'standard', cards: [{ kind: 'item', defId: 'x', rarity: 'legendary', sold: 0 }] })).toBe('crateLegendary');
  });

  it('nothing plays before the first interaction; after it every sound builds a graph', async () => {
    const audio = await import('../src/client/platform/audio');
    const game = fakeGame();
    audio.initAudio(game as never);
    audio.playSound('build');
    expect(started.count).toBe(0);
    for (const fn of winListeners.get('pointerdown') ?? []) fn({});
    const afterAmbience = started.count;
    expect(afterAmbience).toBeGreaterThan(0);
    for (const id of audio.SOUND_IDS) audio.playSound(id);
    expect(started.count).toBeGreaterThan(afterAmbience + audio.SOUND_IDS.length);
    // Events play their sound; a catch-up's events don't.
    const before = started.count;
    game.flushingAway = true;
    game.emit([{ type: 'roomUpgraded', roomId: 1, level: 2 }]);
    expect(started.count).toBe(before);
  });
});
