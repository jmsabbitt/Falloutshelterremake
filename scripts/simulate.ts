// Headless balance run: `npm run sim -- [hours] [seed]`
// Plays a simple "sensible player" policy and prints resource curves.

import { advance, applyCommand, cycleSeconds, loadContent, newGame, powerDemandPerMin, foodDemandPerMin, type GameState, type StatKey } from '../src/sim';

const content = loadContent();
const hours = Number(process.argv[2] ?? 24);
const seed = Number(process.argv[3] ?? 3);

const s: GameState = newGame(content, { seed, now: 0 });
applyCommand(s, content, { type: 'admitAll' });

const byType = (t: string) => s.rooms.find((r) => r.type === t)!;
const pool = s.residents.filter((r) => !r.waiting);
const take = (stat: StatKey, roomType: string) => {
  pool.sort((a, b) => b.stats[stat] - a.stats[stat]);
  for (const r of pool.splice(0, 2)) applyCommand(s, content, { type: 'assign', residentId: r.id, roomId: byType(roomType).id });
};
take('knack', 'canteen');
take('sight', 'waterworks');
take('brawn', 'generator');

for (const t of ['generator', 'canteen', 'waterworks']) {
  const room = byType(t);
  console.log(`${t.padEnd(11)} cycle ${cycleSeconds(s, content, room).toFixed(0)}s`);
}
console.log(`power demand ${powerDemandPerMin(s, content).toFixed(2)}/min, food demand ${foodDemandPerMin(s, content).toFixed(2)}/min`);

for (let minute = 0; minute <= hours * 60; minute++) {
  if (minute % 60 === 0) {
    const r = s.resources;
    const hp = s.residents.reduce((a, x) => a + x.hp, 0) / s.residents.length;
    console.log(
      `h${String(minute / 60).padStart(3)}  power ${r.power.toFixed(0).padStart(4)}  food ${r.food.toFixed(0).padStart(4)}  water ${r.water.toFixed(0).padStart(4)}  scrip ${s.scrip}  avgHP ${hp.toFixed(0)}  happy ${(s.residents.reduce((a, x) => a + x.happiness, 0) / s.residents.length).toFixed(0)}`,
    );
  }
  advance(s, content, 60);
  applyCommand(s, content, { type: 'collectAll' });
}
