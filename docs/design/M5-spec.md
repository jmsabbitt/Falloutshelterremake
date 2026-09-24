# M5 spec: prestige v1, "Found a New Homestead"

This is the working contract for milestone M5. The sim side is built and tested: `src/sim/legacy.ts`, `src/sim/systems/prestige.ts`, `src/content/legacy.json` and `tests/prestige.test.ts`. What's left is **the client** (one stream) and a headless balance run (done in the main branch).

Read first:

- `docs/design/GDD.md` §10 (prestige)
- `src/sim/legacy.ts` and `src/sim/systems/prestige.ts`
- the M5 section of `src/sim/types.ts`
- `src/content/legacy.json`

The ground rules from `docs/design/M4-spec.md` apply: original IP, atompunk tone, the client changes the game only through `game.run`, TypeScript strict mode, and `npx tsc --noEmit` and `npx vitest run` must pass.

## How it works (sim, done)

### The Charter milestone

- `charterStatus(state)` returns the requirements (label, have, need, done), `ready` and HALCY's charter text.
- First homestead: 100 residents plus the Act 1 finale (`act1_6`).
- Later homesteads (for now, until Act 2 exists): 100 residents plus 15 contracts completed in that homestead.
- The first time it's met, a `charterReached` event fires.

### Legacy

- `legacyBreakdown(state)` shows what founding now would earn, line by line. It counts only this homestead: peak population, story quests, contracts, bosses, achievements earned here, highest level, level-3 rooms, legendary residents and days survived (up to 30).
- The total is multiplied by the current site's `legacyMult`.

### Founding

- `canFoundHomestead(state)` requires the charter to be ready, and no quests or expeditions out.
- `foundingLimits(state)` gives the party size (5 + Big Families) and the heirloom count (3 + Family Heirlooms).
- `canFound(state, resident)` checks each founder: an adult, admitted, not away, not pregnant.
- `foundHomestead(old, { siteId, partyIds, heirloomIds, now })` returns `{ ok, state, legacy }`. It **does not modify the old state**; the client replaces `game.state` with the new one.

**The new homestead:**

- a fresh starter layout at the chosen site
- the founding party waiting at the door, keeping levels, stats and worn gear
- strangers to make up the usual starting six
- the heirlooms in storage
- starting scrip, including Charter Endowment and any site bonus

**What carries over:**

- recipes, fragments and story progress
- regions
- achievements and lifetime stats
- crates, tokens, pity and the daily streak
- Legacy points and perks

**What doesn't carry over:** rooms, resources, other items, salvage, and everyone who stays behind.

**The old homestead becomes an outpost.** It records its population of stayers, its rates, and a history entry.

### Sites

`legacyContent(content).sites` has four:

| Site | Legacy multiplier | Modifier |
|---|---|---|
| Plot 7 | ×1 | none |
| Dry Wells | ×1.25 | water production −25% |
| Rustman Country | ×1.35 | incidents ×1.5, +500 scrip |
| The Scorch | ×1.6 | production −15%, incidents ×1.4 |

### Perks

- 18 perks in 6 branches (`legacyContent(content).perks` and `.branches`). Each has ranks with a cost per rank, and some have a `requires`.
- A perk's `description` contains `{v}`. Fill it with `perRank × rank`, shown as a percentage for fractional effects. Show both the current and the next rank.
- `canBuyPerk` returns the reason a rank can't be bought, or null. The command is `{ type: 'buyPerk', perkId }`.
- Perks take effect at once. The founding perks (Endowment, Prefab Kit, party size, heirlooms) matter at the next founding.
- **Legacy points can only be earned by founding.** On the first homestead the tree is a preview, with 0 points.

### Outposts

- `state.legacy.outposts`. Each outpost trickles scrip, salvage and crates at its `rates`, online and offline, storing up to 24 h (Supply Lines raises the output).
- `outpostTotals(state)` gives the whole units waiting. `{ type: 'collectOutposts' }` takes them, and fires `outpostsCollected`.

### Other events

`perkBought`, `charterReached`, `outpostsCollected`.

### Save

Save format v5 adds `state.legacy`; older saves become the first homestead of a chain.

---

## Client stream: Charter, Found flow, Legacy tree, Outposts

**Owns** `src/client/**`. Put new code in new files (for example `src/client/ui/prestige.ts`), and keep hooks into `ui.ts`, `game.ts` and `main.ts` small. Don't edit `src/sim/**`, content or tests. If you need sim changes, say so in your report.

### 1. Legacy panel

This is a new toolbar or menu entry, "Legacy", with tabs:

- **Charter:**
  - HALCY's charter text and the requirements, each with a progress bar.
  - The Legacy you'd earn now, as a breakdown table with the site multiplier and total.
  - A big **"Found a New Homestead"** button when ready. When not ready, it's disabled and shows why (`canFoundHomestead`).
  - On the first homestead, a short explainer of what prestige is (what carries, what stays).
- **Perk tree:**
  - The six branches as columns, or rows on a phone. Each perk is a card: name, rank as pips, current and next effect text, and the cost of the next rank.
  - Locked perks show their requirement, and there's a Buy button.
  - Unspent Legacy is shown prominently. Good feedback on purchase.
- **Outposts:** one card per outpost (homestead number, site, population, rates per hour, stored amounts with a fill bar toward the 24 h cap), a **Collect all** button, and a small history list of past homesteads.
- **HUD:** a chip when something is waiting at the outposts (for example "🏚 +340"), or when the charter is newly ready.

### 2. The Found a New Homestead flow

This is a full-screen, multi-step modal. It's the most important screen of the milestone, so make it feel ceremonial.

1. **Review:** the legacy breakdown and total. It lists what carries over and what stays behind, from the lists above.
2. **Choose a site:** four cards with name, description, modifiers in plain words, and the Legacy multiplier. Re-show the total with each site's multiplier. (The multiplier scores the *new* homestead when it founds the next one. Say so, for example: "Legacy ×1.35 when this homestead founds its own".)
3. **Founding party:** pick up to N eligible residents, sorted with high levels and legendaries first. Each shows level, rarity, top stats and gear. Explain that everyone else stays at the outpost.
4. **Heirlooms:** pick up to K stored items, rare and legendary first.
5. **Confirm:** a clear summary and an irreversible warning. Before calling `foundHomestead`:
   - Write a backup of the old save, for example `writeSave(json, 9)` or a key like `homestead.save.backup.<cycle>`.
   - Offer a "Download backup" link, using `downloadFile`.
6. **After:**
   - Replace `game.state` with the new state, save immediately, and rebuild the view. The vault view must fully re-sync: new rooms, residents and camera.
   - Show a HALCY welcome message for Homestead N at the site, with a Legacy summary ("You earned X Legacy. Spend it in the Legacy panel.").
   - Then return to the normal game with the party waiting at the door.

Add a small method on `Game` for this, for example `game.replaceState(next)`, which saves, resets the event drain and notifies the UI and view. The existing `import`/`reset` code paths show how state is swapped today.

### 3. Charter-reached moment

On the `charterReached` event, show a celebratory modal: "Charter milestone reached", HALCY's text, and "View Legacy".

### 4. Dev console

Add to `window.homestead`:

- `prestige.charter()`: make the current homestead charter-ready. Use sim-safe edits like `tests/prestige.test.ts` does: add admitted residents up to 100, set `questsDone` to all act1, and set `peakPopulation`.
- `prestige.legacy(n)`: add n unspent points.
- `prestige.found(siteId?)`: found with the top 5 residents and no heirlooms.

### 5. Browser verification

Use Playwright as in M4. It's installed in `/tmp/pw-c/node_modules`; run scripts from that directory, and launch with `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`. Don't use `pkill -f` on the preview.

Test the full flow: charter → found (each step) → the new homestead → buying perks → outpost collect after `homestead.skip(...)` or a catch-up.

Save screenshots to `docs/screens/m5/`, at desktop 1280×800 and phone 390×844, and look at them yourself.

When done: `npx tsc --noEmit`, `npx vitest run` and `npm run build` must pass. Commit on your branch.
