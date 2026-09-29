// Research: Labs turn Wits into research points, which buy nodes in the
// tech tree (GDD §6.2). Node effects feed bonus() in bonuses.ts; automation
// effects that need a tick (supply bots, auto-assign) run here.
//
// CONTRACT (M6, stream A). Keep these signatures; see docs/design/M6-spec.md.

import type { Content } from '../content';
import { bonus } from '../bonuses';
import { refreshUnlocks } from '../economy';
import { roomDef } from '../grid';
import { bump, bumpMax, effectiveMaxHp, effectiveStat, grantXp, isAway, workersInRoom } from '../residents';
import type { GameState, Resident, Room } from '../types';
import { autoAssign } from './assign';
import { workerMult } from './traits';

export interface ResearchNodeDef {
  id: string;
  branch: string;
  tier: number;
  name: string;
  description: string;
  /** Research points. */
  cost: number;
  /** Node ids needed first. */
  requires: string[];
  effects?: { effect: string; value: number }[];
  /** Room types and exploration regions this node unlocks. */
  unlocks?: { rooms?: string[]; regions?: string[] };
}

export interface ResearchContent {
  tuning: { pointsPerWitsHour: number; levelMult: number[]; xpPerWorkerHour?: number };
  branches: { id: string; name: string; description: string }[];
  nodes: ResearchNodeDef[];
}

export function researchContent(content: Content): ResearchContent {
  return content.research as ResearchContent;
}

export function researchNode(content: Content, id: string): ResearchNodeDef | undefined {
  return researchContent(content).nodes.find((n) => n.id === id);
}

export function hasResearch(state: GameState, id: string): boolean {
  return state.research.done.includes(id);
}

/** Seconds between Personnel Office sweeps, and between supply-bot treatments. */
export const AUTO_ASSIGN_SECONDS = 60;
export const AUTO_MEDIC_SECONDS = 10;
/** Supply bots patch anyone below this share of their (taint-reduced) max HP... */
export const AUTO_MEDIC_HP = 0.5;
/** ...and purge anyone whose taint is above this share of max HP. */
export const AUTO_MEDIC_TAINT = 0.25;

/** Research points per hour from one Lab (0 if unpowered, burning or empty). */
export function labRate(state: GameState, content: Content, room: Room): number {
  const def = roomDef(content, room);
  if (def.category !== 'research' || !def.stat || !room.powered) return 0;
  if (state.incidents.some((i) => i.roomId === room.id)) return 0;
  const stat = def.stat;
  const t = researchContent(content).tuning;
  const wits = workersInRoom(state, room.id).reduce((s, r) => s + effectiveStat(content, r, stat) * workerMult(state, content, r, room), 0);
  const levelMult = t.levelMult[room.level - 1] ?? t.levelMult[t.levelMult.length - 1] ?? 1;
  return wits * t.pointsPerWitsHour * levelMult * (1 + bonus(state, content, 'researchSpeed'));
}

/** Research points per hour from every staffed Lab. */
export function researchRate(state: GameState, content: Content): number {
  let total = 0;
  for (const room of state.rooms) total += labRate(state, content, room);
  return total;
}

/** 'done', 'ready' (can research now), 'open' (requirements met, not enough points) or 'locked'. */
export function nodeStatus(state: GameState, content: Content, nodeId: string): 'done' | 'ready' | 'open' | 'locked' {
  const node = researchNode(content, nodeId);
  if (!node) return 'locked';
  if (hasResearch(state, nodeId)) return 'done';
  if (!node.requires.every((id) => hasResearch(state, id))) return 'locked';
  return state.research.points >= node.cost ? 'ready' : 'open';
}

/** Why a node can't be researched now, or null. */
export function canResearch(state: GameState, content: Content, nodeId: string): string | null {
  const node = researchNode(content, nodeId);
  if (!node) return 'no such research';
  if (hasResearch(state, nodeId)) return 'already researched';
  const missing = node.requires.filter((id) => !hasResearch(state, id));
  if (missing.length) return `needs ${missing.map((id) => researchNode(content, id)?.name ?? id).join(' and ')} first`;
  if (state.research.points < node.cost) return `needs ${Math.ceil(node.cost - state.research.points)} more research points`;
  return null;
}

/** Spend points on a node. */
export function doResearch(state: GameState, content: Content, nodeId: string): string | null {
  const err = canResearch(state, content, nodeId);
  if (err) return err;
  const node = researchNode(content, nodeId) as ResearchNodeDef;
  state.research.points -= node.cost;
  state.research.done.push(node.id);
  for (const region of node.unlocks?.regions ?? []) if (!state.regionsUnlocked.includes(region)) state.regionsUnlocked.push(region);
  state.events.push({ type: 'researchDone', nodeId: node.id });
  bump(state, 'researchDone');
  bump(state, `researchDone.${node.branch}`);
  bump(state, `researchTier${node.tier}`);
  // Per-homestead counts, for "in one homestead" achievements.
  bumpMax(state, 'researchDoneHomestead', state.research.done.length);
  const inBranch = state.research.done.filter((id) => researchNode(content, id)?.branch === node.branch).length;
  bumpMax(state, `researchDoneHomestead.${node.branch}`, inBranch);
  refreshUnlocks(state, content);
  return null;
}

/** True when `dt` seconds ending at state.time crossed a multiple of `period`. */
function crossed(state: GameState, dt: number, period: number): boolean {
  return Math.floor(state.time / period) > Math.floor((state.time - dt) / period);
}

function needsPatch(r: Resident): boolean {
  return r.hp < effectiveMaxHp(r) * AUTO_MEDIC_HP;
}

function needsPurge(r: Resident): boolean {
  return r.taint > r.maxHp * AUTO_MEDIC_TAINT;
}

/**
 * Supply bots treat the one resident who needs it most: the lowest health
 * first (if there are Med-Patches), then the most tainted (if there is Purge).
 * Same formulas as the heal and purge commands. Returns true if they acted.
 */
export function supplyBotRound(state: GameState, content: Content): boolean {
  const home = state.residents.filter((r) => !r.dead && !r.waiting && !isAway(r));
  const strength = content.balance.medical;
  const medicine = 1 + bonus(state, content, 'medicine');
  if (state.resources.medpatch >= 1) {
    const hurt = home.filter(needsPatch).sort((a, b) => a.hp / Math.max(1, effectiveMaxHp(a)) - b.hp / Math.max(1, effectiveMaxHp(b)) || a.id - b.id)[0];
    if (hurt) {
      state.resources.medpatch -= 1;
      hurt.hp = Math.min(effectiveMaxHp(hurt), hurt.hp + hurt.maxHp * strength.medpatchHeal * medicine);
      bump(state, 'medpatchesUsed');
      bump(state, 'supplyBotTreatments');
      return true;
    }
  }
  if (state.resources.purge >= 1) {
    const sick = home.filter(needsPurge).sort((a, b) => b.taint / b.maxHp - a.taint / a.maxHp || a.id - b.id)[0];
    if (sick) {
      state.resources.purge -= 1;
      sick.taint = Math.max(0, sick.taint - sick.maxHp * strength.purgeRemove * medicine);
      bump(state, 'purgesUsed');
      bump(state, 'supplyBotTreatments');
      return true;
    }
  }
  return false;
}

/** Labs produce points (online and offline); automation effects act (online only). */
export function tickResearch(state: GameState, content: Content, dt: number, offline: boolean): void {
  // Continuous and linear, so one 60 s offline step equals sixty 1 s steps.
  const earned = (researchRate(state, content) * dt) / 3600;
  if (earned > 0) {
    state.research.points += earned;
    bump(state, 'researchPoints', earned);
  }
  if (offline) return;
  // Lab work teaches too: a steady XP trickle, like collecting does in production rooms (online only).
  const xpRate = researchContent(content).tuning.xpPerWorkerHour ?? 0;
  if (xpRate > 0) {
    for (const room of state.rooms) {
      if (roomDef(content, room).category !== 'research' || !room.powered) continue;
      const mult = researchContent(content).tuning.levelMult[room.level - 1] ?? 1;
      for (const r of workersInRoom(state, room.id)) grantXp(state, content, r, (xpRate * mult * dt) / 3600);
    }
  }
  if (bonus(state, content, 'autoAssign') > 0 && crossed(state, dt, AUTO_ASSIGN_SECONDS)) {
    const n = autoAssign(state, content);
    if (n) bump(state, 'officeAssignments', n);
  }
  if (bonus(state, content, 'autoMedic') > 0 && crossed(state, dt, AUTO_MEDIC_SECONDS)) supplyBotRound(state, content);
}

/**
 * Research kept when founding with Institutional Memory: the cheapest share
 * of the old homestead's completed nodes (a node only if its requirements are
 * kept too), and the same share of unspent points.
 */
export function keptResearch(old: GameState, content: Content, share: number): string[] {
  if (share <= 0) return [];
  const done = researchContent(content)
    .nodes.filter((n) => old.research.done.includes(n.id))
    .sort((a, b) => a.cost - b.cost || a.tier - b.tier || a.id.localeCompare(b.id));
  const budget = Math.floor(done.length * Math.min(1, share) + 1e-9);
  const kept: string[] = [];
  let progress = true;
  while (kept.length < budget && progress) {
    progress = false;
    for (const n of done) {
      if (kept.length >= budget) break;
      if (kept.includes(n.id) || !n.requires.every((id) => kept.includes(id))) continue;
      kept.push(n.id);
      progress = true;
      break; // restart from the cheapest: a kept node may free a cheaper dependant
    }
  }
  return kept;
}

/** What research survives founding a new homestead (called by prestige.ts). */
export function carryResearch(old: GameState, next: GameState, content: Content): void {
  const share = Math.min(1, bonus(next, content, 'researchKeep'));
  next.research = { points: Math.floor((old.research?.points ?? 0) * share), done: keptResearch(old, content, share) };
}
