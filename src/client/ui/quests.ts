// Quests outside the quest screen: the quests panel (story, contracts and
// active quests), the party picker, the Command Office's room section, the
// HUD chip and the quest toasts. Hooked into ui.ts with a few small calls.

import {
  abilityFor,
  canQuest,
  effectiveMaxHp,
  officeSlots,
  questContent,
  questDef,
  questLocked,
  type AbilityDef,
  type ContractOffer,
  type GameEvent,
  type Quest,
  type QuestDef,
  type Resident,
  type StatKey,
} from '../../sim';
import type { QuestView } from '../render/questView';
import type { VaultView } from '../render/vaultView';
import { duration, fmt, h, morph } from './dom';
import { type QuestHost, QuestScreen } from './questScreen';
import { bountyView, rewardChips } from './questText';

export interface QuestUIHost extends QuestHost {
  modalHost: HTMLElement;
  /** Re-render the open side panel. */
  refreshPanel(): void;
  /** Open the build panel (no office yet). */
  openBuild(): void;
}

type Target = { questId: string } | { contractId: number };

interface PartyDraft {
  target: Target;
  ids: number[];
  medpatch: number;
}

/** Party roles by the stat that picks the ability (GDD §9: Tank, Damage, Support). */
const ROLE: Record<StatKey, 'Tank' | 'Damage' | 'Support'> = {
  brawn: 'Damage',
  sight: 'Damage',
  knack: 'Damage',
  grit: 'Tank',
  charm: 'Support',
  wits: 'Support',
  fortune: 'Support',
};

const STATUS: Record<Quest['status'], string> = {
  travelling: 'On the road',
  onsite: 'On site',
  returning: 'Heading home',
  returned: 'Home',
};

export class QuestUI {
  readonly screen: QuestScreen;
  private draft: PartyDraft | null = null;
  /** Quest id -> title, so toasts can name a quest after it is collected. */
  private titles = new Map<number, string>();

  constructor(
    private host: QuestUIHost,
    view: QuestView,
    vault: VaultView,
    uiRoot: HTMLElement,
  ) {
    this.screen = new QuestScreen(host, view, vault, uiRoot);
    uiRoot.append(this.screen.el);
  }

  private get game() {
    return this.host.game;
  }

  hasOffice(): boolean {
    return this.game.state.rooms.some((r) => r.type === 'office');
  }

  /** Quests needing the player: home to collect, or on site. */
  attention(): number {
    return this.game.state.quests.filter((q) => q.status === 'returned' || q.status === 'onsite').length;
  }

  update(): void {
    this.screen.update();
  }

  open(questId: number): void {
    this.host.modalHost.replaceChildren();
    this.screen.open(questId);
  }

  // ---------------------------------------------------------------- HUD

  hudChip(): HTMLElement | null {
    const { state } = this.game;
    if (!this.hasOffice() && !state.quests.length) return null;
    const need = this.attention();
    return h(
      'button',
      { class: `stat-chip chip-button quest-chip${need ? ' glow' : ''}`, title: 'Quests', onclick: () => this.host.openQuests() },
      '⚔ ',
      h('b', {}, `${state.quests.length}/${officeSlots(state, this.game.content)}`),
    );
  }

  // ---------------------------------------------------------------- office room

  officeSection(): HTMLElement[] {
    const { state, content } = this.game;
    const slots = officeSlots(state, content);
    const used = state.quests.length;
    return [
      h('div', { class: 'row' }, h('span', {}, 'Quest slots'), h('b', {}, `${used}/${slots}`)),
      h('div', { class: 'slot-pips' }, ...Array.from({ length: 3 }, (_, i) => h('span', { class: i < used ? 'used' : i < slots ? 'free' : 'locked' }))),
      ...state.quests.map((q) => h('div', { class: 'row muted small' }, h('span', {}, q.title), h('span', {}, this.statusLine(q)))),
      h('p', { class: 'muted small' }, slots < 3 ? 'Upgrade the office to run more quests at once.' : 'Three parties at once: the full Bureau.'),
      h('div', { class: 'row', style: 'justify-content:flex-start' }, h('button', { class: 'primary', onclick: () => this.host.openQuests() }, '⚔ Quests')),
    ];
  }

  // ---------------------------------------------------------------- panel

  panel(): HTMLElement {
    const { state, content } = this.game;
    if (!this.hasOffice()) {
      const def = content.rooms.office;
      const pop = def?.unlockPop ?? 18;
      return h(
        'div',
        { class: 'body' },
        h('p', {}, 'HALCY: "Parties, contracts and the Silent Neighbour all run through a Command Office, Warden. Build one and I will fetch the maps."'),
        h('p', { class: 'muted' }, `Build a Command Office (unlocks at population ${pop}). It sends parties of up to three on story quests and bounty contracts.`),
        h('button', { class: 'primary', disabled: !state.unlockedRooms.includes('office'), onclick: () => this.host.openBuild() }, state.unlockedRooms.includes('office') ? 'Build a Command Office' : `🔒 Population ${pop}`),
      );
    }
    const slots = officeSlots(state, content);
    const free = state.quests.length < slots;
    const active = [...state.quests].sort((a, b) => order(a) - order(b) || a.id - b.id);
    return h(
      'div',
      { class: 'body' },
      h('div', { class: 'row' }, h('b', {}, `Quest slots ${state.quests.length}/${slots}`), h('span', { class: 'muted small' }, free ? 'A party can set out' : 'All slots busy')),
      ...(active.length ? active.map((q) => this.activeCard(q)) : [h('p', { class: 'muted' }, 'No parties out. Pick a story quest or a contract below.')]),
      ...this.storySection(free),
      ...this.contractSection(free),
    );
  }

  private statusLine(q: Quest): string {
    switch (q.status) {
      case 'travelling':
        return `arrives in ${duration(q.travelRemaining)}`;
      case 'returning':
        return `home in ${duration(q.travelRemaining)}`;
      case 'returned':
        return 'ready to collect';
      case 'onsite':
        if (q.pendingEvent) return 'needs a decision';
        return q.enemies.some((e) => e.hp > 0) ? 'fighting!' : 'waiting for orders';
    }
  }

  private activeCard(q: Quest): HTMLElement {
    const { state } = this.game;
    const party = q.party.map((m) => state.residents.find((r) => r.id === m.residentId)).filter((r): r is Resident => !!r);
    const p = q.travelTotal > 0 ? 1 - q.travelRemaining / q.travelTotal : 1;
    const travel = q.status === 'travelling' || q.status === 'returning';
    const fight = q.status === 'onsite' && q.enemies.some((e) => e.hp > 0);
    const outcome = q.outcome === 'failed' ? ' · party lost' : q.outcome === 'abandoned' ? ' · retreated' : q.outcome === 'success' ? ' · success!' : '';
    const actions: HTMLElement[] = [];
    if (q.status === 'returned') actions.push(h('button', { class: 'primary', onclick: () => this.cmd({ type: 'collectQuest', questId: q.id }) }, 'Collect'));
    if (q.status === 'onsite') actions.push(h('button', { class: `primary${fight ? ' pulse' : ''}`, onclick: () => this.open(q.id) }, fight ? '⚔ Open: fight!' : 'Open'));
    if (q.status === 'travelling' || q.status === 'returning') actions.push(h('button', { onclick: () => this.open(q.id) }, 'View'));
    if (q.status === 'onsite' || q.status === 'travelling') {
      actions.push(
        h(
          'button',
          {
            class: 'danger',
            onclick: () => {
              if (!confirm(`Abandon ${q.title}? The party keeps what it found but gets no reward.`)) return;
              this.cmd({ type: 'abandonQuest', questId: q.id });
            },
          },
          'Abandon',
        ),
      );
    }
    return h(
      'div',
      { class: `list-item quest-active ${q.status}${fight ? ' fight' : ''}` },
      h('div', { class: 'row', style: 'margin:0' }, h('b', {}, q.title), h('span', { class: `status-pill ${q.status === 'returned' ? 'returned' : q.status === 'returning' ? 'returning' : ''}` }, STATUS[q.status])),
      h('div', { class: 'muted small' }, `${this.statusLine(q)}${outcome} · L${q.level}`),
      travel ? h('div', { class: 'progress' }, h('div', { style: `width:${(p * 100).toFixed(1)}%` })) : null,
      h(
        'div',
        { class: 'party-line' },
        ...party.map((r) => h('span', { class: `loot-chip${r.dead ? ' none' : ''}` }, `${r.dead ? '☠ ' : ''}${r.firstName} ${Math.ceil(Math.max(0, r.hp))}/${Math.ceil(effectiveMaxHp(r))}`)),
      ),
      h('div', { class: 'row', style: 'justify-content:flex-start;flex-wrap:wrap;margin-bottom:0' }, ...actions),
    );
  }

  private levelClass(level: number): string {
    // Compare with the best three adults: comfortable, even or risky.
    const levels = this.game.state.residents.filter((r) => !r.dead && !r.waiting).map((r) => r.level).sort((a, b) => b - a).slice(0, 3);
    const avg = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 1;
    return avg >= level + 2 ? 'ok' : avg >= level ? 'mid' : 'bad';
  }

  private storySection(free: boolean): HTMLElement[] {
    const { state, content } = this.game;
    const qc = questContent(content);
    const out: HTMLElement[] = [];
    for (const line of qc.questlines) {
      const defs = line.quests.map((id) => questDef(content, id)).filter((d): d is QuestDef => !!d);
      const done = defs.filter((d) => state.questsDone.includes(d.id)).length;
      out.push(h('h3', { class: 'group' }, line.name, h('span', { class: 'muted small' }, ` ${done}/${defs.length}`)));
      for (const d of defs) out.push(this.storyCard(d, free));
    }
    // Story quests outside any questline still get listed.
    const inLines = new Set(qc.questlines.flatMap((l) => l.quests));
    const loose = qc.quests.filter((d) => !inLines.has(d.id));
    if (loose.length) {
      out.push(h('h3', { class: 'group' }, 'Other quests'));
      for (const d of loose) out.push(this.storyCard(d, free));
    }
    void state;
    return out;
  }

  private storyCard(d: QuestDef, free: boolean): HTMLElement {
    const { state, content } = this.game;
    const done = state.questsDone.includes(d.id);
    const active = state.quests.some((q) => q.defId === d.id && !q.contract);
    const locked = questLocked(state, content, d);
    if (done) {
      return h('div', { class: 'list-item quest-card done' }, h('div', { class: 'row', style: 'margin:0' }, h('b', {}, `✓ ${d.title}`), h('span', { class: 'muted small' }, 'Done')));
    }
    const available = locked === null;
    return h(
      'div',
      { class: `list-item quest-card${available ? ' available' : ''}${active ? ' active' : ''}${!available && !active ? ' locked' : ''}` },
      h('div', { class: 'row', style: 'margin:0' }, h('b', {}, available || active ? d.title : `🔒 ${d.title}`), h('span', { class: `lvl ${this.levelClass(d.level)}` }, `Rec. L${d.level}`)),
      h('div', { class: 'brief' }, h('span', { class: 'giver' }, `${d.giver}: `), d.brief),
      h('div', { class: 'muted small' }, `Travel ${duration(d.travelMinutes * 60)} each way${d.partyMin && d.partyMin > 1 ? ` · party of ${d.partyMin}+` : ''}`),
      h('div', { class: 'loot-line' }, ...rewardChips(content, d.rewards)),
      active
        ? h('div', { class: 'muted small' }, 'A party is on it.')
        : available
          ? h('div', { class: 'row', style: 'justify-content:flex-end;margin-bottom:0' }, h('button', { class: 'primary', disabled: !free, title: free ? '' : 'No free quest slots', onclick: () => this.showPicker({ questId: d.id }) }, free ? 'Pick a party' : 'No free slot'))
          : h('div', { class: 'small short' }, `Locked: ${locked}`),
    );
  }

  private contractSection(free: boolean): HTMLElement[] {
    const { state, content } = this.game;
    const t = questContent(content).tuning.contracts;
    const out: HTMLElement[] = [];
    const unlocked = state.questsDone.includes(t.unlockedBy);
    const left = Math.max(0, state.contracts.refreshAt - state.time);
    out.push(h('h3', { class: 'group' }, 'Bounty contracts', unlocked ? h('span', { class: 'muted small' }, ` new in ${duration(left)}`) : null));
    if (!unlocked) {
      out.push(h('p', { class: 'muted' }, `Contracts open once "${questDef(content, t.unlockedBy)?.title ?? t.unlockedBy}" is done. Three are posted every day.`));
      return out;
    }
    if (!state.contracts.offers.length) out.push(h('p', { class: 'muted' }, 'All taken. Fresh contracts get posted every day.'));
    for (const offer of state.contracts.offers) out.push(this.contractCard(offer, free));
    return out;
  }

  private contractCard(o: ContractOffer, free: boolean): HTMLElement {
    const { state, content } = this.game;
    return h(
      'div',
      { class: 'list-item quest-card contract' },
      h('div', { class: 'row', style: 'margin:0' }, h('b', {}, o.title), h('span', { class: `lvl ${this.levelClass(o.level)}` }, `L${o.level}`)),
      bountyView(content, state, o.bounty),
      h('div', { class: 'brief' }, o.brief),
      h('div', { class: 'muted small' }, `Travel ${duration(o.travelSeconds)} each way · expires in ${duration(Math.max(0, o.expiresAt - state.time))}`),
      h('div', { class: 'row', style: 'justify-content:flex-end;margin-bottom:0' }, h('button', { class: 'primary', disabled: !free, onclick: () => this.showPicker({ contractId: o.id }) }, free ? 'Take contract' : 'No free slot')),
    );
  }

  private cmd(cmd: Parameters<QuestHost['game']['run']>[0]): void {
    const res = this.game.run(cmd);
    if (!res.ok) this.host.toast(res.reason, 'bad');
    this.host.refreshPanel();
  }

  // ---------------------------------------------------------------- party picker

  showPicker(target: Target): void {
    const { state, content } = this.game;
    const eligible = this.candidates().filter((r) => canQuest(state, r) === null);
    const stock = Math.floor(state.resources.medpatch);
    const max = Math.min(questContent(content).tuning.maxSupplies, stock);
    this.draft = { target, ids: eligible.slice(0, questContent(content).tuning.maxParty).map((r) => r.id), medpatch: Math.min(3, max) };
    this.renderPicker();
  }

  /** Everyone who could be asked, eligible first, then by level. */
  private candidates(): Resident[] {
    const { state } = this.game;
    return state.residents
      .filter((r) => !r.waiting && !r.dead)
      .sort((a, b) => Number(canQuest(state, a) !== null) - Number(canQuest(state, b) !== null) || b.level - a.level || a.id - b.id);
  }

  private closePicker(): void {
    this.draft = null;
    this.host.modalHost.replaceChildren();
  }

  private renderPicker(): void {
    const d = this.draft;
    if (!d) return;
    const { state, content } = this.game;
    const t = questContent(content).tuning;
    const def = 'questId' in d.target ? questDef(content, d.target.questId) : undefined;
    const offer = 'contractId' in d.target ? state.contracts.offers.find((o) => o.id === (d.target as { contractId: number }).contractId) : undefined;
    const title = def?.title ?? offer?.title ?? 'Quest';
    const level = def?.level ?? offer?.level ?? 1;
    const travel = def ? def.travelMinutes * 60 : (offer?.travelSeconds ?? 0);
    const partyMin = def?.partyMin ?? 1;
    const again = () => this.renderPicker();
    const toggle = (id: number) => {
      if (d.ids.includes(id)) d.ids = d.ids.filter((x) => x !== id);
      else if (d.ids.length < t.maxParty) d.ids = [...d.ids, id];
      again();
    };
    const picked = d.ids.map((id) => state.residents.find((r) => r.id === id)).filter((r): r is Resident => !!r);
    const roles = new Set(picked.map((r) => ROLE[abilityFor(content, r).stat]));
    const hasHaymaker = picked.some((r) => abilityFor(content, r).stat === 'brawn');

    const rows = this.candidates().map((r) => {
      const why = canQuest(state, r);
      const sel = d.ids.includes(r.id);
      const a = abilityFor(content, r);
      const w = r.weapon ? content.weapons[r.weapon] : undefined;
      const o = r.outfit ? content.outfits[r.outfit] : undefined;
      const bonus = t.damagePerLevel * r.level;
      const [lo, hi] = w ? [w.min, w.max] : t.fists;
      return h(
        'div',
        {
          class: `list-item pick-row${sel ? ' selected' : ''}${why ? ' locked' : ''}`,
          onclick: () => {
            if (why) return;
            toggle(r.id);
          },
        },
        h(
          'div',
          { class: 'row', style: 'margin:0' },
          h('b', {}, h('span', { class: 'pick-box' }, sel ? '✓' : ''), r.rarity !== 'common' ? h('span', { class: `rarity ${r.rarity}` }, r.rarity === 'legendary' ? ' ★' : ' ◆') : null, ` ${r.firstName} ${r.lastName}`),
          h('span', { class: 'muted small nowrap' }, `L${r.level} · HP ${Math.ceil(r.hp)}/${Math.ceil(effectiveMaxHp(r))}`),
        ),
        h('div', { class: 'muted small' }, `${w ? w.name : 'Fists'} ${fmt1(lo + bonus)}–${fmt1(hi + bonus)} dmg · ${o ? o.name : 'Halcyon jumpsuit'}`),
        abilityLine(a),
        why ? h('div', { class: 'small short' }, `Can't go: ${why}`) : null,
      );
    });

    const stock = Math.floor(state.resources.medpatch);
    const maxMed = Math.min(t.maxSupplies, stock);
    const setMed = (n: number) => {
      d.medpatch = Math.max(0, Math.min(maxMed, n));
      again();
    };
    const slotsFree = state.quests.length < officeSlots(state, content);
    const problem = !slotsFree ? 'No free quest slots' : d.ids.length < partyMin ? `Pick at least ${partyMin}` : null;

    const start = () => {
      const cmd =
        'questId' in d.target
          ? ({ type: 'startQuest', questId: d.target.questId, residentIds: d.ids, medpatch: d.medpatch } as const)
          : ({ type: 'startContract', contractId: d.target.contractId, residentIds: d.ids, medpatch: d.medpatch } as const);
      const res = this.game.run(cmd);
      if (!res.ok) {
        this.host.toast(res.reason, 'bad');
        return;
      }
      this.closePicker();
      this.host.openQuests();
    };

    const modal = h(
      'div',
      { class: 'modal-backdrop', onclick: (e: Event) => e.target === e.currentTarget && this.closePicker() },
      h(
        'div',
        { class: 'modal explore-modal party-modal' },
        h('h2', {}, 'Pick a party'),
        h('div', { class: 'row muted small', style: 'margin-top:0' }, h('span', {}, title), h('span', { class: `lvl ${this.levelClass(level)}` }, `Rec. L${level} · ${duration(travel)} away`)),
        h(
          'div',
          { class: 'party-slots' },
          ...Array.from({ length: t.maxParty }, (_, i) => {
            const r = picked[i];
            if (!r) return h('div', { class: 'party-slot empty' }, 'empty');
            const a = abilityFor(content, r);
            return h(
              'button',
              { class: 'party-slot', title: 'Tap to remove', onclick: () => toggle(r.id) },
              h('b', {}, r.firstName),
              h('span', { class: `role ${ROLE[a.stat].toLowerCase()}` }, ROLE[a.stat]),
              h('span', { class: 'muted small' }, a.name),
            );
          }),
        ),
        h(
          'div',
          { class: 'roles muted small' },
          ...(['Tank', 'Damage', 'Support'] as const).map((role) => h('span', { class: roles.has(role) ? 'have' : 'miss' }, `${roles.has(role) ? '✓' : '·'} ${role}`)),
          h('span', {}, hasHaymaker ? ' · Haymaker can interrupt wind-ups' : ' · Tip: a Brawn resident brings Haymaker, which interrupts wind-ups'),
        ),
        h('div', { class: 'pick-list' }, ...rows),
        h(
          'div',
          { class: 'row stepper-row' },
          h('span', {}, '✚ Med-Patches', h('span', { class: 'muted small' }, ` · ${stock} in stock`)),
          h(
            'span',
            { class: 'stepper' },
            h('button', { disabled: d.medpatch <= 0, onclick: () => setMed(d.medpatch - 1), 'aria-label': 'fewer Med-Patches' }, '−'),
            h('b', {}, `${d.medpatch}`),
            h('button', { disabled: d.medpatch >= maxMed, onclick: () => setMed(d.medpatch + 1), 'aria-label': 'more Med-Patches' }, '+'),
          ),
        ),
        h('p', { class: 'muted small', style: 'margin:0' }, `Up to ${t.maxSupplies}. Anyone standing can be patched up on site. Unused patches come home.`),
        problem ? h('div', { class: 'row short' }, problem) : null,
        h(
          'div',
          { class: 'row', style: 'justify-content:flex-end;margin-top:10px;gap:8px' },
          h('button', { onclick: () => this.closePicker() }, 'Cancel'),
          h('button', { class: 'primary', disabled: !!problem, onclick: start }, `Set out (${d.ids.length})`),
        ),
      ),
    );
    const old = this.host.modalHost.firstElementChild;
    if (old && old.querySelector('.party-modal')) morph(old, modal);
    else this.host.modalHost.replaceChildren(modal);
  }

  // ---------------------------------------------------------------- events

  onEvents(events: GameEvent[]): void {
    const { state } = this.game;
    for (const q of state.quests) this.titles.set(q.id, q.title);
    const title = (id: number) => this.titles.get(id) ?? 'the quest';
    const watching = (id: number) => this.screen.questId === id;
    for (const ev of events) {
      switch (ev.type) {
        case 'questStarted': {
          const q = state.quests.find((x) => x.id === ev.questId);
          if (q) this.titles.set(q.id, q.title);
          this.host.toast(`⚔ A party sets out for ${title(ev.questId)}.`, 'good');
          break;
        }
        case 'questArrived':
          if (!watching(ev.questId)) this.host.toast(`🚩 Party arrived at ${title(ev.questId)}. Open Quests to lead them.`, 'gold');
          break;
        case 'questCombat':
          if (!watching(ev.questId)) this.host.toast(`⚔ The party at ${title(ev.questId)} is fighting! Open the quest to help.`, 'bad');
          break;
        case 'questEventPrompt':
          if (!watching(ev.questId)) this.host.toast(`❓ Something at ${title(ev.questId)} needs a decision.`);
          break;
        case 'questMemberDown':
          if (!watching(ev.questId)) this.host.toast(`${state.residents.find((r) => r.id === ev.residentId)?.firstName ?? 'Someone'} is down at ${title(ev.questId)}!`, 'bad');
          break;
        case 'questFinished':
          // The quest screen shows its own banner.
          if (watching(ev.questId)) break;
          if (ev.outcome === 'success') this.host.toast(`🏆 ${title(ev.questId)} complete! The party is heading home.`, 'gold');
          else if (ev.outcome === 'failed') this.host.toast(`☠ The party fell at ${title(ev.questId)}.`, 'bad');
          else this.host.toast(`The party is retreating from ${title(ev.questId)}.`);
          break;
        case 'questReturned':
          this.host.toast(`🏠 Party is home from ${title(ev.questId)}: collect rewards in Quests.`, 'gold');
          break;
        case 'questCollected':
          this.host.toast(ev.outcome === 'success' ? `Rewards from ${title(ev.questId)} unpacked.` : `The party from ${title(ev.questId)} is back inside.`, 'good');
          break;
        case 'contractsRefreshed':
          if (this.hasOffice()) this.host.toast('📋 New bounty contracts are posted at the Command Office.');
          break;
      }
    }
    this.screen.onEvents(events);
  }
}

function order(q: Quest): number {
  return { returned: 0, onsite: 1, travelling: 2, returning: 3 }[q.status];
}

function fmt1(n: number): string {
  return Number.isInteger(n) ? `${n}` : n.toFixed(1);
}

function abilityLine(a: AbilityDef): HTMLElement {
  return h('div', { class: 'ability-line' }, h('span', { class: `role ${ROLE[a.stat].toLowerCase()}` }, ROLE[a.stat]), h('b', {}, a.name), h('span', { class: 'muted small' }, ` ${a.description}`));
}

