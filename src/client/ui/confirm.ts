// Styled stand-ins for the browser's confirm() and prompt(). They sit on their
// own layer above every other modal (the explore modal, the Found flow), so
// asking a question never throws away the modal it was asked from.

import { h } from './dom';

export interface ConfirmOptions {
  title: string;
  text?: string | HTMLElement;
  /** Label of the button that says yes. */
  ok?: string;
  cancel?: string;
  /** Red confirm button, for things that can't be undone. */
  danger?: boolean;
}

function layer(): HTMLElement {
  return document.getElementById('ui') ?? document.body;
}

/** Ask a yes/no question; resolves true on the confirm button. Esc, the backdrop or Cancel say no. */
export function confirmModal(o: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (yes: boolean) => {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      resolve(yes);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        finish(true);
      }
    };
    const okBtn = h('button', { class: o.danger ? 'danger' : 'primary', onclick: () => finish(true) }, o.ok ?? 'OK');
    const backdrop = h(
      'div',
      { class: 'modal-backdrop confirm-backdrop', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': o.title, onclick: (e: Event) => e.target === e.currentTarget && finish(false) },
      h(
        'div',
        { class: 'modal confirm-modal' },
        h('h2', {}, o.title),
        o.text ? (typeof o.text === 'string' ? h('p', { class: 'confirm-text' }, o.text) : o.text) : null,
        h('div', { class: 'row confirm-buttons' }, h('button', { onclick: () => finish(false) }, o.cancel ?? 'Cancel'), okBtn),
      ),
    );
    layer().append(backdrop);
    window.addEventListener('keydown', onKey, true);
    okBtn.focus({ preventScroll: true });
  });
}

/** Run `then` only if the player says yes. For onclick handlers. */
export function ask(o: ConfirmOptions, then: () => void): void {
  void confirmModal(o).then((yes) => yes && then());
}

/** Ask for a line of text; resolves null on Cancel. */
export function promptModal(o: { title: string; label?: string; value?: string; ok?: string; maxLength?: number }): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: string | null) => {
      if (done) return;
      done = true;
      backdrop.remove();
      resolve(v);
    };
    const input = h('input', { type: 'text', class: 'rl-search confirm-input', value: o.value ?? '', maxlength: o.maxLength ?? 40, 'aria-label': o.label ?? o.title }) as HTMLInputElement;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(input.value);
      else if (e.key === 'Escape') finish(null);
      e.stopPropagation();
    });
    const backdrop = h(
      'div',
      { class: 'modal-backdrop confirm-backdrop', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title, onclick: (e: Event) => e.target === e.currentTarget && finish(null) },
      h(
        'div',
        { class: 'modal confirm-modal' },
        h('h2', {}, o.title),
        o.label ? h('p', { class: 'confirm-text muted' }, o.label) : null,
        input,
        h('div', { class: 'row confirm-buttons' }, h('button', { onclick: () => finish(null) }, 'Cancel'), h('button', { class: 'primary', onclick: () => finish(input.value) }, o.ok ?? 'Save')),
      ),
    );
    layer().append(backdrop);
    input.focus();
    input.select();
  });
}
