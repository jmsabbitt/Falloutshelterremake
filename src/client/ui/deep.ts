// M6 the Deep in the client: the Excavation panel (next stratum, what it
// needs, the dig and its countdown), the Discovery journal, the discovery
// modal, the HUD chip, room-panel notes (refinery output, the dig shaft,
// which stratum a room is on) and the dig toasts. Hooked into ui.ts with a
// few small calls; the sim side is src/sim/systems/deep.ts.

import {
  braced,
  buildCost,
  canExcavate,
  deepContent,
  digCost,
  digRate,
  digSeconds,
  digShaft,
  digTimeLeft,
  discoveryDef,
  isDeepFloor,
  nextStratum,
  refineryBatch,
  refineryPerHour,
  researchNode,
  roomDef,
  stratumDef,
  stratumOf,
  totalFloors,
  workersInRoom,
  type DiscoveryDef,
  type GameEvent,
  type Room,
} from '../../sim';
import type { Game } from '../game';
import type { VaultView } from '../render/vaultView';
import { duration, fmt, h } from './dom';
import type { ToastFn } from './toasts';

export type DeepTab = 'dig' | 'journal';

export interface DeepHost {
  game: Game;
  view: VaultView;
  modalHost: HTMLElement;
  toast: ToastFn;
  openDeep(tab?: DeepTab): void;
  openResearch(): void;
  refreshPanel(): void;
  closePanel(): void;
}

const KIND = { log: { icon: '📜', label: 'Halcyon log' }, relic: { icon: '🗿', label: 'Relic' } } as const;

export class DeepUI {
  tab: DeepTab = 'dig';
  /** Discoveries waiting for their modal (several can land in one catch-up). */
  private queue: string[] = [];
  /** Journal entries not looked at yet (toolbar/HUD badge). */
  private unread = new Set<string>();

  constructor(private host: DeepHost) {}

  private get game(): Game {
    return this.host.game;
  }

  /** Show the Deep once the first survey is done, or anything has been dug. */
  visible(): boolean {
    const { state, content } = this.game;
    return state.deep.strata > 0 || !!state.deep.dig || state.research.done.includes(deepContent(content).tuning.requiresResearch);
  }

  opened(tab?: DeepTab): void {
    if (tab) this.tab = tab;
    if (this.tab === 'journal') this.unread.clear();
  }

  onStateReplaced(): void {
    this.queue = [];
    this.unread.clear();
    this.tab = 'dig';
  }

  /** Called every frame: show the next discovery once no other modal is up. */
  update(): void {
    if (this.queue.length && !this.host.modalHost.firstChild) {
      const id = this.queue.shift() as string;
      this.showDiscovery(id, this.queue.length);
    }
  }

  hudChip(): HTMLElement | null {
    if (!this.visible()) return null;
    const { state, content } = this.game;
    const dig = state.deep.dig;
    if (dig) {
      const p = dig.total > 0 ? 1 - dig.remaining / dig.total : 0;
      return h(
        'button',
        { class: 'stat-chip chip-button deep-chip digging', title: `Digging Stratum ${dig.stratum}: ${Math.floor(p * 100)}%`, onclick: () => this.host.openDeep('dig') },
        '⛏ ',
        h('b', {}, duration(digTimeLeft(state, content))),
        h('span', { class: 'token-mini' }, h('span', { style: `width:${Math.round(p * 100)}%` })),
      );
    }
    const ready = canExcavate(state, content) === null;
    const unread = this.unread.size;
    return h(
      'button',
      {
        class: `stat-chip chip-button deep-chip${ready || unread ? ' glow' : ''}`,
        title: ready ? 'The next stratum can be dug' : unread ? `${unread} new discoveries` : 'The Deep',
        onclick: () => this.host.openDeep(unread && !ready ? 'journal' : 'dig'),
      },
      '⛏ ',
      h('b', {}, ready ? 'Dig' : `S${state.deep.strata}`),
      unread ? h('span', {}, ` 📜${unread}`) : null,
    );
  }

  // ---------------------------------------------------------------- panel

  panel(): HTMLElement {
    const { state, content } = this.game;
    const total = Object.keys(deepContent(content).discoveries).length;
    const tab = (id: DeepTab, label: string) =>
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
      );
    return h(
      'div',
      { class: 'body deep-body' },
      h('div', { class: 'tabs deep-tabs' }, tab('dig', '⛏ Excavation'), tab('journal', `📜 Journal ${state.deep.discoveries.length}/${total}`)),
      ...(this.tab === 'dig' ? this.digTab() : this.journalTab()),
    );
  }

  private digTab(): HTMLElement[] {
    const { state, content } = this.game;
    const dc = deepContent(content);
    const out: HTMLElement[] = [];
    const floors = totalFloors(state, content);
    const base = content.balance.grid.floors;
    out.push(
      h(
        'div',
        { class: 'depth-gauge' },
        ...[0, ...dc.strata.map((s) => s.index)].map((s) =>
          h('span', { class: `depth-step s${s}${s <= state.deep.strata ? ' open' : ''}${state.deep.dig?.stratum === s ? ' digging' : ''}`, title: s === 0 ? `Charter floors 1–${base}` : stratumDef(content, s)?.name ?? '' }, s === 0 ? 'Charter' : `S${s}`),
        ),
      ),
      h('div', { class: 'muted small' }, `${floors} floors open · ${state.deep.strata}/${dc.strata.length} strata excavated`),
    );

    const dig = state.deep.dig;
    const next = nextStratum(state, content);
    if (dig) {
      const st = stratumDef(content, dig.stratum);
      const p = dig.total > 0 ? Math.max(0, Math.min(1, 1 - dig.remaining / dig.total)) : 0;
      const rate = digRate(state, content);
      const shaft = digShaft(state, content);
      out.push(
        h(
          'div',
          { class: 'list-item dig-card digging' },
          h('div', { class: 'row', style: 'margin:0' }, h('b', {}, `⛏ Digging ${st?.name ?? `Stratum ${dig.stratum}`}`), h('b', { class: 'countdown' }, duration(digTimeLeft(state, content)))),
          h('div', { class: 'progress big dig-progress' }, h('div', { style: `width:${(p * 100).toFixed(1)}%` })),
          h('div', { class: 'row muted small' }, h('span', {}, `${Math.floor(p * 100)}% through the rock`), rate > 1 ? h('span', {}, `Dig speed +${Math.round((rate - 1) * 100)}%`) : null),
          h('div', { class: 'muted small' }, 'The crew keeps digging while you are away.'),
          h(
            'div',
            { class: 'row', style: 'justify-content:flex-start;margin-bottom:0' },
            h('button', { class: 'close', onclick: () => this.showFloor(totalFloors(state, content) - 0.4, shaft?.x) }, 'Show dig site'),
          ),
        ),
      );
    } else if (next) {
      const research = next.requiresResearch ?? dc.tuning.requiresResearch;
      const researched = state.research.done.includes(research);
      const bottom = floors - 1;
      const shaft = digShaft(state, content);
      const cost = digCost(content, next.index);
      const secs = digSeconds(content, next.index) / digRate(state, content);
      const why = canExcavate(state, content);
      const req = (ok: boolean, text: string, action?: HTMLElement | null) =>
        h('div', { class: `req-line${ok ? ' ok' : ''}` }, h('span', { class: 'req-mark' }, ok ? '✓' : '✗'), h('span', { class: 'req-text' }, text), action ?? null);
      out.push(
        h(
          'div',
          { class: 'list-item dig-card' },
          h('div', { class: 'row', style: 'margin:0' }, h('b', {}, `Next: ${next.name}`)),
          h('div', { class: 'muted small stratum-desc' }, next.description),
          h('h3', { class: 'group' }, 'To dig'),
          req(researched, `Research ${researchNode(content, research)?.name ?? research}`, researched ? null : h('button', { class: 'close', onclick: () => this.host.openResearch() }, 'Research')),
          req(!!shaft, `An elevator on the bottom floor (${bottom + 1})`, shaft ? null : h('button', { class: 'close', onclick: () => this.showFloor(bottom) }, 'Show')),
          shaft ? null : h('div', { class: 'row req-fix' }, this.extendButton()),
          req(state.scrip >= cost, `${fmt(cost)} scrip (you have ${fmt(state.scrip)})`),
          h('div', { class: 'row' }, h('span', {}, `Takes ${duration(secs)}`), h('span', { class: 'muted small' }, `Opens floors ${floors + 1}–${floors + dc.tuning.floorsPerStratum}`)),
          h(
            'div',
            { class: 'row', style: 'margin-bottom:0' },
            h('span', { class: 'muted small' }, why && why !== 'already digging' ? `Can't dig yet: ${why}` : 'Digging runs online and offline.'),
            h(
              'button',
              {
                class: 'primary',
                disabled: !!why,
                title: why ?? `Excavate ${next.name}`,
                onclick: () => {
                  const res = this.game.run({ type: 'excavate' });
                  if (!res.ok) this.host.toast(res.reason, 'bad');
                  this.host.refreshPanel();
                },
              },
              '⛏ Dig',
            ),
          ),
        ),
      );
    } else {
      out.push(
        h(
          'div',
          { class: 'list-item dig-card sealed' },
          h('b', {}, 'You have reached the Seal.'),
          h('div', { class: 'muted small' }, 'There is nowhere further to dig. The bulkhead is warm, and very patient.'),
        ),
      );
    }

    // Threats and bracing.
    if (state.deep.strata > 0) {
      const b = braced(state, content);
      out.push(
        h(
          'div',
          { class: `list-item deep-threats${b ? ' braced' : ''}` },
          h('div', { class: 'row', style: 'margin:0' }, h('b', {}, '⚠ Deep threats'), h('span', { class: b ? 'ok-text' : 'short' }, b ? '✓ Braced' : 'Unbraced')),
          h('div', { class: 'muted small' }, 'Cave-ins (dig out with Brawn), floods (fix with Knack; they spread sideways) and Deepcrawlers break out on deep floors, and grow tougher with every stratum.'),
          b ? null : h('div', { class: 'muted small' }, `${researchNode(content, dc.tuning.incidents.bracing.research)?.name ?? 'Deep Bracing'} makes them rarer and weaker.`),
        ),
      );
    }

    // Strata already open.
    if (state.deep.strata > 0) out.push(h('h3', { class: 'group' }, 'Strata'));
    for (let s = 1; s <= state.deep.strata; s++) {
      const st = stratumDef(content, s);
      const all = Object.values(dc.discoveries).filter((d) => d.stratum === s);
      const found = all.filter((d) => state.deep.discoveries.includes(d.id)).length;
      const first = base + (s - 1) * dc.tuning.floorsPerStratum;
      const rooms = state.rooms.filter((r) => r.type !== 'elevator' && stratumOf(content, r.floor) === s).length;
      out.push(
        h(
          'div',
          { class: `list-item stratum-card s${s}` },
          h('div', { class: 'row', style: 'margin:0' }, h('b', {}, st?.name ?? `Stratum ${s}`), h('span', { class: 'muted small' }, `📜 ${found}/${all.length}`)),
          h('div', { class: 'muted small stratum-desc' }, st?.description ?? ''),
          h(
            'div',
            { class: 'row', style: 'margin-bottom:0' },
            h('span', { class: 'muted small' }, `Floors ${first + 1}–${first + dc.tuning.floorsPerStratum} · ${rooms} room${rooms === 1 ? '' : 's'}`),
            h('button', { class: 'close', onclick: () => this.showFloor(first) }, 'Go there'),
          ),
        ),
      );
    }
    return out;
  }

  private journalTab(): HTMLElement[] {
    const { state, content } = this.game;
    const dc = deepContent(content);
    const out: HTMLElement[] = [
      h('p', { class: 'muted small', style: 'margin-top:0' }, 'Each breakthrough turns something up, and so does steady work on the deep floors. Halcyon left a great deal down here, and very little of it was meant to be found.'),
    ];
    for (const st of dc.strata) {
      const s = st.index;
      const open = s <= state.deep.strata;
      const list = Object.values(dc.discoveries).filter((d) => d.stratum === s);
      const found = list.filter((d) => state.deep.discoveries.includes(d.id));
      out.push(
        h(
          'h3',
          { class: `group journal-stratum s${s}` },
          open || s === state.deep.strata + 1 ? st.name : `Stratum ${s}`,
          h('span', { class: 'muted small' }, open ? ` ${found.length}/${list.length}` : ' · sealed'),
        ),
      );
      // Found ones in the order they were found, then the rest as ???.
      const order = [...found].sort((a, b) => state.deep.discoveries.indexOf(a.id) - state.deep.discoveries.indexOf(b.id));
      for (const d of order) out.push(this.entry(d));
      for (let i = 0; i < list.length - found.length; i++) {
        out.push(h('div', { class: 'list-item disc-entry unknown' }, h('b', {}, '???'), h('div', { class: 'muted small' }, open ? 'Not found yet. Keep residents working on these floors.' : 'Behind the seal.')));
      }
    }
    return out;
  }

  private entry(d: DiscoveryDef): HTMLElement {
    const kind = KIND[d.kind ?? 'log'];
    const reward = this.rewardText(d);
    const fresh = this.unread.has(d.id);
    return h(
      'div',
      { class: `list-item disc-entry ${d.kind ?? 'log'}${fresh ? ' fresh' : ''}`, onclick: () => this.showDiscovery(d.id, 0) },
      h('div', { class: 'row', style: 'margin:0' }, h('b', {}, `${kind.icon} ${d.title}`), h('span', { class: 'muted small' }, kind.label)),
      h('div', { class: 'disc-text small' }, d.text),
      reward ? h('div', { class: 'muted small disc-reward' }, `Found with it: ${reward}`) : null,
    );
  }

  private rewardText(d: DiscoveryDef): string {
    const r = d.reward;
    if (!r) return '';
    const bits: string[] = [];
    if (r.scrip) bits.push(`💰 ${fmt(r.scrip)} scrip`);
    if (r.crate) bits.push(`📦 ${r.crate === 'standard' ? 'a Supply Crate' : r.crate === 'rare' ? 'a Rare Crate' : 'a Legendary Crate'}`);
    if (r.fragment) bits.push(`📜 a ${r.fragment} blueprint fragment`);
    if (r.recipe) bits.push(`📘 the ${this.game.content.items[r.recipe]?.name ?? r.recipe} recipe`);
    if (r.salvage) bits.push(`⚙ ${r.salvage.rarity} salvage`);
    return bits.join(', ');
  }

  // ---------------------------------------------------------------- modal

  private showDiscovery(id: string, more: number): void {
    const { content } = this.game;
    const d = discoveryDef(content, id);
    if (!d) return;
    const kind = KIND[d.kind ?? 'log'];
    const st = stratumDef(content, d.stratum);
    const reward = this.rewardText(d);
    const close = () => this.host.modalHost.replaceChildren();
    this.host.modalHost.replaceChildren(
      h(
        'div',
        { class: 'modal-backdrop', onclick: (e: Event) => e.target === e.currentTarget && close() },
        h(
          'div',
          { class: `modal discovery-modal ${d.kind ?? 'log'} s${d.stratum}` },
          h('div', { class: 'disc-kind' }, `${kind.icon} ${kind.label.toUpperCase()} · ${st?.name ?? `Stratum ${d.stratum}`}`),
          h('h2', {}, d.title),
          h('div', { class: 'disc-paper' }, d.text),
          reward ? h('div', { class: 'disc-reward' }, `Found with it: ${reward}`) : null,
          h(
            'div',
            { class: 'row', style: 'justify-content:flex-end;margin-top:12px;gap:8px' },
            h(
              'button',
              {
                onclick: () => {
                  close();
                  this.queue = [];
                  this.host.openDeep('journal');
                },
              },
              'Open journal',
            ),
            h('button', { class: 'primary', onclick: close }, more > 0 ? `Next (${more} more)` : 'Close'),
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- room panel and view

  private showFloor(floor: number, cellX?: number): void {
    this.host.closePanel();
    this.host.view.focusFloor(floor, cellX);
  }

  /** Extra rows for rooms in the Deep, the refinery and the dig shaft. */
  /** How far the shaft is from the bottom floor, and roughly what the elevators down there cost. */
  private shaftPlan(): { n: number; cost: number } | null {
    const { state, content } = this.game;
    const bottom = totalFloors(state, content) - 1;
    const deepest = state.rooms.filter((r) => r.type === 'elevator').sort((a, b) => b.floor - a.floor || a.x - b.x)[0];
    if (!deepest || deepest.floor >= bottom) return null;
    const n = bottom - deepest.floor;
    const first = buildCost(state, content, 'elevator');
    const step = content.rooms.elevator?.cost.perBuilt ?? 0;
    return { n, cost: first * n + (step * n * (n - 1)) / 2 };
  }

  /** "Extend shaft (3 elevators, ~900 scrip)": builds elevators straight down as far as scrip allows. */
  private extendButton(): HTMLElement | null {
    const plan = this.shaftPlan();
    if (!plan) return null;
    return h(
      'button',
      {
        class: 'close',
        disabled: this.game.state.scrip < buildCost(this.game.state, this.game.content, 'elevator'),
        title: 'Build elevators straight down from the deepest shaft, as far as your scrip goes',
        onclick: () => {
          const res = this.game.run({ type: 'extendShaft' });
          this.host.toast(res.ok ? `⛏ Shaft extended: ${res.detail ?? 'done'}.` : `Couldn't extend the shaft: ${res.reason}.`, res.ok ? 'good' : 'bad');
          this.host.refreshPanel();
        },
      },
      `Extend shaft (${plan.n} elevator${plan.n === 1 ? '' : 's'}, ~${fmt(plan.cost)} scrip)`,
    );
  }

  roomSection(room: Room): HTMLElement[] {
    const { state, content } = this.game;
    const out: HTMLElement[] = [];
    const def = roomDef(content, room);
    if (isDeepFloor(content, room.floor)) {
      const st = stratumDef(content, stratumOf(content, room.floor));
      out.push(h('div', { class: `row muted small deep-where s${stratumOf(content, room.floor)}` }, h('span', {}, `⛏ ${st?.name ?? 'The Deep'}`), h('span', {}, `Floor ${room.floor + 1}`)));
    }
    if (room.type === 'refinery') {
      const per = refineryPerHour(state, content, room);
      const p = Math.min(1, room.pool / Math.max(1, refineryBatch(content, room)));
      const t = deepContent(content).tuning.refinery;
      const i = room.level - 1;
      const crew = workersInRoom(state, room.id).length;
      const blocked = !room.powered ? 'No power' : state.incidents.some((x) => x.roomId === room.id) ? 'Stopped by the incident' : crew === 0 ? 'Needs a crew' : '';
      out.push(
        h('div', { class: 'row' }, h('span', {}, '⚙ Refining'), h('b', {}, blocked || `${per.toFixed(per < 1 ? 2 : 1)} salvage/h`)),
        h('div', { class: 'progress' }, h('div', { style: `width:${(p * 100).toFixed(1)}%;background:#c9d1d3` })),
        h(
          'div',
          { class: 'row muted small' },
          h('span', {}, per > 0 ? `Next piece in ${duration(((1 - p) * 3600) / per)}` : 'Knack of the crew drives it'),
          h('span', {}, `Rare ${Math.round((t.rareChance[i] ?? 0) * 100)}% · Legendary ${((t.legendaryChance[i] ?? 0) * 100).toFixed(1)}%`),
        ),
        h('div', { class: 'muted small' }, 'Mostly steel and circuitry. Upgrading raises the odds of rare and legendary finds. Salvage goes straight to the bin.'),
      );
    }
    if (def.category === 'elevator' && this.visible() && room.floor < totalFloors(state, content) - 1) {
      // The deepest elevator of all: offer to run the shaft on down to the bottom.
      const deepest = state.rooms.filter((r) => r.type === 'elevator').sort((a, b) => b.floor - a.floor || a.x - b.x)[0];
      if (deepest?.id === room.id) out.push(h('div', { class: 'row' }, h('span', { class: 'muted small' }, '⛏ The shaft stops here.'), this.extendButton()));
    }
    if (def.category === 'elevator' && room.floor === totalFloors(state, content) - 1 && this.visible()) {
      out.push(
        h('div', { class: 'row' }, h('span', { class: 'muted small' }, state.deep.dig ? '⛏ The dig runs down from this shaft.' : '⛏ The bottom of the shaft: excavation starts here.'), h('button', { class: 'close', onclick: () => this.host.openDeep('dig') }, 'Excavation')),
      );
    }
    return out;
  }

  // ---------------------------------------------------------------- events

  onEvents(events: GameEvent[]): void {
    const { state, content } = this.game;
    for (const ev of events) {
      switch (ev.type) {
        case 'digStarted': {
          const st = stratumDef(content, ev.stratum);
          this.host.toast(`⛏ Excavation begun: ${st?.name ?? `Stratum ${ev.stratum}`}. Through in ${duration(digTimeLeft(state, content))}.`, 'good');
          break;
        }
        case 'digFinished': {
          const st = stratumDef(content, ev.stratum);
          this.host.toast(`⛏ Broke through to ${st?.name ?? `Stratum ${ev.stratum}`}! ${deepContent(content).tuning.floorsPerStratum} new floors open.`, 'gold');
          break;
        }
        case 'discovery':
          this.unread.add(ev.discoveryId);
          if (!this.queue.includes(ev.discoveryId)) this.queue.push(ev.discoveryId);
          break;
      }
    }
  }
}
