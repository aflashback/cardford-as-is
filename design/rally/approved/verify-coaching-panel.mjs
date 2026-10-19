/**
 * Offline state/DOM contract checks. This is NOT browser or rendering evidence.
 * Run: node design/rally/approved/verify-coaching-panel.mjs
 * No network, renderer, app server, card engine, or production storage is used.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./coaching.js', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const htmlSource = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }

function harness(storage = new Map(), start = new Date(2026, 9, 12, 12).getTime()) {
  let now = start, id = 0, route = 'play', coach;
  const handlers = new Map(), nodes = new Map(), messages = [], timers = new Map(), classNames = new Set();
  class Element {
    constructor() { this.dataset = {}; this.hidden = true; this.open = false; this.disabled = false; this.value = ''; this.children = new Map(); this.attributes = {}; this.markup = ''; }
    set innerHTML(value) { this.markup = value; this.children.clear(); }
    get innerHTML() { return this.markup; }
    querySelector(selector) { if (!this.children.has(selector)) this.children.set(selector, new Element()); return this.children.get(selector); }
    setAttribute(name, value) { this.attributes[name] = value; }
    focus() { document.activeElement = this; }
    contains(element) { return this === element || [...this.children.values()].some(child => child.contains(element)); }
    matches(selector) { return selector === '[data-coach-seek]' && this.isSeek; }
  }
  function $(selector) { if (!nodes.has(selector)) nodes.set(selector, new Element()); return nodes.get(selector); }
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const document = {
    hidden: false, activeElement: null,
    body: { classList: { toggle: (name, on) => on ? classNames.add(name) : classNames.delete(name), add: name => classNames.add(name), remove: name => classNames.delete(name) } },
    addEventListener(type, handler) { if (!handlers.has(type)) handlers.set(type, []); handlers.get(type).push(handler); }
  };
  const context = {
    window: {}, document, innerWidth: 844, innerHeight: 390, Date: ClockDate, Map, Set,
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    setTimeout(fn, delay) { const next = ++id; timers.set(next, { fn, due: now + delay, delay }); return next; },
    clearTimeout: timer => timers.delete(timer),
    FormData: class { constructor(target) { this.data = target.formValues || {}; } get(key) { return this.data[key] || ''; } }
  };
  const state = { mode: 'spades-partners', phase: 'play', beforePause: 'play', played: 0, speed: 1, coachMode: 'asked', modal: null };
  const api = {
    $, state, esc: value => String(value).replaceAll('<', '&lt;'), icon: name => `<svg data-icon="${name}"></svg>`,
    iconButton: (action, icon, label) => `<button data-action="${action}" aria-label="${label}"><svg></svg></button>`,
    mode: () => ({ game: state.mode.split('-')[0], variant: state.mode.endsWith('solo') ? 'solo' : 'partners' }),
    route: () => route, post: data => messages.push(data), hud() {}, toast() {}, render() {},
    go(next) { route = next; api.closeDialog(); coach?.onRoute(next); },
    closeDialog() { $('#dialog').open = false; state.modal = null; }
  };
  vm.createContext(context); vm.runInContext(source, context, { filename: 'coaching.js' });
  coach = context.window.createRallyCoach(api); coach.onRoute('play');
  function dispatch(type, event) { for (const handler of handlers.get(type) || []) handler(event); }
  function click(action, value, item) { const button = { disabled: false, dataset: { action, value, item } }; dispatch('click', { target: { closest: () => button } }); }
  function advance(ms) {
    const end = now + ms;
    for (let safety = 0; safety < 100; safety++) {
      const next = [...timers.entries()].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break; timers.delete(next[0]); now = next[1].due; next[1].fn();
    }
    now = end;
  }
  return {
    $, context, coach, api, state, storage, messages, timers, classNames, click, advance, dispatch, document,
    access: () => coach.exportAccess(),
    body: () => $('#coach-panel-body').innerHTML,
    itemId: () => $('#coach-panel-body').innerHTML.match(/data-item="([^"]+)"/)?.[1],
    playbackTimers: () => [...timers.values()].filter(timer => timer.delay < 10000).length,
    frame(index = 0, total = 8) { coach.receive({ action: 'replay-frame', index, total, frames: Array.from({ length: total }, (_, index) => ({ index, round: index < 4 ? 1 : 2, trick: 1, title: `Moment ${index + 1}`, caption: 'Public information only.' })), title: 'Follow the lead', caption: 'Three diamonds are legal.', round: index < 4 ? 1 : 2, trick: 1, game: api.mode().game, topic: 'cue' }); }
  };
}

const h = harness();
check('Off starts without a suggestion or charge', () => {
  assert.equal(h.access().remaining, 2); assert.equal(h.access().enabled, false);
  assert.equal(h.$('#coach-panel').hidden, true); assert.equal(h.$('#coach-launcher').hidden, false);
  h.coach.receive({ action: 'selected', phase: 'pass', cards: ['HQ', 'HK', 'SA'] });
  h.coach.receive({ action: 'played', card: 'D3' });
  assert.equal(h.access().used, 0); assert(!h.body().includes('Follow the diamonds'));
});
check('Toggle, gallery navigation and automatic events do not consume a session', () => {
  h.click('coach-toggle'); assert.equal(h.access().enabled, true); assert.equal(h.access().used, 0);
  assert(h.body().includes('A second look?')); assert(!h.body().includes('Before selection'));
  h.api.go('coaching'); h.coach.gallery(); h.api.go('play');
  h.coach.receive({ action: 'selected', phase: 'pass', cards: ['HQ'] });
  assert.equal(h.access().used, 0); assert.equal(h.classNames.has('coach-enabled'), true);
});
let cueId;
check('An explicit suggestion uses one session', () => {
  h.click('coach-request', 'cue'); cueId = h.itemId();
  assert.equal(h.access().used, 1); assert.equal(h.access().remaining, 1); assert(cueId);
  assert.strictEqual(h.document.activeElement, h.$('#coach-panel-body'));
  assert(h.body().includes('Why')); assert(h.$('#coach-panel-header').innerHTML.includes('1 free today'));
});
check('Why, seek and feedback share that session and preserve the live phase', () => {
  h.click('coach-why', undefined, cueId);
  assert.equal(h.messages.at(-1).type, 'cardford-coach-replay'); assert.equal(h.messages.at(-1).variant, 'partners');
  assert.equal(h.state.phase, 'play'); h.frame();
  const range = h.$('#coach-panel-body').querySelector('[data-coach-seek]');
  h.click('coach-replay-next'); assert.equal(h.messages.at(-1).index, 1); h.frame(1);
  assert.strictEqual(h.$('#coach-panel-body').querySelector('[data-coach-seek]'), range);
  h.click('coach-replay-feedback'); assert(h.body().includes('coach-feedback-form')); assert.equal(h.$('#dialog').open, false);
  h.click('coach-feedback-vote', 'helpful');
  h.dispatch('submit', { target: { id: 'coach-feedback-form', formValues: { reason: 'Useful timing', note: 'Keep it short.' } }, preventDefault() {} });
  assert.equal(h.coach.exportFeedback()[cueId].note, 'Keep it short.'); assert.equal(h.access().used, 1);
  h.click('coach-replay-exit'); assert.equal(h.state.phase, 'play'); assert(!h.messages.some(message => message.type === 'cardford-design'));
});
let secondId;
check('The second request uses the remaining free session; an extra request locks', () => {
  h.click('coach-request', 'selection'); secondId = h.itemId();
  assert.equal(h.access().used, 2); assert.equal(h.access().remaining, 0);
  h.click('coach-request', 'rating'); assert(h.body().includes('That’s two for today.')); assert.equal(h.access().used, 2);
  h.click('coach-current'); assert(h.body().includes('After selection') || h.body().includes('Selection'));
  h.click('coach-why', undefined, secondId); assert.equal(h.messages.at(-1).action, 'open'); assert.equal(h.access().used, 2);
  h.frame(); h.click('coach-replay-exit');
});
check('Related selection comments update the authorized session without another charge', () => {
  h.state.phase = 'pass'; h.state.mode = 'hearts-solo';
  h.document.activeElement = h.$('#game-board');
  h.coach.receive({ action: 'selected', phase: 'pass', cards: ['HQ', 'HK', 'SA'] });
  assert.strictEqual(h.document.activeElement, h.$('#game-board'));
  assert(h.body().includes('Queen of hearts, King of hearts, Ace of spades')); assert.equal(h.access().used, 2);
  h.state.coachMode = 'after'; h.coach.onPreference(); const priorItem = h.itemId();
  h.coach.receive({ action: 'selected', phase: 'pass', cards: ['HQ'] });
  assert.equal(h.itemId(), priorItem); assert(h.body().includes('Saved selection · demo'));
  assert(!h.body().includes('Your current selection · demo'));
});
check('Turning off prevents automatic comments and closes replay without changing balance', () => {
  h.state.coachMode = 'nudges'; h.click('coach-toggle'); const prior = h.body();
  h.coach.receive({ action: 'selected', phase: 'double', cards: ['HK'] }); h.coach.receive({ action: 'played', card: 'D7' });
  assert.equal(h.body(), prior); assert.equal(h.$('#coach-panel').hidden, true); assert.equal(h.classNames.has('coach-enabled'), false); assert.equal(h.access().used, 2);
  assert.strictEqual(h.document.activeElement, h.$('#coach-launcher'));
});
check('Confirmation retires a pending selection note while off and does not charge', () => {
  h.coach.receive({ action: 'confirmed', phase: 'pass', cards: ['HQ', 'HK', 'SA'], choice: 'pass' });
  assert.equal(h.$('#coach-panel').hidden, true); assert.equal(h.access().used, 2);
  h.click('coach-toggle'); assert(h.body().includes('Your pass is confirmed.'));
  assert(!h.body().includes('nothing is confirmed yet')); assert(!h.body().includes('before confirming the pass'));
  h.click('coach-toggle');
});
check('Default timing retires a confirmed Trix double note immediately', () => {
  const demo = harness(); demo.state.mode = 'trix-basic-solo'; demo.state.phase = 'double';
  demo.coach.receive({ action: 'selected', phase: 'double', cards: ['HQ'] });
  demo.click('coach-request', 'selection'); assert(demo.body().includes('nothing is confirmed yet'));
  demo.coach.receive({ action: 'confirmed', phase: 'double', cards: ['HQ'], choice: 'double' });
  assert(demo.body().includes('Doubling is confirmed.')); assert(!demo.body().includes('nothing is confirmed yet'));
  assert.equal(demo.access().used, 1);
});
check('A played card archives the prior live cue even in When I ask mode', () => {
  const demo = harness(); demo.click('coach-request', 'cue'); assert(demo.body().includes('Before selection · demo cue'));
  demo.coach.receive({ action: 'played', card: 'DK' });
  assert(demo.body().includes('Saved cue · demo')); assert(demo.body().includes('Before King of diamonds was played:'));
  assert(!demo.body().includes('Before selection · demo cue')); assert.equal(demo.access().used, 1);
});
check('Off/on shows the latest selected cards without spending another session', () => {
  const demo = harness(); demo.state.mode = 'hearts-solo'; demo.state.phase = 'pass';
  demo.coach.receive({ action: 'selected', phase: 'pass', cards: ['HQ', 'HK', 'SA'] }); demo.click('coach-request', 'selection');
  demo.click('coach-toggle'); const hiddenMarkup = demo.body();
  demo.coach.receive({ action: 'selected', phase: 'pass', cards: ['C2', 'C5', 'C8'] });
  assert.equal(demo.body(), hiddenMarkup); assert.equal(demo.$('#coach-panel').hidden, true);
  demo.click('coach-toggle'); assert(demo.body().includes('2 of clubs, 5 of clubs, 8 of clubs')); assert(!demo.body().includes('Queen of hearts, King of hearts'));
  assert.equal(demo.access().used, 1);
});
check('Allowance and off preference survive reload', () => {
  const reloaded = harness(h.storage); assert.equal(reloaded.access().used, 2); assert.equal(reloaded.access().enabled, false);
  reloaded.click('coach-toggle'); assert(reloaded.body().includes('Saved coaching session'));
});
check('New game resets the session without refunding the allowance', () => {
  h.coach.reset(); h.click('coach-toggle'); assert.equal(h.access().used, 2);
  assert(h.body().includes('Demo Unlock')); h.click('coach-request', 'cue'); assert.equal(h.access().used, 2);
  assert(!h.body().includes('Before selection · demo cue'));
});
check('Demo Unlock permits repeated explicit requests without charging', () => {
  h.click('coach-unlock'); for (let i = 0; i < 5; i++) h.click('coach-request', i % 2 ? 'review' : 'cue');
  assert.equal(h.access().unlocked, true); assert.equal(h.access().used, 2); assert(h.$('#coach-panel-header').innerHTML.includes('Unlocked'));
});
check('Portrait hides the panel and pauses replay; landscape restores the same replay', () => {
  const rec = h.itemId(); h.click('coach-why', undefined, rec); h.frame(); h.click('coach-replay-toggle');
  assert.equal(h.playbackTimers(), 1);
  h.context.innerWidth = 390; h.context.innerHeight = 844; h.coach.onOrientation(true);
  assert.equal(h.playbackTimers(), 0); assert.equal(h.$('#coach-panel').hidden, true); assert.equal(h.$('#coach-launcher').hidden, true);
  assert.equal(h.coach.isReplaying(), true); const before = h.messages.length; h.advance(3000); assert.equal(h.messages.length, before);
  h.context.innerWidth = 844; h.context.innerHeight = 390; h.coach.onOrientation(false);
  assert.equal(h.coach.isReplaying(), true); assert.equal(h.$('#coach-panel').hidden, false); assert.equal(h.playbackTimers(), 0);
  h.click('coach-toggle'); assert.equal(h.coach.isReplaying(), false); assert.equal(h.messages.at(-1).action, 'close');
});
check('Local midnight restores two free uses; preview controls change only demo access', () => {
  h.click('coach-demo-access', 'exhausted'); const day = h.access().day; assert.equal(h.access().remaining, 0);
  h.advance(24 * 60 * 60 * 1000); assert.notEqual(h.access().day, day); assert.equal(h.access().remaining, 2); assert.equal(h.access().unlocked, false);
  assert(h.body().includes('A second look?'));
  h.click('coach-demo-access', 'unlocked'); assert.equal(h.access().unlocked, true);
  h.click('coach-demo-access', 'free'); assert.equal(h.access().remaining, 2); assert.equal(h.access().unlocked, false);
});
check('Coach opens unpinned, including preferences saved before pinning existed', () => {
  const overlay = harness(); overlay.click('coach-toggle');
  assert.equal(overlay.access().pinned, false); assert.equal(overlay.classNames.has('coach-pinned'), false);
  const oldPrefs = new Map(overlay.storage);
  const saved = JSON.parse(oldPrefs.get('cardford-rally-coach-access-v1')); delete saved.pinned;
  oldPrefs.set('cardford-rally-coach-access-v1', JSON.stringify(saved));
  const migrated = harness(oldPrefs);
  assert.equal(migrated.access().pinned, false); assert.equal(migrated.classNames.has('coach-pinned'), false);
});
check('Pin and unpin preserve the coaching session, replay, seek control and allowance', () => {
  const panel = harness(); panel.click('coach-request', 'cue');
  panel.click('coach-why', undefined, panel.itemId()); panel.frame(3);
  const range = panel.$('#coach-panel-body').querySelector('[data-coach-seek]');
  const messages = panel.messages.length, used = panel.access().used, body = panel.body();
  panel.click('coach-pin'); assert.equal(panel.classNames.has('coach-pinned'), true);
  assert(panel.$('#coach-panel-header').innerHTML.includes('aria-pressed="true"'));
  assert.equal(panel.coach.isReplaying(), true); assert.equal(panel.messages.length, messages);
  assert.equal(panel.body(), body); assert.strictEqual(panel.$('#coach-panel-body').querySelector('[data-coach-seek]'), range);
  assert.equal(range.value, '3'); assert.equal(panel.access().used, used); assert.equal(panel.state.phase, 'play');
  panel.click('coach-pin'); assert.equal(panel.classNames.has('coach-pinned'), false);
  assert.equal(panel.access().pinned, false); assert.equal(panel.messages.length, messages);
  assert.equal(panel.access().used, used);
});
check('Only a visible pinned panel reserves space; hiding preserves the preference', () => {
  const panel = harness(); panel.click('coach-toggle'); panel.click('coach-pin');
  panel.click('coach-toggle'); assert.equal(panel.classNames.has('coach-pinned'), false); assert.equal(panel.access().pinned, true);
  panel.click('coach-toggle'); assert.equal(panel.classNames.has('coach-pinned'), true);
  panel.api.go('coaching'); assert.equal(panel.classNames.has('coach-pinned'), false);
  panel.api.go('play'); assert.equal(panel.classNames.has('coach-pinned'), true);
  panel.context.innerWidth = 390; panel.context.innerHeight = 844; panel.coach.onOrientation(true);
  assert.equal(panel.classNames.has('coach-pinned'), false); assert.equal(panel.access().pinned, true);
  panel.context.innerWidth = 844; panel.context.innerHeight = 390; panel.coach.onOrientation(false);
  assert.equal(panel.classNames.has('coach-pinned'), true);
});
check('Measured pin boundary preserves session and replay at 759/760/761px', () => {
  const panel = harness(); panel.$('#table-screen').clientWidth = 761;
  panel.click('coach-request', 'cue'); const item = panel.itemId();
  panel.click('coach-why', undefined, item); panel.frame(3); panel.click('coach-pin');
  const used = panel.access().used, messages = panel.messages.length;
  const seek = panel.$('#coach-panel-body').querySelector('[data-coach-seek]');
  for (const width of [759, 760, 761, 759, 760]) {
    panel.$('#table-screen').clientWidth = width; panel.coach.onOrientation(false);
    assert.equal(panel.classNames.has('coach-pinned'), width >= 760, `${width}px actual lane`);
    assert.equal(panel.coach.display(), width >= 760 ? 'pinned' : 'overlay');
    assert.equal(panel.access().pinned, true, `${width}px saved preference`);
    assert.equal(panel.access().used, used); assert.equal(panel.messages.length, messages);
    assert.equal(panel.coach.isReplaying(), true);
    assert.strictEqual(panel.$('#coach-panel-body').querySelector('[data-coach-seek]'), seek);
    const pin = panel.$('#coach-panel-header').innerHTML.match(/<button[^>]*data-action="coach-pin"[^>]*>/)?.[0];
    assert(pin, 'Pin action remains discoverable'); assert.equal(/\bdisabled\b/.test(pin), width < 760);
  }
});
check('Narrow and portrait pin transitions restore the preference at zero quota', () => {
  const panel = harness(); panel.$('#table-screen').clientWidth = 759; panel.click('coach-toggle');
  panel.click('coach-pin'); assert.equal(panel.access().pinned, false, 'Unavailable pin rejects activation');
  panel.$('#table-screen').clientWidth = 760; panel.coach.onOrientation(false); panel.click('coach-pin');
  assert.equal(panel.access().pinned, true); panel.click('coach-demo-access', 'exhausted');
  const used = panel.access().used; assert.equal(panel.access().remaining, 0);
  for (const value of ['closed', 'overlay', 'pinned']) {
    panel.coach.reviewDisplay(value); assert.equal(panel.coach.display(), value);
    assert.equal(panel.access().used, used, 'Review display never consumes a session');
  }
  panel.coach.reviewDisplay('unsupported'); assert.equal(panel.coach.display(), 'pinned');
  panel.context.innerWidth = 390; panel.context.innerHeight = 844;
  panel.$('#table-screen').clientWidth = 390; panel.coach.onOrientation(true);
  assert.equal(panel.$('#coach-panel').hidden, true); assert.equal(panel.classNames.has('coach-pinned'), false);
  assert.equal(panel.coach.display(), 'closed');
  assert.equal(panel.access().pinned, true); assert.equal(panel.access().used, used);
  panel.context.innerWidth = 568; panel.context.innerHeight = 320;
  panel.$('#table-screen').clientWidth = 516; panel.coach.onOrientation(false);
  assert.equal(panel.$('#coach-panel').hidden, false); assert.equal(panel.classNames.has('coach-pinned'), false);
  assert.equal(panel.coach.display(), 'overlay');
  assert.equal(panel.access().pinned, true); assert.equal(panel.access().used, used);
  panel.context.innerWidth = 844; panel.context.innerHeight = 390;
  panel.$('#table-screen').clientWidth = 792; panel.coach.onOrientation(false);
  assert.equal(panel.classNames.has('coach-pinned'), true); assert.equal(panel.access().used, used);
  assert.equal(panel.coach.display(), 'pinned');
  assert.equal(panel.access().remaining, 0); assert.equal(harness(panel.storage).access().pinned, true);
});
check('Explicit pin preference survives reload, a new game and demo allowance changes', () => {
  const panel = harness(); panel.click('coach-toggle'); panel.click('coach-pin');
  const reloaded = harness(panel.storage);
  assert.equal(reloaded.access().pinned, true); assert.equal(reloaded.classNames.has('coach-pinned'), true);
  reloaded.coach.reset(); assert.equal(reloaded.access().pinned, true);
  for (const value of ['free', 'exhausted', 'unlocked']) {
    reloaded.click('coach-demo-access', value); assert.equal(reloaded.access().pinned, true);
    assert.equal(reloaded.classNames.has('coach-pinned'), true);
  }
  reloaded.click('coach-pin');
  assert.equal(harness(panel.storage).access().pinned, false);
});
check('Waiting sticker toggles the panel and stays available while open; X only closes', () => {
  const panel = harness(), launcher = panel.$('#coach-launcher');
  assert.equal(launcher.dataset.state, 'waiting'); assert.equal(launcher.attributes['aria-controls'], 'coach-panel');
  assert.equal(launcher.attributes['aria-expanded'], 'false');
  assert(panel.$('#coach-launcher-image').src.endsWith('regular-waiting-v2.png'));
  panel.click('coach-toggle'); assert.equal(launcher.hidden, false); assert.equal(launcher.attributes['aria-expanded'], 'true');
  assert(panel.$('#coach-panel-header').innerHTML.includes('data-action="coach-close"'));
  assert(!panel.$('#coach-panel-header').innerHTML.includes('role="switch"'));
  panel.click('coach-pin'); panel.click('coach-close');
  assert.equal(panel.$('#coach-panel').hidden, true); assert.equal(launcher.attributes['aria-expanded'], 'false');
  assert.equal(panel.access().pinned, true); assert.equal(panel.access().used, 0);
  panel.click('coach-close'); assert.equal(panel.access().enabled, false);
  panel.click('coach-toggle'); assert.equal(panel.classNames.has('coach-pinned'), true); assert.equal(launcher.hidden, false);
  assert.equal(panel.access().used, 0); assert.strictEqual(panel.document.activeElement, panel.$('#coach-panel-body'));
});
check('Only Trix double, Spades bid and Hearts pass show a closed-window whistle', () => {
  const panel = harness();
  for (const [mode, phase, wanted] of [
    ['trix-basic-solo', 'double', 'attention'], ['spades-partners', 'bid', 'attention'], ['hearts-solo', 'pass', 'attention'],
    ['hearts-solo', 'bid', 'waiting'], ['trix-basic-solo', 'bid', 'waiting'], ['spades-partners', 'pass', 'waiting'],
    ['trix-basic-solo', 'request', 'waiting'], ['spades-partners', 'play', 'waiting']
  ]) {
    panel.state.mode = mode; panel.state.phase = phase; panel.coach.onOrientation(false);
    assert.equal(panel.$('#coach-launcher').dataset.state, wanted, `${mode}/${phase}`);
    assert.equal(panel.$('#coach-panel').hidden, true); assert.equal(panel.access().used, 0);
    assert(panel.$('#coach-launcher-image').src.endsWith(wanted === 'attention' ? 'regular-whistle-v3.png' : 'regular-waiting-v2.png'));
  }
  assert.equal(panel.messages.length, 0);
});
check('Open and X acknowledge a decision; changing selected cards does not nag again', () => {
  const panel = harness(); panel.state.mode = 'hearts-solo'; panel.state.phase = 'pass'; panel.coach.onOrientation(false);
  assert.equal(panel.$('#coach-launcher').dataset.state, 'attention');
  assert(panel.$('#coach-launcher-status').textContent.includes('Hearts passing'));
  panel.click('coach-toggle'); assert.equal(panel.$('#coach-launcher').dataset.state, 'waiting');
  panel.click('coach-close'); assert.equal(panel.$('#coach-launcher').dataset.state, 'waiting');
  panel.coach.receive({ action: 'selected', phase: 'pass', cards: ['HQ', 'HK', 'SA'] });
  panel.coach.onOrientation(false); assert.equal(panel.$('#coach-launcher').dataset.state, 'waiting');
  panel.state.phase = 'play'; panel.coach.onOrientation(false); panel.state.phase = 'pass'; panel.coach.onOrientation(false);
  assert.equal(panel.$('#coach-launcher').dataset.state, 'attention');
  panel.click('coach-close'); assert.equal(panel.$('#coach-launcher').dataset.state, 'waiting');
  panel.coach.reset(); assert.equal(panel.$('#coach-launcher').dataset.state, 'attention');
  assert.equal(panel.access().used, 0); assert.equal(panel.$('#coach-panel').hidden, true);
});
check('Source phase transitions arm once before shell state updates and retain acknowledgment', () => {
  const panel = harness(); panel.state.mode = 'trix-basic-solo'; panel.state.phase = 'request'; panel.coach.onOrientation(false);
  panel.coach.receive({ action: 'confirmed', phase: 'request', nextPhase: 'double', choice: 'Queens' });
  assert.equal(panel.$('#coach-launcher').dataset.state, 'attention');
  panel.state.phase = 'double'; panel.coach.onOrientation(false); panel.click('coach-toggle'); panel.click('coach-close');
  panel.coach.receive({ action: 'selected', phase: 'double', cards: ['HQ'] });
  assert.equal(panel.$('#coach-launcher').dataset.state, 'waiting');
  panel.coach.receive({ action: 'confirmed', phase: 'double', nextPhase: 'play', cards: ['HQ'], choice: 'double' });
  assert.equal(panel.$('#coach-launcher').dataset.state, 'waiting');
  panel.state.phase = 'play'; panel.coach.onOrientation(false); panel.state.phase = 'double'; panel.coach.onOrientation(false);
  assert.equal(panel.$('#coach-launcher').dataset.state, 'attention'); assert.equal(panel.access().used, 0);
});
check('Exhausted allowance suppresses fresh-session attention; Demo Unlocked permits it', () => {
  const panel = harness(); panel.click('coach-demo-access', 'exhausted'); panel.click('coach-close');
  panel.state.mode = 'spades-partners'; panel.state.phase = 'bid'; panel.coach.onOrientation(false);
  assert.equal(panel.$('#coach-launcher').dataset.state, 'waiting'); assert.equal(panel.access().used, 2);
  assert.equal(panel.$('#coach-launcher-status').textContent, '');
  panel.click('coach-demo-access', 'unlocked'); panel.click('coach-close');
  panel.state.phase = 'play'; panel.coach.onOrientation(false); panel.state.phase = 'bid'; panel.coach.onOrientation(false);
  assert.equal(panel.$('#coach-launcher').dataset.state, 'attention'); assert.equal(panel.access().unlocked, true);
  assert.equal(panel.access().used, 0); assert.equal(panel.$('#coach-panel').hidden, true);
});
check('Portrait, navigation and pause hide attention without spending or losing pin preference', () => {
  const panel = harness(); panel.click('coach-toggle'); panel.click('coach-pin'); panel.click('coach-close');
  panel.state.mode = 'spades-partners'; panel.state.phase = 'bid'; panel.coach.onOrientation(false);
  assert.equal(panel.$('#coach-launcher').dataset.state, 'attention');
  panel.context.innerWidth = 390; panel.context.innerHeight = 844; panel.coach.onOrientation(true);
  assert.equal(panel.$('#coach-launcher').hidden, true); assert.equal(panel.$('#coach-launcher-status').textContent, '');
  panel.context.innerWidth = 844; panel.context.innerHeight = 390; panel.coach.onOrientation(false);
  assert.equal(panel.$('#coach-launcher').dataset.state, 'attention');
  panel.click('coach-toggle'); panel.click('coach-close');
  panel.state.beforePause = 'bid'; panel.state.phase = 'paused'; panel.coach.onOrientation(false);
  assert.equal(panel.$('#coach-launcher').dataset.state, 'waiting');
  panel.state.phase = 'bid'; panel.coach.onOrientation(false); assert.equal(panel.$('#coach-launcher').dataset.state, 'waiting');
  panel.api.go('coaching'); assert.equal(panel.$('#coach-launcher').hidden, true);
  panel.api.go('play'); assert.equal(panel.$('#coach-launcher').hidden, false); assert.equal(panel.$('#coach-launcher').dataset.state, 'waiting');
  assert.equal(panel.access().pinned, true); assert.equal(panel.access().used, 0);
});
check('Sticker assets and accessible status are local, with no sound or card changes', () => {
  for (const name of ['regular-waiting-v2.png', 'regular-whistle-v3.png']) assert(fs.existsSync(new URL(`./coach-stickers/assets/${name}`, import.meta.url)));
  assert(htmlSource.includes('id="coach-launcher-image"')); assert(htmlSource.includes('alt="Coach waiting"'));
  assert(htmlSource.includes('id="coach-launcher-status" class="sr-only" role="status" aria-live="polite"'));
  assert(!/AudioContext|new Audio\(|speechSynthesis/.test(source));
  assert.equal((htmlSource.match(/<iframe/g) || []).length, 1);
});
check('No footer nodes, coaching dialogs, network calls or iframe remounts', () => {
  assert(!/coach-notice|coach-playback|showModal|showDialog|XMLHttpRequest|\bfetch\s*\(/.test(source));
  assert(!/currentContent|replayHud|frame\.src\s*=/.test(appSource));
  assert(!h.messages.some(message => message.type === 'cardford-design'));
  const render = appSource.slice(appSource.indexOf('  function render(){'), appSource.indexOf('  function shell('));
  assert(render.indexOf("$('#table-screen').hidden") < render.indexOf('coaching?.onRoute(page)'));
});
console.log(`\n${checks} offline state/DOM contract groups passed. No browser/rendering assertions were run.`);
