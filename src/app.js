import { createController } from './controller.js';
import { directionForKey, gameMode, speedLevel, tickDelay } from './engine.js';
import { createBestScore } from './storage.js';
import { drawBoard } from './renderer.js';
import { createJevDecider } from './jev.js';

const STATES = {
  ready: { label: 'Start game', board: 'READY', kicker: '1UP', title: 'READY' },
  running: { label: 'Game in progress', board: 'PLAYING' },
  paused: { label: 'Resume game', board: 'PAUSED', kicker: '1UP', title: 'PAUSED', note: 'PRESS P TO RESUME' },
  gameover: { label: 'Restart game', board: 'GAME OVER', kicker: '1UP', title: 'GAME OVER', note: 'PRESS RESTART' },
  won: { label: 'Restart game', board: 'CLEARED', kicker: '1UP', title: 'YOU WIN', note: 'BOARD CLEARED · PRESS RESTART' },
};

export function mountGame({ document: doc = document, window: win = window, random = Math.random, clock, mode = 'arcade', initialState, player = 'human', jevDecider, storageGetter = () => win.localStorage } = {}) {
  const byId = id => doc.getElementById(id);
  const area = byId('play-area'), primary = byId('primary-action'), restart = byId('restart');
  const modeToggle = byId('mode-toggle');
  const bestScore = createBestScore(storageGetter);
  const jevStatus = byId('jev-status');
  const playerInputs = [...doc.querySelectorAll('#player-select input')];
  let activePlayer = player === 'jev' ? 'jev' : 'human';
  let jevError = '';
  let decide = jevDecider;
  let previousStatus;
  const listeners = [];
  const listen = (target, type, handler) => { target.addEventListener(type, handler); listeners.push(() => target.removeEventListener(type, handler)); };
  const render = state => {
    const info = STATES[state.status];
    const activeMode = gameMode(state);
    byId('score').textContent = String(state.score).padStart(3, '0');
    // A Jev run must not overwrite the human's saved record.
    byId('best').textContent = String(activePlayer === 'jev' ? bestScore.get() : bestScore.record(state.score)).padStart(3, '0');
    byId('marquee-player').textContent = activePlayer === 'jev' ? 'JEV PLAYS' : '1 PLAYER';
    for (const input of playerInputs) {
      input.checked = input.value === activePlayer;
      input.disabled = state.status === 'running';
    }
    if (state.status === 'running') jevError = '';
    // Shown for the whole Jev session, so starting a run does not resize the cabinet.
    const note = jevError || (activePlayer === 'jev' ? 'JEV STEERS THE SNAKE · KEYS ARE DISABLED' : '');
    jevStatus.hidden = !note;
    jevStatus.textContent = note;
    jevStatus.dataset.tone = jevError ? 'error' : 'info';
    byId('mode-label').textContent = activeMode === 'arcade' ? 'ARCADE' : 'CLASSIC';
    byId('speed-label').textContent = activeMode === 'arcade' ? `SPEED ${speedLevel(state)}` : `${tickDelay(state)} MS`;
    modeToggle.disabled = state.status === 'running';
    modeToggle.setAttribute('aria-label', activeMode === 'arcade' ? 'Switch to Classic mode' : 'Switch to Arcade mode');
    byId('overlay').hidden = state.status === 'running';
    byId('board-state').textContent = info.board;
    primary.disabled = state.status === 'running';
    byId('primary-label').textContent = info.label;
    restart.hidden = state.status !== 'paused';
    drawBoard(byId('board'), state);
    if (state.status !== previousStatus) {
      for (const key of ['kicker', 'title', 'note']) {
        const node = byId(`overlay-${key}`);
        node.hidden = !info[key];
        if (info[key]) node.textContent = info[key];
      }
      const old = previousStatus;
      previousStatus = state.status;
      if (state.status === 'running') area.focus({ preventScroll: true });
      else if (old && (state.status === 'gameover' || state.status === 'won' || (state.status === 'paused' && doc.activeElement !== area))) primary.focus({ preventScroll: true });
    }
  };
  const jevPlayer = () => (decide ??= createJevDecider());
  const showJevError = error => {
    jevError = `JEV ERROR: ${error?.message ?? 'request failed'} · PRESS RESUME TO RETRY`;
    render(controller.getState());
  };
  const controller = createController({ random, mode, onChange: render, onDecisionError: showJevError, ...(activePlayer === 'jev' ? { decide: jevPlayer() } : {}), ...(clock ? {clock} : {}), ...(initialState ? {initialState} : {}) });
  render(controller.getState());
  listen(primary, 'click', () => {
    const status = controller.getState().status;
    if (status === 'ready') controller.start();
    else if (status === 'paused') controller.resume();
    else if (status === 'gameover' || status === 'won') controller.restart();
  });
  listen(restart, 'click', () => controller.restart());
  listen(modeToggle, 'click', () => {
    const state = controller.getState();
    if (state.status === 'running') return;
    controller.setMode(gameMode(state) === 'arcade' ? 'classic' : 'arcade');
    primary.focus({ preventScroll: true });
  });
  for (const input of playerInputs) {
    listen(input, 'change', () => {
      if (controller.getState().status === 'running' || !input.checked) return;
      activePlayer = input.value === 'jev' ? 'jev' : 'human';
      jevError = '';
      controller.setDecider(activePlayer === 'jev' ? jevPlayer() : null);
      render(controller.getState());
      primary.focus({ preventScroll: true });
    });
  }
  listen(doc, 'keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target;
    if (target && typeof target.closest === 'function' && target.closest('button, a, input, select, textarea')) return;
    const state = controller.getState();
    if (state.status === 'running') return;
    event.preventDefault();
    if (state.status === 'ready') controller.start();
    else if (state.status === 'paused') controller.resume();
    else controller.restart();
  });
  listen(area, 'keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const state = controller.getState();
    const key = event.key.toLowerCase();
    if (key === 'p' || key === 'escape') {
      if (state.status !== 'running' && !(state.status === 'paused' && key === 'p')) return;
      event.preventDefault();
      if (event.repeat) return;
      if (state.status === 'running') controller.pause();
      else controller.resume();
      return;
    }
    const direction = directionForKey(event.key);
    if (!direction || state.status !== 'running') return;
    event.preventDefault();
    if (activePlayer === 'jev') return;
    if (!event.repeat) controller.steer(direction);
  });
  listen(doc, 'visibilitychange', () => { if (doc.hidden) controller.pause(); });
  listen(win, 'blur', () => controller.pause());
  // Steering only works while the board has focus, so losing it must not leave the snake running.
  listen(area, 'focusout', () => controller.pause());
  return { controller, destroy() { listeners.forEach(remove => remove()); controller.dispose(); } };
}
