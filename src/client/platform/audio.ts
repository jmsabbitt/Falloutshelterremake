// Sound: every effect and the vault's ambience are synthesised at run time with the
// Web Audio API, so the game ships no audio files and no third-party recordings.
// Volumes and mute live in settings.sound. Browsers only allow sound after the
// player interacts, so nothing plays (and no AudioContext exists) until the first
// tap or key press. The app going to the background suspends the context.

import type { Command, CommandResult, GameEvent } from '../../sim';
import type { Game } from '../game';
import { getSettings, onSettingsChange, type SoundSettings } from './settings';

export type SoundId =
  | 'tap'
  | 'refused'
  | 'build'
  | 'upgrade'
  | 'merge'
  | 'collectPower'
  | 'collectFood'
  | 'collectWater'
  | 'collectMedical'
  | 'scrip'
  | 'crate'
  | 'crateRare'
  | 'crateLegendary'
  | 'alarm'
  | 'allClear'
  | 'achievement'
  | 'arrival'
  | 'birth'
  | 'death'
  | 'levelUp'
  | 'rushFail'
  | 'hit'
  | 'crit'
  | 'enemyDown'
  | 'questWon'
  | 'questLost'
  | 'research'
  | 'craft';

type Wave = OscillatorType;

interface Engine {
  ctx: AudioContext;
  master: GainNode;
  effects: GainNode;
  ambience: GainNode;
  noise: AudioBuffer;
  ambienceStarted: boolean;
}

let engine: Engine | null = null;
let settings: SoundSettings = getSettings().sound;
const lastPlayed = new Map<SoundId, number>();
/** Shortest gap between two plays of the same sound, so a burst of events doesn't stack up. */
const MIN_GAP_S = 0.06;

function audioContextClass(): typeof AudioContext | null {
  const w = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function applyVolumes(): void {
  if (!engine) return;
  const t = engine.ctx.currentTime;
  engine.master.gain.setTargetAtTime(settings.muted ? 0 : settings.master, t, 0.05);
  engine.effects.gain.setTargetAtTime(settings.effects, t, 0.05);
  engine.ambience.gain.setTargetAtTime(settings.ambience * 0.5, t, 0.3);
}

/** Create the audio graph (on the first user gesture). */
function start(): Engine | null {
  if (engine) return engine;
  const AC = audioContextClass();
  if (!AC) return null;
  try {
    const ctx = new AC();
    const master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    const effects = ctx.createGain();
    const ambience = ctx.createGain();
    effects.connect(master);
    ambience.connect(master);
    master.gain.value = 0;
    // Two seconds of white noise, reused by every noisy sound.
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    engine = { ctx, master, effects, ambience, noise, ambienceStarted: false };
    applyVolumes();
    return engine;
  } catch (err) {
    console.warn('Audio unavailable:', err);
    return null;
  }
}

// ------------------------------------------------------------------ building blocks

/** One enveloped oscillator note. `glide` bends the pitch to that frequency over the note. */
function note(e: Engine, at: number, freq: number, dur: number, opts: { wave?: Wave; gain?: number; attack?: number; glide?: number; out?: AudioNode } = {}): void {
  const { ctx } = e;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = opts.wave ?? 'sine';
  osc.frequency.setValueAtTime(freq, at);
  if (opts.glide) osc.frequency.exponentialRampToValueAtTime(opts.glide, at + dur);
  const peak = opts.gain ?? 0.3;
  const attack = opts.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(opts.out ?? e.effects);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** A filtered burst of noise: thuds, clicks, hisses and whooshes. */
function burst(e: Engine, at: number, dur: number, opts: { type?: BiquadFilterType; freq?: number; q?: number; gain?: number; sweepTo?: number; out?: AudioNode } = {}): void {
  const { ctx } = e;
  const src = ctx.createBufferSource();
  src.buffer = e.noise;
  const f = ctx.createBiquadFilter();
  f.type = opts.type ?? 'lowpass';
  f.frequency.setValueAtTime(opts.freq ?? 800, at);
  if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, at + dur);
  f.Q.value = opts.q ?? 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.3, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(opts.out ?? e.effects);
  src.start(at, Math.random() * 1.5);
  src.stop(at + dur + 0.02);
}

/** Notes one after another. */
function arp(e: Engine, at: number, freqs: number[], step: number, opts: { wave?: Wave; gain?: number; len?: number } = {}): void {
  freqs.forEach((f, i) => note(e, at + i * step, f, opts.len ?? step * 2.2, { wave: opts.wave ?? 'triangle', gain: opts.gain ?? 0.22 }));
}

const N = (semitones: number) => 440 * Math.pow(2, (semitones - 9) / 12); // semitones from C4 (N(0) ≈ 261.6 Hz)

// ------------------------------------------------------------------ the sounds

const SOUNDS: Record<SoundId, (e: Engine, t: number) => void> = {
  tap: (e, t) => note(e, t, 1250, 0.035, { wave: 'sine', gain: 0.07 }),
  refused: (e, t) => {
    note(e, t, 196, 0.12, { wave: 'square', gain: 0.07 });
    note(e, t + 0.11, 147, 0.18, { wave: 'square', gain: 0.07 });
  },
  build: (e, t) => {
    burst(e, t, 0.22, { freq: 380, gain: 0.45 });
    note(e, t, 110, 0.25, { wave: 'sine', gain: 0.35, glide: 55 });
    for (let i = 0; i < 3; i++) burst(e, t + 0.16 + i * 0.07, 0.04, { type: 'bandpass', freq: 2400, q: 6, gain: 0.25 });
  },
  upgrade: (e, t) => {
    burst(e, t, 0.12, { type: 'bandpass', freq: 1800, q: 4, gain: 0.2 });
    arp(e, t + 0.05, [N(0), N(4), N(7), N(12)], 0.07, { gain: 0.2 });
  },
  merge: (e, t) => {
    burst(e, t, 0.3, { freq: 300, gain: 0.35 });
    arp(e, t + 0.1, [N(7), N(12)], 0.09);
  },
  collectPower: (e, t) => arp(e, t, [N(12), N(16), N(19)], 0.045, { wave: 'square', gain: 0.07, len: 0.09 }),
  collectFood: (e, t) => {
    note(e, t, N(9), 0.18, { wave: 'sine', gain: 0.22 });
    note(e, t + 0.07, N(14), 0.22, { wave: 'sine', gain: 0.18 });
  },
  collectWater: (e, t) => {
    note(e, t, 520, 0.09, { wave: 'sine', gain: 0.2, glide: 900 });
    note(e, t + 0.08, 640, 0.1, { wave: 'sine', gain: 0.16, glide: 1150 });
  },
  collectMedical: (e, t) => arp(e, t, [N(16), N(21)], 0.06, { wave: 'sine', gain: 0.16 }),
  scrip: (e, t) => {
    note(e, t, 1318, 0.08, { wave: 'triangle', gain: 0.16 });
    note(e, t + 0.06, 1976, 0.22, { wave: 'triangle', gain: 0.16 });
  },
  crate: (e, t) => {
    burst(e, t, 0.25, { type: 'bandpass', freq: 600, sweepTo: 2400, q: 1.5, gain: 0.25 });
    note(e, t + 0.2, N(19), 0.35, { wave: 'triangle', gain: 0.18 });
  },
  crateRare: (e, t) => {
    SOUNDS.crate(e, t);
    arp(e, t + 0.3, [N(12), N(16), N(19), N(24)], 0.06, { gain: 0.16 });
  },
  crateLegendary: (e, t) => {
    SOUNDS.crate(e, t);
    arp(e, t + 0.3, [N(7), N(12), N(16), N(19), N(24)], 0.08, { wave: 'square', gain: 0.08, len: 0.3 });
    note(e, t + 0.75, N(24), 0.9, { wave: 'triangle', gain: 0.2 });
    note(e, t + 0.75, N(28), 0.9, { wave: 'triangle', gain: 0.12 });
  },
  alarm: (e, t) => {
    for (let i = 0; i < 3; i++) {
      note(e, t + i * 0.36, 660, 0.18, { wave: 'square', gain: 0.07 });
      note(e, t + i * 0.36 + 0.18, 520, 0.18, { wave: 'square', gain: 0.07 });
    }
  },
  allClear: (e, t) => arp(e, t, [N(12), N(7), N(16)], 0.1, { wave: 'triangle', gain: 0.18 }),
  achievement: (e, t) => {
    arp(e, t, [N(12), N(16), N(19), N(24), N(28)], 0.06, { gain: 0.16 });
    note(e, t + 0.3, N(31), 0.6, { wave: 'sine', gain: 0.1 });
  },
  arrival: (e, t) => {
    burst(e, t, 0.08, { freq: 500, gain: 0.35 });
    burst(e, t + 0.16, 0.08, { freq: 500, gain: 0.35 });
    note(e, t + 0.35, N(7), 0.25, { wave: 'triangle', gain: 0.14 });
    note(e, t + 0.45, N(12), 0.35, { wave: 'triangle', gain: 0.14 });
  },
  birth: (e, t) => arp(e, t, [N(19), N(24), N(28)], 0.12, { wave: 'sine', gain: 0.14, len: 0.5 }),
  death: (e, t) => {
    note(e, t, N(3), 0.9, { wave: 'triangle', gain: 0.16 });
    note(e, t + 0.25, N(-2), 1.2, { wave: 'triangle', gain: 0.14 });
  },
  levelUp: (e, t) => arp(e, t, [N(7), N(12), N(16), N(19)], 0.05, { wave: 'square', gain: 0.06, len: 0.12 }),
  rushFail: (e, t) => {
    burst(e, t, 0.5, { freq: 3000, sweepTo: 200, gain: 0.3 });
    note(e, t, 300, 0.4, { wave: 'sawtooth', gain: 0.08, glide: 80 });
  },
  hit: (e, t) => burst(e, t, 0.07, { type: 'bandpass', freq: 900, q: 2, gain: 0.3 }),
  crit: (e, t) => {
    burst(e, t, 0.09, { type: 'bandpass', freq: 1400, q: 2, gain: 0.35 });
    note(e, t, 1760, 0.2, { wave: 'triangle', gain: 0.14 });
  },
  enemyDown: (e, t) => {
    burst(e, t, 0.3, { freq: 250, gain: 0.45 });
    note(e, t, 150, 0.3, { gain: 0.25, glide: 50 });
  },
  questWon: (e, t) => {
    arp(e, t, [N(0), N(4), N(7), N(12)], 0.11, { wave: 'square', gain: 0.07, len: 0.2 });
    note(e, t + 0.45, N(12), 0.9, { wave: 'triangle', gain: 0.2 });
    note(e, t + 0.45, N(16), 0.9, { wave: 'triangle', gain: 0.14 });
    note(e, t + 0.45, N(19), 0.9, { wave: 'triangle', gain: 0.12 });
  },
  questLost: (e, t) => arp(e, t, [N(7), N(3), N(0), N(-5)], 0.18, { wave: 'triangle', gain: 0.15, len: 0.5 }),
  research: (e, t) => {
    for (let i = 0; i < 4; i++) note(e, t + i * 0.05, 1800 + ((i * 373) % 900), 0.04, { wave: 'square', gain: 0.04 });
    note(e, t + 0.22, N(24), 0.4, { wave: 'sine', gain: 0.14 });
  },
  craft: (e, t) => {
    for (let i = 0; i < 3; i++) burst(e, t + i * 0.12, 0.06, { type: 'bandpass', freq: 3200, q: 8, gain: 0.3 });
    note(e, t + 0.38, N(19), 0.3, { wave: 'triangle', gain: 0.14 });
  },
};

/** Every sound effect, for tests and a sound check. */
export const SOUND_IDS = Object.keys(SOUNDS) as SoundId[];

/** Play a sound effect now (no-op before the first user gesture, while muted, or right after the same sound). */
export function playSound(id: SoundId): void {
  const e = engine;
  if (!e || settings.muted || settings.master <= 0 || settings.effects <= 0 || e.ctx.state !== 'running') return;
  const t = e.ctx.currentTime;
  if (t - (lastPlayed.get(id) ?? -1) < MIN_GAP_S) return;
  lastPlayed.set(id, t);
  try {
    SOUNDS[id](e, t + 0.01);
  } catch (err) {
    console.warn('Sound failed:', id, err);
  }
}

// ------------------------------------------------------------------ ambience

/**
 * The homestead's background: a low machine hum from two detuned sines, air moving
 * through ducts (noise through a slowly wandering low-pass), and now and then a
 * distant pipe knock.
 */
function startAmbience(e: Engine): void {
  if (e.ambienceStarted) return;
  e.ambienceStarted = true;
  const { ctx } = e;
  const hum = ctx.createGain();
  hum.gain.value = 0.12;
  hum.connect(e.ambience);
  for (const f of [55, 55.35, 110.2]) {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    o.type = f > 100 ? 'triangle' : 'sine';
    const g = ctx.createGain();
    g.gain.value = f > 100 ? 0.25 : 0.5;
    o.connect(g).connect(hum);
    o.start();
  }
  const air = ctx.createBufferSource();
  air.buffer = e.noise;
  air.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 320;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 140;
  lfo.connect(lfoGain).connect(lp.frequency);
  const airGain = ctx.createGain();
  airGain.gain.value = 0.05;
  air.connect(lp).connect(airGain).connect(e.ambience);
  air.start();
  lfo.start();
  const knock = () => {
    if (e.ctx.state === 'running' && !settings.muted && settings.ambience > 0) {
      const t = ctx.currentTime;
      const f = 180 + Math.random() * 260;
      burst(e, t, 0.5, { type: 'bandpass', freq: f, q: 18, gain: 0.25, out: e.ambience });
      if (Math.random() < 0.5) burst(e, t + 0.22, 0.4, { type: 'bandpass', freq: f * 1.5, q: 18, gain: 0.15, out: e.ambience });
    }
    setTimeout(knock, 14_000 + Math.random() * 26_000);
  };
  setTimeout(knock, 8000);
}

// ------------------------------------------------------------------ wiring

/** Commands the player runs directly: a refusal gets a buzz. (The rest run in the background.) */
const PLAYER_COMMANDS = new Set<Command['type']>(['build', 'upgrade', 'moveRoom', 'rush', 'assign', 'openCrate', 'craft', 'research', 'startQuest', 'startContract', 'explore', 'trade', 'sendCaravan', 'buyPerk', 'heal', 'purge', 'revive', 'equip']);

/** Which sound, if any, a sim event makes. */
export function soundFor(ev: GameEvent): SoundId | null {
  switch (ev.type) {
    case 'roomBuilt':
      return 'build';
    case 'roomUpgraded':
      return 'upgrade';
    case 'roomsMerged':
      return 'merge';
    case 'collected':
      if (ev.offline) return null;
      return ev.resource === 'power' ? 'collectPower' : ev.resource === 'food' ? 'collectFood' : ev.resource === 'water' ? 'collectWater' : 'collectMedical';
    case 'crateOpened': {
      const best = ev.cards.reduce((r, c) => ('rarity' in c ? Math.max(r, c.rarity === 'legendary' ? 2 : c.rarity === 'rare' ? 1 : 0) : r), ev.tier === 'legendary' ? 2 : ev.tier === 'rare' ? 1 : 0);
      return best === 2 ? 'crateLegendary' : best === 1 ? 'crateRare' : 'crate';
    }
    case 'incidentStarted':
    case 'maulerStirring':
      return 'alarm';
    case 'incidentResolved':
      return 'allClear';
    case 'achievementUnlocked':
      return 'achievement';
    case 'residentArrived':
    case 'legendArrived':
      return 'arrival';
    case 'birth':
      return 'birth';
    case 'residentDied':
    case 'explorerDied':
      return 'death';
    case 'residentLeveled':
    case 'statTrained':
    case 'masteryUp':
      return 'levelUp';
    case 'rushFailed':
      return 'rushFail';
    case 'rushSucceeded':
    case 'traded':
    case 'questCollected':
    case 'expeditionCollected':
    case 'caravanCollected':
      return 'scrip';
    case 'questHit':
      return ev.crit ? 'crit' : 'hit';
    case 'questEnemyDown':
      return 'enemyDown';
    case 'questFinished':
      return ev.outcome === 'success' ? 'questWon' : ev.outcome === 'failed' ? 'questLost' : null;
    case 'researchDone':
      return 'research';
    case 'craftCollected':
    case 'reforged':
      return 'craft';
    default:
      return null;
  }
}

/** Refused player actions buzz; everything else is heard through its events. */
export function soundForCommand(cmd: Command, res: CommandResult): SoundId | null {
  return !res.ok && PLAYER_COMMANDS.has(cmd.type) ? 'refused' : null;
}

/** Hook sound up to the game: events, refused actions, taps, settings and the app lifecycle. */
export function initAudio(game: Game): void {
  const unlock = () => {
    const e = start();
    if (!e) return;
    if (e.ctx.state === 'suspended' && !document.hidden) void e.ctx.resume().catch(() => {});
    startAmbience(e);
  };
  for (const type of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(type, unlock, { capture: true, passive: true });
  // A soft click for every button pressed.
  window.addEventListener(
    'click',
    (ev) => {
      const el = ev.target as Element | null;
      if (el?.closest?.('button, [role="button"], [role="switch"], [role="tab"]')) playSound('tap');
    },
    { capture: true, passive: true },
  );
  game.on((events) => {
    // What happened while the player was away is summarised on screen, not replayed.
    if (game.flushingAway) return;
    const heard = new Set<SoundId>();
    for (const ev of events) {
      const id = soundFor(ev);
      if (id && !heard.has(id)) {
        heard.add(id);
        playSound(id);
      }
    }
  });
  game.onCommand((cmd, res) => {
    const id = soundForCommand(cmd, res);
    if (id) playSound(id);
  });
  game.onLifecycle((phase) => {
    if (!engine) return;
    if (phase === 'suspend') void engine.ctx.suspend().catch(() => {});
    else void engine.ctx.resume().catch(() => {});
  });
  onSettingsChange((s) => {
    settings = s.sound;
    applyVolumes();
  });
}

/** Test hook: the settings the engine is playing with. */
export function soundSettingsForTests(): SoundSettings {
  return settings;
}
