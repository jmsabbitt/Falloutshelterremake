// The homestead was opened in another tab. This tab has stopped playing and saving
// (Game.inAnotherTab), so it can't write its older copy over that tab's progress.
// The prompt can't be dismissed: the only ways on are "Play here" or closing the tab.

import type { Game } from '../game';
import { h } from './dom';

export function watchAnotherTab(game: Game, toast: (msg: string, kind?: 'bad') => void): void {
  let backdrop: HTMLElement | null = null;
  const show = (on: boolean) => {
    backdrop?.remove();
    backdrop = null;
    if (!on) return;
    const play = h(
      'button',
      {
        class: 'primary',
        onclick: () => {
          const res = game.playHere();
          if (!res.ok) toast(`Couldn't switch to this tab: ${res.reason}.`, 'bad');
        },
      },
      'Play here',
    );
    backdrop = h(
      'div',
      { class: 'modal-backdrop confirm-backdrop another-tab', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': 'Open in another tab' },
      h(
        'div',
        { class: 'modal confirm-modal' },
        h('h2', {}, 'Open in another tab'),
        h(
          'p',
          { class: 'confirm-text' },
          'This homestead is being played in another tab or window, so this one has paused and stopped saving. Play here to pick up where the other tab left off, or close this tab.',
        ),
        h('div', { class: 'row confirm-buttons' }, play),
      ),
    );
    (document.getElementById('ui') ?? document.body).append(backdrop);
    play.focus({ preventScroll: true });
  };
  game.onAnotherTab(show);
  if (game.inAnotherTab) show(true);
}
