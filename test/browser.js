import { mountGame } from '../src/app.js';
import { createGame } from '../src/engine.js';

const results = [];
const resultList = document.getElementById('results');
const summary = document.getElementById('summary');
let app, frame, doc, win, clock;
const check = (condition, message = 'Assertion failed') => { if (!condition) throw new Error(message); };
const equal = (a, b, message) => check(JSON.stringify(a) === JSON.stringify(b), `${message || 'Values differ'}: ${JSON.stringify(a)} / ${JSON.stringify(b)}`);
const byId = id => doc.getElementById(id);
const state = () => app.controller.getState();
function fakeClock() {
  let now = 0, next = 1; const timers = new Map();
  return {
    setTimeout(fn, delay) { const id = next++; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) { const end = now + ms; while (true) { const entry = [...timers].sort((a,b) => a[1].at-b[1].at)[0]; if (!entry || entry[1].at > end) break; now = entry[1].at; timers.delete(entry[0]); entry[1].fn(); } now = end; },
    count: () => timers.size,
  };
}
const html = (await (await fetch('../index.html')).text()).replace(/<script type="module" src="\.\/src\/main.js"><\/script>/, '').replace('<head>', `<head><base href="${new URL('../', location.href)}">`);
async function fixture({ width = 768, random = () => 0, initialState, mode, player, jevDecider, storageGetter = () => win.localStorage } = {}) {
  app?.destroy(); frame?.remove();
  frame = document.createElement('iframe'); frame.title = 'Snaky production interface under test'; frame.style.width = `${width}px`;
  const loaded = new Promise(resolve => frame.addEventListener('load', resolve, {once:true}));
  frame.srcdoc = html; document.getElementById('fixture').append(frame); await loaded;
  doc = frame.contentDocument; win = frame.contentWindow; clock = fakeClock();
  app = mountGame({document:doc,window:win,random,clock,initialState,storageGetter,...(mode ? {mode} : {}),...(player ? {player} : {}),...(jevDecider ? {jevDecider} : {})});
}
function key(value, options = {}, target = byId('play-area')) {
  const event = new win.KeyboardEvent('keydown', {key:value,bubbles:true,cancelable:true,...options});
  target.dispatchEvent(event); return event;
}
function pressBody(value) { return key(value, {}, doc.body); }
function start() { byId('primary-action').click(); }
async function test(name, fn) {
  try { await fn(); results.push({name,pass:true}); }
  catch (error) { results.push({name,pass:false,error:error.message}); }
  const latest = results.at(-1), li = document.createElement('li'); li.textContent = `${latest.pass ? 'PASS' : 'FAIL'} — ${name}${latest.error ? ': ' + latest.error : ''}`;
  if (!latest.pass) li.className = 'fail'; resultList.append(li);
}

let browserVersions = '';
try { if (navigator.userAgentData) browserVersions = JSON.stringify((await navigator.userAgentData.getHighEntropyValues(['fullVersionList'])).fullVersionList); } catch { /* User agent string remains available. */ }
document.getElementById('environment').textContent = `Browser: ${navigator.userAgent}\n${browserVersions ? `Full versions: ${browserVersions}\n` : ''}Platform: ${navigator.platform}\nProduction modules, DOM events, canvas and controlled time/randomness.\n`;
window.addEventListener('error', event => { const p = document.createElement('p'); p.className = 'fail'; p.textContent = `Uncaught: ${event.message}`; document.body.append(p); });

await test('Arcade is default: Enter starts at 200 ms, speed 2 after five bites; mode toggle resets', async () => {
  await fixture(); equal(state().mode, 'arcade'); equal(byId('mode-label').textContent, 'ARCADE');
  equal(byId('speed-label').textContent, 'SPEED 1'); equal(byId('mode-toggle').getAttribute('aria-label'), 'Switch to Classic mode');
  check(byId('overlay-note').hidden); check(byId('pause') === null);
  const enter = pressBody('Enter'); check(enter.defaultPrevented); equal(state().status, 'running');
  equal(doc.activeElement.id, 'play-area'); check(byId('primary-action').disabled); check(byId('mode-toggle').disabled);
  clock.advance(199); equal(state().snake[0], {x:10,y:10}); clock.advance(1); equal(state().snake[0], {x:11,y:10});
  key('p'); equal(state().status, 'paused'); check(!byId('overlay-note').hidden); check(!byId('mode-toggle').disabled);
  byId('mode-toggle').click(); equal(state().status, 'ready'); equal(state().mode, 'classic');
  equal(byId('mode-label').textContent, 'CLASSIC'); equal(byId('speed-label').textContent, '125 MS');
  equal(byId('mode-toggle').getAttribute('aria-label'), 'Switch to Arcade mode'); check(byId('overlay-note').hidden);
  start(); clock.advance(124); equal(state().snake[0], {x:10,y:10}); clock.advance(1); equal(state().snake[0], {x:11,y:10});
  const snake = [10,9,8,7,6,5,4].map(x => ({x,y:10}));
  const initial = {...createGame(() => 0, 'arcade'), snake, score:40, food:{x:11,y:10}, status:'ready'};
  await fixture({ initialState: initial }); equal(byId('speed-label').textContent, 'SPEED 1');
  start(); clock.advance(200); equal(state().score, 50); equal(byId('speed-label').textContent, 'SPEED 2');
  clock.advance(189); equal(state().snake[0], {x:11,y:10}); clock.advance(1); equal(state().snake[0], {x:12,y:10});
});
await test('Classic waits; Space starts, focuses board, and waits exactly 125 ms', async () => {
  await fixture({ mode: 'classic' }); equal(state().status, 'ready'); clock.advance(1000); equal(state().snake[0], {x:10,y:10});
  check(!key('ArrowUp').defaultPrevented); equal(state().pendingDirection, null);
  const space = pressBody(' '); check(space.defaultPrevented);
  equal(state().status,'running'); equal(doc.activeElement.id,'play-area'); equal(clock.count(),1);
  check(byId('overlay').hidden); check(byId('primary-action').disabled); check(!byId('primary-action').hidden);
  clock.advance(124); equal(state().snake[0],{x:10,y:10}); clock.advance(1); equal(state().snake[0],{x:11,y:10});
});
await test('Keyboard mapping, reversal/repeat rejection and first legal turn', async () => {
  await fixture({mode:'classic'}); start(); check(key('ArrowLeft').defaultPrevented); key('ArrowRight'); key('w',{repeat:true}); equal(state().pendingDirection,null);
  key('w'); key('a'); equal(state().pendingDirection,'up'); clock.advance(125); equal(state().snake[0],{x:10,y:9}); equal(state().direction,'up');
  key('a'); clock.advance(125); equal(state().direction,'left'); key('s'); clock.advance(125); equal(state().direction,'down'); key('d'); clock.advance(125); equal(state().direction,'right');
});
await test('Tab, browser shortcuts and keys outside focused gameplay stay usable', async () => {
  await fixture({mode:'classic'}); start();
  check(!key('Tab').defaultPrevented); check(!key('ArrowUp',{metaKey:true}).defaultPrevented); check(!key('w',{ctrlKey:true}).defaultPrevented);
  check(!key('ArrowDown',{},doc.body).defaultPrevented); equal(state().pendingDirection,null);
});
await test('P pauses/resumes from board; Escape never resumes; queued turn clears', async () => {
  await fixture({mode:'classic'}); start(); key('ArrowUp'); key('p'); equal(state().status,'paused'); equal(state().pendingDirection,null); equal(doc.activeElement.id,'play-area');
  const board = state().snake; clock.advance(5000); equal(state().snake,board); check(!key('ArrowUp').defaultPrevented); key('Escape'); equal(state().status,'paused');
  key('p'); equal(state().status,'running'); clock.advance(124); equal(state().snake,board); clock.advance(1); equal(state().direction,'right');
});
await test('P pause and primary resume preserve run; restart resets and prevents duplicate loops', async () => {
  await fixture({mode:'classic'}); start(); clock.advance(250); key('p');
  equal(state().status,'paused'); equal(doc.activeElement.id,'play-area'); check(!byId('restart').hidden); const before=state().snake;
  byId('primary-action').click(); equal(doc.activeElement.id,'play-area'); clock.advance(124); equal(state().snake,before); clock.advance(1); equal(state().snake[0],{x:13,y:10});
  key('p'); byId('restart').click(); byId('restart').click(); app.controller.start(); equal(clock.count(),1); equal(state().snake,[{x:10,y:10},{x:9,y:10},{x:8,y:10}]); equal(state().score,0); equal(state().pendingDirection,null);
  clock.advance(124); equal(state().snake[0],{x:10,y:10}); clock.advance(1); equal(state().snake[0],{x:11,y:10});
});
await test('Hidden tabs, window blur and leaving the board pause; return never resumes or catches up', async () => {
  await fixture({mode:'classic'}); start(); key('w');
  Object.defineProperty(doc,'hidden',{configurable:true,get:()=>true}); doc.dispatchEvent(new win.Event('visibilitychange'));
  equal(state().status,'paused'); equal(state().pendingDirection,null); clock.advance(10000); equal(state().snake[0],{x:10,y:10});
  Object.defineProperty(doc,'hidden',{configurable:true,get:()=>false}); doc.dispatchEvent(new win.Event('visibilitychange')); win.dispatchEvent(new win.Event('focus')); equal(state().status,'paused');
  byId('primary-action').click(); clock.advance(125); equal(state().snake[0],{x:11,y:10}); win.dispatchEvent(new win.Event('blur')); equal(state().status,'paused');
  byId('primary-action').click(); equal(state().status,'running'); byId('play-area').blur(); equal(state().status,'paused'); equal(doc.activeElement.id,'primary-action');
});
await test('Collision retains board, stops timer and focuses Restart; full flow restarts', async () => {
  await fixture({mode:'classic'}); start(); clock.advance(1125); equal(state().snake[0],{x:19,y:10}); const board=state().snake;
  clock.advance(125); equal(state().status,'gameover'); equal(state().snake,board); equal(clock.count(),0); equal(byId('board-state').textContent,'GAME OVER'); equal(doc.activeElement.id,'primary-action');
  check(!byId('overlay').hidden); equal(byId('primary-label').textContent,'Restart game'); start(); equal(state().status,'running'); equal(state().snake[0],{x:10,y:10}); equal(doc.activeElement.id,'play-area');
});
await test('Food updates displayed Score and Best immediately; Best survives restart and reopen', async () => {
  const saved = new Map(); const storage = {getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)};
  await fixture({mode:'classic',random:()=>208/397,storageGetter:()=>storage}); equal(byId('best').textContent,'000'); equal(state().food,{x:11,y:10});
  start(); clock.advance(125); equal(state().score,10); equal(byId('score').textContent,'010'); equal(byId('best').textContent,'010'); equal(saved.get('snaky.bestScore'),'10');
  key('p'); byId('restart').click(); equal(byId('score').textContent,'000'); equal(byId('best').textContent,'010');
  await fixture({mode:'classic',storageGetter:()=>storage}); equal(byId('best').textContent,'010'); equal(state().status,'ready');
});
await test('Filling all 400 cells shows Board cleared, stops and focuses Restart', async () => {
  const snake = [];
  for(let y=0;y<20;y++) for(let x=0;x<20;x++) if(x!==19 || y!==19) snake.push({x,y});
  // Put the head immediately to the left of the final food, with the rest occupied.
  snake.splice(snake.findIndex(p=>p.x===18 && p.y===19),1); snake.unshift({x:18,y:19});
  await fixture({mode:'classic',initialState:{snake,direction:'right',pendingDirection:null,food:{x:19,y:19},score:3960,status:'running',mode:'classic'},storageGetter:()=>({getItem:()=>null,setItem:()=>{}})});
  clock.advance(125); equal(state().status,'won'); equal(state().snake.length,400); equal(state().score,3970); equal(state().food,null); equal(clock.count(),0);
  check(byId('board-state').textContent === 'CLEARED'); equal(doc.activeElement.id,'primary-action'); equal(byId('primary-label').textContent,'Restart game');
});
await test('Denied browser storage keeps game and in-memory Best usable', async () => {
  await fixture({mode:'classic',random:()=>208/397,storageGetter:()=>{throw new Error('Denied')}}); start(); clock.advance(125); equal(byId('best').textContent,'010');
  key('p'); byId('restart').click(); equal(byId('best').textContent,'010'); equal(state().score,0);
});
await test('360 / 768 / 1440 layouts: square board, no overflow or scroll, visible controls, no shift on start, resize preserves run', async () => {
  await fixture(); const helpTop=byId('keyboard-help').getBoundingClientRect().top; start();
  check(Math.abs(byId('keyboard-help').getBoundingClientRect().top-helpTop)<1,'Starting must not shift sidebar text');
  key('p'); const snapshot=JSON.stringify(state());
  for (const width of [360,768,1440]) {
    frame.style.maxWidth='none'; frame.style.width=`${width}px`;
    await new Promise(resolve=>win.requestAnimationFrame(()=>win.requestAnimationFrame(resolve)));
    const board=byId('board').getBoundingClientRect(); check(Math.abs(board.width-board.height)<1,`Board must stay square at ${width}`);
    check(doc.documentElement.scrollWidth<=width,`Page overflows at ${width}`); check(board.left>=0 && board.right<=width,`Board edges visible at ${width}`);
    const button=byId('primary-action').getBoundingClientRect(); check(button.width>=44 && button.height>=44,`Primary action usable at ${width}`);
    equal(JSON.stringify(state()),snapshot,'Resize preserves run');
  }
  for (const [width,height] of [[1440,900],[1366,768],[360,640]]) {
    frame.style.width=`${width}px`; frame.style.height=`${height}px`;
    await new Promise(resolve=>win.requestAnimationFrame(()=>win.requestAnimationFrame(resolve)));
    const pageHeight=doc.documentElement.scrollHeight;
    check(pageHeight<=height,`Page must fit ${width}x${height} without vertical scrolling (${pageHeight}px)`);
    const board=byId('board').getBoundingClientRect();
    check(Math.abs(board.width-board.height)<1,`Board must stay square at ${width}x${height}`);
    check(board.left>=0 && board.right<=width && board.bottom<=height,`Board must stay visible at ${width}x${height}`);
    const button=byId('primary-action').getBoundingClientRect(); check(button.height>=44,`Primary action must stay usable at ${width}x${height}`);
    equal(JSON.stringify(state()),snapshot,'Viewport resize preserves run');
  }
  frame.style.width='768px'; frame.style.height='1000px';
});
await test('Player selector: Human is default; Jev steers, ignores keys, locks while running, and leaves Best alone', async () => {
  const settle = () => new Promise(resolve => win.setTimeout(resolve, 0));
  const pick = value => { const input = doc.querySelector(`#player-select input[value="${value}"]`); input.checked = true; input.dispatchEvent(new win.Event('change', {bubbles:true})); };
  const asked = [];
  await fixture({ jevDecider: async snapshot => { asked.push(snapshot.snake[0]); return 'down'; } });
  equal(doc.querySelector('#player-select input:checked').value, 'human'); equal(byId('marquee-player').textContent, '1 PLAYER'); check(byId('jev-status').hidden);
  pick('jev'); equal(byId('marquee-player').textContent, 'JEV PLAYS'); check(!byId('jev-status').hidden);
  const boardTop = byId('board').getBoundingClientRect().top;
  start(); check([...doc.querySelectorAll('#player-select input')].every(input => input.disabled), 'Selector locks while running');
  check(!byId('jev-status').hidden, 'Jev note stays while running'); check(Math.abs(byId('board').getBoundingClientRect().top - boardTop) < 1, 'Starting a Jev run must not move the board');
  key('ArrowUp'); equal(state().pendingDirection, null, 'Keys are ignored while Jev plays');
  await settle(); clock.advance(200); await settle();
  equal(state().snake[0], {x:10,y:11}); equal(state().direction, 'down'); check(asked.length >= 1);
  key('p'); check([...doc.querySelectorAll('#player-select input')].every(input => !input.disabled), 'Selector unlocks when paused');
  pick('human'); equal(byId('marquee-player').textContent, '1 PLAYER'); check(byId('jev-status').hidden);
  const food = [{x:11,y:10}];
  const memory = {}; const storageGetter = () => ({ getItem: name => memory[name] ?? null, setItem: (name, value) => { memory[name] = value; } });
  await fixture({ player: 'jev', storageGetter, jevDecider: async () => 'right', initialState: {...createGame(() => 0, 'arcade'), food:food[0], status:'ready'} });
  start(); await settle(); clock.advance(200); await settle();
  equal(state().score, 10); equal(byId('best').textContent, '000', 'Jev score is not recorded as the human best'); equal(memory, {}, 'Nothing is saved for a Jev run');
  await fixture({ player: 'jev', jevDecider: async () => { throw new Error('offline'); } });
  start(); await settle(); clock.advance(200); await settle();
  equal(state().status, 'paused'); check(byId('jev-status').textContent.includes('offline')); equal(byId('jev-status').dataset.tone, 'error');
});
await test('Board and buttons have visible focus styles; canvas pixels render', async () => {
  await fixture(); const area=byId('play-area'); area.focus();
  const outline=win.getComputedStyle(area).outlineWidth; check(parseFloat(outline)>=3,'Focused board needs 3px outline');
  byId('primary-action').focus(); check(parseFloat(win.getComputedStyle(byId('primary-action')).outlineWidth)>=3,'Primary button needs outline');
  const ctx=byId('board').getContext('2d'); const background=ctx.getImageData(0,0,1,1).data, head=ctx.getImageData(315,315,1,1).data;
  check([...head].join()!==[...background].join(),'Snake head must be rendered'); check(doc.querySelector('#keyboard-help').textContent.includes('WASD'));
});
const failed=results.filter(r=>!r.pass);
summary.textContent=`${results.length-failed.length}/${results.length} browser checks passed${failed.length ? ` — ${failed.length} failed` : ' — all passed'}.`;
if(failed.length) summary.className='fail';
document.documentElement.dataset.testStatus=failed.length?'failed':'passed';
app?.destroy();
