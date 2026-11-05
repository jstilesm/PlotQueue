// Builds the HTTP server: routes, static files, CORS. server.js starts it;
// tests start their own copy on a random port.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

export function createApp() {
  return http.createServer((req, res) => {
    // handle() is async; catch here so a thrown error becomes a 500 instead of crashing the process.
    handle(req, res).catch(err => {
      console.error(err);
      if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
      else res.end();
    });
  });
}

async function handle(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.on('finish', () => console.log(req.method, req.url, res.statusCode));

  const { pathname } = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && pathname === '/health') {
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === 'GET') {
    return serveStatic(res, pathname);
  }
  sendJson(res, 404, { error: 'not found' });
}

async function serveStatic(res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return sendJson(res, 400, { error: 'bad path' });
  }
  if (rel.endsWith('/')) rel += 'index.html';

  // The URL parser already removes plain "../", but an encoded slash ("..%2f")
  // survives it and only becomes "../" after decoding. Resolve the real path
  // and refuse anything that lands outside public/.
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR)) {
    return sendJson(res, 403, { error: 'forbidden' });
  }

  let body;
  try {
    body = await readFile(file);
  } catch (err) {
    if (['ENOENT', 'EISDIR', 'ENOTDIR'].includes(err.code)) {
      return sendJson(res, 404, { error: 'not found' });
    }
    throw err;
  }
  const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  res.end(body);
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
