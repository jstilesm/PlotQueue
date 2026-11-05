import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createStore, FOLDERS } from '../store.js';

async function freshStore(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'plotq-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = await createStore(dir);
  return { dir, store };
}

test('createStore makes every folder', async (t) => {
  const { dir } = await freshStore(t);
  for (const name of FOLDERS) {
    const info = await stat(path.join(dir, name));
    assert.ok(info.isDirectory(), `${name} should be a folder`);
  }
});
