// M5 prestige in the client: the Legacy panel (Charter, Perk tree, Outposts),
// the HUD chips, the Charter-reached moment and the full-screen "Found a New
// Homestead" flow. Hooked into ui.ts with a few small calls; the sim side is
// src/sim/systems/prestige.ts and src/sim/legacy.ts (see docs/design/M5-spec.md).

import { halcyFace } from './halcy';
import {
  canBuyPerk,
  canFound,
  canFoundHomestead,
  charterStatus,
  effectiveStats,
  foundingLimits,
  legacyBreakdown,
  legacyContent,
  outpostTotals,
  perkRank,
  bonus,
  siteDef,
  topStats,
  STAT_KEYS,
  type GameEvent,
  type ItemDef,
  type Outpost,
  type PerkDef,
  type Rarity,
  type Resident,
  type SiteDef,
  type StatKey,
} from '../../sim';
import type { FoundResult, Game } from '../game';
import { downloadFile } from '../storage';
import { fmt, h, morph } from './dom';
import type { ToastFn } from './toasts';

export type LegacyTab = 'charter' | 'perks' | 'outposts';

export interface LegacyHost {
  game: Game;
  modalHost: HTMLElement;
  toast: ToastFn;
  /** Open the Legacy panel (on a tab). */
  openLegacy(tab?: LegacyTab): void;
  /** Re-render the open side panel. */
  refreshPanel(): void;
}

const STEPS = ['Review', 'Site', 'Party', 'Heirlooms', 'Confirm'] as const;
/** How long the final button must be held. */
const HOLD_MS = 1400;

interface FoundDraft {
  step: number;
  siteId: string;
  partyIds: number[];
  heirloomIds: number[];
  partySort: 'level' | 'rarity';
  /** The backup written when the Confirm step opened. */
  backup: { json: string; ok: boolean } | null;
  holding: boolean;
  error: string | null;
}

const RARITY_ORDER: Record<Rarity, number> = { legendary: 0, rare: 1, common: 2 };
const RARITY_MARK: Record<Rarity, string> = { legendary: '★', rare: '◆', common: '' };
const STAT_SHORT: Record<StatKey, string> = { brawn: 'BRN', sight: 'SGT', grit: 'GRT', charm: 'CHR', wits: 'WIT', knack: 'KNK', fortune: 'FOR' };
const RESOURCE_NAME: Record<string, string> = { power: 'Power', food: 'Food', water: 'Water', medpatch: 'Med-Patch', purge: 'Purge' };

/** Cosmetic look per site (the content has no art for sites yet). */
const SITE_LOOK: Record<string, { icon: string; tone: string }> = {
  plot7: { icon: '🏠', tone: 'plot' },
  dry_wells: { icon: '💧', tone: 'wells' },
  rust_country: { icon: '⚙', tone: 'rust' },
  the_scorch: { icon: '☀', tone: 'scorch' },
};

/** What goes with the founders, and what stays (docs/design/M5-spec.md). */
const CARRIES = [
  'The founding party: levels, stats and the gear they wear',
  'Heirlooms you pick from storage',
  'Recipes, blueprint fragments and story progress',
  'Unlocked regions of the Glarelands',
  'Achievements and lifetime stats',
  'Supply Crates, crate tokens, pity and your daily streak',
  'Legacy points and every perk bought',
];
const STAYS = [
  'Rooms and room levels (the new site is a fresh build)',
  'Scrip, power, food, water and salvage (a new endowment waits)',
  'Items in storage not picked as heirlooms',
  'Everyone not in the founding party: they keep the old homestead running as an outpost',
];

export class LegacyUI {
  tab: LegacyTab = 'charter';
  private flow: FoundDraft | null = null;
  private flowStep = -1;
  private holdTimer: number | null = null;
  private lastFlowRender = 0;
  /** Cycle whose ready Charter the player has already looked at (the HUD chip stops glowing). */
  private charterSeen = 0;
  /** Unspent Legacy when the perk tree was last looked at (drives the toolbar badge). */
  private pointsSeen = 0;
  private justBought: { id: string; until: number } | null = null;

  constructor(private host: LegacyHost) {}

  private get game(): Game {
    return this.host.game;
  }

  private get lc() {
    return legacyContent(this.game.content);
  }

  // ---------------------------------------------------------------- hooks

  update(): void {
    // The sim keeps running under the flow (pregnancies, days survived): keep it honest.
    if (this.flow && !this.flow.holding && performance.now() - this.lastFlowRender > 1000) this.renderFlow();
  }

  /** The panel was opened on a tab. */
  opened(tab?: LegacyTab): void {
    if (tab) this.tab = tab;
    if (this.tab === 'charter' && charterStatus(this.game.state, this.game.content).ready) this.charterSeen = this.game.state.legacy.cycle;
    if (this.tab === 'perks') this.pointsSeen = this.game.state.legacy.points;
  }

  /** game.state was replaced: nothing from the old homestead survives on screen. */
  onStateReplaced(): void {
    this.cancelHold();
    this.flow = null;
    this.flowStep = -1;
    this.justBought = null;
    this.tab = 'charter';
    this.pointsSeen = 0;
  }

  /** Toolbar badge: a ready Charter not seen yet, or perks that can be bought. */
  badge(): number {
    const { state, content } = this.game;
    if (charterStatus(state, content).ready && this.charterSeen !== state.legacy.cycle) return 1;
    // New Legacy to spend since the perk tree was last opened.
    if (state.legacy.points > this.pointsSeen && this.lc.perks.some((p) => canBuyPerk(state, content, p.id) === null)) return 1;
    return 0;
  }

  hudChips(): HTMLElement[] {
    const { state, content } = this.game;
    const out: HTMLElement[] = [];
    const t = outpostTotals(state);
    if (t.scrip + t.salvage + t.crates > 0) {
      const cap = this.lc.outposts.storageHours;
      const mult = this.outputMult();
      const full = state.legacy.outposts.some((o) => o.stored.scrip >= o.rates.scrip * mult * cap - 0.5);
      out.push(
        h(
          'button',
          {
            class: `stat-chip chip-button outpost-chip${full || t.crates ? ' glow' : ''}`,
            title: `Outposts: ${fmt(t.scrip)} scrip, ${fmt(t.salvage)} salvage, ${fmt(t.crates)} crates waiting`,
            onclick: () => this.host.openLegacy('outposts'),
          },
          '🏚 ',
          h('b', {}, `+${fmt(t.scrip)}`),
          t.crates >= 1 ? h('span', {}, ` 📦${fmt(t.crates)}`) : null,
        ),
      );
    }
    // Newly ready: shown until the player has looked at the Charter tab.
    if (this.charterSeen !== state.legacy.cycle && charterStatus(state, content).ready) {
      out.push(h('button', { class: 'stat-chip chip-button charter-chip glow', title: 'The Charter milestone is reached', onclick: () => this.host.openLegacy('charter') }, '📜 ', h('b', {}, 'Charter ready')));
    }
    return out;
  }

  onEvents(events: GameEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'charterReached':
          this.showCharterReached();
          break;
        case 'perkBought': {
          const def = this.lc.perks.find((p) => p.id === ev.perkId);
          this.justBought = { id: ev.perkId, until: performance.now() + 1600 };
          if (def) this.host.toast(`◆ ${def.name} rank ${ev.rank}: ${perkText(def, ev.rank)}`, 'gold');
          break;
        }
        case 'outpostsCollected': {
          const bits = [ev.scrip ? `${fmt(ev.scrip)} scrip` : '', ev.salvage ? `${fmt(ev.salvage)} salvage` : '', ev.crates ? `${ev.crates} crate${ev.crates === 1 ? '' : 's'}` : ''].filter(Boolean);
          this.host.toast(`🏚 The outposts sent ${bits.join(', ')}.`, 'good');
          break;
        }
      }
    }
  }

  // ---------------------------------------------------------------- panel

  panel(): HTMLElement {
    const { state } = this.game;
    const tab = (id: LegacyTab, label: string, badge?: number) =>
      h(
        'button',
        {
          class: this.tab === id ? 'active' : '',
          onclick: () => {
            this.opened(id);
            this.host.refreshPanel();
          },
        },
        label,
        badge ? h('span', { class: 'badge' }, badge) : null,
      );
    const t = outpostTotals(state);
    const body =
      this.tab === 'charter' ? this.charterTab() : this.tab === 'perks' ? this.perksTab() : this.outpostsTab();
    return h(
      'div',
      { class: `body legacy-body tab-${this.tab}` },
      h(
        'div',
        { class: 'legacy-top' },
        h('div', { class: 'tabs storage-tabs' }, tab('charter', '📜 Charter'), tab('perks', '◆ Perks'), tab('outposts', '🏚 Outposts', t.scrip + t.salvage + t.crates > 0 ? state.legacy.outposts.length : 0)),
        h('div', { class: 'legacy-points', title: `Legacy earned in total: ${state.legacy.earned}` }, h('span', { class: 'muted small' }, 'Legacy'), h('b', {}, `◆ ${fmt(state.legacy.points)}`)),
      ),
      ...body,
    );
  }

  private charterTab(): HTMLElement[] {
    const { state, content } = this.game;
    const cs = charterStatus(state, content);
    const why = canFoundHomestead(state, content);
    const out: HTMLElement[] = [];
    if (state.legacy.cycle === 1) {
      out.push(
        h(
          'div',
          { class: 'legacy-explainer' },
          h('b', {}, 'What is founding?'),
          h('p', {}, 'Once this homestead reaches its Charter, you can lead a founding party to a new site. The new homestead starts from scratch, but you earn Legacy for everything achieved here and spend it on permanent perks. Nothing is thrown away: this homestead carries on as an outpost that sends you supplies.'),
          h('div', { class: 'carry-grid' }, carryList('Comes with you', CARRIES, 'carry'), carryList('Stays behind', STAYS, 'stay')),
        ),
      );
    }
    out.push(h('blockquote', { class: 'halcy-quote' }, halcyFace(), h('span', { class: 'giver' }, 'HALCY: '), cs.text));
    out.push(h('h3', { class: 'group' }, `Charter milestone ${cs.ready ? '✓' : ''}`));
    for (const r of cs.requirements) {
      const pct = Math.min(100, (r.have / Math.max(1, r.need)) * 100);
      out.push(
        h(
          'div',
          { class: `charter-req${r.done ? ' done' : ''}` },
          h('div', { class: 'row', style: 'margin:0' }, h('span', {}, r.done ? '✓ ' : '', r.label), h('b', { class: 'small nowrap' }, r.need > 1 ? `${fmt(Math.min(r.have, r.need))} / ${fmt(r.need)}` : r.done ? 'Done' : 'Not yet')),
          h('div', { class: 'progress big' }, h('div', { style: `width:${pct.toFixed(1)}%` })),
        ),
      );
    }
    out.push(h('h3', { class: 'group' }, `Legacy for Homestead ${state.homesteadNumber}`));
    out.push(this.breakdownTable());
    out.push(
      h(
        'div',
        { class: 'found-cta' },
        h('button', { class: `primary found-btn${why ? '' : ' pulse'}`, disabled: !!why, onclick: () => this.openFlow() }, '🏗 Found a New Homestead'),
        why ? h('div', { class: 'small short' }, `Not yet: ${why}.`) : h('div', { class: 'small ok-text' }, 'The Charter is signed. The ribbon is ready.'),
      ),
    );
    return out;
  }

  private breakdownTable(siteMult?: number): HTMLElement {
    const { state, content } = this.game;
    const b = legacyBreakdown(state, content);
    const mult = siteMult ?? b.siteMult;
    const total = Math.floor(b.subtotal * mult);
    const site = siteDef(content, state.legacy.siteId);
    return h(
      'table',
      { class: 'legacy-table' },
      h(
        'tbody',
        {},
        ...b.lines.map((l) => h('tr', { class: l.points ? '' : 'zero' }, h('td', {}, l.label), h('td', {}, l.points ? `+${l.points}` : '0'))),
        h('tr', { class: 'sub' }, h('td', {}, 'Subtotal'), h('td', {}, `${b.subtotal}`)),
        h('tr', { class: 'mult' }, h('td', {}, `Site: ${site?.name ?? 'Plot 7'}`), h('td', {}, `×${fmtMult(mult)}`)),
        h('tr', { class: 'total' }, h('td', {}, 'Legacy if you found now'), h('td', {}, `◆ ${total}`)),
      ),
    );
  }

  private perksTab(): HTMLElement[] {
    const { state } = this.game;
    const out: HTMLElement[] = [];
    if (state.legacy.earned === 0) {
      out.push(h('p', { class: 'legacy-note' }, 'A preview of the Legacy tree. Legacy is earned only by founding a new homestead; spend it here on perks that last for every homestead after.'));
    } else {
      out.push(h('p', { class: 'muted small', style: 'margin:0 0 8px' }, `Earned ${state.legacy.earned} Legacy over ${state.legacy.history.length} founding${state.legacy.history.length === 1 ? '' : 's'}. Perks work at once; founding perks count at the next founding.`));
    }
    const branches = this.lc.branches.map((b) =>
      h(
        'section',
        { class: 'perk-branch' },
        h('header', {}, h('b', {}, b.name), h('span', { class: 'muted small' }, b.description)),
        ...this.lc.perks.filter((p) => p.branch === b.id).map((p) => this.perkCard(p)),
      ),
    );
    out.push(h('div', { class: 'perk-tree' }, ...branches));
    return out;
  }

  private perkCard(p: PerkDef): HTMLElement {
    const { state, content } = this.game;
    const rank = perkRank(state, p.id);
    const max = p.costs.length;
    const maxed = rank >= max;
    const why = canBuyPerk(state, content, p.id);
    const unmet = Object.entries(p.requires ?? {}).filter(([id, need]) => perkRank(state, id) < need);
    const locked = unmet.length > 0;
    const cost = maxed ? 0 : (p.costs[rank] as number);
    const just = this.justBought?.id === p.id && performance.now() < this.justBought.until;
    const cls = `perk-card${maxed ? ' maxed' : ''}${locked ? ' locked' : ''}${!why ? ' affordable' : ''}${just ? ' just-bought' : ''}`;
    return h(
      'div',
      { class: cls, 'data-perk': p.id },
      h('div', { class: 'perk-head' }, h('b', {}, p.name), h('span', { class: 'pips', title: `Rank ${rank} of ${max}` }, ...Array.from({ length: max }, (_, i) => h('i', { class: i < rank ? 'on' : '' })))),
      h('div', { class: 'perk-now' }, rank > 0 ? perkText(p, rank) : h('span', { class: 'muted' }, 'Not bought yet')),
      maxed ? h('div', { class: 'perk-next max' }, 'Max rank') : h('div', { class: 'perk-next' }, h('span', { class: 'lbl' }, rank ? 'Next: ' : 'Rank 1: '), perkText(p, rank + 1)),
      locked ? h('div', { class: 'perk-req' }, `🔒 Needs ${unmet.map(([id, need]) => `${this.lc.perks.find((x) => x.id === id)?.name ?? id} rank ${need}`).join(', ')}`) : null,
      maxed
        ? null
        : h(
            'button',
            {
              class: `perk-buy${!why ? ' primary' : ''}`,
              disabled: !!why,
              title: why ?? `Buy rank ${rank + 1}`,
              onclick: () => {
                const res = this.game.run({ type: 'buyPerk', perkId: p.id });
                if (!res.ok) this.host.toast(res.reason, 'bad');
                this.host.refreshPanel();
              },
            },
            locked ? '🔒 ' : '',
            `Buy ◆ ${cost}`,
          ),
    );
  }

  private outputMult(): number {
    return 1 + bonus(this.game.state, this.game.content, 'outpostOutput');
  }

  private outpostsTab(): HTMLElement[] {
    const { state } = this.game;
    const t = outpostTotals(state);
    const out: HTMLElement[] = [];
    const outposts = state.legacy.outposts;
    if (!outposts.length) {
      out.push(
        h('p', { class: 'legacy-note' }, `No outposts yet. When Homestead ${state.homesteadNumber} founds a new homestead, everyone who stays behind keeps it running as your first outpost, sending scrip, salvage and the odd Supply Crate.`),
      );
    } else {
      const any = t.scrip + t.salvage + t.crates > 0;
      out.push(
        h(
          'div',
          { class: 'outpost-collect' },
          h('div', {}, h('div', { class: 'muted small' }, 'Waiting at your outposts'), h('div', { class: 'loot-line' }, h('span', { class: 'loot-chip' }, `💰 ${fmt(t.scrip)}`), h('span', { class: 'loot-chip' }, `⚙ ${fmt(t.salvage)}`), h('span', { class: 'loot-chip' }, `📦 ${fmt(t.crates)}`))),
          h(
            'button',
            {
              class: 'primary',
              disabled: !any,
              onclick: () => {
                const res = this.game.run({ type: 'collectOutposts' });
                if (!res.ok) this.host.toast(res.reason, 'bad');
                this.host.refreshPanel();
              },
            },
            any ? 'Collect all' : 'Nothing yet',
          ),
        ),
      );
      for (const o of [...outposts].sort((a, b) => b.cycle - a.cycle)) out.push(this.outpostCard(o));
      const perk = bonus(state, this.game.content, 'outpostOutput');
      out.push(h('p', { class: 'muted small' }, `Outposts store up to ${this.lc.outposts.storageHours} hours of output, online or offline.${perk ? ` Supply Lines: +${Math.round(perk * 100)}% output.` : ' Supply Lines (Network perks) raises their output.'}`));
    }
    out.push(h('h3', { class: 'group' }, 'Homestead history'));
    const rows = [
      ...state.legacy.history.map((r) => ({ cycle: r.cycle, number: r.homesteadNumber, site: r.siteId, pop: r.peakPopulation, days: r.days, legacy: `◆ ${r.legacyEarned}`, now: false })),
      { cycle: state.legacy.cycle, number: state.homesteadNumber, site: state.legacy.siteId, pop: state.peakPopulation, days: Math.floor(state.time / 86400), legacy: 'now', now: true },
    ];
    out.push(
      h(
        'table',
        { class: 'history-table' },
        h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Homestead'), h('th', {}, 'Peak'), h('th', {}, 'Days'), h('th', {}, 'Legacy'))),
        h(
          'tbody',
          {},
          ...rows.map((r) =>
            h(
              'tr',
              { class: r.now ? 'now' : '' },
              h('td', {}, `${r.cycle}`),
              h('td', {}, h('b', {}, `${r.number}`), h('span', { class: 'muted small' }, ` ${siteDef(this.game.content, r.site)?.name ?? r.site}`)),
              h('td', {}, `${r.pop}`),
              h('td', {}, `${r.days}`),
              h('td', {}, r.legacy),
            ),
          ),
        ),
      ),
    );
    return out;
  }

  private outpostCard(o: Outpost): HTMLElement {
    const cap = this.lc.outposts.storageHours;
    const mult = this.outputMult();
    const site = siteDef(this.game.content, o.siteId);
    const look = SITE_LOOK[o.siteId];
    const bar = (label: string, stored: number, rate: number, digits = 0) => {
      const max = rate * mult * cap;
      const pct = max > 0 ? Math.min(100, (stored / max) * 100) : 0;
      return h(
        'div',
        { class: `outpost-bar${pct >= 99.5 ? ' full' : ''}` },
        h('div', { class: 'row small', style: 'margin:0' }, h('span', {}, label), h('span', { class: 'nowrap' }, h('b', {}, `${Math.floor(stored)}`), h('span', { class: 'muted' }, ` / ${fmt(Math.round(max))} · ${fmtNum(rate * mult, rate * mult < 1 ? 2 : digits)}/h`))),
        h('div', { class: 'progress big' }, h('div', { style: `width:${pct.toFixed(1)}%` })),
      );
    };
    return h(
      'div',
      { class: `list-item outpost-card tone-${look?.tone ?? 'plot'}` },
      h('div', { class: 'row', style: 'margin:0' }, h('b', {}, `${look?.icon ?? '🏚'} Homestead ${o.homesteadNumber}`), h('span', { class: 'status-pill' }, `Outpost · #${o.cycle}`)),
      h('div', { class: 'muted small' }, `${site?.name ?? o.siteId} · ${o.population} resident${o.population === 1 ? '' : 's'} stayed`),
      bar('💰 Scrip', o.stored.scrip, o.rates.scrip),
      bar('⚙ Salvage', o.stored.salvage, o.rates.salvage, 1),
      bar('📦 Crates', o.stored.crates, o.rates.cratesPerHour, 1),
    );
  }

  // ---------------------------------------------------------------- charter moment

  private showCharterReached(): void {
    const { state, content } = this.game;
    const cs = charterStatus(state, content);
    const est = legacyBreakdown(state, content).total;
    const close = () => this.host.modalHost.replaceChildren();
    this.host.modalHost.replaceChildren(
      h(
        'div',
        { class: 'modal-backdrop ceremony-backdrop', onclick: (e: Event) => e.target === e.currentTarget && close() },
        h(
          'div',
          { class: 'modal ceremony charter-modal' },
          h('div', { class: 'ceremony-kicker' }, 'Halcyon Charter §12'),
          h('div', { class: 'ceremony-title' }, 'Charter milestone reached'),
          h('div', { class: 'ribbon' }),
          h('p', { class: 'halcy-quote' }, halcyFace(), h('span', { class: 'giver' }, 'HALCY: '), cs.text),
          h('ul', { class: 'tick-list' }, ...cs.requirements.map((r) => h('li', {}, `✓ ${r.label}`))),
          h('p', {}, `Homestead ${state.homesteadNumber} may now sponsor a new homestead. Founding now would earn about `, h('b', { class: 'legacy-ink' }, `◆ ${est} Legacy`), '.'),
          h('p', { class: 'muted small' }, 'No rush: the Charter stays signed. Found whenever you are ready, from the Legacy panel.'),
          h(
            'div',
            { class: 'row', style: 'justify-content:flex-end;gap:8px;margin-top:12px' },
            h('button', { onclick: close }, 'Later'),
            h(
              'button',
              {
                class: 'primary',
                onclick: () => {
                  close();
                  this.host.openLegacy('charter');
                },
              },
              'View Legacy',
            ),
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- the Found flow

  openFlow(): void {
    const { state, content } = this.game;
    const why = canFoundHomestead(state, content);
    if (why) {
      this.host.toast(`Not yet: ${why}.`, 'bad');
      return;
    }
    const limits = foundingLimits(state, content);
    const party = this.candidates('level')
      .filter((r) => canFound(state, r) === null)
      .slice(0, limits.party)
      .map((r) => r.id);
    const heirlooms = this.storedItems()
      .filter(({ def }) => def.rarity !== 'common')
      .slice(0, limits.heirlooms)
      .map(({ id }) => id);
    this.flow = { step: 0, siteId: 'plot7', partyIds: party, heirloomIds: heirlooms, partySort: 'level', backup: null, holding: false, error: null };
    this.flowStep = -1;
    this.renderFlow();
  }

  private closeFlow(): void {
    this.cancelHold();
    this.flow = null;
    this.flowStep = -1;
    this.host.modalHost.replaceChildren();
  }

  private goStep(step: number): void {
    const d = this.flow;
    if (!d) return;
    d.step = Math.max(0, Math.min(STEPS.length - 1, step));
    d.error = null;
    if (d.step === STEPS.length - 1) d.backup = this.game.backupNow();
    this.renderFlow();
  }

  /** Residents who could be asked, eligible first. */
  private candidates(sort: 'level' | 'rarity'): Resident[] {
    const { state } = this.game;
    return state.residents
      .filter((r) => !r.dead && !r.waiting)
      .sort((a, b) => {
        const elig = Number(canFound(state, a) !== null) - Number(canFound(state, b) !== null);
        if (elig) return elig;
        const lvl = b.level - a.level;
        const rar = RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
        return (sort === 'level' ? lvl || rar : rar || lvl) || a.id - b.id;
      });
  }

  private storedItems(): { id: number; def: ItemDef }[] {
    const { state, content } = this.game;
    return state.items
      .map((i) => ({ id: i.id, def: content.items[i.defId] }))
      .filter((x): x is { id: number; def: ItemDef } => !!x.def)
      .sort((a, b) => RARITY_ORDER[a.def.rarity] - RARITY_ORDER[b.def.rarity] || a.def.name.localeCompare(b.def.name) || a.id - b.id);
  }

  /** Drop picks that no longer exist or can no longer go. */
  private prune(d: FoundDraft): void {
    const { state } = this.game;
    d.heirloomIds = d.heirloomIds.filter((id) => state.items.some((i) => i.id === id));
    d.partyIds = d.partyIds.filter((id) => state.residents.some((r) => r.id === id));
  }

  private renderFlow(): void {
    const d = this.flow;
    if (!d) return;
    this.lastFlowRender = performance.now();
    this.prune(d);
    const { state, content } = this.game;
    const why = canFoundHomestead(state, content);
    const limits = foundingLimits(state, content);
    const partyProblems = d.partyIds
      .map((id) => state.residents.find((r) => r.id === id))
      .filter((r): r is Resident => !!r)
      .map((r) => ({ r, why: canFound(state, r) }))
      .filter((x) => x.why);
    const blocker =
      why ??
      (d.step >= 2 && d.partyIds.length === 0 ? 'pick at least one founder' : null) ??
      (d.step >= 2 && partyProblems.length ? `${partyProblems[0]!.r.firstName} can't go: ${partyProblems[0]!.why}` : null);

    let body: HTMLElement[];
    switch (d.step) {
      case 0:
        body = this.stepReview();
        break;
      case 1:
        body = this.stepSite(d);
        break;
      case 2:
        body = this.stepParty(d, limits.party);
        break;
      case 3:
        body = this.stepHeirlooms(d, limits.heirlooms);
        break;
      default:
        body = this.stepConfirm(d);
    }
    const last = d.step === STEPS.length - 1;
    const hold = h(
      'button',
      {
        class: `primary hold-btn${d.holding ? ' holding' : ''}`,
        disabled: !!blocker,
        style: `--hold:${HOLD_MS}ms`,
        onpointerdown: (e: Event) => {
          if ((e as PointerEvent).button > 0) return;
          this.startHold();
        },
        onpointerup: () => this.cancelHold(true),
        onpointerleave: () => this.cancelHold(true),
        onpointercancel: () => this.cancelHold(true),
        oncontextmenu: (e: Event) => e.preventDefault(),
        // Keyboard activation (Enter or Space) has no pointer: found at once.
        onclick: (e: Event) => {
          if ((e as MouseEvent).detail === 0) this.doFound();
        },
      },
      h('span', { class: 'hold-fill' }),
      h('span', { class: 'hold-label' }, d.holding ? 'Keep holding…' : `Hold to found`),
    );
    const flow = h(
      'div',
      { class: 'found-flow', role: 'dialog', 'aria-label': 'Found a New Homestead' },
      h(
        'div',
        { class: 'ff-frame' },
        h(
          'header',
          { class: 'ff-head' },
          h('div', { class: 'ff-kicker' }, `Halcyon Charter §12 · Homestead ${state.homesteadNumber}`),
          h('h1', {}, 'Found a New Homestead'),
          h(
            'ol',
            { class: 'ff-steps' },
            ...STEPS.map((label, i) =>
              h(
                'li',
                { class: i === d.step ? 'current' : i < d.step ? 'done' : '' },
                h('button', { disabled: i >= d.step, onclick: () => this.goStep(i), 'aria-label': `Step ${i + 1}: ${label}` }, h('span', { class: 'n' }, i < d.step ? '✓' : `${i + 1}`), h('span', { class: 'l' }, label)),
              ),
            ),
          ),
          h('button', { class: 'ff-close close', 'aria-label': 'Cancel founding', onclick: () => this.closeFlow() }, '✕'),
        ),
        h('main', { class: 'ff-body' }, ...body),
        h(
          'footer',
          { class: 'ff-foot' },
          d.error ? h('div', { class: 'ff-error' }, d.error) : blocker && d.step > 0 ? h('div', { class: 'ff-error' }, capitalize(blocker)) : h('div', { class: 'ff-foot-note muted small' }, this.footNote(d)),
          h(
            'div',
            { class: 'ff-buttons' },
            d.step === 0 ? h('button', { onclick: () => this.closeFlow() }, 'Cancel') : h('button', { onclick: () => this.goStep(d.step - 1) }, '◀ Back'),
            last ? hold : h('button', { class: 'primary', disabled: !!blocker, onclick: () => this.goStep(d.step + 1) }, `${STEPS[d.step + 1]} ▶`),
          ),
        ),
      ),
    );
    const old = this.host.modalHost.firstElementChild;
    if (old && old.classList.contains('found-flow') && this.flowStep === d.step) morph(old, flow);
    else {
      this.host.modalHost.replaceChildren(flow);
      flow.querySelector('.ff-body')?.scrollTo(0, 0);
    }
    this.flowStep = d.step;
  }

  private footNote(d: FoundDraft): string {
    const { state, content } = this.game;
    const limits = foundingLimits(state, content);
    const site = siteDef(content, d.siteId);
    return `${site?.name ?? d.siteId} · ${d.partyIds.length}/${limits.party} founders · ${d.heirloomIds.length}/${limits.heirlooms} heirlooms`;
  }

  private stepReview(): HTMLElement[] {
    const { state, content } = this.game;
    const b = legacyBreakdown(state, content);
    return [
      h('p', { class: 'halcy-quote' }, halcyFace(), h('span', { class: 'giver' }, 'HALCY: '), `Paperwork first, Warden! Here is what Homestead ${state.homesteadNumber} has earned the family name. Legacy is scored for this homestead only, and it is yours to keep.`),
      h('div', { class: 'ff-total' }, h('span', { class: 'muted' }, 'You will earn'), h('b', {}, `◆ ${b.total} Legacy`), h('span', { class: 'muted small' }, `Unspent after founding: ◆ ${state.legacy.points + b.total}`)),
      this.breakdownTable(),
      h('div', { class: 'carry-grid' }, carryList('Comes with you', CARRIES, 'carry'), carryList('Stays behind', STAYS, 'stay')),
    ];
  }

  private stepSite(d: FoundDraft): HTMLElement[] {
    const { state, content } = this.game;
    const b = legacyBreakdown(state, content);
    const here = siteDef(content, state.legacy.siteId);
    return [
      h('p', { class: 'halcy-quote' }, halcyFace(), h('span', { class: 'giver' }, 'HALCY: '), 'Location, location, irradiation! Harder ground pays better when the new homestead founds one of its own.'),
      h('p', { class: 'muted small' }, `This founding earns ◆ ${b.total} (scored at ${here?.name ?? 'Plot 7'} ×${fmtMult(b.siteMult)}). The site you pick sets the multiplier for the new homestead's own founding later.`),
      h(
        'div',
        { class: 'site-grid' },
        ...this.lc.sites.map((s) => {
          const look = SITE_LOOK[s.id];
          const sel = d.siteId === s.id;
          const startScrip = content.balance.start.scrip + bonus(state, content, 'startScrip') + (s.modifiers.startScrip ?? 0);
          return h(
            'button',
            {
              class: `site-card tone-${look?.tone ?? 'plot'}${sel ? ' selected' : ''}`,
              'aria-pressed': sel ? 'true' : 'false',
              onclick: () => {
                d.siteId = s.id;
                this.renderFlow();
              },
            },
            h('div', { class: 'site-head' }, h('span', { class: 'site-icon' }, look?.icon ?? '🏚'), h('b', {}, s.name), h('span', { class: 'site-mult' }, `×${fmtMult(s.legacyMult)}`)),
            h('div', { class: 'site-desc' }, s.description),
            h('div', { class: 'loot-line' }, ...siteModifiers(s).map((m) => h('span', { class: `loot-chip ${m.tone}` }, m.text)), h('span', { class: 'loot-chip' }, `💰 ${fmt(startScrip)} to start`)),
            h('div', { class: 'site-legacy small' }, `Legacy ×${fmtMult(s.legacyMult)} when this homestead founds its own. A run like this one there: ~◆ ${Math.floor(b.subtotal * s.legacyMult)}.`),
            sel ? h('div', { class: 'site-pick' }, '✓ Chosen') : null,
          );
        }),
      ),
    ];
  }

  private stepParty(d: FoundDraft, max: number): HTMLElement[] {
    const { state, content } = this.game;
    const again = () => this.renderFlow();
    const toggle = (id: number) => {
      d.error = null;
      if (d.partyIds.includes(id)) d.partyIds = d.partyIds.filter((x) => x !== id);
      else if (d.partyIds.length < max) d.partyIds = [...d.partyIds, id];
      else this.host.toast(`The founding party holds ${max}. Big Families (Network perks) makes room for more.`, 'bad');
      again();
    };
    const living = state.residents.filter((r) => !r.dead && !r.waiting).length;
    const stayers = living - d.partyIds.length;
    const picked = d.partyIds.map((id) => state.residents.find((r) => r.id === id)).filter((r): r is Resident => !!r);
    const rows = this.candidates(d.partySort).map((r) => {
      const why = canFound(state, r);
      const sel = d.partyIds.includes(r.id);
      const eff = effectiveStats(content, r);
      const top = [...STAT_KEYS].sort((a, b) => eff[b] - eff[a]).slice(0, 3);
      const best = topStats(eff);
      const w = r.weapon ? content.weapons[r.weapon] : undefined;
      const o = r.outfit ? content.outfits[r.outfit] : undefined;
      return h(
        'div',
        { class: `list-item pick-row founder-row${sel ? ' selected' : ''}${why ? ' locked' : ''}`, onclick: () => !why && toggle(r.id) },
        h(
          'div',
          { class: 'row', style: 'margin:0' },
          h('b', {}, h('span', { class: 'pick-box' }, sel ? '✓' : ''), r.rarity !== 'common' ? h('span', { class: `rarity ${r.rarity}` }, ` ${RARITY_MARK[r.rarity]}`) : null, ` ${r.firstName} ${r.lastName}`),
          h('span', { class: `lvl-badge ${r.rarity}` }, `L${r.level}`),
        ),
        h('div', { class: 'founder-stats' }, ...top.map((k) => h('span', { class: best.includes(k) ? 'hi' : '' }, `${STAT_SHORT[k]} ${eff[k]}`)), h('span', { class: 'muted small gear' }, `${w ? `⚔ ${w.name}` : '⚔ Fists'} · ${o ? `👕 ${o.name}` : '👕 Jumpsuit'}`)),
        why ? h('div', { class: 'small short' }, `Can't go: ${why}`) : null,
      );
    });
    const sortBtn = (id: 'level' | 'rarity', label: string) =>
      h(
        'button',
        {
          class: d.partySort === id ? 'active' : '',
          onclick: () => {
            d.partySort = id;
            again();
          },
        },
        label,
      );
    return [
      h('p', { class: 'halcy-quote' }, halcyFace(), h('span', { class: 'giver' }, 'HALCY: '), `Pick your pioneers! Up to ${max} can make the trip. They keep their levels, stats and the gear on their backs.`),
      h(
        'div',
        { class: 'founder-slots' },
        ...Array.from({ length: max }, (_, i) => {
          const r = picked[i];
          return r
            ? h('button', { class: `founder-slot ${r.rarity}`, title: 'Tap to remove', onclick: () => toggle(r.id) }, h('b', {}, r.firstName), h('span', { class: 'muted small' }, `L${r.level}`))
            : h('div', { class: 'founder-slot empty' }, 'open');
        }),
      ),
      h('p', { class: 'muted small' }, `Everyone else (${stayers} resident${stayers === 1 ? '' : 's'}) stays behind and keeps Homestead ${state.homesteadNumber} running as an outpost. Strangers fill out the new homestead's first six.`),
      ...this.leftBehindWarning(d, 'worn'),
      h('div', { class: 'tabs', style: 'margin:0 0 6px' }, h('span', { class: 'muted small', style: 'align-self:center' }, 'Sort:'), sortBtn('level', 'Level'), sortBtn('rarity', 'Rarity')),
      h('div', { class: 'ff-list' }, ...rows),
    ];
  }

  private stepHeirlooms(d: FoundDraft, max: number): HTMLElement[] {
    const items = this.storedItems();
    const toggle = (id: number) => {
      if (d.heirloomIds.includes(id)) d.heirloomIds = d.heirloomIds.filter((x) => x !== id);
      else if (d.heirloomIds.length < max) d.heirloomIds = [...d.heirloomIds, id];
      else this.host.toast(`Only ${max} heirlooms fit. Family Heirlooms (Network perks) lets you bring more.`, 'bad');
      this.renderFlow();
    };
    const rows = items.map(({ id, def }) => {
      const sel = d.heirloomIds.includes(id);
      const what = def.kind === 'weapon' ? `⚔ ${def.min}–${def.max} dmg` : `👕 ${Object.entries(def.bonus).map(([k, v]) => `+${v} ${STAT_SHORT[k as StatKey]}`).join(' ')}`;
      return h(
        'div',
        { class: `list-item pick-row heirloom-row ${def.rarity}${sel ? ' selected' : ''}`, onclick: () => toggle(id) },
        h('div', { class: 'row', style: 'margin:0' }, h('b', {}, h('span', { class: 'pick-box' }, sel ? '✓' : ''), def.rarity !== 'common' ? h('span', { class: `rarity ${def.rarity}` }, ` ${RARITY_MARK[def.rarity]}`) : null, ` ${def.name}`), h('span', { class: `rarity ${def.rarity} small` }, def.rarity)),
        h('div', { class: 'muted small' }, what),
      );
    });
    const out: (HTMLElement | null)[] = [
      h('p', { class: 'halcy-quote' }, halcyFace(), h('span', { class: 'giver' }, 'HALCY: '), `Pack the good china! Up to ${max} items from storage can travel as heirlooms. Gear your founders are wearing comes along anyway.`),
      h('div', { class: 'row' }, h('b', {}, `Heirlooms ${d.heirloomIds.length} / ${max}`), h('span', { class: 'muted small' }, `${items.length} in storage`)),
      h('div', { class: 'slot-pips' }, ...Array.from({ length: max }, (_, i) => h('span', { class: i < d.heirloomIds.length ? 'used' : 'free' }))),
      ...this.leftBehindWarning(d, 'stored'),
      items.length ? h('div', { class: 'ff-list' }, ...rows) : h('p', { class: 'legacy-note' }, 'Storage is empty. Your founders still bring the gear they wear.'),
      items.length ? h('p', { class: 'muted small' }, 'Everything else in storage stays behind.') : null,
    ];
    return out.filter((x): x is HTMLElement => !!x);
  }

  private stepConfirm(d: FoundDraft): HTMLElement[] {
    const { state, content } = this.game;
    const site = siteDef(content, d.siteId);
    const b = legacyBreakdown(state, content);
    const party = d.partyIds.map((id) => state.residents.find((r) => r.id === id)).filter((r): r is Resident => !!r);
    const items = d.heirloomIds.map((id) => state.items.find((i) => i.id === id)).map((i) => (i ? content.items[i.defId] : undefined)).filter((x): x is ItemDef => !!x);
    const living = state.residents.filter((r) => !r.dead && !r.waiting).length;
    const stayers = living - party.length;
    const startScrip = content.balance.start.scrip + bonus(state, content, 'startScrip') + (site?.modifiers.startScrip ?? 0);
    const line = (label: string, ...value: (HTMLElement | string)[]) => h('div', { class: 'sum-line' }, h('span', { class: 'muted' }, label), h('span', {}, ...value));
    const backup = d.backup;
    return [
      h('div', { class: 'ff-total' }, h('span', { class: 'muted' }, 'Legacy earned'), h('b', {}, `◆ ${b.total}`), h('span', { class: 'muted small' }, `◆ ${state.legacy.points + b.total} unspent after founding`)),
      h(
        'div',
        { class: 'sum-grid' },
        line('New site', `${SITE_LOOK[d.siteId]?.icon ?? ''} ${site?.name ?? d.siteId}`, h('span', { class: 'muted small' }, ` · Legacy ×${fmtMult(site?.legacyMult ?? 1)} next time`)),
        line(`Founding party (${party.length})`, party.map((r) => `${r.firstName} ${r.lastName} (L${r.level})`).join(', ') || 'nobody'),
        line(`Heirlooms (${items.length})`, items.map((i) => i.name).join(', ') || 'none'),
        line('Starting scrip', `💰 ${fmt(startScrip)}`),
        line('Left behind', `Homestead ${state.homesteadNumber} becomes an outpost with ${stayers} resident${stayers === 1 ? '' : 's'}`),
      ),
      ...this.leftBehindWarning(d, 'both'),
      h(
        'div',
        { class: 'ff-warning' },
        h('b', {}, '⚠ This cannot be undone.'),
        ` Homestead ${state.homesteadNumber}'s rooms, resources, salvage and every item not packed as an heirloom stay behind for good. You will take over the new homestead at once.`,
      ),
      h(
        'div',
        { class: `ff-backup${backup?.ok ? ' ok' : ' bad'}` },
        h('span', {}, backup?.ok ? '✓ A backup of this save is stored in this browser.' : "⚠ Couldn't store a backup in this browser. Download one before you found."),
        h('button', { class: 'close', onclick: () => this.downloadBackup(this.game.backupNow().json, state.homesteadNumber) }, '⤓ Download backup'),
      ),
      h('p', { class: 'muted small', style: 'text-align:center' }, 'Press and hold the button to sign the Charter.'),
    ];
  }

  /**
   * Rare and legendary gear that would stay at the outpost: worn by someone not
   * in the party, or in storage and not packed. Each comes with a one-tap fix
   * (swap the wearer into the party, pack the item as an heirloom) where the
   * limits allow it.
   */
  private leftBehindWarning(d: FoundDraft, which: 'worn' | 'stored' | 'both'): HTMLElement[] {
    const { state, content } = this.game;
    const limits = foundingLimits(state, content);
    const rows: HTMLElement[] = [];
    if (which !== 'stored') {
      for (const r of state.residents) {
        if (r.dead || r.waiting || d.partyIds.includes(r.id)) continue;
        for (const defId of [r.weapon, r.outfit]) {
          const def = defId ? content.items[defId] : undefined;
          if (!def || def.rarity === 'common') continue;
          const why = canFound(state, r);
          const swap = this.swapTarget(d, limits.party);
          rows.push(
            h(
              'div',
              { class: 'ff-left-row' },
              h('span', {}, h('span', { class: `rarity ${def.rarity}` }, `${RARITY_MARK[def.rarity]} ${def.name}`), ` · worn by ${r.firstName} ${r.lastName}`),
              why
                ? h('span', { class: 'muted small' }, `can't go: ${why}`)
                : h(
                    'button',
                    {
                      class: 'close',
                      disabled: swap === null,
                      title: swap === null ? 'The founding party is full of residents wearing rare gear' : '',
                      onclick: () => {
                        const out = this.swapTarget(d, limits.party);
                        if (out === null) return;
                        d.partyIds = [...d.partyIds.filter((id) => id !== out), r.id];
                        this.renderFlow();
                      },
                    },
                    swap === null ? 'Party full' : swap === -1 ? 'Add to party' : `Swap in for ${state.residents.find((x) => x.id === swap)?.firstName ?? 'someone'}`,
                  ),
            ),
          );
        }
      }
    }
    if (which !== 'worn') {
      const full = d.heirloomIds.length >= limits.heirlooms;
      for (const { id, def } of this.storedItems()) {
        if (def.rarity === 'common' || d.heirloomIds.includes(id)) continue;
        rows.push(
          h(
            'div',
            { class: 'ff-left-row' },
            h('span', {}, h('span', { class: `rarity ${def.rarity}` }, `${RARITY_MARK[def.rarity]} ${def.name}`), ' · in storage'),
            h(
              'button',
              {
                class: 'close',
                disabled: full,
                title: full ? 'Every heirloom slot is taken' : '',
                onclick: () => {
                  if (d.heirloomIds.length >= limits.heirlooms) return;
                  d.heirloomIds = [...d.heirloomIds, id];
                  this.renderFlow();
                },
              },
              full ? 'Heirlooms full' : 'Add as heirloom',
            ),
          ),
        );
      }
    }
    if (!rows.length) return [];
    const shown = rows.slice(0, 6);
    return [
      h(
        'div',
        { class: 'ff-warning ff-left' },
        h('b', {}, `⚠ ${rows.length === 1 ? 'A rare piece of gear stays' : `${rows.length} rare pieces of gear stay`} at the outpost`),
        h('div', { class: 'small', style: 'margin:2px 0 6px' }, 'Anything not worn by a founder or packed as an heirloom stays behind for good.'),
        ...shown,
        rows.length > shown.length ? h('div', { class: 'muted small' }, `and ${rows.length - shown.length} more`) : null,
      ),
    ];
  }

  /**
   * Who makes way when a rare-gear wearer joins the party: -1 if there is a free
   * place, else the lowest-level founder not wearing rare gear, else null.
   */
  private swapTarget(d: FoundDraft, max: number): number | null {
    const { state, content } = this.game;
    if (d.partyIds.length < max) return -1;
    const rare = (r: Resident) => [r.weapon, r.outfit].some((id) => id && content.items[id] && content.items[id]!.rarity !== 'common');
    const out = d.partyIds
      .map((id) => state.residents.find((r) => r.id === id))
      .filter((r): r is Resident => !!r && !rare(r))
      .sort((a, b) => a.level - b.level || a.id - b.id)[0];
    return out?.id ?? null;
  }

  private downloadBackup(json: string, homestead: number): void {
    downloadFile(`homestead-${homestead}-before-founding.json`, json);
  }

  private startHold(): void {
    const d = this.flow;
    if (!d || d.holding) return;
    d.holding = true;
    d.error = null;
    this.renderFlow();
    this.holdTimer = window.setTimeout(() => {
      this.holdTimer = null;
      this.doFound();
    }, HOLD_MS);
  }

  private cancelHold(render = false): void {
    if (this.holdTimer !== null) window.clearTimeout(this.holdTimer);
    this.holdTimer = null;
    if (this.flow?.holding) {
      this.flow.holding = false;
      if (render) this.renderFlow();
    }
  }

  private doFound(): void {
    const d = this.flow;
    if (!d) return;
    this.cancelHold();
    const siteId = d.siteId;
    const partyNames = d.partyIds.map((id) => this.game.state.residents.find((r) => r.id === id)?.firstName ?? '?');
    const heirlooms = d.heirloomIds.length;
    const res = this.game.found({ siteId, partyIds: d.partyIds, heirloomIds: d.heirloomIds });
    if (!res.ok) {
      d.error = `Founding failed: ${res.reason}.`;
      this.renderFlow();
      return;
    }
    this.flow = null;
    this.flowStep = -1;
    this.showArrival(res, siteId, partyNames, heirlooms);
  }

  /** HALCY's welcome to the new homestead, over the freshly rebuilt view. */
  private showArrival(res: Extract<FoundResult, { ok: true }>, siteId: string, party: string[], heirlooms: number): void {
    const { state, content } = this.game;
    const site = siteDef(content, siteId);
    const look = SITE_LOOK[siteId];
    const names = party.length > 1 ? `${party.slice(0, -1).join(', ')} and ${party[party.length - 1]}` : (party[0] ?? 'Your party');
    const close = () => this.host.modalHost.replaceChildren();
    this.host.modalHost.replaceChildren(
      h(
        'div',
        { class: 'modal-backdrop ceremony-backdrop arrival' },
        h(
          'div',
          { class: `modal ceremony arrival-modal tone-${look?.tone ?? 'plot'}` },
          h('div', { class: 'ceremony-kicker' }, `Homestead ${state.legacy.cycle} of your line · ${site?.name ?? siteId}`),
          h('div', { class: 'ceremony-title big' }, `Homestead ${state.homesteadNumber}`),
          h('div', { class: 'ribbon cut' }),
          h(
            'p',
            { class: 'halcy-quote' },
            halcyFace(), h('span', { class: 'giver' }, 'HALCY: '),
            `Welcome to Halcyon Homestead ${state.homesteadNumber}, ${site?.name ?? 'your new site'}! ${names} ${party.length === 1 ? 'is' : 'are'} waiting at the door${heirlooms ? `, and ${heirlooms} heirloom${heirlooms === 1 ? ' is' : 's are'} in storage` : ''}. I have hung the ribbon and alphabetised the rubble.`,
          ),
          h('div', { class: 'ff-total' }, h('span', { class: 'muted' }, 'You earned'), h('b', {}, `◆ ${res.legacy} Legacy`), h('span', { class: 'muted small' }, `Spend it in the Legacy panel. ◆ ${state.legacy.points} unspent.`)),
          res.stayers
            ? h('p', { class: 'muted small' }, `Homestead ${res.oldNumber} carries on as an outpost with ${res.stayers} resident${res.stayers === 1 ? '' : 's'}. Collect its supplies from the Legacy panel.`)
            : null,
          res.backedUp ? null : h('p', { class: 'small short' }, "The browser backup couldn't be stored. Download it now if you want to keep it."),
          h(
            'div',
            { class: 'row', style: 'justify-content:space-between;gap:8px;margin-top:12px;flex-wrap:wrap' },
            h('button', { class: 'close', onclick: () => this.downloadBackup(res.backup, res.oldNumber) }, `⤓ Backup of ${res.oldNumber}`),
            h(
              'span',
              { class: 'row', style: 'margin:0;gap:8px' },
              h(
                'button',
                {
                  onclick: () => {
                    close();
                    this.host.openLegacy('perks');
                  },
                },
                '◆ Spend Legacy',
              ),
              h('button', { class: 'primary', onclick: close }, 'To the door'),
            ),
          ),
        ),
      ),
    );
  }
}

// -------------------------------------------------------------------- helpers

/** A perk's effect at a rank, with "{v}" filled in (fractions as percentages). */
export function perkText(p: PerkDef, rank: number): string {
  const v = p.perRank * rank;
  const frac = !Number.isInteger(p.perRank);
  return p.description.replace('{v}', frac ? `${Math.round(v * 100)}` : fmt(v));
}

function carryList(title: string, items: string[], kind: 'carry' | 'stay'): HTMLElement {
  return h('div', { class: `carry-list ${kind}` }, h('b', {}, kind === 'carry' ? `➜ ${title}` : `⌂ ${title}`), h('ul', {}, ...items.map((t) => h('li', {}, t))));
}

/** A site's modifiers in plain words. */
function siteModifiers(s: SiteDef): { text: string; tone: string }[] {
  const out: { text: string; tone: string }[] = [];
  const prod = Object.entries(s.modifiers.production ?? {});
  const groups = new Map<number, string[]>();
  for (const [k, v] of prod) groups.set(v as number, [...(groups.get(v as number) ?? []), RESOURCE_NAME[k] ?? k]);
  for (const [mult, names] of groups) {
    const pct = Math.round((mult - 1) * 100);
    const lower = names.map((n, i) => (i ? n.toLowerCase() : n));
    const list = lower.length > 1 ? `${lower.slice(0, -1).join(', ')} and ${lower[lower.length - 1]}` : (lower[0] ?? '');
    out.push({ text: `${list} production ${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`, tone: pct < 0 ? 'bad' : 'good' });
  }
  if (s.modifiers.incidentRate && s.modifiers.incidentRate !== 1) {
    const pct = Math.round((s.modifiers.incidentRate - 1) * 100);
    out.push({ text: pct > 0 ? `Incidents ${pct}% more often` : `Incidents ${-pct}% less often`, tone: pct > 0 ? 'bad' : 'good' });
  }
  if (s.modifiers.startScrip) out.push({ text: `+${fmt(s.modifiers.startScrip)} starting scrip`, tone: 'good' });
  if (!out.length) out.push({ text: 'Standard conditions', tone: '' });
  return out;
}

function fmtMult(m: number): string {
  return Number.isInteger(m) ? `${m}` : m.toFixed(2).replace(/0$/, '');
}

function fmtNum(n: number, digits: number): string {
  return digits ? n.toFixed(digits).replace(/\.?0+$/, '') : fmt(n);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
