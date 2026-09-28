// Long flavour text, clamped to two lines with a "more" toggle. The open ones are remembered by key
// (the panels re-render twice a second), so a card the player expanded stays expanded.

import { h } from './dom';

type Child = Node | string | null | undefined | false;

/** Keys of the texts the player opened, shared by every panel. */
const opened = new Set<string>();

/** Short text is never clamped: it fits in two lines anyway. */
const SHORT = 110;

/**
 * `children` in a two-line box with a "more"/"less" button. `length` is the text's length (for
 * deciding whether a toggle is worth showing); `refresh` re-renders the panel after a toggle.
 */
export function clamped(key: string, length: number, refresh: () => void, cls: string, ...children: Child[]): HTMLElement {
  if (length <= SHORT) return h('div', { class: cls }, ...children);
  const open = opened.has(key);
  const toggle = (e: Event) => {
    e.stopPropagation();
    if (open) opened.delete(key);
    else opened.add(key);
    refresh();
  };
  // The whole text is the toggle (a big target without a line of its own); "more" marks it.
  return h(
    'div',
    {
      class: `clamp-wrap${open ? ' open' : ''}`,
      role: 'button',
      tabindex: 0,
      'aria-expanded': open ? 'true' : 'false',
      title: open ? 'Show less' : 'Show all',
      onclick: toggle,
      onkeydown: (e: Event) => {
        const k = (e as KeyboardEvent).key;
        if (k === 'Enter' || k === ' ') {
          e.preventDefault();
          toggle(e);
        }
      },
    },
    h('div', { class: `${cls} clamp${open ? '' : ' clamped'}` }, ...children),
    h('span', { class: 'clamp-more', 'aria-hidden': 'true' }, open ? 'less ▴' : 'more ▾'),
  );
}
