import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMoves, buildJevRequest, createJevDecider, parseJevDirection } from '../src/jev.js';
import { createGame } from '../src/engine.js';

const running = (overrides = {}) => ({ ...createGame(() => 0), status: 'running', food: { x: 15, y: 10 }, ...overrides });
const reply = (choice) => ({ ok: true, status: 200, json: async () => ({ answers: { move: { type: 'choice', choice } } }) });

test('analyzeMoves marks reversing and walls unsafe and measures reachable space', () => {
  const moves = analyzeMoves(running());
  assert.equal(moves.left.legal, false);
  assert.equal(moves.left.safe, false);
  assert.deepEqual([moves.up.safe, moves.right.safe, moves.down.safe], [true, true, true]);
  assert.equal(moves.right.foodDistance, 4);
  assert.equal(moves.up.openSpace, 398);
  const atWall = analyzeMoves(running({ snake: [{ x: 19, y: 5 }, { x: 18, y: 5 }, { x: 17, y: 5 }] }));
  assert.equal(atWall.right.safe, false);
  assert.equal(atWall.right.openSpace, 0);
});

test('analyzeMoves allows entering the vacating tail but not the body', () => {
  // A 2x2 loop: the head is next to the tail's cell, which leaves on this move.
  const snake = [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 5 }];
  const moves = analyzeMoves(running({ snake, direction: 'up', food: { x: 0, y: 0 } }));
  assert.equal(moves.left.safe, true);
  assert.equal(moves.down.safe, false);
});

test('buildJevRequest sends a choice question over all four directions', () => {
  const request = buildJevRequest(running());
  assert.equal(request.model, 'jev-latest');
  assert.equal(request.questions.move.type, 'choice');
  assert.deepEqual(Object.keys(request.questions.move.criteria), ['up', 'right', 'down', 'left']);
  assert.deepEqual(request.state.head, { x: 10, y: 10 });
  assert.deepEqual(request.state.body, [[9, 10], [8, 10]]);
  assert.equal(request.state.moves.right.safe, true);
});

test('parseJevDirection accepts only the four directions', () => {
  assert.equal(parseJevDirection({ answers: { move: { choice: 'down' } } }), 'down');
  assert.throws(() => parseJevDirection({ answers: { move: { choice: 'sideways' } } }), /no valid move/);
  assert.throws(() => parseJevDirection({}), /no valid move/);
});

test('the decider posts the request and returns Jev\'s choice', async () => {
  const calls = [];
  const decide = createJevDecider({ fetch: async (url, init) => { calls.push({ url, init }); return reply('up'); } });
  assert.equal(await decide(running()), 'up');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/jev');
  assert.equal(JSON.parse(calls[0].init.body).questions.move.type, 'choice');
});

test('the decider skips the call when only one move is safe', async () => {
  const snake = [{ x: 19, y: 0 }, { x: 18, y: 0 }, { x: 17, y: 0 }];
  const decide = createJevDecider({ fetch: async () => { throw new Error('should not be called'); } });
  assert.equal(await decide(running({ snake })), 'down');
});

test('the decider reports proxy and API failures as readable errors', async () => {
  const offline = createJevDecider({ fetch: async () => { throw new TypeError('network'); } });
  await assert.rejects(offline(running()), /Cannot reach the Jev proxy/);
  const noKey = createJevDecider({ fetch: async () => ({ ok: false, status: 503, json: async () => ({ error: 'JEV_API_KEY is not set' }) }) });
  await assert.rejects(noKey(running()), /JEV_API_KEY is not set/);
  // A static server such as python3 -m http.server rejects POST with an HTML 501 page.
  const staticServer = createJevDecider({ fetch: async () => ({ ok: false, status: 501, json: async () => { throw new SyntaxError('html'); } }) });
  await assert.rejects(staticServer(running()), /No Jev proxy on this server \(HTTP 501\).*npm run dev/);
});
