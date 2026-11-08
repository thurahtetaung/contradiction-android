# Contradiction Android prototype

Android port adapter for a locally supplied PC copy of **Contradiction – Spot the Liar**. The app imports the original video into private storage, supports both landscape orientations, and adds direct touch menus, save confirmations, movement, inventory selection, and suspect replies.

The repository contains the Android wrapper, mobile adapters, build scripts, icon, and tests. Original game scripts, graphics, audio, subtitles, installers, and video are supplied locally and excluded from Git. APK outputs, local SDK paths, emulator images, and signing keys are also excluded.

## Build

Requires Node.js 22+, JDK 17+, Android SDK platform 36, and SDK build tools. The Gradle 8.14 wrapper is included.

1. Point `CONTRADICTION_GAME_DIR` at the PC game's `Windows` directory containing `index.html`, `game.js`, `gfx`, `sound`, and `sub.vtt`. The default is `../Windows`.
2. On Windows with Android Studio installed:

   ```powershell
   $env:CONTRADICTION_GAME_DIR = 'D:\path\to\game\Windows'
   .\build.ps1
   ```

   This prepares assets, builds and lints the release APK, and writes `dist/Contradiction-Android-prototype.apk`. Use `-Variant Debug` for WebView profiling.

3. On other systems, prepare assets with `node prepare.cjs`, configure the Android SDK location, and run `./gradlew assembleRelease lintRelease`.

Release builds are optimized and disable WebView debugging. This prototype uses the local Android debug signing identity for release builds so existing prototype installs can update without losing data. Keep that signing identity to maintain update compatibility; no signing key is committed.

## Install and import

See [INSTALL.txt](INSTALL.txt). Update the existing installation to retain imported media and save data. Select `MCMV.mp4` once and wait for **Import complete**; the Downloads copy can then be deleted. The supported original video is 2,374,166,828 bytes, 1280×720 H.264 at 24 fps with stereo AAC.

## Tests and measurements

```sh
npm ci
npx playwright-core install chromium
npm test
```

Set `CHROME_PATH` to use an existing Chrome executable. Touch regression tests exercise the actual game scripts and DOM through a local test-only HTTP server. Test saves exist in a temporary browser context and never affect phone saves.

`profile-phone.cjs VERSION OUTPUT.json` measures the active WebView for ten seconds through an ADB-forwarded debugging socket at port 9223. It requires a debug build. It does not navigate the game or modify saves. `check-device.cjs --smoke` changes game state and is intended for a test emulator only.

Measured reports are in [reports](reports). The original desktop animation loop continued requesting frames when the inventory was stationary. Version 0.7 stops that loop until inventory movement is needed, replaces touch-menu polling with invalidation from game functions and DOM changes, and bypasses the neutral `saturate(1) contrast(1)` filter. Non-neutral colour settings still apply. Story timers, video frames, audio samples, and animation interpolation remain unchanged.

Short samples measure work counters, not battery capacity or heat reduction. The S25+ was USB charging during testing, and both builds used the Qualcomm hardware AVC decoder. Desktop and phone task-time results are noisy; the reports do not establish a reduction in total CPU time or temperature.

## Video size

The original video is already compressed. A stream-copy MP4 remux preserved the compressed video/audio hashes but increased the file size, so the app retains the original. A substantial size reduction would require a quality trade-off; no lossy transcode is applied.
