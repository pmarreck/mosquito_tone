export const DEFAULT_HZ = 17400;
export const DEFAULT_GAIN = 0.01;
export const LIMIT_MS = 30000;
export function settings(hz, gain, sampleRate = 48000) {
  if (![hz, gain, sampleRate].every(Number.isFinite) || hz < 14000 || hz > 19000 || gain < 0.001 || gain > 0.05 || sampleRate < 32000 || sampleRate > 192000 || hz >= sampleRate / 2) throw new RangeError('The selected tone is not supported by this audio sample rate.');
  return { hz, gain };
}
export function remainingMs(started, now) { return Math.max(0, LIMIT_MS - Math.max(0, now - started)); }
