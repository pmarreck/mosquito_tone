# Mosquito Tone

An installable, browser-local high-frequency tone generator. The requested
experience is an iPhone Home Screen button opening a simple on/off app, with
actual tone synthesis performed by WebAssembly. A thin Web Audio adapter
delivers its samples to the browser's audio output.

Default: 17.4 kHz sine, low digital signal level, continuous playback until stopped.
Frequency and level controls are reversible implementation choices. No audio
starts without an explicit tap; leaving the page stops playback. Digital level
does not establish acoustic sound pressure or safety at a given phone volume.

The output contract includes waveform frequency and amplitude analysis against
the original AudioCheck steady and modulated playback assets. Frequency spans
500 Hz–19 kHz for an audible speaker check, snapping to 17.4 kHz within two CSS
pixels while dragging. Signal level spans −60 to −3 dBFS, starting at −40 dBFS.
Optional sinusoidal warbling starts at the selected frequency, rising, and
sweeps from −400 to +2600 Hz relative to it at 3 Hz. Text cannot be selected.
Installed mode requests portrait orientation where supported; iPhone orientation
locking and physical output remain real-device qualification items.

The owner explicitly removed the initially proposed 30-second limit on
2026-11-17. There is no playback deadline while the app remains open.

The app makes no child-only audibility, clinical hearing-test or calibrated
loudness claims. Hearing and speaker frequency response vary. It has no stealth
mode, background playback, accounts, analytics or server-side audio processing.

Success requires tested WASM sample generation, explicit start/stop behavior,
offline asset caching, a responsive standalone manifest and installation help.
Physical iPhone audibility and Safari Home Screen behavior require a real-device
check and must not be claimed from desktop browser tests alone.
