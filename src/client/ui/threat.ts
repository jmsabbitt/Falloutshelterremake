// The Threat Rating (GDD §7.2) on the HUD: a five-step gauge with its label,
// and a tap for the factors behind it. The sim side is src/sim/systems/threat.ts.

import { threatRating, type ThreatRating } from '../../sim';
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
    return h(
      'button',
      {
        class: `stat-chip chip-button threat-chip t${level}`,
        title: `Threat: ${t.label} (${t.score}/100). ${t.factors.map((f) => `${f.label} ×${f.mult.toFixed(2)}`).join(', ')}`,
        onclick: () => this.show(),
      },
      h('span', { class: 'threat-gauge' }, ...STEPS.map((_, i) => h('i', { class: i <= level ? 'on' : '' }))),
      h('b', { class: 'threat-label' }, t.label),
    );
  }

  private show(): void {
    const t = threatRating(this.game.state, this.game.content);
    const level = STEPS.indexOf(t.label);
    const close = () => this.modalHost.replaceChildren();
    this.modalHost.replaceChildren(
      h(
        'div',
        { class: 'modal-backdrop', onclick: (e: Event) => e.target === e.currentTarget && close() },
        h(
          'div',
          { class: 'modal threat-modal' },
          h('h2', {}, `Threat: ${t.label}`),
          h('div', { class: `threat-bar t${level}` }, h('div', { style: `width:${t.score}%` })),
          h('p', { class: 'muted small' }, `${t.score}/100. How hard incidents hit right now, against a veteran homestead with no defenses.`),
          ...t.factors.map((f) =>
            h('div', { class: 'row threat-factor' }, h('span', {}, f.label), h('b', { class: f.mult > 1 ? 'short' : f.mult < 1 ? 'ok-text' : '' }, `×${f.mult.toFixed(2)}`)),
          ),
          h('p', { class: 'muted small' }, 'Levelling up and digging deeper raise the stakes. Defense research and Deep Bracing bring them down.'),
          h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:12px' }, h('button', { class: 'primary', onclick: close }, 'Got it')),
        ),
      ),
    );
  }
}
