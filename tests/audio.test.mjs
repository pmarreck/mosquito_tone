import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertTone } from './audio-analysis.mjs';

async function fixture(kind) {
  const data = await readFile(`${process.env.TONE_FIXTURES}/${kind}.f32`);
  return new Float32Array(data.buffer, data.byteOffset, data.length / 4).slice();
}
async function render(hz, rate, warble, gain = 10 ** (-3 / 20), chunk = 128) {
  const { instance: { exports: e } } = await WebAssembly.instantiate(await readFile(`${process.env.TONE_SITE}/tone.wasm`), {});
  e.reset();
  const pcm = new Float32Array(rate * 2);
  for (let offset = 0; offset < pcm.length; offset += chunk) {
    const n = Math.min(chunk, pcm.length - offset);
    assert.equal(e.render(hz, rate, n, 1, Number(warble)), n);
    pcm.set(new Float32Array(e.memory.buffer, e.samples_ptr(), n), offset);
  }
  return pcm.map(x => x * gain);
}
for (const warble of [false, true]) {
  test(`AudioCheck ${warble ? 'modulated' : 'steady'} fixture passes shared frequency AND amplitude analysis`, async t => {
    const result = assertTone(await fixture(warble ? 'warble' : 'steady'), 44100, { hz: 17400, dbFS: -3, warble });
    t.diagnostic(JSON.stringify(result));
  });
  test(`actual WASM ${warble ? 'warble' : 'steady sine'} passes the SAME fixture analyzer`, async t => {
    for (const rate of [44100, 48000]) for (const hz of [500, 1000, 17400, 19000]) {
      const pcm = await render(hz, rate, warble);
      t.diagnostic(JSON.stringify({ rate, selectedHz: hz, ...assertTone(pcm, rate, { hz, dbFS: -3, warble }) }));
    }
  });
}
test('waveform analysis rejects silence, wrong frequency, wrong amplitude, and distortion', async () => {
  const pcm = await fixture('steady'), contract = { hz: 17400, dbFS: -3 };
  assert.throws(() => assertTone(pcm.map(() => 0), 44100, contract));
  assert.throws(() => assertTone(pcm, 48000, contract), /frequency/);
  assert.throws(() => assertTone(pcm.map(x => x * .01), 44100, contract), /amplitude/);
  // A two-tone signal with the same RMS must fail the purity check.
  const twoTone = pcm.map((x, i) => (x + .708 * Math.sin(2 * Math.PI * 1000 * i / 44100)) / Math.SQRT2 * .99);
  assert.throws(() => assertTone(twoTone, 44100, contract), /purity/);
});
test('warble analysis rejects steady, wrong sweep span, wrong amplitude and wrong cadence', async () => {
  const contract = { hz: 17400, dbFS: -3, warble: true };
  const steady = await fixture('steady'), warble = await fixture('warble');
  assert.throws(() => assertTone(steady, 44100, contract), /warble/);
  assert.throws(() => assertTone(warble.map(x => x * .1), 44100, contract), /amplitude/);
  for (const [cadence, depth] of [[2, 1500], [3, 1000]]) {
    let phase = 0;
    const wrong = Float32Array.from({ length: 88200 }, (_, i) => {
      const x = .708 * Math.sin(phase);
      phase += 2 * Math.PI * (18500 + depth * Math.sin(2 * Math.PI * cadence * i / 44100)) / 44100;
      return x;
    });
    assert.throws(() => assertTone(wrong, 44100, contract), /warble/);
  }
});
test('warble remains phase-continuous across arbitrary render blocks', async () => {
  assert.deepEqual(await render(17400, 48000, true, 1, 37), await render(17400, 48000, true, 1, 128));
});
