import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const project = fileURLToPath(new URL('../', import.meta.url));
const root = resolve(project, process.argv.includes('--source') ? '.' : 'dist');
const port = Number(process.env.PORT || 4173);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
try { await stat(resolve(root, 'index.html')); } catch { console.error('No build found. Run npm run build first.'); process.exit(1); }
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const base = root;
    const relative = pathname.slice(1);
    const path = resolve(base, relative || 'index.html');
    if (!path.startsWith(base + sep) || relative.split('/').some(part => part.startsWith('.'))) { response.writeHead(403); response.end('Forbidden'); return; }
    const body = await readFile(path);
    response.writeHead(200, {'Content-Type':types[extname(path)] || 'application/octet-stream','Cache-Control':'no-store'});
    response.end(body);
  } catch { response.writeHead(404); response.end('Not found'); }
});
server.on('error', error => { console.error(`Cannot start preview on 127.0.0.1:${port}: ${error.code}. Use PORT to select a free port, or run from a terminal that permits local servers.`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Snaky ${process.argv.includes('--source') ? 'development' : 'production preview'}: http://127.0.0.1:${port}`));
