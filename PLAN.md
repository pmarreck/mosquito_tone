# PLAN

## Current scope

- [x] Validate WASM and browser output with shared frequency/amplitude analysis and pinned AudioCheck steady/warbling fixtures; all 29 tests pass (done 2026-11-18 22:38 EST; commit f418f3d).
- [x] Extend frequency to 500 Hz, expose reference signal level, and add 3 Hz warbling from selected frequency −400 Hz to +2600 Hz (done 2026-11-18 22:38 EST; commit f418f3d).
- [x] Add a two-pixel 17.4 kHz snap, disable text selection, and request portrait orientation in installed mode; iPhone API support remains limited (done 2026-11-18 22:38 EST; commit f418f3d).
- [x] Run all checks, push, and verify GitHub Pages deployment; run 44452906353 passed and all 11 live assets match the tested build byte for byte (done 2026-11-18 22:41 EST; commit f418f3d).
- [x] Build and independently test the WASM oscillator and browser audio adapter; actual sample, frequency-energy, buffer-continuity and invalid-input checks pass (done 2026-11-17 14:57 EST).
- [x] Verify on/off, timeout, pagehide-stop and offline app behavior through the complete test entry point; 14 checks pass, with muted Chromium browser tests (done 2026-11-17 14:57 EST).
- [x] Deploy the private HTTPS app and provide iPhone Home Screen installation instructions; hosting reports successful publication of the verified source and static artifact (done 2026-11-17 15:02 EST).
- [x] Confirm practical playback after deployment; the owner reports the app works, without specifying device, frequency or installation mode (done 2026-11-18 22:59 EST; deployed commit 90e8a3e).
- [ ] Qualify iPhone-specific 500 Hz speaker output, Safari, Home Screen operation and orientation; general app success is confirmed, but these details require device-specific observation.
