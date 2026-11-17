import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
export function serve(root, port = 0, host = '127.0.0.1') {
  const base = resolve(root);
  const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
  const server = http.createServer(async (req, res) => {
    try {
      const name = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      const file = resolve(base, '.' + (name.endsWith('/') ? name + 'index.html' : name));
      if (!file.startsWith(base + sep)) { res.writeHead(403).end(); return; }
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(data);
    } catch { res.writeHead(404).end('Not found'); }
  });
  return new Promise(ok => server.listen(port, host, () => ok(server)));
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const port = Number(process.argv[3] || 8421);
  const server = await serve(process.argv[2], port);
  console.log(`Mosquito Tone: http://127.0.0.1:${server.address().port}/`);
}
