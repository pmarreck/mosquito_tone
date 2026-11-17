# Mosquito Tone

An installable, browser-local high-frequency tone generator. The requested
experience is an iPhone Home Screen button opening a simple on/off app, with
actual tone synthesis performed by WebAssembly. A thin Web Audio adapter
delivers its samples to the browser's audio output.

Default: 17.4 kHz sine, low digital signal level, 30-second maximum playback.
Frequency and level controls are reversible implementation choices. No audio
starts without an explicit tap; leaving the page stops playback. Digital level
does not establish acoustic sound pressure or safety at a given phone volume.

The app makes no child-only audibility, clinical hearing-test or calibrated
loudness claims. Hearing and speaker frequency response vary. It has no stealth
mode, background playback, accounts, analytics or server-side audio processing.

Success requires tested WASM sample generation, explicit start/stop behavior,
offline asset caching, a responsive standalone manifest and installation help.
Physical iPhone audibility and Safari Home Screen behavior require a real-device
check and must not be claimed from desktop browser tests alone.
