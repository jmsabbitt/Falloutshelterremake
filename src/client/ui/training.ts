// Training rooms in the UI (playtest 1, item 14): the build-list blurb, the
// room panel's trainee list with live countdowns, the resident card's status
// line, the stat flash when a point lands, and the toasts. The rules are in
// src/sim/systems/training.ts.

import {
  maxStat,
  roomDef,
  trainees,
  trainingPaused,
  trainingSpeed,
  trainingStatus,
  trainingTuning,
  type Content,
  type GameEvent,
  type GameState,
  type Resident,
  type RoomDef,
  type Room,
  type StatKey,
} from '../../sim';
import { duration, h } from './dom';
import type { ToastFn } from './toasts';

export const STAT_WORD: Record<StatKey, string> = {
  brawn: 'Brawn',
  sight: 'Sight',
  grit: 'Grit',
  charm: 'Charm',
  wits: 'Wits',
  knack: 'Knack',
  fortune: 'Fortune',
};

/** Build-list line for a training room. */
export function trainingBlurb(def: RoomDef): string | undefined {
  if (def.category !== 'training' || !def.stat) return undefined;
  return `Trains ${STAT_WORD[def.stat]} up 1 point at a time, slower the higher it gets · makes nothing`;
}

/** Resident card line: "Training Brawn 4→5 · 12m 30s left", or the maxed hint. Null outside a training room. */
export function trainingLine(state: GameState, content: Content, r: Resident): string | null {
  const t = trainingStatus(state, content, r);
  if (!t) return null;
  const name = STAT_WORD[t.stat];
  if (t.maxed) return `${name} maxed at ${t.value}: move them to a job that uses it`;
  const head = `Training ${name} ${t.value}→${t.value + 1}`;
  if (t.paused === 'power') return `${head} · paused (no power)`;
  if (t.paused === 'incident') return `${head} · paused (incident)`;
  return `${head} · ${duration(t.secondsLeft)} left`;
}

/** What upgrading does to a training room's speed, for the upgrade box. */
export function trainingGain(state: GameState, content: Content, room: Room): [string, string, string] | null {
  if (roomDef(content, room).category !== 'training') return null;
  const now = trainingSpeed(state, content, room);
  const next = trainingSpeed(state, content, { ...room, level: room.level + 1 });
  return ['Training speed', `${Math.round(now * 100)}%`, `${Math.round(next * 100)}%`];
}

/** The room panel section: how training works here, then each trainee's progress. */
export function trainingSection(state: GameState, content: Content, room: Room): HTMLElement[] {
  const def = roomDef(content, room);
  if (def.category !== 'training' || !def.stat) return [];
  const stat = def.stat;
  const name = STAT_WORD[stat];
  const t = trainingTuning(content);
  const crew = trainees(state, room);
  const speed = trainingSpeed(state, content, room, crew.length);
  const paused = trainingPaused(state, room);
  const out: HTMLElement[] = [
    h(
      'div',
      { class: 'row muted' },
      `Trains ${name} by 1 point at a time. Each point takes ${Math.round(t.secondsPerPoint / 60)} min × the current ${name}, so 9→10 is the long haul. Room level and company speed it up.`,
    ),
    h('div', { class: 'row' }, 'Training speed', h('b', {}, `${Math.round(speed * 100)}%`)),
  ];
  if (paused) out.push(h('div', { class: 'row', style: 'color:var(--danger)' }, paused === 'power' ? 'Paused: no power' : 'Paused: incident in the room'));
  if (!crew.length) {
    out.push(h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Nobody is training.'), h('b', { class: 'short' }, 'Needs trainees')));
    return out;
  }
  const rows = crew.map((r) => {
    const s = trainingStatus(state, content, r);
    if (!s) return null;
    const label = s.maxed ? `${name} ${s.value} (max)` : `${name} ${s.value}→${s.value + 1}`;
    const right = s.maxed ? h('b', { class: 'short' }, 'Move to a job') : s.paused ? h('b', { class: 'short' }, 'Paused') : h('b', {}, `${duration(s.secondsLeft)} left`);
    return h(
      'div',
      { class: `train-row${s.maxed ? ' maxed' : ''}` },
      h('div', { class: 'row', style: 'margin:0' }, h('span', {}, h('b', {}, r.firstName), ` · ${label}`), right),
      h('div', { class: 'train-bar' }, h('div', { class: 'fill', style: `width:${Math.round(s.fraction * 100)}%` })),
    );
  });
  out.push(h('h3', { class: 'group' }, 'Trainees'), h('div', { class: 'train-list' }, ...rows.filter((x): x is HTMLDivElement => x !== null)));
  if (crew.some((r) => r.stats[stat] >= maxStat(content))) out.push(h('div', { class: 'muted small' }, `Maxed trainees gain nothing more here. Put them to work where ${name} counts, and free the spot for someone else.`));
  return out;
}

const FLASH_MS = 4000;

/** Recently raised stats per resident, so their card can flash the number. */
export class StatFlash {
  private until = new Map<string, number>();

  note(events: GameEvent[]): void {
    const now = performance.now();
    for (const ev of events) if (ev.type === 'statTrained') this.until.set(`${ev.residentId}:${ev.stat}`, now + FLASH_MS);
  }

  /** ' flash' while the stat is freshly raised. */
  cls(residentId: number, stat: StatKey): string {
    const key = `${residentId}:${stat}`;
    const at = this.until.get(key);
    if (at === undefined) return '';
    if (performance.now() > at) {
      this.until.delete(key);
      return '';
    }
    return ' flash';
  }
}

/** Toast for a raised stat. */
export function statTrainedToast(state: GameState, content: Content, ev: Extract<GameEvent, { type: 'statTrained' }>, toast: ToastFn): void {
  const r = state.residents.find((x) => x.id === ev.residentId);
  const who = r ? r.firstName : 'Someone';
  const name = STAT_WORD[ev.stat];
  if (ev.source === 'level') {
    toast(`⬆ Level ${r?.level ?? ''}: ${who} gains +1 ${name} (now ${ev.value}).`, 'gold', { fold: 'statLevel', low: true });
  } else if (ev.value >= maxStat(content)) {
    toast(`🏅 ${who} maxed ${name} at ${ev.value}! Time for a job that uses it.`, 'gold', { fold: 'statMaxed' });
  } else {
    toast(`💪 ${who}'s ${name} is up to ${ev.value}.`, 'good', { fold: 'statTrained', low: true });
  }
}
