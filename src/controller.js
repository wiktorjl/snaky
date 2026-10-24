import { createGame, gameMode, queueDirection, tick, tickDelay } from './engine.js';

const FINISHED = new Set(['gameover', 'won']);

export function createController({
  random = Math.random,
  onChange = () => {},
  clock = {
    setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
    clearTimeout: (timer) => globalThis.clearTimeout(timer),
  },
  mode = 'classic',
  initialState,
} = {}) {
  let state = initialState ?? createGame(random, mode);
  let timer = null;
  let generation = 0;
  let disposed = false;

  function stopClock() {
    generation += 1;
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  }

  function schedule() {
    if (disposed || state.status !== 'running' || timer !== null) return;
    const scheduledGeneration = generation;
    timer = clock.setTimeout(() => {
      if (disposed || scheduledGeneration !== generation) return;
      timer = null;
      if (state.status !== 'running') return;
      state = tick(state, random);
      onChange(state);
      schedule();
    }, tickDelay(state));
  }

  function change(nextState) {
    if (disposed || nextState === state) return state;
    state = nextState;
    onChange(state);
    schedule();
    return state;
  }

  const controller = {
    getState: () => state,
    start() {
      return state.status === 'ready' ? change({ ...state, status: 'running' }) : state;
    },
    pause() {
      if (disposed || state.status !== 'running') return state;
      stopClock();
      return change({ ...state, pendingDirection: null, status: 'paused' });
    },
    resume() {
      return state.status === 'paused' ? change({ ...state, status: 'running' }) : state;
    },
    restart() {
      if (disposed || (state.status !== 'paused' && !FINISHED.has(state.status))) return state;
      stopClock();
      return change({ ...createGame(random, gameMode(state)), status: 'running' });
    },
    setMode(mode) {
      if (disposed || state.status === 'running') return state;
      stopClock();
      return change({ ...createGame(random, mode), status: 'ready' });
    },
    steer(direction) {
      return change(queueDirection(state, direction));
    },
    dispose() {
      disposed = true;
      stopClock();
    },
  };
  schedule();
  return controller;
}
