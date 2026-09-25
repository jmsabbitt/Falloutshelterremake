// The quest screen's DOM half: a top bar, the boss bar and telegraph alert, a
// small log, the per-member controls (crit, ability, Med-Patch), the event
// modal and the finish banner. The Pixi half (map, fighters, crit ring) is
// render/questView.ts. Everything the player does goes through game.run.

import {
  abilityFor,
  currentRoom,
  effectiveMaxHp,
  effectiveStat,
  inCombat,
  questContent,
  questDef,
  type AbilityDef,
  type Command,
  type GameEvent,
  type Quest,
  type QuestEventDef,
  type QuestMember,
  type Resident,
  type StatKey,
} from '../../sim';
import type { Game } from '../game';
import type { QuestView } from '../render/questView';
import type { VaultView } from '../render/vaultView';
import { ask } from './confirm';
import { duration, h, morph } from './dom';
import { lootList, STAT_NAMES } from './questText';
import type { ToastFn } from './toasts';

export interface QuestHost {
  game: Game;
  toast: ToastFn;
  /** Open the quests panel. */
  openQuests(): void;
}

interface Outcome {
  text: string;
  success: boolean;
}

/** How often the DOM half re-renders (the Pixi half runs every frame). */
const RENDER_MS = 100;

export class QuestScreen {
  readonly el = h('div', { class: 'quest-screen', style: 'display:none' });
  questId: number | null = null;
  private lastRender = 0;
  /** Rooms still to walk through after the current step (multi-room taps). */
  private path: string[] = [];
  /** Outcome of the event just answered, shown until dismissed. */
  private outcome: Outcome | null = null;
  /** A short-lived callout (ambush, interrupt) over the scene. */
  private callout: { text: string; until: number; kind: string } | null = null;
  private logOpen = window.innerWidth >= 700;
  /** Quests whose finish banner the player has closed. */
  private dismissed = new Set<number>();
  private keyHandler = (e: KeyboardEvent) => this.onKey(e);

  constructor(
    private host: QuestHost,
    private view: QuestView,
    private vault: VaultView,
    private uiRoot: HTMLElement,
  ) {}

  private get game(): Game {
    return this.host.game;
  }

  get isOpen(): boolean {
    return this.questId !== null;
  }

  private quest(): Quest | undefined {
    return this.questId === null ? undefined : this.game.state.quests.find((q) => q.id === this.questId);
  }

  open(questId: number): void {
    this.questId = questId;
    this.path = [];
    this.outcome = null;
    this.view.open(questId);
    this.vault.suspended = true;
    this.vault.world.visible = false;
    this.uiRoot.classList.add('quest-open');
    this.el.style.display = '';
    this.el.replaceChildren();
    window.addEventListener('keydown', this.keyHandler);
    this.render(true);
  }

  close(): void {
    // Closing never stops the quest: combat carries on without the player.
    this.questId = null;
    this.path = [];
    this.view.close();
    this.vault.suspended = false;
    this.vault.world.visible = true;
    this.uiRoot.classList.remove('quest-open');
    this.el.style.display = 'none';
    this.el.replaceChildren();
    window.removeEventListener('keydown', this.keyHandler);
  }

  // ---------------------------------------------------------------- commands

  private run(cmd: Command, quiet = false): boolean {
    const res = this.game.run(cmd);
    if (!res.ok && !quiet) this.host.toast(res.reason, 'bad');
    this.render(true);
    return res.ok;
  }

  onRoomTap(roomId: string): void {
    const q = this.quest();
    if (!q || q.status !== 'onsite') return;
    const here = currentRoom(q);
    if (!here || here.id === roomId) return;
    if (inCombat(q)) {
      this.flash('Finish the fight first!', 'bad');
      return;
    }
    if (q.pendingEvent) return;
    const route = findPath(q, here.id, roomId);
    if (!route) {
      this.flash('No way through from here.', 'bad');
      return;
    }
    if (q.moving) {
      // Already walking: queue the new destination after this step.
      const after = findPath(q, q.moving.to, roomId);
      this.path = after ?? [];
      return;
    }
    const [first, ...rest] = route;
    if (first && this.run({ type: 'questMove', questId: q.id, roomId: first })) this.path = rest;
  }

  onEnemyTap(uid: number): void {
    const q = this.quest();
    if (!q) return;
    this.run({ type: 'questTarget', questId: q.id, enemyUid: uid }, true);
  }

  onRingResult(residentId: number, quality: number | null): void {
    const q = this.quest();
    if (!q) return;
    if (quality === null) {
      this.render(true);
      return;
    }
    this.run({ type: 'questCrit', questId: q.id, residentId, quality }, true);
  }

  private crit(residentId: number): void {
    if (this.view.ringActive) {
      this.view.tapRing();
      return;
    }
    if (!this.view.startRing(residentId)) this.flash('No fight going on.', 'bad');
    this.render(true);
  }

  private onKey(e: KeyboardEvent): void {
    const q = this.quest();
    if (!q) return;
    if (e.key === ' ' || e.key === 'Enter') {
      if (this.view.ringActive) {
        e.preventDefault();
        this.view.tapRing();
      }
      return;
    }
    // Escape goes through the platform's back handling (ui.ts closes the quest screen there).
    const n = ['1', '2', '3'].indexOf(e.key);
    const m = n >= 0 ? q.party[n] : undefined;
    if (m) {
      // 1-3: crit when the meter is full, else the ability.
      if (m.crit >= 1 && inCombat(q)) this.crit(m.residentId);
      else this.run({ type: 'questAbility', questId: q.id, residentId: m.residentId });
    }
  }

  private flash(text: string, kind: string, seconds = 2.2): void {
    this.callout = { text, until: performance.now() + seconds * 1000, kind };
    this.render(true);
  }

  // ---------------------------------------------------------------- events

  onEvents(events: GameEvent[]): void {
    const q = this.quest();
    if (!q) return;
    const { content } = this.game;
    for (const ev of events) {
      if (!('questId' in ev) || ev.questId !== q.id) continue;
      switch (ev.type) {
        case 'questEventResolved':
          if (inCombat(q)) {
            this.flash(`${ev.success ? '' : 'Ambush! '}${ev.text}`, 'bad', 5);
            this.path = [];
          } else this.outcome = { text: ev.text, success: ev.success };
          break;
        case 'questCombat':
        case 'questEventPrompt':
          this.path = [];
          break;
        case 'questInterrupted':
          this.flash('Interrupted! Nicely done.', 'good', 1.6);
          break;
        case 'questWindup': {
          const e = q.enemies.find((x) => x.uid === ev.enemyUid);
          const def = e ? questContent(content).enemies[e.defId] : undefined;
          const ab = def?.abilities?.find((a) => a.id === ev.ability);
          if (ab && this.interrupter(q)) this.flash(`${def?.name}: ${ab.name}! Haymaker now to interrupt!`, 'warn', ev.seconds);
          break;
        }
      }
    }
    this.render(true);
  }

  /** A standing member whose Haymaker is ready, if any. */
  private interrupter(q: Quest): Resident | undefined {
    for (const m of q.party) {
      const r = this.resident(m.residentId);
      if (!r || m.downed || r.dead) continue;
      if (abilityFor(this.game.content, r).stat === 'brawn' && m.abilityCooldown <= 0) return r;
    }
    return undefined;
  }

  private resident(id: number): Resident | undefined {
    return this.game.state.residents.find((r) => r.id === id);
  }

  // ---------------------------------------------------------------- frame

  update(): void {
    if (this.questId === null) return;
    const q = this.quest();
    if (!q) {
      // Collected (or otherwise gone) while open.
      this.close();
      return;
    }
    // Walk on through a multi-room route once the last step is done.
    if (this.path.length && q.status === 'onsite' && !q.moving && !inCombat(q) && !q.pendingEvent) {
      const next = this.path.shift() as string;
      this.run({ type: 'questMove', questId: q.id, roomId: next }, true);
    }
    if (performance.now() - this.lastRender > RENDER_MS) this.render();
  }

  private render(force = false): void {
    const q = this.quest();
    if (!q) return;
    if (!force && performance.now() - this.lastRender < RENDER_MS) return;
    this.lastRender = performance.now();
    const next = h(
      'div',
      { class: 'qs-root' },
      this.topBar(q),
      this.log(q),
      h('div', { class: 'qs-mid' }, this.middle(q)),
      q.status === 'onsite' || (q.outcome && q.onsiteTime > 0) ? this.partyBar(q) : null,
      this.modal(q),
    );
    if (this.el.firstChild) morph(this.el.firstChild, next);
    else this.el.append(next);
    this.measure();
  }

  /** Tell the view how much of the screen the bars cover. */
  private measure(): void {
    const top = this.el.querySelector('.qs-head');
    const bottom = this.el.querySelector('.qs-party');
    const H = window.innerHeight;
    this.view.insets = {
      top: top ? top.getBoundingClientRect().bottom : 60,
      bottom: bottom ? H - bottom.getBoundingClientRect().top : 20,
    };
  }

  // ---------------------------------------------------------------- pieces

  private statusText(q: Quest): string {
    const room = currentRoom(q);
    switch (q.status) {
      case 'travelling':
        return `On the road · arriving in ${duration(q.travelRemaining)}`;
      case 'returning':
        return `Heading home · ${duration(q.travelRemaining)}`;
      case 'returned':
        return 'Home: collect the rewards';
      case 'onsite':
        if (q.pendingEvent) return 'Something needs deciding';
        if (inCombat(q)) return room?.kind === 'boss' ? 'Boss fight!' : 'Fighting!';
        if (q.moving) return 'On the move…';
        return 'Tap a room to move';
    }
  }

  private topBar(q: Quest): HTMLElement {
    const canRetreat = q.status === 'onsite' || q.status === 'travelling';
    const boss = q.enemies.find((e) => e.hp > 0 && questContent(this.game.content).enemies[e.defId]?.boss);
    const bossDef = boss ? questContent(this.game.content).enemies[boss.defId] : undefined;
    const alert = this.alert(q);
    return h(
      'div',
      { class: 'qs-head' },
      h(
        'div',
        { class: 'qs-top' },
        h('button', { class: 'qs-back', 'aria-label': 'Back to the homestead', title: 'Back to the homestead (the quest carries on)', onclick: () => this.close() }, '◀ Home'),
        h('div', { class: 'qs-title' }, h('b', {}, q.title), h('span', { class: `qs-status${inCombat(q) ? ' fight' : ''}` }, `L${q.level} · ${this.statusText(q)}`)),
        canRetreat
          ? h(
              'button',
              {
                class: 'danger qs-retreat',
                title: 'Retreat: keep what you found, lose the reward',
                onclick: () =>
                  ask({ title: 'Retreat?', text: 'The party keeps what it found but gets no reward.', ok: 'Retreat', danger: true }, () => this.run({ type: 'abandonQuest', questId: q.id })),
              },
              'Retreat',
            )
          : null,
      ),
      boss && bossDef
        ? h(
            'div',
            { class: 'qs-boss' },
            h('span', {}, bossDef.name),
            h('div', { class: 'bar' }, h('div', { style: `width:${Math.max(0, (boss.hp / boss.maxHp) * 100).toFixed(1)}%` })),
            h('span', { class: 'num' }, `${Math.ceil(boss.hp)}/${boss.maxHp}`),
          )
        : null,
      alert,
    );
  }

  /** The most urgent wind-up, or a recent callout. */
  private alert(q: Quest): HTMLElement | null {
    const { content } = this.game;
    let worst: { name: string; ability: string; left: number; effect: string } | null = null;
    for (const e of q.enemies) {
      if (e.hp <= 0 || !e.windup) continue;
      const def = questContent(content).enemies[e.defId];
      const ab = def?.abilities?.[e.windup.index];
      if (!def || !ab) continue;
      if (!worst || e.windup.remaining < worst.left) worst = { name: def.name, ability: ab.name, left: e.windup.remaining, effect: ab.effect };
    }
    if (worst) {
      const who = this.interrupter(q);
      const what: Record<string, string> = { slam: 'hits the whole party', heavy: 'a huge hit', summon: 'calls for help', enrage: 'about to enrage', heal: 'about to heal' };
      return h(
        'div',
        { class: 'qs-alert warn' },
        h('b', {}, `⚠ ${worst.ability}`),
        ` ${worst.left.toFixed(1)}s · ${what[worst.effect] ?? ''}. `,
        who ? h('span', {}, `${who.firstName}'s Haymaker interrupts!`) : h('span', {}, 'Brace yourselves.'),
      );
    }
    const c = this.callout;
    if (c && performance.now() < c.until) return h('div', { class: `qs-alert ${c.kind}` }, c.text);
    return null;
  }

  private log(q: Quest): HTMLElement | null {
    if (!q.log.length || q.status === 'travelling') return null;
    const lines = q.log.slice(this.logOpen ? -6 : -1).reverse();
    return h(
      'div',
      { class: `qs-log${this.logOpen ? ' open' : ''}`, onclick: () => ((this.logOpen = !this.logOpen), this.render(true)) },
      h('div', { class: 'qs-log-head' }, `Log ${q.log.length}`, h('span', {}, this.logOpen ? '▴' : '▾')),
      ...lines.map((t) => h('div', { class: 'qs-line' }, t)),
    );
  }

  /** Travel card or a hint in the middle of the scene. */
  private middle(q: Quest): HTMLElement | null {
    if (q.status === 'travelling') {
      const p = q.travelTotal > 0 ? 1 - q.travelRemaining / q.travelTotal : 1;
      return h(
        'div',
        { class: 'qs-card' },
        h('h3', {}, 'On the road'),
        h('p', { class: 'muted' }, `The party is crossing the Glarelands to ${q.title}. Travel carries on while you are away.`),
        h('div', { class: 'progress big' }, h('div', { style: `width:${(p * 100).toFixed(1)}%` })),
        h('div', { class: 'row' }, h('span', {}, 'Arriving in'), h('b', {}, duration(q.travelRemaining))),
      );
    }
    if (q.status === 'returned' && !this.showBanner(q)) {
      return h(
        'div',
        { class: 'qs-card' },
        h('h3', {}, 'Home again'),
        h('p', { class: 'muted' }, 'The party is back at the door with their haul.'),
        h('div', { class: 'row', style: 'justify-content:flex-end' }, h('button', { class: 'primary', onclick: () => this.run({ type: 'collectQuest', questId: q.id }) }, 'Collect rewards')),
      );
    }
    if (q.status === 'returning' && !this.showBanner(q)) {
      return h('div', { class: 'qs-card' }, h('h3', {}, 'Heading home'), h('div', { class: 'row' }, h('span', {}, 'Home in'), h('b', {}, duration(q.travelRemaining))));
    }
    return null;
  }

  private partyBar(q: Quest): HTMLElement {
    const fight = inCombat(q);
    const winding = q.enemies.some((e) => e.hp > 0 && e.windup);
    return h(
      'div',
      { class: `qs-party n${q.party.length}` },
      ...q.party.map((m, i) => this.memberCard(q, m, i, fight, winding)),
      h('div', { class: 'qs-supplies', title: 'Med-Patches the party carries' }, `✚ ${q.supplies.medpatch}`),
    );
  }

  private memberCard(q: Quest, m: QuestMember, index: number, fight: boolean, winding: boolean): HTMLElement {
    const { content } = this.game;
    const r = this.resident(m.residentId);
    if (!r) return h('div', { class: 'qs-member' });
    const a = abilityFor(content, r);
    const down = m.downed || r.dead;
    const max = Math.max(1, effectiveMaxHp(r));
    const hp = Math.max(0, r.hp);
    const frac = Math.min(1, hp / max);
    const onsite = q.status === 'onsite';
    const why = abilityBlock(a, m, r, fight, q, this.game);
    const cd = a.cooldown > 0 ? Math.max(0, Math.min(1, m.abilityCooldown / a.cooldown)) : 0;
    const critFull = m.crit >= 1 && fight && !down;
    const canHeal = onsite && !down && q.supplies.medpatch > 0 && r.hp < max - 0.5;
    const interrupt = winding && a.stat === 'brawn' && !why;
    return h(
      'div',
      { class: `qs-member${down ? ' down' : ''}${m.taunt > 0 ? ' taunt' : ''}` },
      h(
        'div',
        { class: 'qs-mhead' },
        h('b', {}, `${r.firstName}`),
        h('span', { class: 'muted' }, down ? (r.dead ? 'fallen' : 'down') : `L${r.level}`),
        h('span', { class: 'key' }, `${index + 1}`),
      ),
      h('div', { class: 'qs-hp' }, h('div', { class: frac > 0.5 ? '' : frac > 0.25 ? 'mid' : 'low', style: `width:${(frac * 100).toFixed(1)}%` }), h('span', {}, `${Math.ceil(hp)}/${Math.ceil(max)}`)),
      h(
        'div',
        { class: 'qs-buttons' },
        h(
          'button',
          {
            class: `qs-ability${interrupt ? ' interrupt' : ''}`,
            disabled: !!why || !onsite,
            title: `${a.name}: ${a.description}${why ? ` (${why})` : ''}`,
            style: cd > 0 ? `--cd:${(cd * 100).toFixed(1)}%` : undefined,
            onclick: () => this.run({ type: 'questAbility', questId: q.id, residentId: r.id }),
          },
          h('span', { class: 'aname' }, a.name),
          m.abilityCooldown > 0 ? h('span', { class: 'cdnum' }, `${Math.ceil(m.abilityCooldown)}s`) : null,
        ),
        h(
          'button',
          {
            class: `qs-crit${critFull ? ' full' : ''}`,
            disabled: !critFull,
            title: critFull ? 'Critical hit ready: tap, then time the ring' : 'Hits fill the crit meter (Fortune fills it faster)',
            style: `--crit:${(Math.min(1, m.crit) * 100).toFixed(1)}%`,
            onclick: () => this.crit(r.id),
          },
          critFull ? 'CRIT!' : `${Math.floor(Math.min(1, m.crit) * 100)}%`,
        ),
        h(
          'button',
          {
            class: 'qs-med',
            disabled: !canHeal,
            title: `Use a Med-Patch on ${r.firstName} (${q.supplies.medpatch} left)`,
            onclick: () => this.run({ type: 'questHeal', questId: q.id, residentId: r.id }),
          },
          `✚${q.supplies.medpatch}`,
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- modals

  private showBanner(q: Quest): boolean {
    return !!q.outcome && !this.dismissed.has(q.id);
  }

  private modal(q: Quest): HTMLElement | null {
    if (this.showBanner(q)) return this.banner(q);
    if (this.outcome) {
      const o = this.outcome;
      return h(
        'div',
        { class: 'qs-modal' },
        h(
          'div',
          { class: 'modal qs-event' },
          h('div', { class: `qs-verdict ${o.success ? 'ok' : 'bad'}` }, o.success ? '✓ It worked' : '✗ It did not work'),
          h('p', {}, o.text),
          h('div', { class: 'row', style: 'justify-content:flex-end' }, h('button', { class: 'primary', onclick: () => ((this.outcome = null), this.render(true)) }, 'Continue')),
        ),
      );
    }
    if (q.status === 'onsite' && q.pendingEvent) {
      const ev = questContent(this.game.content).events[q.pendingEvent];
      if (ev) return this.eventModal(q, ev);
    }
    return null;
  }

  private eventModal(q: Quest, ev: QuestEventDef): HTMLElement {
    const { content } = this.game;
    const standing = q.party
      .filter((m) => !m.downed)
      .map((m) => this.resident(m.residentId))
      .filter((r): r is Resident => !!r && !r.dead);
    const options = ev.options.map((opt, i) => {
      let detail: HTMLElement | null = null;
      if (opt.stat) {
        const stat = opt.stat as StatKey;
        const best = standing.reduce<{ r: Resident; v: number } | null>((acc, r) => {
          const v = effectiveStat(content, r, stat);
          return !acc || v > acc.v ? { r, v } : acc;
        }, null);
        const diff = opt.difficulty ?? 0;
        const v = best?.v ?? 0;
        // The check is best stat + a 0..4 roll against the difficulty.
        let wins = 0;
        for (let roll = 0; roll <= 4; roll++) if (v + roll >= diff) wins++;
        const pct = Math.round((wins / 5) * 100);
        detail = h(
          'span',
          { class: `qs-check ${pct >= 80 ? 'ok' : pct >= 40 ? 'mid' : 'bad'}` },
          `${STAT_NAMES[stat]} ${diff}`,
          h('small', {}, `best ${v}${best ? ` (${best.r.firstName})` : ''} · ${pct}%`),
        );
      }
      return h(
        'button',
        { class: 'qs-option', onclick: () => this.run({ type: 'questChoose', questId: q.id, option: i }) },
        h('span', {}, cleanLabel(opt.label, opt.stat)),
        detail,
      );
    });
    return h('div', { class: 'qs-modal' }, h('div', { class: 'modal qs-event' }, h('div', { class: 'qs-kicker' }, 'Something here'), h('p', {}, ev.text), ...options));
  }

  private banner(q: Quest): HTMLElement {
    const { content } = this.game;
    const def = q.contract ? undefined : questDef(content, q.defId);
    const head = q.outcome === 'success' ? 'Victory!' : q.outcome === 'failed' ? 'Party lost' : 'Retreat';
    const text =
      q.outcome === 'success'
        ? (def?.debrief ?? 'Bounty confirmed! Halcyon thanks you for your continued, entirely voluntary service.')
        : q.outcome === 'failed'
          ? 'The whole party went down. HALCY has arranged for them to be carried home, to be revived or laid to rest.'
          : 'The party is heading home with whatever they found. HALCY has filed this under "strategic repositioning".';
    const loot = lootList(content, q.loot);
    return h(
      'div',
      { class: 'qs-modal' },
      h(
        'div',
        { class: `modal qs-banner ${q.outcome}` },
        h('div', { class: 'qs-banner-head' }, head),
        h('p', {}, h('b', {}, q.outcome === 'success' ? 'HALCY: ' : ''), text),
        loot.length ? h('div', { class: 'qs-loot' }, h('div', { class: 'muted small' }, 'Coming home with'), ...loot) : null,
        h('p', { class: 'muted small' }, `The trip home takes ${duration(q.travelRemaining)}. Collect the rewards from the Quests panel.`),
        h(
          'div',
          { class: 'row', style: 'justify-content:flex-end;gap:8px' },
          h(
            'button',
            {
              class: 'primary',
              onclick: () => {
                this.dismissed.add(q.id);
                this.close();
                this.host.openQuests();
              },
            },
            'Head home',
          ),
        ),
      ),
    );
  }
}

/** Why an ability can't be used right now, or null. */
function abilityBlock(a: AbilityDef, m: QuestMember, r: Resident, fight: boolean, q: Quest, game: Game): string | null {
  if (m.downed || r.dead) return 'down';
  if (m.abilityCooldown > 0) return 'recharging';
  if (a.stat === 'wits') {
    const hurt = q.party.some((x) => {
      const y = game.state.residents.find((z) => z.id === x.residentId);
      return y && !y.dead && y.hp < effectiveMaxHp(y);
    });
    return hurt ? null : 'nobody is hurt';
  }
  return fight ? null : 'no fight';
}

/** Drop a trailing "(Knack)" from content labels; the check is shown separately. */
function cleanLabel(label: string, stat?: string): string {
  if (!stat) return label;
  return label.replace(/\s*\((brawn|sight|grit|charm|wits|knack|fortune)[^)]*\)\s*$/i, '');
}

/** Shortest route (room ids after the start) through linked rooms. */
function findPath(q: Quest, from: string, to: string): string[] | null {
  const byId = new Map(q.rooms.map((r) => [r.id, r]));
  const prev = new Map<string, string>([[from, '']]);
  const queue = [from];
  while (queue.length) {
    const id = queue.shift() as string;
    if (id === to) break;
    for (const l of byId.get(id)?.links ?? []) {
      if (prev.has(l)) continue;
      prev.set(l, id);
      // Don't plan through rooms nobody has seen: stop at the first unknown one.
      if (!byId.get(l)?.visited && l !== to) continue;
      queue.push(l);
    }
  }
  if (!prev.has(to)) return null;
  const route: string[] = [];
  for (let at = to; at !== from; at = prev.get(at) as string) route.unshift(at);
  return route;
}
