# M6 spec: the depth pass

M6 adds research, the Deep, traits and mastery, automation and quality-of-life tools (GDD §4.2, §6.2, §6.3 and §6.6). Acceptance test: **the mid-game after 100 residents has new goals.**

The shared scaffolding is in place (phase 0). Four streams work in parallel on **separate files**:

- **A:** research and automation
- **B:** the Deep
- **C:** traits and mastery
- **Q:** quality-of-life client

A fifth stream, **D** (the client for A, B and C), follows once they are merged.

## Ground rules

These are the same as in M4 and M5:

- Original IP only, in an atompunk tone (Halcyon, HALCY, the Glare, the Glarelands, taint, scrip, Rustmen, the Hollowed, Skitters, Burrowers, Maulers).
- The sim is deterministic: use `state.rng` and the helpers in `rng.ts`, never `Math.random` or `Date.now` in `src/sim`.
- State is plain JSON.
- Systems return `string | null`.
- Push events for the UI, and use `bump()` for lifetime counters (achievements watch these).
- Offline stays safe: no harm or incidents offline, timers keep running, and a 60 s step behaves like sixty 1 s steps.
- Use TypeScript strict mode and match the existing style.
- `npx tsc --noEmit` and `npx vitest run` must pass. Commit on your branch.
- **Only edit the files you own.** If you need a change elsewhere, describe it exactly in your final report.

## Scaffolding already in place (read-only unless your stream owns it)

| Piece | Where |
|---|---|
| `bonus(state, content, effect)`, the one place bonuses come from: Legacy perks plus completed research. New effect keys are listed in `ResearchEffect`. `productionMult`, `costMult` and `incidentRate` moved here from `legacy.ts` | `src/sim/bonuses.ts` |
| **Effects already wired** (research only needs to grant them): | |
| — `batchBank`: production rooms keep producing past a ready batch, into `room.banked`, and collect pays out all of it | `production.ts` |
| — `productionPower/Food/Water/Medpatch/Purge`, `productionSpeed` | `bonuses.productionMult` |
| — `buildDiscount`, `xpBonus`, `baseHp`, `childStats`, `offlineHours`, `autoCollect`, `carryLimit`, `explorerScrip`, `questSlots`, `contractOffers`, `questHeal`, `crateLuck`, `outpostOutput` | as in M5, now via `bonus()` |
| — `incidentDefense`: damage residents take from incidents, capped at −80% | `incidents.ts` |
| — `doorHp`: extra door HP against raids | `incidents.ts` |
| — `medicine`: Med-Patch and Purge strength at home | `commands.ts` |
| — `explorerTaint`: less taint while exploring | `exploration.ts` |
| **Not wired yet (stream A):** `autoAssign`, `autoMedic`, `researchSpeed`. **Stream B:** `digSpeed` | |
| State: `state.research {points, done}`, `state.deep {strata, dig, discoveries}`, `resident.traits`, `resident.mastery`, `room.banked`. Save v6 migrates older saves | `types.ts`, `save.ts`, `state.ts` |
| Room fields: `requiresResearch` (build gate, checked by `isUnlocked` and `build`) and `minFloor` (deep-only rooms, checked by `canPlace`) | `content.ts`, `economy.ts`, `grid.ts` |
| Floors: `canPlace` allows floors up to `totalFloors(state, content)` = 25 + strata × 5 | `grid.ts`, `deep.ts` |
| New incident types `cavein`, `flood` and `deepcrawlers`, with placeholder balance entries (`natural: 9999`, so they never fire yet) | `types.ts`, `balance.json` |
| The Lab room (`lab`: category `research`, stat Wits, pop 25) | `rooms.json` |
| Commands: `research {nodeId}`, `excavate {}`, `autoAssign {}` | `commands.ts` |
| Tick wiring: `tickResearch(dt, offline)`, `tickDeep(dt, offline)`, `tickMastery(dt)` run every step | `tick.ts` |
| Trait hooks, **already called**: `rollTraits` and `inheritTraits` (createResident and createChild), `workerMult` (production), `traitHappiness` (happiness target), `traitCombatMult` (incident damage) | `residents.ts`, `production.ts`, `needs.ts` |
| Founding calls `carryResearch(old, next)` | `prestige.ts` |
| Auto-assign best fit: `autoAssign(state, content)` and `idleAdults(state)` | `systems/assign.ts` |
| Contract stubs with the signatures to keep | `systems/research.ts`, `systems/deep.ts`, `systems/traits.ts` |
| Core tests | `tests/m6core.test.ts` |

### Shared ids (so streams agree without talking)

The research nodes that gate the Deep are defined by stream A and used by stream B:

- `deep_survey`, `deep_survey_2`, `deep_survey_3`, `deep_survey_4`: excavate strata 1–4.
- `geothermal_taps`: unlocks room `geothermal`.
- `fungal_farming`: unlocks room `fungalfarm`.
- `ore_refining`: unlocks room `refinery`.
- `deep_bracing`: an `incidentDefense` node that stream B's deep incidents are balanced against.

Other ids already used by tests: `batch_bank_1` and `personnel_office`.

---

## Stream A: research and automation

**Owns:** `src/sim/systems/research.ts`, `src/content/research.json`, `tests/research.test.ts`, and the `lab` entry in `rooms.json`, which you may tune. You may also **add** one perk to `src/content/legacy.json` and add its effect key to the `PerkEffect` union in `src/sim/legacy.ts` (research carryover; see below).

### Implement

- **`researchRate`:** each staffed Lab produces research points per hour: the Wits of its workers × `pointsPerWitsHour` × `levelMult[level]` × (1 + `researchSpeed`), plus the trait `workerMult` if you like. Points accrue in `tickResearch` online and offline (like production, but continuous, with no collect step).
- **`canResearch` and `doResearch`:** a node needs its `requires` done and enough points. Researching spends the points, adds the node to `done`, fires `researchDone`, bumps `researchDone`, and runs `refreshUnlocks` so newly unlocked rooms appear. `unlocks.regions` adds to `state.regionsUnlocked`.
- **Automation in `tickResearch`,** online only:
  - `autoAssign` (the flag from Personnel Office): every 60 s, call `autoAssign(state, content)`.
  - `autoMedic` (supply bots): heal anyone below 50% HP with a Med-Patch from stock, and purge anyone whose taint is above 25% of max HP. Use the same formulas as the `heal` and `purge` commands, including `medicine`. Throttle it, for example to one resident per 10 s.
- **`carryResearch`:** by default, research is lost when a new homestead is founded (GDD §10.2: "Research, partially (a Legacy perk keeps a percentage)"). Add a Legacy perk "Institutional Memory" (branch `foundations` or `network`) with a new effect `researchKeep`. Each rank keeps a share of research: keep the cheapest nodes first, by cost, whose requirements are also kept. Also carry a share of unspent points if you like.

### Content: at least 30 nodes across the 6 branches, tiers 1–4

- **Industry:** production boosts per resource; a power grid.
- **Medicine:** `medicine`, `productionMedpatch`/`Purge`, `baseHp`.
- **Defense:** `doorHp`, `incidentDefense` (including `deep_bracing`); training drills, for example `xpBonus`.
- **Automation:** `batchBank` ranks 1–3 (`batch_bank_1`, `_2`, `_3`), `personnel_office` (autoAssign), `supply_bots` (autoMedic), `conveyors` (autoCollect), `offlineHours`.
- **Expeditions:** `carryLimit`, `explorerScrip`, `explorerTaint`, `questHeal`, `contractOffers`, `questSlots` (one late node).
- **Deep Works:** the shared ids above, plus `digSpeed`.

Write names and descriptions in our voice, for example "Holding Tanks", "Personnel Office" and "Supply Bots (Mk. I)".

Also add about 8 achievements (`researchDone` counts and similar) under `"achievements"`.

### Balance targets

- The first Lab is buildable at population 25. One staffed Lab should afford a tier-1 node within 1–2 hours, and a tier-4 node should take about 1–2 days of two upgraded Labs.
- The whole tree should be a goal that reaches past population 100 (a week or more of play).

Write `tests/research.test.ts` covering the rate, costs, requirements, unlocks, automation, offline accrual and carryover.

---

## Stream B: the Deep

**Owns:**

- `src/sim/systems/deep.ts`
- `src/content/deep.json`
- `src/sim/systems/incidents.ts`
- the `cavein`, `flood` and `deepcrawlers` entries in `balance.json` → `incidents.types`
- **new** deep room entries appended to `rooms.json`
- `tests/deep.test.ts`

### Implement

- **`canExcavate` and `startExcavation`:** dig the next stratum (1–4) when:
  - its research is done (`deep_survey`, `deep_survey_2` and so on)
  - there is enough scrip (`digScrip[n-1]`)
  - no dig is running
  - an **elevator reaches the current bottom floor** (the dig starts from the shaft)

  The dig takes `digHours[n-1]`, sped up by `digSpeed`, and runs online **and** offline. It fires `digStarted`, then `digFinished`, and bumps `strata` and `strataExcavated`.
- **Discoveries:** each stratum has lore discoveries: Halcyon logs and relics that hint at what was sealed down there. This leads toward Act 2, and nobody knows yet why the lower strata are sealed.
  - At least one discovery is found when a dig finishes.
  - More are found while residents work on deep floors (a timer while online).
  - A discovery may carry a small reward (a fragment, recipe, crate or salvage), rolled through the existing helpers.
  - Record it in `state.deep.discoveries`, fire `discovery`, and bump `discoveries`.
- **Deep rooms** (`minFloor: 25` and `requiresResearch`):
  - `geothermal`: power, stronger than the generator.
  - `fungalfarm`: food.
  - `refinery`: turns worker Knack into salvage over time. Handle this in `tickDeep`, since it doesn't produce a resource. Mostly steel and circuitry, with rare and legendary odds that rise with room level.
  - Any extra rooms you like.
- **Deep threats:** tune the placeholder incidents and make them start only in rooms on deep floors (`isDeepFloor`), online only, as random incidents alongside the existing ones.
  - `cavein`: stuns production. Residents must dig out; no spreading.
  - `flood`: spreads sideways.
  - `deepcrawlers`: from dirt edges, the deep's own creatures.

  Keep them fair: `deep_bracing` (`incidentDefense`) should make them clearly easier. The existing four incident types must behave as before; there are tests.
- Deep floors must work with everything else: elevators, placement, merging and incidents. The base grid stays at 25 floors.

### Content

- 4 strata, each with a name, description and **at least 4 discoveries** written in our voice.
- About 6 achievements.

Write `tests/deep.test.ts` covering:

- excavation gates, cost, time and offline progress
- the floors opening, and the deep-room placement rules
- discoveries
- refinery output
- deep incidents only starting on deep floors

---

## Stream C: traits and mastery

**Owns:** `src/sim/systems/traits.ts`, `src/content/traits.json`, `tests/traits.test.ts`. You may add **small, clearly commented hook calls** in `exploration.ts` and `quests.ts` for trait effects, such as explorer scrip or crit ring speed. List every one in your report.

### Implement the hooks without changing their signatures

- **`rollTraits`:** 1–3 traits (`traitsPerResident`), weighted, with no contradictory pairs.
- **`inheritTraits`:** each parent trait passes on with `inheritChance`, then top up to 1–3.
- **`workerMult`:** trait effects on production, plus **mastery**. The tier bonus comes from `masteryTierSeconds` in the room type, for example +5% for Journeyman and +12% for Master.
- **`traitHappiness`:** for example Claustrophobic is unhappy on deep floors (use `isDeepFloor` from `deep.ts`), Social is happier with company in the room, and Loner is the opposite.
- **`traitCombatMult`.**
- **`tickMastery`:** workers in rooms with a stat accrue seconds for that room type, online and offline. Crossing a tier fires `masteryUp` and bumps `masteryUps`.
- **`masteryTier`.**
- Also export `professionTitle(content, r)`: the highest tier's room type turned into a title, for example "Master Mechanic" for power or "Journeyman Cook". The client needs it.

### Content: at least 20 traits

Use our own names. Some examples to adapt or replace:

- Green Thumb (food +)
- Night Owl
- Claustrophobic
- Hothead (combat +, happiness −)
- Hoarder (storage? or scrip)
- Social
- Loner
- Tinkerer (workshops)
- Glare-Hardened (less taint)
- Lucky Break
- Quick Study (XP)
- Romantic (faster courtship: add a hook in `family.ts`? That's shared, so ask in your report instead)
- Deep Delver (happy and productive deep down)

Effects should matter but not dominate: about ±10–15%. Also add about 6 achievements.

Legacy residents (existing saves) have `traits: []`. Give them traits the first time `tickMastery` sees them, using `state.rng`.

Write `tests/traits.test.ts` covering rolls, inheritance, effects through the real systems (production rate, happiness), mastery accrual and tiers, and offline accrual.

---

## Stream Q: quality-of-life client

**Owns** `src/client/**`. Stay out of the areas stream D will touch later: Deep rendering, research panels, trait displays. Put new code in new files where you can, and keep hooks small.

Build (GDD §6.6):

1. **Resident list:** sort by name, level, a stat, happiness or room; filter by idle, working, away, injured, children or rarity; and search by name. It must stay fast at 200 residents.
2. **Bulk actions:** select several residents, then assign them to a room, unassign them, or heal them all. An **"Auto-assign idle"** button runs the `autoAssign` command.
3. **Room stats overlay:** a toggle that shows on every room its output per minute, its crew against its slots, its stat total, and whether it's ready or banked (`room.banked`).
4. **Notification centre:** a log of recent events (arrivals, births, incidents, quests, crafting, level-ups, achievements), grouped with icons. Include a **"While you were away"** section filled from the offline catch-up summary and the events drained on load. It should be scrollable and cleared on demand.
5. **Save slots:** 3 named slots plus the prestige backups (`homestead.save.backup.*`), each with the save date and a homestead summary. Offer load, save to slot, rename, export and import, and delete with confirmation.
6. **Loadout presets:** save and restore named parties for exploring and quests. They are client-side (localStorage) and contain resident ids plus supply counts. Offer them in the explore modal and the party picker.

Verify with Playwright, as before (`/tmp/pw-c`; `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`; no `pkill -f`). Save screenshots to `docs/screens/m6q/` at desktop and phone sizes.
