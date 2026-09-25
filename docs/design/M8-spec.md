# M8 spec: Mobile

M8 puts Homestead on phones (GDD §12): a Capacitor shell for Android and iOS, touch polish, and local notifications.

**Acceptance:** Homestead is installable on a phone. That means three things:
- a debug APK builds from the repo
- the web build installs as a PWA
- the game plays well one-handed at 360–430 px wide

There are three parallel streams. The ground rules are the same as M6 and M7:
- a deterministic JSON-state sim, and the client imports only from `src/sim/index.ts`
- `npx tsc --noEmit`, `npx vitest run` and `npm run build` must pass
- **edit only the files you own**, and describe anything else you need in your report
- no new visual style: match `style.css` and the existing art

## Scaffolding already in place (phase 0)

| Piece | Where |
|---|---|
| `upcomingReminders(state, content, {horizonSeconds, max})` returns `Reminder {key, kind, inSeconds, title, body}`, soonest first. It is a stub that returns `[]` | `src/sim/systems/reminders.ts`, exported from `index.ts` |
| `isNative()`, `haptic(kind)`, `onBack(handler)` and `runBack()` are web no-op stubs. Everyone imports device features only from here | `src/client/platform/index.ts` |

---

## Stream N: Reminders (sim)

**Owns:**
- `src/sim/systems/reminders.ts`
- `tests/reminders.test.ts`

Predict what will happen while the game is closed, under the offline rules of `catchUp`: timers run and nothing harmful happens. The function is **pure**: it must not change the state (tests should deep-compare before and after) and must not touch `state.rng`. Read the systems to find each timer. Cover every case that exists:

- **Explorers:** home (`secondsUntilHome`), or out of supplies / "should come home" if that is predictable
- **Caravans:** back at the Trading Post
- **Research:** a node finishing, if research is timed
- **Crafting:** a workshop job done
- **Storage:** a resource or the storage room reaching capacity, or rooms with a full batch waiting (if production pauses when full, say "your homestead is full of X"). Group these into **one** reminder rather than one per room.
- **Family:** a baby is born; a child grows up
- **Contracts and the trade board:** fresh offers (only when relevant: an office, or a staffed Trading Post)
- **Supply crates:** the daily crate or streak, if timed
- **The Deep:** a dig finishing
- anything else with a real timer you find (training, outposts...), where it's worth a phone ping

Rules:
- The title and body are in our voice: short, deadpan and atompunk, with HALCY-style lines welcome. The title is at most 40 characters and the body at most 110.
- A `key` is stable for the same event.
- Skip anything under 60 s away.
- Respect `horizonSeconds` (default 3 days) and `max` (default 20).
- **Tests:**
  - Each kind appears when it should.
  - Advancing the sim with `catchUp` by `inSeconds + a few` actually produces the event: the resident is home, the caravan returned, and so on. Test this for at least explorers, caravans, crafting and storage.
  - Purity.
  - Sorting and the limits.

---

## Stream P: Native shell, storage, notifications, PWA

**Owns:**
- `package.json` and the lockfile
- `capacitor.config.ts`
- `android/` and `ios/`
- `src/client/platform/**`
- `src/client/storage.ts`, `src/client/game.ts` and `src/client/main.ts`
- `index.html` and `vite.config.ts`
- `public/manifest.webmanifest`, `public/icons/**` and the service worker
- **new** `src/client/ui/settings.ts`
- `docs/mobile.md`
- `.github/workflows/**`

**Implement:**
1. **Capacitor** (latest, currently 8.x):
   - core, cli, android and ios, plus the plugins: app, haptics, local-notifications, preferences, status-bar, splash-screen, and keep-awake if useful
   - app id `ai.avolis.homestead`, name "Homestead", `webDir: dist`
   - run `npx cap add android` and `npx cap add ios`; if iOS fails on Linux, say so and still commit whatever can be generated
   - portrait-first, with landscape allowed on tablets if cheap
2. **Android build:**
   - Install the Android SDK command-line tools **outside the repo**, in the scratchpad or `/opt`: platform-tools, a platform and build-tools matching Capacitor's `compileSdk`.
   - Build a **debug APK** with `./gradlew assembleDebug`.
   - Report its path and size, and don't commit the APK.
   - Add the icon and splash from our art: a simple "house over a door" mark in `#f2a541` on `#1b2a2f`, like the favicon. `@capacitor/assets` is fine.
   - Add `npm run android:build` (build, `cap sync`, gradle).
   - Add `.github/workflows/android.yml`, which builds the debug APK and uploads it as an artifact on push.
3. **Platform layer** (`src/client/platform/`): implement the phase 0 API for real.
   - **`haptic`:** uses `@capacitor/haptics` natively and `navigator.vibrate` on the web, both behind a setting.
   - **`onBack`:** the Android back button runs `runBack()`. If nothing handles it, the app minimises (`App.minimizeApp`) and never exits mid-save. On desktop, Escape also runs `runBack()`. Stream T registers the UI handlers.
   - **Lifecycle:** `App` `pause` saves and schedules notifications; `resume` does the same catch-up as `visibilitychange`.
   - **Status bar:** the app draws under it, with a dark style and safe-area insets. Export them if useful.
4. **Storage** (`storage.ts`): natively, mirror every write to `@capacitor/preferences`, because the OS can wipe WebView localStorage.
   - **Boot:** read Preferences first, fall back to localStorage, and migrate one to the other.
   - **Keep it synchronous for callers:** load into memory at boot (an async `initStorage()` awaited in `main.ts` before the game starts), then write through.
   - **Size:** check the save size. If it's large, compress it (e.g. CompressionStream or a small LZ) with a versioned prefix, and keep old saves loadable.
   - **Keep:** backups, undo and slots all keep working.
5. **Local notifications:**
   - **Scheduling:** on pause (and on `pagehide` on the web), take `upcomingReminders(state, content)`, cancel the previous ones and schedule the new ones: ids stable per `key`, at most about 20, and nothing during quiet hours (a setting, default 22:00–08:00: move them to 08:00 or drop them).
   - **Clearing:** on resume, cancel them all.
   - **Permission:** ask the first time it matters, not at launch: after the first explorer or caravan is sent, with a HALCY line. Handle a refusal gracefully.
   - **Web fallback:** use the Notification API where available, only while the page is open-but-hidden, and it's optional.
6. **Settings panel** (new `ui/settings.ts`, exported `settingsPanel(game): HTMLElement`):
   - notifications on/off by kind group (expeditions and caravans, production and storage, family, offers)
   - quiet hours
   - haptics, reduced motion, and a battery saver that caps FPS at 30, with a hook stream T reads
   - the save size or version
   - Store the settings in storage under their own key.
   - I'll wire the entry into the ☰ menu (it's in `ui.ts`, which T owns); say what call to add.
7. **PWA:**
   - `manifest.webmanifest`, icons (192, 512 and maskable) and a service worker that caches the app shell and sprites for offline play. Use a versioned cache; hand-rolled or vite-plugin-pwa are both fine.
   - **Fonts:** bundle them offline (use `@fontsource/bungee` and `@fontsource/work-sans`, and drop the Google Fonts link) so the app works in airplane mode.
   - **Paths:** the build must still work from `base: './'`.
8. **`docs/mobile.md`:** how to build and run on Android and iOS, the notification behaviour, and the storage safety.

**Tests:** unit-test the pure parts: settings defaults and parsing, quiet-hours shifting, the reminder-to-notification mapping (ids, limits), and save compression round-trips, including old uncompressed saves.

---

## Stream T: Touch polish

**Owns:**
- `src/client/render/**`
- `src/client/ui/**` except `ui/settings.ts`
- `style.css`

**Implement:** play the whole game in Playwright at 360×740, 390×844 and 412×915 (touch emulation: `hasTouch`, `isMobile`), plus landscape 844×390 and a tablet at 820×1180. Fix what's awkward.

1. **Gestures in the vault:**
   - **Tuning:** check pan (with inertia), pinch zoom around the midpoint, and double-tap to zoom in or out; tune the tap and drag thresholds.
   - **Dragging residents:** keep the long-press-to-pick-up delay short, with a haptic on pick-up and drop. The view auto-scrolls near the screen edges while dragging.
   - **Stray taps:** they must not select through panels.
2. **Room sheet vs. camera:** when a bottom sheet opens for a room, pan the camera so the room sits in the visible area above the sheet (the gap stream D reported), and restore it on close.
3. **Back handling:** register `onBack` handlers, closing in this order: confirm or modal first, then the panel, then the quest screen (with its own confirm), then build mode.
4. **Layout:**
   - every tap target is at least 44×44 px
   - text is at least 12 px
   - nothing overflows horizontally at 360 px
   - safe-area insets are used: `env(safe-area-inset-*)` on the HUD, toolbar and sheets
   - sheets are swipe-down-to-close with a grab handle
   - the modals fit at 740 px tall
   - the landscape phone is usable (the HUD compresses and the sheet becomes a side panel)
   - check every panel: build, room, residents, storage, crates, explore, quests and the quest screen, research, deep, factions, legacy, goals, notices, prestige and founding flow
5. **Quest combat on touch:** check the crit-ring timing, the ability buttons, target taps and dodge, and that it works with thumbs at the bottom of the screen.
6. **Performance:**
   - **Battery saver:** a governor lowers the FPS when idle (no input for 20 s, and nothing animating that matters), and pauses rendering while hidden.
   - **Resolution:** cap `resolution` at `min(devicePixelRatio, 2)`.
   - **Frame time:** measure it at 390 px on a pop-100 vault (`homestead.qol.bigVault(100)`) and report it.
   - **Settings hook:** read the battery-saver and reduced-motion settings from `localStorage` key `homestead.settings` (a JSON object with `batterySaver: boolean` and `reducedMotion: boolean`, both false by default) through a tiny reader in your own files. Stream P writes that key.
7. **Haptics:** call `haptic()` from the platform layer on build placed, collect, crit, a resident dropped into a room, a quest win or loss, and a crate opened.
8. **Screenshots:** put them in `docs/screens/m8/`, reduced to 256 colours, covering the phone sizes, landscape and tablet.

Report what you changed, the measured frame times, and any sim or platform needs.
