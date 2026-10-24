import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('release builds as self-contained game and browser QA with valid JavaScript', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  execFileSync(process.execPath, ['scripts/build.mjs'], {cwd:root});
  const html = readFileSync(`${root}dist/index.html`, 'utf8');
  assert.match(html, /<title>Snaky — Arcade<\/title>/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href="\.\//);
  assert.doesNotMatch(html, /^import /m);
  const gameScript = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(gameScript));
  assert.equal((gameScript.match(/\nmountGame\(\);/g) || []).length, 1);
  const qa = readFileSync(`${root}dist/qa/browser.html`, 'utf8');
  assert.doesNotMatch(qa, /await fetch|^import /m);
  const qaScript = qa.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  assert.doesNotThrow(() => new AsyncFunction(qaScript));
  assert.match(qaScript, /Filling all 400 cells/);
  assert.match(qaScript, /360 \/ 768 \/ 1440 layouts/);
});
