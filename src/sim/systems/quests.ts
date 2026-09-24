// Quests: parties of up to three leave from the Command Office, travel to a
// site, and fight through a small side-view map of rooms in real time
// (GDD §9, research 03 §5). See docs/design/M4-spec.md.
//
// A quest instance carries everything about the run: the rolled map, the
// party's combat state and the loot found so far. The player steers it with
// commands (move, target, crit, ability, heal, choose); the rest runs in
// tickQuests. Travel continues offline, but nothing on site does: a party
// never fights while the player is away (safe-offline rule).

import type { Content } from '../content';
import { addScrip, resourceCapacity } from '../economy';
import { bonus } from '../bonuses';
import { bump, bumpMax, effectiveMaxHp, effectiveStat, grantXp, isAway, isChild } from '../residents';
import { chance, nextFloat, nextInt, pick } from '../rng';
import { traitCheckBonus, traitCombatMult, traitCritRingMult, traitDamageTakenMult } from './traits';
import {
  STAT_KEYS,
  type ContractOffer,
  type CrateTier,
  type GameState,
  type Quest,
  type QuestEnemy,
  type QuestMember,
  type QuestOutcome,
  type QuestReward,
  type QuestRoom,
  type QuestRoomKind,
  type Rarity,
  type Resident,
  type StatKey,
} from '../types';
import { earnCrate } from './crates';
import { addFragment, addSalvage, fragmentsNeeded, knowsRecipe, unlockRecipe } from './inventory';
import { grantItem, randomItemOf } from './items';

// ------------------------------------------------------------------ content types

export interface EnemyAbilityDef {
  id: string;
  name: string;
  /** Seconds between uses (the first use comes after `every` too). */
  every: number;
  /** Seconds of visible wind-up before it lands; a stun cancels it. */
  windup: number;
  /**
   * slam: hits every party member for power × a normal hit.
   * heavy: hits the target for power × a normal hit.
   * summon: brings in the `adds`.
   * enrage: multiplies damage by power for `duration` seconds.
   * heal: restores power × max HP to itself.
   */
  effect: 'slam' | 'heavy' | 'summon' | 'enrage' | 'heal';
  power?: number;
  adds?: string[];
  duration?: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  /** Art key for the client (rustman, skitter, burrower, hollowed, mauler, ...). */
  look: string;
  hp: number;
  damage: [number, number];
  /** Seconds between attacks. */
  interval: number;
  xp: number;
  boss?: boolean;
  abilities?: EnemyAbilityDef[];
  /** Rolled into the quest's loot when it is beaten. */
  drop?: QuestReward;
}

export interface QuestRoomDef {
  id: string;
  floor: number;
  col: number;
  links: string[];
  kind: QuestRoomKind;
  enemies?: string[];
  /** Pick one enemy group from content.quests.pools[pool] instead. */
  pool?: string;
  loot?: QuestReward;
  event?: string;
  objective?: boolean;
}

export interface QuestMapDef {
  rooms: QuestRoomDef[];
  /** Room ids whose contents (kind, enemies, loot, event) are shuffled among themselves at start. */
  shuffle?: string[];
}

export interface EventOutcomeDef {
  text: string;
  reward?: QuestReward;
  /** Enemies that attack (the room becomes a fight). */
  fight?: string[];
  /** Damage to every party member, as a fraction of max HP (never downs anyone). */
  damage?: number;
}

export interface EventOptionDef {
  label: string;
  /** Checked against the party's best effective stat + a 0..4 roll. No stat = always succeeds. */
  stat?: StatKey;
  difficulty?: number;
  success: EventOutcomeDef;
  failure?: EventOutcomeDef;
}

export interface QuestEventDef {
  id: string;
  text: string;
  options: EventOptionDef[];
}

export interface QuestDef {
  id: string;
  /** Questline id (story quests only). */
  line: string;
  order: number;
  title: string;
  /** Who gives it (HALCY, a legendary resident, a faction...). */
  giver: string;
  brief: string;
  debrief: string;
  requires: { quests: string[]; population?: number };
  /** Enemy level: scales enemy HP and damage. The UI shows it as the recommended level. */
  level: number;
  partyMin?: number;
  travelMinutes: number;
  map: QuestMapDef;
  rewards: QuestReward;
}

export interface ContractTemplateDef {
  id: string;
  /** May contain {place}. */
  title: string;
  brief: string;
  places: string[];
  travelMinutes: [number, number];
  map: QuestMapDef;
  /** What the bounty names up front. Legendary bounties are always fragments. */
  bounty: { rarity: 'rare' | 'legendary'; kind?: 'weapon' | 'outfit'; scrip: [number, number] };
}

export interface AbilityDef {
  id: string;
  name: string;
  description: string;
  stat: StatKey;
  cooldown: number;
  /** Multiplier on a normal hit (strike, aoe) or on the effect. */
  power: number;
  /** Seconds (stun, taunt, rally). */
  duration: number;
}

export interface QuestTuning {
  maxParty: number;
  /** Concurrent quests per Command Office level. */
  officeSlots: number[];
  maxSupplies: number;
  walkSeconds: number;
  attackInterval: number;
  fists: [number, number];
  damagePerLevel: number;
  /** Damage reduction per point of effective Grit, and the cap. */
  gritReduction: number;
  maxReduction: number;
  enemyHpPerLevel: number;
  enemyDamagePerLevel: number;
  critPerHit: number;
  critPerHitPerFortune: number;
  critMin: number;
  critMax: number;
  /** Crit ring sweeps per second: base - perSight × Sight, floored at min. */
  critRingBase: number;
  critRingPerSight: number;
  critRingMin: number;
  medpatchHeal: number;
  /** Downed members stand back up with this fraction of max HP when a room is cleared. */
  recoverHp: number;
  /** Members who were downed get this share of fight XP. */
  downedXp: number;
  tauntReduction: number;
  /**
   * Smaller parties face weaker enemies: HP and damage are multiplied by
   * base + (1 - base) × size / maxParty.
   */
  partyScaleHp: number;
  partyScaleDamage: number;
  contracts: { offers: number; refreshHours: number; unlockedBy: string; levelSpread: number };
  /** Levels between a quest's recommended level and the level its enemies fight at. */
  recommendedOffset: number;
}

export interface QuestContent {
  tuning: QuestTuning;
  abilities: Record<StatKey, AbilityDef>;
  enemies: Record<string, EnemyDef>;
  pools: Record<string, string[][]>;
  events: Record<string, QuestEventDef>;
  questlines: { id: string; name: string; quests: string[] }[];
  quests: QuestDef[];
  contracts: ContractTemplateDef[];
}

export function questContent(content: Content): QuestContent {
  return content.quests as unknown as QuestContent;
}

const tuning = (content: Content) => questContent(content).tuning;

export function questDef(content: Content, id: string): QuestDef | undefined {
  return questContent(content).quests.find((q) => q.id === id);
}

export function enemyDef(content: Content, id: string): EnemyDef {
  const def = questContent(content).enemies[id];
  if (!def) throw new Error(`unknown enemy ${id}`);
  return def;
}

// ------------------------------------------------------------------ queries

const findResident = (state: GameState, id: number) => state.residents.find((r) => r.id === id);
const findQuest = (state: GameState, id: number) => state.quests.find((q) => q.id === id);

/** Concurrent quests the Command Office allows (0 without one). */
export function officeSlots(state: GameState, content: Content): number {
  const office = state.rooms.find((r) => r.type === 'office');
  return office ? (tuning(content).officeSlots[office.level - 1] ?? 1) + bonus(state, content, 'questSlots') : 0;
}

/** Why a resident can't join a party, or null if they can. */
export function canQuest(state: GameState, r: Resident): string | null {
  if (r.dead) return 'fallen residents cannot go';
  if (r.waiting) return 'let them in first';
  if (isAway(r)) return r.quest !== null ? 'already on a quest' : 'out exploring';
  if (isChild(state, r)) return 'children are too young';
  if (r.pregnancy !== null) return 'too risky while expecting';
  return null;
}

/** Why a story quest can't be started yet, or null if it can. */
export function questLocked(state: GameState, content: Content, def: QuestDef): string | null {
  if (state.questsDone.includes(def.id)) return 'already done';
  if (state.quests.some((q) => q.defId === def.id)) return 'in progress';
  const missing = def.requires.quests.find((id) => !state.questsDone.includes(id));
  if (missing) return `finish "${questDef(content, missing)?.title ?? missing}" first`;
  if (def.requires.population && state.peakPopulation < def.requires.population) return `needs population ${def.requires.population}`;
  return null;
}

/** Story quests that can be started now. */
export function availableQuests(state: GameState, content: Content): QuestDef[] {
  return questContent(content).quests.filter((q) => questLocked(state, content, q) === null);
}

/** The active ability a resident brings, from their best effective stat (ties go in stat order). */
export function abilityFor(content: Content, r: Resident): AbilityDef {
  let best: StatKey = 'brawn';
  for (const k of STAT_KEYS) if (effectiveStat(content, r, k) > effectiveStat(content, r, best)) best = k;
  return questContent(content).abilities[best];
}

/** Crit multiplier for a timing quality in 0..1 (1 = perfect). */
export function critMultiplier(content: Content, quality: number): number {
  const t = tuning(content);
  const q = Math.max(0, Math.min(1, quality));
  return t.critMin + (t.critMax - t.critMin) * q;
}

/** How fast the crit ring sweeps for this resident (sweeps per second); Sight slows it. */
export function critRingSpeed(content: Content, r: Resident): number {
  const t = tuning(content);
  // M6 trait hook (Steady Hands): traitCritRingMult slows the ring further.
  return Math.max(t.critRingMin, t.critRingBase - t.critRingPerSight * effectiveStat(content, r, 'sight')) * traitCritRingMult(content, r);
}

/** Fraction of incoming damage a resident shrugs off (Grit, outfit included). */
export function damageReduction(content: Content, r: Resident): number {
  const t = tuning(content);
  return Math.min(t.maxReduction, t.gritReduction * effectiveStat(content, r, 'grit'));
}

/**
 * A quest's `level` is the level we recommend for the party. Enemies are
 * scaled as if the party were a little under it, so a party at the
 * recommended level wins comfortably and one below it has a real fight.
 */
export function enemyLevel(content: Content, q: { level: number }): number {
  return Math.max(1, q.level - tuning(content).recommendedOffset);
}

export function currentRoom(q: Quest): QuestRoom | undefined {
  return q.rooms.find((r) => r.id === q.roomId);
}

export function inCombat(q: Quest): boolean {
  return q.status === 'onsite' && q.enemies.some((e) => e.hp > 0);
}

// ------------------------------------------------------------------ starting

function emptyLoot(): Quest['loot'] {
  return { scrip: 0, items: [], salvage: {}, fragments: {}, recipes: [], crates: {}, medpatch: 0, purge: 0, xp: 0 };
}

/** Build the run's rooms from a map definition: resolve pools, shuffle contents. */
function rollMap(state: GameState, content: Content, map: QuestMapDef): QuestRoom[] {
  const pools = questContent(content).pools;
  const rooms: QuestRoom[] = map.rooms.map((d) => ({
    id: d.id,
    floor: d.floor,
    col: d.col,
    links: [...d.links],
    kind: d.kind,
    enemies: d.pool ? [...pick(state.rng, pools[d.pool] ?? [[]])] : [...(d.enemies ?? [])],
    loot: d.loot ?? null,
    event: d.event ?? null,
    objective: d.objective ?? false,
    visited: false,
    cleared: false,
  }));
  // Undirected links, whichever side the author wrote them on.
  for (const r of rooms) for (const id of r.links) {
    const other = rooms.find((x) => x.id === id);
    if (other && !other.links.includes(r.id)) other.links.push(r.id);
  }
  const ids = (map.shuffle ?? []).filter((id) => rooms.some((r) => r.id === id));
  const contents = ids.map((id) => {
    const r = rooms.find((x) => x.id === id) as QuestRoom;
    return { kind: r.kind, enemies: r.enemies, loot: r.loot, event: r.event, objective: r.objective };
  });
  for (let i = contents.length - 1; i > 0; i--) {
    const j = nextInt(state.rng, 0, i);
    [contents[i], contents[j]] = [contents[j]!, contents[i]!];
  }
  ids.forEach((id, i) => Object.assign(rooms.find((x) => x.id === id) as QuestRoom, contents[i]));
  return rooms;
}

interface StartOptions {
  residentIds: number[];
  medpatch: number;
}

/** Start a story quest (questId = definition id) or a contract (contractId = offer id). */
export function startQuest(
  state: GameState,
  content: Content,
  target: { questId: string } | { contractId: number },
  opts: StartOptions,
): string | null {
  const t = tuning(content);
  if (officeSlots(state, content) === 0) return 'build a Command Office first';
  if (state.quests.length >= officeSlots(state, content)) return 'no free quest slots: upgrade the Command Office';

  let defId: string;
  let title: string;
  let level: number;
  let travel: number;
  let map: QuestMapDef;
  let contract: ContractOffer | null = null;
  let partyMin = 1;
  if ('questId' in target) {
    const def = questDef(content, target.questId);
    if (!def) return 'no such quest';
    const locked = questLocked(state, content, def);
    if (locked) return locked;
    defId = def.id;
    title = def.title;
    level = def.level;
    travel = def.travelMinutes * 60;
    map = def.map;
    partyMin = def.partyMin ?? 1;
  } else {
    const offer = state.contracts.offers.find((o) => o.id === target.contractId);
    if (!offer) return 'that contract is gone';
    const tpl = questContent(content).contracts.find((c) => c.id === offer.templateId);
    if (!tpl) return 'that contract is gone';
    defId = tpl.id;
    title = offer.title;
    level = offer.level;
    travel = offer.travelSeconds;
    map = tpl.map;
    contract = offer;
  }

  const ids = [...new Set(opts.residentIds)];
  if (ids.length < partyMin) return `needs at least ${partyMin} residents`;
  if (ids.length > t.maxParty) return `at most ${t.maxParty} residents`;
  const party: Resident[] = [];
  for (const id of ids) {
    const r = findResident(state, id);
    if (!r) return 'no such resident';
    const why = canQuest(state, r);
    if (why) return `${r.firstName}: ${why}`;
    party.push(r);
  }
  const medpatch = Math.floor(opts.medpatch);
  if (medpatch < 0 || medpatch > t.maxSupplies) return `take 0 to ${t.maxSupplies} Med-Patches`;
  if (medpatch > state.resources.medpatch) return 'not enough Med-Patches';

  state.resources.medpatch -= medpatch;
  if (contract) state.contracts.offers = state.contracts.offers.filter((o) => o !== contract);
  const rooms = rollMap(state, content, map);
  const start = rooms.find((r) => r.kind === 'start') ?? rooms[0];
  if (!start) return 'this quest has no map';
  const quest: Quest = {
    id: state.nextId++,
    defId,
    contract,
    title,
    level,
    status: 'travelling',
    outcome: null,
    travelTotal: travel,
    travelRemaining: travel,
    party: party.map((r) => ({
      residentId: r.id,
      downed: false,
      target: null,
      attackTimer: 0,
      crit: 0,
      abilityCooldown: abilityFor(content, r).cooldown / 2,
      taunt: 0,
    })),
    rooms,
    roomId: start.id,
    moving: null,
    enemies: [],
    pendingEvent: null,
    log: [],
    loot: emptyLoot(),
    supplies: { medpatch },
    rally: 0,
    onsiteTime: 0,
  };
  for (const r of party) {
    r.quest = quest.id;
    r.roomId = null;
    r.courtship = null;
  }
  state.quests.push(quest);
  bump(state, 'questsStarted');
  state.events.push({ type: 'questStarted', questId: quest.id });
  return null;
}

// ------------------------------------------------------------------ rewards

function rollRange(state: GameState, v: number | [number, number] | undefined): number {
  if (v === undefined) return 0;
  return typeof v === 'number' ? v : nextInt(state.rng, v[0], v[1]);
}

function unknownRecipes(state: GameState, content: Content, loot: Quest['loot'], rarity: Rarity, kind?: string): string[] {
  return Object.values(content.items)
    .filter((d) => d.rarity === rarity && (!kind || d.kind === kind))
    .map((d) => d.id)
    .filter((id) => !knowsRecipe(state, content, id) && !loot.recipes.includes(id))
    .filter((id) => (state.fragments[id] ?? 0) + (loot.fragments[id] ?? 0) < fragmentsNeeded(content, id));
}

function addTo(bag: Record<string, number>, id: string, n: number): void {
  bag[id] = (bag[id] ?? 0) + n;
}

/**
 * Roll a reward into the quest's loot (paid out at collection). Returns a
 * short description for the log. Regions are applied at collection too.
 */
export function rollReward(state: GameState, content: Content, q: Quest, reward: QuestReward): string {
  const loot = q.loot;
  const parts: string[] = [];
  const scrip = rollRange(state, reward.scrip);
  if (scrip > 0) {
    loot.scrip += scrip;
    parts.push(`${scrip} scrip`);
  }
  if (reward.xp) loot.xp += reward.xp;
  for (const id of reward.items ?? []) {
    loot.items.push(id);
    parts.push(content.items[id]?.name ?? id);
  }
  if (reward.item && chance(state.rng, reward.item.chance)) {
    const kind = reward.item.kind ?? (chance(state.rng, 0.5) ? 'weapon' : 'outfit');
    const id = randomItemOf(state, content, kind, reward.item.rarity);
    loot.items.push(id);
    parts.push(content.items[id]?.name ?? id);
  }
  if (reward.salvage) {
    const s = reward.salvage;
    const pool = content.salvageList.filter((x) => x.rarity === s.rarity && (!s.materials || s.materials.includes(x.material)));
    const n = rollRange(state, s.count);
    for (let i = 0; i < n && pool.length; i++) addTo(loot.salvage, pick(state.rng, pool).id, 1);
    if (n > 0 && pool.length) parts.push(`${n} salvage`);
  }
  for (const [id, n] of Object.entries(reward.fragments ?? {})) {
    addTo(loot.fragments, id, n);
    parts.push(`${n} ${content.items[id]?.name ?? id} fragment${n > 1 ? 's' : ''}`);
  }
  if (reward.fragment && chance(state.rng, reward.fragment.chance)) {
    const pool = unknownRecipes(state, content, loot, reward.fragment.rarity);
    if (pool.length) {
      const id = pick(state.rng, pool);
      addTo(loot.fragments, id, 1);
      parts.push(`a ${content.items[id]?.name ?? id} fragment`);
    }
  }
  for (const id of reward.recipes ?? []) {
    if (!loot.recipes.includes(id)) loot.recipes.push(id);
    parts.push(`${content.items[id]?.name ?? id} recipe`);
  }
  for (const [tier, n] of Object.entries(reward.crates ?? {}) as [CrateTier, number][]) {
    addTo(loot.crates, tier, n);
    parts.push(`${n} ${tier} Supply Crate${n > 1 ? 's' : ''}`);
  }
  if (reward.medpatch) {
    loot.medpatch += reward.medpatch;
    parts.push(`${reward.medpatch} Med-Patch${reward.medpatch > 1 ? 'es' : ''}`);
  }
  if (reward.purge) {
    loot.purge += reward.purge;
    parts.push(`${reward.purge} Purge`);
  }
  return parts.join(', ');
}

function log(q: Quest, text: string): void {
  if (!text) return;
  q.log.push(text);
  if (q.log.length > 40) q.log.shift();
}

// ------------------------------------------------------------------ rooms and movement

function members(state: GameState, q: Quest): { m: QuestMember; r: Resident }[] {
  const out: { m: QuestMember; r: Resident }[] = [];
  for (const m of q.party) {
    const r = findResident(state, m.residentId);
    if (r) out.push({ m, r });
  }
  return out;
}

function standing(state: GameState, q: Quest) {
  return members(state, q).filter(({ m, r }) => !m.downed && !r.dead && r.hp > 0);
}

/** Enemy scaling for a smaller party (1 for a full one). */
function partyScale(content: Content, q: Quest, base: number): number {
  return base + ((1 - base) * Math.min(q.party.length, tuning(content).maxParty)) / tuning(content).maxParty;
}

function spawn(state: GameState, content: Content, q: Quest, ids: string[]): void {
  const t = tuning(content);
  const scale = (1 + t.enemyHpPerLevel * (enemyLevel(content, q) - 1)) * partyScale(content, q, t.partyScaleHp);
  for (const id of ids) {
    const def = enemyDef(content, id);
    const hp = Math.round(def.hp * scale);
    q.enemies.push({
      uid: state.nextId++,
      defId: id,
      hp,
      maxHp: hp,
      attackTimer: def.interval * (0.5 + nextFloat(state.rng) * 0.5),
      target: null,
      abilityTimers: (def.abilities ?? []).map((a) => a.every),
      windup: null,
      stunned: 0,
      enraged: 0,
      enrageMult: 1,
    });
  }
}

function startFight(state: GameState, content: Content, q: Quest, room: QuestRoom, ids: string[]): void {
  spawn(state, content, q, ids);
  const t = tuning(content);
  for (const { m } of standing(state, q)) m.attackTimer = t.attackInterval * (0.3 + nextFloat(state.rng) * 0.4);
  state.events.push({ type: 'questCombat', questId: q.id, roomId: room.id });
}

function enterRoom(state: GameState, content: Content, q: Quest, room: QuestRoom): void {
  q.roomId = room.id;
  const first = !room.visited;
  room.visited = true;
  state.events.push({ type: 'questRoomEntered', questId: q.id, roomId: room.id });
  if (room.cleared || !first) return;
  if ((room.kind === 'fight' || room.kind === 'boss') && room.enemies.length) {
    startFight(state, content, q, room, room.enemies);
    return;
  }
  if (room.kind === 'event' && room.event) {
    q.pendingEvent = room.event;
    state.events.push({ type: 'questEventPrompt', questId: q.id, eventId: room.event });
    return;
  }
  clearRoom(state, content, q, room);
}

function clearRoom(state: GameState, content: Content, q: Quest, room: QuestRoom): void {
  room.cleared = true;
  if (room.loot) {
    const text = rollReward(state, content, q, room.loot);
    if (text) {
      log(q, `Found ${text}.`);
      state.events.push({ type: 'questLoot', questId: q.id, text });
    }
  }
  state.events.push({ type: 'questRoomCleared', questId: q.id, roomId: room.id });
  if (room.objective) finish(state, content, q, 'success');
}

/** Walk the party to a linked room. */
export function questMove(state: GameState, content: Content, questId: number, roomId: string): string | null {
  void content;
  const q = findQuest(state, questId);
  if (!q) return 'no such quest';
  if (q.status !== 'onsite') return 'the party is not on site';
  if (q.moving) return 'already on the move';
  if (inCombat(q)) return 'finish the fight first';
  if (q.pendingEvent) return 'decide what to do first';
  const here = currentRoom(q);
  const to = q.rooms.find((r) => r.id === roomId);
  if (!here || !to) return 'no such room';
  if (!here.links.includes(to.id)) return 'not reachable from here';
  q.moving = { to: to.id, remaining: tuning(content).walkSeconds };
  return null;
}

// ------------------------------------------------------------------ combat

function hitRoll(state: GameState, content: Content, r: Resident): number {
  const t = tuning(content);
  const w = r.weapon ? content.weapons[r.weapon] : undefined;
  const [lo, hi] = w ? [w.min, w.max] : t.fists;
  return nextInt(state.rng, lo, hi) + t.damagePerLevel * r.level;
}

function livingEnemies(q: Quest): QuestEnemy[] {
  return q.enemies.filter((e) => e.hp > 0);
}

/**
 * The member's chosen target, else the automatic one: adds before a boss,
 * then whoever is closest to going down.
 */
function pickTarget(content: Content, q: Quest, m: QuestMember): QuestEnemy | undefined {
  const alive = livingEnemies(q);
  const chosen = alive.find((e) => e.uid === m.target);
  if (chosen) return chosen;
  const boss = (e: QuestEnemy) => (enemyDef(content, e.defId).boss ? 1 : 0);
  return [...alive].sort((a, b) => boss(a) - boss(b) || a.hp - b.hp || a.uid - b.uid)[0];
}

function damageEnemy(state: GameState, content: Content, q: Quest, e: QuestEnemy, amount: number, source: number, crit: boolean): void {
  if (e.hp <= 0) return;
  const dealt = Math.max(1, Math.round(amount));
  e.hp = Math.max(0, e.hp - dealt);
  state.events.push({ type: 'questHit', questId: q.id, from: 'party', source, target: e.uid, amount: dealt, crit });
  if (e.hp > 0) return;
  e.windup = null;
  bump(state, 'questEnemiesDefeated');
  const def = enemyDef(content, e.defId);
  // Bosses count once the quest succeeds (see collectQuest), so abandoning can't farm them.
  if (def.boss) q.loot.bosses = (q.loot.bosses ?? 0) + 1;
  state.events.push({ type: 'questEnemyDown', questId: q.id, enemyUid: e.uid });
  q.loot.xp += def.xp;
  if (def.drop) {
    const text = rollReward(state, content, q, def.drop);
    if (text) log(q, `${def.name} dropped ${text}.`);
  }
}

/** Party-wide damage multiplier (Rally). */
function partyMultiplier(content: Content, q: Quest): number {
  return q.rally > 0 ? questContent(content).abilities.charm.power : 1;
}

function memberAttack(state: GameState, content: Content, q: Quest, m: QuestMember, r: Resident): void {
  const t = tuning(content);
  const e = pickTarget(content, q, m);
  if (!e) return;
  // M6 trait hook (Hothead, Egghead): traitCombatMult.
  damageEnemy(state, content, q, e, hitRoll(state, content, r) * partyMultiplier(content, q) * traitCombatMult(content, r), r.id, false);
  m.crit = Math.min(1, m.crit + t.critPerHit + t.critPerHitPerFortune * effectiveStat(content, r, 'fortune'));
}

function damageMember(state: GameState, content: Content, q: Quest, m: QuestMember, r: Resident, amount: number, source: number): void {
  if (m.downed) return;
  const t = tuning(content);
  let dmg = amount * (1 - damageReduction(content, r));
  if (m.taunt > 0) dmg *= 1 - t.tauntReduction;
  dmg *= traitDamageTakenMult(content, r); // M6 trait hook (Hard Case)
  dmg = Math.max(1, Math.round(dmg));
  r.hp = Math.max(0, r.hp - dmg);
  state.events.push({ type: 'questHit', questId: q.id, from: 'enemy', source, target: r.id, amount: dmg, crit: false });
  if (r.hp > 0) return;
  m.downed = true;
  m.wasDowned = true;
  m.taunt = 0;
  state.events.push({ type: 'questMemberDown', questId: q.id, residentId: r.id });
}

function enemyHit(state: GameState, content: Content, q: Quest, e: QuestEnemy): number {
  const t = tuning(content);
  const def = enemyDef(content, e.defId);
  const scale = (1 + t.enemyDamagePerLevel * (enemyLevel(content, q) - 1)) * partyScale(content, q, t.partyScaleDamage);
  return nextInt(state.rng, def.damage[0], def.damage[1]) * scale * (e.enraged > 0 ? e.enrageMult : 1);
}

function enemyTarget(state: GameState, q: Quest, e: QuestEnemy) {
  const up = standing(state, q);
  const taunter = up.find(({ m }) => m.taunt > 0);
  if (taunter) return taunter;
  const current = up.find(({ r }) => r.id === e.target);
  if (current) return current;
  const next = up.length ? pick(state.rng, up) : undefined;
  e.target = next?.r.id ?? null;
  return next;
}

function resolveAbility(state: GameState, content: Content, q: Quest, e: QuestEnemy, a: EnemyAbilityDef): void {
  const power = a.power ?? 1;
  switch (a.effect) {
    case 'slam':
      for (const { m, r } of standing(state, q)) damageMember(state, content, q, m, r, enemyHit(state, content, q, e) * power, e.uid);
      break;
    case 'heavy': {
      const t = enemyTarget(state, q, e);
      if (t) damageMember(state, content, q, t.m, t.r, enemyHit(state, content, q, e) * power, e.uid);
      break;
    }
    case 'summon':
      spawn(state, content, q, a.adds ?? []);
      break;
    case 'enrage':
      e.enraged = a.duration ?? 8;
      e.enrageMult = power;
      break;
    case 'heal':
      e.hp = Math.min(e.maxHp, e.hp + Math.round(e.maxHp * power));
      break;
  }
}

function tickEnemy(state: GameState, content: Content, q: Quest, e: QuestEnemy, dt: number): void {
  const def = enemyDef(content, e.defId);
  if (e.enraged > 0) e.enraged = Math.max(0, e.enraged - dt);
  if (e.stunned > 0) {
    e.stunned = Math.max(0, e.stunned - dt);
    return;
  }
  const abilities = def.abilities ?? [];
  if (e.windup) {
    e.windup.remaining -= dt;
    if (e.windup.remaining <= 0) {
      const a = abilities[e.windup.index];
      e.windup = null;
      if (a) resolveAbility(state, content, q, e, a);
    }
    return; // winding up takes the enemy's whole attention
  }
  for (let i = 0; i < abilities.length; i++) {
    e.abilityTimers[i] = (e.abilityTimers[i] ?? 0) - dt;
    const a = abilities[i]!;
    if (e.abilityTimers[i]! <= 0) {
      e.abilityTimers[i] = a.every;
      e.windup = { index: i, remaining: a.windup };
      state.events.push({ type: 'questWindup', questId: q.id, enemyUid: e.uid, ability: a.id, seconds: a.windup });
      return;
    }
  }
  e.attackTimer -= dt;
  while (e.attackTimer <= 0 && e.hp > 0) {
    e.attackTimer += def.interval;
    const t = enemyTarget(state, q, e);
    if (!t) return;
    damageMember(state, content, q, t.m, t.r, enemyHit(state, content, q, e), e.uid);
  }
}

function tickCombat(state: GameState, content: Content, q: Quest, dt: number): void {
  const t = tuning(content);
  for (const { m, r } of standing(state, q)) {
    m.attackTimer -= dt;
    while (m.attackTimer <= 0 && livingEnemies(q).length) {
      m.attackTimer += t.attackInterval;
      memberAttack(state, content, q, m, r);
    }
  }
  for (const e of livingEnemies(q)) tickEnemy(state, content, q, e, dt);

  if (!standing(state, q).length) {
    finish(state, content, q, 'failed');
    return;
  }
  if (!livingEnemies(q).length) endFight(state, content, q);
}

function endFight(state: GameState, content: Content, q: Quest): void {
  const t = tuning(content);
  q.enemies = [];
  for (const { m, r } of members(state, q)) {
    m.taunt = 0;
    m.target = null;
    if (m.downed) {
      m.downed = false;
      r.hp = Math.max(r.hp, Math.ceil(effectiveMaxHp(r) * t.recoverHp * (1 + bonus(state, content, 'questHeal'))));
    }
  }
  const room = currentRoom(q);
  if (room && !room.cleared) clearRoom(state, content, q, room);
}

/** Point the party (or one member) at an enemy. */
export function questTarget(state: GameState, content: Content, questId: number, enemyUid: number, residentId?: number): string | null {
  void content;
  const q = findQuest(state, questId);
  if (!q) return 'no such quest';
  const e = q.enemies.find((x) => x.uid === enemyUid && x.hp > 0);
  if (!e) return 'no such enemy';
  for (const m of q.party) if (residentId === undefined || m.residentId === residentId) m.target = e.uid;
  return null;
}

/** Land a critical hit; quality (0..1) is how well the player timed the ring. */
export function questCrit(state: GameState, content: Content, questId: number, residentId: number, quality: number): string | null {
  const q = findQuest(state, questId);
  if (!q) return 'no such quest';
  if (!inCombat(q)) return 'no fight going on';
  const m = q.party.find((x) => x.residentId === residentId);
  const r = findResident(state, residentId);
  if (!m || !r || m.downed) return 'they are not standing';
  if (m.crit < 1) return 'crit meter not full';
  const e = pickTarget(content, q, m);
  if (!e) return 'nothing to hit';
  m.crit = 0;
  bump(state, 'questCrits');
  if (quality >= 0.95) bump(state, 'perfectCrits');
  damageEnemy(state, content, q, e, hitRoll(state, content, r) * partyMultiplier(content, q) * critMultiplier(content, quality), r.id, true);
  if (!livingEnemies(q).length) endFight(state, content, q);
  return null;
}

/** Use a resident's ability (see abilityFor). */
export function questAbility(state: GameState, content: Content, questId: number, residentId: number): string | null {
  const q = findQuest(state, questId);
  if (!q) return 'no such quest';
  if (q.status !== 'onsite') return 'the party is not on site';
  const m = q.party.find((x) => x.residentId === residentId);
  const r = findResident(state, residentId);
  if (!m || !r || m.downed || r.dead) return 'they are not standing';
  if (m.abilityCooldown > 0) return 'not ready yet';
  const a = abilityFor(content, r);
  const fight = inCombat(q);
  const target = pickTarget(content, q, m);
  switch (a.stat) {
    case 'brawn':
    case 'sight': {
      if (!fight || !target) return 'no fight going on';
      damageEnemy(state, content, q, target, hitRoll(state, content, r) * a.power * partyMultiplier(content, q), r.id, true);
      if (a.stat === 'brawn' && target.hp > 0) {
        target.stunned = a.duration;
        if (target.windup) {
          target.windup = null;
          bump(state, 'questInterrupts');
          state.events.push({ type: 'questInterrupted', questId: q.id, enemyUid: target.uid });
        }
      }
      break;
    }
    case 'grit':
      if (!fight) return 'no fight going on';
      m.taunt = a.duration;
      break;
    case 'charm':
      if (!fight) return 'no fight going on';
      q.rally = a.duration;
      break;
    case 'wits': {
      const hurt = members(state, q).filter(({ r: x }) => !x.dead && x.hp < effectiveMaxHp(x));
      if (!hurt.length) return 'nobody needs patching up';
      for (const { m: x, r: y } of hurt) {
        y.hp = Math.min(effectiveMaxHp(y), y.hp + effectiveMaxHp(y) * a.power);
        x.downed = false;
      }
      break;
    }
    case 'knack':
      if (!fight) return 'no fight going on';
      for (const e of livingEnemies(q)) damageEnemy(state, content, q, e, hitRoll(state, content, r) * a.power * partyMultiplier(content, q), r.id, false);
      break;
    case 'fortune':
      if (!fight) return 'no fight going on';
      for (const x of q.party) if (!x.downed) x.crit = 1;
      break;
  }
  m.abilityCooldown = a.cooldown;
  bump(state, 'abilitiesUsed');
  state.events.push({ type: 'questAbility', questId: q.id, residentId: r.id, ability: a.id });
  if (fight && !livingEnemies(q).length) endFight(state, content, q);
  return null;
}

/** Use one of the party's Med-Patches on a standing member. */
export function questHeal(state: GameState, content: Content, questId: number, residentId: number): string | null {
  const q = findQuest(state, questId);
  if (!q) return 'no such quest';
  if (q.status !== 'onsite') return 'the party is not on site';
  const m = q.party.find((x) => x.residentId === residentId);
  const r = findResident(state, residentId);
  if (!m || !r || r.dead) return 'no such party member';
  if (m.downed) return 'they are down until the fight ends';
  if (q.supplies.medpatch < 1) return 'no Med-Patches left';
  if (r.hp >= effectiveMaxHp(r) - 0.5) return 'already at full health';
  q.supplies.medpatch--;
  r.hp = Math.min(effectiveMaxHp(r), r.hp + r.maxHp * tuning(content).medpatchHeal * (1 + bonus(state, content, 'questHeal')));
  bump(state, 'medpatchesUsed');
  return null;
}

/** Answer the pending event in the current room. */
export function questChoose(state: GameState, content: Content, questId: number, option: number): string | null {
  const q = findQuest(state, questId);
  if (!q) return 'no such quest';
  if (!q.pendingEvent) return 'nothing to decide';
  const ev = questContent(content).events[q.pendingEvent];
  const opt = ev?.options[option];
  if (!ev || !opt) return 'no such option';
  let success = true;
  if (opt.stat) {
    // M6 trait hook (Lucky Break): traitCheckBonus per member.
    const best = Math.max(0, ...standing(state, q).map(({ r }) => effectiveStat(content, r, opt.stat as StatKey) + traitCheckBonus(content, r, 'questCheck')));
    success = best + nextInt(state.rng, 0, 4) >= (opt.difficulty ?? 0);
  }
  const outcome = success ? opt.success : (opt.failure ?? opt.success);
  q.pendingEvent = null;
  bump(state, success ? 'questChecksPassed' : 'questChecksFailed');
  let text = outcome.text;
  if (outcome.reward) {
    const got = rollReward(state, content, q, outcome.reward);
    if (got) text += ` (${got})`;
  }
  if (outcome.damage) {
    for (const { r } of standing(state, q)) r.hp = Math.max(1, r.hp - effectiveMaxHp(r) * outcome.damage);
  }
  log(q, text);
  state.events.push({ type: 'questEventResolved', questId: q.id, eventId: ev.id, success, text });
  const room = currentRoom(q);
  if (outcome.fight?.length && room) startFight(state, content, q, room, outcome.fight);
  else if (room) clearRoom(state, content, q, room);
  return null;
}

// ------------------------------------------------------------------ finishing

function finish(state: GameState, content: Content, q: Quest, outcome: QuestOutcome): void {
  if (q.outcome) return;
  q.outcome = outcome;
  q.status = 'returning';
  q.moving = null;
  q.enemies = [];
  q.pendingEvent = null;
  q.travelRemaining = q.travelTotal;
  if (outcome !== 'failed') {
    // Anyone still down gets back on their feet for the walk home.
    const t = tuning(content);
    for (const { m, r } of members(state, q)) {
      if (m.downed || r.hp <= 0) r.hp = Math.max(r.hp, Math.ceil(effectiveMaxHp(r) * t.recoverHp));
      m.downed = false;
    }
  }
  if (outcome === 'failed') {
    // A wiped party comes home as bodies, to be revived or laid to rest.
    for (const { r } of members(state, q)) {
      r.hp = 0;
      r.dead = true;
      state.events.push({ type: 'residentDied', residentId: r.id });
    }
    bump(state, 'questWipes');
  }
  if (outcome === 'success') {
    const def = q.contract ? undefined : questDef(content, q.defId);
    if (def) {
      const text = rollReward(state, content, q, def.rewards);
      if (text) log(q, `Reward: ${text}.`);
    } else if (q.contract) {
      const text = rollReward(state, content, q, q.contract.bounty);
      if (text) log(q, `Bounty: ${text}.`);
    }
  }
  state.events.push({ type: 'questFinished', questId: q.id, outcome });
}

/** Give up: the party heads home with whatever they found, and no completion reward. */
export function abandonQuest(state: GameState, content: Content, questId: number): string | null {
  const q = findQuest(state, questId);
  if (!q) return 'no such quest';
  if (q.status === 'returning' || q.status === 'returned') return 'already heading home';
  if (q.status === 'travelling') {
    // Turning back on the road takes as long as they have walked.
    q.outcome = 'abandoned';
    q.status = 'returning';
    q.travelRemaining = q.travelTotal - q.travelRemaining;
    state.events.push({ type: 'questFinished', questId: q.id, outcome: 'abandoned' });
    return null;
  }
  finish(state, content, q, 'abandoned');
  return null;
}

/** A party back home: pay out and bring everyone inside. */
export function collectQuest(state: GameState, content: Content, questId: number): string | null {
  const q = findQuest(state, questId);
  if (!q) return 'no such quest';
  if (q.status !== 'returned') return 'the party is not home yet';
  const loot = q.loot;
  for (const id of loot.items) grantItem(state, content, id);
  for (const [id, n] of Object.entries(loot.salvage)) addSalvage(state, content, id, n);
  for (const [id, n] of Object.entries(loot.fragments)) addFragment(state, content, id, n);
  for (const id of loot.recipes) unlockRecipe(state, content, id, 'found');
  for (const [tier, n] of Object.entries(loot.crates) as [CrateTier, number][]) {
    for (let i = 0; i < n; i++) earnCrate(state, tier, 'quest');
  }
  addScrip(state, content, loot.scrip);
  for (const key of ['medpatch', 'purge'] as const) {
    const extra = loot[key] + (key === 'medpatch' ? q.supplies.medpatch : 0);
    const cap = resourceCapacity(state, content, key);
    state.resources[key] = Math.max(state.resources[key], Math.min(cap, state.resources[key] + extra));
  }

  const party = members(state, q);
  // Fight XP is shared; anyone who went down along the way gets a smaller share.
  const alive = party.filter(({ r }) => !r.dead);
  const weight = (m: QuestMember) => (m.wasDowned ? tuning(content).downedXp : 1);
  const shares = alive.reduce((a, { m }) => a + weight(m), 0);
  for (const { m, r } of alive) {
    if (loot.xp > 0 && shares > 0) grantXp(state, content, r, Math.round((loot.xp * weight(m)) / shares));
  }
  for (const { r } of party) {
    r.quest = null;
    r.roomId = null;
  }
  state.quests = state.quests.filter((x) => x !== q);

  if (q.outcome === 'success') {
    bump(state, 'questsCompleted');
    bump(state, 'bossesDefeated', loot.bosses ?? 0);
    const def = q.contract ? undefined : questDef(content, q.defId);
    if (def) {
      if (!state.questsDone.includes(def.id)) state.questsDone.push(def.id);
      for (const region of def.rewards.regions ?? []) if (!state.regionsUnlocked.includes(region)) state.regionsUnlocked.push(region);
      bump(state, 'storyQuestsCompleted');
      bump(state, `questline.${def.line}`);
    } else {
      bump(state, 'contractsCompleted');
    }
    bumpMax(state, 'questPartyLevel', Math.max(...party.map(({ r }) => r.level)));
  }
  bump(state, 'questScrip', loot.scrip);
  state.events.push({ type: 'questCollected', questId: q.id, outcome: q.outcome ?? 'abandoned', defId: q.defId });
  return null;
}

// ------------------------------------------------------------------ contracts

function contractLevel(state: GameState, content: Content): number {
  const levels = state.residents.filter((r) => !r.dead && !r.waiting).map((r) => r.level).sort((a, b) => b - a);
  const top = levels.slice(0, 3);
  const avg = top.length ? top.reduce((a, b) => a + b, 0) / top.length : 1;
  const spread = tuning(content).contracts.levelSpread;
  // Offers are stated as a recommended level, a little above the team's average fight level.
  return Math.max(1, Math.round(avg + tuning(content).recommendedOffset + nextInt(state.rng, -spread, spread)));
}

function bountyFor(state: GameState, content: Content, tpl: ContractTemplateDef): QuestReward {
  const b = tpl.bounty;
  const reward: QuestReward = { scrip: nextInt(state.rng, b.scrip[0], b.scrip[1]) };
  const candidates = Object.values(content.items).filter((d) => d.rarity === b.rarity && (!b.kind || d.kind === b.kind));
  const unknown = candidates.filter((d) => !knowsRecipe(state, content, d.id));
  if (b.rarity === 'legendary' && !unknown.length) {
    // Every legendary of this kind is already known: fragments would be worthless.
    reward.crates = { legendary: 1 };
    return reward;
  }
  const item = pick(state.rng, unknown.length ? unknown : candidates);
  if (!item) return reward;
  if (b.rarity === 'legendary') {
    // Legendaries never drop whole (GDD §15): the bounty names the fragments.
    const need = Math.max(1, fragmentsNeeded(content, item.id) - (state.fragments[item.id] ?? 0));
    reward.fragments = { [item.id]: Math.min(need, nextInt(state.rng, 1, 2)) };
  } else {
    reward.items = [item.id];
  }
  return reward;
}

/** Offer a fresh set of contracts. */
export function refreshContracts(state: GameState, content: Content): void {
  const t = tuning(content).contracts;
  const templates = questContent(content).contracts;
  state.contracts.offers = [];
  if (!templates.length) return;
  const offers = t.offers + bonus(state, content, 'contractOffers');
  for (let i = 0; i < offers; i++) {
    const tpl = pick(state.rng, templates);
    const place = tpl.places.length ? pick(state.rng, tpl.places) : '';
    state.contracts.offers.push({
      id: state.nextId++,
      templateId: tpl.id,
      title: tpl.title.replace('{place}', place),
      brief: tpl.brief.replace('{place}', place),
      level: contractLevel(state, content),
      travelSeconds: nextInt(state.rng, tpl.travelMinutes[0], tpl.travelMinutes[1]) * 60,
      bounty: bountyFor(state, content, tpl),
      expiresAt: state.time + t.refreshHours * 3600,
    });
  }
  state.contracts.refreshAt = state.time + t.refreshHours * 3600;
  state.events.push({ type: 'contractsRefreshed' });
}

/** Contracts open up after the questline's first quest, then refresh every few hours (tuning.contracts.refreshHours). */
function tickContracts(state: GameState, content: Content): void {
  const t = tuning(content).contracts;
  if (!state.questsDone.includes(t.unlockedBy)) return;
  if (state.time >= state.contracts.refreshAt) refreshContracts(state, content);
}

// ------------------------------------------------------------------ tick

/** Advance every quest by dt seconds. Travel runs offline; nothing on site does. */
export function tickQuests(state: GameState, content: Content, dt: number, offline: boolean): void {
  tickContracts(state, content);
  for (const q of [...state.quests]) {
    if (q.status === 'travelling' || q.status === 'returning') {
      q.travelRemaining -= dt;
      if (q.travelRemaining > 0) continue;
      q.travelRemaining = 0;
      if (q.status === 'returning') {
        q.status = 'returned';
        state.events.push({ type: 'questReturned', questId: q.id });
        continue;
      }
      q.status = 'onsite';
      state.events.push({ type: 'questArrived', questId: q.id });
      const start = currentRoom(q);
      if (start) enterRoom(state, content, q, start);
      continue;
    }
    if (q.status !== 'onsite' || offline) continue;
    q.onsiteTime += dt;
    q.rally = Math.max(0, q.rally - dt);
    for (const m of q.party) {
      m.abilityCooldown = Math.max(0, m.abilityCooldown - dt);
      m.taunt = Math.max(0, m.taunt - dt);
    }
    if (q.moving) {
      q.moving.remaining -= dt;
      if (q.moving.remaining <= 0) {
        const to = q.rooms.find((r) => r.id === q.moving?.to);
        q.moving = null;
        if (to) enterRoom(state, content, q, to);
      }
      continue;
    }
    if (inCombat(q)) tickCombat(state, content, q, dt);
  }
}
