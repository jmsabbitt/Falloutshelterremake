// Act 4's ending, in the client: the choice (with the true ending's
// conditions shown even while it is locked), the full-screen epilogue of
// slides, the credits roll, replays from Goals, the HUD title and chip, and
// the network line on network quests. The sim does the deciding
// (systems/endings.ts); this file only shows it and sends `chooseEnding`.

import {
  ALLY_ORDER,
  endingChoiceOpen,
  endingOptions,
  endingsContent,
  endingTitle,
  factionDef,
  legendDef,
  networkPreview,
  networkTuning,
  replayEpilogue,
  epilogue,
  type EndingDef,
  type EndingOption,
  type GameEvent,
  type QuestDef,
  type Slide,
} from '../../sim';
import type { Game } from '../game';
import { haptic, onBack } from '../platform';
import { ask } from './confirm';
import { h } from './dom';
import { halcyFace } from './halcy';
import { legendPortrait } from './legends';
import type { ToastKind } from './toasts';
import './endings.css';

export interface EndingsHost {
  game: Game;
  toast: (text: string, kind?: ToastKind) => void;
  refreshPanel: () => void;
}

const FACTION_ICON: Record<string, string> = { caravaners: ':faction_caravaners:', tinkers: ':faction_tinkers:', lamplighters: ':faction_lamplighters:', rustmen: ':faction_rustmen:', homestead9: ':faction_homestead9:' };
const ART_GLYPH: Record<string, string> = { door: '🚪', glare: '☀', lease: '📜', relay: '📡', home: '🏠', end: '✦' };
const SUPPORT_TEXT: Record<string, string> = {
  caravaners: 'patches everyone up',
  tinkers: 'turret hits every enemy',
  rustmen: 'heavy charge on the biggest foe',
  lamplighters: 'flare stuns, cancels wind-ups',
  homestead9: 'drill: party takes less damage',
};

export class EndingsUI {
  private layer: HTMLElement | null = null;
  private unBack: (() => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  /** The choice was put off with "Not yet" in this session: don't pop it up again on its own. */
  private deferred = false;

  constructor(private host: EndingsHost) {}

  get isOpen(): boolean {
    return this.layer !== null;
  }

  // ---------------------------------------------------------------- hooks

  onEvents(events: GameEvent[]): void {
    for (const ev of events) {
      if (ev.type === 'endingOffered') {
        this.deferred = false;
        haptic('heavy');
        // Let the quest collection toast land first.
        window.setTimeout(() => this.openWhenClear(), 600);
      }
    }
  }

  /** Open the choice once no other pop-up is showing (checks for up to two minutes, then waits for the HUD chip). */
  private openWhenClear(tries = 0): void {
    if (this.isOpen || this.deferred || !endingChoiceOpen(this.host.game.state)) return;
    if (document.querySelector('.modal-backdrop')) {
      if (tries < 120) window.setTimeout(() => this.openWhenClear(tries + 1), 1000);
      return;
    }
    this.openChoice();
  }

  /** HUD chip while the choice is waiting. */
  hudChip(): HTMLElement | null {
    if (!endingChoiceOpen(this.host.game.state)) return null;
    return h(
      'button',
      { class: 'stat-chip chip-button end-chip glow', title: 'The Freeholder is knocking: choose how it ends', 'aria-label': 'Choose how it ends', onclick: () => this.openChoice() },
      '✦ ',
      h('b', {}, 'Knock, knock'),
    );
  }

  /** The ending title under the homestead name, if one is worn. */
  hudTitle(): HTMLElement | null {
    const t = endingTitle(this.host.game.state);
    return t ? h('span', { class: 'end-hud-title', title: `Title from an ending: ${t}` }, t) : null;
  }

  networkLine(def: QuestDef | undefined): HTMLElement | null {
    return networkLine(this.host.game, def);
  }

  networkChip(def: QuestDef): HTMLElement | null {
    return networkChip(this.host.game, def);
  }

  /** Goals: the endings reached (replay, wear the title) and the ones still out there. */
  goalsSection(): HTMLElement | null {
    const { state, content } = this.host.game;
    const reachedAny = Object.keys(state.story?.endings ?? {}).length > 0;
    if (!reachedAny && state.legacy.cycle < 4 && !state.questsDone.includes('act3_finale')) return null;
    const opts = endingOptions(state, content);
    const rows = opts.map((o) => this.goalsRow(o));
    return h(
      'div',
      { class: 'end-goals' },
      h('h3', { class: 'group' }, '✦ Endings', h('span', { class: 'muted small' }, ` ${opts.filter((o) => o.reached).length}/${opts.length}`)),
      endingChoiceOpen(state) ? h('button', { class: 'primary end-goals-choose', onclick: () => this.openChoice() }, '✦ Choose how it ends') : null,
      ...rows,
    );
  }

  private goalsRow(o: EndingOption): HTMLElement {
    const { state } = this.host.game;
    const rec = state.story.endings[o.def.id];
    const wearing = state.story.title === o.def.reward.title && !!rec;
    if (!rec) {
      return h(
        'div',
        { class: `list-item end-goal locked${o.def.true ? ' true' : ''}` },
        h('div', { class: 'row', style: 'margin:0' }, h('b', {}, `${o.def.true ? '★ ' : ''}${o.def.name}`), h('span', { class: 'muted small' }, 'Not reached')),
        h('div', { class: 'muted small' }, o.def.true ? 'The true ending. It asks a lot of the whole network:' : o.def.choice),
        o.def.true ? this.conditionList(o) : null,
      );
    }
    return h(
      'div',
      { class: `list-item end-goal${o.def.true ? ' true' : ''}` },
      h('div', { class: 'row', style: 'margin:0' }, h('b', {}, `${o.def.true ? '★ ' : '✓ '}${o.def.name}`), h('span', { class: 'muted small' }, `Homestead ${rec.firstHomestead}${rec.count > 1 ? ` · ×${rec.count}` : ''}`)),
      h('div', { class: 'muted small' }, `Title: ${o.def.reward.title} · ${o.def.reward.text}`),
      h(
        'div',
        { class: 'row end-goal-actions' },
        h('button', { onclick: () => this.replay(o.def.id) }, '▶ Replay'),
        h(
          'button',
          {
            disabled: wearing,
            onclick: () => {
              this.host.game.run({ type: 'setEndingTitle', endingId: o.def.id });
              this.host.refreshPanel();
            },
          },
          wearing ? 'Wearing the title' : 'Wear the title',
        ),
        wearing
          ? h(
              'button',
              {
                onclick: () => {
                  this.host.game.run({ type: 'setEndingTitle', endingId: null });
                  this.host.refreshPanel();
                },
              },
              'Take it off',
            )
          : null,
      ),
    );
  }

  private conditionList(o: EndingOption): HTMLElement {
    return h(
      'ul',
      { class: 'end-conds' },
      ...o.conditions.map((c) =>
        h(
          'li',
          { class: c.done ? 'done' : '' },
          h('span', { class: 'end-cond-mark', 'aria-hidden': 'true' }, c.done ? '✓' : '✗'),
          h('span', {}, h('b', {}, c.label), h('span', { class: 'muted small' }, ` ${Math.min(c.have, c.need)}/${c.need}`), c.done ? null : h('span', { class: 'end-cond-hint' }, c.hint)),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- the choice

  /** Open the ending choice (only while the finale is won and nothing is chosen). */
  openChoice(): void {
    const { state, content } = this.host.game;
    if (!endingChoiceOpen(state) || this.isOpen) return;
    const opts = endingOptions(state, content);
    const cards = opts.map((o) => this.choiceCard(o));
    const view = h(
      'div',
      { class: 'end-layer end-choice', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Choose how it ends' },
      h(
        'div',
        { class: 'end-choice-inner' },
        h('div', { class: 'end-kicker' }, 'Act 4 · Rent Day'),
        h('h1', { class: 'end-title' }, 'The Freeholder is knocking'),
        h('div', { class: 'end-halcy' }, halcyFace('worried'), h('p', {}, "It's knocking, Warden, three times, on the inside of the wall. Whatever we answer, every homestead in the Charter will hear it. How shall we answer?")),
        opts.some((o) => o.def.true && o.locked) ? h('p', { class: 'end-true-hint' }, '★ There is another way to answer. The last card shows what it takes.') : null,
        h('div', { class: 'end-cards' }, ...cards),
        h(
          'div',
          { class: 'end-choice-foot' },
          h('p', { class: 'muted small' }, 'Each homestead answers once. Later homesteads can answer again at a Rent Review, so every ending stays reachable.'),
          h('button', { class: 'end-later', onclick: () => this.deferChoice() }, 'Not yet'),
        ),
      ),
    );
    this.show(view, () => {
      this.deferChoice();
      return true;
    });
  }

  private deferChoice(): void {
    this.deferred = true;
    this.close();
    this.host.toast('The knocking waits. Choose from the ✦ chip, or Goals, whenever you are ready.');
  }

  private choiceCard(o: EndingOption): HTMLElement {
    const d = o.def;
    const locked = o.locked !== null;
    return h(
      'div',
      { class: `end-card${d.true ? ' true' : ''}${locked ? ' locked' : ''}` },
      h('div', { class: 'end-card-head' }, h('b', {}, `${d.true ? '★ ' : ''}${d.name}`), o.reached ? h('span', { class: 'end-reached' }, 'Reached before') : d.true ? h('span', { class: 'end-reached true' }, 'True ending') : null),
      h('p', {}, d.choice),
      h('p', { class: 'end-quote' }, halcyFace(d.true ? 'smile' : 'talk'), h('span', {}, `“${d.halcy}”`)),
      d.true ? this.conditionList(o) : null,
      h('div', { class: 'end-reward muted small' }, `Reward: ${o.reached ? '' : `+${d.reward.legacy} Legacy · `}the title “${d.reward.title}” · ${d.reward.text}`),
      h(
        'button',
        { class: `primary end-pick${d.true ? ' gold' : ''}`, disabled: locked, title: locked ? (o.locked ?? '') : '', onclick: () => this.confirmPick(d) },
        locked ? `🔒 ${d.kicker}` : d.kicker,
      ),
    );
  }

  private confirmPick(d: EndingDef): void {
    ask(
      {
        title: d.name,
        text: `${d.choice} This homestead's answer is final; the game carries on afterwards.`,
        ok: d.kicker,
      },
      () => {
        const res = this.host.game.run({ type: 'chooseEnding', endingId: d.id });
        if (!res.ok) {
          this.host.toast(res.reason, 'bad');
          return;
        }
        haptic('success');
        this.close();
        this.playEpilogue(d.id, epilogue(this.host.game.state, this.host.game.content, d.id), false);
      },
    );
  }

  // ---------------------------------------------------------------- epilogue and credits

  /** Replay a reached ending's epilogue and credits. */
  replay(endingId: string): void {
    const slides = replayEpilogue(this.host.game.state, this.host.game.content, endingId);
    if (!slides) return;
    this.playEpilogue(endingId, slides, true);
  }

  /**
   * The closing slides, then the credits, then a card saying the game carries
   * on. Tap, Space, Enter or → go on; ← goes back; Skip (or back/Escape) jumps
   * to the credits, and again to the end.
   */
  playEpilogue(endingId: string, slides: Slide[], replay: boolean): void {
    const def = endingsContent(this.host.game.content).endings.find((e) => e.id === endingId);
    if (!def) return;
    this.close();
    let i = 0;
    let stage: 'slides' | 'credits' | 'end' = slides.length ? 'slides' : 'credits';
    const stageEl = h('div', { class: 'epi-stage' });
    const count = h('span', { class: 'epi-count' });
    const back = h('button', { class: 'epi-btn', 'aria-label': 'Previous slide', onclick: (e: Event) => (e.stopPropagation(), prev()) }, '‹');
    const next = h('button', { class: 'epi-btn primary', 'aria-label': 'Next', onclick: (e: Event) => (e.stopPropagation(), advance()) }, '›');
    const skip = h('button', { class: 'epi-skip', onclick: (e: Event) => (e.stopPropagation(), skipAhead()) }, 'Skip');
    const bar = h('div', { class: 'epi-bar' }, back, count, next);
    const view = h(
      'div',
      { class: `end-layer epi epi-${endingId}${def.true ? ' epi-true' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': `${def.name}: epilogue`, onclick: () => advance() },
      h('div', { class: 'epi-top' }, h('span', { class: 'epi-ending' }, `${def.true ? '★ ' : ''}${def.name}${replay ? ' · replay' : ''}`), skip),
      stageEl,
      bar,
    );

    const render = () => {
      bar.style.visibility = stage === 'slides' ? '' : 'hidden';
      if (stage === 'slides') {
        const s = slides[i] as Slide;
        count.textContent = `${i + 1} / ${slides.length}`;
        back.toggleAttribute('disabled', i === 0);
        stageEl.replaceChildren(
          h('div', { class: 'epi-slide', key: s.id }, ...this.slideArt(s), h('h2', { class: 'epi-title' }, s.title), h('p', { class: 'epi-text' }, s.text)),
        );
        skip.textContent = 'Skip';
      } else if (stage === 'credits') {
        skip.textContent = 'Skip';
        stageEl.replaceChildren(this.credits(() => finishCredits()));
      } else {
        skip.textContent = 'Close';
        stageEl.replaceChildren(this.endCard(def, replay, () => this.close()));
      }
    };
    const finishCredits = () => {
      if (stage !== 'credits') return;
      stage = 'end';
      render();
    };
    const advance = () => {
      if (stage === 'slides') {
        if (i < slides.length - 1) i++;
        else stage = 'credits';
        haptic('select');
        render();
      } else if (stage === 'credits') finishCredits();
    };
    const prev = () => {
      if (stage === 'slides' && i > 0) {
        i--;
        render();
      }
    };
    const skipAhead = () => {
      if (stage === 'slides') stage = 'credits';
      else if (stage === 'credits') stage = 'end';
      else {
        this.close();
        return;
      }
      render();
    };
    this.show(view, () => {
      skipAhead();
      return true;
    });
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (stage === 'end' && e.key !== 'ArrowRight') this.close();
        else advance();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
    render();
  }

  /**
   * A painted illustration when the art pipeline has one (art/raw/endings: `<slideId>.webp`,
   * else `scene_<art>.webp` for the shared scenes), over the drawn art as a fallback.
   */
  private slideArt(s: Slide): HTMLElement[] {
    const fallback = this.art(s.art);
    if (s.art?.startsWith('legend:') || s.art?.startsWith('faction:')) return [fallback];
    const tries = [`sprites/endings/${s.id}.webp`, ...(s.art && s.art !== 'halcy' ? [`sprites/endings/scene_${s.art}.webp`] : [])];
    let n = 0;
    const img = h('img', { class: 'epi-illus', alt: '' }) as HTMLImageElement;
    img.onerror = () => {
      n++;
      if (n < tries.length) img.src = tries[n] as string;
      else img.remove();
    };
    img.onload = () => fallback.remove();
    img.src = tries[0] as string;
    return [img, fallback];
  }

  private art(art: string | undefined): HTMLElement {
    const { content } = this.host.game;
    if (art?.startsWith('legend:')) {
      const def = legendDef(content, art.slice(7));
      if (def) return h('div', { class: 'epi-art legend' }, legendPortrait(def, 'large'));
    }
    if (art?.startsWith('faction:')) {
      const id = art.slice(8);
      return h(
        'div',
        { class: `epi-art faction f-${id}` },
        h('span', {}, FACTION_ICON[id] ?? '◆'),
        // The faction leader's portrait (art/raw/factions), if painted.
        h('img', { class: 'epi-face', src: `sprites/portraits/faction_${id}.webp`, alt: '', onerror: (e: Event) => (e.target as HTMLElement).remove() }),
      );
    }
    if (art === 'halcy') return h('div', { class: 'epi-art halcy' }, halcyFace('smile'));
    return h('div', { class: `epi-art glyph a-${art ?? 'end'}` }, h('span', {}, ART_GLYPH[art ?? 'end'] ?? '✦'));
  }

  private credits(done: () => void): HTMLElement {
    const c = endingsContent(this.host.game.content).credits;
    const roll = h(
      'div',
      { class: 'credits-roll' },
      h('div', { class: 'credits-logo' }, 'HOMESTEAD'),
      ...c.map((block) => h('div', { class: 'credits-block' }, h('h3', {}, block.heading), ...block.lines.map((l) => h('p', {}, l)))),
      h('div', { class: 'credits-halcy' }, halcyFace('wink')),
    );
    // The roll takes its time; when it's done (or tapped), the end card follows.
    roll.addEventListener('animationend', () => done());
    return h('div', { class: 'credits' }, roll);
  }

  private endCard(def: EndingDef, replay: boolean, close: () => void): HTMLElement {
    const rec = this.host.game.state.story.endings[def.id];
    const first = !replay && rec?.count === 1;
    return h(
      'div',
      { class: 'epi-end', onclick: (e: Event) => e.stopPropagation() },
      h('div', { class: 'end-kicker' }, def.true ? 'The true ending' : 'An ending'),
      h('h2', { class: 'epi-title' }, def.name),
      first
        ? h('div', { class: 'epi-rewards' }, h('p', {}, `+${def.reward.legacy} Legacy`), h('p', {}, `Title earned: “${def.reward.title}”`), h('p', { class: 'muted' }, def.reward.text))
        : h('p', { class: 'muted' }, `Title: “${def.reward.title}” · ${def.reward.text}`),
      h('p', {}, replay ? 'Replay any ending you have reached from Goals.' : 'The game carries on. Your homestead is still here, the Charter still takes new foundings, and later homesteads can hold a Rent Review to answer the knock another way.'),
      def.true ? null : h('p', { class: 'muted small' }, 'There is another way to answer. Goals → Endings shows what it takes.'),
      h('button', { class: 'primary epi-continue', onclick: () => close() }, replay ? 'Close' : 'Carry on'),
    );
  }

  // ---------------------------------------------------------------- layer

  private show(view: HTMLElement, onBackPress: () => boolean): void {
    this.close();
    const root = document.getElementById('ui') ?? document.body;
    root.append(view);
    this.layer = view;
    // A confirm asked from here sits on top: let the main back handler close that first.
    this.unBack = onBack(() => (document.querySelector('.confirm-backdrop') ? false : onBackPress()));
    document.body.classList.add('ending-open');
  }

  close(): void {
    this.layer?.remove();
    this.layer = null;
    this.unBack?.();
    this.unBack = null;
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = null;
    document.body.classList.remove('ending-open');
  }

  /** The choice was put off this session. */
  get isDeferred(): boolean {
    return this.deferred;
  }
}

/** Allies in display order (re-exported for the dev console). */
export const ENDING_ALLIES = ALLY_ORDER;

/** A line for network quests (party picker): what the outposts and allies would bring right now. */
export function networkLine(game: Game, def: QuestDef | undefined): HTMLElement | null {
  if (!def?.network) return null;
  const { state, content } = game;
  const p = networkPreview(state, content);
  const t = networkTuning(content);
  const allies = p.allies.map((id) => `${FACTION_ICON[id] ?? '◆'} ${factionDef(content, id)?.shortName ?? factionDef(content, id)?.name ?? id}`);
  const relay = p.relay
    ? `📡 ${p.relay} outpost${p.relay === 1 ? '' : 's'} relaying: +${p.medpatch} Med-Patch${p.medpatch === 1 ? '' : 'es'}, +${Math.round(p.damage * 100)}% damage`
    : '📡 No outposts yet: homesteads you leave behind relay for the party';
  const ally = allies.length ? `🤝 Allies: ${allies.join(', ')}` : '🤝 No allies yet: factions at Friendly or better send help';
  return h(
    'div',
    { class: 'end-network' },
    h('div', {}, relay),
    h('div', {}, ally),
    allies.length ? h('div', { class: 'muted small' }, p.allies.map((id) => `${FACTION_ICON[id] ?? '◆'} ${SUPPORT_TEXT[id] ?? 'helps'}`).join(' · '), ` · each every ${t.allyEvery}s in fights`) : null,
  );
}

/** A compact chip for network quest cards. */
export function networkChip(game: Game, def: QuestDef): HTMLElement | null {
  if (!def.network) return null;
  const p = networkPreview(game.state, game.content);
  return h('span', { class: 'loot-chip end-net-chip', title: 'Network quest: outposts relay and allied factions help' }, `📡 Network: ${p.relay} outpost${p.relay === 1 ? '' : 's'} · ${p.allies.length} all${p.allies.length === 1 ? 'y' : 'ies'}`);
}
