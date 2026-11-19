export const DEFAULT_HZ = 17400;
export const DEFAULT_GAIN = 0.01;
export const MIN_HZ = 500, MAX_HZ = 19000;
export function dbToGain(db) {
  if (!Number.isFinite(db) || db < -60 || db > -3) throw new RangeError('Signal level must be between −60 and −3 dBFS.');
  return 10 ** (db / 20);
}
export function snapFrequency(hz, width) {
  // A two-CSS-pixel capture radius along the thumb's usable travel.
  const tolerance = (MAX_HZ - MIN_HZ) * 2 / Math.max(1, width - 20);
  return Math.abs(hz - DEFAULT_HZ) <= tolerance ? DEFAULT_HZ : hz;
}
export function settings(hz, gain, sampleRate = 48000, warble = false) {
  if (![hz, gain, sampleRate].every(Number.isFinite) || hz < MIN_HZ || hz > MAX_HZ || gain < .001 || gain > dbToGain(-3) || typeof warble !== 'boolean' || sampleRate < 32000 || sampleRate > 192000 || hz + (warble ? 2600 : 0) >= sampleRate / 2) throw new RangeError('The selected tone is not supported by this audio sample rate.');
  return { hz, gain, warble };
}
