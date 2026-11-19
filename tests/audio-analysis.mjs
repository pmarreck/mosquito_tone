// Test-only signal analysis. No oscillator/model code is imported here.
import assert from 'node:assert/strict';

function spectrum(samples, start, size) {
  const re = new Float64Array(size), im = new Float64Array(size);
  for (let i = 0; i < size; i++) re[i] = samples[start + i] * (.5 - .5 * Math.cos(2 * Math.PI * i / (size - 1)));
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j]] = [re[j], re[i]];
  }
  for (let width = 2; width <= size; width *= 2) {
    for (let base = 0; base < size; base += width) for (let j = 0; j < width / 2; j++) {
      const angle = -2 * Math.PI * j / width, k = base + j, l = k + width / 2;
      const r = re[l] * Math.cos(angle) - im[l] * Math.sin(angle);
      const m = re[l] * Math.sin(angle) + im[l] * Math.cos(angle);
      re[l] = re[k] - r; im[l] = im[k] - m; re[k] += r; im[k] += m;
    }
  }
  return Float64Array.from({ length: size / 2 }, (_, i) => re[i] ** 2 + im[i] ** 2);
}

function peakFrequency(power, rate) {
  let bin = 1;
  for (let i = 2; i < power.length - 1; i++) if (power[i] > power[bin]) bin = i;
  const a = Math.log(power[bin - 1]), b = Math.log(power[bin]), c = Math.log(power[bin + 1]);
  const offset = .5 * (a - c) / (a - 2 * b + c);
  return { hz: (bin + (Number.isFinite(offset) ? offset : 0)) * rate / (power.length * 2), bin };
}

export function analyze(samples, rate, warble = false) {
  assert.ok(samples.length >= rate, 'At least one second of PCM is required');
  assert.ok(samples.every(Number.isFinite), 'PCM must be finite');
  // Discard start/stop fades and codec edge transients, using the middle second.
  const start = Math.floor((samples.length - rate) / 2);
  const pcm = samples.slice(start, start + rate);
  const rms = Math.sqrt(pcm.reduce((sum, x) => sum + x * x, 0) / pcm.length);
  const peak = pcm.reduce((max, x) => Math.max(max, Math.abs(x)), 0);
  const dc = pcm.reduce((sum, x) => sum + x, 0) / pcm.length;
  // Sine amplitude in dBFS, with full-scale sine RMS = 1/sqrt(2).
  const dbFS = 20 * Math.log10(rms * Math.SQRT2);
  if (!warble) {
    const size = 2 ** Math.floor(Math.log2(pcm.length));
    const power = spectrum(pcm, 0, size), { hz, bin } = peakFrequency(power, rate);
    const total = power.reduce((s, p) => s + p, 0);
    const fundamental = power.slice(Math.max(0, bin - 3), bin + 4).reduce((s, p) => s + p, 0);
    return { hz, rms, peak, dc, dbFS, purity: fundamental / total };
  }
  // Short-time FFT tracks instantaneous frequency without using the generator's
  // phase equation. Fit the observed ridge to discover the modulation rate.
  const points = [], size = 1024, hop = 256;
  for (let i = 0; i + size <= pcm.length; i += hop) {
    points.push({ t: (i + (size - 1) / 2) / rate, hz: peakFrequency(spectrum(pcm, i, size), rate).hz });
  }
  // Capture contains an integer number of 3 Hz cycles. Search nearby rates;
  // least-squares fit includes a free offset and phase for arbitrary capture time.
  let best;
  for (let step = 200; step <= 400; step++) {
    const cadence = step / 100;
    const rows = points.map(p => [1, Math.sin(2 * Math.PI * cadence * p.t), Math.cos(2 * Math.PI * cadence * p.t)]);
    const m = Array.from({ length: 3 }, (_, i) => [
      ...Array.from({ length: 3 }, (_, j) => rows.reduce((s, r) => s + r[i] * r[j], 0)),
      rows.reduce((s, r, k) => s + r[i] * points[k].hz, 0),
    ]);
    for (let i = 0; i < 3; i++) {
      const divisor = m[i][i];
      for (let j = i; j < 4; j++) m[i][j] /= divisor;
      for (let k = 0; k < 3; k++) if (k !== i) {
        const factor = m[k][i];
        for (let j = i; j < 4; j++) m[k][j] -= factor * m[i][j];
      }
    }
    const coefficients = m.map(r => r[3]);
    const error = Math.sqrt(rows.reduce((s, r, k) => s + (r.reduce((v, x, j) => v + x * coefficients[j], 0) - points[k].hz) ** 2, 0) / rows.length);
    if (!best || error < best.error) {
      const [center, a, b] = coefficients, depth = Math.hypot(a, b);
      best = { cadence, low: center - depth, high: center + depth, error };
    }
  }
  return { ...best, rms, peak, dc, dbFS };
}

export function assertTone(samples, rate, expected) {
  const found = analyze(samples, rate, !!expected.warble);
  const near = (actual, value, tolerance, name) => assert.ok(Math.abs(actual - value) <= tolerance, `${name}: measured ${actual}, expected ${value} ± ${tolerance}`);
  near(found.dbFS, expected.dbFS, expected.levelTolerance ?? .3, 'sine amplitude (dBFS)');
  assert.ok(found.peak <= 1, 'PCM must not clip');
  assert.ok(Math.abs(found.dc) < found.rms * .01, 'DC offset must be below 1% of RMS');
  if (expected.warble) {
    near(found.low, expected.hz - 400, 80, 'warble low (Hz)');
    near(found.high, expected.hz + 2600, 80, 'warble high (Hz)');
    near(found.cadence, 3, .03, 'warble cadence (Hz)');
    assert.ok(found.error < 40, `warble ridge fit error: ${found.error} Hz`);
  } else {
    near(found.hz, expected.hz, 3, 'frequency (Hz)');
    assert.ok(found.purity > .99, `fundamental spectral purity: ${found.purity}`);
  }
  return found;
}
