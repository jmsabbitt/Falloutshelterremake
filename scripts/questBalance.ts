// Plays every story quest and contract with the quest bot across a spread of
// party levels and gear, and prints win rate, time on site and HP left, plus
// boss-fight length and danger. Story setups are relative to each quest's
// level, so the M4 balance targets (docs/design/M4-spec.md) can be read off
// directly; a summary at the end checks them.
// Usage: npm run quest-balance [-- runs [sizes]]  (default 20 runs, party sizes 3,1)
import { advance, applyCommand, loadContent, newGame, questContent, type GameState, type Quest } from '../src/sim';
import { hpPerLevel } from '../src/sim/residents';
import { playQuest } from '../src/sim/systems/questBot';
import { enemyDef, refreshContracts } from '../src/sim/systems/quests';

const content = loadContent();
const runs = Number(process.argv[2] ?? 20);
const sizes = (process.argv[3] ?? '3,1').split(',').map(Number);
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
}

const storySetups: Setup[] = [
  { name: 'L-2 fists', gear: 'fists', offset: -2 },
  { name: 'L common', gear: 'common', offset: 0 },
  { name: 'L+2 common', gear: 'common', offset: 2 },
  { name: 'L+2 rare', gear: 'rare', offset: 2 },
  { name: 'L20 rare', gear: 'rare', level: 20 },
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
  s.rooms.push({ id: s.nextId++, type: 'office', floor: 0, x: 13, segments: 1, level: 3, pool: 0, ready: false, powered: true, timer: 0, job: null });
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
  s.peakPopulation = 100; // population gates are not what is being tested
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
  return { win: q.outcome === 'success', secs, hpLeft, patches: MEDPATCH - q.supplies.medpatch, bossSecs, bossLow };
}

function runStory(questId: string, level: number, weapon: string | null, size: number, seed: number): Result {
  const { s, ids } = game(seed, level, weapon, size);
  const def = questContent(content).quests.find((q) => q.id === questId)!;
  s.questsDone = [...def.requires.quests];
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

const quests = questContent(content).quests;
const act1 = questContent(content).questlines.find((l) => l.id === 'act1')?.quests ?? [];
const finale = act1[act1.length - 1];

for (const size of sizes) {
  console.log(`\n=== party of ${size}: story (setups relative to the quest's level) ===`);
  console.log(''.padEnd(22), storySetups.map((x) => x.name.padEnd(44)).join('| '));
  for (const def of quests) {
    const cells = storySetups.map((setup) => {
      const level = Math.max(1, setup.level ?? def.level + (setup.offset ?? 0));
      return cell((seed) => runStory(def.id, level, weaponFor(setup.gear, level), size, seed));
    });
    console.log(`${def.id} (L${def.level})`.padEnd(22), cells.map((c) => fmt(c).padEnd(44)).join('| '));
    if (size !== 3) continue;
    const [fists, , plus2, rare] = cells as [Cell, Cell, Cell, Cell];
    const avg = plus2.secs / runs;
    check(plus2.wins / runs >= 0.9 && avg >= 60 && avg <= 180, `${def.id}: L+2 common wins ${pct(plus2.wins)} (>=90%) in ${Math.round(avg)}s (60-180s)`);
    if (def.level >= 5) check(fists.wins / runs < 0.5, `${def.id}: L-2 fists wins ${pct(fists.wins)} (should usually lose)`);
    if (def.id === finale) {
      const boss = rare.bossFights ? rare.bossSecs / rare.bossFights : 0;
      check(
        rare.wins === runs && boss >= 45 && boss <= 120 && rare.bossDanger / Math.max(1, rare.bossFights) >= 0.5,
        `${def.id} boss: L+2 rare wins ${pct(rare.wins)}, fight ${Math.round(boss)}s (45-120s), someone <50% HP in ${Math.round((100 * rare.bossDanger) / Math.max(1, rare.bossFights))}% of runs`,
      );
    }
  }

  console.log(`\n=== party of ${size}: contracts at the party's own level ===`);
  console.log(''.padEnd(22), contractLevels.map((l) => `L${l} ${contractGear(l)}`.padEnd(44)).join('| '));
  for (const tpl of questContent(content).contracts) {
    const cells = contractLevels.map((level) => cell((seed) => runContract(tpl.id, level, weaponFor(contractGear(level), level), size, seed)));
    console.log(tpl.id.padEnd(22), cells.map((c) => fmt(c).padEnd(44)).join('| '));
    if (size !== 3) continue;
    const worst = Math.min(...cells.map((c) => c.wins));
    check(worst / runs >= 0.85, `${tpl.id}: worst win rate at own level ${pct(worst)} (>=85%)`);
  }
}

console.log(`\n=== targets (party of 3, ${runs} runs each) ===`);
for (const line of checks) console.log(line);
