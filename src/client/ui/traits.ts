// M6 traits and mastery in the client: trait chips (tap or hover for what
// they do), profession titles, mastery progress, how a resident's traits suit
// a room, the shift clock, and mastery toasts. Hooked into ui.ts with a few
// small calls; the sim side is src/sim/systems/traits.ts.

import {
  currentShift,
  homesteadHour,
  isDeepFloor,
  masteryProgress,
  masteryTier,
  masteryTierName,
  professionTitle,
  roomDef,
  traitDefs,
  traitHappiness,
  traitsContent,
  workerMult,
  type Content,
  type GameEvent,
  type GameState,
  type Resident,
  type Room,
  type TraitDef,
} from '../../sim';
import type { Game } from '../game';
import { h } from './dom';
import type { ToastFn } from './toasts';

export interface TraitsHost {
  game: Game;
  toast: ToastFn;
  refreshPanel(): void;
}

type Tone = 'work' | 'mood' | 'fight' | 'field' | 'mind' | 'heart';

/** A trait's flavour, for its chip colour: what its first effect is about. */
function toneOf(def: TraitDef): Tone {
  const kinds = def.effects.map((e) => e.kind);
  if (kinds.includes('production')) return 'work';
  if (kinds.includes('combat') || kinds.includes('damageTaken') || kinds.includes('critRing')) return 'fight';
  if (kinds.some((k) => k.startsWith('explorer') || k === 'questCheck')) return 'field';
  if (kinds.includes('xp') || kinds.includes('mastery')) return 'mind';
  if (kinds.includes('courtship')) return 'heart';
  return 'mood';
}

const SHIFT_ICON = { morning: '🌅', day: '☀', night: '🌙' } as const;
const SHIFT_NAME = { morning: 'Morning', day: 'Day', night: 'Night' } as const;

export class TraitsUI {
  /** The chip whose summary is showing: `${residentId}:${traitId}`. */
  private open: string | null = null;

  constructor(private host: TraitsHost) {}

  private get game(): Game {
    return this.host.game;
  }

  /**
   * Trait chips for a resident. Hover shows the summary; a tap opens it
   * inline under the chips (see tip()) without selecting the card.
   */
  chips(r: Resident, max = 3): HTMLElement | null {
    const defs = traitDefs(this.game.content, r).slice(0, max);
    if (!defs.length) return null;
    return h(
      'span',
      { class: 'trait-chips' },
      ...defs.map((d) => {
        const key = `${r.id}:${d.id}`;
        return h(
          'button',
          {
            class: `trait-chip ${toneOf(d)}${this.open === key ? ' open' : ''}`,
            title: `${d.name}: ${d.summary}`,
            onclick: (e: Event) => {
              e.stopPropagation();
              this.open = this.open === key ? null : key;
              this.host.refreshPanel();
            },
          },
          d.name,
        );
      }),
    );
  }

  /** The one chip for a compact card: the trait that matters where they are. Tap opens it. */
  topChip(r: Resident): HTMLElement | null {
    const pick = this.relevant(r);
    if (!pick) return null;
    const key = `${r.id}:${pick.def.id}`;
    return h(
      'button',
      {
        class: `trait-chip mini ${toneOf(pick.def)}${this.open === key ? ' open' : ''}`,
        title: `${pick.def.name}: ${pick.def.summary}`,
        onclick: (e: Event) => {
          e.stopPropagation();
          this.open = this.open === key ? null : key;
          this.host.refreshPanel();
        },
      },
      pick.def.name,
      pick.more ? h('span', { class: 'more' }, ` +${pick.more} more trait${pick.more === 1 ? '' : 's'}`) : null,
    );
  }

  /** A passive tag (hover for the summary) for rows that are one tap target, like the resident list. */
  tag(r: Resident): HTMLElement | null {
    const pick = this.relevant(r);
    if (!pick) return null;
    return h('span', { class: `trait-chip mini tag ${toneOf(pick.def)}`, title: `${pick.def.name}: ${pick.def.summary}` }, pick.def.name, pick.more ? h('span', { class: 'more' }, ` +${pick.more} more trait${pick.more === 1 ? '' : 's'}`) : null);
  }

  /** For the bulk room picker: how many of a group the room's place suits, and how many it doesn't. */
  groupFit(rs: Resident[], room: Room): HTMLElement | null {
    const { state, content } = this.game;
    let up = 0;
    let down = 0;
    for (const r of rs) {
      const f = traitFit(state, content, r, room);
      const score = f.prod * 100 + f.mood * 0.6;
      if (score > 0.5) up++;
      else if (score < -0.5) down++;
    }
    if (!up && !down) return null;
    return h(
      'span',
      { class: 'fit-group', title: 'Residents whose traits help (▲) or hurt (▼) here' },
      up ? h('span', { class: 'fit good' }, `▲${up}`) : null,
      down ? h('span', { class: 'fit bad' }, `▼${down}`) : null,
    );
  }

  private relevant(r: Resident): { def: TraitDef; more: number } | null {
    const { state, content } = this.game;
    const defs = traitDefs(content, r);
    if (!defs.length) return null;
    const room = r.roomId !== null ? state.rooms.find((x) => x.id === r.roomId) : undefined;
    const res = room ? content.rooms[room.type]?.produces?.resource : undefined;
    const cat = room ? content.rooms[room.type]?.category : undefined;
    const here = defs.find((d) => d.effects.some((e) => e.kind === 'production' && ((res && e.resources?.includes(res)) || (cat && e.categories?.includes(cat)))));
    return { def: here ?? (defs[0] as TraitDef), more: defs.length - 1 };
  }

  /** The opened chip's summary and flavour text, if it belongs to this resident. */
  tip(r: Resident): HTMLElement | null {
    if (!this.open?.startsWith(`${r.id}:`)) return null;
    const id = this.open.slice(String(r.id).length + 1);
    const def = traitDefs(this.game.content, r).find((d) => d.id === id);
    if (!def) return null;
    return h('div', { class: `trait-tip ${toneOf(def)}` }, h('b', {}, def.name), ` ${def.summary}`, def.description ? h('div', { class: 'muted small' }, def.description) : null);
  }

  /** Profession title and mastery in the current job, for the detailed card. */
  mastery(r: Resident): HTMLElement | null {
    const { state, content } = this.game;
    if (r.adultAt !== null && state.time < r.adultAt) return null;
    const title = professionTitle(content, r);
    const room = r.roomId !== null ? state.rooms.find((x) => x.id === r.roomId) : undefined;
    const def = room ? roomDef(content, room) : undefined;
    const parts: (HTMLElement | null)[] = [];
    if (room && def?.stat) {
      const tuning = traitsContent(content).tuning;
      const tier = masteryTier(content, r, room.type);
      const top = tuning.masteryTierSeconds.length - 1;
      const p = masteryProgress(content, r, room.type);
      const bonus = tuning.masteryTierBonus[tier] ?? 0;
      const hours = (r.mastery?.[room.type] ?? 0) / 3600;
      const nextAt = (tuning.masteryTierSeconds[tier + 1] ?? 0) / 3600;
      parts.push(
        h(
          'div',
          { class: 'row small', style: 'margin:4px 0 2px' },
          h('span', {}, h('b', { class: `tier-${tier}` }, masteryTierName(content, tier)), ` · ${def.name}${bonus > 0 ? ` (+${Math.round(bonus * 100)}% output)` : ''}`),
          h('span', { class: 'muted' }, tier >= top ? 'Mastered' : `${hours.toFixed(1)} / ${nextAt.toFixed(0)}h experience to ${masteryTierName(content, tier + 1)}`),
        ),
        h('div', { class: 'progress mastery-bar' }, h('div', { style: `width:${Math.round(p * 100)}%` })),
      );
    } else {
      parts.push(h('div', { class: 'muted small' }, 'Work a job with a stat to build mastery: time on the job and every batch collected count.'));
    }
    const others = Object.entries(r.mastery ?? {})
      .filter(([type, s]) => s > 0 && type !== room?.type && content.rooms[type])
      .map(([type, s]) => ({ type, s, tier: masteryTier(content, r, type) }))
      .filter((m) => m.tier >= 1)
      .sort((a, b) => b.tier - a.tier || b.s - a.s)
      .slice(0, 3);
    if (others.length) parts.push(h('div', { class: 'muted small' }, `Also: ${others.map((m) => `${masteryTierName(content, m.tier)} in ${content.rooms[m.type]?.name ?? m.type}`).join(', ')}`));
    return h('div', { class: 'mastery-block' }, title ? h('div', { class: 'profession' }, `⚒ ${title}`) : null, ...parts);
  }

  /** How this resident's traits sit with a room: a small badge, or null if they don't care. */
  fitBadge(r: Resident, room: Room): HTMLElement | null {
    const fit = traitFit(this.game.state, this.game.content, r, room);
    if (!fit.prod && !fit.mood) return null;
    const good = fit.prod * 100 + fit.mood * 0.6 >= 0;
    const bits: string[] = [];
    if (fit.prod) bits.push(`${fit.prod > 0 ? '+' : '−'}${Math.round(Math.abs(fit.prod) * 100)}%`);
    if (fit.mood) bits.push(`${fit.mood > 0 ? '☺+' : '☹−'}${Math.round(Math.abs(fit.mood))}`);
    return h('span', { class: `fit ${good ? 'good' : 'bad'}`, title: fit.why.join('; ') || 'Traits' }, `${good ? '▲' : '▼'} ${bits.join(' ')}`);
  }

  /** Extra words for the assign toast ("Spark Chaser +12%"), or ''. */
  fitNote(r: Resident, room: Room): string {
    const fit = traitFit(this.game.state, this.game.content, r, room);
    return fit.why.length ? ` · ${fit.why.join(', ')}` : '';
  }

  /** HUD chip: the homestead clock and the shift (Night Owls and Early Birds care). */
  shiftChip(): HTMLElement {
    const { state, content } = this.game;
    const hour = homesteadHour(state, content);
    const shift = currentShift(state, content);
    const span = traitsContent(content).tuning.shifts[shift];
    const hh = Math.floor(hour);
    const mm = Math.floor((hour - hh) * 60);
    const clock = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const who = shift === 'night' ? ' Night Owls work harder now.' : shift === 'morning' ? ' Early Birds work harder now.' : '';
    return h(
      'div',
      { class: `stat-chip shift-chip ${shift}`, title: `Homestead time ${clock} · ${SHIFT_NAME[shift]} shift (${span[0]}:00–${span[1]}:00).${who}` },
      `${SHIFT_ICON[shift]} `,
      h('b', {}, clock),
      h('span', { class: 'shift-name' }, ` ${SHIFT_NAME[shift]}`),
    );
  }

  onEvents(events: GameEvent[]): void {
    const { state, content } = this.game;
    const ups = events.filter((e): e is Extract<GameEvent, { type: 'masteryUp' }> => e.type === 'masteryUp');
    if (ups.length > 3) {
      const masters = ups.filter((e) => e.tier >= traitsContent(content).tuning.masteryTierSeconds.length - 1).length;
      this.host.toast(`⭐ ${ups.length} residents grew in their trades${masters ? `, ${masters} to Master` : ''}.`, 'gold', { fold: 'mastery', low: true });
      return;
    }
    for (const ev of ups) {
      const r = state.residents.find((x) => x.id === ev.residentId);
      const job = content.rooms[ev.roomType]?.name ?? ev.roomType;
      const trade = traitsContent(content).tuning.professions[ev.roomType];
      const tier = masteryTierName(content, ev.tier);
      const who = r?.firstName ?? 'Someone';
      this.host.toast(trade ? `⭐ ${who} is now a ${tier} ${trade} (${job}).` : `⭐ ${who} is now ${tier} at the ${job}.`, 'gold', { fold: 'mastery', low: true });
    }
  }
}

/**
 * What a resident's traits would do in a room: the change to their output
 * (traits only, not mastery) and to their happiness (traits and mastery
 * pride), with a few words on why. Cheap: one pass over the residents.
 */
export function traitFit(state: GameState, content: Content, r: Resident, room: Room): { prod: number; mood: number; why: string[] } {
  const defs = traitDefs(content, r);
  if (!defs.length) return { prod: 0, mood: 0, why: [] };
  const def = roomDef(content, room);
  const tuning = traitsContent(content).tuning;
  // Output only matters in jobs: stat rooms other than quarters, and workshops.
  const works = (!!def.stat && def.category !== 'living') || def.category === 'workshop';
  // Try them in the room: a copy placed there (the real one if already in it).
  const probe = r.roomId === room.id ? r : { ...r, roomId: room.id };
  const tier = masteryTier(content, r, room.type);
  const masteryBonus = def.stat ? (tuning.masteryTierBonus[tier] ?? 0) : 0;
  const prod = works ? Math.round((workerMult(state, content, probe, room) - 1 - masteryBonus) * 100) / 100 : 0;
  const pride = def.stat && tier >= tuning.masteryTierSeconds.length - 1 ? tuning.masterHappiness : 0;
  // Happiness here, against their traits with no room at all.
  const mood = Math.round(traitHappiness(state, content, probe) - pride - traitHappiness(state, content, { ...r, roomId: null }));
  // The reasons that come from the place itself (not the hour or the company).
  const deep = isDeepFloor(content, room.floor);
  const why: string[] = [];
  for (const d of defs) {
    for (const e of d.effects) {
      if (e.kind !== 'production' && e.kind !== 'happiness') continue;
      if (e.kind === 'production' && !works) continue;
      if (!(e.resources || e.categories || e.when === 'deep' || e.when === 'topside')) continue;
      if (e.resources && !(def.produces && e.resources.includes(def.produces.resource))) continue;
      if (e.categories && !e.categories.includes(def.category)) continue;
      if (e.when === 'deep' && !deep) continue;
      if (e.when === 'topside' && room.floor >= tuning.topsideFloors) continue;
      const sign = e.value > 0 ? '+' : '−';
      why.push(`${d.name} ${sign}${e.kind === 'production' ? `${Math.round(Math.abs(e.value) * 100)}%` : `${Math.abs(e.value)} mood`}`);
    }
  }
  return { prod, mood, why };
}
