# Playtesting Homestead

A short guide to playing the current build and reporting what you find. The questions that matter most right now are: **is it fun, is the pacing right, and is it clear what to do?** The automated tests and bots can't answer those.

## Getting the game

- **Android:** install the debug APK (sent in chat, or from the latest "Android debug APK" run in the repo's Actions tab, artifact `homestead-debug-apk`). Allow "install unknown apps" for your browser or file manager when asked.
- **Browser, desktop or phone:** the "Web build on GitHub Pages" workflow publishes the game on every push.
  - **One-time setup:** in the repository on GitHub, go to Settings → Pages and set Source to "GitHub Actions". The game's URL then appears on that page, and in the workflow run.
  - **On a phone** you can add it to the home screen, and after the first load it plays offline.
- **iPhone:**
  - **Now:** open the GitHub Pages URL in Safari, then Share → Add to Home Screen. It runs full-screen, like an app, and plays offline, but without notifications.
  - **As a real app:** use TestFlight once an Apple Developer account is set up; see docs/mobile.md, "iOS".
- **Locally:** `npm install`, then `npm run dev`, then open the address it prints.

## Session 1: the first hour (about 30–60 minutes of real play)

Play normally from a new game and note anything confusing:

1. **Starting out:** read the welcome, let the founders in (tap the door), and drag residents into rooms that suit their best stat (dragging is the only way to assign; tapping a resident just opens their card, and rooms light up green while you drag).
2. **Building:** tap Build, pick a room, tap a green slot to place it, build a second one of the same kind next to it to merge them, then upgrade a room from its panel.
3. **Collecting:** collect power, food and water when they're ready, and try a rush.
4. **Supply crates:** open some, and equip what you get from Storage (Items on a phone).
5. **Incidents:** when fires, Skitters or raiders arrive, drag people to fight them.
6. **Exploring:** send an explorer (pack Med-Patches and Purge), and later bring them home.
7. **Close the game** for a while, then come back and read the "while you were away" summary. On Android, check that the notifications made sense.

**Things to judge:**
- Did you always know what to do next? Where did you get stuck?
- Was anything too slow or too fast?
- Did anything look broken on your screen?

## Session 2 onwards: the whole game, fast

A real playthrough of every act takes weeks of game time. To try the later content without the wait, use **Custom Game**: ☰ → Custom Game, then pick a preset. Custom Games have their **own save** and never touch your real homestead, and their **achievements are off**.

| Preset | What it's for |
|---|---|
| Boomtown | The mid game: plenty of rooms, few people |
| The Neighbours Call | **Act 2** (homestead 2): factions, trade, caravans, the surface |
| Below the Seal | **Act 3** (homestead 3): the Seal and the Stillwater |
| Last Rent | **Act 4 and the endings** (homestead 4). The true ending, *Good Neighbours*, needs some conditions met first; the choice screen lists them |
| The Deep from Day One | The Deep and its rooms |
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

The browser console (F12) has helpers on `window.homestead`:

| Helper | What it does |
|---|---|
| `qol.bigVault(60)` | Builds a populated vault |
| `m7.topside()` | Builds the surface |
| `m9.legends()` | Brings every legend to the door |
| `ending.act4()` / `ending.play('neighbours')` | Jumps to Act 4, or plays an ending's epilogue |
| `skip(3600)` | Fast-forwards an hour |
| `reset()` | Starts over |

## Known gaps

- **Placeholder art:** the sky above ground and the dirt around the rooms are still drawn, not painted. The art brief is in `docs/art/ART-HANDOFF-M9.md` section 10.
- **Phone title:** on phones, an ending's title only shows in the ☰ menu.
- **Late-game pacing:** in bot runs the third homestead took about 9 in-game days. Tell us if that feels like a grind.
