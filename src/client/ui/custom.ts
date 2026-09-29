// M9 Custom Game in the client (GDD §11): the Custom Game screen (preset cards
// and an advanced form), the "CUSTOM GAME: achievements off" banner, the
// sandbox toolbar that drives the sim's `custom` command family, and the time
// scale. A Custom Game lives in its own save slot (storage.ts: liveSlot), so it
// never overwrites the homestead; Game.switchTo() goes back and forth.
//
// Mounted from main.ts (it draws its own layer over #ui); the ☰ menu section
// comes from saves.ts. See docs/design/M9-spec.md (stream D2).

import {
  CUSTOM_ACTIONS,
  customPresets,
  deepContent,
  deserialize,
  topsideContent,
  type Command,
  type CustomGameOptions,
  type GameState,
  type IncidentType,
  type Rarity,
  type WeatherKind,
} from '../../sim';
import type { CustomPreset } from '../../sim/systems/custom';
import { TIME_SCALES, type Game } from '../game';
import { onBack } from '../platform';
import { CUSTOM_SLOT, readSave } from '../storage';
import { ask } from './confirm';
import { fmt, h } from './dom';
import { rulesChips, rulesPicker, type RulesPick } from './rules';
import type { ToastFn } from './toasts';
import './m9.css';

type Action = (typeof CUSTOM_ACTIONS)[number];

const PRESET_ICON: Record<string, string> = {
  blank_slate: ':blank_slate:',
  boomtown: ':boomtown:',
  deep_day_one: ':deep_day_one:',
  ruined: ':ruined:',
  all_rooms: ':all_rooms:',
};

const RESOURCES = [
  ['scrip', 'Scrip'],
  ['power', 'Power'],
  ['food', 'Food'],
  ['water', 'Water'],
  ['medpatch', 'Med-Patches'],
  ['purge', 'Purge'],
  ['influence', 'Influence'],
] as const;

/** The advanced form's draft. */
interface CustomDraft {
  scrip: number;
  population: number;
  levelMin: number;
  levelMax: number;
  rarity: Rarity | '';
  /** '' = the starter rooms, else a preset whose room layout is borrowed. */
  layoutFrom: string;
  strata: number;
  researchAll: boolean;
  regionsAll: boolean;
  fillStorage: boolean;
  rules: RulesPick;
}

const DEFAULT_DRAFT = (): CustomDraft => ({
  scrip: 5000,
  population: 6,
  levelMin: 1,
  levelMax: 5,
  rarity: '',
  layoutFrom: '',
  strata: 0,
  researchAll: false,
  regionsAll: false,
  fillStorage: true,
  rules: { rules: [], survival: false },
});

const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.floor(Number.isFinite(v) ? v : lo)));

/** The form as sim options. Exported for tests of the form's mapping. */
export function draftOptions(draft: CustomDraft, presets: CustomPreset[]): CustomGameOptions {
  const lo = Math.min(draft.levelMin, draft.levelMax);
  const hi = Math.max(draft.levelMin, draft.levelMax);
  const opts: CustomGameOptions = {
    scrip: draft.scrip,
    population: draft.population,
    levelRange: [lo, hi],
    fillStorage: draft.fillStorage,
    rules: [...draft.rules.rules],
    survival: draft.rules.survival,
  };
  if (draft.rarity) opts.rarity = draft.rarity;
  if (draft.strata > 0) opts.strata = draft.strata;
  if (draft.researchAll) opts.research = 'all';
  if (draft.regionsAll) opts.regions = 'all';
  const from = presets.find((p) => p.id === draft.layoutFrom)?.options;
  if (from?.layout) {
    opts.layout = from.layout;
    // The borrowed rooms need what their preset had: rooms unlocked, the Deep dug and its research.
    if (from.peakPopulation !== undefined) opts.peakPopulation = from.peakPopulation;
    if (from.strata !== undefined) opts.strata = Math.max(opts.strata ?? 0, from.strata);
    if (Array.isArray(from.research) && opts.research !== 'all') opts.research = [...from.research];
    if (from.research === 'all') opts.research = 'all';
  }
  return opts;
}

let instance: CustomGameUI | null = null;

/** Open the Custom Game screen (from the ☰ menu, the welcome modal or the banner). */
export function openCustomGame(onStarted?: () => void): void {
  instance?.open(onStarted);
}

/**
 * The Custom Game entry for the ☰ menu (saves.ts puts it above the save slots):
 * resume or leave the sandbox, or open the Custom Game screen.
 */
export function customMenuSection(game: Game, done: () => void): HTMLElement {
  const stored = !game.isCustom && readSave(CUSTOM_SLOT) !== null;
  const summary = stored ? storedSummary() : null;
  return h(
    'div',
    { class: `list-item sv-card m9-cg-menu${game.isCustom ? ' live' : ''}` },
    h(
      'div',
      { class: 'row', style: 'margin:0' },
      h('b', {}, '🧪 Custom Game'),
      h('span', { class: 'muted small' }, game.isCustom ? 'playing now · achievements off' : stored ? 'set aside' : 'sandbox'),
    ),
    h(
      'div',
      { class: 'muted small' },
      game.isCustom
        ? 'A sandbox in its own save slot. Your homestead is saved and waiting, untouched.'
        : summary
          ? `Your Custom Game: ${summary}. It keeps its own save; your homestead is never touched.`
          : 'Presets, a sandbox console and a time scale, in a save slot of its own. Nothing you do there touches your homestead.',
    ),
    h(
      'div',
      { class: 'sv-actions' },
      game.isCustom
        ? h(
            'button',
            {
              class: 'primary',
              onclick: () => {
                const res = game.switchTo('normal');
                if (res.ok) done();
              },
            },
            '⌂ Back to your homestead',
          )
        : stored
          ? h(
              'button',
              {
                class: 'primary',
                onclick: () => {
                  const res = game.switchTo('custom');
                  if (res.ok) done();
                },
              },
              '▶ Resume Custom Game',
            )
          : null,
      h('button', { class: game.isCustom || stored ? '' : 'primary', onclick: () => openCustomGame(done) }, game.isCustom || stored ? 'New Custom Game…' : '🧪 Custom Game…'),
    ),
  );
}

/** A button for a title or welcome screen that opens the Custom Game screen. */
export function customGameButton(onOpen?: () => void): HTMLElement {
  return h(
    'button',
    {
      class: 'm9-cg-open',
      onclick: () => {
        onOpen?.();
        openCustomGame();
      },
    },
    '🧪 Custom Game',
  );
}

function storedSummary(): string | null {
  const json = readSave(CUSTOM_SLOT);
  if (!json) return null;
  try {
    return describe(deserialize(json));
  } catch {
    return null;
  }
}

function describe(s: GameState): string {
  const living = s.residents.filter((r) => !r.dead && !r.waiting).length;
  return `Homestead ${s.homesteadNumber} · ${living} resident${living === 1 ? '' : 's'} · ${fmt(s.scrip)} scrip · day ${Math.floor(s.time / 86_400) + 1}`;
}

export interface CustomHost {
  game: Game;
  toast: ToastFn;
}

export class CustomGameUI {
  private layer = h('div', { class: 'm9-layer' });
  private banner = h('div', { class: 'm9-banner', role: 'status' });
  private sandbox = h('div', { class: 'm9-sandbox', role: 'dialog', 'aria-label': 'Sandbox console' });
  private screen: HTMLElement | null = null;
  private tab: 'presets' | 'advanced' = 'presets';
  private draft: CustomDraft = DEFAULT_DRAFT();
  private formError: string | null = null;
  private onStarted: (() => void) | null = null;
  private sandboxOpen = false;
  /** The sandbox toolbar's inputs, kept across re-renders. */
  private tool = { resource: 'scrip', amount: 10000, level: 10, rarity: 'common' as Rarity, item: '', count: 1, incident: 'fire' as IncidentType, weather: 'clear' as WeatherKind, minutes: 30, points: 500 };
  private bannerKey = '';

  constructor(
    private host: CustomHost,
    private root: HTMLElement = document.getElementById('ui') ?? document.body,
  ) {
    instance = this;
    this.layer.append(this.banner, this.sandbox);
    this.root.append(this.layer);
    host.game.onReplace(() => {
      this.sandboxOpen = false;
      this.render();
    });
    // Newest first: close the sandbox before the UI closes its panel, unless a modal sits on top.
    onBack(() => {
      if (!this.sandboxOpen || this.modalOpen()) return false;
      this.setSandbox(false);
      return true;
    });
    this.render();
  }

  private get game(): Game {
    return this.host.game;
  }

  /** Called every frame from main.ts: cheap unless something shown changed. */
  update(): void {
    const key = `${this.game.mode}|${this.game.timeScale}|${this.sandboxOpen}`;
    if (key !== this.bannerKey) this.render();
  }

  private modalOpen(): boolean {
    return [...this.root.querySelectorAll('.modal-backdrop, .found-flow')].some((el) => el.getClientRects().length > 0);
  }

  // ---------------------------------------------------------------- banner and sandbox toolbar

  private render(): void {
    const custom = this.game.isCustom;
    this.bannerKey = `${this.game.mode}|${this.game.timeScale}|${this.sandboxOpen}`;
    document.documentElement.toggleAttribute('data-custom-game', custom);
    this.layer.style.display = custom ? '' : 'none';
    if (!custom) {
      this.banner.replaceChildren();
      this.sandbox.replaceChildren();
      return;
    }
    const scale = this.game.timeScale;
    this.banner.replaceChildren(
      h('span', { class: 'm9-banner-tag' }, '🧪 CUSTOM GAME'),
      h('span', { class: 'm9-banner-note' }, 'achievements off'),
      ...(scale > 1 ? [h('span', { class: 'm9-banner-speed' }, `▶▶ ×${scale}`)] : []),
      h('button', { class: `m9-banner-btn${this.sandboxOpen ? ' active' : ''}`, 'aria-expanded': this.sandboxOpen ? 'true' : 'false', onclick: () => this.setSandbox(!this.sandboxOpen) }, this.sandboxOpen ? '✕ Sandbox' : '🛠 Sandbox'),
    );
    this.sandbox.style.display = this.sandboxOpen ? '' : 'none';
    this.sandbox.replaceChildren(...(this.sandboxOpen ? this.sandboxBody() : []));
  }

  private setSandbox(open: boolean): void {
    this.sandboxOpen = open;
    this.render();
  }

  private cmd(action: Action, args: Record<string, unknown>, ok: string): void {
    const res = this.game.run({ type: 'custom', action, ...args } as Command);
    this.host.toast(res.ok ? ok : `Sandbox: ${res.reason}`, res.ok ? 'good' : 'bad');
  }

  private sandboxBody(): HTMLElement[] {
    const { content, state } = this.game;
    const t = this.tool;
    const num = (key: 'amount' | 'level' | 'count' | 'minutes' | 'points', min: number, max: number, label: string) =>
      h('input', {
        type: 'number',
        inputmode: 'numeric',
        min,
        max,
        value: t[key],
        'aria-label': label,
        class: 'm9-num',
        oninput: (e: Event) => {
          t[key] = clampInt(Number((e.target as HTMLInputElement).value), min, max);
        },
      });
    const select = <K extends 'resource' | 'rarity' | 'item' | 'incident' | 'weather'>(key: K, options: [string, string][], label: string) =>
      h(
        'select',
        { 'aria-label': label, onchange: (e: Event) => ((t as Record<string, unknown>)[key] = (e.target as HTMLSelectElement).value) },
        ...options.map(([v, l]) => h('option', { value: v, selected: v === t[key] }, l)),
      );
    const row = (label: string, ...kids: (HTMLElement | null)[]) => h('div', { class: 'm9-tool' }, h('span', { class: 'm9-tool-label' }, label), h('div', { class: 'm9-tool-ctl' }, ...kids));

    const items = Object.values(content.items)
      .filter((d): d is NonNullable<typeof d> => !!d)
      .sort((a, b) => (a.rarity === b.rarity ? a.name.localeCompare(b.name) : a.rarity === 'legendary' ? -1 : b.rarity === 'legendary' ? 1 : a.rarity === 'rare' ? -1 : 1));
    if (!t.item || !content.items[t.item]) t.item = items[0]?.id ?? '';
    const incidents = Object.entries(content.balance.incidents.types as Record<string, { name?: string }>).map(([id, d]) => [id, d.name ?? id] as [string, string]);
    const weather = Object.entries(topsideContent(content).weather.kinds as Record<string, { name: string }>).map(([id, d]) => [id, d.name] as [string, string]);

    const speeds = h(
      'div',
      { class: 'm9-speeds', role: 'radiogroup', 'aria-label': 'Time scale' },
      ...TIME_SCALES.map((n) =>
        h(
          'button',
          {
            class: this.game.timeScale === n ? 'active' : '',
            role: 'radio',
            'aria-checked': this.game.timeScale === n ? 'true' : 'false',
            onclick: () => {
              this.game.setTimeScale(n);
              this.render();
            },
          },
          `×${n}`,
        ),
      ),
    );

    return [
      h('div', { class: 'm9-sandbox-head' }, h('b', {}, '🛠 Sandbox console'), h('span', { class: 'muted small' }, `Homestead ${state.homesteadNumber}`)),
      row('Time', speeds),
      row(
        'Resource',
        select('resource', RESOURCES.map(([k, l]) => [k, l]), 'Resource'),
        num('amount', 0, content.balance.maxScrip, 'Amount'),
        h('button', { onclick: () => this.cmd('setResource', { resource: t.resource, amount: t.amount }, `${RESOURCES.find(([k]) => k === t.resource)?.[1] ?? t.resource} set to ${fmt(t.amount)} (up to storage).`) }, 'Set'),
      ),
      row(
        'Resident',
        h('span', { class: 'm9-inline muted small' }, 'L'),
        num('level', 1, content.balance.resident.maxLevel, 'Level'),
        select('rarity', [['common', 'Common'], ['rare', 'Rare'], ['legendary', 'Legendary']], 'Rarity'),
        h('button', { onclick: () => this.cmd('spawnResident', { level: t.level, rarity: t.rarity }, `A level ${t.level} ${t.rarity} resident is at the door.`) }, 'Spawn'),
      ),
      row(
        'Item',
        select('item', items.map((d) => [d.id, `${d.rarity === 'legendary' ? '★ ' : d.rarity === 'rare' ? '◆ ' : ''}${d.name}`]), 'Item'),
        num('count', 1, 100, 'Count'),
        h('button', { onclick: () => this.cmd('spawnItem', { defId: t.item, count: t.count }, `${t.count} × ${content.items[t.item]?.name ?? t.item} in storage.`) }, 'Give'),
      ),
      row('Incident', select('incident', incidents, 'Incident'), h('button', { class: 'danger', onclick: () => this.cmd('triggerIncident', { incident: t.incident }, `${incidents.find(([k]) => k === t.incident)?.[1] ?? t.incident}! As requested.`) }, 'Trigger')),
      row('Weather', select('weather', weather, 'Weather'), num('minutes', 1, 1440, 'Minutes'), h('button', { onclick: () => this.cmd('setWeather', { kind: t.weather, minutes: t.minutes }, `${weather.find(([k]) => k === t.weather)?.[1] ?? t.weather} for ${t.minutes} min.`) }, 'Set')),
      row('Research', num('points', 1, 1_000_000, 'Research points'), h('button', { onclick: () => this.cmd('grantResearch', { points: t.points }, `+${fmt(t.points)} research points.`) }, 'Grant')),
      h(
        'div',
        { class: 'm9-sandbox-foot' },
        h('button', { onclick: () => ask({ title: 'Unlock everything?', text: 'Every room, research node, region, stratum, recipe and faction, in this Custom Game only.', ok: 'Unlock all' }, () => this.cmd('unlockAll', {}, 'Everything is unlocked. HALCY has stopped checking badges.')) }, '🗝 Unlock all'),
        h(
          'button',
          {
            onclick: () => {
              const res = this.game.switchTo('normal');
              if (!res.ok) this.host.toast(res.reason, 'bad');
              else this.host.toast(`Back at Homestead ${this.game.state.homesteadNumber}. The Custom Game is saved in its own slot.`, 'good');
            },
          },
          '⌂ Back to homestead',
        ),
      ),
    ];
  }

  // ---------------------------------------------------------------- the Custom Game screen

  open(onStarted?: () => void): void {
    this.onStarted = onStarted ?? null;
    this.formError = null;
    this.renderScreen();
  }

  private close(): void {
    this.screen?.remove();
    this.screen = null;
  }

  private renderScreen(): void {
    const { game } = this;
    const { content } = game;
    const presets = customPresets(content);
    const stored = !game.isCustom && readSave(CUSTOM_SLOT) !== null ? storedSummary() : null;
    const tab = (id: 'presets' | 'advanced', label: string) =>
      h(
        'button',
        {
          class: this.tab === id ? 'active' : '',
          'aria-pressed': this.tab === id ? 'true' : 'false',
          onclick: () => {
            this.tab = id;
            this.renderScreen();
          },
        },
        label,
      );
    const scrollTop = this.screen?.querySelector('.m9-cg-body')?.scrollTop ?? 0;
    const next = h(
      'div',
      { class: 'modal-backdrop m9-cg-backdrop', onclick: (e: Event) => e.target === e.currentTarget && this.close() },
      h(
        'div',
        { class: 'modal m9-cg', role: 'dialog', 'aria-label': 'Custom Game' },
        h(
          'header',
          { class: 'm9-cg-head' },
          h('div', { class: 'ff-kicker' }, 'Halcyon Simulation Division'),
          h('h1', {}, '🧪 Custom Game'),
          h('button', { class: 'close m9-cg-x', 'aria-label': 'Close', onclick: () => this.close() }, '✕'),
        ),
        h(
          'main',
          { class: 'm9-cg-body' },
          h('p', { class: 'halcy-quote' }, h('span', { class: 'giver' }, 'HALCY: '), 'A practice homestead! Nothing here counts, so nothing here can go wrong. That is the official position.'),
          h(
            'div',
            { class: 'm9-cg-facts' },
            h('span', { class: 'loot-chip' }, '💾 its own save slot'),
            h('span', { class: 'loot-chip bad' }, '🏆 achievements off'),
            h('span', { class: 'loot-chip' }, '⏩ time scale ×1–×100'),
            h('span', { class: 'loot-chip' }, '🛠 sandbox console'),
          ),
          game.isCustom
            ? h('div', { class: 'm9-cg-note' }, 'You are in a Custom Game. Starting another replaces it; your homestead stays as it is.')
            : stored
              ? h(
                  'div',
                  { class: 'list-item m9-cg-resume' },
                  h('div', {}, h('b', {}, '▶ Your Custom Game'), h('div', { class: 'muted small' }, stored)),
                  h(
                    'div',
                    { class: 'sv-actions' },
                    h('button', { class: 'primary', onclick: () => this.resume() }, 'Resume'),
                    h(
                      'button',
                      {
                        class: 'danger',
                        onclick: () =>
                          ask({ title: 'Delete the Custom Game?', text: 'The sandbox save is gone for good. Your homestead is not touched.', ok: 'Delete', danger: true }, () => {
                            game.deleteCustom();
                            this.renderScreen();
                          }),
                      },
                      'Delete',
                    ),
                  ),
                )
              : h('div', { class: 'm9-cg-note' }, `Homestead ${game.state.homesteadNumber} is saved and set aside while you play. Come back any time from ☰ or the banner.`),
          h('div', { class: 'tabs m9-cg-tabs' }, tab('presets', 'Presets'), tab('advanced', 'Advanced')),
          ...(this.tab === 'presets' ? [h('div', { class: 'm9-preset-grid' }, ...presets.map((p) => this.presetCard(p)))] : this.advancedForm(presets)),
        ),
      ),
    );
    if (this.screen) this.screen.replaceWith(next);
    else this.root.append(next);
    this.screen = next;
    next.querySelector('.m9-cg-body')?.scrollTo(0, scrollTop);
  }

  private presetCard(p: CustomPreset): HTMLElement {
    const o = p.options;
    const chips: string[] = [];
    if (o.population !== undefined) chips.push(`👥 ${o.population}${o.fallen ? ` (${o.fallen} fallen)` : ''}`);
    if (o.levelRange) chips.push(`L${o.levelRange[0]}–${o.levelRange[1]}`);
    if (o.scrip !== undefined) chips.push(`💰 ${fmt(o.scrip)}`);
    if (o.layout) chips.push(`🏗 ${o.layout.length} rooms`);
    if (o.strata) chips.push(`⛏ ${o.strata} strata`);
    if (o.research === 'all') chips.push('🔬 all research');
    else if (o.research?.length) chips.push(`🔬 ${o.research.length} researched`);
    if (o.regions === 'all') chips.push('🧭 all regions');
    if (o.fillStorage) chips.push('📦 stores full');
    if (o.injured) chips.push('🩹 injured');
    const rules = o.rules?.length || o.survival ? rulesChips(this.game.content, { rules: o.rules ?? [], survival: o.survival === true }) : null;
    return h(
      'div',
      { class: 'm9-preset', 'data-preset': p.id },
      h('div', { class: 'm9-preset-head' }, h('span', { class: 'm9-preset-icon' }, PRESET_ICON[p.id] ?? '🧪'), h('b', {}, p.name)),
      h('div', { class: 'm9-rule-blurb' }, p.blurb),
      h('div', { class: 'loot-line' }, ...chips.map((c) => h('span', { class: 'loot-chip' }, c))),
      rules,
      h('button', { class: 'primary m9-preset-go', onclick: () => this.start(p.id, p.name) }, 'Start'),
    );
  }

  private advancedForm(presets: CustomPreset[]): HTMLElement[] {
    const { content } = this.game;
    const d = this.draft;
    const again = () => this.renderScreen();
    const field = (label: string, input: HTMLElement, note?: string) => h('label', { class: 'm9-field' }, h('span', { class: 'm9-field-label' }, label), input, note ? h('span', { class: 'muted small' }, note) : null);
    const num = (key: 'scrip' | 'population' | 'levelMin' | 'levelMax' | 'strata', min: number, max: number, label: string) =>
      h('input', {
        type: 'number',
        inputmode: 'numeric',
        min,
        max,
        value: d[key],
        'aria-label': label,
        onchange: (e: Event) => {
          d[key] = clampInt(Number((e.target as HTMLInputElement).value), min, max);
          (e.target as HTMLInputElement).value = String(d[key]);
        },
      });
    const check = (key: 'researchAll' | 'regionsAll' | 'fillStorage', label: string) =>
      h(
        'button',
        {
          class: `m9-check${d[key] ? ' on' : ''}`,
          role: 'switch',
          'aria-checked': d[key] ? 'true' : 'false',
          onclick: () => {
            d[key] = !d[key];
            again();
          },
        },
        h('span', { class: 'pick-box' }, d[key] ? '✓' : ''),
        ` ${label}`,
      );
    const maxLevel = content.balance.resident.maxLevel;
    const layouts = presets.filter((p) => p.options.layout?.length);
    return [
      h(
        'div',
        { class: 'm9-form' },
        field('Starting scrip', num('scrip', 0, content.balance.maxScrip, 'Starting scrip')),
        field('Residents', num('population', 0, content.balance.maxPopulation, 'Residents'), 'admitted at the start'),
        h('div', { class: 'm9-field' }, h('span', { class: 'm9-field-label' }, 'Level range'), h('span', { class: 'm9-range' }, num('levelMin', 1, maxLevel, 'Lowest level'), h('span', {}, 'to'), num('levelMax', 1, maxLevel, 'Highest level'))),
        field(
          'Rarity',
          h(
            'select',
            { 'aria-label': 'Rarity', onchange: (e: Event) => (d.rarity = (e.target as HTMLSelectElement).value as Rarity | '') },
            ...([['', 'Mixed (as usual)'], ['common', 'Common'], ['rare', 'Rare'], ['legendary', 'Legendary']] as const).map(([v, l]) => h('option', { value: v, selected: d.rarity === v }, l)),
          ),
        ),
        field(
          'Rooms',
          h(
            'select',
            { 'aria-label': 'Rooms', onchange: (e: Event) => (d.layoutFrom = (e.target as HTMLSelectElement).value) },
            h('option', { value: '', selected: d.layoutFrom === '' }, 'The starter rooms'),
            ...layouts.map((p) => h('option', { value: p.id, selected: d.layoutFrom === p.id }, `${p.name}'s rooms (${p.options.layout?.length})`)),
          ),
          'more residents need more quarters',
        ),
        field('Strata of the Deep dug', num('strata', 0, deepContent(content).strata.length, 'Strata'), `0 to ${deepContent(content).strata.length}`),
        h('div', { class: 'm9-checks' }, check('researchAll', 'All research done'), check('regionsAll', 'All regions open'), check('fillStorage', 'Stores full')),
      ),
      h('h3', { class: 'group' }, 'Rules'),
      rulesPicker(this.game.state, content, d.rules, { sandbox: true, changed: again }),
      this.formError ? h('div', { class: 'ff-error m9-form-error' }, `Can't start: ${this.formError}.`) : null,
      h(
        'div',
        { class: 'm9-form-go' },
        h(
          'button',
          {
            onclick: () => {
              this.draft = DEFAULT_DRAFT();
              this.formError = null;
              again();
            },
          },
          'Reset form',
        ),
        h('button', { class: 'primary', onclick: () => this.start(draftOptions(d, presets), 'your Custom Game') }, '🧪 Start Custom Game'),
      ),
    ].filter((x): x is HTMLElement => !!x);
  }

  private resume(): void {
    const res = this.game.switchTo('custom');
    if (!res.ok) {
      this.host.toast(res.reason, 'bad');
      return;
    }
    this.close();
    this.onStarted?.();
    this.host.toast('Back in your Custom Game. Achievements are off.', 'good');
  }

  private start(preset: string | CustomGameOptions, name: string): void {
    const go = () => {
      const res = this.game.startCustom(preset);
      if (!res.ok) {
        this.formError = res.reason;
        if (typeof preset === 'string') this.host.toast(`Can't start ${name}: ${res.reason}`, 'bad');
        this.renderScreen();
        return;
      }
      this.close();
      this.onStarted?.();
      this.host.toast(`🧪 ${name === 'your Custom Game' ? 'Custom Game' : name} started. Your homestead is saved in its own slot.`, 'good');
    };
    const replacing = this.game.isCustom || readSave(CUSTOM_SLOT) !== null;
    if (replacing) ask({ title: 'Replace your Custom Game?', text: 'There is one Custom Game slot. The current sandbox is replaced; your homestead is not touched.', ok: 'Replace', danger: true }, go);
    else go();
  }
}
