import test from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../src/controller.js';
import { createGame, TICK_MS } from '../src/engine.js';

function fakeClock() {
  let now = 0;
  let id = 0;
  const timers = new Map();
  return {
    setTimeout(callback, delay) {
      const handle = ++id;
      timers.set(handle, { callback, at: now + delay });
      return handle;
    },
    clearTimeout(handle) { timers.delete(handle); },
    advance(ms) {
      const target = now + ms;
      while (true) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].callback();
      }
      now = target;
    },
    get count() { return timers.size; },
    get callbacks() { return [...timers.values()].map(({ callback }) => callback); },
  };
}

function setup(initialState, options = {}) {
  const clock = fakeClock();
  const changes = [];
  const controller = createController({ random: () => 0, clock, initialState, ...options, onChange: (state) => changes.push(state) });
  return { clock, changes, controller };
}

test('ready waits for Start, then a full interval, with one fixed-speed loop', () => {
  const { clock, changes, controller } = setup();
  clock.advance(1000);
  assert.equal(clock.count, 0);
  assert.equal(changes.length, 0);
  assert.equal(controller.getState().status, 'ready');
  controller.steer('up');
  assert.equal(controller.getState().pendingDirection, null);
  controller.start();
  controller.start();
  controller.resume();
  controller.restart();
  assert.equal(clock.count, 1);
  assert.equal(changes.length, 1);
  clock.advance(TICK_MS - 1);
  assert.deepEqual(controller.getState().snake[0], { x: 10, y: 10 });
  clock.advance(1);
  assert.deepEqual(controller.getState().snake[0], { x: 11, y: 10 });
  clock.advance(TICK_MS * 2);
  assert.deepEqual(controller.getState().snake[0], { x: 13, y: 10 });
  assert.equal(clock.count, 1);
  controller.dispose();
});

test('arcade starts at 200 ms and tightens to 190 ms after the fifth meal', () => {
  const snake = [10, 9, 8, 7, 6, 5, 4].map(x => ({ x, y: 10 }));
  const initialState = {
    ...createGame(() => 0, 'arcade'), snake, score: 40, food: { x: 11, y: 10 }, status: 'ready',
  };
  const { clock, controller } = setup(initialState);
  controller.start();
  clock.advance(199);
  assert.deepEqual(controller.getState().snake[0], { x: 10, y: 10 });
  clock.advance(1);
  assert.equal(controller.getState().score, 50);
  assert.equal(controller.getState().snake.length, 8);
  clock.advance(189);
  assert.deepEqual(controller.getState().snake[0], { x: 11, y: 10 });
  clock.advance(1);
  assert.deepEqual(controller.getState().snake[0], { x: 12, y: 10 });
  assert.equal(controller.getState().mode, 'arcade');
  controller.dispose();
});

test('restart preserves mode; setMode resets to ready and cannot interrupt a run', () => {
  const { clock, controller } = setup(undefined, { mode: 'arcade' });
  assert.equal(controller.getState().mode, 'arcade');
  controller.start();
  clock.advance(200);
  controller.pause();
  controller.restart();
  assert.equal(controller.getState().mode, 'arcade');
  assert.equal(controller.getState().status, 'running');
  controller.pause();
  controller.setMode('classic');
  const fresh = controller.getState();
  assert.equal(fresh.status, 'ready');
  assert.equal(fresh.mode, 'classic');
  assert.equal(fresh.score, 0);
  assert.equal(clock.count, 0);
  controller.start();
  clock.advance(124);
  assert.deepEqual(controller.getState().snake[0], { x: 10, y: 10 });
  clock.advance(1);
  assert.deepEqual(controller.getState().snake[0], { x: 11, y: 10 });
  controller.setMode('arcade');
  assert.equal(controller.getState().mode, 'classic');
  assert.equal(controller.getState().status, 'running');
  controller.dispose();
});

test('pause preserves board, food, score and direction, clears pending and discards elapsed time', () => {
  const { clock, controller } = setup();
  controller.start();
  controller.steer('up');
  clock.advance(100);
  const previous = controller.getState();
  const staleCallback = clock.callbacks[0];
  controller.pause();
  const paused = controller.getState();
  assert.equal(paused.status, 'paused');
  assert.equal(paused.snake, previous.snake);
  assert.equal(paused.food, previous.food);
  assert.equal(paused.score, previous.score);
  assert.equal(paused.direction, previous.direction);
  assert.equal(paused.pendingDirection, null);
  assert.equal(clock.count, 0);
  controller.steer('down');
  clock.advance(4000);
  assert.equal(controller.getState(), paused);
  controller.resume();
  controller.resume();
  staleCallback();
  assert.equal(clock.count, 1);
  clock.advance(124);
  assert.equal(controller.getState().snake, paused.snake);
  clock.advance(1);
  assert.deepEqual(controller.getState().snake[0], { x: 11, y: 10 });
  assert.equal(clock.count, 1);
  controller.dispose();
});

test('rapid steering keeps the first legal command until the next simulation tick', () => {
  const { clock, controller } = setup();
  controller.start();
  controller.steer('left');
  controller.steer('right');
  controller.steer('up');
  controller.steer('left');
  controller.steer('up');
  assert.equal(clock.count, 1);
  clock.advance(125);
  assert.deepEqual(controller.getState().snake[0], { x: 10, y: 9 });
  controller.steer('left');
  clock.advance(125);
  assert.deepEqual(controller.getState().snake[0], { x: 9, y: 9 });
  controller.dispose();
});

test('collision stops the timer and retains the final valid board and score', () => {
  const initialState = {
    ...createGame(() => 0), status: 'ready', direction: 'right', score: 40,
    snake: [{ x: 19, y: 4 }, { x: 18, y: 4 }, { x: 17, y: 4 }],
  };
  const { clock, changes, controller } = setup(initialState);
  controller.start();
  clock.advance(125);
  const final = controller.getState();
  assert.equal(final.status, 'gameover');
  assert.equal(final.snake, initialState.snake);
  assert.equal(final.score, 40);
  assert.equal(clock.count, 0);
  clock.advance(10000);
  controller.start();
  controller.resume();
  controller.steer('down');
  assert.equal(controller.getState(), final);
  assert.equal(changes.length, 2);
});

test('completion stops without scheduling another tick or generating food', () => {
  const snake = [];
  for (let y = 0; y < 20; y += 1) for (let offset = 0; offset < 20; offset += 1) {
    const x = y % 2 ? 19 - offset : offset;
    if (x || y) snake.push({ x, y });
  }
  const initialState = {
    snake, direction: 'left', pendingDirection: null, food: { x: 0, y: 0 }, score: 3960, status: 'running',
  };
  const { clock, controller } = setup(initialState);
  assert.equal(clock.count, 1);
  clock.advance(125);
  assert.equal(controller.getState().status, 'won');
  assert.equal(controller.getState().score, 3970);
  assert.equal(controller.getState().snake.length, 400);
  assert.equal(clock.count, 0);
});

test('restart from paused or finished creates a fresh run and waits a full interval', () => {
  for (const status of ['paused', 'gameover', 'won']) {
    const { clock, controller } = setup({
      ...createGame(() => 0.9), status, direction: 'down', pendingDirection: 'left', score: 80,
    });
    controller.restart();
    controller.restart();
    const fresh = controller.getState();
    assert.equal(fresh.status, 'running');
    assert.equal(fresh.score, 0);
    assert.equal(fresh.direction, 'right');
    assert.equal(fresh.pendingDirection, null);
    assert.deepEqual(fresh.food, { x: 0, y: 0 });
    assert.deepEqual(fresh.snake, createGame(() => 0).snake);
    assert.equal(clock.count, 1);
    clock.advance(124);
    assert.equal(controller.getState(), fresh);
    clock.advance(1);
    assert.deepEqual(controller.getState().snake[0], { x: 11, y: 10 });
    controller.dispose();
  }
});

test('dispose cancels movement and all later lifecycle and steering calls', () => {
  const { clock, changes, controller } = setup();
  controller.start();
  const callback = clock.callbacks[0];
  const previous = controller.getState();
  controller.dispose();
  assert.equal(clock.count, 0);
  callback();
  controller.pause();
  controller.resume();
  controller.restart();
  controller.start();
  controller.steer('up');
  clock.advance(10000);
  assert.equal(controller.getState(), previous);
  assert.equal(changes.length, 1);
});

test('a synchronous onChange pause cannot leave a tick scheduled', () => {
  const clock = fakeClock();
  let controller;
  controller = createController({ clock, random: () => 0, onChange(state) {
    if (state.status === 'running' && state.snake[0].x === 11) controller.pause();
  } });
  controller.start();
  clock.advance(125);
  assert.equal(controller.getState().status, 'paused');
  assert.equal(clock.count, 0);
});
