# M4 spec: quests, combat and Act 1

This is the working contract for milestone M4. The quest engine is already built and tested:

- `src/sim/systems/quests.ts`: the engine
- `src/sim/systems/questBot.ts`: a scripted player
- `tests/quests.test.ts`: engine tests
- `npm run quest-balance`: the balance harness

Two parallel streams build on the engine and own **separate files**:

- **Stream B** writes the content.
- **Stream C** builds the client.

Do not edit files outside your stream. If you need an engine or shared change, describe it in your final report and keep going with a workaround.

Read first:

- `docs/design/GDD.md`: §9 Quests and combat, §11 Story, §15 wishlist (bounty contracts, fragments, crates)
- `docs/research/03_threats_exploration.md`: how the original's quests worked
- `src/sim/types.ts`: the M4 section
- `src/sim/systems/quests.ts`

## Ground rules

- **Original IP only.** No Fallout names, places, creatures or items.
  - The setting is atompunk: the Halcyon Shelter Company, HALCY (the relentlessly cheerful corporate AI), the Glare (the sky-fire catastrophe), the Glarelands (the surface), taint (Glare-sickness) and scrip (currency).
  - Enemies: Rustmen (raiders), the Hollowed (Glare-sick humans), Skitters, Burrowers and Maulers (apex predators).
  - Tone: deadpan, pun-friendly, corporate optimism against a horrible surface.
- **The sim is deterministic and pure.** The client changes the game only through `game.run(command)`.
- **Style.** Match the existing code: TypeScript strict mode, small functions, and short comments that explain why.
- **Before finishing:** run `npx tsc --noEmit` and `npx vitest run`; both must pass. Commit on your worktree branch with clear messages.

## How the engine works

### Setting out

- The **Command Office** (room type `office`, category `office`) unlocks at population 18. Only one can be built.
- Its level sets the number of concurrent quests: 1, 2 or 3 (`officeSlots`). A quest that has returned but not been collected still takes a slot.
- `startQuest` (story quest) and `startContract` (a contract offer) take:
  - a party of 1–3 eligible residents (`canQuest`: an adult who is inside and not pregnant)
  - up to 10 Med-Patches from stock
- Party members get `resident.quest = questId`. They are then away: they don't eat or work, and they can't be assigned or have their gear changed.

### Travelling

- The party travels for `travelMinutes`.
- Travel keeps running while the player is offline.

### On site

- The party appears in the map's `start` room. The map is a set of rooms on a small grid (`floor`, `col`) joined by `links`.
- `questMove` walks to a linked room, which takes 3 s.
  - Not allowed during a fight or while an event is waiting for an answer.
  - A room's contents trigger the first time it is entered.
- Room kinds:
  - `fight` / `boss`: enemies spawn and real-time combat starts.
  - `loot`: rewards are rolled into the quest's loot.
  - `event`: `pendingEvent` is set and the player answers with `questChoose`.
  - `empty` / `start`: nothing happens.
- Clearing the room marked `objective` completes the quest: the reward is rolled into the loot and the party heads home.
- **Nothing on site runs offline.** Combat and walking pause until the player is back.

### Combat

All of it happens inside `tickQuests`.

**Party members:**

- Attack every 1.5 s for a weapon roll plus 0.25 × level (fists do 1–2). They hit their `target`, or the first living enemy.
- Every hit fills the crit meter by 0.06 + 0.012 × Fortune.
- **Crits:** when the meter is full, the player plays a timing ring. The ring's speed is `critRingSpeed(res)`, and Sight slows it. The client sends `questCrit` with a quality from 0 to 1, and the damage multiplier is `critMultiplier(quality)`: 1.5× at worst, 4× at best.
- **Abilities:** each resident has one ability, set by their best effective stat (`abilityFor`), with a cooldown:

| Best stat | Ability | Effect |
|---|---|---|
| Brawn | Haymaker | Big hit plus a stun that **interrupts a wind-up** |
| Sight | Deadeye | Heavy single hit |
| Grit | Hold the Line | Taunts all enemies, and the taunter takes half damage |
| Charm | Rally | Party deals ×1.4 damage for 8 s |
| Wits | Field Dressing | Heals the party by 25%, including anyone who is down |
| Knack | Rigged Charge | Hits every enemy |
| Fortune | Lucky Break | Fills every crit meter |

- **Armour matters:** damage taken is cut by 2.5% per point of effective Grit (outfits included), up to 60%.
- `questHeal` uses one of the party's Med-Patches on a member who is still standing.

**Enemies:**

- Attack their target every `interval`.
- Scale with the quest's `level`: +14% HP and +8% damage per level above 1.
- **Telegraphed abilities:** every `every` seconds an enemy spends `windup` seconds visibly winding up, emitting `questWindup`, then the ability lands. A stun cancels it.

| Effect | What it does |
|---|---|
| `slam` | Hits the whole party |
| `heavy` | Big hit on one target |
| `summon` | Brings in `adds` |
| `enrage` | Raises its damage for a while |
| `heal` | Restores its own HP |

**Downed, wiped and abandoned:**

- A member at 0 HP is **downed**. They get back up at 15% HP when the room is cleared.
- If the whole party is down, the quest **fails**: they come home dead, to be revived or laid to rest.
- `abandonQuest` retreats: the party keeps what it found but gets no reward.

### Coming home

- The party walks back, taking as long as the trip out, and the quest becomes `returned`.
- `collectQuest` pays out:
  - items, salvage, fragments, recipes, crates, scrip and Med-Patches
  - XP from the enemies beaten and the quest reward, shared across the party
- It also marks the story quest done, unlocks any `regions` in the rewards, and brings the party back inside.

### Contracts

- Contracts unlock once `act1_1` is done (`tuning.contracts.unlockedBy`), then refresh every 6 h of sim time (so dedicated players always have work). Three are offered each time.
- Each offer rolls a template, a place, a level (around the average of the top three residents' levels), a travel time and a **named bounty** (GDD §15). A rare bounty is a whole item. A legendary bounty is 1–2 fragments of a named legendary, since legendaries never drop whole.

### Useful helpers

These come from `src/sim`:

- `officeSlots`, `canQuest`, `availableQuests`, `questLocked`, `questDef`, `questContent`
- `abilityFor`, `critMultiplier`, `critRingSpeed`, `damageReduction`, `enemyDef`, `currentRoom`, `inCombat`
- `playQuest` from `src/sim/systems/questBot.ts`

### Events

Events arrive through `game.drainEvents` / `ui.onEvents`:

- Travel and arrival: `questStarted`, `questArrived`
- Rooms: `questRoomEntered`, `questCombat`, `questRoomCleared`
- Combat:
  - `questHit` (from, source, target, amount, crit; use it for floating numbers)
  - `questAbility`, `questWindup` (enemyUid, ability, seconds), `questInterrupted`
  - `questEnemyDown`, `questMemberDown`
- Loot and choices: `questLoot`, `questEventPrompt`, `questEventResolved`
- Endings: `questFinished` (outcome), `questReturned`, `questCollected`
- Contracts: `contractsRefreshed`

---

## Stream B: content and balance (Act 1, contracts, enemies)

**Owns:**

- `src/content/quests.json`: everything except `tuning` and `abilities`. You may tune those too, but list every change in your report.
- `tests/questContent.test.ts` (new)
- `scripts/questBalance.ts`

The schema is the set of interfaces at the top of `quests.ts`: `EnemyDef`, `QuestRoomDef`, `QuestEventDef`, `QuestDef`, `ContractTemplateDef`. Keep the existing ids `act1_1`, `relay_panel` and `c_pest_control`, which the tests use. You may rewrite their text, and change their maps as long as `act1_1` keeps rooms `a`→`b`, `b` as a fight, and an objective boss room `e`.

### Act 1: "The Silent Neighbour"

Write six story quests, `act1_1` to `act1_6`, each requiring the one before. The first boss comes in `act1_6`, which meets the M4 acceptance test: "Act 1 is playable up to the first boss". Suggested beats (improve them freely):

1. **Welcome Wagon** (already exists). Clear the ridge relay. HALCY picks up a faint ping from Homestead 212, which hasn't answered in months.
2. Repair a second relay and triangulate 212. The first Rustmen appear, and they have 212 gear.
3. A Rustman toll camp on the road to 212. There's an event with a Charm or Wits way past part of it.
4. 212's door stands open. Inside: the Hollowed, and HALCY-212's cheerful looping announcements.
5. Deeper into 212: logs show its warden opened the sealed lower strata. This hints at the Deep (GDD §11: nobody knows why the lower strata are sealed). A mini-boss.
6. **The boss.** A Rustman warlord who has taken over 212 (or something worse). It needs at least two telegraphed mechanics, for example a party-wide slam that a Haymaker can interrupt and a summon at intervals. The debrief closes the act, with a hook toward Act 2 and prestige.

### Quest requirements

- `brief` is HALCY's voice: cheerful and corporate. `debrief` too. 2–4 sentences each.
- Maps: 5–10 rooms on 2–3 floors, with some branching. At least one `shuffle` group per quest, so repeat play and fresh homesteads vary.
- Rising `level` across the act: about 2 → 10. Rewards grow to match (scrip, crates, rare items, and a legendary fragment or recipe from the boss).
- Population gates: `act1_1` has none, since the office already needs 18. Later quests can ask for 20–40.
- Every rare-item path from the GDD wishlist should appear somewhere: named items, fragments, recipes and crates.

### Enemies

- At least 12, across Skitters, Burrowers, Rustmen, the Hollowed and one Mauler.
- `look` keys must come from this list, which the client draws: `skitter`, `skitter_queen`, `burrower`, `rustman`, `rustman_brute`, `rustman_chief`, `hollowed`, `hollowed_hulk`, `mauler`, `sentry`.
- Use `drop` for flavourful loot.

### Contracts

- **At least 6 templates**, each with 3+ places, different map shapes and both bounty rarities.
- At least one should be longer, with a legendary bounty.

### Events

- **At least 15**, with stat checks across all seven stats and funny, deadpan text.
- Failure outcomes should sting a little (damage, or a fight) without being cruel.

### Achievements

- Around 15 under `"achievements"`, in the `AchievementDef` shape (bronze, silver or gold), on the counters the engine bumps:
  - `questsStarted`, `questsCompleted`, `storyQuestsCompleted`, `contractsCompleted`, `questline.act1`
  - `questEnemiesDefeated`, `bossesDefeated`, `questCrits`, `perfectCrits`, `abilitiesUsed`, `questInterrupts`
  - `questChecksPassed`, `questWipes` (a hidden one is fine), `questScrip`
- Achievement ids must be unique across all content files.

### Balance targets

Check with `npm run quest-balance` (party of 3 and party of 1, across level and gear setups). Tune enemy HP, damage and levels until these hold:

| Party | Target |
|---|---|
| The quest's `level` + 2, common weapons, party of 3 | ≥ 90% wins, 1–3 minutes on site |
| At or below `level` − 2 with fists | Should usually lose the harder Act 1 quests, so gear and levels matter |
| The act 1 boss: level + 2, rare weapons, party of 3 | Wins; the fight lasts 45–120 s with visible danger (someone below 50% HP) |
| Contracts at the party's own level | ≥ 85% wins for a party of 3 |

Extend `scripts/questBalance.ts` if useful, for example with a per-quest level offset. Put the final table in your report.

### Content tests (`tests/questContent.test.ts`)

Check that:

- every enemy, pool, event and item id referenced anywhere exists
- every map is connected, has exactly one `start` and at least one reachable `objective`
- every `shuffle` id exists
- every quest's `requires` refers to real quests
- the questline lists every act1 quest in order
- every enemy `look` is in the allowed list
- achievement ids are unique
- `playQuest` finishes each Act 1 quest with a strong party (level 20, rare weapons)

---

## Stream C: client (Command Office, quest screen, combat UI)

**Owns** `src/client/**`. Put new code in **new files** and add only small hooks to the big existing ones (`ui.ts`, `vaultView.ts`):

- `src/client/ui/quests.ts`: panels and modals
- `src/client/render/questView.ts`: the Pixi quest scene

Don't edit `src/sim/**` or content.

### The Command Office room

- Give it a look in `palette.ts`, and props in `vaultView.ts`: a big wall map with pins, a desk, a radio set. Keep it atompunk.
- The room panel shows the quest slots and a "Quests" button, which opens the quests panel.

### The quests panel

- A new toolbar or menu entry. Hide it, or show "Build a Command Office (pop 18)", until an office exists.
- **Story:** the current Act 1 questline, showing done, available and locked quests with the lock reason. Each quest shows its title, HALCY's brief, recommended level, travel time and rewards.
- **Contracts:** the three offers, with the **named bounty shown prominently** (item name, rarity colour, fragment count), the level and the time until refresh.
- **Active quests:** status, travel countdown, and "Open" (on site), "Collect" (returned) or "Abandon".

### Party picker modal

- Pick 1–3 residents, with the eligible ones first, sorted by level.
- For each: show level, HP, weapon damage and outfit, and the **ability they bring** (`abilityFor`: name and description), so the player can build a Tank + Damage + Support party.
- A Med-Patch stepper (0–10, limited by stock) and a Start button.

### The quest screen

This is the heart of M4.

- **Layout:** a full-screen overlay over the vault, drawn in Pixi (in `questView.ts`, with its own Container, or a second canvas if simpler), with a DOM bar for controls.
- **Map:** the rooms as a side-view cutaway on their `floor` and `col` grid, drawn like our vault rooms but grimier (the wasteland ruins of a relay station or a homestead). Unvisited rooms are fogged. Links are drawn as doorways or stairs. Tapping a linked room moves the party there. The camera follows the party.
- **Party:** use the sprite `Figure` from `render/sprites.ts` (with the placeholder fallback), walking while moving. Show HP bars, a crit meter ring, and downed and taunting states.
- **Enemies:** draw each `look` with Graphics, in the style of the existing incident art in `vaultView.ts` (skitters and rustmen exist there already). Show HP bars. Bosses are bigger and have a name plate. Tapping an enemy sends `questTarget`.
- **Telegraphs:** a clear wind-up bar and icon over an enemy during `windup` (from the state, or `questWindup` events), with the ability name, so the player knows to Haymaker.
- **Floating numbers** from `questHit`, with crits bigger and gold.
- **Per-member controls:**
  - **Crit:** glows when the meter is full, and opens the **ring minigame**. A ring shrinks or pulses over the target at `critRingSpeed(res)` sweeps per second, and the player taps. Quality = 1 − |offset from the sweet spot|, mapped to 0..1. Send `questCrit` with that quality, and show "PERFECT" or "GOOD".
  - **Ability:** a button with a cooldown fill.
  - **Med-Patch:** a button showing the party's supply count.
- **Events:** a modal with the event text and option buttons, showing the stat and difficulty (for example "Rewire it (Knack 6)"), and your best party member's value for that stat. Show the outcome text after choosing.
- **Log:** a small scrolling log from `quest.log` (loot and event outcomes).
- **Finish:** a victory or failure banner and HALCY's debrief (from `questDef`) when the quest finishes, then "Head home". Closing the screen never stops the quest.
- Make it mobile-friendly: tap targets at least 40 px, and it must work at 390×844.

### Notifications and HUD

- A small HUD chip with the active quest count, which opens the quests panel.
- Toasts for "Party arrived at …", "… complete!" and "Party is home: collect rewards".
- While the quest screen is open, keep the vault simulation running as usual.

### Dev console

Add to `window.homestead`:

- `quest.office()`: build an office at a free spot, or push one like the tests do
- `quest.party(level, weapon)`: buff three residents
- `quest.skip()`: finish travel now
- `quest.win()`: kill every enemy in the current room

These are for browser testing.

### Verify in the browser

- Start the preview with `npm run build && npx vite preview --port 4173 --strictPort &`.
- Drive it with Playwright. Playwright is installed in `/tmp/pw-c/node_modules`; run scripts from that directory. Launch with `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`.
- Don't use `pkill -f` on the preview, because it kills the shell.
- Take screenshots of:
  - the quests panel
  - the party picker
  - a fight with a wind-up shown
  - the crit ring
  - an event modal
  - the victory screen

  Include them in your report as file paths under `docs/screens/m4/`.
