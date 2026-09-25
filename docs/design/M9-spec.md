# M9 spec: Content

M9 is the content milestone (GDD §4.2, §7, §11, §15). It adds:
- Act 3 and a third region
- legendary residents and the Collection Log
- new vault creatures and more rare-item paths
- rulesets and Survival
- the Custom Game sim

Four sim/content streams run in parallel (A, L, R, C). A client stream (D) follows once they are merged. **Acceptance:** homestead 3 has a story and the prestige loop has variety; rare items have several targeted paths; the game has 170+ achievements, including the Warden's Seal.

The ground rules are the same as M7 and M8:
- original IP and our deadpan, atompunk voice, with no Fallout names
- a deterministic, JSON-state sim
- systems return `string | null`
- `bump()` counters and events for the UI
- offline-safe: timers run and nothing harmful happens
- `npx tsc --noEmit -p .` and `npx vitest run` must pass
- **edit only the files you own**, and describe anything else you need in your report
- when two streams append to the same JSON array (for example `items.json`), append at the end; the lead merges

## Scaffolding already in place (phase 0)

| Piece | Where |
|---|---|
| New state (save v8, migrated): `mode: 'normal' \| 'custom'`, `rules {ids, survival}`, `collection: Record<category, id[]>`, `legends: LegendsState {recruited, ...}`, `loot: LootState {bossKills, maps, ...}`, `maulerMeter`, and `Resident.legendary?` | `types.ts`, `state.ts`, `save.ts` |
| **Founding:** `FoundOptions.rules` and `.survival` are copied to the new state. `collection`, `legends` and `loot` (minus `maps`) carry over to the next homestead | `prestige.ts` |
| **Custom mode:** `newGame(content, { rules, survival, mode })`. `checkAchievements` does nothing in `mode: 'custom'` | `state.ts`, `achievements.ts` |
| New content files, loaded and exposed as `content.legends`, `content.rulesets` and `content.loot`. Their `achievements` arrays are merged. **The `questlines`, `quests`, `enemies` and `events` in `legends.json` are merged into quest content**, so personal questlines run through the normal quest engine | `content.ts` |
| **Quest hooks:** `requires.legend: <id>` (that legend lives in this homestead and is admitted, not dead or waiting). `rewards.legend: <id>` calls `recruitLegend(state, content, id, 'quest')` on success | `quests.ts` |
| `onBossDefeated(state, content, quest, enemyId)` is called when a quest boss dies. Add drops to `quest.loot`, which is only paid on success | `systems/loot.ts` (stub) |
| `rulesetMods(state, content)` has `production(resource)` and `incidentRate`, already multiplied into `productionMult` and `incidentRate` in `bonuses.ts`. `ruleFlag(state, content, flag)` | `systems/rulesets.ts` (stub) |
| `tickLegends(state, content, dt, offline)` runs every step. `recruitLegend(state, content, id, source)` | `systems/legends.ts` (stub) |
| **Charter 3** now needs population 120 and quest **`act3_finale`** | `legacy.json` |

### Shared ids

- **Region (stream A):** `stillwater`, the Stillwater: a flooded Halcyon transit city. It is unlocked by an Act 3 quest reward.
- **Legendary residents (stream L):** L writes the details. The other streams use only these ids and sources:

| id | Who (seed) | How they join |
|---|---|---|
| `marla_voss` | Marla "Switchback" Voss, a caravan scout who never takes the same road twice | caravaners Allied (L, in `tickLegends`) |
| `ada_quill` | Ada Quill, a Scrapwright guildmaster in exile | tinkers Allied (L) |
| `seven` | Seven, a Homestead 9 runaway raised by the cold HALCY | homestead9 Friendly or better (L) |
| `doc_ferris` | Dr. Aurelio Ferris, a pre-Glare Halcyon medic, very tired | a rare radio arrival at population 50+ (L; skipped under `ruleFlag('noRadio')`) |
| `lucky_lou` | Lucky Lou, a gambler who swears by the house edge | a Legendary Supply Crate (L) |
| `pip` | Pip, a kid who grew up in the Deep | after a particular Deep discovery (L scans `state.deep.discoveries`) |
| `rook` | Rook, a Rustman clan champion who switches sides | the first defeat of the boss `big_tin` (C, in `onBossDefeated`) |
| `granny_ash` | Granny Ash, the oldest woman in the Glarelands | a treasure cache (C) |
| `brother_wick` | Brother Wick, a lapsed Lamplighter | an Act 3 quest reward (A, `rewards.legend`) |
| `june_halloran` | June Halloran, a Stillwater salvage diver | an Act 3 quest reward (A) |
| `captain_orla` | Captain Orla Brandt of pre-Glare Halcyon security, thawed beneath the Seal | the `act3_finale` reward (A) |

---

## Stream A: Act 3 "The Seal" and the Stillwater

**Owns:**
- **Act 3 entries appended** to `src/content/quests.json`: the questline `act3`, quests, enemies, pools, events, contract templates and achievements. Don't change existing entries except the questline list.
- the new region `stillwater` in `src/content/exploration.json`
- **appended** Act 3 reward items in `items.json`, if needed
- `tests/act3.test.ts`
- `scripts/questBalance.ts`

**Implement:**
- **Act 3 "The Seal":** 8 quests, all with `requires.cycle: 3`. The last one is `act3_finale`.
  - **Beats:** the Seal at the bottom of every homestead, the Tenant, and what Halcyon's "Sunrise" really was. Read `deep.json` discoveries and Act 2 in `quests.json` so the threads line up.
  - **Ending:** a two-phase finale boss, and an ending that half-answers and sets up the "true ending" for homesteads 4+.
- **Rewards:**
  - some quests move faction rep
  - one unlocks `stillwater` (`rewards.regions`)
  - `brother_wick` and `june_halloran` each join from a mid-act quest (`rewards.legend`)
  - `captain_orla` joins from `act3_finale`
- **Stats:** levels about 20 → 35, with population gates of 40–110.
- **Content:** at least 12 new enemies, at least 12 events, and at least 4 new contract templates (faction ones welcome).
- **The Stillwater:** the hardest region. It needs at least 14 enemies, 10 locations, 8 NPCs, salvage leaning to rare, and at least 40 musings.
- About 8 achievements.
- **Balance:** use `npm run quest-balance`, with the same targets as M4 relative to the recommended level. Put the table in your report.
- **Tests:** ids resolve, maps are connected, `act3_finale` exists with cycle 3 and a legend reward, every faction, legend and region id used exists (legends from the table above), and `stillwater` is unlocked by an Act 3 quest.

---

## Stream L: Legendary residents, the Collection Log and the Warden's Seal

**Owns:**
- `src/content/legends.json`
- `src/sim/systems/legends.ts`
- **new** `src/sim/systems/collection.ts`
- `src/sim/systems/achievements.ts`
- `src/sim/systems/crates.ts`
- **appended** legendary traits in `traits.json`
- the `LegendsState` interface body in `types.ts` (only that interface)
- `tests/legends.test.ts`
- `tests/collection.test.ts`

**Implement:**
1. **The 11 legends** (ids and sources above). Each one needs:
   - a full name
   - a fixed appearance (keep to the existing `appearance.json` options)
   - high fixed stats with a clear speciality
   - a unique **signature trait**, appended to `traits.json` with a real mechanical effect through the existing trait-effect system
   - a starting weapon or outfit, if it fits
   - a one-line bio and three "HALCY notes"

   `recruitLegend` rules:
   - It creates the resident waiting at the door (reuse `createResident` and patch the fields), marks them recruited, fires a `legendArrived` event (add it to `GameEvent` by describing the patch; for now use a local cast and the event name), and bumps counters.
   - A legend joins once per lifetime. After founding they can come along in the party like anyone else. If they stayed behind, they stay at that outpost; decide whether they can return later and document it.
   - If a legend dies in Survival they are gone for good. Otherwise they are revived as usual.
2. **Sources in `tickLegends`:** faction standing, the radio (rare and deterministic via `state.rng`, only online or both, your choice, as long as 1 s and 60 s steps match), Deep discoveries, and the Legendary crate (in `crates.ts`, a Legendary crate has a chance to bring an unrecruited crate legend). Everything else calls `recruitLegend`.
3. **Personal questlines:** two quests per legend in `legends.json` (`questlines`, `quests`, `enemies`, `events`), with `requires.legend`. The second quest gives a unique legendary item (append it to `items.json`) or a permanent stat or trait upgrade (describe the reward type if the quest engine lacks one). The levels should suit the point where each legend usually arrives.
4. **The Collection Log** (`collection.ts`):
   - **Categories:** `items`, `residents` (legends), `creatures` (quest enemies and incident types seen), `rooms` and `regions`.
   - **Recording:** fill it from state (scan owned items, rooms, residents and regions in `tickLegends` or a helper) and from events where needed. If you need small hooks elsewhere (for example "enemy defeated: defId"), describe the patch.
   - **Exports:** `collectionProgress(state, content)` giving per-category and total `{have, of}`, and `collectionEntries(state, content, category)`.
   - Completion milestones pay crates.
5. **The Warden's Seal:**
   - It is an achievement awarded when every other achievement is earned. Hidden achievements count; exclude any flagged `optional` in content.
   - It pays a title and a monument flag (`state.stats['wardensSeal']`) that the client can show.
   - Make sure no achievement needs extreme luck, as GDD §15.2 requires. Report any existing ones that do.
6. About 10 achievements: legends recruited, personal questlines done, and collection milestones.

**Tests:** each source path recruits exactly once; 1 s vs 60 s steps give the same result; founding carries the legend with the party; questline gating; collection progress; the Seal fires only when everything else is earned; and a save round-trip.

---

## Stream R: Rulesets, Survival and the Custom Game sim

**Owns:**
- `src/content/rulesets.json`
- `src/sim/systems/rulesets.ts`
- **new** `src/sim/systems/custom.ts`
- `src/sim/systems/prestige.ts` (the founding rules and Legacy)
- `src/sim/systems/arrivals.ts`
- `src/sim/systems/needs.ts`
- `src/sim/commands.ts`
- `tests/rulesets.test.ts`
- `tests/custom.test.ts`

**Implement:**
1. **Rulesets (at least 8):**
   - **Examples:** Famine (food production and stores lower, consumption higher), Endless Night (the shift clock is always night; night-owl traits shine, others are unhappier), No Radio (no radio or wanderer arrivals except the founding party and births), Iron Door (raids much more often, and the door is tougher), Glass Sky (constant taint storms topside, or more taint while exploring), Lean Times (scrip income ×0.5), Skeleton Crew (population cap), and Bad Blood (rivals and fights happen more often; skip it if there are no relationship systems).
   - **Each ruleset needs:** `id`, `name`, blurb, `legacyMult` (harder pays more Legacy on the *next* founding, stacking with the site), an `unlock` (Legacy cycle, an achievement or a quest), and `mods`/`flags`.
   - **Survival** is a separate toggle: the fallen can't be revived, and it gives a big Legacy multiplier.
   - **Wiring:** implement `rulesetMods` and `ruleFlag`, and wire flags into the systems you own (arrivals and needs). For other hook sites (the revive command lives in `commands.ts`, which you own; the shift clock, production and storage caps, exploration taint and incidents), describe the exact patch or use existing multiplier hooks. **Don't edit** `incidents.ts` or `exploration.ts` (stream C) or `achievements.ts`/`crates.ts` (stream L).
   - **Founding** (`prestige.ts`): `canFoundHomestead`/`foundHomestead` validate that the rules are unlocked. Legacy scoring applies the multipliers of the homestead being left. Export `rulesetsAvailable(state, content)`.
2. **Custom Game** (`custom.ts`):
   - **`newCustomGame(content, presetId | options)`:** starting resources, population, rooms (a preset layout), level range, unlocked research, regions and rulesets.
   - **Presets (at least 6) in `rulesets.json`:** for example "Start with 5 residents at pop 80", "The Deep from day one", "A ruined homestead", "All rooms, no people".
   - **Sandbox commands:** add a `custom` command family in `commands.ts`, allowed **only in `mode: 'custom'`**, validated like the others: set a resource, spawn a resident (stats and level), spawn an item, trigger an incident, set the weather, grant research points, and unlock everything. Time scale is client-side, so it isn't in the sim.
   - **Validation:** every command must refuse in normal mode.
3. About 8 achievements, for example founding under each hard ruleset, or a Survival homestead reaching 100.

**Tests:** each ruleset's effect is visible in the sim; rulesets stay locked until their unlock is met; Legacy multipliers apply; Survival blocks revive; custom commands refuse in normal mode and work in custom; presets build valid states with rooms connected; and custom games earn no achievements.

---

## Stream C: Creatures and rare-item paths

**Owns:**
- `src/sim/systems/incidents.ts`
- the `incidents` section of `balance.json`
- `src/sim/systems/threat.ts`
- `src/sim/systems/loot.ts`
- `src/content/loot.json`
- `src/sim/systems/exploration.ts`
- the `LootState` interface body in `types.ts`
- **appended** items in `items.json`
- `tests/creatures.test.ts`
- `tests/loot.test.ts`

**Implement:**
1. **New vault incidents** (GDD §7.1), each in our voice:
   - **Electrical surge:** hits power rooms and spreads along powered neighbours. Staff it to ground it.
   - **Glassbacks:** taint-crystal arachnids that jump between rooms and drain power while alive.
   - **The Hollowed:** Glare-sick humans who deal taint damage and leave taint behind.
   - **Maulers:** the apex threat, driven by `state.maulerMeter`. The meter rises with noise and wealth (door openings, radio, scrip and population) and is visible in the Threat Rating. When it fills, a Mauler hits the door. It has very high HP and moves room to room, and is rare but telegraphed. Defensive research and Watchtowers lower the meter's rate.

   Follow the existing incident rules:
   - population thresholds and level scaling
   - offline settlement (`settleIncidentsOffline`): nothing lethal offline, so decide sensible offline resolution
   - defenders and weapons
   - Survival (`state.rules.survival`) means deaths are permanent; the revive logic isn't yours
   - achievements
2. **Rare-item paths** (GDD §15.1):
   - **Boss first-kill drops:** in `loot.json`, `bossFirstKill` maps each boss enemy id to a guaranteed item. Pay it through `onBossDefeated` into quest loot the first time (`state.loot.bossKills`); after that there is a small chance. Include the Act 1/2 bosses (list them from `quests.json`), and add Act 3 or legend bosses later as they appear. The first `big_tin` kill also calls `recruitLegend(state, content, 'rook', 'boss')`.
   - **Treasure maps:** a rare explorer find (in `exploration.ts`) gives a map to a cache in some region (`loot.json` `caches`). An explorer sent to that region later has a strong chance to dig it up, for a specific legendary item, salvage or a legend (`granny_ash` comes from one cache). Maps are shown on return.
   - **Region exclusives:** each region (`dustbowl`, `glassflats`, `stillwater`) has signature salvage or items that only drop there.
   - **New items:** add about 12 legendary and rare items (weapons and outfits) for the above, appended to `items.json`, with names and flavour in our voice.
3. About 10 achievements: first kills, caches dug up, and each new creature beaten.

**Tests:** each incident spawns, spreads, resolves and settles offline without deaths; the Mauler meter rises and falls and triggers; first-kill pays once; a map leads to its cache; region exclusives drop only in their region; and `rook` is recruited via `big_tin`.

---

## Stream D: Client (after A, L, R and C are merged)

This is specified separately once the sim APIs are final. It covers:
- the Act 3 and legend quest UI tweaks
- the Collection Log screen, the Warden's Seal monument, and legend cards and arrivals
- ruleset and Survival choices in the founding flow
- a Custom Game menu with presets, a sandbox toolbar, a time scale and a separate save slot
- incident art for the new creatures, and the Mauler meter on the Threat gauge
- treasure maps on the world map

---

## Client streams (phase 2, after the sim merge at a6442d6)

Two client streams run in parallel. The sim is done; see `src/sim/index.ts` for the exports. In either stream, don't edit `src/sim/**` (describe patches instead). Both must keep the M8 phone rules:
- tap targets at least 44 px
- text at least 12 px
- no horizontal overflow at 360 px
- use the `--safe-*` insets
- register back handlers with `onBack`
- screenshots in `docs/screens/m9/`, reduced to 256 colours

**D1: vault, legends and collection.**

*Owns:*
- `src/client/render/**`
- `src/client/ui/ui.ts`
- `ui/threat.ts`
- `ui/toasts.ts`
- `ui/notices.ts`
- `ui/residentList.ts`
- `ui/quests.ts`
- `ui/questScreen.ts`
- **new** `ui/legends.ts`
- **new** `ui/collection.ts`
- `style.css`

*Implement:*
- **New incidents:** art and animation for `surge`, `hollowed`, `glassbacks` and `maulers`, in `render/`: the Mauler walks in from the door, and Glassbacks jump between rooms (`incidentMoved`). Add hints and toasts for `incidentMoved`, `incidentEscaped` and `maulerStirring`.
- **Threat gauge:** show the Mauler meter (`maulerStatus`).
- **Legends:**
  - a legend card (name, bio, HALCY notes, signature trait, status, questline progress, and Recall with `recallLegend`)
  - a "Legends" section in the residents panel
  - a gold badge on legendary residents in the vault and in lists
  - the arrival toast and modal (`legendArrived`) and the awakening one (`legendAwakened`)
- **Collection Log** (`collectionProgress` / `collectionEntries`): tabs per category, locked silhouettes, percentages and milestone rewards, opened from Goals/☰.
- **Warden's Seal:** progress and the missing list (`sealProgress`), the title (`wardenTitle`), and a monument drawn at the door once `stats.wardensSeal` is set.
- **Explore panel:** treasure maps (`state.loot.maps`) with their regions and a "dig here" hint, plus toasts for `treasureMapFound` and `cacheDug`, and the region-exclusive loot list per region.
- **Quests:** Act 3 and the legend questlines appear in the quests panel, with legend quests showing the legend's portrait or name and the requirement. Add a first-kill badge on boss rooms (from `lootContent(content).bossFirstKill` and `state.loot.bossKills`) and the `bossFirstKill` toast.
- **Items:** the flavour line (`flavor`) and a "rare find" label for `lootOnly` items in item cards, and lootOnly items left out of the blueprints tab.

**D2: rulesets, Survival and Custom Game.**

*Owns:*
- `src/client/ui/prestige.ts` (founding flow and Legacy screens)
- **new** `ui/custom.ts`
- **new** `ui/rules.ts`
- `src/client/game.ts`
- `src/client/main.ts`
- `src/client/storage.ts`
- `src/client/platform/**`
- `ui/saves.ts`
- `ui/settings.ts`

*Implement:*
- **Founding flow:** a rules step. Pick rulesets (`rulesetsAvailable`, `rulesetLocked`, `survivalLocked`), with locked ones showing their unlock, a live Legacy multiplier preview (`rulesLegacyMult`), and a Survival toggle with a clear warning. The site and rules summary appears on the confirm step.
- **Homestead display:** the rules the homestead runs under show in the HUD title tooltip or menu, and in the Legacy history.
- **Custom Game:**
  - a menu entry (☰ → "Custom Game", and on the title or first screen if there is one) with preset cards (`customPresets`) and an advanced form (`CustomGameOptions`: scrip, population, level range, rules, research/regions all, strata)
  - it starts in **its own save slot**, never overwriting the normal game, and you can switch back
  - a clear "CUSTOM GAME: achievements off" banner
  - a sandbox toolbar that drives the `custom` command family (`CUSTOM_ACTIONS`): set resource, spawn resident or item, trigger incident, weather, research, unlock all
  - a **time scale** (×1, ×2, ×5, ×10, ×100) applied in the game loop, custom mode only
- **Survival in the HUD:** a skull marker, and revive buttons that explain why they're disabled.
- **Hooks in files you don't own:** where you need a menu entry or HUD hook in `ui.ts` (owned by D1), export a function from your file and give the exact line to add in your report.
