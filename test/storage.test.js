import test from 'node:test';
import assert from 'node:assert/strict';
import { BEST_SCORE_KEY, createBestScore } from '../src/storage.js';

function memoryStorage(initial = null) {
  let stored = initial;
  const writes = [];
  return {
    getItem(key) { assert.equal(key, BEST_SCORE_KEY); return stored; },
    setItem(key, value) { assert.equal(key, BEST_SCORE_KEY); stored = value; writes.push(value); },
    get writes() { return writes; },
  };
}

test('missing or corrupt storage reads as zero', () => {
  for (const value of [null, '', 'words', 'NaN', 'Infinity', '-Infinity', '-10', '{}', '10 points', '12.5', '15', '1e9', '3980']) {
    const storage = memoryStorage(value);
    const best = createBestScore(() => storage);
    assert.equal(best.get(), 0);
    assert.deepEqual(storage.writes, []);
  }
});

test('valid saved scores restore and only new records write immediately', () => {
  const storage = memoryStorage('80');
  const best = createBestScore(() => storage);
  assert.equal(best.get(), 80);
  assert.equal(best.record(40), 80);
  assert.equal(best.record(80), 80);
  assert.equal(best.record(90), 90);
  assert.equal(best.get(), 90);
  assert.deepEqual(storage.writes, ['90']);
  assert.equal(createBestScore(() => storage).get(), 90);
  best.record(0);
  assert.equal(best.get(), 90);
});

test('the maximum full-board score restores', () => {
  assert.equal(createBestScore(() => memoryStorage('3970')).get(), 3970);
});

test('invalid incoming scores never damage the best score', () => {
  const storage = memoryStorage('10');
  const best = createBestScore(() => storage);
  for (const invalid of [-10, NaN, Infinity, -Infinity, '20', null, undefined, 12.5, 15, 3980]) assert.equal(best.record(invalid), 10);
  assert.deepEqual(storage.writes, []);
});

test('denied storage property access, reads and writes retain new records in memory', () => {
  for (const storageGetter of [
    () => { throw new Error('Storage denied'); },
    () => ({ getItem() { throw new Error('Read denied'); }, setItem() { throw new Error('Write denied'); } }),
    () => undefined,
  ]) {
    const best = createBestScore(storageGetter);
    assert.equal(best.get(), 0);
    assert.equal(best.record(10), 10);
    assert.equal(best.record(0), 10);
    assert.equal(best.record(20), 20);
    assert.equal(best.get(), 20);
  }
});

test('a restored best still advances in memory if later writes fail', () => {
  const best = createBestScore(() => ({
    getItem: () => '50',
    setItem() { throw new Error('Quota exceeded'); },
  }));
  assert.equal(best.get(), 50);
  assert.equal(best.record(60), 60);
  assert.equal(best.get(), 60);
});
