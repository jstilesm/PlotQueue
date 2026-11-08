import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createStore, FOLDERS } from '../store.js';


// Test Print

const SQUARE = 'IN;SP1;PU0,0;PD1000,0,1000,1000,0,1000,0,0;PU;SP0;';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
test('withLock runs calls one at a time, in order', async (t) => {
    const order = [];
    const { store } = await freshStore(t);
    await Promise.all([store.withLock(async () => { await sleep(30); order.push(1); }),
    store.withLock(async () => { await sleep(20); order.push(2); }),
    store.withLock(async () => { await sleep(10); order.push(3); })])
    assert.deepEqual(order,[1,2, 3])

});
test('a failing call rejects for its caller but does not block the next', async (t) => {
    const { store } = await freshStore(t);
    const bad = store.withLock(async () => { throw new Error('boom')})
    const good = store.withLock(async () => { return 'ok'})
    await assert.rejects(bad, /boom/)
    assert.equal(await good, 'ok')
});
test('createPrint writes the three files and print.json', async (t) => {
    const { dir, store } = await freshStore(t);
    const print = await store.createPrint({ user: 'Dan', name: 'test.hpgl', sourceType: 'hpgl', source: SQUARE, hpgl: SQUARE });
    const folder = path.join(dir, 'users', 'Dan', 'prints', print.id);

    assert.equal(await readFile(path.join(folder, 'source.hpgl'), 'utf8'), SQUARE);
    assert.equal(await readFile(path.join(folder, 'plot.hpgl'), 'utf8'), SQUARE);
    const saved = JSON.parse(await readFile(path.join(folder, 'print.json'), 'utf8'));
    assert.deepEqual(saved, { name: 'test.hpgl', user: 'Dan', created: print.created, sourceType: 'hpgl' });
});
test('two uploads with the smae name get different ids', async (t) => {
    const { store } = await freshStore(t);
    const A = await store.createPrint({user: "Dan", name: "test.hpgl", sourceType: "hpgl", source: SQUARE, hpgl: SQUARE
    })
    const B = await store.createPrint({user: "Dan", name: "test.hpgl", sourceType: "hpgl", source: SQUARE, hpgl: SQUARE
    })
    assert.notEqual(A.id, B.id)
});
test('a bad user or sourceType throws 400', async (t) => {
    const { store } = await freshStore(t);
   await assert.rejects(store.createPrint({ user: '../evil', name: "test.hpgl"}), {status: 400})
   await assert.rejects(store.createPrint({user: "Dan", name: "test.hpgl", sourceType: "svg", source: SQUARE, hpgl: SQUARE
    }), {status: 400})
   await assert.rejects(store.createPrint({user: "Dan", name: "test.hpgl", sourceType: "hpgl", source: undefined, hpgl: SQUARE
    }), {status: 400})
   await assert.rejects(store.createPrint({user: "Dan", name: "test.hpgl", sourceType: "hpgl", source: SQUARE, hpgl: undefined
    }), {status: 400})
   await assert.rejects(store.createPrint({user: "Dan", name: "test.hpgl", sourceType: "hpgl", source: SQUARE, hpgl: ''
    }), {status: 400})
});


