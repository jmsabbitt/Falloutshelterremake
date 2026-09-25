# Homestead on phones

Homestead ships three ways from the same `dist/` web build:

- the **web** build, which also installs as a **PWA** and plays offline
- an **Android** app, built with Capacitor 8
- an **iOS** app, built with Capacitor 8 and Swift Package Manager (it needs a Mac with Xcode to build)

The native shell is thin. `capacitor.config.ts` sets the app id `ai.avolis.homestead`, the name "Homestead" and `webDir: dist`. Device features go through `src/client/platform/`, and nothing else imports Capacitor.

## Android

You need:

- Node 22+
- JDK 21
- the Android SDK with `platform-tools`, `platforms;android-36` and `build-tools;36.0.0`

The SDK must match Capacitor 8's `compileSdk`/`targetSdk` 36 and `minSdk` 24 (see `android/variables.gradle`).

```sh
# One-off, if you don't have Android Studio: the command-line tools, outside the repo.
export ANDROID_HOME=/opt/android-sdk
sdkmanager --sdk_root=$ANDROID_HOME platform-tools "platforms;android-36" "build-tools;36.0.0"
echo "sdk.dir=$ANDROID_HOME" > android/local.properties   # git-ignored

npm ci
npm run android:build        # vite build, cap sync android, gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk (about 11 MB)

adb install -r android/app/build/outputs/apk/debug/app-debug.apk
npm run android:open         # or open the project in Android Studio
```

CI does the same in `.github/workflows/android.yml` on every push. It uploads the APK as the `homestead-debug-apk` artifact.

Web changes only reach the app after `npx cap sync` (included in `android:build`). The copied web assets under `android/app/src/main/assets/public` and all Gradle build outputs are git-ignored.

**Orientation.** Phones are locked to portrait in `MainActivity`. Tablets (smallest width 600 dp or more) may rotate.

**Permissions.** The app asks for `POST_NOTIFICATIONS` (Android 13+), and only when it first matters (see below). The local-notifications plugin's `SCHEDULE_EXACT_ALARM` is removed in the manifest, because pings are scheduled as inexact alarms. A reminder that lands a few minutes late is fine, and an exact alarm would send the player to a system settings screen.

## iOS

`ios/` was generated on Linux with `npx cap add ios`. The Swift Package Manager template was used, so no CocoaPods are needed. The project, the icon and the splash are committed, but they have never been built here. On a Mac:

```sh
npm ci && npm run ios:sync   # vite build + cap sync ios
npx cap open ios             # Xcode: pick a team under Signing, then Run
```

iPhone is portrait only, and iPad allows every orientation (`Info.plist`).

## Icons and splash

The mark is the favicon's "house over a door": `#f2a541` on `#1b2a2f`. The web icons are in `public/icons/`:

- `icon.svg`
- `icon-192.png` and `icon-512.png`
- `maskable-512.png`
- `apple-touch-icon.png`

The Android launcher icons (adaptive and legacy), the splash screens and the monochrome notification icon (`drawable-*/ic_stat_homestead.png`) are in `android/app/src/main/res/`. The iOS app icon and splash are in `ios/App/App/Assets.xcassets/`.

To regenerate them, render these sources from the same SVG mark into a folder such as `assets/`, then run `npx @capacitor/assets generate --android --ios --assetPath assets`:

- `icon-only.png`, `icon-foreground.png` and `icon-background.png` at 1024 px
- `splash.png` and `splash-dark.png` at 2732 px

## PWA and offline play

- `public/manifest.webmanifest` makes the web build installable (standalone, portrait, dark theme).
- `vite.config.ts` writes `dist/sw.js` after each build from `src/client/platform/sw.template.js`. It precaches every output file: the app shell, the JS chunks, the bundled fonts and all the sprites (about 7 MB). The cache is named `homestead-<version>-<content hash>`, so each build gets a fresh cache and the old ones are deleted on activate.
- The page is served from the cache first, so it starts in airplane mode. Requests the precache missed are cached as they happen.
- The fonts come from `@fontsource/bungee` and `@fontsource/work-sans` (400/600/700), bundled by Vite. There are no Google Fonts requests.
- Everything is relative (`base: './'`), so the build runs from any sub-path. The native app loads its files locally and never registers the service worker.

## Notifications

What the game predicts comes from the sim: `upcomingReminders(state, content, …)` in `src/sim/systems/reminders.ts`. It is a pure forecast under the offline `catchUp` rules. The client turns that forecast into notifications in `src/client/platform/notifyPlan.ts` (pure, unit-tested) and schedules them in `notifications.ts`.

**When they're scheduled.** Whenever the game is suspended:

- the app is paused
- the tab is hidden
- `pagehide` fires

At that point the game saves, cancels the previous notifications and schedules the new plan. When the player comes back (the app resumes, or the tab becomes visible), all pending and delivered notifications are cleared.

**Ids** are an FNV-1a hash of the reminder's `key`. They are stable, so re-scheduling replaces rather than duplicates.

**Limits:**

- at most 20 at a time
- nothing under 60 s away
- nothing beyond the sim's 3-day horizon

**Groups.** Each group can be switched off in Settings:

| Group | Reminder kinds |
|---|---|
| Expeditions and caravans | explorers, caravans, quest parties |
| Production and storage | research, crafting, full storage, the Deep, outposts |
| Family | births, children growing up |
| Offers | contracts, the trade board, supply crates |

**Quiet hours** default to 22:00–08:00, in local time. Anything that would fire inside them is moved to the moment they end. If several would land on the same morning, they are folded into one "Morning report" notification.

**Permission.** The app never asks at launch. The first time an explorer or a caravan is sent, HALCY asks in a Homestead-styled dialog, and only a "Ping me" there triggers the OS prompt.

A "Not now" or an OS refusal turns notifications off quietly, and the player is never asked again. They can turn notifications back on in Settings, which re-asks the OS if it still can.

**Web fallback.** This is optional. The Notification API is used with timers, and only while the page is open but hidden. Browsers throttle background timers, so treat it as best effort.

## Storage safety

Saves live under `homestead.*` keys: the live autosave, slots 1–3, three founding backups, one step of undo, the settings, the notice log and the loadouts. On the web they go to `localStorage`, as before.

The phone OS can wipe a WebView's `localStorage`. So inside the app, `src/client/storage.ts` mirrors every write to `@capacitor/preferences`: SharedPreferences on Android, UserDefaults on iOS.

- **Boot.** `initStorage()` is awaited in `main.ts` before the game reads its save. It reads every `homestead.*` key from Preferences first and falls back to `localStorage` for any key Preferences lacks. Each side's missing keys are copied to the other, so both stores agree again after a wipe or on the first launch of a mirroring build.
- **Reads and writes.** Reads stay synchronous for callers: they come from the in-memory copy. Writes go through to both stores. Preferences writes are queued in order, and `flushStorage()` resolves when they have landed.
- **When the WebView quota is full.** A native write still succeeds, because Preferences has no small quota.
- **The back button** never exits the app. If no panel or modal handles it, the app saves and minimises instead (`App.minimizeApp`), so a save is never cut off.

### Save size and compression

These are measured sizes, in characters of JSON:

| Homestead | JSON | Stored |
|---|---|---|
| New homestead | 5.3k | 5.3k (plain) |
| Pop 100 | 57k | 7.7k compressed (×7.4) |
| Pop 200, a day on | 112k | 12.8k compressed (×8.8) |

Saves are compressed with `lz-string` (`compressToUTF16`). The stored value starts with the versioned prefix `LZ1:`. Anything without the prefix is read as plain JSON, so every old save still loads.

- **Slots, backups and undo** are compressed from 24k characters up.
- **The live autosave** (slot 0) is written every 20 s. It stays plain JSON until 250k characters, because LZ costs about 25 ms per 100k characters on a desktop.

Exported save files are always plain JSON. The Settings panel shows the live save's size and whether it is compressed.

## Settings

The Settings section is `settingsPanel(game)` in `src/client/ui/settings.ts`, and it lives in the ☰ menu. The values are stored as JSON under `homestead.settings` and mirrored like the saves:

```ts
{
  notifications: boolean,
  notify: { expeditions, production, family, offers },
  quietHours: { enabled, start, end },   // hours 0–23
  haptics: boolean,
  reducedMotion: boolean,                // read by the renderer and UI
  batterySaver: boolean,                 // caps the ticker at 30 fps (main.ts); the idle governor reads it too
  notifyAsked: boolean
}
```

`main.ts` also sets `data-reduced-motion` and `data-battery-saver` on `<html>` for CSS.

`haptic(kind)` uses `@capacitor/haptics` in the app and `navigator.vibrate` on the web. Both respect the Haptics setting.

Safe-area insets are exposed as `--safe-top`, `--safe-right`, `--safe-bottom` and `--safe-left` on `:root`. They resolve Capacitor's injected `--safe-area-inset-*` first and then `env(safe-area-inset-*)`. They are also available from `safeAreaInsets()` in `platform/index.ts`.
