// M9 legendary residents on the client: the legend card (bio, HALCY notes,
// signature trait, where they are, their personal questline, Recall), the
// "Legends" section of the residents panel, a portrait drawn from their fixed
// looks, and the arrival and awakening modals. The sim side is
// src/sim/systems/legends.ts.

import { artFailed, artImg, artUrl } from './art';
import appearance from '../../content/appearance.json';
import {
  canRecallLegend,
  factionDef,
  legendDef,
  legendName,
  legendQuestline,
  legendResident,
  legendsContent,
  legendStatus,
  questContent,
  questDef,
  recallLegend,
  traitDef,
  type GameEvent,
  type LegendDef,
  type LegendStatus,
  type QuestDef,
  type StatKey,
} from '../../sim';
import type { Game } from '../game';
import { haptic } from '../platform';
import { fmt, h } from './dom';
import { halcyFace } from './halcy';
import type { ToastFn } from './toasts';

export interface LegendsHost {
  game: Game;
  modalHost: HTMLElement;
  toast: ToastFn;
  refreshPanel(): void;
  /** Open the residents panel on this resident. */
  showResident(id: number): void;
  /** Open the quests panel. */
  openQuests(): void;
}

const STAT_NAME: Record<StatKey, string> = { brawn: 'Brawn', sight: 'Sight', grit: 'Grit', charm: 'Charm', wits: 'Wits', knack: 'Knack', fortune: 'Fortune' };
const TIER_NAME = ['Hostile', 'Wary', 'Neutral', 'Friendly', 'Allied'];
const STATUS_TEXT: Record<LegendStatus, string> = {
  unknown: 'Not met yet',
  queued: 'On the way (waiting for room)',
  here: 'In this homestead',
  outpost: 'At an outpost',
  lost: 'Lost for good',
};

/** A small face drawn from the legend's fixed looks (skin, hair, suit in their best stat's colour). */
export function legendPortrait(def: LegendDef, size: 'small' | 'large' = 'small', silhouette = false): HTMLElement {
  const skin = appearance.skin[def.appearance.skin % appearance.skin.length] ?? '#efb892';
  const hair = appearance.hair[def.appearance.hair % appearance.hair.length] ?? '#3b3f52';
  const suit = (appearance.suit as Record<string, string>)[def.speciality] ?? appearance.suit.default;
  return h(
    'span',
    {
      class: `legend-portrait ${size}${silhouette ? ' silhouette' : ''} ${def.sex === 'f' ? 'f' : 'm'}`,
      style: `--skin:${skin};--hair:${hair};--suit:${suit}`,
      'aria-hidden': 'true',
    },
    h('i', { class: 'lp-suit' }),
    h('i', { class: 'lp-face' }),
    h('i', { class: 'lp-hair' }),
    // Painted portrait from the sprite pipeline (art/raw/legends); the drawn face stays underneath if it's missing.
    silhouette ? null : h('img', { class: 'lp-img', src: `sprites/portraits/legend_${def.id}.webp`, alt: '', onerror: (e: Event) => (e.target as HTMLElement).remove() }),
    silhouette ? unmetArt() : h('i', { class: 'lp-star' }, '★'),
  );
}

/** A legend not met yet: the painted silhouette (X6), or the drawn head with a "?" without it. */
function unmetArt(): HTMLElement {
  const q = () => h('i', { class: 'lp-q' }, '?');
  const src = artUrl('legends', 'unknown');
  return src && !artFailed(src) ? artImg(src, { cls: 'lp-img lp-unknown', alt: '', fallback: q }) : q();
}

export class LegendsUI {
  /** The residents panel's Legends strip, opened or folded by the player (null: open once someone is met). */
  /** Whether the Legends section in Residents is expanded; the player's choice is remembered (collapsed by default). */
  private sectionOpen: boolean = readOpen();

  constructor(private host: LegendsHost) {}

  private get game() {
    return this.host.game;
  }

  /** Where to look for a legend not met yet (vague on purpose). */
  sourceHint(def: LegendDef): string {
    const { content } = this.game;
    const s = def.source;
    switch (s.kind) {
      case 'faction': {
        const f = s.faction ? factionDef(content, s.faction) : undefined;
        return `Rides with ${f?.name ?? 'a faction'}. Reach ${TIER_NAME[s.tier ?? 4] ?? 'Allied'} standing with them.`;
      }
      case 'radio':
        return `A faint signal. Keep a Radio Studio staffed at population ${s.population ?? 50}+.`;
      case 'deep':
        return 'Somewhere down in the Deep. Keep digging and look around.';
      case 'crate':
        return 'Turns up in Legendary Supply Crates, sometimes.';
      case 'boss': {
        const e = s.enemy ? questContent(content).enemies[s.enemy] : undefined;
        return `Defeat ${e?.name ?? 'a certain boss'} on a quest.`;
      }
      case 'cache':
        return 'Buried in a treasure cache. Explorers find the maps.';
      case 'quest': {
        const q = this.rewardQuest(def.id);
        return q ? `Joins after the story quest "${q.title}".` : 'Joins through the story.';
      }
    }
  }

  private rewardQuest(id: string): QuestDef | undefined {
    const { content } = this.game;
    return questContent(content).quests.find((q) => q.rewards?.legend === id);
  }

  /** "1/2" personal quests done. */
  private questProgress(id: string): { done: number; of: number; quests: { def: QuestDef | undefined; id: string; done: boolean }[] } {
    const { state, content } = this.game;
    const line = legendQuestline(content, id);
    const quests = (line?.quests ?? []).map((qid) => ({ id: qid, def: questDef(content, qid), done: state.questsDone.includes(qid) }));
    return { done: quests.filter((q) => q.done).length, of: quests.length, quests };
  }

  /** The residents panel's "Legends" section: everyone met, then silhouettes for the rest. */
  section(): HTMLElement | null {
    const { state, content } = this.game;
    const all = legendsContent(content).legends;
    if (!all.length) return null;
    const met = all.filter((l) => legendStatus(state, l.id) !== 'unknown');
    const rows = all.map((l) => {
      const status = legendStatus(state, l.id);
      const known = status !== 'unknown';
      const r = legendResident(state, l.id);
      const where = !known ? 'Not met yet' : status === 'here' && r ? (r.dead ? '☠ Fallen' : r.waiting ? 'At the door' : r.quest !== null ? '⚔ On a quest' : r.expedition !== null ? '🧭 Glarelands' : `L${r.level}`) : STATUS_TEXT[status];
      return h(
        'button',
        {
          class: `legend-chip${known ? '' : ' unknown'} ${status}`,
          title: known ? `${legendName(l)}: ${l.title}` : 'A legend not met yet',
          'aria-label': known ? `${legendName(l)}, ${where}` : 'Legend not met yet',
          onclick: () => this.showCard(l.id),
        },
        legendPortrait(l, 'small', !known),
        h('span', { class: 'lc-text' }, h('b', {}, known ? `${l.firstName} ${l.lastName}` : '???'), h('span', { class: 'muted small' }, known ? where : l.title)),
      );
    });
    return h(
      'details',
      {
        class: 'legends-section',
        open: this.sectionOpen,
        ontoggle: (e: Event) => {
          const open = (e.currentTarget as HTMLDetailsElement).open;
          if (open === this.sectionOpen) return;
          this.sectionOpen = open;
          try {
            localStorage.setItem(OPEN_KEY, open ? '1' : '0');
          } catch {
            // Storage blocked: the choice lasts for this session only.
          }
        },
      },
      h('summary', {}, h('span', { class: 'legend-mark' }, '★'), ` Legends `, h('span', { class: 'muted small' }, `${met.length}/${all.length} met`)),
      h('div', { class: 'legend-grid' }, ...rows),
    );
  }

  /** The legend card, as a modal. */
  showCard(id: string): void {
    const def = legendDef(this.game.content, id);
    if (!def) return;
    this.render(def);
  }

  private render(def: LegendDef): void {
    const { state, content } = this.game;
    const close = () => this.host.modalHost.replaceChildren();
    const status = legendStatus(state, def.id);
    const known = status !== 'unknown';
    const r = legendResident(state, def.id);
    const awakened = !!r?.traits.includes(def.awakened);
    const trait = traitDef(content, awakened ? def.awakened : def.trait);
    const progress = this.questProgress(def.id);
    const recallWhy = status === 'outpost' ? canRecallLegend(state, content, def.id) : null;
    const cost = legendsContent(content).tuning.recallScrip;
    const body: (HTMLElement | null)[] = [];
    if (!known) {
      body.push(
        h('div', { class: 'legend-head' }, legendPortrait(def, 'large', true), h('div', {}, h('h2', {}, '??? '), h('div', { class: 'muted' }, def.title))),
        h('p', { class: 'halcy-quote' }, halcyFace('talk'), `HALCY: "I have a file on this one, Warden, but it is mostly redactions. ${this.sourceHint(def)}"`),
      );
    } else {
      body.push(
        h(
          'div',
          { class: 'legend-head' },
          legendPortrait(def, 'large'),
          h(
            'div',
            {},
            h('h2', {}, legendName(def)),
            h('div', { class: 'muted' }, `${def.title} · best at ${STAT_NAME[def.speciality]}`),
            h('span', { class: `status-pill legend-status ${status}` }, STATUS_TEXT[status]),
          ),
        ),
        h('p', { class: 'legend-bio' }, def.bio),
        trait
          ? h(
              'div',
              { class: `legend-trait${awakened ? ' awakened' : ''}` },
              h('div', { class: 'row', style: 'margin:0' }, h('b', {}, `★ ${trait.name}`), h('span', { class: 'muted small' }, awakened ? 'Awakened' : 'Signature trait')),
              h('div', { class: 'small' }, trait.summary),
              h('div', { class: 'muted small' }, trait.description),
            )
          : null,
        h('h3', { class: 'group' }, 'HALCY notes'),
        h('ul', { class: 'legend-notes' }, ...def.notes.map((n) => h('li', {}, n))),
        h('h3', { class: 'group' }, 'Personal questline ', h('span', { class: 'muted small' }, `${progress.done}/${progress.of}`)),
        h(
          'div',
          { class: 'legend-quests' },
          ...progress.quests.map((q) =>
            h('div', { class: `row small${q.done ? ' ok-text' : ''}`, style: 'margin:2px 0' }, h('span', {}, `${q.done ? '✓' : '○'} ${q.def?.title ?? q.id}`), h('span', { class: 'muted' }, q.def ? `Rec. L${q.def.level}` : '')),
          ),
          progress.done < progress.of ? h('div', { class: 'muted small' }, status === 'here' ? 'Their quests show in Quests while they are in the homestead.' : 'Their quests open once they are in the homestead.') : h('div', { class: 'muted small' }, 'Questline done: their signature trait has awakened.'),
        ),
      );
      if (status === 'outpost') {
        body.push(
          h('p', { class: 'muted small' }, `${def.firstName} stayed at an outpost when you founded this homestead. You can send for them.`),
          recallWhy && recallWhy !== `needs ${cost} scrip` ? h('div', { class: 'small short' }, `Can't recall: ${recallWhy}`) : null,
        );
      }
      if (status === 'lost') body.push(h('p', { class: 'muted small' }, `${def.firstName} fell in a Survival homestead. HALCY has filed the paperwork. It is very thin.`));
    }
    const actions: HTMLElement[] = [];
    if (status === 'outpost') {
      actions.push(
        h(
          'button',
          {
            class: 'primary',
            disabled: recallWhy !== null,
            title: recallWhy ?? '',
            onclick: () => {
              const why = recallLegend(state, content, def.id);
              this.game.flush();
              if (why) this.host.toast(why, 'bad');
              else {
                haptic('success');
                this.host.toast(`★ ${def.firstName} is on the way back. They'll be at the door.`, 'gold');
              }
              this.render(def);
              this.host.refreshPanel();
            },
          },
          `Recall (${fmt(cost)} scrip)`,
        ),
      );
    }
    if (r && status === 'here')
      actions.push(
        h(
          'button',
          {
            onclick: () => {
              close();
              this.host.showResident(r.id);
            },
          },
          r.waiting ? 'At the door' : 'Resident card',
        ),
      );
    if (status === 'here' && progress.done < progress.of)
      actions.push(
        h(
          'button',
          {
            onclick: () => {
              close();
              this.host.openQuests();
            },
          },
          '⚔ Quests',
        ),
      );
    actions.push(h('button', { class: status === 'outpost' ? '' : 'primary', onclick: close }, 'Close'));
    this.host.modalHost.replaceChildren(
      h(
        'div',
        { class: 'modal-backdrop', onclick: (e: Event) => e.target === e.currentTarget && close() },
        h('div', { class: 'modal legend-card' }, ...body, h('div', { class: 'row', style: 'justify-content:flex-end;flex-wrap:wrap;gap:6px;margin-top:12px' }, ...actions)),
      ),
    );
  }

  /** Big news: a modal when nothing else is up, otherwise just the toast. */
  private announce(title: string, def: LegendDef, text: string, residentId: number, awakened: boolean): void {
    const host = this.host.modalHost;
    if (host.childElementCount > 0 || this.game.flushingAway) return;
    const close = () => host.replaceChildren();
    const r = this.game.state.residents.find((x) => x.id === residentId);
    const trait = traitDef(this.game.content, awakened ? def.awakened : def.trait);
    host.replaceChildren(
      h(
        'div',
        { class: 'modal-backdrop', onclick: (e: Event) => e.target === e.currentTarget && close() },
        h(
          'div',
          { class: `modal legend-card legend-arrival${awakened ? ' awakened' : ''}` },
          h('div', { class: 'legend-banner' }, awakened ? 'LEGEND AWAKENED' : 'A LEGEND ARRIVES'),
          h('div', { class: 'legend-head' }, legendPortrait(def, 'large'), h('div', {}, h('h2', {}, title), h('div', { class: 'muted' }, def.title))),
          h('p', { class: 'halcy-quote' }, halcyFace(awakened ? 'wink' : 'smile'), text),
          trait ? h('div', { class: `legend-trait${awakened ? ' awakened' : ''}` }, h('b', {}, `★ ${trait.name}`), h('div', { class: 'small' }, trait.summary)) : null,
          h(
            'div',
            { class: 'row', style: 'justify-content:flex-end;flex-wrap:wrap;gap:6px;margin-top:12px' },
            h('button', { onclick: () => this.showCard(def.id) }, 'Legend card'),
            r?.waiting
              ? h(
                  'button',
                  {
                    class: 'primary',
                    onclick: () => {
                      const res = this.game.run({ type: 'admit', residentId });
                      if (!res.ok) this.host.toast(res.reason, 'bad');
                      else this.host.toast(`★ ${def.firstName} is in. Try not to make it weird.`, 'gold');
                      close();
                    },
                  },
                  'Let them in',
                )
              : h('button', { class: 'primary', onclick: close }, 'Splendid'),
          ),
        ),
      ),
    );
  }

  onEvents(events: GameEvent[]): void {
    const { content } = this.game;
    for (const ev of events) {
      if (ev.type === 'legendArrived') {
        const def = legendDef(content, ev.legendId);
        if (!def) continue;
        haptic('success');
        const back = ev.source === 'recall';
        this.host.toast(back ? `★ ${def.firstName} is back from the outpost and at the door.` : `★ Legendary resident: ${legendName(def)} is at the door!`, 'gold');
        if (!back) this.announce(legendName(def), def, `HALCY: "Warden, ${legendName(def)} is at the door. ${def.bio} I have prepared a welcome speech. It is eleven minutes long."`, ev.residentId, false);
      } else if (ev.type === 'legendAwakened') {
        const def = legendDef(content, ev.legendId);
        if (!def) continue;
        haptic('success');
        this.host.toast(`★ ${def.firstName}'s signature trait has awakened. Every stat +1.`, 'gold');
        this.announce(legendName(def), def, `HALCY: "${def.firstName} has finished their personal business. Their signature trait has awakened, and every stat went up. I would like it noted that I helped."`, ev.residentId, true);
      }
    }
  }
}

const OPEN_KEY = 'homestead.ui.legendsOpen';

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}
