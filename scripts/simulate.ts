// Headless balance run with a simple "sensible player" bot.
//   npm run sim -- [hours] [seed] [checkInMinutes]
// Prints a timeline of population, resources, incidents and crates, so pacing
// targets from the GDD can be checked without playing by hand.

import {
  advance,
  applyCommand,
  buildCost,
  canCraft,
  canExplore,
  canPlace,
  combatDamage,
  effectiveStat,
  foodDemandPerMin,
  availableQuests,
  canQuest,
  isAway,
  isChild,
  loadContent,
  newGame,
  population,
  powerDemandPerMin,
  resourceCapacity,
  roomCapacity,
  roomCells,
  roomDef,
  storageCapacity,
  upgradeCost,
  waterDemandPerMin,
  workshopRecipes,
  type GameState,
  type Resident,
  type Room,
} from '../src/sim';
import { playQuest } from '../src/sim/systems/questBot';

const content = loadContent();
const hours = Number(process.argv[2] ?? 48);
const seed = Number(process.argv[3] ?? 3);
const checkIn = Number(process.argv[4] ?? 1); // minutes between bot actions

const s: GameState = newGame(content, { seed, now: 0 });

function slots(type: string): { floor: number; x: number }[] {
  const def = content.rooms[type];
  if (!def) return [];
  const out: { floor: number; x: number }[] = [];
  for (const room of s.rooms) {
    const w = roomCells(content, room);
    for (const c of [
      { floor: room.floor, x: room.x + w },
      { floor: room.floor, x: room.x - def.cells },
      ...(type === 'elevator' && room.type === 'elevator' ? [{ floor: room.floor + 1, x: room.x }] : []),
    ]) {
      if (canPlace(s, content, type, c.floor, c.x).ok) out.push(c);
    }
  }
  // Prefer slots next to a room of the same type (merges), then shallow floors.
  const same = (c: { floor: number; x: number }) =>
    s.rooms.some((r) => r.type === type && r.floor === c.floor && (r.x + roomCells(content, r) === c.x || c.x + def.cells === r.x));
  return out.sort((a, b) => Number(same(b)) - Number(same(a)) || a.floor - b.floor || a.x - b.x);
}

function tryBuild(type: string): boolean {
  if (!s.unlockedRooms.includes(type) || s.scrip < buildCost(s, content, type) + 150) return false;
  for (const c of slots(type)) if (applyCommand(s, content, { type: 'build', roomType: type, ...c }).ok) return true;
  // No slot: extend the elevator shaft downwards.
  for (const c of slots('elevator')) if (applyCommand(s, content, { type: 'build', roomType: 'elevator', ...c }).ok) return false;
  return false;
}

function production(resource: string): number {
  let perMin = 0;
  for (const room of s.rooms) {
    const def = roomDef(content, room);
    if (def.produces?.resource !== resource) continue;
    const stat = def.stat;
    const total = s.residents.filter((r) => r.roomId === room.id && !r.dead && !isChild(s, r)).reduce((a, r) => a + (stat ? effectiveStat(content, r, stat) : 0), 0);
    if (total <= 0) continue;
    const secs = (def.produces.poolBase * room.segments) / total;
    perMin += (def.produces.output[room.level - 1]?.[room.segments - 1] ?? 0) / (secs / 60);
  }
  return perMin;
}

function freeSlots(room: Room): number {
  return roomCapacity(content, room) - s.residents.filter((r) => r.roomId === room.id && !r.dead).length;
}

let turn = 0;

/** Reassign workers: cover power, food and water by need first, best stat to each job. */
function rebalance(): void {
  const keep = new Set(s.rooms.filter((r) => ['door', 'living'].includes(roomDef(content, r).category)).map((r) => r.id));
  const workers = s.residents.filter(
    (r) => !r.dead && !r.waiting && !isChild(s, r) && r.expedition === null && (r.roomId === null || !keep.has(r.roomId)),
  );
  for (const r of workers) applyCommand(s, content, { type: 'assign', residentId: r.id, roomId: null });
  const pool = [...workers];
  const need: Record<string, number> = { power: powerDemandPerMin(s, content), food: foodDemandPerMin(s, content), water: waterDemandPerMin(s, content) };
  const essentials = s.rooms.filter((r) => need[roomDef(content, r).produces?.resource ?? ''] !== undefined);
  for (let guard = 0; guard < 500 && pool.length; guard++) {
    // The resource furthest below its demand gets the next worker.
    const open = essentials.filter((r) => freeSlots(r) > 0);
    if (!open.length) break;
    const ratio = (r: Room) => {
      const res = roomDef(content, r).produces?.resource ?? '';
      return production(res) / Math.max(0.01, need[res] ?? 1);
    };
    const room = open.sort((a, b) => ratio(a) - ratio(b))[0] as Room;
    if (ratio(room) > 2.5) break; // comfortably covered; leave the rest for other jobs
    const stat = roomDef(content, room).stat;
    pool.sort((a, b) => (stat ? effectiveStat(content, b, stat) - effectiveStat(content, a, stat) : 0));
    const w = pool.shift() as Resident;
    applyCommand(s, content, { type: 'assign', residentId: w.id, roomId: room.id });
  }
  // Everyone else to the job that best matches their top stat.
  for (const w of pool) {
    const jobs = s.rooms.filter((r) => ['production', 'radio', 'workshop'].includes(roomDef(content, r).category) && freeSlots(r) > 0);
    const best = jobs.sort((a, b) => {
      const sa = roomDef(content, a).stat;
      const sb = roomDef(content, b).stat;
      return (sb ? effectiveStat(content, w, sb) : 0) - (sa ? effectiveStat(content, w, sa) : 0);
    })[0];
    if (best) applyCommand(s, content, { type: 'assign', residentId: w.id, roomId: best.id });
  }
}

function botTurn(): void {
  turn++;
  applyCommand(s, content, { type: 'collectAll' });
  if (s.residents.some((r) => r.waiting)) applyCommand(s, content, { type: 'admitAll' });
  for (const tier of ['legendary', 'rare', 'standard'] as const) while (s.crates[tier] > 0) applyCommand(s, content, { type: 'openCrate', tier });
  for (const r of s.residents.filter((x) => x.dead)) applyCommand(s, content, { type: 'revive', residentId: r.id });
  for (const r of s.residents.filter((x) => !x.dead && x.hp < x.maxHp * 0.5)) applyCommand(s, content, { type: 'heal', residentId: r.id });

  // Gear: best weapons to the door guards first, then anyone.
  const weapons = s.items.filter((i) => content.items[i.defId]?.kind === 'weapon');
  const armed = [...s.residents].filter((r) => !r.dead && !r.waiting).sort((a, b) => combatDamage(content, a) - combatDamage(content, b));
  for (const w of weapons.sort((a, b) => (content.weapons[b.defId]?.max ?? 0) - (content.weapons[a.defId]?.max ?? 0))) {
    const target = armed.shift();
    const def = content.weapons[w.defId];
    if (target && def && (def.min + def.max) / 2 > combatDamage(content, target)) applyCommand(s, content, { type: 'equip', residentId: target.id, itemId: w.id });
  }
  for (const o of s.items.filter((i) => content.items[i.defId]?.kind === 'outfit')) {
    const target = s.residents.find((r) => !r.dead && !r.waiting && !r.outfit);
    if (target) applyCommand(s, content, { type: 'equip', residentId: target.id, itemId: o.id });
  }

  // Build: grow beds ahead of population, and production ahead of demand.
  const pop = population(s);
  const expectingNow = s.residents.filter((r) => r.pregnancy).length;
  if (storageCapacity(s, content, 'population') - pop - expectingNow < 4) tryBuild('quarters');
  // Add a production room for a short resource only when its rooms are already
  // fully staffed (empty rooms still draw power, which is how homesteads spiral).
  const roomTypeFor: Record<string, string> = { power: 'generator', food: 'canteen', water: 'waterworks' };
  const demand: Record<string, number> = { power: powerDemandPerMin(s, content), food: foodDemandPerMin(s, content), water: waterDemandPerMin(s, content) };
  for (const res of ['power', 'food', 'water']) {
    const type = roomTypeFor[res] as string;
    const full = s.rooms.filter((r) => r.type === type).every((r) => freeSlots(r) === 0);
    if (full && production(res) < (demand[res] ?? 0) * 1.4) {
      tryBuild(type);
      break;
    }
  }
  if (turn % 60 === 0) rebalance();
  if (pop >= 14 && !s.rooms.some((r) => r.type === 'clinic')) tryBuild('clinic');
  if (pop >= 20 && s.rooms.filter((r) => r.type === 'radio').length < 1) tryBuild('radio');
  if (pop >= 12 && s.items.length >= storageCapacity(s, content, 'items') - 2) tryBuild('storeroom');
  // Spend spare scrip on upgrades, production and beds first.
  for (const room of [...s.rooms].sort((a, b) => a.level - b.level)) {
    const cost = upgradeCost(content, room);
    if (cost !== null && s.scrip > cost * 3 + 500 && roomDef(content, room).category !== 'elevator') {
      applyCommand(s, content, { type: 'upgrade', roomId: room.id });
    }
  }

  // Door guards: the two best-armed adults.
  const door = s.rooms.find((r) => r.type === 'door');
  if (door && freeSlots(door) > 0) {
    const guard = s.residents
      .filter((r) => !r.dead && !r.waiting && !isChild(s, r) && r.roomId === null)
      .sort((a, b) => combatDamage(content, b) - combatDamage(content, a))[0];
    if (guard) applyCommand(s, content, { type: 'assign', residentId: guard.id, roomId: door.id });
  }

  // Breeding: one couple in the quarters while there are spare beds.
  const quarters = s.rooms.find((r) => r.type === 'quarters');
  const spare = storageCapacity(s, content, 'population') - pop;
  const expecting = s.residents.filter((r) => r.pregnancy).length;
  if (quarters && spare - expecting >= 2) {
    const inside = s.residents.filter((r) => r.roomId === quarters.id && !r.dead);
    const pick = (sex: 'f' | 'm') =>
      s.residents.find((r) => r.sex === sex && !r.dead && !r.waiting && !isChild(s, r) && !r.pregnancy && r.roomId !== door?.id && r.roomId !== quarters.id);
    for (const sex of ['f', 'm'] as const) {
      if (inside.some((r) => r.sex === sex)) continue;
      const who = pick(sex);
      if (who) applyCommand(s, content, { type: 'assign', residentId: who.id, roomId: quarters.id });
    }
  }
  // Send pregnant women and finished couples back to work.
  for (const r of s.residents.filter((x) => x.roomId === quarters?.id && (x.pregnancy || !x.courtship))) {
    if (r.pregnancy || s.residents.some((o) => o.pregnancy?.fatherId === r.id)) applyCommand(s, content, { type: 'assign', residentId: r.id, roomId: null });
  }

  // Exploration: keep a couple of explorers out once the homestead can spare them.
  const out = s.expeditions.filter((e) => e.status !== 'returned');
  for (const e of s.expeditions) {
    if (e.status === 'returned') applyCommand(s, content, { type: 'collectExpedition', expeditionId: e.id });
    else if (e.status === 'exploring' && e.elapsed > 10 * 3600) applyCommand(s, content, { type: 'recall', expeditionId: e.id });
    else if (e.status === 'dead') applyCommand(s, content, { type: 'revive', residentId: e.residentId });
  }
  const wantOut = pop >= 30 ? 3 : pop >= 12 ? 1 : 0;
  if (out.length < wantOut) {
    const scout = s.residents
      .filter((r) => canExplore(s, content, r) === null && r.roomId !== door?.id)
      .sort((a, b) => combatDamage(content, b) + b.level - (combatDamage(content, a) + a.level))[0];
    if (scout) {
      const med = Math.min(5, Math.floor(s.resources.medpatch));
      const pur = Math.min(3, Math.floor(s.resources.purge));
      applyCommand(s, content, { type: 'explore', residentId: scout.id, regionId: 'dustbowl', medpatch: med, purge: pur });
    }
  }

  // Crafting: a weapon workshop once unlocked; craft the best known weapon we can afford.
  if (pop >= 22 && !s.rooms.some((r) => r.type === 'weaponshop')) tryBuild('weaponshop');
  for (const shop of s.rooms.filter((r) => roomDef(content, r).category === 'workshop')) {
    if (shop.job && shop.job.remaining <= 0) applyCommand(s, content, { type: 'collectCraft', roomId: shop.id });
    if (!shop.job) {
      const options = workshopRecipes(content, shop).filter((rec) => canCraft(s, content, shop, rec.defId) === null);
      const best = options.sort((a, b) => b.minLevel - a.minLevel || b.scrip - a.scrip)[0];
      if (best) applyCommand(s, content, { type: 'craft', roomId: shop.id, defId: best.defId });
    }
    if (freeSlots(shop) > 0) {
      const helper = s.residents.find((r) => !r.dead && !r.waiting && !isChild(s, r) && r.roomId === null && !isAway(r));
      if (helper) applyCommand(s, content, { type: 'assign', residentId: helper.id, roomId: shop.id });
    }
  }

  runQuests();

  // Jobs: fill production rooms with the best-matching idle adults.
  const idle = s.residents.filter((r) => !r.dead && !r.waiting && !isChild(s, r) && r.roomId === null && !isAway(r));
  const jobs = s.rooms.filter((r) => {
    const cat = roomDef(content, r).category;
    return (cat === 'production' || cat === 'radio') && freeSlots(r) > 0;
  });
  for (const r of idle) {
    const best = jobs
      .filter((room) => freeSlots(room) > 0)
      .sort((a, b) => {
        const sa = roomDef(content, a).stat;
        const sb = roomDef(content, b).stat;
        return (sb ? effectiveStat(content, r, sb) : 0) - (sa ? effectiveStat(content, r, sa) : 0);
      })[0];
    if (best) applyCommand(s, content, { type: 'assign', residentId: r.id, roomId: best.id });
  }
}

/**
 * Quests: build the Command Office at 18, send the three strongest on the
 * next story quest once they are near its level, otherwise take a contract.
 * On-site play is handed to the quest bot (which plays in real time).
 */
function runQuests(): void {
  if (population(s) >= 18 && !s.rooms.some((r) => r.type === 'office')) tryBuild('office');
  for (const q of s.quests) {
    if (q.status === 'returned') {
      applyCommand(s, content, { type: 'collectQuest', questId: q.id });
      if (q.outcome) bump(`${q.contract ? 'contract' : q.defId}.${q.outcome}`);
    } else if (q.status === 'onsite') questSeconds += playQuest(s, content, q.id);
  }
  const office = s.rooms.find((r) => r.type === 'office');
  if (!office || s.quests.length >= (office.level)) return;
  const door = s.rooms.find((r) => r.type === 'door');
  const team = s.residents
    .filter((r) => canQuest(s, r) === null && r.roomId !== door?.id && !r.dead)
    .sort((a, b) => b.level + combatDamage(content, b) * 2 - (a.level + combatDamage(content, a) * 2))
    .slice(0, 3);
  if (team.length < 3) return;
  const avg = team.reduce((a, r) => a + r.level, 0) / team.length;
  const med = Math.min(5, Math.floor(s.resources.medpatch));
  const next = availableQuests(s, content).sort((a, b) => a.order - b.order)[0];
  const ids = team.map((r) => r.id);
  // Go a couple of levels over, as the quest screen recommends.
  if (next && avg >= next.level + 2) {
    applyCommand(s, content, { type: 'startQuest', questId: next.id, residentIds: ids, medpatch: med });
    return;
  }
  const offer = [...s.contracts.offers].sort((a, b) => a.level - b.level)[0];
  if (offer && offer.level <= avg + 1) applyCommand(s, content, { type: 'startContract', contractId: offer.id, residentIds: ids, medpatch: med });
}

const botStats: Record<string, number> = {};
let questSeconds = 0;
function bump(key: string): void {
  botStats[key] = (botStats[key] ?? 0) + 1;
}

const row = (h: number) => {
  const r = s.resources;
  const living = s.residents.filter((x) => !x.dead && !x.waiting);
  const kids = living.filter((x) => isChild(s, x)).length;
  const bar = (k: 'power' | 'food' | 'water') => `${Math.round(r[k])}/${resourceCapacity(s, content, k)}`.padStart(8);
  console.log(
    `h${String(h).padStart(3)} pop ${String(population(s)).padStart(3)} (kids ${kids}) waiting ${s.residents.filter((x) => x.waiting).length}` +
      `  P${bar('power')} F${bar('food')} W${bar('water')}  scrip ${String(Math.round(s.scrip)).padStart(6)}` +
      `  rooms ${s.rooms.length}  incidents ${s.stats['incidentsResolved'] ?? 0} deaths ${s.stats['deaths'] ?? 0}` +
      `  crates ${s.stats['cratesOpened'] ?? 0} births ${s.stats['births'] ?? 0} ach ${Object.keys(s.achievements).length}`,
  );
};

const milestones: Record<number, number> = {};
for (let minute = 0; minute <= hours * 60; minute++) {
  if (minute % 60 === 0 && (minute / 60) % Math.max(1, Math.floor(hours / 24)) === 0) row(minute / 60);
  if (minute % checkIn === 0) botTurn();
  for (const m of [10, 20, 30, 40, 50]) if (population(s) >= m && milestones[m] === undefined) milestones[m] = minute / 60;
  advance(s, content, 60);
}
console.log('\nhours to reach population:', Object.entries(milestones).map(([p, h]) => `${p}: ${h.toFixed(1)}h`).join('  '));
console.log('crates earned', s.stats['cratesEarned'] ?? 0, 'opened', s.stats['cratesOpened'] ?? 0, '· legendary items', s.stats['legendaryItems'] ?? 0, '· raids repelled', s.stats['incidentsResolved.rustmen'] ?? 0, 'escaped', s.stats['raidsEscaped'] ?? 0);
console.log('crate sources:', Object.entries(s.stats).filter(([k]) => k.startsWith('cratesFrom.')).map(([k, v]) => `${k.slice(11)} ${v}`).join(', '));
console.log('pregnancies', s.stats['pregnancies'] ?? 0, 'still pregnant', s.residents.filter((r) => r.pregnancy).length, 'overdue', s.residents.filter((r) => r.pregnancy && r.pregnancy.dueAt < s.time).length);
console.log('deaths by cause:', Object.entries(s.stats).filter(([k]) => k.startsWith('deaths.')).map(([k, v]) => `${k.slice(7)} ${v}`).join(', '));
console.log('exploration:', ['expeditionsCompleted', 'explorerSeconds', 'glarelandsScrip', 'encountersWon', 'salvageFound', 'fragmentsFound', 'recipesLearned', 'itemsCrafted'].map((k) => `${k} ${Math.round(s.stats[k] ?? 0)}`).join(', '));
console.log('salvage bin:', Object.entries(s.salvage).filter(([, n]) => n > 0).map(([k, n]) => `${k}×${n}`).join(' ') || 'empty', '· recipes', s.recipes.length);
console.log('highest level', s.stats['highestLevel'], '· level-ups', s.stats['levelUps'], '· arrivals', ['wanderer', 'radio', 'crate'].map((k) => `${k} ${s.stats['arrivals.' + k] ?? 0}`).join(' '));
console.log(
  'quests:',
  ['questsStarted', 'questsCompleted', 'storyQuestsCompleted', 'contractsCompleted', 'questWipes', 'bossesDefeated', 'questCrits', 'abilitiesUsed'].map((k) => `${k} ${s.stats[k] ?? 0}`).join(', '),
  `· story done: ${s.questsDone.join(' ') || 'none'} · outcomes ${JSON.stringify(botStats)} · ${Math.round(questSeconds / 60)} min on site`,
);
const unused: Resident[] = s.residents.filter((r) => !r.dead && !r.waiting && !isChild(s, r) && r.roomId === null);
console.log('idle adults at end:', unused.length);
