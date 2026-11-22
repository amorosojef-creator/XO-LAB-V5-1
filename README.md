# XO LAB 5

Audio-reactive live visuals for DJs. Video, images and 3D models are driven by your music, with a blob-tracking HUD, GPU filters, liquid-chrome 3D, strobe and frame-perfect video export. Your files never leave your device.

**Runs on:** iPhone · Windows 10/11 (x64 + ARM64) · macOS 12 Monterey or newer (Intel + Apple Silicon) · any current browser.

- **Install it:** [INSTALL.md](INSTALL.md). GitHub builds the `.ipa`, `.exe`, `.dmg` and `.pkg` for you.
- **What's new:** [CHANGELOG.md](CHANGELOG.md)
- **Device checklist:** [TESTING.md](TESTING.md)

## Supported systems (exact)

| Platform | Minimum | Notes |
| --- | --- | --- |
| Windows | Windows 10, 64-bit | x64 and ARM64 builds. 32-bit Windows isn't supported. |
| macOS | macOS 12 Monterey | One Universal app for Intel and Apple Silicon. Electron 44+ needs macOS 13, so XO LAB uses Electron 43 to keep Monterey Macs (e.g. 2015 MacBook Pro) working. |
| iPhone / iPad | iOS 16.4 for video export | Sideloaded `.ipa`. MP4 export on iOS 26+, MOV on 16.4–18. |
| Browser | Current Chrome, Edge, Safari, Firefox | Video export needs WebCodecs (Chrome, Edge, Safari 16.4+). |

## For developers

- Web app: no build step. `index.html` + `js/` + `css/` + `vendor/` run as-is. `npm start` serves it locally.
- `npm run build` copies the web app to `www/` (used by the iPhone and desktop apps).
- `npm run desktop` runs the Windows/Mac app from source (Electron 43).
- `npm run dist:win` / `npm run dist:mac` build installers locally (CI does this for you).
- `npm test` is a headless-Chrome smoke test including a real render. `npm run test:desktop` runs the same kind of test inside the desktop app (use `xvfb-run` on Linux).
- `electron/main.js` is the desktop wrapper. It serves `www/` from a private `app://` address with no Node access in the page; `electron/preload.js` is the only bridge.

Third-party code: three.js (MIT, `vendor/three`), Mediabunny (MPL-2.0, `vendor/mediabunny`), Electron (MIT).
