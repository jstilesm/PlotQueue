import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export const FOLDERS = ['users', 'queue/control', 'queue/tmp', 'queue/pending', 'queue/active', 'queue/done', 'queue/failed', 'queue/cancelled'];

// HELPERS

// takes name and generates a safe filename for prints
function slugify(name) {
    const slug = path.parse(name).name
        .replace(/[^A-Za-z0-9_-]+/g, '-')
        .slice(0, 40)
        .replace(/^-+|-+$/g, '')
    return slug || 'print'
}

// Pads string with 0 if it is length 1
const pad = (n) => String(n).padStart(2, '0');

// Makes a UTC Stamp
function utcStamp() {
     const date = new Date();
        const utc = 
        pad(date.getUTCFullYear()) + 
        pad(date.getUTCMonth() + 1) + 
        pad(date.getUTCDate()) + "-" + 
        pad(date.getUTCHours()) +
        pad(date.getUTCMinutes()) +
        pad(date.getUTCSeconds())
        return utc
}


export async function createStore(dataDir) {
    // build paths for prints
    function p(...parts) {
        return path.join(dataDir, ...parts)
    }
    async function readJson(file) {
        const json = await readFile(file, 'utf8')
        return JSON.parse(json)
    }

    async function writeJson(file, value) {
        const data = JSON.stringify(value, null, 2)
        await writeFile(file, data)
    }
    async function exists(file) {
        try {
            await stat(file);
            return true
            } catch (err) {
                if (err.code === "ENOENT") {
                    return false
                }
            throw err;
        }
    }
    function checkName(name) {
        if (typeof name !== 'string' || !(/^[A-Za-z0-9_-]+$/).test(name)) {
            throw Object.assign(new Error('invalid name'), { status: 400 });
        }
    }

    function makeJobId() {
        return utcStamp() + "-" + randomBytes(2).toString('hex')   
    }

    // provides sequencing for the queue
    async function nextSeq() {
        const file = p('queue', 'seq')
        if (await exists(file)) {
            const n = Number( await readFile(file)) + 1
            await writeFile(file, String(n))
            return n
        } else {
            await writeFile(file, String(1))
            return 1
        }
    }
    async function createPrint({user, name, sourceType, source, hpgl}) {
        checkName(user)
        if (typeof hpgl !== 'string' || typeof source !== 'string' || !hpgl || !source) {
            throw Object.assign(new Error('invalid name or hpgl'), { status: 400 })
        }
        if (sourceType !==  "hpgl") {
            throw Object.assign(new Error('invalid file format'), { status: 400 });
        }
        await mkdir(p('users', user, 'prints'), {recursive: true})
        const base = utcStamp().slice(0,13) + "-" + slugify(name);

        let id;
        let directory;
        for (let n = 1; ; n++) {
            id = n === 1 ? base : `${base}-${n}`;
            try {
                directory = p('users', user, 'prints', id)
                await mkdir(directory)
                break
            } catch(err) {
                if (err.code === 'EEXIST') {
                    continue
                } else throw err;
            }
        }
        const created = new Date().toISOString()
        await writeFile(path.join(directory,'source.hpgl'), source)
        await writeFile(path.join(directory, 'plot.hpgl'), hpgl)
        await writeJson(path.join(directory, 'print.json'), { name, user, created, sourceType})

        return { id , name, user, created, sourceType }
    }

    let last = Promise.resolve();

    function withLock(fn) {
        const run = last.then(fn)
        last = run.catch(() => {})
        return run
    }
    for (const folder of FOLDERS) {
        await mkdir(p(folder), {recursive: true})
    }
    return { withLock, createPrint }
}


