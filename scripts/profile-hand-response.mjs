// Bounded real-server timing in an isolated test database/browser, never the owner table.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const database = new URL(process.env.TEST_DATABASE_URL ?? '');
if (process.platform !== 'win32' || database.hostname !== '127.0.0.1' || !database.pathname.endsWith('_test'))
  throw Error('Use windows-env with the guarded local test database.');
const port = await new Promise((done, fail) => {
  const probe = createServer(); probe.once('error', fail);
  probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(() => done(port)); });
});
const origin = `http://127.0.0.1:${port}`, output = resolve(process.env.CARDFORD_HAND_RESPONSE_OUTPUT ?? 'qa/implementation/trix/ui-performance/hand-response');
mkdirSync(output, { recursive: true });
const env = { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, PORT: String(port), APP_ORIGIN: origin };
// A complete trusted test deal keeps the human kingdom owner and Jacks opening
// reproducible; random ownership can otherwise start a different request.
const hands = [['H7', 'CJ', 'DJ', 'HJ', 'SJ'], [], [], []];
const reserved = new Set(hands.flat());
const available = ['C', 'D', 'H', 'S'].flatMap(suit =>
  ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'].map(rank => suit + rank))
  .filter(card => !reserved.has(card));
for (const hand of hands) while (hand.length < 13) hand.push(available.shift());
const fixture = resolve(output, 'profile-deals.json');
writeFileSync(fixture, JSON.stringify({ id: 'hand-response-profile', deals: Array.from({ length: 20 }, () => hands.flat()) }));
env.CARDFORD_TRIX_FIXTURE_FILE = fixture;
const server = spawn(resolve('.local/cardford-ui-dev.exe'), ['--migrations', 'web/server/records/migrations', '--web', 'web/dist', '--reasoning', 'partner-resources'],
  { env, cwd: resolve(import.meta.dirname, '..'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', data => process.stdout.write(data)); server.stderr.on('data', data => process.stderr.write(data));
const closed = new Promise(done => server.once('close', done));
const stop = () => server.kill(); process.once('SIGINT', stop); process.once('SIGTERM', stop);
let browser;
try {
  let healthy = false;
  for (let i = 0; i < 60 && server.exitCode === null; i++) {
    try { healthy = (await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1000) })).ok; } catch { /* bounded readiness */ }
    if (healthy) break;
    await new Promise(done => setTimeout(done, 200));
  }
  if (!healthy) throw Error('Isolated listener unavailable.');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const requests = [], errors = [], startTimes = new WeakMap();
  let measured = false, measuredAt = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (measured) startTimes.set(request, performance.now()); });
  page.on('requestfinished', async request => {
    if (startTimes.has(request) && new URL(request.url()).pathname.startsWith('/api/')) requests.push({
      path: new URL(request.url()).pathname.replace(/\/work\/[^/]+/, '/work/:id'),
      ms: performance.now() - startTimes.get(request), startedMs: startTimes.get(request) - measuredAt,
      finishedMs: performance.now() - measuredAt, status: (await request.response())?.status(),
    });
  });
  await page.goto(origin);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: /^Choose game(?:$|:)/ }).click();
  await page.getByRole('heading', { name: 'Set the pace' }).waitFor();
  await page.getByRole('button', { name: /^Choose game(?:$|:)/ }).click();
  await page.locator('.game-option').filter({ hasText: 'Basic · Solo' }).click();
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  await page.locator('.trix-request-options button').filter({ hasText: 'Trix Jacks' }).click();
  await page.locator('.trix-layout').waitFor();
  await page.locator('.player-0.player-active').waitFor();
  const control = page.locator('.hand-card:not(:disabled)').first();
  await control.waitFor();
  const card = await control.getAttribute('data-hand-card');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');
  await page.evaluate(card => {
    window.handResponse = { card, frames: [], longTasks: [], running: true };
    const r = window.handResponse;
    document.addEventListener('click', e => {
      if (e.detail === 2 && e.target.closest('[data-hand-card]')?.dataset.handCard === card) r.activated = performance.now();
    }, true);
    new MutationObserver(() => {
      if (!r.activated) return;
      if (r.feedback === undefined && document.querySelector('.hand-drag-card')) r.feedback = performance.now() - r.activated;
      if (r.confirmed === undefined && !document.querySelector(`[data-hand-card="${card}"]`)) r.confirmed = performance.now() - r.activated;
    }).observe(document.body, { subtree: true, childList: true });
    new PerformanceObserver(list => r.longTasks.push(...list.getEntries().map(e => ({ start: e.startTime, ms: e.duration }))))
      .observe({ type: 'longtask' });
    let last;
    const frame = now => {
      if (!r.running) return;
      if (r.activated) {
        if (last) r.frames.push(now - last);
        if (r.painted === undefined && document.querySelector('.hand-drag-card')) r.painted = performance.now() - r.activated;
      }
      last = now; requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, card);
  measuredAt = performance.now(); measured = true;
  await control.dblclick();
  await page.locator(`[data-hand-card="${card}"]`).waitFor({ state: 'detached', timeout: 30_000 });
  await page.locator('.card-throw').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  measured = false;
  const timing = await page.evaluate(() => { window.handResponse.running = false; return window.handResponse; });
  const { profile } = await cdp.send('Profiler.stop');
  writeFileSync(resolve(output, 'chrome.cpuprofile'), JSON.stringify(profile));
  const frames = timing.frames.sort((a, b) => a - b);
  const report = { sample: 'one human Trix Jacks double-click; deterministic test deal; native Go/PostgreSQL test DB; production frontend',
    feedbackMs: timing.feedback, firstVisibleFrameMs: timing.painted, confirmedMs: timing.confirmed,
    frames: { count: frames.length, p95Ms: frames[Math.floor(frames.length * .95)], over50ms: frames.filter(x => x > 50).length },
    longTasks: timing.longTasks, requests, errors, chrome: browser.version(), provider: 'off; deterministic code' };
  writeFileSync(resolve(output, 'timing.json'), JSON.stringify(report, null, 2));
  await page.screenshot({ path: resolve(output, 'native-game.png') });
  console.log(JSON.stringify(report));
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  writeFileSync(resolve(output, 'failure.json'), JSON.stringify({ error: String(error),
    text: await page?.locator('body').innerText().catch(() => '') }, null, 2));
  await page?.screenshot({ path: resolve(output, 'failure.png') }).catch(() => undefined);
  throw error;
} finally {
  await browser?.close(); stop(); await closed;
}
