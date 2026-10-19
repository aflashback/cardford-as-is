// Chrome DevTools Protocol gameplay trace + Lighthouse navigation audit.
// Use an isolated Chrome profile; never attach to the owner's game/browser.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';

const [label = 'after', origin = 'http://127.0.0.1:4176'] = process.argv.slice(2);
if (!['before', 'after'].includes(label) || !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))
  throw Error('Use profile-card-table.mjs before|after http://127.0.0.1:PORT.');
const output = resolve(`qa/implementation/trix/ui-performance/${label}`);
mkdirSync(output, { recursive: true });
const port = await new Promise(done => {
  const server = createServer();
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => done(port)); });
});
const context = await chromium.launchPersistentContext(resolve(`.local/ui-perf-browser-${label}-${Date.now()}`), {
  channel: 'chrome', headless: true, viewport: { width: 1280, height: 800 },
  args: [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'],
});
const page = context.pages()[0], errors = [], requests = [], failedRequests = [];
let stage = 'opening';
try {
  const startTimes = new WeakMap();
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => failedRequests.push({path: new URL(request.url()).pathname, error: request.failure()?.errorText}));
  page.on('request', request => startTimes.set(request, performance.now()));
  page.on('requestfinished', async request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) requests.push({
      path: new URL(request.url()).pathname, ms: performance.now() - startTimes.get(request),
      status: (await request.response())?.status(),
    });
  });
  await page.goto(origin);
  const resume = page.getByRole('button', { name: 'Resume', exact: true });
  await resume.waitFor({ state: 'visible', timeout: 30_000 });
  await resume.click();
  await page.getByRole('button', { name: /^Choose game(?:$|:)/ }).click();
  stage = 'choosing Trix';
  await page.getByRole('heading', { name: 'Set the pace' }).waitFor();
  await page.getByRole('button', { name: /^Choose game(?:$|:)/ }).click();
  await page.locator('.game-option').filter({ hasText: 'Basic · Solo' }).click();
  await page.locator('.trix-app').waitFor();
  const trixResume = page.getByRole('button', { name: 'Resume game', exact: true });
  await trixResume.waitFor({ state: 'visible', timeout: 15_000 });
  await trixResume.click();
  await page.locator('.trix-request-options button:enabled,.trix-double-picker .primary-button:enabled,.trix-hand-card:not(:disabled),.you-active')
    .first().waitFor({state:'visible',timeout:30_000});
  stage = 'gameplay';

  const cdp = await context.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');
  await cdp.send('Tracing.start', {
    categories: 'devtools.timeline,v8,blink.user_timing,disabled-by-default-devtools.timeline.frame',
    transferMode: 'ReturnAsStream',
  });
  await page.evaluate(() => {
    window.__tablePerf = { frames: [], longTasks: [], running: true };
    let last = performance.now();
    const frame = now => { if (!window.__tablePerf.running) return; window.__tablePerf.frames.push(now - last); last = now; requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
    new PerformanceObserver(list => window.__tablePerf.longTasks.push(...list.getEntries().map(e => ({ start: e.startTime, ms: e.duration }))))
      .observe({ type: 'longtask', buffered: true });
  });
  // Exercise real UI actions and normal code bots for a bounded 30-second sample.
  const started = performance.now();
  let humanActions = 0, pauseCycles = 0;
  while (performance.now() - started < 30_000) {
    const request = page.locator('.trix-request-options button').first();
    const double = page.locator('.trix-double-cards button,.trix-app .hand-card:not(:disabled)').first();
    const confirm = page.locator('.trix-double-picker .primary-button');
    const hand = page.locator('.hand-card:not(:disabled),.trix-hand-card:not(:disabled)').first();
    const isHumanTurn = await page.locator('.you-active').isVisible() ||
      (await page.locator('.trix-hand-card:not(:disabled)').count()) > 0;
    if (await request.isVisible() && await request.isEnabled()) { await request.click({ timeout: 1000 }); humanActions++; }
    else if (await confirm.isVisible() && await confirm.isEnabled()) {
      if (await double.isVisible()) await double.click();
      await confirm.click(); humanActions++;
    } else if (isHumanTurn && await hand.isVisible() && await hand.isEnabled()) { await hand.dblclick(); humanActions++; }
    if (pauseCycles < 2 && performance.now() - started > (pauseCycles + 1) * 9000) {
      const pause = page.getByRole('button', { name: /^(Pause|Pause game)$/ });
      if (await pause.isVisible()) {
        await pause.click();
        const resumeGame = page.getByRole('button', { name: 'Resume game', exact: true });
        const beforeResume = performance.now();
        await resumeGame.click();
        await page.locator('.trix-app .hand-card,.trix-hand-card').first().waitFor();
        requests.push({ path: 'UI resume response', ms: performance.now() - beforeResume });
        pauseCycles++;
      }
    }
    await page.waitForTimeout(180);
  }
  const { profile } = await cdp.send('Profiler.stop');
  writeFileSync(resolve(output, 'chrome.cpuprofile'), JSON.stringify(profile));
  const completed = new Promise(done => cdp.once('Tracing.tracingComplete', done));
  await cdp.send('Tracing.end');
  const { stream } = await completed;
  let trace = '';
  for (;;) { const chunk = await cdp.send('IO.read', { handle: stream }); trace += chunk.data; if (chunk.eof) break; }
  await cdp.send('IO.close', { handle: stream });
  writeFileSync(resolve(output, 'chrome-trace.json.gz'), gzipSync(trace));
  const timing = await page.evaluate(() => { window.__tablePerf.running = false; return window.__tablePerf; });
  const sorted = timing.frames.slice(5).sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * .95)] ?? 0;
  const state = await page.evaluate(async () => {
    const response = await fetch('/api/platform/session', {headers: {'x-tricks-tab':sessionStorage.getItem('tricks-tab')}});
    return {status:response.status, ok:response.ok, view:await response.json()};
  });
  const view = state.view;
  const confirmed = requests.filter(r => r.status === 200 && ['/api/session/actions','/api/session/advance'].includes(r.path)).length;
  const report = {
    label, origin, chrome: context.browser().version(), viewport: page.viewportSize(),
    sampleMs: performance.now() - started, humanActions, confirmedCommands:confirmed, pauseCycles, errors, failedRequests,
    frames: { count: sorted.length, p95Ms: p95, over50ms: sorted.filter(ms => ms > 50).length },
    longTasks: timing.longTasks, requests,
    finalPhase: view.session?.view.phase, finalStateStatus:state.status,
    validGameplaySample: humanActions > 1 && confirmed > 3 && pauseCycles === 2 && state.ok,
    provider: 'off; deterministic code',
  };
  await page.screenshot({ path: resolve(output, 'gameplay.png') });
  writeFileSync(resolve(output, 'gameplay.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ label, gameplay: { frames: report.frames, longTasks: timing.longTasks.length, errors, humanActions, pauseCycles } }));

  stage = 'lighthouse';
  const { default: lighthouse, snapshot, generateReport } = await import(pathToFileURL(resolve('.local/ui-perf-tools/node_modules/lighthouse/core/index.js')).href);
  const requirePerf = createRequire(pathToFileURL(resolve('.local/ui-perf-tools/node_modules/lighthouse/package.json')));
  const puppeteer = requirePerf('puppeteer-core');
  const attached = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}` });
  try {
    const activePage = (await attached.pages()).find(p => p.url().startsWith(origin));
    if (!activePage) throw Error('Active Trix page is missing for the Lighthouse snapshot.');
    const active = await snapshot(activePage, { flags: {
      onlyCategories: ['accessibility', 'best-practices'], formFactor: 'desktop', logLevel: 'error',
      screenEmulation: {mobile:false,width:1280,height:800,deviceScaleFactor:1,disabled:true},
    } });
    writeFileSync(resolve(output,'lighthouse-active.html'), generateReport(active.lhr));
    writeFileSync(resolve(output,'lighthouse-active.json'), JSON.stringify(active.lhr,null,2));
    console.log(JSON.stringify({label, activeTable:Object.fromEntries(Object.entries(active.lhr.categories).map(([id,item]) => [id,item.score]))}));
  } finally { await attached.disconnect(); }
  const result = await lighthouse(origin, {
    port, output: ['html', 'json'], onlyCategories: ['performance', 'accessibility', 'best-practices'],
    formFactor: 'desktop', screenEmulation: { mobile: false, width: 1280, height: 800, deviceScaleFactor: 1, disabled: false },
    throttlingMethod: 'provided', disableStorageReset: true, logLevel: 'error',
  });
  writeFileSync(resolve(output, 'lighthouse.html'), result.report[0]);
  writeFileSync(resolve(output, 'lighthouse.json'), result.report[1]);
  console.log(JSON.stringify({ label, lighthouse: Object.fromEntries(Object.entries(result.lhr.categories).map(([id, item]) => [id, item.score])), runtimeError: result.lhr.runtimeError ?? null }));
} catch (error) {
  await page.screenshot({path:resolve(output,'failure.png')}).catch(() => undefined);
  writeFileSync(resolve(output,'failure.json'), JSON.stringify({stage, error:String(error), errors, failedRequests,
    text: await page.locator('body').innerText().catch(() => ''), requests}, null, 2));
  throw error;
} finally { await context.close(); }
