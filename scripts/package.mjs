import { mkdir, readFile, writeFile, readdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
const [wasm, out] = process.argv.slice(2);
await mkdir(out, { recursive: true });
for (const name of await readdir('web')) if (name !== 'sw.js') await copyFile(`web/${name}`, `${out}/${name}`);
await copyFile(wasm, `${out}/tone.wasm`);
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let b = 0; b < 8; b++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function chunk(name, data) { const type = Buffer.from(name); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([type, data]))); return Buffer.concat([len, type, data, crc]); }
function icon(size) {
  const pixels = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const waveY = size * .5 + Math.sin((x / size) * Math.PI * 5) * size * .16;
    const bright = x > size * .17 && x < size * .83 && Math.abs(y - waveY) < size * .035;
    const i = y * (size * 4 + 1) + 1 + x * 4;
    pixels.set(bright ? [215, 255, 90, 255] : [17, 21, 24, 255], i);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
for (const size of [180, 192, 512]) await writeFile(`${out}/icon-${size}.png`, icon(size));
const hash = createHash('sha256');
for (const name of (await readdir(out)).sort()) { hash.update(name); hash.update(await readFile(`${out}/${name}`)); }
const sw = (await readFile('web/sw.js', 'utf8')).replace('__VERSION__', hash.digest('hex').slice(0, 20));
await writeFile(`${out}/sw.js`, sw);
