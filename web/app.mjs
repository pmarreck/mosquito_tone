import { DEFAULT_HZ, DEFAULT_GAIN, settings, dbToGain, snapFrequency } from './model.mjs';
const $ = id => document.getElementById(id);
let context, node, gainNode, wasm, initializing, active = false, generation = 0, suspendTimer;
let hz = DEFAULT_HZ, gain = DEFAULT_GAIN, warble = false, draggingFrequency = false;
function paintFrequency() {
  $('frequency-value').innerHTML = `${(hz / 1000).toFixed(1)} <small>kHz</small>`;
  $('frequency').setAttribute('aria-valuetext', `${hz} Hz`);
  $('warble-range').textContent = warble ? `${((hz - 400) / 1000).toFixed(1)}–${((hz + 2600) / 1000).toFixed(1)} kHz · 3 sweeps/sec` : 'Selected frequency −0.4 to +2.6 kHz · 3 sweeps/sec';
}
function requestPortrait() {
  if (navigator.standalone || matchMedia('(display-mode: standalone)').matches) {
    try { screen.orientation?.lock?.('portrait-primary').catch(() => {}); } catch {}
  }
}
requestPortrait();
function paint(message) {
  $('power').setAttribute('aria-pressed', String(active));
  $('power').setAttribute('aria-label', active ? 'Stop tone' : 'Start tone');
  $('power-label').textContent = active ? 'STOP' : 'START';
  $('status').textContent = message || (active ? 'Tone is playing' : 'Sound is off');
  $('timer').textContent = active ? 'Playing continuously · tap to stop' : 'Tap to start · no time limit';
}
function fail(error) { stop(); document.body.dataset.state = 'error'; paint(error.message || String(error)); }
function stop(immediate = false) {
  generation++; active = false;
  clearTimeout(suspendTimer);
  node?.port.postMessage({ enabled: false });
  if (gainNode && context) {
    const now = context.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    if (immediate) gainNode.gain.setValueAtTime(0, now);
    else { gainNode.gain.setValueAtTime(gainNode.gain.value, now); gainNode.gain.linearRampToValueAtTime(0, now + .02); }
  }
  if (context) suspendTimer = setTimeout(() => { if (!active) context.suspend().catch(() => {}); }, 30);
  paint();
}
async function prepare() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) throw new Error('This browser does not support Web Audio. Open the app in Safari.');
  if (!context || context.state === 'closed') {
    context = new Audio();
    gainNode = context.createGain(); gainNode.gain.value = 0; gainNode.connect(context.destination);
    context.addEventListener('statechange', () => { if (active && context.state !== 'running') stop(); });
  }
  // Resume is called directly from the button gesture, before awaiting I/O.
  const resume = context.resume();
  if (!initializing) initializing = (async () => {
    if (!context.audioWorklet) throw new Error('AudioWorklet needs a supported browser and an HTTPS connection.');
    await context.audioWorklet.addModule('./tone-worklet.mjs');
    node = new AudioWorkletNode(context, 'wasm-tone', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
    await new Promise((ok, reject) => {
      const timeout = setTimeout(() => reject(new Error('The audio engine took too long to initialize. Reload and try again.')), 8000);
      node.port.onmessage = ({ data }) => {
        if (data.ready) { clearTimeout(timeout); ok(); }
        if (data.error) { clearTimeout(timeout); reject(new Error(data.error)); fail(new Error(data.error)); }
      };
      node.addEventListener('processorerror', () => fail(new Error('The audio processor stopped unexpectedly.')));
      node.port.postMessage({ wasm, hz, warble });
    });
    node.connect(gainNode);
  })();
  await Promise.all([resume, initializing]);
}
$('power').addEventListener('click', async () => {
  requestPortrait();
  if (active || $('power').dataset.starting === 'true') { stop(); $('power').dataset.starting = 'false'; return; }
  const request = ++generation;
  clearTimeout(suspendTimer); $('power').dataset.starting = 'true'; $('status').textContent = 'Starting…';
  try {
    await prepare();
    if (request !== generation || document.hidden) return;
    settings(hz, gain, context.sampleRate, warble);
    node.port.postMessage({ hz, warble, enabled: true });
    gainNode.gain.setValueAtTime(gain, context.currentTime);
    active = true; document.body.dataset.state = 'playing'; paint();
  } catch (error) { fail(error); }
  finally { $('power').dataset.starting = 'false'; }
});
$('frequency').addEventListener('pointerdown', () => { draggingFrequency = true; });
for (const event of ['pointerup', 'pointercancel']) window.addEventListener(event, () => { draggingFrequency = false; });
$('frequency').addEventListener('input', event => {
  try {
    const raw = Number(event.target.value), value = draggingFrequency ? snapFrequency(raw, event.target.getBoundingClientRect().width) : raw;
    settings(value, gain, context?.sampleRate || 48000, warble); hz = value; event.target.value = hz;
    paintFrequency(); node?.port.postMessage({ hz });
  }
  catch (error) { fail(error); }
});
$('warble').addEventListener('change', event => {
  try { const value = event.target.checked; settings(hz, gain, context?.sampleRate || 48000, value); warble = value; paintFrequency(); node?.port.postMessage({ warble }); }
  catch (error) { event.target.checked = warble; fail(error); }
});
$('level').addEventListener('input', event => {
  try { const db = Number(event.target.value), value = dbToGain(db); settings(hz, value, context?.sampleRate || 48000, warble); gain = value; $('level-value').textContent = `${db} dBFS`; if (active) gainNode.gain.setTargetAtTime(gain, context.currentTime, .02); }
  catch (error) { fail(error); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { stop(true); $('power').dataset.starting = 'false'; } });
window.addEventListener('pagehide', () => stop(true));
let installPrompt;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
$('install').addEventListener('click', async () => { if (installPrompt) { await installPrompt.prompt(); installPrompt = null; } else $('install-dialog').showModal(); });
$('close-install').addEventListener('click', () => $('install-dialog').close());
try {
  const response = await fetch('./tone.wasm');
  if (!response.ok) throw new Error(`The audio engine could not load (${response.status}).`);
  wasm = await response.arrayBuffer();
  if (!WebAssembly.validate(wasm)) throw new Error('The audio engine is not a valid WebAssembly module.');
  $('power').disabled = false; paint(); document.documentElement.dataset.ready = '1';
} catch (error) { fail(error); $('power').disabled = true; document.documentElement.dataset.ready = 'error'; }
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(() => { $('offline').textContent = 'Saved for offline use'; }).catch(() => { $('offline').textContent = 'Offline cache unavailable'; });
} else $('offline').textContent = 'Offline mode unavailable in this browser';
