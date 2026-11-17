import { DEFAULT_HZ, DEFAULT_GAIN, LIMIT_MS, settings, remainingMs } from './model.mjs';
const $ = id => document.getElementById(id);
let context, node, gainNode, wasm, initializing, active = false, generation = 0, stopTimer, ticker, suspendTimer;
let hz = DEFAULT_HZ, gain = DEFAULT_GAIN, startedAt = 0;
function paint(message) {
  $('power').setAttribute('aria-pressed', String(active));
  $('power').setAttribute('aria-label', active ? 'Stop tone' : 'Start tone');
  $('power-label').textContent = active ? 'STOP' : 'START';
  $('status').textContent = message || (active ? 'Tone is playing' : 'Sound is off');
  $('timer').textContent = active ? `${Math.ceil(remainingMs(startedAt, performance.now()) / 1000)} seconds remaining` : 'Tap to start · stops after 30 seconds';
}
function fail(error) { stop(); document.body.dataset.state = 'error'; paint(error.message || String(error)); }
function stop(immediate = false) {
  generation++; active = false;
  clearTimeout(stopTimer); clearTimeout(suspendTimer); clearInterval(ticker);
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
      node.port.postMessage({ wasm });
    });
    node.connect(gainNode);
  })();
  await Promise.all([resume, initializing]);
}
$('power').addEventListener('click', async () => {
  if (active || $('power').dataset.starting === 'true') { stop(); $('power').dataset.starting = 'false'; return; }
  const request = ++generation;
  clearTimeout(suspendTimer); $('power').dataset.starting = 'true'; $('status').textContent = 'Starting…';
  try {
    await prepare();
    if (request !== generation || document.hidden) return;
    settings(hz, gain, context.sampleRate);
    node.port.postMessage({ hz, enabled: true });
    gainNode.gain.setValueAtTime(gain, context.currentTime);
    active = true; startedAt = performance.now(); document.body.dataset.state = 'playing'; paint();
    stopTimer = setTimeout(stop, LIMIT_MS);
    ticker = setInterval(() => { if (remainingMs(startedAt, performance.now()) === 0) stop(); else paint(); }, 200);
  } catch (error) { fail(error); }
  finally { $('power').dataset.starting = 'false'; }
});
$('frequency').addEventListener('input', event => {
  try { const value = Number(event.target.value); settings(value, gain, context?.sampleRate || 48000); hz = value; $('frequency-value').innerHTML = `${(hz / 1000).toFixed(1)} <small>kHz</small>`; node?.port.postMessage({ hz }); }
  catch (error) { fail(error); }
});
$('level').addEventListener('input', event => {
  try { const value = Number(event.target.value) / 1000; settings(hz, value, context?.sampleRate || 48000); gain = value; $('level-value').textContent = gain <= .01 ? 'Low' : gain <= .025 ? 'Medium' : 'Stronger'; if (active) gainNode.gain.setTargetAtTime(gain, context.currentTime, .02); }
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
