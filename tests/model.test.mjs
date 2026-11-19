import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_HZ, DEFAULT_GAIN, settings, dbToGain, snapFrequency } from '../web/model.mjs';
test('initial frequency and signal level are explicit', () => { assert.equal(DEFAULT_HZ,17400); assert.equal(DEFAULT_GAIN,.01); });
test('settings validate every numeric boundary', () => {
  for (const hz of [500,1000,17400,19000]) for (const gain of [.001,.01,10 ** (-3/20)]) for (const warble of [false,true]) assert.deepEqual(settings(hz,gain,48000,warble),{hz,gain,warble});
  for (const args of [[NaN,.01],[17400,NaN],[499,.01],[19001,.01],[17400,0],[17400,.71],[17400,.01,32000],[17400,.01,Infinity],[14000,.01,32000,true],[1000,.01,48000,2]]) assert.throws(() => settings(...args), RangeError);
});
test('17.4 kHz snap radius follows pixel width rather than a fixed frequency band', () => {
  for(const width of [240,334,600,1000]) {
    const hzPerPixel=18500/(width-20);
    for(const sign of [-1,1]) {
      assert.equal(snapFrequency(17400+sign*1.9*hzPerPixel,width),17400);
      const outside=17400+sign*2.1*hzPerPixel;
      assert.equal(snapFrequency(outside,width),outside);
    }
  }
});
test('signal control can reach the reference level without changing the quiet default', () => {
  assert.equal(dbToGain(-40),DEFAULT_GAIN);
  assert.equal(dbToGain(-3),10 ** (-3/20));
  assert.equal(dbToGain(-60),.001);
  for (const db of [-61,-2,NaN,Infinity]) assert.throws(()=>dbToGain(db),RangeError);
  assert.doesNotThrow(()=>settings(19000,dbToGain(-3),44100,true));
});
