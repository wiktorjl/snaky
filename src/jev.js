import { BOARD_SIZE } from './engine.js';

export const JEV_ENDPOINT = '/api/jev';
export const JEV_MODEL = 'jev-latest';
const JEV_QUESTION_ID = 'move';
const JEV_MOVES = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};
const JEV_OPPOSITES = { up: 'down', down: 'up', left: 'right', right: 'left' };
const cellId = ({ x, y }) => y * BOARD_SIZE + x;

const JEV_INSTRUCTIONS = [
  'You are playing Snake on a 20x20 grid. x grows to the right and y grows downward.',
  'Choose the snake\'s next move. Each entry in "moves" says whether that move is legal,',
  'whether it is safe (no wall or body collision), how many cells the snake could still reach after it (openSpace),',
  'and its Manhattan distance to the food.',
  'Never choose a move that is not safe. Among safe moves, prefer the one that gets closer to the food,',
  'but avoid moves whose openSpace is smaller than the snake\'s length, because they trap the snake.',
].join(' ');

const JEV_CRITERIA = {
  up: 'Move the head one cell up (y - 1).',
  right: 'Move the head one cell right (x + 1).',
  down: 'Move the head one cell down (y + 1).',
  left: 'Move the head one cell left (x - 1).',
};

function reachableCells(start, blocked) {
  const seen = new Set([cellId(start)]);
  const queue = [start];
  while (queue.length > 0) {
    const cell = queue.pop();
    for (const vector of Object.values(JEV_MOVES)) {
      const next = { x: cell.x + vector.x, y: cell.y + vector.y };
      if (next.x < 0 || next.x >= BOARD_SIZE || next.y < 0 || next.y >= BOARD_SIZE) continue;
      const id = cellId(next);
      if (seen.has(id) || blocked.has(id)) continue;
      seen.add(id);
      queue.push(next);
    }
  }
  return seen.size;
}

// Describes every move from the current position so Jev reasons over facts instead of re-deriving the rules.
export function analyzeMoves(state) {
  const [head] = state.snake;
  const moves = {};
  for (const [direction, vector] of Object.entries(JEV_MOVES)) {
    const next = { x: head.x + vector.x, y: head.y + vector.y };
    const legal = direction !== JEV_OPPOSITES[state.direction];
    const inside = next.x >= 0 && next.x < BOARD_SIZE && next.y >= 0 && next.y < BOARD_SIZE;
    const grows = state.food !== null && next.x === state.food.x && next.y === state.food.y;
    // Same rule as the engine: the tail leaves its cell on an ordinary move.
    const body = grows ? state.snake : state.snake.slice(0, -1);
    const safe = legal && inside && !body.some((cell) => cell.x === next.x && cell.y === next.y);
    moves[direction] = {
      legal,
      safe,
      openSpace: safe ? reachableCells(next, new Set([next, ...body].map(cellId))) : 0,
      foodDistance: state.food ? Math.abs(state.food.x - next.x) + Math.abs(state.food.y - next.y) : null,
    };
  }
  return moves;
}

export function buildJevRequest(state, moves = analyzeMoves(state)) {
  return {
    model: JEV_MODEL,
    state: {
      board: { width: BOARD_SIZE, height: BOARD_SIZE },
      direction: state.direction,
      length: state.snake.length,
      score: state.score,
      head: state.snake[0],
      food: state.food,
      body: state.snake.slice(1).map(({ x, y }) => [x, y]),
      moves,
    },
    questions: {
      [JEV_QUESTION_ID]: { type: 'choice', instructions: JEV_INSTRUCTIONS, criteria: JEV_CRITERIA },
    },
  };
}

export function parseJevDirection(response) {
  const answer = response?.answers?.[JEV_QUESTION_ID];
  if (!answer || !Object.hasOwn(JEV_MOVES, answer.choice)) throw new Error('Jev returned no valid move');
  return answer.choice;
}

// Returns an async (state) => direction. `fetch` is injected so tests never touch the network.
export function createJevDecider({ fetch: send = globalThis.fetch, endpoint = JEV_ENDPOINT } = {}) {
  return async function decide(state) {
    const moves = analyzeMoves(state);
    const open = Object.keys(moves).filter((direction) => moves[direction].safe);
    // A forced (or hopeless) move needs no decision, and skipping the call saves a round trip.
    if (open.length <= 1) return open[0] ?? state.direction;
    let response;
    try {
      response = await send(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildJevRequest(state, moves)),
      });
    } catch {
      throw new Error('Cannot reach the Jev proxy. Run the game with npm run dev or npm run preview.');
    }
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json())?.error ?? ''; } catch { /* body was not JSON */ }
      // The proxy always explains its errors in JSON; anything else is a server without the proxy.
      throw new Error(detail || `No Jev proxy on this server (HTTP ${response.status}). Run the game with JEV_API_KEY=... npm run dev.`);
    }
    return parseJevDirection(await response.json());
  };
}
