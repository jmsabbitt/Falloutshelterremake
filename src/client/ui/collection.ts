// M9 Collection Log (GDD §15): everything the homestead line has ever had,
// by category, with locked silhouettes, percentages and the milestone crates;
// and the Warden's Seal block for the Goals panel (progress, what is still
// missing, the title). The sim side is src/sim/systems/collection.ts and the
// Seal half of src/sim/systems/achievements.ts.

import {
  COLLECTION_CATEGORIES,
  collectionEntries,
  collectionProgress,
  legendDef,
  legendsContent,
  sealProgress,
  wardenTitle,
  type CollectionCategory,
  type CollectionEntry,
} from '../../sim';
import type { Game } from '../game';
import { h } from './dom';
import { itemIcon } from './icons';
import { legendPortrait } from './legends';

export interface CollectionHost {
  game: Game;
  /** Open a legend's card. */
  showLegend(id: string): void;
  openCollection(): void;
}

const LABEL: Record<CollectionCategory, string> = { items: 'Items', residents: 'Legends', creatures: 'Creatures', rooms: 'Rooms', regions: 'Regions' };
const ICON: Record<CollectionCategory, string> = { items: '🎒', residents: '★', creatures: '🐾', rooms: '▦', regions: '🗺' };
const CRATE: Record<string, string> = { standard: 'Supply Crate', rare: 'Rare Crate', legendary: 'Legendary Crate' };
/** How many locked entries the Seal panel names before "and N more". */
const MISSING_SHOWN = 12;

export class CollectionUI {
  tab: CollectionCategory = 'items';

  constructor(private host: CollectionHost) {}

  private get game() {
    return this.host.game;
  }

  panel(): HTMLElement {
    const { state, content } = this.game;
    const p = collectionProgress(state, content);
    const cfg = legendsContent(content).collection;
    const paid = state.stats['collection.milestone'] ?? 0;
    const tabs = h(
      'div',
      { class: 'tabs collection-tabs', role: 'tablist' },
      ...COLLECTION_CATEGORIES.map((c) => {
        const t = p.categories[c];
        const pct = t.of ? Math.floor((100 * t.have) / t.of) : 0;
        return h(
          'button',
          {
            class: `${this.tab === c ? 'active' : ''}${t.of && t.have >= t.of ? ' complete' : ''}`,
            role: 'tab',
            'aria-selected': this.tab === c ? 'true' : 'false',
            onclick: () => {
              this.tab = c;
              this.host.openCollection();
            },
          },
          `${ICON[c]} ${LABEL[c]}`,
          h('span', { class: 'n' }, `${pct}%`),
        );
      }),
    );
    const milestones = h(
      'div',
      { class: 'cl-milestones' },
      ...cfg.milestones.map((m) =>
        h(
          'span',
          { class: `cl-mile${paid >= m.percent ? ' paid' : p.percent >= m.percent ? ' due' : ''}`, title: `${m.percent}%: ${CRATE[m.crate] ?? m.crate}${paid >= m.percent ? ' (paid)' : ''}` },
          h('b', {}, `${m.percent}%`),
          ` 📦 ${m.crate === 'standard' ? 'Supply' : m.crate === 'rare' ? 'Rare' : 'Legendary'}`,
          paid >= m.percent ? ' ✓' : '',
        ),
      ),
    );
    const cat = p.categories[this.tab];
    const entries = collectionEntries(state, content, this.tab);
    const done = !!state.stats[`collection.complete.${this.tab}`];
    return h(
      'div',
      { class: 'body collection-body' },
      h('div', { class: 'row' }, h('b', {}, `${p.total.have} / ${p.total.of} logged`), h('b', { class: 'cl-pct' }, `${p.percent}%`)),
      h('div', { class: 'progress', style: 'margin-bottom:6px' }, h('div', { style: `width:${p.percent}%;background:var(--legendary)` })),
      milestones,
      h('p', { class: 'muted small', style: 'margin:6px 0' }, `HALCY keeps a copy of everything, Warden. It carries over when you found a new homestead. Each category you complete pays a ${CRATE[cfg.categoryCrate] ?? 'crate'}.`),
      tabs,
      h(
        'div',
        { class: 'row', style: 'margin:8px 0 6px' },
        h('b', {}, `${LABEL[this.tab]} ${cat.have}/${cat.of}`),
        h('span', { class: done ? 'ok-text small' : 'muted small' }, done ? '✓ Complete' : `${cat.of - cat.have} to go`),
      ),
      h('div', { class: `cl-grid cl-${this.tab}` }, ...entries.map((e) => this.entry(e))),
    );
  }

  private entry(e: CollectionEntry): HTMLElement {
    const { content } = this.game;
    let art: HTMLElement;
    let onclick: (() => void) | undefined;
    switch (this.tab) {
      case 'items': {
        const d = content.items[e.id];
        art = d ? itemIcon(d.id, d.kind) : h('span', {}, '?');
        break;
      }
      case 'residents': {
        const d = legendDef(content, e.id);
        art = d ? legendPortrait(d, 'small', !e.have) : h('span', {}, '★');
        onclick = () => this.host.showLegend(e.id);
        break;
      }
      case 'creatures':
        art = h('span', { class: 'cl-glyph' }, e.id.startsWith('incident:') ? '⚠' : e.detail === 'boss' ? '☠' : '🐾');
        break;
      case 'rooms':
        art = h('span', { class: 'cl-glyph' }, '▦');
        break;
      case 'regions':
        art = h('span', { class: 'cl-glyph' }, '🗺');
        break;
    }
    const rarity = this.tab === 'items' ? (content.items[e.id]?.rarity ?? 'common') : '';
    return h(
      onclick ? 'button' : 'div',
      {
        class: `cl-entry${e.have ? ' have' : ' locked'}${rarity ? ` r-${rarity}` : ''}`,
        title: e.have ? `${e.name} · ${e.detail}` : `Not logged yet · ${e.detail}`,
        onclick,
      },
      h('span', { class: 'cl-art' }, art),
      h('span', { class: 'cl-text' }, h('b', {}, e.have ? e.name : '???'), h('span', { class: 'muted small' }, e.detail)),
    );
  }

  /** The Warden's Seal block at the top of Goals. */
  sealSection(): HTMLElement {
    const { state, content } = this.game;
    const s = sealProgress(state, content);
    const title = wardenTitle(state, content);
    const pct = s.of ? Math.floor((100 * s.have) / s.of) : 0;
    const names = s.missing.map((id) => {
      const a = content.achievements.find((x) => x.id === id);
      return a ? (a.hidden ? '??? (hidden)' : a.name) : id;
    });
    const hiddenLeft = names.filter((n) => n.startsWith('???')).length;
    const shown = names.filter((n) => !n.startsWith('???')).slice(0, MISSING_SHOWN);
    const more = names.length - shown.length - hiddenLeft;
    const cp = collectionProgress(state, content);
    return h(
      'div',
      { class: `list-item seal-card${title ? ' earned' : ''}` },
      h('div', { class: 'seal-medal', 'aria-hidden': 'true' }, '✪'),
      h(
        'div',
        { style: 'flex:1;min-width:0' },
        h('div', { class: 'row', style: 'margin:0' }, h('b', {}, "The Warden's Seal"), h('span', { class: 'muted small' }, `${s.have}/${s.of} · ${pct}%`)),
        title
          ? h('div', { class: 'small' }, `Earned. Your title: `, h('b', { class: 'seal-title' }, title), '. HALCY had a monument put up by the door.')
          : h('div', { class: 'muted small' }, 'Earn every other achievement (hidden ones count, optional ones do not). HALCY puts up a monument by the door.'),
        title ? null : h('div', { class: 'progress' }, h('div', { style: `width:${pct}%;background:var(--legendary)` })),
        !title && names.length
          ? h(
              'details',
              { class: 'seal-missing' },
              h('summary', { class: 'small' }, `Still missing ${names.length}`),
              h(
                'div',
                { class: 'muted small' },
                [...shown, ...(more > 0 ? [`and ${more} more`] : []), ...(hiddenLeft ? [`${hiddenLeft} hidden`] : [])].join(' · '),
              ),
            )
          : null,
        h(
          'div',
          { class: 'row', style: 'justify-content:flex-start;margin:6px 0 0' },
          h('button', { class: 'close', onclick: () => this.host.openCollection() }, `📖 Collection Log ${cp.percent}%`),
        ),
      ),
    );
  }
}
