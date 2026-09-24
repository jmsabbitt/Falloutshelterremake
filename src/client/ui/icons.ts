// Item icons from the sprite pipeline (art/raw/items_*). Until an item has
// art, or if its image fails to load, the old emoji stands in.

import { h } from './dom';

export function itemIcon(defId: string, kind: 'weapon' | 'outfit', size: 'small' | 'large' = 'small'): HTMLElement {
  const fallback = kind === 'weapon' ? '🔫' : '🧥';
  return h('img', {
    class: `item-icon ${size}`,
    src: `sprites/items/${defId}.webp`,
    alt: '',
    onerror: (e: Event) => (e.target as HTMLElement).replaceWith(fallback),
  });
}
