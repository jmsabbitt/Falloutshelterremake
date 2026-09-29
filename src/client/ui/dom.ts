// Tiny DOM helper so the UI code stays readable without a framework.

import { iconize, plainIcons } from './art';

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;

/** Listeners added by h(), so morph() can swap them onto a kept element. */
const listeners = new WeakMap<Element, Record<string, (e: Event) => void>>();
/** Elements whose string children stay plain text. */
const TEXT_ONLY = new Set(['option', 'optgroup', 'select', 'textarea', 'title', 'style', 'script']);
const NO_ICONS = /(^|\s)(pick-box|rl-check|check|no-icons)(\s|$)/;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      const type = k.slice(2).toLowerCase();
      el.addEventListener(type, v);
      const map = listeners.get(el) ?? {};
      map[type] = v;
      listeners.set(el, map);
    } else if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (v === true) el.setAttribute(k, '');
    else if (k === 'title' || k === 'aria-label') el.setAttribute(k, plainIcons(String(v)));
    else el.setAttribute(k, String(v));
  }
  // String children get their emoji swapped for the painted icons (art.ts), except where
  // only text can go (form options) or a glyph is a drawn mark (tick boxes).
  const plain = TEXT_ONLY.has(tag) || NO_ICONS.test(el.className);
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (c instanceof Node) el.append(c);
    else if (typeof c === 'string' && !plain) el.append(...iconize(c));
    else el.append(String(c));
  }
  return el;
}


export function fmt(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return Math.floor(n).toLocaleString();
}

export function duration(seconds: number): string {
  if (!isFinite(seconds)) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/**
 * Make `target` look like `source` while keeping the existing nodes where the
 * tags match. Panels re-render every half second; replacing the DOM would swap
 * a button out between press and release (a lost tap) and reset hover and
 * scroll. Listeners recorded by h() are moved across, so handlers never go stale.
 */
export function morph(target: Node, source: Node): void {
  if (target.nodeType !== source.nodeType || target.nodeName !== source.nodeName) {
    target.parentNode?.replaceChild(source, target);
    return;
  }
  if (target.nodeType !== Node.ELEMENT_NODE) {
    if (target.nodeValue !== source.nodeValue) target.nodeValue = source.nodeValue;
    return;
  }
  const t = target as Element;
  const s = source as Element;
  for (const a of [...t.attributes]) if (!s.hasAttribute(a.name)) t.removeAttribute(a.name);
  for (const a of [...s.attributes]) if (t.getAttribute(a.name) !== a.value) t.setAttribute(a.name, a.value);
  // Form state lives in properties, not attributes.
  if (t instanceof HTMLButtonElement && s instanceof HTMLButtonElement) t.disabled = s.disabled;
  // A field the player isn't typing in follows the new value (a "Clear filters" empties the search box).
  if (t instanceof HTMLInputElement && s instanceof HTMLInputElement && t.value !== s.value && document.activeElement !== t) t.value = s.value;
  const oldOn = listeners.get(t) ?? {};
  const newOn = listeners.get(s) ?? {};
  for (const [type, fn] of Object.entries(oldOn)) if (newOn[type] !== fn) t.removeEventListener(type, fn);
  for (const [type, fn] of Object.entries(newOn)) if (oldOn[type] !== fn) t.addEventListener(type, fn);
  listeners.set(t, newOn);
  const tk = [...t.childNodes];
  const sk = [...s.childNodes];
  for (let i = 0; i < sk.length; i++) {
    const src = sk[i] as Node;
    const dst = tk[i];
    if (dst) morph(dst, src);
    else t.appendChild(src);
  }
  for (let i = sk.length; i < tk.length; i++) tk[i]?.remove();
}
