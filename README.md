# Contradiction — Cinematic Android edition

An Android adaptation of a locally supplied PC copy of **Contradiction – Spot the Liar**, preserving the original story engine, art and media with a rebuilt cinematic touch interface. The interface includes a fullscreen film view, original hand-drawn navigation arrows, evidence casebook, touch map, interview desk and cross-evidence comparison tray. The title and pause screens use the original branding and village art. Version 0.9 puts Casebook and Map beside the top controls and shows the original Search hotspot only when investigation is available; there is no bottom dock.

Fresh investigations and confirmed resets play the original prologue before entering the village. It advances automatically at the clip boundary, supports pause/background resume and provides an explicit Skip action. Watch prologue on the title screen replays it without changing story state. Playback reuses the original video/decoder while freezing story timers, and restores the previous video position and volume afterward.

Video, audio and story timers pause together while the title/pause menu is open. The old desktop tutorials, controller setup and keyboard strip are not used. Original framing is preserved by default; an optional Fill display setting crops to wide screens. Android handles immersive fullscreen, camera-cutout insets, Back navigation, storage and lifecycle. Save data and imported media remain compatible with previous prototype installs.

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

`profile-phone.cjs VERSION OUTPUT.json` measures the active WebView for ten seconds through an ADB-forwarded debugging socket at port 9223. It requires a debug build. It does not navigate the game or modify saves. `check-device.cjs` reports the current pane, timer state and media metadata without changing state. Its optional expression argument is intended for controlled test-device inspection.

The current integration suite covers three landscape layouts, fullscreen bounds, media and delayed-callback pause/resume, evidence selection, both save slots, cancellation, loading, original-map travel, Chief advice, witness questioning and an original valid cross-evidence deduction. Tests use temporary browser storage. Native fullscreen, cutout spacing, Back and bridge availability were checked on the S25+. A complete story playthrough remains untested.

Historical version 0.6/0.7 measurements are in [reports](reports). Version 0.8 keeps the neutral-filter optimization, removes the unused desktop inventory animation and uses event-driven interface invalidation. A resumable timer registry preserves remaining delays while paused and maintains interval cadence while playing. The original video and audio bytes are unchanged.

Short samples measure work counters, not battery capacity or heat reduction. The S25+ was USB charging during testing, and both builds used the Qualcomm hardware AVC decoder. Desktop and phone task-time results are noisy; the reports do not establish a reduction in total CPU time or temperature.

## Video size

The original video is already compressed. A stream-copy MP4 remux preserved the compressed video/audio hashes but increased the file size, so the app retains the original. This experiment found no useful lossless size reduction. A smaller modern-codec transcode cannot be promised to preserve every decoded pixel and audio sample; no lossy transcode is applied.
