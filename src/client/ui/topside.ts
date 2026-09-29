// M7 Topside in the client: the weather HUD chip (and its modal), the
// Influence chip, weather toasts and the taint-storm warning, the
// approaching-raiders banner while a Watchtower has them in sight, and the
// room-panel sections for surface buildings (the weather multiplier, the
// Watchtower's raid defense, the Signal Mast's reach and the Trading Post's
// board and caravans). The sim side is src/sim/systems/weather.ts.

import {
  caravanSlots,
  effectiveStats,
  factionsContent,
  isAway,
  isMet,
  isTopside,
  raidDefense,
  roomDef,
  signalLevel,
  stormShielding,
  topsideContent,
  tradeOffers,
  tradingPostStaffed,
  weatherMult,
  workersInRoom,
  type GameEvent,
  type Room,
  type WeatherKind,
} from '../../sim';
import type { Game } from '../game';
import type { FactionsTab } from './factions';
import { iconize } from './art';
import { duration, fmt, h } from './dom';
import type { ToastFn } from './toasts';

export interface TopsideHost {
  game: Game;
  modalHost: HTMLElement;
  toast: ToastFn;
  openFactions(tab?: FactionsTab, factionId?: string): void;
  openCaravan(factionId: string | null): void;
}

const WEATHER_ICON: Record<WeatherKind, string> = { clear: ':weather_clear:', dust: ':weather_dust:', taintstorm: ':weather_taintstorm:', heatwave: ':weather_heatwave:' };
/** Short names for surface buildings in the weather chip. */
const SHORT: Record<string, string> = { solar_array: 'Solar', wind_turbine: 'Wind', rain_catcher: 'Rain', farm_plots: 'Farms' };

const pct = (v: number) => `${Math.round(v * 100)}%`;
const mult = (m: number) => `×${Math.round(m * 100) / 100}`;

export class TopsideUI {
  private banner = h('div', { class: 'raid-banner', style: 'display:none' });

  constructor(
    private host: TopsideHost,
    root: HTMLElement,
  ) {
    root.append(this.banner);
  }

  private get game(): Game {
    return this.host.game;
  }

  /** The surface is part of this homestead's life: surveyed, or built on. */
  visible(): boolean {
    const { state } = this.game;
    return state.research.done.includes('topside_survey') || state.rooms.some(isTopside);
  }

  /** Multiplier the weather puts on a surface building type right now. */
  private multFor(type: string): number {
    const { state, content } = this.game;
    const probe = { id: -1, type, floor: -1, x: 0, segments: 1, level: 1, pool: 0, ready: false, powered: true, timer: 0, job: null, banked: 0 } as Room;
    return weatherMult(state, content, probe);
  }

  /** Surface producers to describe: the ones built, else every one there is. */
  private producerTypes(): string[] {
    const { state, content } = this.game;
    const all = content.roomList.filter((d) => d.topside && d.produces).map((d) => d.id);
    const built = all.filter((t) => state.rooms.some((r) => r.type === t));
    return built.length ? built : all;
  }

  /** "Solar ×0.35": the building the weather hits (or helps) hardest. */
  private headline(): string {
    let best: { t: string; m: number } | null = null;
    for (const t of this.producerTypes()) {
      const m = this.multFor(t);
      if (!best || Math.abs(m - 1) > Math.abs(best.m - 1)) best = { t, m };
    }
    if (!best) return '';
    if (Math.abs(best.m - 1) < 0.005) return 'Normal output';
    return `${SHORT[best.t] ?? this.game.content.rooms[best.t]?.name ?? best.t} ${mult(best.m)}`;
  }

  /** People in surface buildings right now (exposed to storms). */
  private exposed(): number {
    const { state } = this.game;
    const top = new Set(state.rooms.filter(isTopside).map((r) => r.id));
    return state.residents.filter((r) => r.roomId !== null && top.has(r.roomId) && !r.dead && !r.waiting && !isAway(r)).length;
  }

  hudChips(): HTMLElement[] {
    const out: HTMLElement[] = [];
    const { state, content } = this.game;
    if (this.visible() && state.weather) {
      const w = state.weather;
      const def = topsideContent(content).weather.kinds[w.kind];
      const storm = w.kind === 'taintstorm' && this.exposed() > 0;
      out.push(
        h(
          'button',
          { class: `stat-chip chip-button weather-chip w-${w.kind}${storm ? ' alarm' : ''}`, title: `${def?.name ?? w.kind}: ${def?.description ?? ''}`, onclick: () => this.showWeather() },
          `${WEATHER_ICON[w.kind]} `,
          h('span', { class: 'weather-name' }, `${def?.name ?? w.kind} `),
          h('b', {}, duration(Math.max(0, w.remaining)).replace(/ \d+s$/, '')),
          h('span', { class: 'weather-fx' }, ` · ${this.headline()}`),
        ),
      );
    }
    const anyMet = Object.values(state.factions ?? {}).some((f) => f.met);
    const home = (state.caravans ?? []).filter((c) => c.status === 'returned').length;
    if (anyMet || state.influence > 0 || this.visible()) {
      out.push(
        h(
          'button',
          { class: `stat-chip chip-button influence-chip${home ? ' glow' : ''}`, title: home ? `${home} caravan${home === 1 ? '' : 's'} home · open Factions` : 'Influence · open Factions', onclick: () => this.host.openFactions(home ? 'caravans' : 'factions') },
          '✦ ',
          h('b', {}, fmt(state.influence)),
          home ? h('span', {}, ` 🛒${home}`) : null,
        ),
      );
    }
    return out;
  }

  private showWeather(): void {
    const { state, content } = this.game;
    const tc = topsideContent(content);
    const w = state.weather;
    const def = tc.weather.kinds[w.kind];
    const close = () => this.host.modalHost.replaceChildren();
    const rows = content.roomList
      .filter((d) => d.topside && d.produces)
      .map((d) => {
        const m = this.multFor(d.id);
        return h('div', { class: 'row small' }, h('span', {}, `${d.name}${state.rooms.some((r) => r.type === d.id) ? '' : ' (not built)'}`), h('b', { class: m < 0.995 ? 'short' : m > 1.005 ? 'ok-text' : '' }, mult(m)));
      });
    const storm = (def?.taintPerMin ?? 0) > 0;
    const shield = stormShielding(state, content);
    this.host.modalHost.replaceChildren(
      h(
        'div',
        { class: 'modal-backdrop', onclick: (e: Event) => e.target === e.currentTarget && close() },
        h(
          'div',
          { class: `modal weather-modal w-${w.kind}` },
          h('h2', {}, `${WEATHER_ICON[w.kind]} ${def?.name ?? w.kind}`),
          h('p', { class: 'muted' }, def?.description ?? ''),
          h('div', { class: 'row' }, 'Changes in', h('b', {}, duration(Math.max(0, w.remaining)))),
          h('h3', { class: 'group' }, 'Surface output'),
          ...rows,
          storm
            ? h('p', { class: 'small short' }, `☢ Anyone working topside soaks up ${def?.taintPerMin ?? 0} Glare a minute${shield > 0 ? `, ${pct(shield)} less thanks to shelter` : ''}. ${this.exposed()} out there now.`)
            : h('p', { class: 'muted small' }, 'Weather only touches buildings on the surface. Weather Seals research softens the bad spells.'),
          h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:12px' }, h('button', { class: 'primary', onclick: close }, 'Got it')),
        ),
      ),
    );
  }

  /** Every frame: the approaching-raiders banner. */
  update(): void {
    const { state } = this.game;
    const raid = state.incidents.find((i) => i.type === 'rustmen' && (i.warning ?? 0) > 0);
    if (!raid) {
      if (this.banner.style.display !== 'none') this.banner.style.display = 'none';
      return;
    }
    const text = `:inc_rustmen: Raiders sighted from the Watchtower · at the door in ${Math.ceil(raid.warning ?? 0)}s · station armed guards at the door`;
    if (this.banner.dataset.text !== text) {
      this.banner.dataset.text = text;
      this.banner.replaceChildren(...iconize(text));
    }
    if (this.banner.style.display !== '') this.banner.style.display = '';
  }

  // ---------------------------------------------------------------- room panel

  roomSection(room: Room): HTMLElement[] {
    if (!isTopside(room)) return [];
    const { state, content } = this.game;
    const def = roomDef(content, room);
    const out: HTMLElement[] = [];
    const w = state.weather;
    const wdef = topsideContent(content).weather.kinds[w.kind];
    if (def.produces) {
      const m = weatherMult(state, content, room);
      out.push(
        h(
          'div',
          { class: `row weather-row w-${w.kind}` },
          h('span', {}, `${WEATHER_ICON[w.kind]} ${wdef?.name ?? w.kind}`),
          h('b', { class: m < 0.995 ? 'short' : m > 1.005 ? 'ok-text' : '' }, `${mult(m)} output`),
        ),
      );
    } else {
      out.push(h('div', { class: 'row muted small' }, `${WEATHER_ICON[w.kind]} ${wdef?.name ?? w.kind} · open to the sky`));
    }
    if ((wdef?.taintPerMin ?? 0) > 0 && workersInRoom(state, room.id).length) {
      const shield = stormShielding(state, content);
      out.push(h('div', { class: 'row small short' }, `☢ The crew here is soaking up Glare (${pct(shield)} sheltered). Move them below until it passes.`));
    }
    if (room.type === 'watchtower') out.push(...this.watchtowerSection(room));
    if (room.type === 'signal_mast') out.push(...this.mastSection());
    if (room.type === 'trading_post') out.push(...this.tradingPostSection());
    return out;
  }

  private watchtowerSection(room: Room): HTMLElement[] {
    const { state, content } = this.game;
    const t = topsideContent(content).watchtower;
    const d = raidDefense(state, content);
    const crew = workersInRoom(state, room.id);
    const out: HTMLElement[] = [h('h3', { class: 'group' }, 'Raid defense')];
    if (!d.towers) {
      out.push(h('p', { class: 'small short' }, 'Unstaffed: no warning and no protection. Put residents with good Sight up here.'));
    } else {
      out.push(
        h('div', { class: 'defense-grid' }, h('span', {}, '🚪 Door damage', h('b', {}, `−${pct(1 - d.doorDamageMult)}`)), h('span', {}, '🛡 Raider damage', h('b', {}, `−${pct(1 - d.damageMult)}`)), h('span', {}, '👁 Warning', h('b', {}, `${Math.round(d.warnSeconds)}s`))),
      );
      const sight = crew.reduce((s, r) => s + effectiveStats(content, r).sight, 0);
      if (t && sight < t.sightForFull) out.push(h('div', { class: 'muted small' }, `Crew Sight ${sight}/${t.sightForFull}: more Sight gives the full share.`));
    }
    const shelter = stormShielding(state, content);
    out.push(h('div', { class: 'muted small' }, `${d.towers > 1 ? `${d.towers} staffed towers add up. ` : ''}Towers also shelter topside workers in taint storms (${pct(shelter)} now).`));
    return out;
  }

  private mastSection(): HTMLElement[] {
    const { state, content } = this.game;
    const sig = signalLevel(state, content);
    const defs = factionsContent(content).factions;
    return [
      h('h3', { class: 'group' }, `Signal level ${sig}`),
      ...defs.map((f) =>
        h(
          'div',
          { class: 'row small' },
          h('span', {}, f.shortName ?? f.name),
          h('span', { class: isMet(state, f.id) ? 'ok-text' : sig >= f.mastLevel ? 'ok-text' : 'muted' }, isMet(state, f.id) ? '✓ In contact' : sig >= f.mastLevel ? 'In range' : `Level ${f.mastLevel}`),
        ),
      ),
      h('div', { class: 'row', style: 'justify-content:flex-start;margin-top:6px' }, h('button', { class: 'close', onclick: () => this.host.openFactions('factions') }, '🤝 Factions')),
    ];
  }

  private tradingPostSection(): HTMLElement[] {
    const { state } = this.game;
    const staffed = tradingPostStaffed(state);
    const offers = tradeOffers(state).filter((o) => o.stock > 0).length;
    const left = state.trade.refreshAt - state.time;
    const slots = caravanSlots(state);
    const out = (state.caravans ?? []).length;
    return [
      h('h3', { class: 'group' }, 'Trade'),
      h('div', { class: `row small${staffed ? '' : ' short'}` }, h('span', {}, staffed ? `${offers} offer${offers === 1 ? '' : 's'} on the board` : '⚠ Unstaffed: no fresh offers'), h('span', { class: 'muted' }, staffed && left > 0 ? `new in ${duration(left)}` : '')),
      h('div', { class: 'row small' }, h('span', {}, `Caravans ${out}/${slots}`), h('span', { class: 'muted' }, 'Each level adds a slot')),
      h(
        'div',
        { class: 'row', style: 'justify-content:flex-start;gap:6px;margin-top:6px' },
        h('button', { class: 'close primary', onclick: () => this.host.openFactions('trade') }, '🤝 Trade board'),
        h('button', { class: 'close', disabled: out >= slots, onclick: () => this.host.openCaravan(null) }, '🛒 Send caravan'),
      ),
    ];
  }

  // ---------------------------------------------------------------- toasts

  onEvents(events: GameEvent[]): void {
    const { content } = this.game;
    // After a long absence the sky may have turned over dozens of times: only the latest counts.
    const last = [...events].reverse().find((e): e is Extract<GameEvent, { type: 'weatherChanged' }> => e.type === 'weatherChanged');
    if (!last || !this.visible()) return;
    const def = topsideContent(content).weather.kinds[last.kind];
    const exposed = this.exposed();
    if (last.kind === 'taintstorm' && exposed > 0) {
      this.host.toast(`☢ Taint storm! ${exposed} working topside ${exposed === 1 ? 'is' : 'are'} soaking up Glare. Bring them below or shelter them.`, 'bad');
    } else {
      this.host.toast(`${WEATHER_ICON[last.kind]} ${def?.name ?? last.kind} · ${this.headline()}`, last.kind === 'clear' ? 'good' : undefined, { fold: 'weather', low: last.kind === 'clear' });
    }
  }
}
