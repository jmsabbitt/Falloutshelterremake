# M3 spec: the Glarelands, salvage and crafting

This is the working contract for milestone M3. It is split into three parallel work streams (A, B, C) that own **separate files**. The shared scaffolding (types, commands, tick wiring, save v3, content loaders, inventory helpers) is already in place and must not be edited by the streams. If a stream needs a shared change, it says so in its final report.

Read first: `docs/design/GDD.md` (§8 Exploration, §15.1 rare-item paths), `docs/research/03_threats_exploration.md` §4 (the original's wasteland mechanics), `docs/research/02_dwellers_items.md` §14 (junk and crafting), and the existing code in `src/sim/`.

## Ground rules for every stream

- **Original IP only.** No Fallout names, places, creatures or items. The setting is atompunk: Halcyon Shelter Company, HALCY the cheerful corporate AI, the Glare (sky-fire catastrophe), the Glarelands (the surface), taint (Glare-sickness, the radiation equivalent), Rustmen (raiders), the Hollowed (Glare-sick humans), Skitters, Burrowers, Maulers (apex predator), scrip (currency).
- **Deterministic simulation.** All randomness goes through `state.rng` with the helpers in `src/sim/rng.ts`. No `Math.random`, no `Date.now` in `src/sim`.
- **State is plain JSON.** No classes or Maps in `GameState`.
- **Systems return `string | null`**: an error message, or null for success. `commands.ts` already wraps them.
- **Push events** (`state.events.push(...)`) for anything the UI should react to. The event types are defined in `src/sim/types.ts`.
- **Lifetime counters** go through `bump(state, key, n)` from `src/sim/residents.ts`. Achievements watch these.
- **Offline safety.** `tickExpeditions` and `tickCrafting` run both online (dt ≤ 1 s) and offline (dt up to 60 s, across up to 72 h). They must give the same kind of results either way, and stay fast: 25 explorers over 72 h offline should take well under a second.
- **Style.** Match the existing code: TypeScript strict mode, small pure functions, short comments that explain why. Run `npx tsc --noEmit` and `npx vitest run` before finishing; both must pass.

## Shared pieces already in place (read-only)

| Piece | Where |
|---|---|
| Types: `Expedition`, `ExpeditionLoot`, `JournalEntry`, `CraftJob`, `Room.job`, `Resident.expedition`, state fields `salvage`, `recipes`, `fragments`, `reforgePity`, `expeditions`, `regionsUnlocked`, and the M3 `GameEvent`s | `src/sim/types.ts` |
| Commands: `explore`, `recall`, `collectExpedition`, `craft`, `collectCraft`, `cancelCraft`, `scrap`, `reforge` (they call the contract functions) | `src/sim/commands.ts` |
| `revive` calls `onResidentRevived` | `src/sim/commands.ts` |
| Tick wiring: `tickExpeditions` and `tickCrafting` run every step, online and offline | `src/sim/tick.ts` |
| Save format v3, with a migration from v2 | `src/sim/save.ts` |
| Away residents: `livingResidents()` excludes them, so they don't eat, drink, fight or count toward mood. They still count toward population (their bed is kept). `assign` refuses them | `src/sim/residents.ts` |
| Salvage content (21 items: 7 materials × common, rare, legendary) | `src/content/salvage.json` |
| Workshops: `weaponshop` (pop 22) and `outfitshop` (pop 32). Category `workshop`, 9 cells wide, 6 workers, stat `null`. Upgrades gated by `upgradePop`. Demolish is refused while a job is active | `src/content/rooms.json` |
| Every weapon and outfit has `craftStat` | `src/content/items.json` |
| Inventory helpers: `addSalvage`, `spendSalvage`, `salvageCount`, `knowsRecipe` (commons are always known), `fragmentsNeeded` (from `crafting.json`), `unlockRecipe`, `addFragment` (completing the set unlocks the recipe and emits events) | `src/sim/systems/inventory.ts` |
| Item helpers: `grantItem` (sells on overflow and emits `storageFull`), `randomItemOf`, `itemCapacity`, `sellValue` | `src/sim/systems/items.ts` |
| Content loader: `content.exploration` is typed from `exploration.json`, `content.crafting` from `crafting.json`. Achievements listed under `"achievements"` in either file are merged automatically | `src/sim/content.ts` |

---

## Stream A: exploration

**Owns:** `src/sim/systems/exploration.ts`, `src/content/exploration.json`, `tests/exploration.test.ts`.

Implement every function in the contract (`exploration.ts`) without changing its signatures. You may add private helpers and extra exports.

**Sending out** (`startExpedition`):
- **Who can go:** a living adult who is inside the homestead, not waiting, not pregnant, not a child, and not already away (`canExplore`).
- **Where:** a region in `state.regionsUnlocked` (starting with `dustbowl`).
- **Limits:**
  - at most `MAX_EXPLORERS` out at once
  - supplies are 0–`MAX_SUPPLIES` of each kind, taken from `state.resources.medpatch` and `state.resources.purge`
- **What happens:** the resident leaves their room (`roomId = null`) and `resident.expedition` is set. An `expeditionStarted` event fires, and a first journal entry is written.

**While exploring** (`tickExpeditions`). Model it on the original (research 03 §4.3) with our own content:
- **Guaranteed finds:**
  - a weapon or outfit roughly every 60 minutes of exploring, mostly common and more often rare the longer the trip
  - a salvage event roughly every 180 minutes, with a success check; the chance of rare and legendary salvage rises with time out
- **Scrip:** finds scale linearly with Fortune.
- **Encounters:** enemy, location and NPC events from the region's tables. Each has a stat, a difficulty and a time window (the earliest and latest minute out it can occur). Success check: `ceil(level/2) + randInt(minDmg, maxDmg) + randInt(0, S−1) + randInt(0, S−1) ≥ difficulty`, where S is the event's stat including the outfit and damage comes from the weapon (fists 1–1). Success gives the reward and XP; failure gives damage and a little XP.
- **Rare-item paths (wishlist):** item finds can become blueprint fragments or whole recipes (use `addFragment`/`unlockRecipe` at collection time; keep them in `loot` until then). Legendary weapons and outfits are never found whole in the wild, only as fragments. This is the steady, luck-into-progress path.
- **Taint:** Glare exposure adds taint over time, unless effective Grit ≥ 11.
- **Supplies:** a Med-Patch is used automatically at ≤ 50% HP (heals 50% of max HP). A Purge is used when taint ≥ 50% of max HP (removes 50%).
- **Levelling:** XP goes through `grantXp`, and a level-up refills HP.
- **Death:** HP reaching 0 with no Med-Patches left sets `status = 'dead'` and `resident.dead = true`, and fires `explorerDied`.
  - `revive` brings them back; `onResidentRevived` then resumes exploring.
  - Recalling a dead explorer sends their body home with half the loot. They arrive as a fallen resident inside, to be revived or laid to rest.
- **Carry limit:** at `CARRY_LIMIT` carried (items plus salvage units, see `carriedCount`), the explorer starts home automatically (`expeditionReturning`, reason `full`).
- **Journal:** timestamped, deadpan, one line per entry, atompunk flavour, in the explorer's voice. Examples: "Found a billboard promising 'A Brighter Tomorrow, Guaranteed.' It's on fire." and "Traded pleasantries with a Rustman. Mostly he pleasantly threatened me." Write **at least 60 original musing lines** plus encounter, win and retreat lines for every enemy, and a line for each location and NPC. Cap the journal at about 150 entries, dropping the oldest musings first. Push `expeditionJournal` events only for notable entries (finds of rare or better, fights, level-ups, danger, status), not for musings.

**Coming home:**
- `recallExpedition` starts the trip back, which takes half the time spent out (at least 60 s).
- On arrival, `status = 'returned'` and `expeditionReturned` fires.
- `collectExpedition` hands everything over:
  - items through `grantItem`
  - salvage through `addSalvage`
  - fragments through `addFragment`
  - recipes through `unlockRecipe`
  - scrip through `addScrip`
  - unused supplies go back to stock
- The resident comes back inside idle, the expedition is removed, and `expeditionCollected` fires with the loot.
- Counters to `bump`: `expeditionsCompleted`, `explorerSeconds`, `glarelandsScrip`, `encountersWon`, and so on.

**Content** (`exploration.json`):
- Keep `regions[]` (id, name, description, danger). Add the Dustbowl Flats tables, with about 25 enemies, about 15 locations, about 10 NPCs and the salvage events, all with original names. Examples: glare-rats, scrap hounds, dust stalkers, Rustman scouts, Hollowed wanderers, a Mauler as the late-trip apex, a drive-in, a Halcyon sales office, a crashed monorail.
- Add all tuning numbers.
- Add about 10 achievements under `"achievements"`, using the same shape as `src/content/achievements.json`. Their `stat` keys must match the counters you bump.

**Tests** (`tests/exploration.test.ts`):
- validation rules
- finds accrue over time
- the same seed gives the same results
- a 10-hour `catchUp` produces loot and journal entries
- return takes half the time
- the carry limit triggers the return
- supplies are used automatically
- death, then revive, resumes exploring; recalling the dead brings the body home
- collect moves loot into the homestead and puts the resident back
- a save round-trips mid-expedition
- a performance check: 25 explorers over 72 h offline in under 2 s

---

## Stream B: crafting

**Owns:** `src/sim/systems/crafting.ts`, `src/content/crafting.json`, `tests/crafting.test.ts`.

Implement every function in the contract (`crafting.ts`) without changing its signatures.

**Recipes** (`crafting.json`):
- One recipe per weapon and outfit (15 and 21 of them). Recipes are data, not generated at runtime.
- Keep the existing `fragmentsNeeded` (rare 3, legendary 5).
- Each recipe has:
  - salvage costs:
    - commons: common salvage only
    - rares: common plus rare salvage
    - legendaries: rare plus legendary salvage
  - a scrip cost (a starting point: common 20–60, rare 250–600, legendary 6,000–15,000)
  - base seconds (a starting point: common 30–60 min, rare 3–6 h, legendary 12–24 h)
  - the workshop (`weaponshop` or `outfitshop`)
  - the minimum workshop level: 1 common, 2 rare, 3 legendary
- Materials should make thematic sense (circuitry for energy weapons, cloth for outfits and so on).

**Crafting:**
- `canCraft` requires:
  - the right workshop at a high enough level, with power and at least one worker
  - no job already running and no incident in the room
  - the recipe known (`knowsRecipe`)
  - enough salvage and scrip
- `startCraft` spends the salvage and scrip and creates `room.job`.
- **Speed:** crew speed comes from the summed effective `craftStat` of the adults working there, out of 6 × 17 = 102 maximum. Time ≈ `base × (1 − 0.9 × min(1, total/102))`, so the minimum is 10% of base.
  - `job.remaining` counts down in base-seconds. Each tick subtracts `dt × base / craftSeconds(room)`, so a crew change changes the speed.
  - Crafting stalls with no crew, no power, or an incident in the room.
- `craftTimeLeft` gives real seconds left at the current speed.
- **Finishing:** when a job reaches 0, `craftFinished` fires and the job waits. `collectCraft` puts the item into storage through `grantItem` (refuse with "storage is full" rather than selling a crafted item), gives the crew some XP, and fires `craftCollected`.
- `cancelCraft` refunds everything.
- Counters: `itemsCrafted`, `crafted.<rarity>`.

**Scrapping** (`scrapItem`):
- Returns the item's recipe salvage minus a random loss, following research 02 §14.1.
- If the recipe for the item isn't known yet (rare and legendary only), give a **blueprint fragment toward it** through `addFragment`. Scrapping duplicates from crates then eventually teaches you to craft that item, which is another rare-item path from the wishlist.
- A small chance of a fragment toward a random legendary of the same kind.
- `scrapPreview` gives the expected salvage for the UI. Fire `itemScrapped`.

**Reforging** (`reforge`), from the wishlist:
- Takes three stored items of the same kind and the same rarity, plus `reforgeCost(rarity)` scrip.
- **Success chances:** common to rare about 35%, rare to legendary about 20%.
- **Pity:** `state.reforgePity` guarantees an upgrade after 3 failures in a row, then resets.
- **Failure** returns one random item of the input rarity, different from the inputs where possible.
- **Legendary inputs** reroll into a different legendary of the same kind.
- The result goes into storage. The three inputs are removed first, so space is never a problem. Fire `reforged`.

**Content and tests:**
- About 10 crafting achievements under `"achievements"` in `crafting.json`. Their `stat` keys must match your counters.
- **Tests** (`tests/crafting.test.ts`):
  - recipe coverage (every item has one)
  - the gating rules
  - costs are spent and refunded on cancel
  - crew speed follows the formula
  - crafting stalls with no crew, no power, or an incident
  - offline catch-up finishes a job
  - collecting when storage is full is refused
  - scrap returns salvage, and gives a fragment for an unknown recipe
  - the reforge pity guarantee
  - reforge input validation
  - a save round-trips mid-job

---

## Stream C: client

**Owns:** everything in `src/client/**` and `index.html`.

The sim functions in A and B are still stubs while you work, so code against the **contract signatures and types**. To see and test the panels, inject state from the console (push a fake `Expedition` into `state.expeditions`, set a `room.job`, add `state.salvage` and `state.fragments`, and so on). Everything must look right and keep working once the real sims land. The UI reads only public data (types, content, contract functions exported from `src/sim/index.ts`) and changes the game only through `game.run(command)`.

**Renderer** (`src/client/render/`):
- Residents who are away (`expedition !== null`) are not drawn inside the homestead.
- While at least one expedition is out, show small figures on the surface walking off to the right, one per explorer up to about 5, as a visual cue.
- Workshop art for the 9-cell-wide rooms:
  - Weapon Workshop: workbench, vice, gun rack
  - Outfit Workshop: sewing machine, mannequins, fabric rolls
  - both in the same 2.5D cutaway style
- A crafting progress bar on the floor lip, and a "ready" bubble with an item icon when `job.remaining === 0`. Tapping the room then collects (`collectCraft`).

**UI** (`src/client/ui/`):
- **Toolbar:** add **Explore** (the Glarelands panel). To keep 7 buttons on phones, move **Collect all** into the HUD as a small button.
- **Glarelands panel:**
  - the region card (name, description, danger)
  - each expedition: status, time out, HP and taint bars, supplies left, carried `x/100`, a loot summary (scrip, items, salvage, fragments)
  - an expandable journal, newest first
  - buttons: **Recall**, **Collect** when returned, **Revive** when dead (the `revive` command, with its cost), and **Recall body** for the dead
- **Send to explore:** a button on the resident card, shown when `canExplore` returns null, and otherwise disabled with the reason. It opens a modal with a region picker and supply steppers (0 to min(`MAX_SUPPLIES`, stock)), defaulting to min(5, stock). It sends the `explore` command.
- **Workshop room panel:**
  - the recipe list from `workshopRecipes`, grouped by rarity
  - each recipe shows known or locked (with fragments `have/need` when locked), salvage costs as have/need per material, scrip, time with the current crew (`craftSeconds`), and a Craft button, disabled with the `canCraft` reason
  - the active job: progress, time left (`craftTimeLeft`), Cancel, and Collect when done
- **Storage panel tabs:**
  - **Items:** keep what's there, and add **Scrap** (with a `scrapPreview` tooltip) and a **Reforge** mode (select 3 of the same kind and rarity, show the cost and odds, confirm).
  - **Salvage:** counts per item, grouped by material, with rarity colours.
  - **Blueprints:** known rare and legendary recipes, and progress bars for fragments.
- **Toasts** for every new M3 event in `types.ts`.
- **While you were away** mentions explorers who came home or died.
- **Developer console** (`src/client/game.ts`): add `salvage(id, n)`, `fragments(defId, n)`, `learn(defId)`, and `explore(residentId?)`.
- **Mobile:** everything must work at a 390 px width. Panels are already a bottom sheet on phones.

Verify with Playwright (Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`), using `npm run build && npx vite preview`, at desktop and phone sizes. Report any console errors.
