import { BOARD_SIZE } from './engine.js';

const COLORS = { background: '#08030d', grid: '#241238', body: '#39ff88', bodyLight: '#b6ffce', head: '#e9ff6b', eye: '#07120b', food: '#ff3ea5' };

export function drawBoard(canvas, state) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const cell = size / BOARD_SIZE;
  // Sprite offsets are designed on a 30px cell (600px canvas) and scale with it.
  const px = n => n * cell / 30;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let n = 1; n < BOARD_SIZE; n++) {
    ctx.moveTo(n * cell + .5, 0); ctx.lineTo(n * cell + .5, size);
    ctx.moveTo(0, n * cell + .5); ctx.lineTo(size, n * cell + .5);
  }
  ctx.stroke();
  if (state.food) {
    const x = state.food.x * cell, y = state.food.y * cell;
    ctx.fillStyle = COLORS.food;
    // A stepped diamond, distinct from the square snake head.
    ctx.fillRect(x + px(12), y + px(3), px(6), px(24));
    ctx.fillRect(x + px(9), y + px(6), px(12), px(18));
    ctx.fillRect(x + px(6), y + px(9), px(18), px(12));
    ctx.fillRect(x + px(3), y + px(12), px(24), px(6));
    ctx.fillStyle = '#ff9acb'; ctx.fillRect(x + px(12), y + px(9), px(6), px(6));
  }
  [...state.snake].reverse().forEach((point, reverseIndex) => {
    const head = reverseIndex === state.snake.length - 1;
    const x = point.x * cell, y = point.y * cell;
    ctx.fillStyle = head ? COLORS.head : COLORS.body;
    ctx.fillRect(x + px(2), y + px(2), cell - px(4), cell - px(4));
    if (!head) { ctx.fillStyle = COLORS.bodyLight; ctx.fillRect(x + px(5), y + px(5), cell - px(10), px(3)); return; }
    ctx.fillStyle = COLORS.eye;
    const eyes = {
      right: [[19, 6], [19, 19]], left: [[6, 6], [6, 19]],
      up: [[6, 6], [19, 6]], down: [[6, 19], [19, 19]],
    }[state.direction];
    eyes.forEach(([ex, ey]) => ctx.fillRect(x + px(ex), y + px(ey), px(5), px(5)));
  });
}
