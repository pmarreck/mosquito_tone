import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('packaged manifest and Home Screen icons exist with correct image dimensions', async () => {
  const root = process.env.TONE_SITE;
  const m = JSON.parse(await readFile(`${root}/manifest.webmanifest`, 'utf8'));
  assert.equal(m.display,'standalone'); assert.equal(m.start_url,'./'); assert.equal(m.scope,'./');
  for (const size of [180,192,512]) { const b=await readFile(`${root}/icon-${size}.png`); assert.equal(b.subarray(1,4).toString(),'PNG'); assert.equal(b.readUInt32BE(16),size); assert.equal(b.readUInt32BE(20),size); }
  const sw=await readFile(`${root}/sw.js`,'utf8'); assert.ok(!sw.includes('__VERSION__'));
  assert.match(sw,/mosquito-tone-[a-f0-9]{20}/);
});
