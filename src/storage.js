import { FOOD_POINTS, MAX_SCORE } from './engine.js';

export const BEST_SCORE_KEY = 'snaky.bestScore';

function validScore(value) {
  // Only scores a real run can reach: whole meals, up to a full board.
  return Number.isInteger(value) && value >= 0 && value <= MAX_SCORE && value % FOOD_POINTS === 0;
}

export function createBestScore(storageGetter = () => localStorage) {
  let best = 0;
  try {
    const stored = storageGetter().getItem(BEST_SCORE_KEY);
    // Empty and missing values are zero; Number also rejects corrupt strings.
    const parsed = stored === null ? 0 : Number(stored);
    if (validScore(parsed)) best = parsed;
  } catch {
    // Browsers can deny storage access. The in-memory record remains usable.
  }

  return {
    get: () => best,
    record(score) {
      if (!validScore(score) || score <= best) return best;
      best = score;
      try {
        storageGetter().setItem(BEST_SCORE_KEY, String(best));
      } catch {
        // Keep the new best for this page even if persistence is unavailable.
      }
      return best;
    },
  };
}
