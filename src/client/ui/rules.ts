// M9 rulesets and Survival in the client: the rules step of the Found flow
// (pick rulesets, see what locked ones need, a live Legacy multiplier and the
// Survival toggle), the rules summary used on the confirm step, the Legacy
// history and the Custom Game form, and the HUD hooks (the Survival skull and
// why revive is off). The sim side is src/sim/systems/rulesets.ts; see
// docs/design/M9-spec.md (stream D2).

import { rulesetLocked, rulesLegacyMult, survivalLocked, type Content, type GameState } from '../../sim';
import { rulesetDef, rulesetsContent, type RulesetDef, type RulesetModsDef } from '../../sim/systems/rulesets';
import { ask } from './confirm';
import { h } from './dom';
import './m9.css';

/** A choice of rules: rulesets.json ids and Survival. */
export interface RulesPick {
  rules: string[];
  survival: boolean;
}

export const NO_RULES: RulesPick = { rules: [], survival: false };

/** Each ruleset's painted icon (U6); art.ts falls back to the old emoji. */
const RULE_ICON: Record<string, string> = {
  famine: ':famine:',
  lean_times: ':lean_times:',
  brownout: ':brownout:',
  short_fuse: ':short_fuse:',
  no_radio: ':no_radio:',
  iron_door: ':iron_door:',
  endless_night: ':endless_night:',
  glass_sky: ':glass_sky:',
  skeleton_crew: ':skeleton_crew:',
};
export const SURVIVAL_ICON = '☠';

export function ruleIcon(id: string): string {
  return RULE_ICON[id] ?? ':rules:';
}

const RES: Record<string, string> = { power: 'Power', food: 'Food', water: 'Water', medpatch: 'Med-Patch', purge: 'Purge' };
const FLAG_TEXT: Record<string, string> = {
  noRadio: 'No radio or wanderer arrivals',
  endlessNight: 'The shift clock is stuck on night',
  glassSky: 'Taint storms topside, nearly always',
};

const pct = (m: number) => Math.round(Math.abs(m - 1) * 100);
const signed = (m: number) => `${m >= 1 ? '+' : '−'}${pct(m)}%`;
const titleCase = (id: string) => id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** What a ruleset does, in short plain words. Tone 'bad' is harder, 'good' easier. */
export function ruleEffects(def: RulesetDef): { text: string; tone: 'good' | 'bad' | '' }[] {
  const out: { text: string; tone: 'good' | 'bad' | '' }[] = [];
  const m: RulesetModsDef = def.mods ?? {};
  const per = (map: Partial<Record<string, number>> | undefined, what: string, higherIsGood: boolean) => {
    const groups = new Map<number, string[]>();
    for (const [k, v] of Object.entries(map ?? {})) if (v !== undefined && v !== 1) groups.set(v, [...(groups.get(v) ?? []), RES[k] ?? k]);
    for (const [v, names] of groups) {
      const list = names.length > 3 ? 'Everything' : names.join(', ');
      out.push({ text: `${list} ${what} ${signed(v)}`, tone: v > 1 === higherIsGood ? 'good' : 'bad' });
    }
  };
  per(m.production, 'output', true);
  per(m.consumption, 'use', false);
  per(m.storage, 'storage', true);
  if (m.incidentRate && m.incidentRate !== 1) out.push({ text: `Incidents ${pct(m.incidentRate)}% ${m.incidentRate > 1 ? 'more' : 'less'} often`, tone: m.incidentRate > 1 ? 'bad' : 'good' });
  if (m.raidWeight && m.raidWeight !== 1) out.push({ text: `Raids ×${m.raidWeight} as likely`, tone: m.raidWeight > 1 ? 'bad' : 'good' });
  if (m.doorHp && m.doorHp !== 1) out.push({ text: `Door ${signed(m.doorHp)} tougher`, tone: m.doorHp > 1 ? 'good' : 'bad' });
  if (m.scripIncome && m.scripIncome !== 1) out.push({ text: `Scrip income ${signed(m.scripIncome)}`, tone: m.scripIncome > 1 ? 'good' : 'bad' });
  if (m.explorerTaint && m.explorerTaint !== 1) out.push({ text: `Explorer taint ${signed(m.explorerTaint)}`, tone: m.explorerTaint > 1 ? 'bad' : 'good' });
  if (m.happiness?.value) {
    const except = m.happiness.exceptTraits?.length ? ` (not ${m.happiness.exceptTraits.map((t) => `${titleCase(t)}s`).join(', ')})` : '';
    out.push({ text: `Happiness ${m.happiness.value > 0 ? '+' : '−'}${Math.abs(m.happiness.value)}${except}`, tone: m.happiness.value > 0 ? 'good' : 'bad' });
  }
  if (m.populationCap !== undefined) out.push({ text: `At most ${m.populationCap} residents`, tone: 'bad' });
  for (const f of def.flags ?? []) out.push({ text: FLAG_TEXT[f] ?? titleCase(f), tone: 'bad' });
  return out;
}

/** The rules multiplier for a pick, e.g. 1.3 and 1.2 make 1.5 (as the sim adds them). */
export function pickLegacyMult(state: GameState, content: Content, pick: RulesPick): number {
  return rulesLegacyMult({ ...state, rules: { ids: pick.rules, survival: pick.survival } }, content);
}

export function fmtMult(m: number): string {
  return Number.isInteger(m) ? `${m}` : m.toFixed(2).replace(/0$/, '');
}

/** "Famine, Lean Times · Survival", or "Standard rules". */
export function rulesText(content: Content, pick: RulesPick): string {
  const names = pick.rules.map((id) => rulesetDef(content, id)?.name ?? id);
  if (pick.survival) names.push(rulesetsContent(content).survival.name);
  return names.length ? names.join(', ') : 'Standard rules';
}

/** The rules a state runs under, as a pick. */
export function rulesOf(state: GameState): RulesPick {
  return { rules: [...(state.rules?.ids ?? [])], survival: state.rules?.survival === true };
}

/** Small chips for a pick (icon and name); "Standard rules" when there are none. */
export function rulesChips(content: Content, pick: RulesPick, opts: { empty?: string } = {}): HTMLElement {
  const chips = pick.rules.map((id) => h('span', { class: 'm9-rule-chip', title: rulesetDef(content, id)?.blurb ?? id }, `${ruleIcon(id)} ${rulesetDef(content, id)?.name ?? id}`));
  if (pick.survival) chips.push(h('span', { class: 'm9-rule-chip survival', title: rulesetsContent(content).survival.blurb }, `${SURVIVAL_ICON} Survival`));
  if (!chips.length) chips.push(h('span', { class: 'm9-rule-chip plain' }, opts.empty ?? 'Standard rules'));
  return h('span', { class: 'm9-rule-chips' }, ...chips);
}

// ---------------------------------------------------------------- HUD and revive hooks (called from ui.ts)

/** HUD title tooltip: the homestead's rules and what they pay. */
export function rulesTitle(state: GameState, content: Content): string {
  const pick = rulesOf(state);
  const custom = state.mode === 'custom' ? ' · Custom Game (achievements off)' : '';
  if (!pick.rules.length && !pick.survival) return `Standard rules${custom}`;
  return `Rules: ${rulesText(content, pick)} · Legacy ×${fmtMult(rulesLegacyMult(state, content))} at the next founding${custom}`;
}

/**
 * A HUD marker for the homestead's rules: ☠ in Survival, plus a ⚖ count of
 * rulesets. Null under standard rules. Tapping it says what the rules are.
 */
export function rulesHudChip(state: GameState, content: Content, toast: (text: string) => void): HTMLElement | null {
  const pick = rulesOf(state);
  if (!pick.rules.length && !pick.survival) return null;
  const tip = rulesTitle(state, content);
  return h(
    'button',
    { class: `stat-chip chip-button m9-rules-chip${pick.survival ? ' survival' : ''}`, title: tip, 'aria-label': tip, onclick: () => toast(`${pick.survival ? `${SURVIVAL_ICON} Survival: the fallen stay fallen. ` : ''}${tip}`) },
    pick.survival ? h('b', { class: 'm9-skull' }, SURVIVAL_ICON) : null,
    pick.rules.length ? h('span', {}, `${pick.survival ? ' · ' : ''}⚖ ${pick.rules.length}`) : null,
  );
}

/** A small ☠ for the HUD title in Survival (empty string otherwise). */
export function survivalMark(state: GameState): string {
  return state.rules?.survival ? ` ${SURVIVAL_ICON}` : '';
}

/** Why the fallen can't be revived here, or null. For the revive buttons' disabled state and title. */
export function reviveBlocked(state: GameState): string | null {
  return state.rules?.survival ? 'Survival rules: the fallen stay fallen. There are no revives in this homestead.' : null;
}

/** Revive button label: the cost normally, "☠ No revives" in Survival. */
export function reviveLabel(state: GameState, cost: string): string {
  return state.rules?.survival ? `${SURVIVAL_ICON} No revives (Survival)` : `Revive (${cost} scrip)`;
}

// ---------------------------------------------------------------- the rules picker

export interface RulesPickerOpts {
  /** Custom games may pick any ruleset; founding needs them unlocked. */
  sandbox?: boolean;
  /** Site multiplier of the new homestead, for the "next founding" preview. */
  siteMult?: number;
  siteName?: string;
  /** Re-render after a change. */
  changed: () => void;
}

/** Why a ruleset can't be picked (null if it can). */
function lockedWhy(state: GameState, content: Content, id: string, sandbox: boolean): string | null {
  return sandbox ? null : rulesetLocked(state, content, id);
}

/**
 * The rules picker: ruleset cards (locked ones say what unlocks them), the
 * Survival toggle with its warning, and a live Legacy multiplier. Mutates `pick`.
 */
export function rulesPicker(state: GameState, content: Content, pick: RulesPick, opts: RulesPickerOpts): HTMLElement {
  const rc = rulesetsContent(content);
  const sandbox = opts.sandbox === true;
  const mult = pickLegacyMult(state, content, pick);
  const toggle = (id: string) => {
    if (lockedWhy(state, content, id, sandbox)) return;
    pick.rules = pick.rules.includes(id) ? pick.rules.filter((x) => x !== id) : [...pick.rules, id];
    opts.changed();
  };
  const cards = rc.rulesets.map((def) => {
    const why = lockedWhy(state, content, def.id, sandbox);
    const sel = pick.rules.includes(def.id);
    return h(
      'button',
      {
        class: `m9-rule-card${sel ? ' selected' : ''}${why ? ' locked' : ''}`,
        'data-rule': def.id,
        'aria-pressed': sel ? 'true' : 'false',
        'aria-disabled': why ? 'true' : undefined,
        title: why ? `Locked: ${why}` : def.blurb,
        onclick: () => toggle(def.id),
      },
      h('div', { class: 'm9-rule-head' }, h('span', { class: 'm9-rule-icon' }, why ? '🔒' : ruleIcon(def.id)), h('b', {}, def.name), h('span', { class: 'm9-rule-mult' }, `+×${fmtMult(def.legacyMult - 1)}`)),
      h('div', { class: 'm9-rule-blurb' }, def.blurb),
      h('div', { class: 'm9-rule-effects' }, ...ruleEffects(def).map((e) => h('span', { class: `loot-chip ${e.tone}` }, e.text))),
      why ? h('div', { class: 'm9-rule-lock' }, `🔒 Unlock: ${why}`) : sel ? h('div', { class: 'm9-rule-pick' }, '✓ In force') : null,
    );
  });

  const sv = rc.survival;
  const svWhy = sandbox ? null : survivalLocked(state, content);
  const flipSurvival = () => {
    if (svWhy) return;
    if (pick.survival) {
      pick.survival = false;
      opts.changed();
      return;
    }
    ask(
      {
        title: 'Turn on Survival?',
        text: sandbox
          ? 'Nobody who falls in this Custom Game can be revived. Legendary residents who fall are lost.'
          : "Nobody who falls in the new homestead can be revived, ever: not for scrip, not later, not by asking nicely. Legendary residents who fall are lost for good. It lasts for that homestead's whole life.",
        ok: `${SURVIVAL_ICON} Survival on`,
        danger: true,
      },
      () => {
        pick.survival = true;
        opts.changed();
      },
    );
  };
  const survival = h(
    'div',
    {
      class: `m9-survival${pick.survival ? ' on' : ''}${svWhy ? ' locked' : ''}`,
      role: 'switch',
      'aria-checked': pick.survival ? 'true' : 'false',
      'aria-disabled': svWhy ? 'true' : undefined,
      tabindex: 0,
      onclick: flipSurvival,
      onkeydown: (e: Event) => {
        const k = (e as KeyboardEvent).key;
        if (k === 'Enter' || k === ' ') (e.preventDefault(), flipSurvival());
      },
    },
    h(
      'div',
      { class: 'm9-survival-head' },
      h('span', { class: 'm9-skull big' }, svWhy ? '🔒' : SURVIVAL_ICON),
      h('b', {}, sv.name),
      h('span', { class: 'm9-rule-mult' }, `+×${fmtMult(sv.legacyMult - 1)}`),
      h('span', { class: `m9-switch${pick.survival ? ' on' : ''}` }, h('i')),
    ),
    h('div', { class: 'm9-rule-blurb' }, sv.blurb),
    svWhy
      ? h('div', { class: 'm9-rule-lock' }, `🔒 Unlock: ${svWhy}`)
      : pick.survival
        ? h('div', { class: 'm9-survival-warn' }, `⚠ The fallen stay fallen. No revives${sandbox ? '' : ' in the new homestead'}, and a legend who falls is gone for good.`)
        : h('div', { class: 'muted small' }, 'Off: the fallen can be revived for scrip as usual.'),
  );

  const site = opts.siteMult ?? 1;
  const preview = sandbox
    ? h('div', { class: 'm9-mult-preview' }, h('span', { class: 'muted' }, 'Custom Game: no Legacy and no achievements, whatever the rules.'))
    : h(
        'div',
        { class: 'm9-mult-preview', 'aria-live': 'polite' },
        h('span', { class: 'muted small' }, 'Legacy when the new homestead founds its own'),
        h(
          'span',
          { class: 'm9-mult-sum' },
          h('span', {}, `${opts.siteName ?? 'Site'} ×${fmtMult(site)}`),
          h('span', { class: 'op' }, '×'),
          h('span', { class: mult > 1 ? 'up' : '' }, `rules ×${fmtMult(mult)}`),
          h('span', { class: 'op' }, '='),
          h('b', {}, `×${fmtMult(Math.round(site * mult * 100) / 100)}`),
        ),
      );

  const available = rc.rulesets.filter((r) => !lockedWhy(state, content, r.id, sandbox)).length;
  return h(
    'div',
    { class: 'm9-rules' },
    preview,
    h(
      'div',
      { class: 'row', style: 'margin:6px 0' },
      h('b', {}, `Rulesets ${pick.rules.length ? `(${pick.rules.length} in force)` : ''}`),
      h('span', { class: 'muted small' }, sandbox ? 'Any of them, no unlocks needed' : `${available} of ${rc.rulesets.length} unlocked · they stack`),
    ),
    h('div', { class: 'm9-rule-grid' }, ...cards),
    h('h3', { class: 'group' }, 'Survival'),
    survival,
  );
}
