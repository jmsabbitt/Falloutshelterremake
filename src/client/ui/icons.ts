// Item and salvage icons from the sprite pipeline (art/raw/items, art/raw/salvage). Until an item has
// art, or if its image fails to load, the old emoji stands in.

import { h } from './dom';

export function itemIcon(defId: string, kind: 'weapon' | 'outfit', size: 'small' | 'large' = 'small'): HTMLElement {
  return artIcon(defId, kind === 'weapon' ? '🔫' : '🧥', size);
}

/** A salvage type's icon (same folder as items); nothing if it has no art. */
export function salvageIcon(id: string): HTMLElement {
  return artIcon(id, '', 'small');
}

function artIcon(defId: string, fallback: string, size: 'small' | 'large'): HTMLElement {
  return h('img', {
    class: `item-icon ${size}`,
    src: `sprites/items/${defId}.webp`,
    alt: '',
    onerror: (e: Event) => (e.target as HTMLElement).replaceWith(fallback),
  });
}
