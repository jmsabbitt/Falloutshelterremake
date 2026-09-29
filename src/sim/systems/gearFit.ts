// Gear fit: how much a weapon or outfit helps a resident in what they are doing
// now, and auto-equip, which hands out the homestead's gear by that measure.
// The pickers in the UI rank with the same score, so "Best fit" and
// Auto-equip always agree.
//
// Outfits count for the stat the resident's room works with (not in a
// training room, which raises their own stat; a little when idle). Weapons
// count for how likely they are to fight: a room under attack, then the door,
// then rooms with the fewest armed defenders; expecting residents last.

import type { Content, ItemDef } from '../content';
import { roomDef } from '../grid';
import { bump, fleesIncidents, isAway, isChild } from '../residents';
import { STAT_KEYS, type GameState, type Resident, type Room, type StatKey } from '../types';

export type GearWhy = 'fleeing' | 'idle' | 'fighting' | 'door' | 'defends' | 'training' | 'job' | 'nostat';

export interface GearScore {
  score: number;
  why: GearWhy;
  room?: Room;
  /** Outfits: the stat their room works with. */
  focus?: StatKey;
  /** Outfits in a job: the change in that stat. */
  job?: number;
  /** Weapons: other armed defenders in their room. */
  armed?: number;
}

/** Average damage of a weapon (fists hit for 1). */
export function avgDamage(def: ItemDef | undefined): number {
  return def && def.kind === 'weapon' ? (def.min + def.max) / 2 : 1;
}

/** Armed defenders per room (those who'd fight), leaving out `except`. */
function armedIn(state: GameState, roomId: number, except: number): number {
  return state.residents.filter((x) => x.id !== except && x.roomId === roomId && !x.dead && x.weapon && !fleesIncidents(state, x)).length;
}

/**
 * How much swapping `current` for `next` helps `r` in what they are doing now.
 * `armed` overrides the count of other armed defenders in their room (auto-equip
 * tracks it as it hands weapons out).
 */
export function gearScore(state: GameState, content: Content, r: Resident, next: ItemDef, current: ItemDef | undefined, armed?: number): GearScore {
  return scoreIn(gearContext(state, content, r), next, current, armed ?? (r.roomId !== null ? armedIn(state, r.roomId, r.id) : 0));
}

interface GearContext {
  room?: Room;
  def?: ReturnType<typeof roomDef>;
  flees: boolean;
  underAttack: boolean;
}

/** What a score depends on besides the item, looked up once per resident. */
function gearContext(state: GameState, content: Content, r: Resident): GearContext {
  const room = r.roomId !== null ? state.rooms.find((x) => x.id === r.roomId) : undefined;
  return { room, def: room ? roomDef(content, room) : undefined, flees: fleesIncidents(state, r), underAttack: !!room && state.incidents.some((i) => i.roomId === room.id) };
}

function scoreIn(ctx: GearContext, next: ItemDef, current: ItemDef | undefined, others: number): GearScore {
  const { room, def } = ctx;
  if (next.kind === 'weapon') {
    const d = avgDamage(next) - avgDamage(current);
    if (ctx.flees) return { score: d * 0.1, why: 'fleeing' };
    if (!room) return { score: d * 0.8, why: 'idle' };
    // A room with few armed defenders gains most from one more gun, so weapons spread out.
    const spread = 1 / (1 + others * 0.35);
    if (ctx.underAttack) return { score: d * 2 * spread, why: 'fighting', room, armed: others };
    if (def?.category === 'door') return { score: d * 1.5 * spread, why: 'door', room, armed: others };
    return { score: d * spread, why: 'defends', room, armed: others };
  }
  const cur = current && current.kind === 'outfit' ? current.bonus : {};
  const gain = (k: StatKey) => (next.bonus[k] ?? 0) - (cur[k] ?? 0);
  const total = STAT_KEYS.reduce((n, k) => n + gain(k), 0);
  const stat = def?.stat as StatKey | undefined;
  if (room && def?.category === 'training') return { score: total * 0.15, why: 'training', room };
  if (room && stat) {
    const job = gain(stat);
    return { score: job + (total - job) * 0.15, why: 'job', room, focus: stat, job };
  }
  return { score: total * 0.25, why: room ? 'nostat' : 'idle', room };
}

/** Who auto-equip hands gear to: adults at home (the away keep theirs). */
function takers(state: GameState, residentIds?: number[]): Resident[] {
  const only = residentIds ? new Set(residentIds) : null;
  return state.residents.filter((r) => !r.dead && !r.waiting && !isAway(r) && !isChild(state, r) && (!only || only.has(r.id)));
}

/**
 * Auto-equip: gather the gear of everyone taking part plus what's in storage,
 * then hand it out best fit first (the pairing that helps most, again and again),
 * so the best pieces go where they count and nobody is left with nothing while
 * a spare lies in storage. Returns how many residents' gear changed.
 */
export function autoEquip(state: GameState, content: Content, slot: 'weapon' | 'outfit' | 'all', residentIds?: number[]): { changed: number; equipped: number } {
  const people = takers(state, residentIds);
  let changed = 0;
  let equipped = 0;
  for (const s of slot === 'all' ? (['weapon', 'outfit'] as const) : ([slot] as const)) {
    const before = new Map(people.map((r) => [r.id, r[s]]));
    // The pool: every spare of this kind in storage, plus what the takers wear now.
    const pool = new Map<string, number>();
    const add = (id: string) => pool.set(id, (pool.get(id) ?? 0) + 1);
    const kept = state.items.filter((it) => {
      const d = content.items[it.defId];
      if (d?.kind !== s) return true;
      add(it.defId);
      return false;
    });
    for (const r of people) {
      const id = r[s];
      if (id && content.items[id]) add(id);
      r[s] = null;
    }
    // Weapons: armed defenders per room, counting those not taking part.
    const armed = new Map<number, number>();
    if (s === 'weapon') {
      const taking = new Set(people.map((r) => r.id));
      for (const x of state.residents) if (!taking.has(x.id) && x.roomId !== null && !x.dead && x.weapon && !fleesIncidents(state, x)) armed.set(x.roomId, (armed.get(x.roomId) ?? 0) + 1);
    }
    const left = new Set(people);
    const ctx = new Map(people.map((r) => [r.id, gearContext(state, content, r)]));
    while (left.size && pool.size) {
      let best: { r: Resident; id: string; score: number } | null = null;
      for (const r of left) {
        const others = r.roomId !== null ? (armed.get(r.roomId) ?? 0) : 0;
        const c = ctx.get(r.id)!;
        for (const id of pool.keys()) {
          const def = content.items[id];
          if (!def) continue;
          const sc = scoreIn(c, def, undefined, others).score;
          // Ties go to the better item overall, then the lower id, so the result is stable.
          if (!best || sc > best.score + 1e-9 || (Math.abs(sc - best.score) <= 1e-9 && (worth(def) > worth(content.items[best.id]) || (worth(def) === worth(content.items[best.id]) && r.id < best.r.id)))) best = { r, id, score: sc };
        }
      }
      if (!best) break;
      best.r[s] = best.id;
      left.delete(best.r);
      const n = (pool.get(best.id) ?? 1) - 1;
      if (n > 0) pool.set(best.id, n);
      else pool.delete(best.id);
      if (s === 'weapon' && best.r.roomId !== null && !fleesIncidents(state, best.r)) armed.set(best.r.roomId, (armed.get(best.r.roomId) ?? 0) + 1);
    }
    // What nobody took goes (back) to storage.
    for (const [id, n] of pool) for (let i = 0; i < n; i++) kept.push({ id: state.nextId++, defId: id });
    state.items = kept;
    for (const r of people) {
      if (r[s] !== before.get(r.id)) changed++;
      if (r[s]) equipped++;
    }
  }
  if (changed) bump(state, 'autoEquips');
  return { changed, equipped };
}

/** A tie-break for items of equal fit: damage for weapons, total bonus for outfits. */
function worth(def: ItemDef | undefined): number {
  if (!def) return 0;
  return def.kind === 'weapon' ? avgDamage(def) : Object.values(def.bonus).reduce((n, v) => n + (v ?? 0), 0);
}
