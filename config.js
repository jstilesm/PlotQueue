import os from 'node:os';
import path from 'node:path';

export const PORT = Number(process.env.PORT ?? 3001);
export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? path.join(os.homedir(), 'plotq-data'));
