import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const VIEWER_DIRECTORY = dirname(fileURLToPath(import.meta.url));

const CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon'],
]);

/** Return the directory that holds the browser viewer assets. */
export function viewerDirectory() {
  return VIEWER_DIRECTORY;
}

function resolveAsset(requestUrl) {
  const { pathname } = new URL(requestUrl, 'http://localhost');
  const relative = pathname === '/' ? 'viewer.html' : pathname.replace(/^\/+/, '');
  const resolved = normalize(join(VIEWER_DIRECTORY, relative));
  if (resolved !== VIEWER_DIRECTORY && !resolved.startsWith(VIEWER_DIRECTORY + sep)) {
    return null;
  }
  return resolved;
}

async function serveAsset(request, response) {
  const asset = resolveAsset(request.url ?? '/');
  if (asset === null) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Forbidden');
    return;
  }
  try {
    const body = await readFile(asset);
    const type = CONTENT_TYPES.get(extname(asset)) ?? 'application/octet-stream';
    response.writeHead(200, { 'content-type': type });
    response.end(body);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    throw error;
  }
}

/**
 * Serve the animation to the VS Code forwarded-port browser.
 * @param {number} port
 * @returns {import('node:http').Server}
 */
export function runServer(port) {
  const server = createServer((request, response) => {
    serveAsset(request, response).catch((error) => {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Internal server error');
      console.error(error);
    });
  });
  server.listen(port, '0.0.0.0', () => {
    console.log(`Open http://localhost:${port}/viewer.html`);
  });
  return server;
}
