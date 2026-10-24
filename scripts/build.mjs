import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = new URL('../dist/', import.meta.url);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
// The small, fixed module graph has no external dependencies. Embed it so the
// release also works directly from disk, with no module-fetch/CORS requirement.
const modules = ['engine', 'controller', 'storage', 'renderer', 'app'];
const bundle = (await Promise.all(modules.map(name => readFile(`${root}src/${name}.js`, 'utf8'))))
  .map(code => code.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')).join('\n');
const css = await readFile(`${root}style.css`, 'utf8');
const favicon = await readFile(`${root}favicon.svg`, 'utf8');
const html = (await readFile(`${root}index.html`, 'utf8'))
  .replace('<link rel="stylesheet" href="./style.css">', `<style>${css}</style>`)
  .replace('./favicon.svg', `data:image/svg+xml,${encodeURIComponent(favicon)}`)
  .replace('  <script type="module" src="./src/main.js"></script>', '');
const script = code => `<script type="module">${code.replace(/<\/script/gi, '<\\/script')}</script>`;
await writeFile(new URL('index.html', out), html.replace('</body>', `${script(`${bundle}\nmountGame();`)}\n</body>`));
await mkdir(new URL('qa/', out), { recursive: true });
const browserTests = (await readFile(`${root}test/browser.js`, 'utf8'))
  .replace(/^import .*;\r?\n/gm, '')
  .replace(/^const html = .*;\r?$/m, `const html = ${JSON.stringify(html)};`);
const qaHtml = (await readFile(`${root}test/browser.html`, 'utf8'))
  .replace('<script type="module" src="./browser.js"></script>', '')
  .replace('</body>', `${script(`${bundle}\n${browserTests}`)}\n</body>`);
await writeFile(new URL('qa/browser.html', out), qaHtml);
console.log('Built Snaky → dist/ (self-contained static game + browser QA page; no runtime dependencies)');
