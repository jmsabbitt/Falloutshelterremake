# Playtesting Homestead

A short guide to playing the current build and reporting what you find. The questions that matter most right now are: **is it fun, is the pacing right, and is it clear what to do?** The automated tests and bots can't answer those.

## Getting the game

- **Android:** install the debug APK (sent in chat, or from the latest "Android debug APK" run in the repo's Actions tab, artifact `homestead-debug-apk`). Allow "install unknown apps" for your browser or file manager when asked.
- **Browser, desktop or phone:** the "Web build on GitHub Pages" workflow publishes the game on every push to `main` (or run it by hand from the Actions tab).
  - **One-time setup:** in the repository on GitHub, go to Settings → Pages and set Source to "GitHub Actions". The game's URL then appears on that page, and in the workflow run.
  - **On a phone** you can add it to the home screen, and after the first load it plays offline.
- **iPhone:**
  - **Now:** open the GitHub Pages URL in Safari, then Share → Add to Home Screen. It runs full-screen, like an app, and plays offline, but without notifications.
  - **As a real app:** use TestFlight once an Apple Developer account is set up; see docs/mobile.md, "iOS".
- **Locally:** `npm install`, then `npm run dev`, then open the address it prints.

## Session 1: the first hour (about 30–60 minutes of real play)

Start a new game (☰ → Start over → New homestead, or a fresh install) and note anything confusing. Your first homestead starts with only the door and the elevator shaft, and HALCY's tutorial bubble under the top bar walks you through the basics. Follow it:

1. **Let the founders in:** tap the door (it's outlined in teal).
2. **Build power, water and food:** for each one, tap Build (it pulses). The right room is already picked, and green slots show on both sides of the elevator. Put **at least one room on the left of the shaft**, to check both sides work. These three are free.
3. **Staff them:** after each build, drag the founder HALCY names into the new room (drag only: tapping a resident opens their card). Rooms that suit the person you're dragging light up.
4. **Collect:** the tutorial rooms start nearly full, so a bubble pops up within a minute. Tap it.
5. **Supply crate:** open one (Crates, or 📦 at the top on a phone), then tap **Equip** on the item card and pick who gets it.
6. **Closing line:** HALCY points you to Quarters (new arrivals need beds, and families start there). Build one, then carry on.

Also try **Skip tutorial** in a second new game, at any step: it should build whichever of the three rooms are missing, so the homestead is never left without the basics.

Then keep playing normally:

1. **Building:** build a second room of the same kind next to one to merge them, then upgrade a room from its panel.
2. **Collecting:** keep collecting power, food and water, and try a rush.
3. **Incidents:** when fires, Skitters or raiders arrive, drag people to fight them.
4. **Exploring:** send an explorer (pack Med-Patches and Purge), and later bring them home.
5. **Close the game** for a while, then come back and read the "while you were away" summary. Finished batches collect themselves into storage while you're away (while there's space), so the homestead should have kept working. On Android, check that the notifications made sense.

**Things to judge:**
- Did you always know what to do next? Where did you get stuck?
- Did the tutorial bubble ever cover something you needed to tap?
- Was anything too slow or too fast?
- Did anything look broken on your screen?

## Session 2 onwards: the whole game, fast

A real playthrough of every act takes weeks of game time. To try the later content without the wait, use **Custom Game**: ☰ → Custom Game, then pick a preset. Custom Games have their **own save** and never touch your real homestead, and their **achievements are off**.

| Preset | What it's for |
|---|---|
| Blank Slate | The usual start, with the Sandbox and nobody keeping score |
| Boomtown | The mid game: plenty of rooms, few people |
| The Neighbours Call | **Act 2** (homestead 2): factions, trade, caravans, the surface |
| Below the Seal | **Act 3** (homestead 3): the Seal and the Stillwater |
| Last Rent | **Act 4 and the endings** (homestead 4). The true ending, *Good Neighbours*, needs some conditions met first; the choice screen lists them |
| The Deep from Day One | The Deep and its rooms |
| A Ruined Homestead | A rescue: empty stores, injured residents and some already lost |
| Old Hands / All Rooms, No People | High-level quests; every room type |
| The Hard Road | Famine, Iron Door and Survival together |

- **Sandbox button:** inside a Custom Game, the 🛠 Sandbox button gives you resources, residents, items, incidents, weather, research and a **time speed of ×1 to ×100**.
- **Going back:** ☰ → "⌂ Back to homestead" (also in the Sandbox panel).

**Worth trying in a Custom Game:**
- **Quests:** a quest fight, including the crit ring, abilities and a boss.
- **Topside:** the surface buildings and the weather.
- **Factions:** trading and sending a caravan.
- **Legends:** a legendary resident's card and personal quests.
- **The Collection Log:** Goals → Collection Log.
- **Founding:** a new homestead (Legacy → "🏗 Found a New Homestead"), including picking rulesets.
- **The ending:** reaching and choosing an ending, and the epilogue.

## Reporting what you find

For each thing, note:
- what you were doing
- what you expected
- what happened
- a screenshot, and whether it was phone or desktop

For anything strange with a save, export it (☰ → "⤓ Export" under "This homestead") and attach the file.

## Handy for desktop testing

In a development build (`npm run dev`, or `VITE_DEV_CONSOLE=1 npm run build`), the browser console (F12) has helpers on `window.homestead`. Release builds, including the GitHub Pages site, leave them out:

| Helper | What it does |
|---|---|
| `qol.bigVault(60)` | Builds a populated vault |
| `m7.topside()` | Builds the surface |
| `m9.legends()` | Brings every legend to the door |
| `ending.act4()` / `ending.play('neighbours')` | Jumps to Act 4, or plays an ending's epilogue |
| `skip(3600)` | Fast-forwards an hour |
| `reset()` | Starts over |

## Known gaps

- **Phone title:** on phones, an ending's title only shows in the ☰ menu.
- **Late-game pacing:** in bot runs the third homestead took about 9 in-game days. Tell us if that feels like a grind.
