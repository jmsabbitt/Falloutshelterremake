// The toast stack: at most three short notices at a time (the notification
// centre keeps the full history). Warnings outrank ordinary notices, which
// outrank low-priority ones (achievements, level-ups), so a burst of good news
// never pushes a shortage or a death off the screen. Only notices that ask for
// it fold together; assignment and command results always get their own line.

import { h } from './dom';

export type ToastKind = 'good' | 'bad' | 'gold';

export interface ToastOptions {
  /**
   * Fold repeats into one line ("… (+2 more)"). `true` folds notices of the
   * same shape (the same text but for a leading name and the numbers); a
   * string folds everything sharing that key, like every achievement.
   */
  fold?: boolean | string;
  /** Low priority: the first to go when the stack is full. */
  low?: boolean;
}

/** Signature the UI modules use to raise a toast. */
export type ToastFn = (text: string, kind?: ToastKind, opts?: ToastOptions) => void;

const MAX = 3;
/** Phones and short landscape screens show fewer at once, so they don't bury the vault. */
/** With a panel open, two at most on every screen: the panel already takes much of the view. */
const maxToasts = (): number => (window.innerWidth < 600 || window.innerHeight < 500 || document.querySelector('.panel-host > .panel:not(.sheet-bar)') ? 2 : MAX);
const LIFE = { low: 3500, normal: 4200, warn: 6500 };

interface Open {
  el: HTMLElement;
  first: string;
  extra: number;
  timer: ReturnType<typeof setTimeout>;
}

export class Toasts {
  /** Open folding groups by key. */
  private groups = new Map<string, Open>();

  constructor(readonly el: HTMLElement) {}

  show(text: string, kind?: ToastKind, opts: ToastOptions = {}): void {
    const prio = kind === 'bad' ? 2 : opts.low ? 0 : 1;
    const life = prio === 2 ? LIFE.warn : prio === 0 ? LIFE.low : LIFE.normal;
    const key = opts.fold ? foldKey(text, kind, opts.fold) : null;
    const open = key ? this.groups.get(key) : undefined;
    if (key && open && open.el.isConnected) {
      open.extra++;
      open.el.textContent = `${open.first} (+${open.extra} more)`;
      clearTimeout(open.timer);
      open.timer = setTimeout(() => this.drop(key, open.el), life);
      this.el.prepend(open.el);
      return;
    }
    const el = h('div', { class: `toast ${kind ?? ''}${prio === 0 ? ' low' : ''}`, 'data-prio': prio }, text);
    this.el.prepend(el);
    if (key) this.groups.set(key, { el, first: text, extra: 0, timer: setTimeout(() => this.drop(key, el), life) });
    else setTimeout(() => el.remove(), life);
    this.trim();
  }

  /** Over the limit: drop the lowest priority first, the oldest of those first. */
  private trim(): void {
    while (this.el.children.length > maxToasts()) {
      const kids = [...this.el.children] as HTMLElement[];
      let victim = kids[kids.length - 1]!;
      for (let i = kids.length - 1; i >= 0; i--) {
        const k = kids[i]!;
        if (Number(k.dataset.prio ?? 1) < Number(victim.dataset.prio ?? 1)) victim = k;
      }
      victim.remove();
    }
  }

  private drop(key: string, el: HTMLElement): void {
    el.remove();
    if (this.groups.get(key)?.el === el) this.groups.delete(key);
  }
}

/** "Dot is all grown up…" and "Clyde is all grown up…" share a shape. */
function foldKey(text: string, kind: ToastKind | undefined, fold: true | string): string {
  if (typeof fold === 'string') return `${kind ?? ''}|#${fold}`;
  return `${kind ?? ''}|${text.replace(/^[A-Z][\w'’-]*( [A-Z][\w'’-]*)?\s/, '').replace(/[\d,.]+/g, '#')}`;
}
