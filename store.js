import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export const FOLDERS = ['users', 'queue/control', 'queue/tmp', 'queue/pending', 'queue/active', 'queue/done', 'queue/failed', 'queue/cancelled'];


export async function createStore(dataDir) {
    function p(...parts) {
        return path.join(dataDir, ...parts)
    }
    for (const folder of FOLDERS) {
        await mkdir(p(folder), {recursive: true})
    }
    return {}
}


