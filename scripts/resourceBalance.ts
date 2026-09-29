// Supplies and production balance report (playtest 1, item 11).
//   npx vite-node scripts/resourceBalance.ts [hours=48] [seeds=3,5,7] [--no-sim]
// Part 1 is analytic, straight from rooms.json and balance.json: what one
// worker makes per hour in each production room (by level and width), how
// that compares to what one resident eats and drinks, and what a room costs.
// Part 2 runs the simulate.ts bot over several seeds (BALANCE_OUT) and reports
// how often each supply ran low, ran out or sat full, and how many workers
// each supply took per resident.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadContent, tableValue } from '../src/sim/content';

const content = loadContent();
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const hours = Number(args[0] ?? 48);
const seeds = (args[1] ?? '3,5,7').split(',').map(Number);
const noSim = process.argv.includes('--no-sim');

const STAT = 5; // a typical early worker's stat in their room (specialties roll 4 to 6)
const c = content.balance.consumption;
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);

// ------------------------------------------------------------------ analytic
console.log(`## Analytic: output per worker-hour (stat ${STAT}, no bonuses)\n`);
console.log('| Room | Makes | Stat | L1 1w | L1 2w | L1 3w | L2 3w | L3 3w | Residents fed per worker (L1 1w / L3 3w) | Build L1 (scrip) |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
const perResidentPerHour: Record<string, number> = { food: c.foodPerResidentPerMin * 60, water: c.waterPerResidentPerMin * 60 };
for (const def of content.roomList) {
  const p = def.produces;
  if (!p) continue;
  // points per second per worker = STAT; batch = poolBase × w; workers = capacityPerSegment × w
  const perWorkerHour = (level: number, w: number) => (tableValue(p.output, level, w) / (p.poolBase * w)) * STAT * 3600;
  const fed = (level: number, w: number) => (perResidentPerHour[p.resource] ? perWorkerHour(level, w) / (perResidentPerHour[p.resource] as number) : NaN);
  console.log(
    `| ${def.id} | ${p.resource} | ${def.stat} | ${f1(perWorkerHour(1, 1))} | ${f1(perWorkerHour(1, 2))} | ${f1(perWorkerHour(1, 3))} | ${f1(perWorkerHour(2, 3))} | ${f1(perWorkerHour(3, 3))} | ${isNaN(fed(1, 1)) ? '—' : `${f1(fed(1, 1))} / ${f1(fed(3, 3))}`} | ${def.cost.base} |`,
  );
}
console.log(`\nPer resident: food ${f1(perResidentPerHour.food ?? 0)}/h, water ${f1(perResidentPerHour.water ?? 0)}/h.`);
console.log('Power is per powered room (by level and width), per hour:');
console.log('| | 1w | 2w | 3w |\n|---|---|---|---|');
c.powerPerRoomPerMin.forEach((row, i) => console.log(`| L${i + 1} | ${row.map((v) => f1(v * 60)).join(' | ')} |`));
{
  // One stat-5 generator worker keeps how many rooms of the same level and width lit, against
  // one canteen worker feeding how many residents? (The bot runs below measure the real mix.)
  const gen = content.rooms['generator']?.produces;
  const can = content.rooms['canteen']?.produces;
  if (gen && can) {
    const perW = (p: typeof gen, l: number, w: number) => (tableValue(p.output, l, w) / (p.poolBase * w)) * STAT * 3600;
    console.log('\nOne stat-5 worker, in rooms of the given level and width:');
    console.log('| Room | Generator worker lights N rooms | Canteen worker feeds N residents | Ratio |');
    console.log('|---|---|---|---|');
    for (const [l, w] of [[1, 1], [1, 2], [2, 2], [2, 3], [3, 3]] as const) {
      const lit = perW(gen, l, w) / (tableValue(c.powerPerRoomPerMin, l, w) * 60);
      const fed = perW(can, l, w) / (perResidentPerHour.food ?? 1);
      console.log(`| L${l} ${w}w | ${f1(lit)} | ${f1(fed)} | ${f2(fed / lit)} |`);
    }
  }
}

if (noSim) process.exit(0);

// ------------------------------------------------------------------ bot runs
interface Out {
  seed: number;
  hours: number;
  deaths: number;
  pop: number;
  rooms: number;
  minutes: number;
  popMin: number;
  milestones: Record<string, number>;
  byRes: Record<string, { low: number; empty: number; full: number; short: number; producedPerMin: number; demandPerMin: number; workerMin: number; statMin: number }>;
  byRoom: Record<string, { workerMin: number; output: number; roomMin: number }>;
  hourly: { h: number; pop: number; rooms: number; res: Record<string, number>; cap: Record<string, number>; workers: Record<string, number>; made: Record<string, number>; demand: Record<string, number>; stat: Record<string, number>; potential: Record<string, number> }[];
}
const dir = mkdtempSync(join(tmpdir(), 'balance-'));
const runs: Out[] = [];
for (const seed of seeds) {
  const file = join(dir, `seed${seed}.json`);
  const r = spawnSync('npx', ['vite-node', 'scripts/simulate.ts', String(hours), String(seed), '1'], { env: { ...process.env, BALANCE_OUT: file }, encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stderr);
    process.exit(1);
  }
  runs.push(JSON.parse(readFileSync(file, 'utf8')) as Out);
}

console.log(`\n## Bot: ${hours}h, seeds ${seeds.join(', ')}\n`);
console.log('| Seed | Pop | Rooms | Deaths | Pop 20 / 40 / 75 at |');
console.log('|---|---|---|---|---|');
for (const o of runs) console.log(`| ${o.seed} | ${o.pop} | ${o.rooms} | ${o.deaths} | ${['20', '40', '75'].map((k) => (o.milestones[k] !== undefined ? `${f1(o.milestones[k] as number)}h` : '—')).join(' / ')} |`);

console.log('\n| Supply | Below 25% | Below shortage line | Empty | Full | Made/h | Used/h | Net/h | Workers per 10 residents |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const k of ['power', 'food', 'water', 'medpatch', 'purge']) {
  const sum = (fn: (o: Out) => number) => runs.reduce((a, o) => a + fn(o), 0);
  const mins = sum((o) => o.minutes);
  const b = (fn: (x: Out['byRes'][string]) => number) => sum((o) => fn(o.byRes[k] as Out['byRes'][string]));
  const made = (b((x) => x.producedPerMin) / mins) * 60;
  const used = (b((x) => x.demandPerMin) / mins) * 60;
  const perTen = (b((x) => x.workerMin) / sum((o) => o.popMin)) * 10;
  const line = k === 'medpatch' || k === 'purge' ? '—' : pct(b((x) => x.short) / mins);
  console.log(`| ${k} | ${pct(b((x) => x.low) / mins)} | ${line} | ${pct(b((x) => x.empty) / mins)} | ${pct(b((x) => x.full) / mins)} | ${f1(made)} | ${k === 'medpatch' || k === 'purge' ? '—' : f1(used)} | ${k === 'medpatch' || k === 'purge' ? '—' : f1(made - used)} | ${f2(perTen)} |`);
}

console.log('\nWorkers per 10 residents by stage (all seeds):');
console.log('| Hours | Pop | power | food | water | medpatch | purge |');
console.log('|---|---|---|---|---|---|---|');
const stages = [
  [0, 2],
  [2, 8],
  [8, 24],
  [24, 48],
  [48, 120],
].filter(([a]) => (a as number) < hours);
for (const [a, z] of stages) {
  const rows = runs.flatMap((o) => o.hourly.filter((h) => h.h > (a as number) && h.h <= (z as number)));
  if (!rows.length) continue;
  const pop = rows.reduce((s, h) => s + h.pop, 0);
  const w = (k: string) => f2((rows.reduce((s, h) => s + (h.workers[k] ?? 0), 0) / Math.max(1, pop)) * 10);
  console.log(`| ${a}-${z} | ${f1(pop / rows.length)} | ${w('power')} | ${w('food')} | ${w('water')} | ${w('medpatch')} | ${w('purge')} |`);
}

console.log(`\nLabour each supply needs per 10 residents, by stage: the crew stat it takes to make what is used,`);
console.log(`in stat-${STAT} workers (crew stat × used ÷ crew capacity ÷ ${STAT}). Used/h per resident and capacity ÷ use alongside.`);
console.log('| Hours | Pop | power | food | water | power used/h per resident | food used/h per resident | capacity ÷ use (P / F / W) |');
console.log('|---|---|---|---|---|---|---|---|');
for (const [a, z] of stages) {
  const rows = runs.flatMap((o) => o.hourly.filter((h) => h.h > (a as number) && h.h <= (z as number)));
  if (!rows.length) continue;
  const pop = rows.reduce((s, h) => s + h.pop, 0);
  const need = (k: string) => {
    const sum = (fn: (h: (typeof rows)[number]) => number) => rows.reduce((a, h) => a + fn(h), 0);
    // What the crews could make if every batch were collected at once (the bot overstaffs, so
    // collected amounts are capped by storage and say nothing about the labour needed).
    const made = sum((h) => h.potential[k] ?? 0);
    if (made <= 0) return '—';
    const crewStat = sum((h) => (h.stat[k] ?? 0) / 60) / rows.length;
    return f2(((crewStat * (sum((h) => h.demand[k] ?? 0) / made)) / STAT / (pop / rows.length)) * 10);
  };
  const used = (k: string) => f1(rows.reduce((s, h) => s + (h.demand[k] ?? 0), 0) / Math.max(1, pop));
  const over = (k: string) => f1(rows.reduce((s, h) => s + (h.potential[k] ?? 0), 0) / Math.max(1, rows.reduce((s, h) => s + (h.demand[k] ?? 0), 0)));
  console.log(`| ${a}-${z} | ${f1(pop / rows.length)} | ${need('power')} | ${need('food')} | ${need('water')} | ${used('power')} | ${used('food')} | ${over('power')} / ${over('food')} / ${over('water')} |`);
}

console.log('\nRoom output per worker-hour, as built by the bot (all seeds, rooms seen for at least 2 room-hours):');
console.log('| Room | Room-hours | Avg crew | Output per worker-hour |');
console.log('|---|---|---|---|');
const rooms: Record<string, { workerMin: number; output: number; roomMin: number }> = {};
for (const o of runs)
  for (const [k, v] of Object.entries(o.byRoom)) {
    const e = (rooms[k] ??= { workerMin: 0, output: 0, roomMin: 0 });
    e.workerMin += v.workerMin;
    e.output += v.output;
    e.roomMin += v.roomMin;
  }
for (const [k, v] of Object.entries(rooms).sort((a, b) => a[0].localeCompare(b[0]))) {
  if (v.roomMin < 120) continue;
  console.log(`| ${k} | ${f1(v.roomMin / 60)} | ${f1(v.workerMin / v.roomMin)} | ${v.workerMin ? f1((v.output / v.workerMin) * 60) : '—'} |`);
}
