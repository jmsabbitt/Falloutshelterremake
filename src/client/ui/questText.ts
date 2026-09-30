// Shared wording for quest rewards, bounties and loot.

import { fragmentsNeeded, scripIncome, type Content, type GameState, type ItemDef, type Quest, type QuestReward, type StatKey } from '../../sim';
import { fmt, h } from './dom';

export const STAT_NAMES: Record<StatKey, string> = {
  brawn: 'Brawn',
  sight: 'Sight',
  grit: 'Grit',
  charm: 'Charm',
  wits: 'Wits',
  knack: 'Knack',
  fortune: 'Fortune',
};

const MARK: Record<string, string> = { legendary: '★', rare: '◆', common: '•' };

/** A quest's scrip reward as it pays out (rewards scale with balance.scripIncome). */
const earned = (content: Content, v: number | [number, number]): [number, number] => (typeof v === 'number' ? [scripIncome(content, v), scripIncome(content, v)] : [scripIncome(content, v[0]), scripIncome(content, v[1])]);
const range = (v: number | [number, number]) => (typeof v === 'number' ? fmt(v) : v[0] === v[1] ? fmt(v[0]) : `${fmt(v[0])}–${fmt(v[1])}`);

function itemBlurb(d: ItemDef): string {
  if (d.kind === 'weapon') return `${d.min}–${d.max} dmg`;
  return Object.entries(d.bonus)
    .map(([k, v]) => `+${v} ${STAT_NAMES[k as StatKey] ?? k}`)
    .join(', ');
}

/** Reward chips for a quest card: scrip, crates, named items and so on. */
export function rewardChips(content: Content, r: QuestReward): HTMLElement[] {
  const chips: HTMLElement[] = [];
  const chip = (text: string, cls = '') => chips.push(h('span', { class: `loot-chip ${cls}` }, text));
  if (r.scrip) chip(`💰 ${range(earned(content, r.scrip))}`);
  if (r.xp) chip(`${fmt(r.xp)} XP`);
  for (const id of r.items ?? []) {
    const d = content.items[id];
    chip(`${MARK[d?.rarity ?? 'common']} ${d?.name ?? id}`, `rarity ${d?.rarity ?? 'common'}`);
  }
  if (r.item) chip(`${Math.round(r.item.chance * 100)}% ${r.item.rarity} ${r.item.kind ?? 'item'}`, `rarity ${r.item.rarity}`);
  for (const [id, n] of Object.entries(r.fragments ?? {})) {
    const d = content.items[id];
    chip(`📜 ${n}× ${d?.name ?? id} fragment`, `rarity ${d?.rarity ?? 'legendary'}`);
  }
  if (r.fragment) chip(`📜 ${Math.round(r.fragment.chance * 100)}% ${r.fragment.rarity} fragment`, `rarity ${r.fragment.rarity}`);
  for (const id of r.recipes ?? []) chip(`📘 ${content.items[id]?.name ?? id} recipe`, `rarity ${content.items[id]?.rarity ?? 'rare'}`);
  for (const [tier, n] of Object.entries(r.crates ?? {})) if (n) chip(`📦 ${n} ${tier}`, tier === 'standard' ? '' : `rarity ${tier}`);
  if (r.salvage) chip(`⚙ ${range(r.salvage.count)} ${r.salvage.rarity} salvage`);
  if (r.medpatch) chip(`✚ ${r.medpatch}`);
  if (r.purge) chip(`☢ ${r.purge}`);
  for (const region of r.regions ?? []) chip(`🗺 opens ${region}`, 'rarity rare');
  return chips;
}

/** The named bounty of a contract, big and in its rarity colour (GDD §15). */
export function bountyView(content: Content, state: GameState, r: QuestReward): HTMLElement {
  const parts: HTMLElement[] = [];
  let rarity = 'rare';
  for (const id of r.items ?? []) {
    const d = content.items[id];
    rarity = d?.rarity ?? rarity;
    parts.push(h('div', { class: `bounty-name rarity ${rarity}` }, `${MARK[rarity]} ${d?.name ?? id}`), h('div', { class: 'muted small' }, d ? `${d.rarity} ${d.kind} · ${itemBlurb(d)}` : ''));
  }
  for (const [id, n] of Object.entries(r.fragments ?? {})) {
    const d = content.items[id];
    rarity = d?.rarity ?? 'legendary';
    const have = state.fragments[id] ?? 0;
    const need = fragmentsNeeded(content, id);
    parts.push(
      h('div', { class: `bounty-name rarity ${rarity}` }, `${MARK[rarity]} ${n}× ${d?.name ?? id} fragment${n > 1 ? 's' : ''}`),
      h('div', { class: 'muted small' }, `${d ? `${d.rarity} ${d.kind} · ${itemBlurb(d)} · ` : ''}you have ${have}/${need}`),
    );
  }
  if (r.scrip) parts.push(h('div', { class: 'small' }, `+ ${range(earned(content, r.scrip))} scrip`));
  return h('div', { class: `bounty ${rarity}` }, h('div', { class: 'bounty-label' }, 'Bounty'), ...parts);
}

/** What a party is bringing home, as rarity-coloured lines. */
export function lootList(content: Content, loot: Quest['loot']): HTMLElement[] {
  const out: HTMLElement[] = [];
  const line = (text: string, cls = '') => out.push(h('div', { class: `qs-lootline ${cls}` }, text));
  const items = loot.items.map((id) => content.items[id]).filter((d): d is ItemDef => !!d);
  const order: Record<string, number> = { legendary: 0, rare: 1, common: 2 };
  items.sort((a, b) => (order[a.rarity] ?? 3) - (order[b.rarity] ?? 3));
  for (const d of new Set(items)) {
    const n = items.filter((x) => x === d).length;
    line(`${MARK[d.rarity]} ${d.name}${n > 1 ? ` ×${n}` : ''}`, `rarity ${d.rarity}`);
  }
  for (const [id, n] of Object.entries(loot.fragments)) line(`📜 ${n}× ${content.items[id]?.name ?? id} fragment`, `rarity ${content.items[id]?.rarity ?? 'rare'}`);
  for (const id of loot.recipes) line(`📘 ${content.items[id]?.name ?? id} recipe`, 'rarity rare');
  for (const [tier, n] of Object.entries(loot.crates)) if (n) line(`📦 ${n} ${tier} Supply Crate${n > 1 ? 's' : ''}`, tier === 'standard' ? '' : `rarity ${tier}`);
  const salvage = Object.values(loot.salvage).reduce((a, b) => a + b, 0);
  const bits = [loot.scrip ? `💰 ${fmt(loot.scrip)} scrip` : '', salvage ? `⚙ ${salvage} salvage` : '', loot.medpatch ? `✚ ${loot.medpatch}` : '', loot.purge ? `☢ ${loot.purge}` : '', loot.xp ? `${fmt(loot.xp)} XP` : ''].filter(Boolean);
  if (bits.length) line(bits.join(' · '));
  return out;
}
