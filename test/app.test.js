import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';

let server, base;

before(async () => {
  server = createApp();
  await new Promise(resolve => server.listen(0, resolve)); // port 0 = any free port
  base = `http://localhost:${server.address().port}`;
});

after(() => server.close());

test('GET /health returns ok with CORS header', async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(await r.json(), { ok: true });
});

test('serves a file from public/ with its content type', async () => {
  const r = await fetch(`${base}/hello.html`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^text\/html/);
});

test('missing file is a JSON 404, still with CORS', async () => {
  const r = await fetch(`${base}/nope.html`);
  assert.equal(r.status, 404);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(await r.json(), { error: 'not found' });
});

test('encoded ../ cannot escape public/', async () => {
  const r = await fetch(`${base}/..%2fpackage.json`);
  assert.equal(r.status, 403);
});
