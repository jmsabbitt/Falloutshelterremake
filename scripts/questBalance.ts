// Plays every story quest and contract with the quest bot across a spread of
// party levels and gear, and prints win rate, time on site and HP left.
// Usage: npm run quest-balance [-- runs]  (default 20)
import { advance, applyCommand, loadContent, newGame, questContent, type GameState } from '../src/sim';
import { playQuest } from '../src/sim/systems/questBot';
import { refreshContracts } from '../src/sim/systems/quests';

const content = loadContent();
const runs = Number(process.argv[2] ?? 20);
const setups = [
  { name: 'L3 fists', level: 3, weapon: null },
  { name: 'L5 common', level: 5, weapon: 'service_pistol' },
  { name: 'L8 common', level: 8, weapon: 'scrap_carbine' },
  { name: 'L12 rare', level: 12, weapon: 'rivet_rifle' },
  { name: 'L20 rare', level: 20, weapon: 'coilgun' },
];

function game(seed: number, level: number, weapon: string | null, size: number): { s: GameState; ids: number[] } {
  const s = newGame(content, { seed, now: 0 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  s.resources.medpatch = 10;
  s.rooms.push({ id: s.nextId++, type: 'office', floor: 0, x: 13, segments: 1, level: 3, pool: 0, ready: false, powered: true, timer: 0, job: null });
  const hp = 105 + (level - 1) * 5;
  const ids: number[] = [];
  for (const r of s.residents.slice(0, size)) {
    r.level = level;
    r.maxHp = hp;
    r.hp = hp;
    r.weapon = weapon;
    ids.push(r.id);
  }
  // Every story quest is open for this test.
  s.questsDone = [];
  return { s, ids };
}

const targets = [
  ...questContent(content).quests.map((q) => ({ kind: 'story' as const, id: q.id, label: `${q.id} (L${q.level})` })),
  ...questContent(content).contracts.map((c) => ({ kind: 'contract' as const, id: c.id, label: c.id })),
];
for (const size of [3, 1]) {
  console.log(`\n=== party of ${size} ===`);
  for (const t of targets) {
    const row: string[] = [];
    for (const setup of setups) {
      let wins = 0;
      let secs = 0;
      let hpLeft = 0;
      let patches = 0;
      for (let i = 0; i < runs; i++) {
        const { s, ids } = game(1000 + i, setup.level, setup.weapon, size);
        if (t.kind === 'story') {
          const def = questContent(content).quests.find((q) => q.id === t.id)!;
          s.questsDone = [...def.requires.quests];
          const r = applyCommand(s, content, { type: 'startQuest', questId: t.id, residentIds: ids, medpatch: 5 });
          if (!r.ok) throw new Error(r.reason);
        } else {
          refreshContracts(s, content);
          const offer = s.contracts.offers.find((o) => o.templateId === t.id) ?? s.contracts.offers[0]!;
          offer.templateId = t.id;
          offer.level = setup.level;
          applyCommand(s, content, { type: 'startContract', contractId: offer.id, residentIds: ids, medpatch: 5 });
        }
        const q = s.quests[0]!;
        advance(s, content, q.travelTotal + 1);
        secs += playQuest(s, content, q.id);
        if (q.outcome === 'success') wins++;
        patches += 5 - q.supplies.medpatch;
        hpLeft += ids.reduce((a, id) => {
          const r = s.residents.find((x) => x.id === id)!;
          return a + (r.dead ? 0 : r.hp / r.maxHp);
        }, 0) / ids.length;
      }
      row.push(`${setup.name}: ${Math.round((100 * wins) / runs)}% ${Math.round(secs / runs)}s hp${Math.round((100 * hpLeft) / runs)}% mp${(patches / runs).toFixed(1)}`);
    }
    console.log(t.label.padEnd(24), row.join(' | '));
  }
}
