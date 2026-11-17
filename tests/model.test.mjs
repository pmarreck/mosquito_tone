import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_HZ, DEFAULT_GAIN, settings } from '../web/model.mjs';
test('initial frequency and signal level are explicit', () => { assert.equal(DEFAULT_HZ,17400); assert.equal(DEFAULT_GAIN,.01); });
test('settings validate every numeric boundary', () => {
  for (const hz of [14000,17400,19000]) for (const gain of [.001,.01,.05]) assert.deepEqual(settings(hz,gain),{hz,gain});
  for (const args of [[NaN,.01],[17400,NaN],[13999,.01],[19001,.01],[17400,0],[17400,.051],[17400,.01,32000],[17400,.01,Infinity]]) assert.throws(() => settings(...args), RangeError);
});
