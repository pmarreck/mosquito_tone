import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('cached redirected HTML becomes a fresh navigation response for Safari', async () => {
  const handlers = {};
  const cached = new Response('<h1>offline app</h1>', { headers: { 'Content-Type': 'text/html', 'X-Test': 'preserved' } });
  // Cache API responses retain fetch redirect metadata. Safari rejects this
  // metadata on a navigation response, even after the redirect has completed.
  Object.defineProperty(cached, 'redirected', { value: true });
  runInNewContext(await readFile('web/sw.js', 'utf8'), {
    self: { location: new URL('https://example.test/sw.js'), addEventListener: (name, fn) => { handlers[name] = fn; } },
    caches: { match: async () => cached }, URL, Response,
    fetch: () => { throw new Error('Offline cache hit must not fetch'); },
  });
  let response;
  handlers.fetch({ request: { method: 'GET', url: 'https://example.test/', mode: 'navigate' }, respondWith: p => { response = p; } });
  const result = await response;
  assert.equal(result.redirected, false);
  assert.equal(result.headers.get('X-Test'), 'preserved');
  assert.equal(await result.text(), '<h1>offline app</h1>');
});

test('host authentication navigation is not replaced by the offline app', async () => {
  const handlers = {};
  runInNewContext(await readFile('web/sw.js', 'utf8'), {
    self: { location: new URL('https://example.test/sw.js'), addEventListener: (name, fn) => { handlers[name] = fn; } },
    URL, Response,
  });
  handlers.fetch({ request: { method: 'GET', url: 'https://example.test/_auth/login', mode: 'navigate' }, respondWith: () => { assert.fail('Host navigation must bypass the app cache'); } });
});
