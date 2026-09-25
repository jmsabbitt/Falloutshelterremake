// The Threat Rating (GDD §7.2) on the HUD: a five-step gauge with its label,
// and a tap for the factors behind it. The sim side is src/sim/systems/threat.ts.

import { maulerStatus, type MaulerStatus, threatRating, type ThreatRating } from '../../sim';
import type { Game } from '../game';
import { h } from './dom';

const STEPS: ThreatRating['label'][] = ['Calm', 'Guarded', 'Elevated', 'High', 'Severe'];

export class ThreatUI {
  constructor(
    private game: Game,
    private modalHost: HTMLElement,
  ) {}

  hudChip(): HTMLElement {
    const t = threatRating(this.game.state, this.game.content);
    const level = STEPS.indexOf(t.label);
    const active = this.game.state.incidents.length;
    const m = maulerStatus(this.game.state, this.game.content);
    // M9: the Mauler meter rides along once the homestead is big enough to interest one.
    const meter = !m.dormant || m.meter > 0 || m.active;
    return h(
      'button',
      {
        class: `stat-chip chip-button threat-chip t${level}${active ? ' incident' : ''}`,
        title: `Threat: ${t.label} (${t.score}/100). ${t.factors.map((f) => `${f.label} ×${f.mult.toFixed(2)}`).join(', ')}${active ? `. ${active} incident${active === 1 ? '' : 's'} under way` : ''}${meter ? `. ${maulerLine(m)}` : ''}`,
        onclick: () => this.show(),
      },
      active ? h('span', { class: 'threat-alert', 'aria-label': 'Incident under way' }, '⚠') : null,
      h('span', { class: 'threat-gauge' }, ...STEPS.map((_, i) => h('i', { class: i <= level ? 'on' : '' }))),
      h('b', { class: 'threat-label' }, t.label),
      active ? h('span', { class: 'threat-label threat-now' }, ` · incident!`) : null,
      meter
        ? h(
            'span',
            { class: `mauler-mini${m.stirring ? ' stirring' : ''}${m.active ? ' active' : ''}`, 'aria-label': maulerLine(m) },
            h('span', { style: `width:${Math.round(Math.min(1, m.meter) * 100)}%` }),
          )
        : null,
    );
  }

  /** M9: the Mauler meter, what moves it, and what a full one means. */
  private maulerSection(): HTMLElement {
    const m = maulerStatus(this.game.state, this.game.content);
    const pct = Math.round(Math.min(1, m.meter) * 100);
    const stirAt = (this.game.content.balance.incidents as { mauler?: { stirringAt?: number } }).mauler?.stirringAt ?? 0.75;
    const rate = m.perHour * 100;
    const state = m.active ? 'A Mauler is here.' : m.dormant ? 'Dormant: the homestead is too small to interest one. The meter only falls.' : m.stirring ? 'Stirring: something big is paying attention.' : 'Quiet, for now.';
    return h(
      'div',
      { class: `mauler-box${m.stirring ? ' stirring' : ''}${m.active ? ' active' : ''}` },
      h('div', { class: 'row', style: 'margin:0' }, h('b', {}, '⚠ Mauler meter'), h('b', {}, `${pct}%`)),
      h('div', { class: 'mauler-bar' }, h('div', { style: `width:${pct}%` }), h('i', { style: `left:${Math.round(stirAt * 100)}%`, title: 'Stirring' })),
      h('div', { class: 'small' }, state),
      h(
        'p',
        { class: 'muted small', style: 'margin:4px 0 0' },
        `${m.dormant ? '' : `Wealth and radios move it ${rate >= 0 ? '+' : ''}${rate.toFixed(1)}% an hour, after its slow fall. `}Every trip through the door adds a little. When it fills, a Mauler comes: very tough, telegraphed, and it walks room to room. Defense research and staffed Watchtowers slow the rise.`,
      ),
    );
  }

  private show(): void {
    const { state, content } = this.game;
    const t = threatRating(state, content);
    const level = STEPS.indexOf(t.label);
    const close = () => this.modalHost.replaceChildren();
    // The same sums as the sim: the factors multiply, and a level-40 homestead with no defenses scores 100.
    const danger = t.factors.reduce((a, f) => a * f.mult, 1);
    const ceiling = 1 + content.balance.incidents.hpPerAvgLevel * 39;
    const incidents = state.incidents.map((i) => (content.balance.incidents.types as Record<string, { name: string }>)[i.type]?.name ?? i.type);
    this.modalHost.replaceChildren(
      h(
        'div',
        { class: 'modal-backdrop', onclick: (e: Event) => e.target === e.currentTarget && close() },
        h(
          'div',
          { class: 'modal threat-modal' },
          h('h2', {}, `Threat: ${t.label}`),
          incidents.length ? h('div', { class: 'threat-active' }, `⚠ Under way now: ${incidents.join(', ')}. Send residents into the room to deal with it.`) : null,
          h('div', { class: `threat-bar t${level}` }, h('div', { style: `width:${t.score}%` })),
          h('p', { class: 'muted small' }, `Score ${t.score}/100: how hard incidents hit here, compared with a level-40 homestead with no defenses (that one scores 100).`),
          h('div', { class: 'row threat-factor' }, h('span', {}, 'Base danger'), h('b', {}, '×1.00')),
          ...t.factors.map((f) =>
            h('div', { class: 'row threat-factor' }, h('span', {}, f.label), h('b', { class: f.mult > 1 ? 'short' : f.mult < 1 ? 'ok-text' : '' }, `×${f.mult.toFixed(2)}`)),
          ),
          h('div', { class: 'row threat-factor threat-total' }, h('span', {}, 'Danger now'), h('b', {}, `×${danger.toFixed(2)}`)),
          h(
            'p',
            { class: 'muted small threat-sum' },
            `1.00 × ${t.factors.map((f) => f.mult.toFixed(2)).join(' × ')} = ×${danger.toFixed(2)}. ` +
              `Score = (danger − 1) ÷ (${ceiling.toFixed(2)} − 1) × 100 = ${t.score}, where ×${ceiling.toFixed(2)} is a level-40 homestead.`,
          ),
          h('p', { class: 'muted small' }, 'Levelling up and digging deeper raise the stakes. Defense research and Deep Bracing bring them down.'),
          this.maulerSection(),
          h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:12px' }, h('button', { class: 'primary', onclick: close }, 'Got it')),
        ),
      ),
    );
  }
}

function maulerLine(m: MaulerStatus): string {
  if (m.active) return 'A Mauler is here';
  if (m.dormant) return `Mauler meter ${Math.round(m.meter * 100)}% (dormant)`;
  return `Mauler meter ${Math.round(m.meter * 100)}%${m.stirring ? ': stirring' : ''}`;
}
