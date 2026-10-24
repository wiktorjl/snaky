export const BOARD_SIZE = 20;
export const TICK_MS = 125;
export const ARCADE_START_TICK_MS = 200;
export const ARCADE_MIN_TICK_MS = 80;
export const ARCADE_STEP_TICK_MS = 10;
export const ARCADE_FOODS_PER_STEP = 5;
export const START_LENGTH = 3;
export const FOOD_POINTS = 10;
export const MAX_SCORE = (BOARD_SIZE * BOARD_SIZE - START_LENGTH) * FOOD_POINTS;

const MODE_RULES = {
  classic: { start: TICK_MS, min: TICK_MS, step: 0, foodsPerStep: Number.POSITIVE_INFINITY },
  arcade: { start: ARCADE_START_TICK_MS, min: ARCADE_MIN_TICK_MS, step: ARCADE_STEP_TICK_MS, foodsPerStep: ARCADE_FOODS_PER_STEP },
};

export function gameMode(state) {
  return Object.hasOwn(MODE_RULES, state.mode) ? state.mode : 'classic';
}

export function tickDelay(state) {
  const rules = MODE_RULES[gameMode(state)];
  const foodsEaten = Math.max(0, state.snake.length - START_LENGTH);
  const steps = Math.floor(foodsEaten / rules.foodsPerStep);
  return Math.max(rules.min, rules.start - steps * rules.step);
}

export function speedLevel(state) {
  const rules = MODE_RULES[gameMode(state)];
  if (rules.step === 0) return 1;
  const foodsEaten = Math.max(0, state.snake.length - START_LENGTH);
  const maxSteps = Math.ceil((rules.start - rules.min) / rules.step);
  return 1 + Math.min(Math.floor(foodsEaten / rules.foodsPerStep), maxSteps);
}

const VECTORS = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};
const OPPOSITES = { up: 'down', down: 'up', left: 'right', right: 'left' };
const sameCell = (a, b) => a.x === b.x && a.y === b.y;

function placeFood(snake, random) {
  const occupied = new Set(snake.map(({ x, y }) => y * BOARD_SIZE + x));
  const empty = [];
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      if (!occupied.has(y * BOARD_SIZE + x)) empty.push({ x, y });
    }
  }
  if (empty.length === 0) return null;
  const sample = random();
  // Math.random is in [0, 1); clamping also keeps injected random sources safe.
  const fraction = Number.isFinite(sample) ? Math.min(Math.max(sample, 0), 1) : 0;
  return empty[Math.min(Math.floor(fraction * empty.length), empty.length - 1)];
}

export function createGame(random = Math.random, mode = 'classic') {
  const snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
  return {
    snake,
    direction: 'right',
    pendingDirection: null,
    food: placeFood(snake, random),
    score: 0,
    status: 'ready',
    mode: Object.hasOwn(MODE_RULES, mode) ? mode : 'classic',
  };
}

export function directionForKey(key) {
  if (typeof key !== 'string') return null;
  const commands = {
    ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down', ArrowLeft: 'left',
    w: 'up', W: 'up', d: 'right', D: 'right',
    s: 'down', S: 'down', a: 'left', A: 'left',
  };
  return Object.hasOwn(commands, key) ? commands[key] : null;
}

export function queueDirection(state, direction) {
  if (state.status !== 'running' || state.pendingDirection !== null
      || !Object.hasOwn(VECTORS, direction) || direction === state.direction
      || direction === OPPOSITES[state.direction]) return state;
  return { ...state, pendingDirection: direction };
}

export function tick(state, random = Math.random) {
  if (state.status !== 'running') return state;
  const direction = state.pendingDirection ?? state.direction;
  const vector = VECTORS[direction];
  const head = { x: state.snake[0].x + vector.x, y: state.snake[0].y + vector.y };
  const grows = state.food !== null && sameCell(head, state.food);
  // On an ordinary move, the tail leaves before the new head enters its cell.
  const remainingBody = grows ? state.snake : state.snake.slice(0, -1);
  if (head.x < 0 || head.x >= BOARD_SIZE || head.y < 0 || head.y >= BOARD_SIZE
      || remainingBody.some((cell) => sameCell(head, cell))) {
    return { ...state, pendingDirection: null, status: 'gameover' };
  }
  const snake = [head, ...state.snake];
  if (!grows) snake.pop();
  const won = snake.length === BOARD_SIZE * BOARD_SIZE;
  return {
    ...state,
    snake,
    direction,
    pendingDirection: null,
    food: won ? null : grows ? placeFood(snake, random) : state.food,
    score: state.score + (grows ? FOOD_POINTS : 0),
    status: won ? 'won' : 'running',
  };
}
