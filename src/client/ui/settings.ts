// M8 settings (in the ☰ menu): notifications by group, quiet hours, haptics,
// reduced motion, battery saver, and how the save is stored. The panel keeps
// itself up to date (the menu isn't re-rendered on a timer), so every change
// re-renders just this section.

import { SAVE_VERSION } from '../../sim';
import type { Game } from '../game';
import { haptic, isNative, platformName } from '../platform';
import { clearNotifications, enableNotifications, notifyPermission, type NotifyPermission } from '../platform/notifications';
import { getSettings, NOTIFY_GROUPS, updateSettings, type Settings } from '../platform/settings';
import { saveStats, storageErrors } from '../storage';
import { h } from './dom';

declare const __APP_VERSION__: string;

const hh = (n: number) => `${String(n).padStart(2, '0')}:00`;
const kb = (chars: number) => `${Math.max(1, Math.round((chars * 2) / 1024))} KB`;

function toggleRow(label: string, note: string | null, on: boolean, flip: () => void, disabled = false): HTMLElement {
  return h(
    'div',
    {
      class: `list-item pick-row settings-row${on ? ' selected' : ''}${disabled ? ' locked' : ''}`,
      role: 'switch',
      'aria-checked': on ? 'true' : 'false',
      'aria-disabled': disabled ? 'true' : undefined,
      tabindex: 0,
      onclick: () => !disabled && flip(),
      onkeydown: (e: Event) => {
        const k = (e as KeyboardEvent).key;
        if (!disabled && (k === 'Enter' || k === ' ')) (e.preventDefault(), flip());
      },
    },
    h('div', { class: 'row', style: 'margin:0' }, h('b', {}, h('span', { class: 'pick-box' }, on ? '✓' : ''), ` ${label}`), h('span', { class: 'muted small' }, on ? 'On' : 'Off')),
    note ? h('div', { class: 'muted small' }, note) : null,
  );
}

function stepper(label: string, value: number, set: (n: number) => void, disabled: boolean): HTMLElement {
  return h(
    'div',
    { class: 'row stepper-row' },
    h('span', {}, label),
    h(
      'span',
      { class: 'stepper' },
      h('button', { disabled, 'aria-label': `${label} earlier`, onclick: () => set((value + 23) % 24) }, '−'),
      h('b', {}, hh(value)),
      h('button', { disabled, 'aria-label': `${label} later`, onclick: () => set((value + 1) % 24) }, '+'),
    ),
  );
}

const PERMISSION_NOTE: Record<NotifyPermission, string | null> = {
  granted: null,
  prompt: 'Off until you allow it. Tap and HALCY will ask the phone.',
  denied: 'Blocked in your device settings. HALCY can knock, but not that loudly.',
  unsupported: 'This browser has no notifications. HALCY will wait for you to look.',
};

/** The settings section for the ☰ menu. */
export function settingsPanel(game: Game): HTMLElement {
  const root = h('div', { class: 'settings' });
  let permission: NotifyPermission = 'prompt';

  const set = (patch: Partial<Settings>) => {
    updateSettings(patch);
    render();
  };

  const render = () => {
    const s = getSettings();
    const stats = saveStats();
    const notifyOn = s.notifications && permission === 'granted';
    const q = s.quietHours;
    root.replaceChildren(
      h('h3', { class: 'group' }, 'Notifications'),
      toggleRow(
        'Pings while away',
        PERMISSION_NOTE[permission] ?? (isNative() ? 'Explorers home, caravans back, rooms full.' : 'Only while this tab is open in the background.'),
        notifyOn,
        () => {
          if (notifyOn) {
            set({ notifications: false });
            void clearNotifications();
            return;
          }
          void enableNotifications().then((p) => {
            permission = p;
            render();
          });
        },
        permission === 'unsupported',
      ),
      ...NOTIFY_GROUPS.map((g) => toggleRow(g.label, g.note, notifyOn && s.notify[g.id], () => set({ notify: { ...s.notify, [g.id]: !s.notify[g.id] } }), !notifyOn)),
      toggleRow('Quiet hours', q.enabled ? `Nothing between ${hh(q.start)} and ${hh(q.end)}. Anything due is held until ${hh(q.end)}.` : 'Pings at any hour.', q.enabled, () => set({ quietHours: { ...q, enabled: !q.enabled } }), !notifyOn),
      stepper('From', q.start, (n) => set({ quietHours: { ...q, start: n } }), !notifyOn || !q.enabled),
      stepper('Until', q.end, (n) => set({ quietHours: { ...q, end: n } }), !notifyOn || !q.enabled),

      h('h3', { class: 'group' }, 'Comfort'),
      toggleRow('Haptics', 'A small buzz on builds, drops and crits.', s.haptics, () => {
        set({ haptics: !s.haptics });
        haptic('select');
      }),
      toggleRow('Reduced motion', 'Fewer camera sweeps and bounces.', s.reducedMotion, () => set({ reducedMotion: !s.reducedMotion })),
      toggleRow('Battery saver', 'Caps the frame rate at 30 and idles lower.', s.batterySaver, () => set({ batterySaver: !s.batterySaver })),

      h('h3', { class: 'group' }, 'Storage'),
      h(
        'div',
        { class: 'muted small' },
        stats
          ? `Save: ${kb(stats.json)} of homestead, stored as ${kb(stats.stored)}${stats.compressed ? ' (compressed)' : ''}.`
          : 'Nothing saved yet.',
        ' ',
        isNative() ? 'Kept in app storage as well as the web view, so a cleared cache loses nothing.' : 'Kept in this browser; export a copy to be safe.',
        storageErrors() ? ` ${storageErrors()} backup write${storageErrors() === 1 ? '' : 's'} failed since launch.` : '',
      ),
      h('div', { class: 'muted small', style: 'margin-top:4px' }, `Homestead ${typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'} · save format v${SAVE_VERSION} · ${platformName()} · ${game.state.residents.filter((r) => !r.dead).length} residents`),
    );
  };

  render();
  void notifyPermission().then((p) => {
    permission = p;
    render();
  });
  return root;
}
