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
  decide = null,
  onDecisionError = () => {},
} = {}) {
  let state = initialState ?? createGame(random, mode);
  let timer = null;
  let generation = 0;
  let disposed = false;
  let decider = decide;

  function stopClock() {
    generation += 1;
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  }

  function advance() {
    timer = null;
    if (state.status !== 'running') return;
    state = tick(state, random);
    onChange(state);
    schedule();
  }

  function schedule() {
    if (disposed || state.status !== 'running' || timer !== null) return;
    const scheduledGeneration = generation;
    // The decision runs while the tick delay elapses, so a slow decider only delays a tick that outlasts it.
    const snapshot = state;
    const decision = decider
      ? Promise.resolve().then(() => decider(snapshot)).then((direction) => ({ direction }), (error) => ({ error }))
      : null;
    timer = clock.setTimeout(() => {
      if (disposed || scheduledGeneration !== generation) return;
      if (!decision) { advance(); return; }
      decision.then(({ direction, error }) => {
        if (disposed || scheduledGeneration !== generation) return;
        if (error) {
          stopClock();
          change({ ...state, pendingDirection: null, status: 'paused' });
          onDecisionError(error);
          return;
        }
        if (direction) state = queueDirection(state, direction);
        advance();
      });
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
    setDecider(next) {
      if (disposed || state.status === 'running') return decider !== null;
      decider = next ?? null;
      return decider !== null;
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
