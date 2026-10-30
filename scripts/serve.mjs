import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const project = fileURLToPath(new URL('../', import.meta.url));
const root = resolve(project, process.argv.includes('--source') ? '.' : 'dist');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
try { await stat(resolve(root, 'index.html')); } catch { console.error('No build found. Run npm run build first.'); process.exit(1); }
const JEV_URL = process.env.JEV_API_URL || 'https://api.typesafe.ai/v1/systemone';
const MAX_BODY = 64 * 1024;
const json = (response, status, body) => { response.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store'}); response.end(JSON.stringify(body)); };
// The API key stays on this server (JEV_API_KEY); the browser only ever talks to /api/jev.
async function proxyJev(request, response) {
  const key = process.env.JEV_API_KEY;
  if (!key) { json(response, 503, {error:'JEV_API_KEY is not set on the server. Start it with JEV_API_KEY=... npm run dev'}); return; }
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > MAX_BODY) { json(response, 413, {error:'Request too large'}); return; } chunks.push(chunk); }
  let payload;
  try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { json(response, 400, {error:'Invalid JSON'}); return; }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) { json(response, 400, {error:'Invalid request'}); return; }
  try {
    const upstream = await fetch(JEV_URL, {method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`}, body:JSON.stringify({model:'jev-latest', state:payload.state, questions:payload.questions}), signal:AbortSignal.timeout(10000)});
    const text = await upstream.text();
    if (!upstream.ok) { console.error(`Jev API ${upstream.status}: ${text.slice(0, 300)}`); json(response, 502, {error:`Jev API error (${upstream.status})`}); return; }
    response.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store'}); response.end(text);
  } catch (error) { console.error(`Jev API request failed: ${error.message}`); json(response, 502, {error:'Could not reach the Jev API'}); }
}
const server = createServer(async (request, response) => {
  try {
    if (new URL(request.url, 'http://localhost').pathname === '/api/jev') {
      if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); json(response, 405, {error:'Method not allowed'}); return; }
      await proxyJev(request, response); return;
    }
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
server.on('error', error => { console.error(`Cannot start preview on ${host}:${port}: ${error.code}. Use PORT to select a free port or HOST to select an interface, or run from a terminal that permits local servers.`); process.exitCode = 1; });
server.listen(port, host, () => {
  console.log(`Snaky ${process.argv.includes('--source') ? 'development' : 'production preview'}: http://${host.includes(':') ? `[${host}]` : host}:${port}`);
  // Anyone who can reach this address can spend the Jev key through /api/jev.
  if (process.env.JEV_API_KEY && !['127.0.0.1', 'localhost', '::1'].includes(host)) console.warn(`Warning: the Jev proxy is reachable on ${host}, so other machines on the network can use your JEV_API_KEY.`);
});
