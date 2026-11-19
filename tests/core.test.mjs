import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const bytes = await readFile(`${process.env.TONE_SITE}/tone.wasm`);
async function engine() { const { instance } = await WebAssembly.instantiate(bytes, {}); return instance.exports; }
function block(e, hz, rate, n, enabled = 1) { assert.equal(e.render(hz, rate, n, enabled, 0), n); return new Float32Array(e.memory.buffer, e.samples_ptr(), n).slice(); }
function collect(e, hz, rate, n, enabled = 1, chunk = 128) { const all = []; for (let i = 0; i < n; i += chunk) all.push(...block(e, hz, rate, Math.min(chunk, n - i), enabled)); return all; }
test('real WASM exports bounded, deterministic sample storage', async () => {
  const e = await engine(); assert.equal(e.samples_capacity(), 2048); e.reset();
  const a = collect(e, 17400, 48000, 2000); e.reset(); assert.deepEqual(collect(e, 17400, 48000, 2000), a);
  assert.ok(a.every(Number.isFinite)); assert.ok(a.every(x => Math.abs(x) <= 1));
});
test('sample values match an independent sine oracle at both common audio rates', async () => {
  for (const rate of [44100, 48000]) {
    const e = await engine(); e.reset(); const out = collect(e, 17400, rate, rate / 10);
    for (let i = 0; i < out.length; i++) {
      const amplitude = Math.min(1, (i + 1) / (rate * .02));
      const expected = Math.sin(2 * Math.PI * 17400 * i / rate) * amplitude;
      assert.ok(Math.abs(out[i] - expected) < 1e-6, `${rate} Hz sample ${i}`);
    }
  }
});
test('phase and ramps are continuous across arbitrary audio buffer boundaries', async () => {
  const e = await engine(); e.reset(); const a = collect(e, 17400, 48000, 4096, 1, 128);
  e.reset(); assert.deepEqual(collect(e, 17400, 48000, 4096, 1, 37), a);
});
test('frequency energy peaks at the requested tone rather than nearby aliases', async () => {
  const e = await engine(); e.reset(); collect(e, 17400, 48000, 4800);
  const out = collect(e, 17400, 48000, 4800);
  function energy(hz) { let re = 0, im = 0; for (let i = 0; i < out.length; i++) { const p = 2 * Math.PI * hz * i / 48000; re += out[i] * Math.cos(p); im += out[i] * Math.sin(p); } return re * re + im * im; }
  assert.ok(energy(17400) > 5_000_000);
  for (const other of [1000, 17300, 17500, 19000]) assert.ok(energy(17400) > energy(other) * 1e6);
});
test('disable fades to exact silence and rejects malformed and aliasing parameters', async () => {
  const e = await engine(); e.reset(); collect(e, 17400, 48000, 2000);
  const faded = collect(e, 17400, 48000, 2000, 0); assert.ok(faded.slice(1000).every(x => x === 0));
  for (const [hz,rate,n,on,warble=0] of [[NaN,48000,128,1],[Infinity,48000,128,1],[17400,NaN,128,1],[17400,32000,128,1],[499,48000,128,1],[19001,48000,128,1],[17400,48000,0,1],[17400,48000,2049,1],[17400,48000,128,2],[14000,32000,128,1,1],[17400,48000,128,1,2]]) assert.equal(e.render(hz,rate,n,on,warble), -1);
});
test('invalid calls do not advance the oscillator state', async () => {
  const e = await engine(); e.reset(); const expected = block(e,17400,48000,128);
  e.reset(); assert.equal(e.render(0,48000,128,1,0), -1); assert.deepEqual(block(e,17400,48000,128), expected);
});
test('warble starts at the selected frequency and invalid calls preserve sweep phase', async () => {
  for(const hz of [500,17400,19000]) {
    const e=await engine();e.reset();
    assert.equal(e.render(hz,48000,128,1,1),128);
    const first=new Float32Array(e.memory.buffer,e.samples_ptr(),128).slice();
    const expected=Math.sin(2*Math.PI*hz/48000)*2/(48000*.02);
    assert.ok(Math.abs(first[1]-expected)<1e-7);
    e.reset();assert.equal(e.render(hz,48000,128,1,2),-1);
    assert.equal(e.render(hz,48000,128,1,1),128);
    assert.deepEqual(new Float32Array(e.memory.buffer,e.samples_ptr(),128),first);
  }
});
