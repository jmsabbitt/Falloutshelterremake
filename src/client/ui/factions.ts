// M7 factions in the client: the Factions panel (one card per faction with
// its reputation, contact and Influence), the trade board (offers grouped by
// faction, give and get with icons, stock, the standing needed and why a
// trade can't go through), and caravans (the send modal with a live
// estimate, the active list with countdowns, recall and collect). Hooked into
// ui.ts with a few small calls; the sim side is src/sim/systems/factions.ts.

import { clamped } from './clamp';
import {
  caravanCarryLimit,
  caravanEstimate,
  caravanSlots,
  canCaravan,
  contactLocked,
  effectiveStats,
  factionDef,
  factionsContent,
  goodsUnits,
  hasTradingPost,
  isMet,
  offerItemFor,
  raidRateMult,
  recruitsHired,
  repOf,
  repTier,
  salvageCount,
  signalLevel,
  tradeOffers,
  tradingPostStaffed,
  type Caravan,
  type CaravanEstimate,
  type CaravanResult,
  tradeBlocked,
  type CrateTier,
  type FactionDef,
  type FactionOffer,
  type GameEvent,
  type OfferSide,
  type Resident,
} from '../../sim';
import type { Game } from '../game';
import { duration, fmt, h, morph } from './dom';
import { itemIcon, salvageIcon } from './icons';
import type { ToastFn } from './toasts';

export type FactionsTab = 'factions' | 'trade' | 'caravans';

export interface FactionsHost {
  game: Game;
  modalHost: HTMLElement;
  toast: ToastFn;
  openFactions(tab?: FactionsTab): void;
  refreshPanel(): void;
}

/** Draft of the send-a-caravan modal. */
interface CaravanDraft {
  factionId: string | null;
  ids: number[];
  salvage: Record<string, number>;
  food: number;
  water: number;
  medpatch: number;
}

const TIER_CLASS = ['hostile', 'wary', 'neutral', 'friendly', 'allied'];
const FACTION_ICON: Record<string, string> = { caravaners: '🛒', tinkers: '🔧', lamplighters: '🕯', rustmen: '⚔', homestead9: '🏢' };
const CRATE_NAME: Record<CrateTier, string> = { standard: 'Supply Crate', rare: 'Rare Crate', legendary: 'Legendary Crate' };
const RES_ICON: Record<string, string> = { food: '🥫', water: '💧', medpatch: '✚', purge: '☢' };
const RES_NAME: Record<string, string> = { food: 'food', water: 'water', medpatch: 'Med-Patches', purge: 'Purge' };
const STAT_SHORT = { charm: 'CHR', fortune: 'FOR', brawn: 'BRN', grit: 'GRT' } as const;

export class FactionsUI {
  tab: FactionsTab = 'factions';
  private draft: CaravanDraft | null = null;
  /** Faction the trade tab is scrolled to (from a card's Trade button). */
  private focus: string | null = null;

  constructor(private host: FactionsHost) {}

  private get game(): Game {
    return this.host.game;
  }

  opened(tab?: FactionsTab, factionId?: string): void {
    if (tab) this.tab = tab;
    this.focus = factionId ?? null;
  }

  onStateReplaced(): void {
    this.draft = null;
    this.tab = 'factions';
    this.focus = null;
  }

  /** Show the Factions entry once the surface is open, or anyone has been met. */
  visible(): boolean {
    const { state } = this.game;
    return state.research.done.includes('topside_survey') || Object.values(state.factions ?? {}).some((f) => f.met) || (state.caravans ?? []).length > 0 || state.influence > 0;
  }

  /** Caravans home and waiting to be collected (a toolbar badge). */
  badge(): number {
    return (this.game.state.caravans ?? []).filter((c) => c.status === 'returned').length;
  }

  private defs(): FactionDef[] {
    return factionsContent(this.game.content).factions;
  }

  private name(id: string, short = true): string {
    const d = factionDef(this.game.content, id);
    return (short ? d?.shortName : undefined) ?? d?.name ?? id;
  }

  // ---------------------------------------------------------------- panel

  panel(): HTMLElement {
    const tabs = h(
      'div',
      { class: 'tabs faction-tabs' },
      ...(
        [
          ['factions', 'Factions'],
          ['trade', `Trade${this.tradeCount() ? ` (${this.tradeCount()})` : ''}`],
          ['caravans', `Caravans${this.badge() ? ` · ${this.badge()} home` : ''}`],
        ] as [FactionsTab, string][]
      ).map(([id, label]) => h('button', { class: this.tab === id ? 'active' : '', onclick: () => ((this.tab = id), (this.focus = null), this.host.refreshPanel()) }, label)),
    );
    const body = this.tab === 'trade' ? this.tradeTab() : this.tab === 'caravans' ? this.caravansTab() : this.factionsTab();
    return h('div', { class: 'body factions-body' }, this.influenceLine(), tabs, ...body);
  }

  private tradeCount(): number {
    return tradeOffers(this.game.state).filter((o) => o.stock > 0).length;
  }

  private influenceLine(): HTMLElement {
    const { state, content } = this.game;
    const sig = signalLevel(state, content);
    return h(
      'div',
      { class: 'influence-line' },
      h('span', { class: 'influence-num', title: 'Influence: earned by trading and caravans, spent on goodwill, offers and recruits' }, '✦ ', h('b', {}, fmt(state.influence)), ' Influence'),
      h('span', { class: 'muted small' }, sig > 0 ? `📡 Signal level ${sig}` : '📡 No Signal Mast'),
    );
  }

  // ---------------------------------------------------------------- factions

  private factionsTab(): HTMLElement[] {
    const { state, content } = this.game;
    const out: HTMLElement[] = [];
    if (!hasTradingPost(state) && signalLevel(state, content) === 0 && !this.defs().some((d) => isMet(state, d.id))) {
      out.push(h('p', { class: 'muted' }, 'Nobody out there knows you exist yet. Build a Signal Mast topside to reach the neighbours, and a Trading Post to do business with them.'));
    }
    for (const def of this.defs()) out.push(this.factionCard(def));
    return out;
  }

  private repBar(rep: number): HTMLElement {
    const { content } = this.game;
    const tiers = factionsContent(content).tuning.repTiers;
    const tier = repTier(content, rep);
    const pos = (v: number) => ((v + 100) / 200) * 100;
    return h(
      'div',
      { class: `rep-bar tier-${TIER_CLASS[tier.index] ?? 'neutral'}` },
      ...tiers.slice(1).map((t) => h('i', { class: 'rep-tick', style: `left:${pos(t)}%` })),
      h('i', { class: 'rep-zero', style: 'left:50%' }),
      h('span', { class: 'rep-mark', style: `left:${pos(rep)}%` }),
    );
  }

  private factionCard(def: FactionDef): HTMLElement {
    const { state, content } = this.game;
    const met = isMet(state, def.id);
    const rep = repOf(state, content, def.id);
    const tier = repTier(content, rep);
    const lock = met ? null : contactLocked(state, content, def.id);
    const names = factionsContent(content).tuning.repTierNames;
    const nextName = tier.next !== null ? names[tier.index + 1] : null;
    const offers = tradeOffers(state).filter((o) => o.factionId === def.id && o.stock > 0).length;
    const caravan = (state.caravans ?? []).find((c) => c.factionId === def.id);
    const bits: (HTMLElement | null)[] = [];
    if (def.id === 'rustmen') {
      const m = raidRateMult(state, content);
      bits.push(
        h(
          'div',
          { class: `small raid-effect${m > 1 ? ' short' : m < 1 ? ' ok-text' : ''}` },
          met ? `⚔ Raids come ${m === 1 ? 'at the usual rate' : `×${m} as often`}${m > 1 ? ': the clans take you for easy pickings' : m < 1 ? ': the clans have better things to do' : ''}` : '⚔ Raids at the usual rate until you talk to them. Friendlier clans raid less.',
        ),
      );
    }
    if (def.recruit && met) {
      const hired = recruitsHired(state, def.id);
      bits.push(h('div', { class: 'muted small' }, `👤 Recruit: ${def.recruit.title} at ${names[def.recruit.tier] ?? 'better'} standing · ${hired}/${def.recruit.cap} hired`));
    }
    const actions: HTMLElement[] = [];
    if (met) {
      actions.push(h('button', { class: 'close', disabled: !offers, onclick: () => ((this.tab = 'trade'), (this.focus = def.id), this.host.refreshPanel()) }, offers ? `Trade (${offers})` : 'No offers'));
      actions.push(
        h(
          'button',
          { class: 'close', disabled: !!caravan || !hasTradingPost(state), title: caravan ? 'A caravan is already on this route' : hasTradingPost(state) ? '' : 'Needs a Trading Post', onclick: () => this.openCaravan(def.id) },
          caravan ? '🛒 On the road' : '🛒 Caravan',
        ),
      );
    }
    return h(
      'div',
      { class: `list-item faction-card${met ? '' : ' unmet'}`, id: `faction-${def.id}` },
      h(
        'div',
        { class: 'row', style: 'margin:0' },
        h(
          'b',
          { class: 'faction-name' },
          // Leader portrait from the sprite pipeline (art/raw/factions), if painted.
          h('img', { class: 'faction-face', src: `sprites/portraits/faction_${def.id}.webp`, alt: '', onerror: (e: Event) => (e.target as HTMLElement).remove() }),
          `${FACTION_ICON[def.id] ?? '◆'} ${def.name}`,
        ),
        met ? h('span', { class: `tier-pill tier-${TIER_CLASS[tier.index] ?? 'neutral'}` }, tier.name) : h('span', { class: 'tier-pill locked' }, '🔒 No contact'),
      ),
      def.motto ? h('div', { class: 'motto' }, `“${def.motto}”`) : null,
      clamped(`faction:${def.id}`, (met ? (def.personality ?? def.description) : def.description).length, () => this.host.refreshPanel(), 'muted small', met ? (def.personality ?? def.description) : def.description),
      met
        ? h(
            'div',
            { class: 'rep-wrap' },
            this.repBar(rep),
            h('div', { class: 'row small', style: 'margin:2px 0 0' }, h('span', {}, `Reputation ${rep > 0 ? '+' : ''}${Math.round(rep)}`), h('span', { class: 'muted' }, nextName && tier.next !== null ? `${Math.ceil(tier.next - rep)} to ${nextName}` : 'Top standing')),
          )
        : h('div', { class: 'small lock-line' }, lock ? `Contact ${lock.replace(/^needs/, 'needs')}${signalLevel(state, content) ? ` (yours reaches level ${signalLevel(state, content)})` : ''}. A caravan or a quest can also make the introduction.` : 'In range: they will pick up your signal any moment.'),
      ...bits,
      actions.length ? h('div', { class: 'row', style: 'justify-content:flex-start;flex-wrap:wrap;margin:6px 0 0' }, ...actions) : null,
    );
  }

  // ---------------------------------------------------------------- trade board

  private tradeTab(): HTMLElement[] {
    const { state } = this.game;
    const out: HTMLElement[] = [];
    if (!hasTradingPost(state)) {
      out.push(h('p', { class: 'muted' }, 'Build a Trading Post topside to open a trade board. Met factions post offers there.'));
      return out;
    }
    const staffed = tradingPostStaffed(state);
    const left = state.trade.refreshAt - state.time;
    out.push(
      h(
        'div',
        { class: `row small refresh-line${staffed ? '' : ' short'}` },
        h('span', {}, staffed ? (left > 0 ? `New offers in ${duration(left)}` : 'New offers any moment') : '⚠ Staff the Trading Post to get fresh offers'),
        h('span', { class: 'muted' }, 'Trading earns a little goodwill'),
      ),
    );
    const offers = tradeOffers(state);
    const met = this.defs().filter((d) => isMet(state, d.id));
    if (!met.length) out.push(h('p', { class: 'muted' }, 'No faction has made contact yet. The Long Road Co. finds any Trading Post; a Signal Mast reaches the rest.'));
    const order = this.focus ? [...met].sort((a, b) => (a.id === this.focus ? -1 : b.id === this.focus ? 1 : 0)) : met;
    for (const def of order) {
      const mine = offers.filter((o) => o.factionId === def.id);
      out.push(
        h(
          'h3',
          { class: 'group trade-group' },
          `${FACTION_ICON[def.id] ?? '◆'} ${def.shortName ?? def.name}`,
          h('span', { class: `tier-pill tier-${TIER_CLASS[repTier(this.game.content, repOf(state, this.game.content, def.id)).index] ?? 'neutral'}` }, repTier(this.game.content, repOf(state, this.game.content, def.id)).name),
        ),
      );
      if (!mine.length) out.push(h('p', { class: 'muted small' }, staffed ? 'Nothing on offer until the next refresh.' : 'Offers appear once the Trading Post is staffed.'));
      for (const o of mine) out.push(this.offerCard(o));
    }
    return out;
  }

  /** Why an offer can't be taken now, or null. Mirrors the checks in factions.ts trade(). */
  private blocked(o: FactionOffer): string | null {
    return tradeBlocked(this.game.state, this.game.content, o.id);
  }


  /** One side of an offer as chips with icons; on the give side, what the homestead lacks is marked. */
  private wares(o: FactionOffer, side: OfferSide, give: boolean): HTMLElement[] {
    const { state, content } = this.game;
    const out: HTMLElement[] = [];
    const chip = (icon: HTMLElement | string, text: string, short = false, cls = '') => h('span', { class: `ware${short ? ' lack' : ''}${cls ? ` ${cls}` : ''}` }, icon, text);
    if (side.scrip) out.push(chip('💰', ` ${fmt(side.scrip)} scrip`, give && side.scrip > state.scrip));
    if (side.influence) out.push(chip('✦', ` ${fmt(side.influence)} Influence`, give && side.influence > state.influence, 'inf'));
    if (side.research) out.push(chip('🔬', ` ${fmt(side.research)} research`, give && side.research > state.research.points));
    for (const k of ['food', 'water', 'medpatch', 'purge'] as const) {
      const n = side[k];
      if (n) out.push(chip(RES_ICON[k] ?? '', ` ${fmt(n)} ${RES_NAME[k] ?? k}${give ? ` (have ${fmt(state.resources[k])})` : ''}`, give && n > state.resources[k]));
    }
    for (const [id, n] of Object.entries(side.salvageById ?? {})) {
      const have = salvageCount(state, id);
      out.push(chip(salvageIcon(id), ` ${n} ${content.salvage[id]?.name ?? id}${give ? ` (have ${have})` : ''}`, give && have < n));
    }
    if (side.salvage) {
      const c = side.salvage.count;
      const n = typeof c === 'number' ? c : c[0] === c[1] ? `${c[0]}` : `${c[0]}–${c[1]}`;
      out.push(chip('🔩', ` ${n} ${side.salvage.rarity} salvage${side.salvage.materials ? ` (${side.salvage.materials.join(', ')})` : ''}`));
    }
    for (const id of side.items ?? []) {
      const d = content.items[id];
      out.push(chip(itemIcon(id, d?.kind ?? 'weapon'), ` ${d?.name ?? id}`, false, `r-${d?.rarity ?? 'common'}`));
    }
    if (side.itemOf) {
      const itemId = offerItemFor(state, content, o);
      const item = itemId !== null ? state.items.find((i) => i.id === itemId) : undefined;
      const d = item ? content.items[item.defId] : undefined;
      out.push(
        d && item
          ? chip(itemIcon(item.defId, d.kind), ` ${d.name} (from storage)`, false, `r-${d.rarity}`)
          : chip('📦', ` a stored ${side.itemOf.rarity} ${side.itemOf.kind ?? 'item'} (none spare)`, true),
      );
    }
    for (const id of side.recipes ?? []) out.push(chip('📜', ` Recipe: ${content.items[id]?.name ?? id}`, false, `r-${content.items[id]?.rarity ?? 'rare'}`));
    for (const [id, n] of Object.entries(side.fragments ?? {})) out.push(chip('📜', ` ${n} blueprint fragment${n === 1 ? '' : 's'}: ${content.items[id]?.name ?? id}`, false, `r-${content.items[id]?.rarity ?? 'rare'}`));
    for (const [tier, n] of Object.entries(side.crates ?? {}) as [CrateTier, number][]) if (n) out.push(chip(h('span', { class: `crate-icon ${tier}` }), `${n > 1 ? `${n} × ` : ''}${CRATE_NAME[tier]}`));
    for (const [fid, n] of Object.entries(side.rep ?? {})) out.push(chip('🤝', ` +${n} standing with ${this.name(fid)}`, false, 'rep'));
    return out;
  }

  private recruitCard(o: FactionOffer): HTMLElement | null {
    const id = o.get.recruit;
    const rec = id ? factionDef(this.game.content, id)?.recruit : undefined;
    if (!id || !rec) return null;
    const stat = rec.primary.charAt(0).toUpperCase() + rec.primary.slice(1);
    const value = rec.rarity === 'legendary' ? 10 : rec.rarity === 'rare' ? 8 : 5;
    return h(
      'div',
      { class: `recruit-card r-${rec.rarity}` },
      h('span', { class: 'recruit-face' }, '👤'),
      h(
        'span',
        {},
        h('b', {}, rec.title),
        h('span', { class: `rarity ${rec.rarity}` }, ` ${rec.rarity === 'legendary' ? '★' : '◆'} ${rec.rarity}`),
        h('div', { class: 'muted small' }, `${stat} ${value} · arrives at the door · ${recruitsHired(this.game.state, id)}/${rec.cap} hired`),
      ),
    );
  }

  private offerCard(o: FactionOffer): HTMLElement {
    const { state, content } = this.game;
    const why = this.blocked(o);
    const need = repTier(content, o.minRep);
    const below = repOf(state, content, o.factionId) < o.minRep;
    const recruit = this.recruitCard(o);
    return h(
      'div',
      { class: `list-item offer${below ? ' locked' : ''}${o.stock <= 0 ? ' sold' : ''}` },
      h('div', { class: 'row', style: 'margin:0' }, h('b', {}, o.label), h('span', { class: 'muted small' }, o.stock > 0 ? `${o.stock} left` : 'Sold out')),
      h('div', { class: 'offer-sides' }, h('div', { class: 'side give' }, h('span', { class: 'side-label' }, 'You give'), ...this.wares(o, o.give, true)), h('div', { class: 'side get' }, h('span', { class: 'side-label' }, 'You get'), recruit ?? null, ...(recruit ? [] : this.wares(o, o.get, false)))),
      h(
        'div',
        { class: 'row', style: 'margin:4px 0 0' },
        h('span', { class: `small ${below ? 'short' : 'muted'}` }, below ? `🔒 Needs ${need.name} standing` : why ? `Can't trade: ${why}` : o.tier > 0 ? `✓ ${need.name}+ standing` : ''),
        h(
          'button',
          {
            class: `close${why ? '' : ' primary'}`,
            disabled: !!why,
            title: why ?? '',
            onclick: () => {
              const res = this.game.run({ type: 'trade', offerId: o.id });
              if (!res.ok) this.host.toast(res.reason, 'bad');
              this.host.refreshPanel();
            },
          },
          'Trade',
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- caravans

  private caravansTab(): HTMLElement[] {
    const { state } = this.game;
    const out: HTMLElement[] = [];
    const slots = caravanSlots(state);
    const caravans = state.caravans ?? [];
    if (!hasTradingPost(state)) {
      out.push(h('p', { class: 'muted' }, 'Caravans leave from a Trading Post. Build one topside first.'));
      return out;
    }
    const canSend = caravans.length < slots && this.defs().some((d) => isMet(state, d.id) && !caravans.some((c) => c.factionId === d.id));
    out.push(
      h(
        'div',
        { class: 'row' },
        h('b', {}, `Caravans ${caravans.length}/${slots}`),
        h('button', { class: 'primary close', disabled: !canSend, onclick: () => this.openCaravan(null) }, '🛒 Send caravan'),
      ),
    );
    if (!caravans.length) {
      out.push(h('p', { class: 'muted' }, `Load 1 to 3 residents with goods and send them down a faction's road. Charm and Fortune raise the takings; Brawn and Grit see off ambushes. Each Trading Post level adds a caravan slot.`));
    }
    for (const c of caravans) out.push(this.caravanCard(c));
    return out;
  }

  private caravanCard(c: Caravan): HTMLElement {
    const { state, content } = this.game;
    const def = factionDef(content, c.factionId);
    const people = c.residentIds.map((id) => state.residents.find((r) => r.id === id)).filter((r): r is Resident => !!r);
    const left = c.status === 'travelling' ? c.remaining + c.total : c.remaining;
    const whole = c.total * 2;
    const p = c.status === 'returned' ? 1 : Math.max(0, Math.min(1, 1 - left / Math.max(1, whole)));
    const status =
      c.status === 'travelling'
        ? `On the road to ${def?.shortName ?? c.factionId} · arrives in ${duration(c.remaining)}`
        : c.status === 'returning'
          ? `${c.result ? 'Heading home' : 'Turned back'} · home in ${duration(c.remaining)}`
          : 'Home: ready to unpack';
    const goods = this.goodsText(c.goods);
    return h(
      'div',
      { class: `list-item caravan-card ${c.status}` },
      h('div', { class: 'row', style: 'margin:0' }, h('b', {}, `${FACTION_ICON[c.factionId] ?? '🛒'} ${def?.route.name ?? 'Caravan'}`), h('span', { class: `status-pill ${c.status === 'returned' ? 'returned' : c.status === 'returning' ? 'returning' : ''}` }, c.status === 'returned' ? 'Home' : c.status === 'returning' ? 'Returning' : 'Travelling')),
      h('div', { class: 'muted small' }, status),
      h('div', { class: 'progress' }, h('div', { style: `width:${Math.round(p * 100)}%` })),
      h('div', { class: 'muted small', style: 'margin-top:4px' }, `${people.map((r) => r.firstName).join(', ')} · carrying ${goods || 'nothing'}`),
      h(
        'div',
        { class: 'row', style: 'justify-content:flex-end;margin:6px 0 0;gap:6px' },
        c.status === 'travelling'
          ? h(
              'button',
              {
                class: 'close',
                onclick: () => {
                  const res = this.game.run({ type: 'recallCaravan', caravanId: c.id });
                  if (!res.ok) this.host.toast(res.reason, 'bad');
                  else this.host.toast(`🛒 The caravan turns back. It will be home in ${duration(c.remaining)} with the goods.`);
                  this.host.refreshPanel();
                },
              },
              'Recall',
            )
          : null,
        c.status === 'returned' ? h('button', { class: 'close primary', onclick: () => this.collect(c) }, 'Collect') : null,
      ),
    );
  }

  private goodsText(g: { salvage: Record<string, number>; food: number; water: number; medpatch: number }): string {
    const { content } = this.game;
    const bits = Object.entries(g.salvage ?? {})
      .filter(([, n]) => n > 0)
      .map(([id, n]) => `${n} ${content.salvage[id]?.name ?? id}`);
    if (g.food) bits.push(`${g.food} food`);
    if (g.water) bits.push(`${g.water} water`);
    if (g.medpatch) bits.push(`${g.medpatch} Med-Patch${g.medpatch === 1 ? '' : 'es'}`);
    return bits.join(', ');
  }

  private collect(c: Caravan): void {
    const { content } = this.game;
    const result = c.result as CaravanResult | null;
    const def = factionDef(content, c.factionId);
    const goods = this.goodsText(c.goods);
    const res = this.game.run({ type: 'collectCaravan', caravanId: c.id });
    if (!res.ok) {
      this.host.toast(res.reason, 'bad');
      return;
    }
    this.host.refreshPanel();
    this.showResult(def, result, goods);
  }

  private showResult(def: FactionDef | undefined, r: CaravanResult | null, goods: string): void {
    const { content } = this.game;
    const close = () => this.host.modalHost.replaceChildren();
    const lines: HTMLElement[] = [];
    if (r) {
      lines.push(
        h(
          'div',
          { class: 'loot-line caravan-loot' },
          h('span', { class: 'loot-chip' }, `💰 ${fmt(r.scrip)} scrip`),
          h('span', { class: 'loot-chip' }, `✦ ${r.influence} Influence`),
          h('span', { class: `loot-chip${r.rep > 0 ? ' good' : ''}` }, `🤝 +${r.rep} ${def?.shortName ?? ''}`),
          ...r.items.map((id) => {
            const d = content.items[id];
            return h('span', { class: `loot-chip r-${d?.rarity ?? 'common'}` }, itemIcon(id, d?.kind ?? 'weapon'), ` ${d?.name ?? id}`);
          }),
          r.ambush ? h('span', { class: `loot-chip ${r.ambush === 'robbed' ? 'bad' : 'good'}` }, r.ambush === 'robbed' ? '⚔ Robbed on the road' : '⚔ Ambush fought off') : null,
          r.intro ? h('span', { class: 'loot-chip good' }, `📡 Introduced to ${this.name(r.intro)}`) : null,
        ),
      );
      if (r.hurt) lines.push(h('div', { class: 'muted small' }, `Everyone lost ${r.hurt} HP on the road.${r.xp ? ` Each earned ${r.xp} XP.` : ''}`));
      else if (r.xp) lines.push(h('div', { class: 'muted small' }, `Each earned ${r.xp} XP.`));
      lines.push(h('div', { class: 'caravan-log' }, ...r.log.map((t) => h('p', {}, t))));
    } else {
      lines.push(h('p', { class: 'muted' }, `The caravan turned back before reaching ${def?.shortName ?? 'the market'}. The goods are back in storage${goods ? `: ${goods}` : ''}.`));
    }
    this.host.modalHost.replaceChildren(
      h(
        'div',
        { class: 'modal-backdrop', onclick: (e: Event) => e.target === e.currentTarget && close() },
        h('div', { class: 'modal caravan-result' }, h('h2', {}, r ? `Back from ${def?.route.name ?? 'the road'}` : 'Caravan unpacked'), ...lines, h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:12px' }, h('button', { class: 'primary', onclick: close }, 'Unpack'))),
      ),
    );
  }

  // ---------------------------------------------------------------- send modal

  /** Who can go with a caravan, best traders first. */
  private candidates(): Resident[] {
    const { state, content } = this.game;
    const score = (r: Resident) => {
      const s = effectiveStats(content, r);
      return s.charm * 2 + s.fortune + s.brawn + s.grit;
    };
    return state.residents.filter((r) => canCaravan(state, r) === null).sort((a, b) => score(b) - score(a) || a.id - b.id);
  }

  openCaravan(factionId: string | null): void {
    const { state } = this.game;
    const open = this.defs().filter((d) => isMet(state, d.id) && !(state.caravans ?? []).some((c) => c.factionId === d.id));
    const pick = factionId ?? open[0]?.id ?? null;
    const best = this.candidates().slice(0, 2).map((r) => r.id);
    this.draft = { factionId: pick, ids: best, salvage: {}, food: 0, water: 0, medpatch: 0 };
    if (pick) this.fillWanted();
    this.renderModal();
  }

  private goods(): { salvage: Record<string, number>; food: number; water: number; medpatch: number } {
    const d = this.draft as CaravanDraft;
    const salvage: Record<string, number> = {};
    for (const [id, n] of Object.entries(d.salvage)) if (n > 0) salvage[id] = n;
    return { salvage, food: d.food, water: d.water, medpatch: d.medpatch };
  }

  private limit(): number {
    const d = this.draft as CaravanDraft;
    return caravanCarryLimit(this.game.content, Math.max(1, d.ids.length));
  }

  /** Load the cart with what the chosen faction wants most, up to the carry limit. */
  private fillWanted(): void {
    const d = this.draft;
    if (!d?.factionId) return;
    const { state, content } = this.game;
    const def = factionDef(content, d.factionId);
    if (!def) return;
    d.salvage = {};
    d.food = d.water = d.medpatch = 0;
    let room = this.limit();
    const ranked = Object.entries(state.salvage)
      .filter(([id, n]) => n > 0 && content.salvage[id])
      .map(([id, n]) => {
        const s = content.salvage[id]!;
        const want = def.route.wants.includes(s.material) ? def.route.wantMult : 1;
        return { id, n, value: s.value * want, wanted: want > 1 };
      })
      .filter((x) => x.wanted)
      .sort((a, b) => b.value - a.value);
    for (const x of ranked) {
      if (room <= 0) break;
      const take = Math.min(x.n, room);
      d.salvage[x.id] = take;
      room -= take;
    }
    const unit = factionsContent(content).tuning.caravan.resourceUnit;
    for (const k of ['food', 'water'] as const) {
      if (room <= 0 || !def.route.wants.includes(k)) continue;
      // Leave at least half the stock at home.
      const loads = Math.min(room, Math.floor(state.resources[k] / 2 / unit));
      d[k] = loads * unit;
      room -= loads;
    }
    if (room > 0 && def.route.wants.includes('medpatch')) {
      d.medpatch = Math.min(room, Math.floor(state.resources.medpatch / 2));
    }
  }

  private closeModal(): void {
    this.draft = null;
    this.host.modalHost.replaceChildren();
  }

  private renderModal(): void {
    const d = this.draft;
    if (!d) return;
    const { state, content } = this.game;
    const again = () => this.renderModal();
    const tuning = factionsContent(content).tuning.caravan;
    const unit = tuning.resourceUnit;
    const goods = this.goods();
    const units = goodsUnits(content, goods);
    const limit = this.limit();
    const room = limit - units;

    const routes = this.defs()
      .filter((def) => isMet(state, def.id))
      .map((def) => {
        const busy = (state.caravans ?? []).some((c) => c.factionId === def.id);
        const tier = repTier(content, repOf(state, content, def.id));
        const low = tier.index < def.route.minTier;
        const locked = busy || low;
        return h(
          'div',
          {
            class: `list-item route-pick${d.factionId === def.id ? ' selected' : ''}${locked ? ' locked' : ''}`,
            onclick: () => {
              if (locked) return;
              d.factionId = def.id;
              this.fillWanted();
              again();
            },
          },
          h('div', { class: 'row', style: 'margin:0' }, h('b', {}, `${FACTION_ICON[def.id] ?? '◆'} ${def.route.name}`), h('span', { class: 'muted small' }, `${duration(def.route.minutes * 60)} round trip`)),
          h('div', { class: 'muted small' }, `${def.shortName ?? def.name} · ${tier.name} · wants ${def.route.wants.join(', ')}${busy ? ' · a caravan is already on this road' : low ? ` · won't deal below ${factionsContent(content).tuning.repTierNames[def.route.minTier]}` : ''}`),
        );
      });

    const toggle = (id: number) => {
      const i = d.ids.indexOf(id);
      if (i >= 0) d.ids.splice(i, 1);
      else if (d.ids.length < tuning.maxParty) d.ids.push(id);
      again();
    };
    const people = this.candidates().map((r) => {
      const sel = d.ids.includes(r.id);
      const s = effectiveStats(content, r);
      return h(
        'div',
        { class: `list-item pick-row${sel ? ' selected' : ''}`, onclick: () => toggle(r.id) },
        h('div', { class: 'row', style: 'margin:0' }, h('b', {}, h('span', { class: 'pick-box' }, sel ? '✓' : ''), ` ${r.firstName} ${r.lastName}`), h('span', { class: 'muted small' }, `L${r.level}`)),
        h('div', { class: 'caravan-stats' }, ...(Object.keys(STAT_SHORT) as (keyof typeof STAT_SHORT)[]).map((k) => h('span', { class: k === 'charm' || k === 'fortune' ? 'trade' : 'guard' }, `${STAT_SHORT[k]} ${s[k]}`))),
      );
    });

    const stepper = (label: string | HTMLElement, value: number, max: number, step: number, set: (n: number) => void, note: string) =>
      h(
        'div',
        { class: 'row stepper-row' },
        h('span', { class: 'goods-label' }, label, h('span', { class: 'muted small' }, note)),
        h(
          'span',
          { class: 'stepper' },
          h('button', { disabled: value <= 0, onclick: () => (set(Math.max(0, value - step)), again()), 'aria-label': 'less' }, '−'),
          h('b', {}, `${value}`),
          h('button', { disabled: value + step > max, onclick: () => (set(Math.min(max, value + step)), again()), 'aria-label': 'more' }, '+'),
        ),
      );
    const def = d.factionId ? factionDef(content, d.factionId) : undefined;
    const wants = new Set(def?.route.wants ?? []);
    const salvageRows = Object.entries(state.salvage)
      .filter(([id, n]) => n > 0 && content.salvage[id])
      .sort(([a], [b]) => {
        const sa = content.salvage[a]!;
        const sb = content.salvage[b]!;
        return Number(wants.has(sb.material)) - Number(wants.has(sa.material)) || sb.value - sa.value;
      })
      .map(([id, have]) => {
        const s = content.salvage[id]!;
        const cur = d.salvage[id] ?? 0;
        return stepper(
          h('span', {}, salvageIcon(id), ` ${s.name}`),
          cur,
          Math.min(have, cur + room),
          1,
          (n) => (d.salvage[id] = n),
          ` · ${have} · ${s.value} ea${wants.has(s.material) ? ' · wanted' : ''}`,
        );
      });
    const foodMax = Math.min(Math.floor(state.resources.food / unit) * unit, d.food + room * unit);
    const waterMax = Math.min(Math.floor(state.resources.water / unit) * unit, d.water + room * unit);
    const medMax = Math.min(Math.floor(state.resources.medpatch), d.medpatch + room);

    const est = d.factionId ? caravanEstimate(state, content, d.factionId, d.ids, goods) : 'pick a road';
    const estBox =
      typeof est === 'string'
        ? h('div', { class: 'row short' }, `Can't send: ${est}`)
        : this.estimateBox(est);

    const send = () => {
      if (!d.factionId) return;
      const res = this.game.run({ type: 'sendCaravan', factionId: d.factionId, residentIds: d.ids, goods });
      if (!res.ok) {
        this.host.toast(res.reason, 'bad');
        return;
      }
      const who = d.ids.map((id) => state.residents.find((r) => r.id === id)?.firstName).filter(Boolean);
      this.host.toast(`🛒 ${who.join(', ')} set${who.length === 1 ? 's' : ''} off down ${def?.route.name ?? 'the road'}.`, 'good');
      this.closeModal();
      this.host.openFactions('caravans');
    };

    const modal = h(
      'div',
      { class: 'modal-backdrop', onclick: (e: Event) => e.target === e.currentTarget && this.closeModal() },
      h(
        'div',
        { class: 'modal explore-modal caravan-modal' },
        h('h2', {}, 'Send a caravan'),
        h('h3', { class: 'group' }, 'Road'),
        ...(routes.length ? routes : [h('p', { class: 'muted' }, 'No faction to trade with yet.')]),
        h('h3', { class: 'group' }, `Party ${d.ids.length}/${tuning.maxParty}`, h('span', { class: 'muted small' }, ' · CHR and FOR sell, BRN and GRT guard')),
        h('div', { class: 'pick-list caravan-people' }, ...(people.length ? people : [h('p', { class: 'muted' }, 'Nobody is free to go.')])),
        h(
          'h3',
          { class: 'group' },
          'Goods',
          h('span', { class: `muted small${units > limit ? ' short' : ''}` }, ` · ${units}/${limit} loads`),
          h('button', { class: 'close fill-btn', disabled: !d.factionId, onclick: () => (this.fillWanted(), again()) }, 'Fill with wanted'),
        ),
        h('div', { class: 'progress carry-bar' }, h('div', { style: `width:${Math.min(100, (units / Math.max(1, limit)) * 100)}%` })),
        stepper('🥫 Food', d.food, foodMax, unit, (n) => (d.food = n), ` · ${Math.floor(state.resources.food)} · ${unit} a load`),
        stepper('💧 Water', d.water, waterMax, unit, (n) => (d.water = n), ` · ${Math.floor(state.resources.water)} · ${unit} a load`),
        stepper('✚ Med-Patches', d.medpatch, medMax, 1, (n) => (d.medpatch = n), ` · ${Math.floor(state.resources.medpatch)}`),
        h('div', { class: 'pick-list salvage-pick' }, ...(salvageRows.length ? salvageRows : [h('p', { class: 'muted small' }, 'No salvage in storage.')])),
        h('div', { class: 'modal-foot' }, estBox, h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:8px;gap:8px' }, h('button', { onclick: () => this.closeModal() }, 'Cancel'), h('button', { class: 'primary', disabled: typeof est === 'string', onclick: send }, 'Send caravan'))),
      ),
    );
    const old = this.host.modalHost.firstElementChild;
    if (old && old.querySelector('.caravan-modal')) morph(old, modal);
    else this.host.modalHost.replaceChildren(modal);
  }

  private estimateBox(e: CaravanEstimate): HTMLElement {
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    return h(
      'div',
      { class: 'estimate' },
      h('div', { class: 'row', style: 'margin:0' }, h('b', {}, 'Likely haul'), h('span', { class: 'muted small' }, `back in ${duration(e.seconds)}`)),
      h(
        'div',
        { class: 'loot-line' },
        h('span', { class: 'loot-chip' }, `💰 ~${fmt(e.scrip)} scrip`),
        h('span', { class: 'loot-chip' }, `✦ ${e.influence[0]}–${e.influence[1]} Influence`),
        h('span', { class: 'loot-chip good' }, `🤝 +${e.rep} rep`),
        h('span', { class: 'loot-chip' }, `🎁 ${pct(e.itemChance)} item`),
      ),
      h('div', { class: `small ${e.ambushChance * (1 - e.defense) > 0.12 ? 'short' : 'muted'}` }, `⚔ Ambush ${pct(e.ambushChance)} · fought off ${pct(e.defense)} of the time`),
    );
  }

  /** Every frame: keep the caravan modal's numbers live (stock changes, residents leaving). */
  update(): void {
    if (this.draft && !this.host.modalHost.querySelector('.caravan-modal')) this.draft = null;
  }

  // ---------------------------------------------------------------- toasts

  onEvents(events: GameEvent[]): void {
    const { state, content } = this.game;
    for (const ev of events) {
      switch (ev.type) {
        case 'factionMet': {
          const d = factionDef(content, ev.factionId);
          this.host.toast(`📡 Contact: ${d?.name ?? ev.factionId}.${d?.motto ? ` “${d.motto}”` : ''}`, 'gold');
          break;
        }
        case 'repChanged': {
          const now = repTier(content, ev.rep);
          const before = repTier(content, ev.rep - ev.delta);
          if (now.index === before.index) break;
          const up = now.index > before.index;
          this.host.toast(`🤝 ${this.name(ev.factionId, false)} ${up ? 'now count you as' : 'have cooled to'} ${now.name}.`, up ? 'good' : 'bad');
          break;
        }
        case 'traded': {
          const o = tradeOffers(state).find((x) => x.id === ev.offerId);
          this.host.toast(`🤝 Traded with ${this.name(ev.factionId)}${o ? `: ${o.label}` : ''}.`, 'good', { fold: 'traded' });
          break;
        }
        case 'caravanReturned': {
          const c = (state.caravans ?? []).find((x) => x.id === ev.caravanId);
          const def = c ? factionDef(content, c.factionId) : undefined;
          this.host.toast(`🛒 The caravan from ${def?.route.name ?? 'the road'} is home. Unpack it in Factions → Caravans.`, 'gold');
          break;
        }
      }
    }
  }
}
