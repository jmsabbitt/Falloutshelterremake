// M6 research in the client: the Research panel (points, Lab rates and the
// six-branch tech tree), the HUD chip and toolbar badge, the Lab room panel
// section, build-panel notes for research-gated rooms, and research toasts.
// Hooked into ui.ts with a few small calls; the sim side is
// src/sim/systems/research.ts (see docs/design/M6-spec.md).

import {
  canResearch,
  deepContent,
  labRate,
  nodeStatus,
  researchContent,
  researchNode,
  researchRate,
  roomDef,
  stratumDef,
  workersInRoom,
  type Content,
  type GameEvent,
  type GameState,
  type ResearchNodeDef,
  type RoomDef,
  type Room,
} from '../../sim';
import type { Game } from '../game';
import { duration, fmt, h } from './dom';
import type { ToastFn } from './toasts';

export interface ResearchHost {
  game: Game;
  toast: ToastFn;
  openResearch(): void;
  /** Open the Deep panel (excavation). */
  openDeep(): void;
  refreshPanel(): void;
}

type Status = ReturnType<typeof nodeStatus>;

const BRANCH_ICON: Record<string, string> = { industry: ':industry:', medicine: ':medicine:', defense: ':defense:', automation: ':automation:', expeditions: ':explore:', deep: ':deep:', topside: ':homestead:' };
const STATUS_TEXT: Record<Status, string> = { done: '✓ Done', ready: 'Ready', open: 'Open', locked: '🔒 Locked' };

const pct = (v: number) => `${Math.round(v * 100)}%`;
/** Human text for a research effect. */
const EFFECT_TEXT: Record<string, (v: number) => string> = {
  productionPower: (v) => `⚡ +${pct(v)} power`,
  productionFood: (v) => `🥫 +${pct(v)} food`,
  productionWater: (v) => `💧 +${pct(v)} water`,
  productionMedpatch: (v) => `✚ +${pct(v)} Med-Patches`,
  productionPurge: (v) => `☢ +${pct(v)} Purge`,
  productionSpeed: (v) => `⏩ +${pct(v)} production speed`,
  buildDiscount: (v) => `🏗 −${pct(v)} build & upgrade cost`,
  xpBonus: (v) => `★ +${pct(v)} XP`,
  baseHp: (v) => `❤ +${v} max HP for new residents`,
  childStats: (v) => `👶 +${v} child stats`,
  medicine: (v) => `✚ +${pct(v)} medicine at home`,
  doorHp: (v) => `🚪 +${pct(v)} door HP`,
  incidentDefense: (v) => `🛡 −${pct(v)} incident damage`,
  batchBank: (v) => `🛢 +${v} banked batch${v === 1 ? '' : 'es'}`,
  autoAssign: () => '📋 Auto-assigns idle residents',
  autoMedic: () => '🤖 Supply bots heal and purge',
  autoCollect: () => '⤓ Batches collect themselves',
  offlineHours: (v) => `🌙 +${v}h offline catch-up`,
  researchSpeed: (v) => `🔬 +${pct(v)} research`,
  carryLimit: (v) => `🎒 +${v} carry limit`,
  explorerScrip: (v) => `💰 +${pct(v)} explorer scrip`,
  explorerTaint: (v) => `☢ −${pct(v)} explorer taint`,
  questHeal: (v) => `✚ +${pct(v)} quest healing`,
  contractOffers: (v) => `📜 +${v} contract offer${v === 1 ? '' : 's'}`,
  questSlots: (v) => `⚔ +${v} quest slot${v === 1 ? '' : 's'}`,
  digSpeed: (v) => `⛏ +${pct(v)} dig speed`,
  crateLuck: (v) => `📦 +${pct(v)} crate luck`,
  outpostOutput: (v) => `🏚 +${pct(v)} outpost output`,
};

export function effectText(effect: string, value: number): string {
  return EFFECT_TEXT[effect]?.(value) ?? `${effect} +${value}`;
}

/** Everything a node grants, as short chips: effects, rooms and strata. */
export function nodeGrants(content: Content, node: ResearchNodeDef): string[] {
  const out = (node.effects ?? []).map((e) => effectText(e.effect, e.value));
  const rooms = new Set(node.unlocks?.rooms ?? []);
  for (const def of content.roomList) if (def.requiresResearch === node.id) rooms.add(def.id);
  for (const id of rooms) {
    const def = content.rooms[id];
    if (def) out.push(`🏗 ${def.name}${def.minFloor !== undefined ? ' (Deep)' : ''}`);
  }
  for (let s = 1; stratumDef(content, s); s++) {
    const st = stratumDef(content, s);
    if (st?.requiresResearch === node.id) out.push(`⛏ Opens Stratum ${s}`);
  }
  for (const r of node.unlocks?.regions ?? []) out.push(`🧭 Region: ${r}`);
  return out;
}

/** Build-panel notes for research-gated and deep rooms. */
export function buildInfo(state: GameState, content: Content, def: RoomDef): { what?: string; lock?: string } {
  const out: { what?: string; lock?: string } = {};
  if (def.category === 'research') out.what = `Makes research points · uses Wits`;
  if (def.id === 'refinery') out.what = 'Refines rock into salvage · uses Knack';
  if (def.minFloor !== undefined) {
    const stat = def.stat ? def.stat.charAt(0).toUpperCase() + def.stat.slice(1) : '—';
    const where = def.minFloor > content.balance.grid.floors ? `floor ${def.minFloor + 1} and deeper` : 'deep floors only';
    out.what = `${out.what ?? (def.produces ? `Makes ${def.produces.resource} · uses ${stat}` : '')} · ${where}`;
  }
  if (def.requiresResearch && !state.research.done.includes(def.requiresResearch)) {
    out.lock = `🔒 ${researchNode(content, def.requiresResearch)?.name ?? 'research'}`;
  }
  return out;
}

export class ResearchUI {
  /** Branch filter; 'all' shows the whole tree. */
  branch = 'all';
  private justDone: { id: string; until: number } | null = null;

  constructor(private host: ResearchHost) {}

  private get game(): Game {
    return this.host.game;
  }

  /** Show the toolbar entry once there is a Lab, or any research at all. */
  visible(): boolean {
    const { state, content } = this.game;
    return state.research.points > 0 || state.research.done.length > 0 || state.rooms.some((r) => content.rooms[r.type]?.category === 'research') || state.unlockedRooms.includes('lab');
  }

  /** True once the first survey is done (the Deep panel has something to show). */
  private deepOpen(): boolean {
    const { state } = this.game;
    return state.deep.strata > 0 || !!state.deep.dig || state.research.done.includes(deepContent(this.game.content).tuning.requiresResearch);
  }

  /** Nodes that can be researched right now. */
  badge(): number {
    const { state, content } = this.game;
    let n = 0;
    for (const node of researchContent(content).nodes) if (nodeStatus(state, content, node.id) === 'ready') n++;
    return n;
  }

  hudChip(): HTMLElement | null {
    const { state, content } = this.game;
    if (!this.visible()) return null;
    const rate = researchRate(state, content);
    const ready = this.badge();
    return h(
      'button',
      {
        class: `stat-chip chip-button research-chip${ready ? ' glow' : ''}`,
        title: `Research points: ${Math.floor(state.research.points)} (+${rate.toFixed(1)}/h)${ready ? ` · ${ready} ready to research` : ''}`,
        onclick: () => this.host.openResearch(),
      },
      '🔬 ',
      h('b', {}, fmt(state.research.points)),
    );
  }

  // ---------------------------------------------------------------- the panel

  panel(): HTMLElement {
    const { state, content } = this.game;
    const rc = researchContent(content);
    const rate = researchRate(state, content);
    const labs = state.rooms.filter((r) => content.rooms[r.type]?.category === 'research');
    const producing = labs.filter((r) => labRate(state, content, r) > 0).length;
    const done = state.research.done.length;
    const total = rc.nodes.length;

    const tab = (id: string, label: string, count: number) =>
      h(
        'button',
        {
          class: this.branch === id ? 'active' : '',
          onclick: () => {
            this.branch = id;
            this.host.refreshPanel();
          },
        },
        label,
        count ? h('span', { class: 'badge' }, count) : null,
      );
    const readyIn = (branch: string) => rc.nodes.filter((n) => (branch === 'all' || n.branch === branch) && nodeStatus(state, content, n.id) === 'ready').length;
    const top = h(
      'div',
      { class: 'research-top' },
      h(
        'div',
        { class: 'research-sum' },
        h('div', { class: 'rp-big' }, '🔬 ', h('b', {}, fmt(state.research.points)), h('span', { class: 'muted' }, ' research points')),
        h(
          'div',
          { class: 'muted small' },
          rate > 0
            ? `+${rate.toFixed(1)} per hour from ${producing} Lab${producing === 1 ? '' : 's'} · ${done}/${total} researched`
            : labs.length
              ? `No research coming in: ${this.labProblem()}. ${done}/${total} researched`
              : `Build a Research Lab (population ${content.rooms.lab?.unlockPop ?? 25}) and staff it with high-Wits residents. ${done}/${total} researched`,
        ),
      ),
      h(
        'div',
        { class: 'tabs research-tabs' },
        tab('all', 'All', readyIn('all')),
        ...rc.branches.map((b) => tab(b.id, `${BRANCH_ICON[b.id] ?? ''} ${b.name}`, readyIn(b.id))),
      ),
    );

    const labRows = labs.length
      ? h(
          'div',
          { class: 'lab-rows' },
          ...labs.map((room) => {
            const r = labRate(state, content, room);
            const crew = workersInRoom(state, room.id).length;
            const def = roomDef(content, room);
            const why = !room.powered ? 'no power' : state.incidents.some((i) => i.roomId === room.id) ? 'incident!' : crew === 0 ? 'no crew' : '';
            return h(
              'span',
              { class: `lab-pill${r > 0 ? '' : ' idle'}`, title: `${def.levelNames?.[room.level - 1] ?? def.name}, floor ${room.floor + 1}, ${crew} working` },
              `🧪 F${room.floor + 1} · ${r > 0 ? `${r.toFixed(1)}/h` : why}`,
            );
          }),
        )
      : null;

    const branches = rc.branches.filter((b) => this.branch === 'all' || b.id === this.branch);
    const tree = h(
      'div',
      { class: `research-tree${branches.length === 1 ? ' single' : ''}` },
      ...branches.map((b) => {
        const nodes = rc.nodes.filter((n) => n.branch === b.id).sort((x, y) => x.tier - y.tier || x.cost - y.cost);
        const got = nodes.filter((n) => state.research.done.includes(n.id)).length;
        const col: HTMLElement[] = [];
        let tier = 0;
        for (const n of nodes) {
          if (n.tier !== tier) {
            tier = n.tier;
            col.push(h('div', { class: 'tier-label' }, `Tier ${tier}`));
          }
          col.push(this.nodeCard(n, rate));
        }
        return h(
          'div',
          { class: `research-branch ${b.id}` },
          h(
            'header',
            {},
            h('b', {}, `${BRANCH_ICON[b.id] ?? ''} ${b.name}`),
            h('span', { class: 'muted small' }, `${got}/${nodes.length}`),
            // The Deep Works branch leads to the dig itself.
            b.id === 'deep' && this.deepOpen() ? h('button', { class: 'close dig-link', onclick: () => this.host.openDeep() }, '⛏ Excavation') : null,
            h('span', { class: 'muted small desc' }, b.description),
          ),
          ...col,
        );
      }),
    );
    return h('div', { class: 'body research-body' }, top, labRows, tree);
  }

  private nodeCard(n: ResearchNodeDef, rate: number): HTMLElement {
    const { state, content } = this.game;
    const status = nodeStatus(state, content, n.id);
    const why = canResearch(state, content, n.id);
    const missing = n.requires.filter((id) => !state.research.done.includes(id));
    const short = Math.max(0, n.cost - state.research.points);
    const just = this.justDone && this.justDone.id === n.id && performance.now() < this.justDone.until;
    const eta = status === 'open' ? (rate > 0 ? `~${duration((short / rate) * 3600)}` : this.labProblem(true)) : '';
    return h(
      'div',
      { class: `rnode ${status}${just ? ' just-done' : ''}` },
      h('div', { class: 'rnode-head' }, h('b', {}, n.name), h('span', { class: `rstatus ${status}` }, status === 'open' ? `${fmt(short)} short` : STATUS_TEXT[status])),
      h('div', { class: 'rnode-desc' }, n.description),
      h('div', { class: 'rnode-grants' }, ...nodeGrants(content, n).map((t) => h('span', { class: 'grant' }, t))),
      status === 'locked' && missing.length ? h('div', { class: 'rnode-req' }, `Needs ${missing.map((id) => researchNode(content, id)?.name ?? id).join(' and ')}`) : null,
      status === 'done'
        ? null
        : h(
            'div',
            { class: 'rnode-foot' },
            h('span', { class: `rcost${short > 0 ? ' short' : ''}` }, `🔬 ${fmt(n.cost)}`, eta ? h('span', { class: 'muted small' }, ` ${eta}`) : null),
            h(
              'button',
              {
                class: `rbuy${status === 'ready' ? ' primary' : ''}`,
                disabled: !!why,
                title: why ?? `Research ${n.name}`,
                onclick: () => {
                  const res = this.game.run({ type: 'research', nodeId: n.id });
                  if (!res.ok) this.host.toast(res.reason, 'bad');
                  this.host.refreshPanel();
                },
              },
              'Research',
            ),
          ),
    );
  }

  /** Why no research points come in: "needs a Lab", or which of staffed and powered the Labs lack. */
  labProblem(short = false): string {
    const { state, content } = this.game;
    const labs = state.rooms.filter((r) => content.rooms[r.type]?.category === 'research');
    if (!labs.length) return 'needs a Lab';
    const staffed = labs.some((r) => workersInRoom(state, r.id).length > 0);
    const powered = labs.some((r) => r.powered);
    const both = labs.some((r) => r.powered && workersInRoom(state, r.id).length > 0);
    if (both) return state.incidents.some((i) => labs.some((l) => l.id === i.roomId)) ? 'the Lab is stopped by an incident' : 'the Lab is warming up';
    if (!staffed && !powered) return 'needs a staffed, powered Lab';
    if (!staffed) return short ? 'needs a staffed Lab' : 'needs a staffed Lab (put high-Wits residents in it)';
    if (!powered) return short ? 'needs a powered Lab' : 'needs a powered Lab (it has no power)';
    return 'needs a staffed, powered Lab';
  }

  // ---------------------------------------------------------------- room panel

  /** Extra rows for the Lab's room panel. */
  roomSection(room: Room): HTMLElement[] {
    const { state, content } = this.game;
    const def = roomDef(content, room);
    if (def.category !== 'research') return [];
    const rate = labRate(state, content, room);
    const all = researchRate(state, content);
    const crew = workersInRoom(state, room.id).length;
    const why = !room.powered ? 'No power' : state.incidents.some((i) => i.roomId === room.id) ? 'Stopped by the incident' : crew === 0 ? 'Needs a crew' : '';
    const tuning = researchContent(content).tuning;
    const mult = tuning.levelMult[room.level - 1] ?? 1;
    // The time left until the cheapest open project is affordable, as other stations show time remaining.
    const next = researchContent(content)
      .nodes.filter((n) => nodeStatus(state, content, n.id) === 'open' && n.cost > state.research.points)
      .sort((a, b) => a.cost - b.cost)[0];
    return [
      h('div', { class: 'row' }, h('span', {}, '🔬 Research'), h('b', {}, rate > 0 ? `${rate.toFixed(1)} RP/h` : why)),
      ...(next && all > 0
        ? [h('div', { class: 'row small' }, h('span', {}, `Enough for ${next.name} in`), h('b', { class: 'countdown' }, duration(((next.cost - state.research.points) / all) * 3600)))]
        : []),
      h('div', { class: 'row muted small' }, h('span', {}, `All Labs ${all.toFixed(1)} RP/h`), h('span', {}, `${fmt(state.research.points)} RP banked`)),
      h('div', { class: 'muted small' }, `Each point of crew Wits makes ${tuning.pointsPerWitsHour} RP an hour${mult !== 1 ? `, ×${mult} at this level` : ''}. Lab work also earns XP.`),
      h('div', { class: 'row', style: 'justify-content:flex-start' }, h('button', { class: 'close', onclick: () => this.host.openResearch() }, 'Open Research')),
    ];
  }

  // ---------------------------------------------------------------- events

  onEvents(events: GameEvent[]): void {
    const { content } = this.game;
    const done = events.filter((e): e is Extract<GameEvent, { type: 'researchDone' }> => e.type === 'researchDone');
    if (done.length > 3) this.host.toast(`🔬 ${done.length} research projects complete.`, 'gold');
    else {
      for (const ev of done) {
        const n = researchNode(content, ev.nodeId);
        if (!n) continue;
        this.justDone = { id: n.id, until: performance.now() + 1400 };
        const grants = nodeGrants(content, n);
        this.host.toast(`🔬 Research complete: ${n.name}${grants.length ? ` · ${grants.join(', ')}` : ''}`, 'gold');
      }
    }
    for (const ev of events) {
      if (ev.type === 'roomUnlocked') {
        const def = content.rooms[ev.roomType];
        if (!def?.requiresResearch) continue;
        this.host.toast(`🏗 New room unlocked: ${def.name}${def.minFloor !== undefined ? '. Build it on the deep floors.' : ''}`, 'gold');
      } else if (ev.type === 'autoAssigned' && this.game.running !== 'autoAssign') {
        // A press of Auto-assign gets its own, fuller toast (residentList.ts); this is the research automation.
        this.host.toast(`📋 ${ev.count} idle resident${ev.count === 1 ? '' : 's'} assigned to jobs.`, 'good');
      }
    }
  }
}
