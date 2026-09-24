// HALCY's portrait, shown beside her lines. The faces come from the sprite
// pipeline (art/raw/halcy); if they are missing the image just removes itself.

import { h } from './dom';

export type HalcyMood = 'smile' | 'talk' | 'worried' | 'wink';

export function halcyFace(mood: HalcyMood = 'talk'): HTMLImageElement {
  return h('img', {
    class: 'halcy-face',
    src: `sprites/portraits/halcy_${mood}.webp`,
    alt: '',
    onerror: (e: Event) => (e.target as HTMLElement).remove(),
  });
}
