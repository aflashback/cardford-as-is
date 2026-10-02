// Actual DOM play against the server bots. No API action mutation, mock, screenshot, or engine player.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, renameSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createPool } from '../../../web/server/records/database.ts';
import { invoke, sha, transportConfig } from './transport.mjs';
import { verifyHand } from './verify-hand.mjs';

const directory = fileURLToPath(new URL('./', import.meta.url));
const recorderVersion = '1.0.4';
const read = name => JSON.parse(readFileSync(directory + name, 'utf8'));
const manifest = read('manifest.json');
const catalog = read('dev-deals.json');
assert.equal(sha(catalog), manifest.catalogHash);
const playerTemplate = readFileSync(directory + 'templates/player.md', 'utf8');
const observerTemplate = readFileSync(directory + 'templates/observer.md', 'utf8');
const rules = readFileSync(directory + 'templates/spades-rules.md', 'utf8');
for (const folder of ['runs', 'transport', 'public', 'private', 'cache', 'observer-jobs', 'revalidations']) mkdirSync(directory + folder, { recursive: true });
const save = (name, value) => { const path = directory + name; writeFileSync(path + '.tmp', JSON.stringify(value, null, 2) + '\n'); renameSync(path + '.tmp', path); };
const once = (name, value) => { assert.ok(!existsSync(directory + name), `Refusing to overwrite ${name}`); save(name, value); };
const log = text => console.log(`${new Date().toISOString()} ${text}`);
const selected = new Set(process.argv.slice(2));
for (const id of selected) assert.ok(manifest.runs.some(run => run.id === id), `Unknown run ${id}`);
const runs = manifest.runs.filter(run => selected.size === 0 || selected.has(run.id));
const registry = existsSync(directory + 'sessions.json') ? read('sessions.json') : { schemaVersion: 'browser-sessions-1.0.0', sessions: [] };
const contexts = new Map();
const seenViews = new Set();
let observerQueue = Promise.resolve();
const observerWorkers = [Promise.resolve(), Promise.resolve()];
let nextObserverWorker = 0;
const queuedObserverJobs = new Set();
let captureFailure = null;
const pendingResponses = new Set();
const modelConfig = { ...transportConfig, manifestHash: sha(manifest), playerTemplateHash: sha(playerTemplate), observerTemplateHash: sha(observerTemplate), rulesHash: sha(rules) };
if (existsSync(directory + 'transport/config.json')) assert.deepEqual(read('transport/config.json'), modelConfig);
else once('transport/config.json', modelConfig);
assert.ok(process.env.DATABASE_URL, 'An existing local DATABASE_URL is required for after-hand audit only.');
const pool = createPool(process.env.DATABASE_URL);

// Explicit allowlist: no lease, cookies, identity, entitlement, deal labels or coach advice reaches a model.
function publicView(view) {
  const g = view.game;
  return { gameId: g.id, revision: view.revision, decisionId: view.decisionId, source: view.source,
    game: Object.fromEntries(['mode', 'phase', 'hand', 'handCounts', 'bids', 'tricks', 'scores', 'bags', 'trick', 'history', 'turn', 'dealer', 'handNumber', 'spadesBroken', 'handResult', 'currentWinner', 'legalActions'].map(key => [key, g[key]])), stats: { ...view.stats } };
}
function packetFor(view) {
  const g = view.game;
  return { game: g.mode, ruleProfile: g.mode === 'spades-solo' ? 'spades-solo-training-1.0.0' : 'spades-training-1.0.0', seat: 0, dealer: g.dealer, phase: g.phase,
    competition: g.mode === 'spades-solo' ? [[0], [1], [2], [3]] : [[0, 2], [1, 3]], hand: g.hand, handSizes: g.handCounts, bids: g.bids, tricks: g.tricks, scores: g.scores, bags: g.bags,
    completedTricks: g.history, currentTrick: g.trick, spadesBroken: g.spadesBroken, legalActions: g.legalActions.map(actionId) };
}
function actionId(a) { return a.kind === 'bid' ? `bid:${a.bid}` : `play:${a.card}`; }
function capture(view, arm, path) {
  if (!view?.game?.id || !Number.isInteger(view.revision)) return;
  let entry = registry.sessions.find(item => item.gameId === view.game.id);
  if (!entry) {
    const intent = registry.pendingStart;
    const run = intent?.arm === arm && intent.previousGameId !== view.game.id ? manifest.runs.find(r => r.id === intent.runId) : null;
    entry = { gameId: view.game.id, mode: view.game.mode, arm, role: run ? 'measured' : 'bootstrap', runId: run?.id ?? null, createdAt: new Date().toISOString() };
    registry.sessions.push(entry);
    if (registry.navigationReservation?.arm === arm) delete registry.navigationReservation;
    save('sessions.json', registry);
    assert.ok(registry.sessions.length <= manifest.limits.maxCreated, 'Total session cap exceeded');
    assert.ok(registry.sessions.filter(item => item.mode === entry.mode).length <= manifest.limits.maxCreatedPerMode, 'Mode session cap exceeded');
    if (!run) assert.equal(registry.sessions.filter(item => item.arm === arm && item.role === 'bootstrap').length, 1, 'Unexpected new bootstrap identity');
  }
  const key = `${view.game.id}:${view.revision}`;
  if (!seenViews.has(key)) {
    seenViews.add(key);
    appendFileSync(directory + `public/${arm}-views.jsonl`, JSON.stringify({ observedAt: new Date().toISOString(), path, ...publicView(view) }) + '\n');
  }
}
async function current(page, arm) {
  if (captureFailure) throw captureFailure;
  const view = await page.evaluate(async () => {
    const response = await fetch('/api/session', { credentials: 'same-origin', headers: { 'x-tricks-tab': sessionStorage.getItem('tricks-tab') || '' } });
    if (!response.ok) throw Error(`Session GET ${response.status}`);
    return response.json();
  });
  capture(view, arm, '/api/session'); return view;
}
async function until(predicate, description, timeout = 45_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { const result = await predicate(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 200)); }
  throw Error(`Timed out: ${description}`);
}
async function pageFor(arm) {
  if (contexts.has(arm)) return contexts.get(arm);
  assert.ok(!registry.navigationReservation, 'Unresolved browser navigation: reconcile its possible bootstrap before navigating again');
  // GET /api/session can create one automatic Partners opening. Reserve capacity first.
  assert.ok(registry.sessions.length < manifest.limits.maxCreated, 'No capacity to navigate safely');
  assert.ok(registry.sessions.filter(s => s.mode === 'spades-partners').length < manifest.limits.maxCreatedPerMode, 'No Partners capacity to navigate safely');
  const context = await chromium.launchPersistentContext(join(tmpdir(), 'cardford-browser-baseline-v1', arm), { channel: 'chrome', headless: false, viewport: { width: 1440, height: 900 }, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  if (registry.sessions.some(s => s.arm === arm)) {
    assert.ok((await context.cookies()).some(c => c.name === 'tc_session'), 'Saved browser identity is missing; refuse an unplanned new bootstrap');
  }
  registry.navigationReservation = { arm, createdAt: new Date().toISOString() }; save('sessions.json', registry);
  const page = context.pages()[0] ?? await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on('pageerror', error => appendFileSync(directory + 'browser-errors.jsonl', JSON.stringify({ arm, at: new Date().toISOString(), message: error.message }) + '\n'));
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (!['/api/session', '/api/sessions', '/api/session/actions', '/api/session/advance', '/api/preferences'].includes(path)) return;
    const task = (async () => {
      if (response.ok()) capture(await response.json(), arm, path);
      else {
        const error = await response.json().catch(() => null);
        appendFileSync(directory + 'browser-errors.jsonl', JSON.stringify({ arm, at: new Date().toISOString(), path, status: response.status(), code: error?.error?.code ?? null, message: error?.error?.message ?? null }) + '\n');
      }
    })().catch(error => { captureFailure = error; log(`CAPTURE_ERROR ${error.message}`); }).finally(() => pendingResponses.delete(task));
    pendingResponses.add(task);
  });
  await page.goto(`http://127.0.0.1:${arm === 'baseline' ? 4191 : 4192}`);
  await until(async () => (await page.getByRole('dialog', { name: 'Paused', exact: true }).count()) > 0, 'initial pause');
  const value = { context, page }; contexts.set(arm, value);
  await current(page, arm);
  delete registry.navigationReservation; save('sessions.json', registry);
  return value;
}
async function choose(page, run) {
  const before = await current(page, run.arm);
  const existing = registry.sessions.find(item => item.runId === run.id);
  if (existing) {
    assert.equal(before.game.id, existing.gameId, 'Saved run is not active; do not create a replacement game');
    if (await page.getByRole('button', { name: 'Resume', exact: true }).count()) await page.getByRole('button', { name: 'Resume', exact: true }).click();
    if ((await current(page, run.arm)).controlLeaseToken === 'view-only') {
      const recap = page.getByRole('dialog', { name: 'Hand 1 results', exact: true });
      const restoreRecap = await recap.isVisible();
      if (restoreRecap) await recap.getByRole('button', { name: 'Back to table', exact: true }).click();
      await page.getByRole('button', { name: 'Take control', exact: true }).click();
      await until(async () => (await current(page, run.arm)).controlLeaseToken !== 'view-only', 'browser control lease');
      if (restoreRecap) {
        await page.reload();
        await page.getByRole('button', { name: 'Resume', exact: true }).click();
        await recap.waitFor({ state: 'visible' });
        const restored = await current(page, run.arm);
        assert.equal(restored.game.id, before.game.id); assert.equal(restored.revision, before.revision);
        assert.notEqual(restored.controlLeaseToken, 'view-only');
      }
    }
    if ((await current(page, run.arm)).preferences.coachMode !== 'after') await quietCoach(page, run.arm);
    if (registry.pendingStart?.runId === run.id) { delete registry.pendingStart; save('sessions.json', registry); }
    return before;
  }
  assert.ok(!registry.pendingStart, 'Unresolved start intent; reconcile the existing server session before another start');
  assert.ok(registry.sessions.length < manifest.limits.maxCreated);
  assert.ok(registry.sessions.filter(item => item.mode === run.mode).length < manifest.limits.maxCreatedPerMode);
  if (before.controlLeaseToken === 'view-only') {
    assert.ok(['hand-end', 'match-end'].includes(before.game.phase), 'Do not resume an unfinished other game while acquiring replacement control');
    const resume = page.getByRole('button', { name: 'Resume', exact: true });
    const back = page.getByRole('button', { name: 'Back to table', exact: true });
    if (await resume.count()) {
      await resume.click();
      await back.waitFor({ state: 'visible' });
    }
    if (await back.count()) {
      await back.click();
      await back.waitFor({ state: 'hidden' });
    }
    await page.getByRole('button', { name: 'Take control', exact: true }).click();
    await until(async () => (await current(page, run.arm)).controlLeaseToken !== 'view-only', 'control before replacing completed table');
    assert.equal((await current(page, run.arm)).revision, before.revision);
  }
  if (await page.getByRole('button', { name: 'Choose another game', exact: true }).count()) await page.getByRole('button', { name: 'Choose another game', exact: true }).click();
  else {
    if (await page.getByRole('button', { name: 'Back to table', exact: true }).count()) await page.getByRole('button', { name: 'Back to table', exact: true }).click();
    await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  }
  await page.getByRole('button', { name: '1.4×', exact: true }).click();
  await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  await page.getByLabel('Practice deal').selectOption(run.scenarioId);
  registry.pendingStart = { runId: run.id, arm: run.arm, mode: run.mode, previousGameId: before.game.id, createdAt: new Date().toISOString() }; save('sessions.json', registry);
  await page.locator('.game-option').filter({ has: page.locator(`.game-art-${run.mode}`) }).click();
  const fresh = await until(async () => { const v = await current(page, run.arm); return v.game.id !== before.game.id ? v : false; }, 'selected game commit');
  assert.equal(fresh.scenario?.id, run.scenarioId);
  assert.equal(fresh.game.mode, run.mode);
  await until(async () => (await page.getByRole('main', { name: 'New game setup' }).count()) === 0, 'setup closed');
  await quietCoach(page, run.arm);
  delete registry.pendingStart; save('sessions.json', registry);
  return fresh;
}
async function quietCoach(page, arm) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'After the hand', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await until(async () => (await current(page, arm)).preferences.coachMode === 'after', 'quiet coach preference');
}
function parseChoice(text, packet) {
  const match = text.trim().match(/^(BID: (?:[0-9]|1[0-3])|PLAY: [CDHS](?:[2-9]|10|J|Q|K|A))(?:[ \t]*\r?\n(?:[ \t]*\r?\n)*|[ \t]+(?:[—–-][ \t]+)?)([^\r\n]+)$/);
  assert.ok(match, 'Expected one bid/card and one reasoning paragraph');
  assert.ok(!/(?:^|\s)(?:BID|PLAY):/.test(match[2]), 'Additional action in player response');
  const [kind, value] = match[1].split(': ');
  const action = kind === 'BID' ? { kind: 'bid', bid: Number(value) } : { kind: 'play', card: value };
  assert.ok(packet.legalActions.includes(actionId(action)), 'Illegal player choice');
  return { action, reason: match[2] };
}
async function playerChoice(run, view, index) {
  const packet = packetFor(view), packetHash = sha(packet);
  if (view.game.legalActions.length === 1) return { packet, packetHash, action: view.game.legalActions[0], reason: 'Only legal action.', source: 'forced', transportFile: null };
  const prompt = `${playerTemplate}\n${rules}\n\nCurrent seat packet:\n${JSON.stringify(packet)}`;
  const cacheName = `cache/${sha(prompt)}.json`;
  if (existsSync(directory + cacheName)) return { ...read(cacheName), source: 'reused-identical-packet' };
  // Formatting repair only: first usable original response on this exact packet.
  // Prior acceptance/rejection records remain immutable, with no additional attempt.
  const originals = readdirSync(directory + 'transport').filter(name => name.includes('-player-') && name.endsWith('.json'))
    .map(name => ({ file: `transport/${name}`, value: read(`transport/${name}`) }))
    .filter(({ value }) => value.promptHash === sha(prompt) && value.validTransport && value.accepted === false)
    .sort((a, b) => a.value.metadata.startedAt.localeCompare(b.value.metadata.startedAt));
  for (const { file, value: original } of originals) {
    let parsed;
    try { parsed = parseChoice(original.response, packet); } catch { continue; }
    const recovery = `revalidations/${sha(prompt)}.json`;
    if (existsSync(directory + recovery)) {
      assert.equal(read(recovery).original, file); assert.deepEqual(read(recovery).action, parsed.action);
    } else once(recovery, { recorderVersion, original: file, originalAccepted: false, promptHash: sha(prompt), packetHash,
      action: parsed.action, rule: 'Earliest transport-valid response with one legal action and one paragraph; accept inline separators.', at: new Date().toISOString() });
    const value = { packet, packetHash, ...parsed, source: 'luna', transportFile: file, formatRecovery: recovery };
    once(cacheName, value); log(`FORMAT_RECOVERY ${run.id} player ${index}`); return value;
  }
  const attemptsName = `cache/${sha(prompt)}-attempts.json`;
  const pastAttempts = existsSync(directory + attemptsName) ? read(attemptsName).count : 0;
  for (let attempt = pastAttempts + 1; attempt <= 2; attempt++) {
    save(attemptsName, { count: attempt, promptHash: sha(prompt), reservedAt: new Date().toISOString() });
    const file = `transport/${run.id}-player-${String(index).padStart(2, '0')}-${Date.now()}-${attempt}.json`;
    const result = await invoke(prompt, 'player');
    let choice = null, rejection = null;
    try { assert.ok(result.validTransport, 'Agent transport rejected'); choice = parseChoice(result.response, packet); } catch (error) { rejection = error.message; }
    once(file, { ...result, runId: run.id, index, packetHash, accepted: !!choice, rejection });
    if (choice) { const value = { packet, packetHash, ...choice, source: 'luna', transportFile: file }; once(cacheName, value); return value; }
    log(`REJECT ${run.id} player ${index}: ${rejection}`);
  }
  throw Error('No valid player choice; position retained with no substitute move.');
}
function enqueueObserver(run, stage, packet) {
  const job = { runId: run.id, stage, packet, capturedAt: new Date().toISOString() };
  const jobName = `observer-jobs/${run.id}-${stage}.json`;
  if (!existsSync(directory + jobName)) once(jobName, job);
  queueObserverJob(read(jobName));
}
function queueObserverJob(job) {
  const { runId, stage, packet } = job;
  const name = `transport/${runId}-observer-${stage}.json`;
  if (existsSync(directory + name) || queuedObserverJobs.has(name)) return;
  queuedObserverJobs.add(name);
  const prompt = `${observerTemplate}\n${rules}\n\n${stage === 'retrospective' ? 'AFTER HAND: private seat observations may now be audited.' : 'DURING HAND: public information and South hand only.'}\n${JSON.stringify(packet)}`;
  const worker = nextObserverWorker++ % observerWorkers.length;
  observerWorkers[worker] = observerWorkers[worker].then(async () => {
    const result = await invoke(prompt, 'observer');
    let parsed = null, rejection = null;
    try { assert.ok(result.validTransport); parsed = JSON.parse(result.response.replace(/^```json\s*|\s*```$/g, '')); assert.ok(Array.isArray(parsed.observations)); assert.ok(Array.isArray(parsed.openQuestions)); assert.equal(typeof parsed.summary, 'string'); }
    catch { rejection = 'Invalid observer transport or JSON; no judgment accepted.'; }
    once(name, { ...result, runId, stage, packetCapturedAt: job.capturedAt, accepted: !rejection, parsed, rejection });
    log(`OBSERVER ${runId} ${stage} ${rejection ? 'rejected' : 'saved'}`);
  });
  observerQueue = Promise.all(observerWorkers);
}
const cardLabel = card => `${({ A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack' })[card.slice(1)] ?? card.slice(1)} of ${({ C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades' })[card[0]]}`;
async function clickChoice(page, view, action, beforeCommit) {
  const dom = { at: new Date().toISOString(), gameId: view.game.id, revision: view.revision, decisionId: view.decisionId, action, input: 'real DOM click' };
  if (action.kind === 'bid') {
    const output = page.locator('.bid-selector output');
    const value = await output.textContent(); let bid = value === 'Nil' ? 0 : Number(value);
    assert.ok(Number.isInteger(bid));
    while (bid !== action.bid) { await page.getByRole('button', { name: bid < action.bid ? 'Increase bid' : 'Decrease bid', exact: true }).click(); bid += bid < action.bid ? 1 : -1; }
    const button = page.getByRole('button', { name: action.bid === 0 ? 'Bid Nil' : `Bid ${action.bid}`, exact: true });
    dom.selector = `button:${action.bid === 0 ? 'Bid Nil' : `Bid ${action.bid}`}`; dom.enabled = await button.isEnabled(); assert.ok(dom.enabled); beforeCommit(dom); await button.click();
  } else {
    const label = cardLabel(action.card), button = page.getByRole('button', { name: label, exact: true });
    dom.selector = `button:${label}`; dom.enabled = await button.isEnabled(); assert.ok(dom.enabled); beforeCommit(dom); await button.dblclick();
  }
  return dom;
}
async function privateAudit(run, terminal, playerRecord) {
  assert.ok(['hand-end', 'match-end'].includes(terminal.game.phase), 'Private audit is after hand only');
  const result = await pool.query('SELECT revision,document FROM games WHERE id=$1', [terminal.game.id]);
  assert.equal(result.rows.length, 1);
  const { document: doc, revision } = result.rows[0];
  assert.equal(doc.reasoningPolicy.policyVersion, run.policy);
  assert.deepEqual(doc.state.history, terminal.game.history);
  assert.deepEqual(doc.state.scores, terminal.game.scores);
  assert.equal(Object.keys(doc.botDecisionAudits).length, 42);
  assert.equal(Object.keys(doc.decisionAnalyses).length, 14);
  assert.equal(doc.actions.filter(item => item.kind === 'action').length, 56);
  // Explicit allowlist; control tokens and player identity never go into artifacts.
  const audit = { schemaVersion: 'browser-private-audit-1.0.0', runId: run.id, gameId: terminal.game.id, capturedAfterHand: true, revision,
    reasoningPolicy: doc.reasoningPolicy, openingScenario: doc.openingScenario, deals: doc.deals, state: doc.state, actions: doc.actions,
    botDecisionAudits: doc.botDecisionAudits, decisionAnalyses: doc.decisionAnalyses, humanDecisions: doc.decisions.map(d => ({ id: d.id, handNumber: d.handNumber, action: d.action, assisted: d.assisted, observation: d.observation })) };
  const file = `private/${run.id}.json`;
  if (existsSync(directory + file)) assert.deepEqual(read(file), audit); else once(file, audit);
  const verification = verifyHand(run, audit, playerRecord, catalog);
  // Predeclared bounded retrospective sample: case matches, then bids, then chronological first moves.
  const entries = Object.values(doc.botDecisionAudits).sort((a, b) => a.revision - b.revision);
  const caseEntries = entries.filter(e => e.analysis?.trace?.scenarioChecks?.some(c => c.id.startsWith('CASE-') && c.result === 'matched'));
  const selected = [...new Map([...caseEntries, ...entries.filter(e => e.action.kind === 'bid'), ...entries].map(e => [e.decisionId, e])).values()].slice(0, 8);
  enqueueObserver(run, 'retrospective', { result: packetFor(terminal), selection: 'At most eight original bot decisions: matched cases first, bids second, then chronological moves. Full audits retained separately.', decisions: selected.map(e => ({ decision: e.decisionId, seat: e.seat, action: e.action, observation: e.observation, reasons: e.analysis?.reasons, policyDecision: e.analysis?.decision })) });
  return { file, hash: sha(audit), botDecisions: entries.length, humanDecisions: Object.keys(doc.decisionAnalyses).length, verification };
}
function committedPending(pending, view) {
  if (view.revision <= pending.before.revision) return false;
  const action = pending.action;
  if (action.kind === 'bid') return view.game.bids[0] === action.bid;
  return [...view.game.history.flatMap(t => t.plays), ...view.game.trick].some(p => p.seat === 0 && p.card === action.card);
}
async function reviewCoach(page, run, record) {
  const audit = read(record.privateAudit.file);
  const saved = audit.humanDecisions;
  let index = saved.findIndex(d => audit.decisionAnalyses[d.id].analysis.scenarioIds.some(id => id.startsWith('CASE-')) && audit.decisionAnalyses[d.id].analysis.provenance !== 'forced');
  if (index < 0) index = 1;
  const id = saved[index].id, expected = audit.decisionAnalyses[id].adviceSnapshot;
  await page.getByRole('button', { name: 'Back to table', exact: true }).click();
  await page.getByRole('button', { name: 'Review current game', exact: true }).click();
  await until(async () => (await page.locator('.review-choices button').count()) === 14, 'saved review choices');
  await page.locator('.review-choices button').nth(index).click();
  const button = page.getByRole('button', { name: 'Show original coach advice', exact: true });
  await button.waitFor({ state: 'visible' });
  const response = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/coaching/hand-unlocks');
  await button.click();
  const region = page.getByRole('region', { name: 'Original coach advice', exact: true });
  const unlock = page.getByRole('button', { name: 'Use coached hand', exact: true });
  await until(async () => (await unlock.isVisible()) || (await region.getByRole('heading', { name: 'Advice at your decision', exact: true }).isVisible()), 'original coach display or confirmation');
  if (await unlock.isVisible()) await unlock.click();
  const received = await (await response).json();
  assert.equal(received.advice.decisionId, id);
  assert.equal(audit.decisionAnalyses[id].analysis.policyVersion, run.policy);
  assert.equal(received.advice.policyVersion, expected.cueVersion === undefined ? undefined : run.policy);
  const text = await region.locator('p').allTextContents();
  assert.deepEqual(text, [`${expected.focus}: ${expected.notice}`, expected.reason, expected.suggestion]);
  for (const key of ['focus', 'notice', 'reason', 'suggestion']) assert.equal(received.advice[key], expected[key]);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  const after = await current(page, run.arm);
  assert.equal(after.revision, record.terminal.revision); assert.equal(after.stats.helped, 0);
  return { decisionId: id, index, policyVersion: run.policy, publicPolicyVersion: received.advice.policyVersion ?? null, cueVersion: expected.cueVersion ?? null, recorderVersion, text, originalSnapshotMatches: true, historyUnchanged: true, duringPlayAssistance: 0 };
}
async function play(run) {
  const filename = `runs/${run.id}.json`;
  let record = existsSync(directory + filename) ? read(filename) : { schemaVersion: 'browser-hand-1.0.0', ...run, status: 'not-started', playerDecisions: [], observerCheckpoints: [] };
  if (record.status === 'complete') { log(`SKIP complete ${run.id}`); return; }
  record.recorderRevisions = [...new Set([...(record.recorderRevisions ?? (record.playerDecisions.length ? ['1.0.0'] : [])), recorderVersion])];
  const { page } = await pageFor(run.arm);
  const opening = await choose(page, run);
  record = { ...record, gameId: opening.game.id, status: 'in-progress', startedAt: record.startedAt ?? new Date().toISOString() }; save(filename, record);
  if (record.pendingDecision) {
    const currentView = await current(page, run.arm), pending = record.pendingDecision;
    if (committedPending(pending, currentView)) {
      assert.ok(pending.dom?.enabled, 'Committed choice lacks saved pre-click DOM evidence');
      record.playerDecisions.push({ ...pending, acceptedRevision: currentView.revision, recoveredAfterInterruption: true });
      delete record.pendingDecision; save(filename, record);
    } else assert.equal(currentView.revision, pending.before.revision, 'Unresolved pending action; no substitute');
  }
  log(`START ${run.id} game=${record.gameId}`);
  while (true) {
    const view = await until(async () => { const v = await current(page, run.arm); assert.equal(v.game.id, record.gameId); return ['hand-end', 'match-end'].includes(v.game.phase) || (v.game.turn === 0 && v.game.legalActions.length) ? v : false; }, 'South turn or hand end');
    assert.equal(view.stats.helped, 0); assert.equal(view.stats.suggestions, 0);
    if (['hand-end', 'match-end'].includes(view.game.phase)) {
      assert.equal(view.game.history.length, 13);
      await until(async () => (await page.getByRole('dialog', { name: 'Hand 1 results', exact: true }).count()) > 0, 'real recap');
      record.terminal = publicView(view); record.privateAudit = await privateAudit(run, view, record); save(filename, record);
      record.coachUiCheck = await reviewCoach(page, run, record);
      record.status = 'complete'; record.completedAt = new Date().toISOString(); save(filename, record);
      log(`COMPLETE ${run.id} bids=${view.game.bids} tricks=${view.game.tricks} scores=${view.game.scores}`); return;
    }
    for (const point of [3, 7, 11]) if (view.game.history.length >= point && !record.observerCheckpoints.includes(point)) {
      enqueueObserver(run, `trick-${point}`, { throughTrick: view.game.history.length, packet: packetFor(view) }); record.observerCheckpoints.push(point); save(filename, record);
    }
    const choice = record.pendingDecision ?? await playerChoice(run, view, record.playerDecisions.length + 1);
    const fresh = await current(page, run.arm); assert.equal(fresh.revision, view.revision, 'Table changed while player reasoned');
    assert.equal(fresh.game.id, view.game.id); assert.equal(fresh.game.turn, 0);
    record.pendingDecision = { ...choice, recorderVersion, index: record.playerDecisions.length + 1, before: publicView(view), dom: null }; save(filename, record);
    const dom = await clickChoice(page, view, choice.action, dom => { record.pendingDecision.dom = dom; save(filename, record); });
    const accepted = await until(async () => { const v = await current(page, run.arm); return v.revision > view.revision ? v : false; }, 'clicked action accepted');
    if (choice.action.kind === 'bid') assert.equal(accepted.game.bids[0], choice.action.bid); else assert.ok(!accepted.game.hand.includes(choice.action.card));
    record.playerDecisions.push({ ...record.pendingDecision, dom, acceptedRevision: accepted.revision }); delete record.pendingDecision; save(filename, record);
    log(`PLAY ${run.id} ${record.playerDecisions.length}/14 ${actionId(choice.action)} ${choice.source}`);
  }
}
try {
  for (const name of readdirSync(directory + 'observer-jobs').filter(name => name.endsWith('.json'))) queueObserverJob(read(`observer-jobs/${name}`));
  for (const run of runs) await play(run);
  await observerQueue; await Promise.all(pendingResponses);
  log(`FINISHED ${runs.length} planned runs; total sessions recorded=${registry.sessions.length}`);
} catch (error) {
  for (const [arm, { page }] of contexts) {
    const diagnostics = await page.evaluate(() => ({ url: location.href,
      dialogs: [...document.querySelectorAll('[role="dialog"]')].map(e => ({ label: e.getAttribute('aria-label'), text: e.textContent })),
      buttons: [...document.querySelectorAll('button')].map(e => ({ label: e.getAttribute('aria-label') ?? e.textContent, disabled: e.disabled, visible: e.getClientRects().length > 0, hiddenAncestor: !!e.closest('[aria-hidden="true"]') })),
      alerts: [...document.querySelectorAll('[role="alert"]')].map(e => e.textContent) })).catch(e => ({ unavailable: e.message }));
    save(`provenance/dom-interruption-${Date.now()}-${arm}.json`, diagnostics);
  }
  save('interruption.json', { at: new Date().toISOString(), message: error.message, stack: error.stack, sessions: registry.sessions.length });
  log(`STOP ${error.message}`); process.exitCode = 1;
  await observerQueue;
} finally {
  for (const { context } of contexts.values()) await context.close();
  await pool.end();
}
