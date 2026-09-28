// M8: what will happen while the player is away, for phone notifications.
// A pure prediction from the current state: it never changes the state and
// never draws from state.rng. See docs/design/M8-spec.md.
//
// How each kind is predicted (all under catchUp's offline rules):
// - Plain countdowns (explorers and quest parties on the road, caravans, the
//   dig, pregnancies, children, contract and trade-board refreshes) are read
//   straight off their timers: offline stepping subtracts exactly the time
//   that passes, so the event lands on the first step ending at or after it.
// - Production, crafting and research depend on who is powered, happiness,
//   mastery, weather and incidents settling. For those we replay catchUp's
//   own step schedule on a scratch copy of the parts of the state those
//   systems read, calling the same tick functions in the same order, until
//   every room has stopped (or three hours in), then extrapolate at the final
//   rates. The copy is thrown away; the real state and its rng are untouched.
// - An explorer with no Purge left: Glare builds continuously (an exact
//   integral in exploration.ts), and hazards only ever add to it, so the time
//   the steady build alone reaches today's Purge line is the latest they will
//   be over it (a level-up on the road can raise the line; that's dice). The
//   rest of a trip (finds, fights, a full pack) is dice, so it isn't predicted.
// - Outposts fill linearly up to their storage cap.
// - The daily crate follows the local calendar day the client passes to
//   claimDaily, so it needs the device's UTC offset (opts.utcOffsetMinutes).
// Anything past the catch-up cap (maxCatchUpHours + Legacy) is dropped: when
// the game is reopened later than that, the sim will not have got there.

import type { Content } from '../content';
import { bonus, productionMult } from '../bonuses';
import { population, storageCapacity } from '../economy';
import { roomDef } from '../grid';
import { effectiveStat, isChild } from '../residents';
import type { GameState, Room } from '../types';
import { craftTimeLeft, tickCrafting } from './crafting';
import { digTimeLeft, stratumDef } from './deep';
import { regionDef } from './exploration';
import { factionDef, tradingPostStaffed } from './factions';
import { settleIncidentsOffline } from './incidents';
import { tickNeeds, updatePower } from './needs';
import { happinessBonus, poolSize, roomStatTotal, tickProduction } from './production';
import { researchContent, researchRate, tickResearch, type ResearchNodeDef } from './research';
import { traitExplorerTaintMult, tickMastery } from './traits';
import { tickWeather, weatherMult } from './weather';
import { isTrainingRoom, trainees, trainingStatus } from './training';

export type ReminderKind =
  | 'explorer'
  | 'caravan'
  | 'research'
  | 'craft'
  | 'storage'
  | 'birth'
  | 'grownUp'
  | 'contracts'
  | 'trade'
  | 'crate'
  | 'deep'
  | 'quest'
  | 'outpost'
  | 'training';

export interface Reminder {
  /** Stable for the same underlying event (e.g. `caravan.12`), so a re-schedule replaces rather than duplicates. */
  key: string;
  kind: ReminderKind;
  /** Seconds from state.lastRealTime until it happens, assuming the game is closed (offline rules). */
  inSeconds: number;
  title: string;
  body: string;
}

export interface ReminderOptions {
  /** How far ahead to look, in seconds (default 3 days). */
  horizonSeconds?: number;
  /** Most reminders returned (default 20). */
  max?: number;
  /**
   * Minutes to add to UTC for the device's local time (-Date#getTimezoneOffset()).
   * Only the daily crate needs it (claimDaily counts local days); default 0.
   */
  utcOffsetMinutes?: number;
}

export const DEFAULT_HORIZON_SECONDS = 3 * 24 * 3600;
export const DEFAULT_MAX_REMINDERS = 20;
/** Anything sooner than this is left to the game itself. */
export const MIN_REMINDER_SECONDS = 60;
export const TITLE_MAX = 40;
export const BODY_MAX = 110;

/** How long the scratch replay may run before extrapolating (seconds of offline time). */
const REPLAY_LIMIT_SECONDS = 3 * 3600;
/** Local hour on the last day of a streak when we nudge the player. */
const STREAK_NUDGE_HOUR = 18;
const DAY_MS = 86_400_000;

// ------------------------------------------------------------------ text

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, '')}…`;
}

/** Pick the first body that fits, so long names fall back to a shorter line rather than a cut one. */
function fit(...options: string[]): string {
  for (const o of options) if (o.length <= BODY_MAX) return o;
  return clip(options[options.length - 1] ?? '', BODY_MAX);
}

function listNames(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// ------------------------------------------------------------------ helpers

interface Draft {
  key: string;
  kind: ReminderKind;
  inSeconds: number;
  title: string;
  body: string;
  /** Wall-clock events (the daily crate) don't depend on the catch-up cap. */
  wallClock?: boolean;
}

function catchUpCapSeconds(state: GameState, content: Content): number {
  return (content.balance.offline.maxCatchUpHours + bonus(state, content, 'offlineHours')) * 3600;
}

interface ExploreTuning {
  taintPerHour: number;
  taintGrowthPerHour: number;
  taintImmuneGrit: number;
  purgeAt: number;
}

// ------------------------------------------------------------------ timers read straight off the state

function explorers(state: GameState, content: Content, out: Draft[]): void {
  const t = (content.exploration as unknown as { tuning: ExploreTuning }).tuning;
  for (const e of state.expeditions) {
    const r = state.residents.find((x) => x.id === e.residentId);
    if (!r) continue; // the trip is dropped on the next tick
    const region = regionDef(content, e.regionId);
    const where = region?.name ?? 'the Glarelands';
    if (e.status === 'returning') {
      out.push({
        key: `explorer.${e.id}`,
        kind: 'explorer',
        inSeconds: e.returnRemaining,
        title: r.dead ? 'Fallen explorer home' : 'Explorer home',
        body: r.dead
          ? fit(`${r.firstName} has been carried home from ${where}. HALCY has filed the paperwork.`, `${r.firstName} has been carried home. HALCY has filed the paperwork.`)
          : fit(`${r.firstName} is back from ${where}. The loot is waiting at the door.`, `${r.firstName} is back. The loot is waiting at the door.`),
      });
      continue;
    }
    if (e.status !== 'exploring' || r.dead || !region) continue;
    // Out of Purge: when does the steady Glare alone reach the Purge line?
    if (e.supplies.purge > 0 || e.timers['warnTaint']) continue;
    if (effectiveStat(content, r, 'grit') >= t.taintImmuneGrit) continue;
    const need = t.purgeAt * r.maxHp - r.taint;
    if (need <= 0) continue;
    const k = t.taintPerHour * region.danger * Math.max(0, 1 - bonus(state, content, 'explorerTaint')) * traitExplorerTaintMult(content, r);
    if (k <= 0) continue;
    const g = t.taintGrowthPerHour;
    const h0 = e.elapsed / 3600;
    // k * ((h1 - h0) + g (h1² - h0²) / 2) = need
    let h1: number;
    if (g <= 0) h1 = h0 + need / k;
    else {
      const a = (k * g) / 2;
      const c = -(need + k * h0 + a * h0 * h0);
      h1 = (-k + Math.sqrt(k * k - 4 * a * c)) / (2 * a);
    }
    out.push({
      key: `explorer.${e.id}.purge`,
      kind: 'explorer',
      inSeconds: (h1 - h0) * 3600,
      title: 'Out of Purge',
      body: fit(`${r.firstName} has no Purge left and the Glare is climbing. HALCY recommends a recall.`, `${r.firstName} has no Purge left. HALCY recommends a recall.`),
    });
  }
}

function caravans(state: GameState, content: Content, out: Draft[]): void {
  for (const c of state.caravans) {
    if (c.status === 'returned') continue;
    const inSeconds = c.status === 'travelling' ? Math.max(0, c.remaining) + c.total : c.remaining;
    const name = factionDef(content, c.factionId)?.name;
    out.push({
      key: `caravan.${c.id}`,
      kind: 'caravan',
      inSeconds,
      title: 'Caravan back',
      body: fit(
        `Your caravan is back from ${name}. HALCY is counting the scrip.`,
        'Your caravan is back at the Trading Post. HALCY is counting the scrip.',
      ),
    });
  }
}

function quests(state: GameState, out: Draft[]): void {
  for (const q of state.quests) {
    if (q.status === 'travelling') {
      out.push({
        key: `quest.${q.id}.arrive`,
        kind: 'quest',
        inSeconds: q.travelRemaining,
        title: 'Party on site',
        body: fit(`Your party has reached ${q.title}. Nothing moves until you give the word.`, 'Your party is on site. Nothing moves until you give the word.'),
      });
    } else if (q.status === 'returning') {
      out.push({
        key: `quest.${q.id}.home`,
        kind: 'quest',
        inSeconds: q.travelRemaining,
        title: 'Party home',
        body: fit(`The ${q.title} party is home. HALCY would like to see the receipts.`, 'Your quest party is home. HALCY would like to see the receipts.'),
      });
    }
  }
}

function deep(state: GameState, content: Content, out: Draft[]): void {
  const dig = state.deep?.dig;
  if (!dig) return;
  const name = stratumDef(content, dig.stratum)?.name;
  out.push({
    key: `deep.${dig.stratum}`,
    kind: 'deep',
    inSeconds: digTimeLeft(state, content),
    title: 'Dig complete',
    body: fit(`The crew has broken through to ${name}. HALCY reminds you it was always there.`, 'The dig has broken through. HALCY reminds you it was always there.'),
  });
}

/**
 * Training rooms: when the next trainee in each room gains a point, at today's
 * speed (training has no dice; a brownout while away would only delay it).
 */
function training(state: GameState, content: Content, out: Draft[]): void {
  for (const room of state.rooms) {
    if (!isTrainingRoom(content, room)) continue;
    let best: { name: string; stat: string; value: number; at: number; id: number } | null = null;
    for (const r of trainees(state, room)) {
      const t = trainingStatus(state, content, r);
      if (!t || t.maxed || !Number.isFinite(t.secondsLeft)) continue;
      if (!best || t.secondsLeft < best.at) best = { name: r.firstName, stat: t.stat, value: t.value + 1, at: t.secondsLeft, id: r.id };
    }
    if (!best) continue;
    const stat = best.stat.charAt(0).toUpperCase() + best.stat.slice(1);
    const where = roomDef(content, room).name;
    out.push({
      key: `training.${best.id}.${best.stat}.${best.value}`,
      kind: 'training',
      inSeconds: best.at,
      title: 'Training done',
      body: fit(`${best.name}'s ${stat} is up to ${best.value} in the ${where}. HALCY has framed the certificate.`, `${best.name}'s ${stat} is up to ${best.value}. HALCY has framed the certificate.`),
    });
  }
}

function family(state: GameState, content: Content, out: Draft[]): void {
  // Births wait for a free bed, and nothing frees a bed while the game is closed.
  let beds = storageCapacity(state, content, 'population') - population(state);
  const due = state.residents
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.pregnancy !== null && !r.dead)
    .sort((a, b) => (a.r.pregnancy?.dueAt ?? 0) - (b.r.pregnancy?.dueAt ?? 0) || a.i - b.i);
  const childhood = content.balance.family.childhoodSeconds;
  for (const { r } of due) {
    if (beds <= 0) break;
    beds--;
    const p = r.pregnancy;
    if (!p) continue;
    const inSeconds = Math.max(0, p.dueAt - state.time);
    if (inSeconds <= 0) continue; // overdue ones are born on the first tick
    out.push({
      key: `birth.${r.id}.${Math.round(p.dueAt)}`,
      kind: 'birth',
      inSeconds,
      title: 'A new arrival',
      body: fit(`${r.firstName} has had a baby. HALCY has already ordered a smaller jumpsuit.`),
    });
    out.push({
      key: `grownUp.m${r.id}.${Math.round(p.dueAt)}`,
      kind: 'grownUp',
      inSeconds: inSeconds + childhood,
      title: 'All grown up',
      body: fit(`${r.firstName}'s baby is all grown up and would like a job. HALCY has several.`),
    });
  }
  for (const r of state.residents) {
    if (r.dead || !isChild(state, r) || r.adultAt === null) continue;
    out.push({
      key: `grownUp.${r.id}`,
      kind: 'grownUp',
      inSeconds: r.adultAt - state.time,
      title: 'All grown up',
      body: fit(`${r.firstName} is an adult now and would like a job. HALCY has several.`),
    });
  }
}

function boards(state: GameState, content: Content, out: Draft[]): void {
  // Contracts: only worth a ping with a Command Office to take them.
  const ct = (content.quests as unknown as { tuning: { contracts: { unlockedBy: string } } }).tuning.contracts;
  if (state.rooms.some((r) => r.type === 'office') && state.questsDone.includes(ct.unlockedBy) && state.contracts.refreshAt > state.time) {
    out.push({
      key: `contracts.${Math.round(state.contracts.refreshAt)}`,
      kind: 'contracts',
      inSeconds: state.contracts.refreshAt - state.time,
      title: 'New contracts',
      body: 'Fresh contracts are pinned up in the Command Office. HALCY picked the least lethal ones.',
    });
  }
  // The trade board only turns over with someone minding the Trading Post, and only has offers from factions met.
  const anyMet = Object.values(state.factions ?? {}).some((f) => f.met);
  if (anyMet && tradingPostStaffed(state) && state.trade.refreshAt > state.time) {
    out.push({
      key: `trade.${Math.round(state.trade.refreshAt)}`,
      kind: 'trade',
      inSeconds: state.trade.refreshAt - state.time,
      title: 'Trade board refreshed',
      body: 'New offers at the Trading Post. HALCY calls the prices fair, having set none of them.',
    });
  }
}

function outposts(state: GameState, content: Content, out: Draft[]): void {
  const list = state.legacy?.outposts;
  if (!list?.length) return;
  const cap = (content.legacy as unknown as { outposts: { storageHours: number } }).outposts.storageHours;
  const mult = 1 + bonus(state, content, 'outpostOutput');
  let latest = -1;
  for (const o of list) {
    for (const key of ['scrip', 'salvage', 'crates'] as const) {
      const rate = (key === 'crates' ? o.rates.cratesPerHour : o.rates[key]) * mult;
      if (rate <= 0) continue;
      const hours = Math.max(0, (rate * cap - o.stored[key]) / rate);
      latest = Math.max(latest, hours * 3600);
    }
  }
  if (latest <= 0) return;
  out.push({
    key: 'outpost.full',
    kind: 'outpost',
    inSeconds: latest,
    title: 'Outposts full',
    body: 'Your outposts are full and have stopped. HALCY suggests collecting before they unionise.',
  });
}

function crates(state: GameState, utcOffsetMinutes: number, out: Draft[]): void {
  const { lastDay, streak } = state.daily;
  if (lastDay < 0) return;
  const off = utcOffsetMinutes * 60_000;
  const today = Math.floor((state.lastRealTime + off) / DAY_MS);
  if (lastDay < today) return; // already waiting: the game claims it on opening
  const nextStart = (lastDay + 1) * DAY_MS - off;
  const n = streak + 1;
  out.push({
    key: `crate.${lastDay + 1}`,
    kind: 'crate',
    inSeconds: (nextStart - state.lastRealTime) / 1000,
    title: 'Daily crate',
    body: n % 7 === 0 ? `Day ${n} of your streak: a better crate has arrived. HALCY signed for it.` : `Today's supply crate has arrived. Day ${n} of your streak. HALCY signed for it.`,
    wallClock: true,
  });
  if (streak >= 2) {
    out.push({
      key: `crate.streak.${lastDay + 1}`,
      kind: 'crate',
      inSeconds: (nextStart + STREAK_NUDGE_HOUR * 3600_000 - state.lastRealTime) / 1000,
      title: 'Streak at risk',
      body: `Your ${streak}-day crate streak ends at midnight. HALCY would hate to reset the counter.`,
      wallClock: true,
    });
  }
}

// ------------------------------------------------------------------ the scratch replay

/** A throwaway copy of what production, crafting and research read and write. */
function scratch(state: GameState): GameState {
  return {
    ...state,
    rng: [...state.rng] as GameState['rng'],
    resources: { ...state.resources },
    rooms: structuredClone(state.rooms),
    residents: structuredClone(state.residents),
    incidents: structuredClone(state.incidents),
    research: { points: state.research.points, done: [...state.research.done] },
    weather: { ...(state.weather ?? { kind: 'clear', remaining: 3600 }) },
    stats: { ...state.stats },
    // Not read by the systems replayed; left out so the copy stays cheap.
    expeditions: [],
    quests: [],
    caravans: [],
    items: [],
    events: [],
  };
}

function batchBank(state: GameState, content: Content): number {
  return Math.floor(bonus(state, content, 'batchBank'));
}

function isFull(room: Room, bank: number): boolean {
  return room.ready && (room.banked ?? 0) >= bank;
}

/** Production points per second the room makes right now (0 if unpowered, burning or empty). */
function roomRate(state: GameState, content: Content, room: Room): number {
  const def = roomDef(content, room);
  if (!def.produces || !room.powered || state.incidents.some((i) => i.roomId === room.id)) return 0;
  return roomStatTotal(state, content, room) * (1 + happinessBonus(state, content)) * productionMult(state, content, def.produces.resource) * weatherMult(state, content, room);
}

/** Seconds until the room holds every batch it can at its current rate (Infinity if it never will). */
function secondsToFull(state: GameState, content: Content, room: Room, bank: number): number {
  if (isFull(room, bank)) return 0;
  const rate = roomRate(state, content, room);
  if (rate <= 0) return Infinity;
  const batches = (room.ready ? 0 : 1) + Math.max(0, bank - (room.ready ? (room.banked ?? 0) : 0));
  return Math.max(0, batches * poolSize(content, room) - room.pool) / rate;
}

function cheapestOpenNode(state: GameState, content: Content): ResearchNodeDef | null {
  let best: ResearchNodeDef | null = null;
  for (const n of researchContent(content).nodes) {
    if (state.research.done.includes(n.id) || !n.requires.every((id) => state.research.done.includes(id))) continue;
    if (!best || n.cost < best.cost) best = n;
  }
  return best;
}

function replay(state: GameState, content: Content, limit: number, out: Draft[]): void {
  const producers = state.rooms.filter((r) => roomDef(content, r).produces);
  const crafting = state.rooms.filter((r) => r.job && r.job.remaining > 0);
  const node = cheapestOpenNode(state, content);
  const wantResearch = node !== null && state.research.points < node.cost;
  if (!producers.length && !crafting.length && !wantResearch) return;

  const s = scratch(state);
  const bank = batchBank(s, content);
  const rooms = new Map(s.rooms.map((r) => [r.id, r]));
  const fullAt = new Map<number, number>();
  const craftAt = new Map<number, number>();
  let researchAt: number | null = null;
  for (const r of producers) if (isFull(rooms.get(r.id) as Room, bank)) fullAt.set(r.id, 0);

  // catchUp's schedule: fine steps while consumption runs, then 60 s steps.
  const off = content.balance.offline;
  const window = off.consumptionMinutes * 60;
  let consumed = 0;
  let elapsed = 0;
  const done = (): boolean => {
    if (consumed < window || s.incidents.length) return false;
    for (const r of producers) {
      if (fullAt.has(r.id)) continue;
      if (roomRate(s, content, rooms.get(r.id) as Room) > 0) return false;
    }
    for (const r of crafting) {
      if (craftAt.has(r.id)) continue;
      if (Number.isFinite(craftTimeLeft(s, content, rooms.get(r.id) as Room))) return false;
    }
    return !wantResearch || researchAt !== null || researchRate(s, content) <= 0;
  };
  while (elapsed < limit - 1e-9 && !done()) {
    const consuming = consumed < window;
    const dt = Math.min(consuming ? off.stepSeconds : 60, limit - elapsed, consuming ? window - consumed : Infinity);
    // Same order as tick.ts step() for the systems that matter here.
    updatePower(s, content);
    tickProduction(s, content, dt);
    tickNeeds(s, content, dt, { consume: consuming, harm: false });
    settleIncidentsOffline(s, content, dt);
    s.time += dt;
    tickCrafting(s, content, dt);
    tickResearch(s, content, dt, true);
    tickMastery(s, content, dt);
    tickWeather(s, content, dt, true);
    s.events.length = 0;
    if (consuming) consumed += dt;
    elapsed += dt;
    for (const r of producers) if (!fullAt.has(r.id) && isFull(rooms.get(r.id) as Room, bank)) fullAt.set(r.id, elapsed);
    for (const r of crafting) if (!craftAt.has(r.id) && (rooms.get(r.id)?.job?.remaining ?? 0) <= 0) craftAt.set(r.id, elapsed);
    if (wantResearch && researchAt === null && node && s.research.points >= node.cost) researchAt = elapsed;
  }

  // Past the replay: carry on at the rates it ended with.
  for (const r of producers) {
    if (fullAt.has(r.id)) continue;
    const left = secondsToFull(s, content, rooms.get(r.id) as Room, bank);
    if (Number.isFinite(left)) fullAt.set(r.id, elapsed + left);
  }
  for (const r of crafting) {
    if (craftAt.has(r.id)) continue;
    const left = craftTimeLeft(s, content, rooms.get(r.id) as Room);
    if (Number.isFinite(left)) craftAt.set(r.id, elapsed + left);
  }
  if (wantResearch && researchAt === null && node) {
    const rate = researchRate(s, content);
    if (rate > 0) researchAt = elapsed + ((node.cost - s.research.points) / rate) * 3600;
  }

  // Storage: one reminder, for when the last working room stops.
  const stopping = producers.filter((r) => fullAt.has(r.id));
  const last = Math.max(0, ...stopping.map((r) => fullAt.get(r.id) as number));
  if (stopping.length && last > 0) {
    const resources: string[] = [];
    for (const r of stopping) {
      const res = roomDef(content, r).produces?.resource;
      const label = res ? RESOURCE_LABEL[res] ?? res : null;
      if (label && !resources.includes(label)) resources.push(label);
    }
    out.push({
      key: 'storage',
      kind: 'storage',
      inSeconds: last,
      title: 'Production halted',
      body: fit(
        `Your homestead is full of ${listNames(resources)}. Production has stopped until you collect.`,
        `Your homestead is full of ${listNames(resources)}. Production waits on you.`,
        'Every production room is sitting on a finished batch. Production waits on you.',
      ),
    });
  }

  for (const r of crafting) {
    const at = craftAt.get(r.id);
    const job = r.job;
    if (at === undefined || !job) continue;
    const item = content.items[job.defId]?.name ?? 'Something';
    const where = roomDef(content, r).name;
    out.push({
      key: `craft.${r.id}.${job.defId}`,
      kind: 'craft',
      inSeconds: at,
      title: 'Workshop job done',
      body: fit(`${item} is ready in the ${where}. Craftsmanship guaranteed by HALCY.`, `${item} is ready. Craftsmanship guaranteed by HALCY.`, 'A workshop job is ready. Craftsmanship guaranteed by HALCY.'),
    });
  }

  if (node && researchAt !== null) {
    out.push({
      key: `research.${node.id}`,
      kind: 'research',
      inSeconds: researchAt,
      title: 'Research ready',
      body: fit(`The Labs have enough points for ${node.name}. They would like some credit.`, 'The Labs have enough points for new research. They would like some credit.'),
    });
  }
}

const RESOURCE_LABEL: Record<string, string> = {
  power: 'Power',
  food: 'Food',
  water: 'Water',
  medpatch: 'Med-Patches',
  purge: 'Purge',
};

// ------------------------------------------------------------------ entry point

/** Upcoming events, soonest first. Pure: it never changes the state or draws from its rng. */
export function upcomingReminders(state: GameState, content: Content, opts: ReminderOptions = {}): Reminder[] {
  const horizon = Math.max(0, opts.horizonSeconds ?? DEFAULT_HORIZON_SECONDS);
  const max = Math.max(0, Math.floor(opts.max ?? DEFAULT_MAX_REMINDERS));
  const simHorizon = Math.min(horizon, catchUpCapSeconds(state, content));
  const out: Draft[] = [];

  explorers(state, content, out);
  caravans(state, content, out);
  quests(state, out);
  deep(state, content, out);
  family(state, content, out);
  training(state, content, out);
  boards(state, content, out);
  outposts(state, content, out);
  crates(state, opts.utcOffsetMinutes ?? 0, out);
  if (simHorizon >= MIN_REMINDER_SECONDS) replay(state, content, Math.min(simHorizon, REPLAY_LIMIT_SECONDS), out);

  const seen = new Set<string>();
  return out
    .filter((d) => Number.isFinite(d.inSeconds) && d.inSeconds >= MIN_REMINDER_SECONDS && d.inSeconds <= (d.wallClock ? horizon : simHorizon))
    .map((d): Reminder => ({
      key: d.key,
      kind: d.kind,
      // Round up, so by the time the phone pings, the event has happened.
      inSeconds: Math.ceil(d.inSeconds - 1e-6),
      title: clip(d.title, TITLE_MAX),
      body: clip(d.body, BODY_MAX),
    }))
    .sort((a, b) => a.inSeconds - b.inSeconds || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .filter((r) => (seen.has(r.key) ? false : (seen.add(r.key), true)))
    .slice(0, max);
}

