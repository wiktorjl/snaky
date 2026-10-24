import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARCADE_FOODS_PER_STEP, ARCADE_MIN_TICK_MS, ARCADE_START_TICK_MS, ARCADE_STEP_TICK_MS,
  BOARD_SIZE, TICK_MS, createGame, directionForKey, gameMode, queueDirection, speedLevel, tick, tickDelay,
} from '../src/engine.js';

const running = (changes = {}) => ({ ...createGame(() => 0), status: 'running', ...changes });
const freezeState = (state) => {
  state.snake.forEach(Object.freeze);
  Object.freeze(state.snake);
  if (state.food) Object.freeze(state.food);
  return Object.freeze(state);
};
const snakeOfLength = (length) => Array.from({ length }, (_, index) => ({
  x: index % BOARD_SIZE, y: Math.floor(index / BOARD_SIZE),
}));

test('initial board uses the specified coordinates, constants, score and empty-cell food', () => {
  const state = createGame(() => 0);
  assert.equal(BOARD_SIZE, 20);
  assert.equal(TICK_MS, 125);
  assert.deepEqual(state.snake, [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }]);
  assert.equal(state.direction, 'right');
  assert.equal(state.pendingDirection, null);
  assert.equal(state.status, 'ready');
  assert.equal(state.score, 0);
  assert.equal(state.mode, 'classic');
  assert.equal(tickDelay(state), TICK_MS);
  assert.deepEqual(state.food, { x: 0, y: 0 });
});

test('arcade starts at 200 ms and gains 10 ms of speed every five foods until the 80 ms floor', () => {
  const state = createGame(() => 0, 'arcade');
  assert.equal(state.mode, 'arcade');
  assert.equal(tickDelay(state), ARCADE_START_TICK_MS);
  assert.equal(speedLevel(state), 1);
  for (const [foodsEaten, delay, level] of [
    [0, 200, 1], [4, 200, 1], [5, 190, 2], [9, 190, 2], [10, 180, 3],
    [20, 160, 5], [40, 120, 9], [55, 90, 12], [60, 80, 13], [100, 80, 13],
  ]) {
    const sample = { ...state, snake: snakeOfLength(3 + foodsEaten) };
    assert.equal(tickDelay(sample), delay, `${foodsEaten} foods should tick at ${delay} ms`);
    assert.equal(speedLevel(sample), level, `${foodsEaten} foods should be speed ${level}`);
  }
  assert.equal(ARCADE_START_TICK_MS, 200);
  assert.equal(ARCADE_STEP_TICK_MS, 10);
  assert.equal(ARCADE_FOODS_PER_STEP, 5);
  assert.equal(ARCADE_MIN_TICK_MS, 80);
});

test('classic stays at 125 ms and speed 1 at every length', () => {
  const state = createGame(() => 0, 'classic');
  for (const length of [3, 8, 63, 400]) {
    const sample = { ...state, snake: snakeOfLength(length) };
    assert.equal(tickDelay(sample), TICK_MS);
    assert.equal(speedLevel(sample), 1);
  }
});

test('unknown or legacy modes safely fall back to classic timing', () => {
  const arcade = createGame(() => 0, 'arcade');
  for (const mode of [undefined, 'turbo']) {
    const state = { ...arcade, mode };
    assert.equal(gameMode(state), 'classic');
    assert.equal(tickDelay(state), TICK_MS);
    assert.equal(speedLevel(state), 1);
  }
  assert.equal(gameMode(createGame(() => 0, 'arcade')), 'arcade');
});

test('the fifth meal raises the arcade speed for the following tick', () => {
  const snake = [10, 9, 8, 7, 6, 5, 4].map(x => ({ x, y: 10 }));
  const state = freezeState({
    ...createGame(() => 0, 'arcade'), snake, direction: 'right', food: { x: 11, y: 10 },
    score: 40, status: 'running',
  });
  const next = tick(state, () => 0);
  assert.equal(next.mode, 'arcade');
  assert.equal(next.snake.length, 8);
  assert.equal(next.score, 50);
  assert.equal(tickDelay(next), 190);
  assert.equal(speedLevel(next), 2);
});

test('every possible food selection is an unoccupied cell with no rejection loop', () => {
  const foods = new Set();
  for (let index = 0; index < 397; index += 1) {
    let calls = 0;
    const state = createGame(() => { calls += 1; return (index + 0.5) / 397; });
    assert.equal(calls, 1);
    assert.ok(!state.snake.some((cell) => cell.x === state.food.x && cell.y === state.food.y));
    foods.add(`${state.food.x},${state.food.y}`);
  }
  assert.equal(foods.size, 397);
});

test('one ordinary tick moves one cell without mutation, growth, scoring or replacing food', () => {
  const state = freezeState(running());
  const next = tick(state, () => { throw new Error('Food must not be replaced'); });
  assert.deepEqual(next.snake, [{ x: 11, y: 10 }, { x: 10, y: 10 }, { x: 9, y: 10 }]);
  assert.equal(next.snake.length, 3);
  assert.equal(next.score, 0);
  assert.equal(next.food, state.food);
  assert.deepEqual(state.snake[0], { x: 10, y: 10 });
});

test('eating adds exactly one segment and 10 points, then selects an empty replacement', () => {
  const state = freezeState(running({ food: { x: 11, y: 10 }, score: 20 }));
  const next = tick(state, () => 0.53);
  assert.equal(next.snake.length, state.snake.length + 1);
  assert.deepEqual(next.snake.at(-1), state.snake.at(-1));
  assert.equal(next.score, 30);
  assert.ok(!next.snake.some((cell) => cell.x === next.food.x && cell.y === next.food.y));
  assert.equal(next.status, 'running');
});

test('wall collisions retain the complete last valid board and score on all four sides', () => {
  for (const [direction, head, body] of [
    ['right', { x: 19, y: 10 }, { x: 18, y: 10 }],
    ['left', { x: 0, y: 10 }, { x: 1, y: 10 }],
    ['up', { x: 10, y: 0 }, { x: 10, y: 1 }],
    ['down', { x: 10, y: 19 }, { x: 10, y: 18 }],
  ]) {
    const state = freezeState(running({ snake: [head, body], direction, score: 40 }));
    const next = tick(state);
    assert.equal(next.status, 'gameover');
    assert.equal(next.snake, state.snake);
    assert.equal(next.food, state.food);
    assert.equal(next.score, 40);
    assert.equal(next.direction, direction);
  }
});

test('a cell occupied after the tail leaves causes a collision without committing the turn', () => {
  const state = freezeState(running({
    snake: [{ x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
    direction: 'up', pendingDirection: 'left', score: 20,
  }));
  const next = tick(state);
  assert.equal(next.status, 'gameover');
  assert.equal(next.snake, state.snake);
  assert.equal(next.food, state.food);
  assert.equal(next.score, state.score);
  assert.equal(next.direction, state.direction);
  assert.equal(next.pendingDirection, null);
});

test('the current tail cell is legal when the tail moves away', () => {
  const state = freezeState(running({
    snake: [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 0, y: 2 }, { x: 0, y: 1 }],
    direction: 'up', pendingDirection: 'left',
  }));
  const next = tick(state);
  assert.equal(next.status, 'running');
  assert.deepEqual(next.snake, [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 0, y: 2 }]);
  assert.equal(next.direction, 'left');
});

test('the final meal fills all 400 cells, awards 10, and never asks for replacement food', () => {
  const snake = [];
  for (let y = 0; y < 20; y += 1) {
    for (let offset = 0; offset < 20; offset += 1) {
      const x = y % 2 ? 19 - offset : offset;
      if (x !== 0 || y !== 0) snake.push({ x, y });
    }
  }
  const state = freezeState(running({ snake, direction: 'left', food: { x: 0, y: 0 }, score: 3960 }));
  const next = tick(state, () => { throw new Error('A cleared board has no food'); });
  assert.equal(next.status, 'won');
  assert.equal(next.snake.length, 400);
  assert.equal(new Set(next.snake.map(({ x, y }) => `${x},${y}`)).size, 400);
  assert.equal(next.food, null);
  assert.equal(next.score, 3970);
  assert.equal(tick(next), next);
});

test('arrow keys and either case of WASD map to the same commands', () => {
  for (const [keys, direction] of [
    [['ArrowUp', 'w', 'W'], 'up'], [['ArrowRight', 'd', 'D'], 'right'],
    [['ArrowDown', 's', 'S'], 'down'], [['ArrowLeft', 'a', 'A'], 'left'],
  ]) for (const key of keys) assert.equal(directionForKey(key), direction);
  for (const key of ['Tab', 'Escape', 'p', 'Enter', ' ', 'toString', null, undefined]) {
    assert.equal(directionForKey(key), null);
  }
});

test('same and opposite directions do not consume the first perpendicular-turn slot', () => {
  const state = freezeState(running());
  assert.equal(queueDirection(state, 'right'), state);
  assert.equal(queueDirection(state, 'left'), state);
  assert.equal(queueDirection(state, 'invalid'), state);
  const queued = queueDirection(state, 'up');
  assert.equal(queued.pendingDirection, 'up');
  assert.equal(queueDirection(queued, 'left'), queued);
  assert.equal(queueDirection(queued, 'down'), queued);
  assert.equal(queueDirection(queued, 'up'), queued);
  const next = tick(queued);
  assert.deepEqual(next.snake[0], { x: 10, y: 9 });
  assert.equal(next.pendingDirection, null);
  assert.equal(queueDirection(next, 'left').pendingDirection, 'left');
});

test('inactive lifecycle states ignore movement and steering', () => {
  for (const status of ['ready', 'paused', 'gameover', 'won']) {
    const state = freezeState({ ...createGame(() => 0), status });
    assert.equal(queueDirection(state, 'up'), state);
    assert.equal(tick(state), state);
  }
});
