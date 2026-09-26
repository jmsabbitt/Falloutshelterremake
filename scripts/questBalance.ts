// Plays every story quest and contract with the quest bot across a spread of
// party levels and gear, and prints win rate, time on site and HP left, plus
// boss-fight length and danger. Story setups are relative to each quest's
// level, so the M4 balance targets (docs/design/M4-spec.md) can be read off
// directly; a summary at the end checks them.
// Usage: npm run quest-balance [-- runs [sizes [filter]]]  (default 20 runs, party sizes 3,1;
// filter keeps only quests and contracts whose id starts with one of its comma-separated prefixes,
// e.g. act2,c_kiln). Act 3 quests run at their own cycle (3). Act 4: the last column gives network quests
// three relaying outposts and three allied factions (systems/network.ts); the targets use the columns without it.
import { advance, applyCommand, loadContent, newGame, questContent, type GameState, type Quest } from '../src/sim';
import { hpPerLevel } from '../src/sim/residents';
import { playQuest } from '../src/sim/systems/questBot';
import { enemyDef, refreshContracts } from '../src/sim/systems/quests';

const content = loadContent();
const runs = Number(process.argv[2] ?? 20);
const sizes = (process.argv[3] ?? '3,1').split(',').map(Number);
const prefixes = (process.argv[4] ?? '').split(',').filter(Boolean);
const wanted = (id: string) => !prefixes.length || prefixes.some((p) => id.startsWith(p));
const MEDPATCH = 5;

type Gear = 'fists' | 'common' | 'rare';

/** What a party of that level plausibly carries: the common ladder tops out at the Scrap Carbine. */
function weaponFor(gear: Gear, level: number): string | null {
  if (gear === 'fists') return null;
  if (gear === 'common') return level <= 4 ? 'service_pistol' : level <= 6 ? 'nail_driver' : level <= 8 ? 'flare_gun' : 'scrap_carbine';
  return level < 15 ? 'rivet_rifle' : level < 20 ? 'arc_pistol' : 'coilgun';
}

interface Setup {
  name: string;
  gear: Gear;
  /** Party level relative to the quest's level, or an absolute level. */
  offset?: number;
  level?: number;
  /** Act 4: three outposts and three Friendly factions back the party on network quests. */
  net?: boolean;
}

const storySetups: Setup[] = [
  // Offsets are from the quest's recommended level (its `level`).
  { name: 'L-4 fists', gear: 'fists', offset: -4 },
  { name: 'L-2 common', gear: 'common', offset: -2 },
  { name: 'L common', gear: 'common', offset: 0 },
  { name: 'L rare', gear: 'rare', offset: 0 },
  { name: 'L20 rare', gear: 'rare', level: 20 },
  { name: 'L-2 common +net', gear: 'common', offset: -2, net: true },
];

/** Contracts roll their level from the party, so they are tested at the party's own level. */
const contractLevels = [3, 6, 10, 15, 20];
const contractGear = (level: number): Gear => (level < 12 ? 'common' : 'rare');

function game(seed: number, level: number, weapon: string | null, size: number): { s: GameState; ids: number[] } {
  const s = newGame(content, { seed, now: 0 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  s.resources.medpatch = 10;
  s.rooms.push({ id: s.nextId++, type: 'office', floor: 0, x: 13, segments: 1, level: 3, pool: 0, ready: false, powered: true, timer: 0, job: null, banked: 0 });
  const ids: number[] = [];
  for (const r of s.residents.slice(0, size)) {
    r.level = level;
    // HP as if they had levelled normally with their current Grit.
    r.maxHp = Math.round(content.balance.resident.baseHp + hpPerLevel(content, r) * (level - 1));
    r.hp = r.maxHp;
    r.weapon = weapon;
    ids.push(r.id);
  }
  s.questsDone = [];
  s.peakPopulation = 1000; // population gates are not what is being tested
  s.legacy.cycle = 3; // late acts open in later homesteads; runStory sets the quest's own cycle
  return { s, ids };
}

interface Result {
  win: boolean;
  secs: number;
  hpLeft: number;
  patches: number;
  /** Seconds spent fighting a boss, and the lowest HP fraction anyone reached meanwhile. */
  bossSecs: number;
  bossLow: number;
}

const hasBoss = (q: Quest) => q.enemies.some((e) => e.hp > 0 && enemyDef(content, e.defId).boss);

/** Run the bot a step at a time so the boss fight can be measured. */
function play(s: GameState, q: Quest, ids: number[]): Result {
  const res = (id: number) => s.residents.find((x) => x.id === id)!;
  let secs = 0;
  let bossSecs = 0;
  let bossLow = 1;
  // Network quests carry extra Med-Patches from the outposts.
  const packed = q.supplies.medpatch;
  while (q.status === 'onsite' && secs < 1800) {
    const step = playQuest(s, content, q.id, { maxSeconds: 0 });
    if (step === 0) break;
    secs += step;
    if (hasBoss(q)) {
      bossSecs += step;
      for (const id of ids) bossLow = Math.min(bossLow, res(id).hp / res(id).maxHp);
    }
  }
  const hpLeft = ids.reduce((a, id) => a + (res(id).dead ? 0 : res(id).hp / res(id).maxHp), 0) / ids.length;
  return { win: q.outcome === 'success', secs, hpLeft, patches: packed - q.supplies.medpatch, bossSecs, bossLow };
}

function runStory(questId: string, level: number, weapon: string | null, size: number, seed: number, net = false): Result {
  const { s, ids } = game(seed, level, weapon, size);
  if (net) {
    for (let i = 1; i <= 3; i++) s.legacy.outposts.push({ id: i, homesteadNumber: 100 + i, cycle: i, siteId: 'plot7', population: 40, rates: { scrip: 0, salvage: 0, cratesPerHour: 0 }, stored: { scrip: 0, salvage: 0, crates: 0 } });
    for (const f of ['caravaners', 'tinkers', 'lamplighters']) s.factions[f] = { rep: 30, met: true };
  }
  const def = questContent(content).quests.find((q) => q.id === questId)!;
  s.questsDone = [...def.requires.quests];
  s.legacy.cycle = Math.max(1, def.requires.cycle ?? 1);
  // Legend questlines need their legend at home; seat them as the party leader.
  if (def.requires.legend) s.residents.find((x) => x.id === ids[0])!.legendary = def.requires.legend;
  const r = applyCommand(s, content, { type: 'startQuest', questId, residentIds: ids, medpatch: MEDPATCH });
  if (!r.ok) throw new Error(r.reason);
  const q = s.quests[0]!;
  advance(s, content, q.travelTotal + 1);
  return play(s, q, ids);
}

function runContract(templateId: string, level: number, weapon: string | null, size: number, seed: number): Result {
  const { s, ids } = game(seed, level, weapon, size);
  refreshContracts(s, content);
  const offer = s.contracts.offers[0]!;
  offer.templateId = templateId;
  offer.level = level;
  const r = applyCommand(s, content, { type: 'startContract', contractId: offer.id, residentIds: ids, medpatch: MEDPATCH });
  if (!r.ok) throw new Error(r.reason);
  const q = s.quests[0]!;
  advance(s, content, q.travelTotal + 1);
  return play(s, q, ids);
}

interface Cell {
  wins: number;
  secs: number;
  hp: number;
  mp: number;
  bossSecs: number;
  bossDanger: number;
  bossFights: number;
}

function cell(run: (seed: number) => Result): Cell {
  const c: Cell = { wins: 0, secs: 0, hp: 0, mp: 0, bossSecs: 0, bossDanger: 0, bossFights: 0 };
  for (let i = 0; i < runs; i++) {
    const r = run(1000 + i);
    if (r.win) c.wins++;
    c.secs += r.secs;
    c.hp += r.hpLeft;
    c.mp += r.patches;
    if (r.bossSecs > 0) {
      c.bossFights++;
      c.bossSecs += r.bossSecs;
      if (r.bossLow < 0.5) c.bossDanger++;
    }
  }
  return c;
}

const pct = (n: number) => `${Math.round((100 * n) / runs)}%`;

function fmt(c: Cell): string {
  const base = `${pct(c.wins).padStart(4)} ${String(Math.round(c.secs / runs)).padStart(3)}s hp${pct(c.hp).padStart(4)} mp${(c.mp / runs).toFixed(1)}`;
  if (!c.bossFights) return base;
  return `${base} boss ${Math.round(c.bossSecs / c.bossFights)}s/${Math.round((100 * c.bossDanger) / c.bossFights)}%<50`;
}

const checks: string[] = [];
function check(ok: boolean, text: string): void {
  checks.push(`${ok ? 'ok  ' : 'MISS'} ${text}`);
}

const quests = questContent(content).quests.filter((q) => wanted(q.id));
const contracts = questContent(content).contracts.filter((c) => wanted(c.id));
/** The last quest of every questline is its finale boss. */
const finales = new Set(questContent(content).questlines.map((l) => l.quests[l.quests.length - 1]));

for (const size of sizes) {
  console.log(`\n=== party of ${size}: story (setups relative to the quest's level) ===`);
  console.log(''.padEnd(22), storySetups.map((x) => x.name.padEnd(44)).join('| '));
  for (const def of quests) {
    const cells = storySetups.map((setup) => {
      const level = Math.max(1, setup.level ?? def.level + (setup.offset ?? 0));
      return cell((seed) => runStory(def.id, level, weaponFor(setup.gear, level), size, seed, setup.net === true && def.network === true));
    });
    console.log(`${def.id} (L${def.level})`.padEnd(22), cells.map((c) => fmt(c).padEnd(44)).join('| '));
    if (size !== 3) continue;
    const [fists, , plus2, rare] = cells as [Cell, Cell, Cell, Cell];
    const avg = plus2.secs / runs;
    check(plus2.wins / runs >= 0.9 && avg >= 60 && avg <= 180, `${def.id}: recommended level, common gear wins ${pct(plus2.wins)} (>=90%) in ${Math.round(avg)}s (60-180s)`);
    if (def.level >= 5) check(fists.wins / runs < 0.5, `${def.id}: 4 levels under with fists wins ${pct(fists.wins)} (should usually lose)`);
    if (finales.has(def.id)) {
      const boss = rare.bossFights ? rare.bossSecs / rare.bossFights : 0;
      check(
        rare.wins === runs && boss >= 45 && boss <= 120 && rare.bossDanger / Math.max(1, rare.bossFights) >= 0.5,
        `${def.id} boss: recommended level, rare gear wins ${pct(rare.wins)}, fight ${Math.round(boss)}s (45-120s), someone <50% HP in ${Math.round((100 * rare.bossDanger) / Math.max(1, rare.bossFights))}% of runs`,
      );
    }
  }

  console.log(`\n=== party of ${size}: contracts at the party's own level ===`);
  console.log(''.padEnd(22), contractLevels.map((l) => `L${l} ${contractGear(l)}`.padEnd(44)).join('| '));
  for (const tpl of contracts) {
    const cells = contractLevels.map((level) => cell((seed) => runContract(tpl.id, level, weaponFor(contractGear(level), level), size, seed)));
    console.log(tpl.id.padEnd(22), cells.map((c) => fmt(c).padEnd(44)).join('| '));
    if (size !== 3) continue;
    const worst = Math.min(...cells.map((c) => c.wins));
    check(worst / runs >= 0.85, `${tpl.id}: worst win rate at own level ${pct(worst)} (>=85%)`);
  }
}

console.log(`\n=== targets (party of 3, ${runs} runs each) ===`);
for (const line of checks) console.log(line);
