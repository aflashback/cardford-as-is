import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { closeReviewedCollectionBatch, collectionReport, runFullCampaign } from '../../scripts/trix-scenario-collection/campaign-driver.mjs';
import { appendEvent, readJournal, sha } from '../../scripts/trix-scenario-collection/journal.mjs';

function fixture(t, { initial = 1, players = 1, allReviewed = false, invalidAttempts = 0, providerFailure = false, trustFailure = false, importFailure = false, operatorPause = false, forcedComplete = false } = {}) {
  const scratch = resolve('.local/evaluation/trix-scenarios/bridge-capability'); mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'campaign-driver-test-'));
  t.after(() => { assert.ok(root.startsWith(scratch)); rmSync(root, { recursive: true, force: true }); });
  appendEvent(root, 'initialized', {});
  const phases = [
    { variant: 'basic-solo', maxCompletedRequests: 32, maxRequestsPerContract: 8, requests: ['diamonds', 'king', 'queens', 'lutoosh'], targetCases: 1 },
    { variant: 'complex-solo', maxCompletedRequests: 32, maxRequestsPerContract: 32, requests: ['complex'], targetCases: 1 },
    { variant: 'basic-partners', maxCompletedRequests: 32, maxRequestsPerContract: 8, requests: ['diamonds', 'king', 'queens', 'lutoosh'], targetCases: 1 },
    { variant: 'complex-partners', maxCompletedRequests: 64, maxRequestsPerContract: 64, requests: ['complex'], targetCases: 1 },
  ];
  const schedule = phases.flatMap(p => Array.from({ length: p.maxCompletedRequests }, (_, i) => ({ episodeId: `${p.variant}-${i}`, variant: p.variant, request: p.requests[i % p.requests.length] })));
  const outcomes = schedule.slice(0, initial), commits = outcomes.map(o => ({ ...o, decisionId: `${o.episodeId}:one` }));
  const oldReviews = allReviewed ? outcomes.flatMap(o => [{ stage: 'decision', subjectId: `${o.episodeId}:one` }, { stage: 'game', subjectId: o.episodeId }]) : [];
  const processingAudit = { originalSourceDigest: 'a'.repeat(64), reviewSourceDigest: 'b'.repeat(64), nativeBinaryDigest: 'c'.repeat(64) };
  const inventory = { schemaVersion: 'trix-host-base-context-admission-1.0.0', approvedDigests: ['d'.repeat(64)] };
  const actions = [], jobs = new Map(), preflightJobs = [], imported = [], hostChecks = [];
  let episode = null, claimed = null, pending = null, playerCalls = 0, reviewCalls = 0, attempts = 0, acceptedPlays = 0;
  const collector = {
    root, sourceRoot: resolve('.'), executionPolicy: { maxActiveSegmentWallMs: null, selectionDeferred: true },
    manifest: { mode: 'live', runId: 'full-collection-test', build: { sourceDigest: processingAudit.originalSourceDigest, binaryDigest: processingAudit.nativeBinaryDigest },
      plan: { phases, workCaps: { maxInvocationWallMs: 300000, maxPlayerAttemptsPerDecision: 2, batchRequests: 4, maxActiveSegmentWallMs: 5400000 } } },
    state() {
      const rows = readJournal(root);
      return { rows, episode, claimed, pending, intent: null, segmentStartedAt: new Date(Date.now() - 6000000).toISOString(),
        paused: rows.some(r => r.kind === 'pause'), outcomes: [...outcomes], commits: [...commits],
        reviews: [...oldReviews, ...rows.filter(r => r.kind === 'review-imported').map(r => r.data)],
        closedPhases: rows.filter(r => r.kind === 'phase-closed').map(r => r.data.variant), attempts, acceptedPlays };
    },
    pause(reason) { appendEvent(root, 'pause', { reason }); },
    resume() { throw Error('Driver must never resume'); },
    next() {
      if (forcedComplete) return { stop: 'campaign-complete' };
      if (episode?.done) {
        const finished = episode; outcomes.push(schedule.find(o => o.episodeId === finished.episodeId)); episode = null;
        actions.push(`complete:${finished.episodeId}`); return { stop: 'request-completed', episodeId: finished.episodeId, outcome: { scoreTotals: [] } };
      }
      const state = collector.state();
      if (episode) return { job: pending };
      for (const outcome of outcomes) {
        assert.ok(state.reviews.some(r => r.stage === 'decision' && r.subjectId === `${outcome.episodeId}:one`), 'Decision review must precede next player');
        assert.ok(state.reviews.some(r => r.stage === 'game' && r.subjectId === outcome.episodeId), 'Game review must precede next player');
      }
      const phase = phases.find(p => !state.closedPhases.includes(p.variant));
      if (!phase) return { stop: 'campaign-complete' };
      const completed = outcomes.filter(o => o.variant === phase.variant).length;
      if (completed > 0 && completed % 4 === 0 && !state.rows.some(r => r.kind === 'batch-reviewed' && r.data.variant === phase.variant && r.data.completed === completed)) return { stop: 'batch-review-required' };
      if (completed >= phase.maxCompletedRequests) return { stop: 'phase-cap-reached', variant: phase.variant };
      if (playerCalls >= players) return { stop: 'attempt-cap' };
      episode = { ...schedule.find(o => o.variant === phase.variant && !outcomes.some(done => done.episodeId === o.episodeId)), done: false };
      pending = { jobId: `player-${playerCalls}`, episodeId: episode.episodeId, actor: 0, revision: 0, attempt: 1, phase: 'playing',
        responseSchemaHash: sha(readFileSync(resolve('contracts/trix-scenario-collection/play-response.schema.json'))) };
      return { job: pending };
    },
    claim(jobId) {
      assert.equal(jobId, pending.jobId); attempts++;
      const claimedAt = new Date().toISOString();
      claimed = { ...pending, claimedAt, deadlineAt: new Date(Date.parse(claimedAt) + 300000).toISOString() };
      return claimed;
    },
    accept(jobId, bytes) {
      assert.equal(jobId, claimed.jobId); assert.equal(bytes.toString(), 'player response');
      commits.push({ ...episode, decisionId: `${episode.episodeId}:one` }); episode.done = true; claimed = null; pending = null; acceptedPlays++;
    },
    settle(jobId, reason, options) { assert.equal(jobId, claimed.jobId); assert.equal(options.verifiedNotRunning, true); claimed = null; collector.pause(reason); },
  };
  const save = (jobId, raw) => {
    const directory = join(root, 'private/invocations', jobId); mkdirSync(join(directory, 'private/app-server'), { recursive: true });
    writeFileSync(join(directory, 'private/app-server/stopped.json'), JSON.stringify({ stoppedVerified: true }));
    writeFileSync(join(directory, 'response.txt'), raw); writeFileSync(join(directory, 'receipt.json'), JSON.stringify({ jobId }));
  };
  const importReview = (_collector, job, transport, bytes, _receipt, options) => {
    if (importFailure) throw Error('First valid review import failed');
    if (options) assert.deepEqual(options.processingAudit, processingAudit);
    imported.push({ jobId: transport.jobId, raw: bytes.toString() }); actions.push(`review:${job.stage}:${job.subjectId}`);
    appendEvent(root, 'review-imported', { stage: job.stage, subjectId: job.subjectId });
  };
  const api = {
    makeReviewPacket(_collector, stage) {
      const state = collector.state();
      const subject = stage === 'decision' ? state.commits.find(c => !state.reviews.some(r => r.stage === stage && r.subjectId === c.decisionId))?.decisionId
        : state.outcomes.find(o => !state.reviews.some(r => r.stage === stage && r.subjectId === o.episodeId))?.episodeId;
      if (!subject) return { stop: 'no-pending' };
      if (stage === 'game') assert.ok(state.commits.every(c => state.reviews.some(r => r.stage === 'decision' && r.subjectId === c.decisionId)), 'All decision reviews freeze before game review');
      const id = `${stage}:${subject}`;
      if (!jobs.has(id)) jobs.set(id, { id, stage, subjectId: subject });
      return { job: jobs.get(id) };
    },
    claimReviewInvocation(_collector, job) {
      const claimedAt = new Date().toISOString();
      const transport = { jobId: `review-${reviewCalls}`, claimedAt, deadlineAt: new Date(Date.parse(claimedAt) + 300000).toISOString() };
      appendEvent(root, 'review-dispatch-claimed', { reviewId: job.id, stage: job.stage, job: transport }); return { job: transport };
    },
    async dispatchHostJob(_collector, transport, options) {
      assert.deepEqual(options.inventory, inventory); assert.equal(options.cwd, 'C:/Windows/Temp');
      assert.equal(Date.parse(transport.deadlineAt) - Date.parse(transport.claimedAt), 300000);
      assert.equal(existsSync(join(root, 'private/driver.lock')), false, 'Caller owns lock, driver must not create one');
      if (transport.jobId.startsWith('player')) { actions.push(`player:${transport.episodeId}`); playerCalls++; return { bytes: Buffer.from('player response'), receipt: { jobId: transport.jobId } }; }
      reviewCalls++; const raw = reviewCalls <= invalidAttempts ? 'invalid model content' : 'valid model content'; save(transport.jobId, raw);
      if (operatorPause) collector.pause('operator-request');
      if (providerFailure) throw Error('Provider unavailable');
      return { bytes: Buffer.from(raw), receipt: { jobId: transport.jobId } };
    },
    verifyPriorHost(_collector, claim) {
      hostChecks.push(claim.data.job.jobId);
      if (trustFailure) throw Error('Host provenance corrupt');
    },
    validateSavedContent(_collector, _job, transport, bytes, _receipt, options) {
      assert.ok(hostChecks.includes(transport.jobId), 'Host verification must precede content validation');
      assert.deepEqual(options.processingAudit, processingAudit); assert.equal(options.validateDecision, api.validateDecisionProposal);
      preflightJobs.push(transport.jobId);
      if (bytes.toString().startsWith('invalid')) { const error = Error('Verified model content invalid'); error.code = 'TRIX_REVIEW_CONTENT_INVALID'; throw error; }
      return bytes.toString().startsWith('normalized');
    },
    importHostReview: importReview, importNormalizedHostReview: importReview,
    exportRawGame(_collector, episodeId, options) {
      assert.deepEqual(options.processingAudit, processingAudit);
      const state = collector.state();
      assert.ok(state.reviews.some(r => r.stage === 'decision' && r.subjectId === `${episodeId}:one`));
      assert.ok(state.reviews.some(r => r.stage === 'game' && r.subjectId === episodeId));
      actions.push(`raw:${episodeId}`);
    },
    validateDecisionProposal() {}, validateGameProposal() {}, validateHostReviewEnvelope() {},
    curate() { throw Error('Selection is deferred'); }, exportCases() { throw Error('Selection is deferred'); }, closeBatch() { throw Error('Selection is deferred'); }, report() { throw Error('Selection is deferred'); },
  };
  return { root, collector, api, options: { inventory, processingAudit, apis: api }, actions, preflightJobs, imported, hostChecks, save, jobs, outcomes, commits, oldReviews,
    counts: () => ({ playerCalls, reviewCalls }) };
}

test('full driver drains earned decision and game reviews before new player and reviews the next game before another request', async t => {
  const f = fixture(t, { players: 2 });
  const result = await runFullCampaign(f.collector, f.options);
  assert.equal(result.stop, 'attempt-cap'); assert.deepEqual(f.counts(), { playerCalls: 2, reviewCalls: 6 });
  assert.deepEqual(f.actions.slice(0, 6), ['review:decision:basic-solo-0:one', 'review:game:basic-solo-0', 'raw:basic-solo-0', 'player:basic-solo-1', 'complete:basic-solo-1', 'review:decision:basic-solo-1:one']);
  const firstGameReview = f.actions.indexOf('review:game:basic-solo-1'), secondPlayer = f.actions.indexOf('player:basic-solo-2');
  assert.ok(firstGameReview < secondPlayer); assert.equal(result.report.reviewCoverage.game, 3);
  assert.equal(f.collector.state().paused, true);
});

test('aggregate 90-minute wall limit is removed while every review and player call retains 300 seconds', async t => {
  const f = fixture(t); assert.ok(Date.now() - Date.parse(f.collector.state().segmentStartedAt) > 5400000);
  const result = await runFullCampaign(f.collector, f.options);
  assert.equal(result.stop, 'attempt-cap'); assert.deepEqual(f.counts(), { playerCalls: 1, reviewCalls: 4 });
  assert.equal(readJournal(f.root).some(r => r.kind === 'resume' || r.kind === 'segment-started'), false);
});

test('two verified invalid responses exhaust cumulative review cap, pause incomplete and never invent a grade', async t => {
  const f = fixture(t, { invalidAttempts: 2 }); const result = await runFullCampaign(f.collector, f.options);
  assert.equal(result.stop, 'review-attempt-cap'); assert.deepEqual(f.counts(), { playerCalls: 0, reviewCalls: 2 });
  assert.equal(result.report.reviewCoverage.decision, 0); assert.equal(result.report.reviewCoverage.game, 0);
  const settlements = readJournal(f.root).filter(r => r.kind === 'review-attempt-settled');
  assert.equal(settlements.length, 2); assert.deepEqual(settlements.map(r => r.data.status), ['rejected', 'rejected']);
  assert.equal(f.collector.state().paused, true);
});

test('one invalid content response permits exactly one remaining attempt', async t => {
  const f = fixture(t, { invalidAttempts: 1, players: 0 }); const result = await runFullCampaign(f.collector, f.options);
  assert.equal(result.stop, 'attempt-cap'); assert.equal(f.counts().reviewCalls, 3);
  assert.equal(readJournal(f.root).filter(r => r.kind === 'review-dispatch-claimed' && r.data.reviewId === 'decision:basic-solo-0:one').length, 2);
  assert.deepEqual(readJournal(f.root).filter(r => r.kind === 'review-attempt-settled').map(r => r.data.status), ['rejected', 'accepted', 'accepted']);
});

test('historical attempts choose the earliest content-valid saved response and preserve settlements', async t => {
  const f = fixture(t, { players: 0 });
  for (const [i, raw] of ['invalid saved content', 'normalized saved content'].entries()) {
    const jobId = `prior-${i}`;
    appendEvent(f.root, 'review-dispatch-claimed', { reviewId: 'decision:basic-solo-0:one', stage: 'decision', job: { jobId } });
    appendEvent(f.root, 'review-attempt-settled', { jobId, status: 'rejected', reason: 'Original rejection' }); f.save(jobId, raw);
  }
  const before = readJournal(f.root); const result = await runFullCampaign(f.collector, f.options);
  assert.equal(result.stop, 'attempt-cap'); assert.deepEqual(f.imported[0], { jobId: 'prior-1', raw: 'normalized saved content' });
  assert.equal(f.counts().reviewCalls, 1); assert.deepEqual(readJournal(f.root).slice(0, before.length), before);
  assert.equal(readJournal(f.root).filter(r => r.kind === 'review-attempt-settled' && r.data.jobId.startsWith('prior')).length, 2);
});

test('first valid historical import failure stops without choosing a later rationale', async t => {
  const f = fixture(t, { importFailure: true });
  for (const jobId of ['first', 'second']) {
    appendEvent(f.root, 'review-dispatch-claimed', { reviewId: 'decision:basic-solo-0:one', stage: 'decision', job: { jobId } });
    appendEvent(f.root, 'review-attempt-settled', { jobId, status: 'rejected' }); f.save(jobId, 'valid saved content');
  }
  const result = await runFullCampaign(f.collector, f.options);
  assert.equal(result.stop, 'campaign-driver-failed'); assert.match(result.reason, /First valid review import/);
  assert.deepEqual(f.preflightJobs, ['first']); assert.equal(f.counts().reviewCalls, 0);
});

test('historical host context applies only before its frozen boundary while fresh dispatch uses the new single context', async t => {
  const f = fixture(t, { players: 0 });
  const claim=appendEvent(f.root,'review-dispatch-claimed',{reviewId:'decision:basic-solo-0:one',stage:'decision',job:{jobId:'historical'}});
  appendEvent(f.root,'review-attempt-settled',{jobId:'historical',status:'rejected'});f.save('historical','valid saved content');
  const originalInventory={schemaVersion:'trix-host-base-context-admission-1.0.0',approvedDigests:['e'.repeat(64)]};
  const originalVerifier=f.api.verifyPriorHost, checked=[];
  f.api.verifyPriorHost=(collector,row,inventory)=>{
    assert.deepEqual(inventory,row.sequence<=claim.sequence?originalInventory:f.options.inventory);
    checked.push(row.data.job.jobId);originalVerifier(collector,row);
  };
  const result=await runFullCampaign(f.collector,{...f.options,originalInventory,originalThroughSequence:claim.sequence});
  assert.equal(result.stop,'attempt-cap');assert.deepEqual(checked,['historical','review-0']);
  assert.equal(f.counts().reviewCalls,1);
});

test('an unsettled historical claim stops and never replaces the uncertain invocation', async t => {
  const f = fixture(t); appendEvent(f.root, 'review-dispatch-claimed', { reviewId: 'decision:basic-solo-0:one', stage: 'decision', job: { jobId: 'uncertain' } });
  const result = await runFullCampaign(f.collector, f.options);
  assert.equal(result.stop, 'uncertain-review-dispatch'); assert.deepEqual(f.counts(), { playerCalls: 0, reviewCalls: 0 });
  assert.equal(readJournal(f.root).filter(r => r.kind === 'review-dispatch-claimed').length, 1);
});

test('certified interrupted review preserves its consumed attempt and uses only the remaining attempt', async t => {
  const f=fixture(t,{players:0}),jobId='interrupted';
  appendEvent(f.root,'review-dispatch-claimed',{reviewId:'decision:basic-solo-0:one',stage:'decision',job:{jobId}});
  appendEvent(f.root,'review-attempt-settled',{jobId,status:'rejected',reason:'Unexpected MCP infrastructure startup failure'});f.save(jobId,'unused');
  const proof={jobId,acceptedResponse:false};let checked=0;
  f.api.verifyFailedReviewInvocation=()=>{checked++;return proof;};
  const result=await runFullCampaign(f.collector,{...f.options,reconciledReviewFailures:new Map([[jobId,proof]])});
  assert.equal(result.stop,'attempt-cap');assert.equal(checked,1);assert.deepEqual(f.counts(),{playerCalls:0,reviewCalls:2});
  assert.equal(readJournal(f.root).filter(r=>r.kind==='review-dispatch-claimed'&&r.data.reviewId==='decision:basic-solo-0:one').length,2);
});

test('changed failed-call proof blocks the remaining attempt',async t=>{
  const f=fixture(t,{players:0}),jobId='interrupted';
  appendEvent(f.root,'review-dispatch-claimed',{reviewId:'decision:basic-solo-0:one',stage:'decision',job:{jobId}});
  appendEvent(f.root,'review-attempt-settled',{jobId,status:'rejected'});f.save(jobId,'unused');
  f.api.verifyFailedReviewInvocation=()=>({jobId,hash:'changed'});
  const result=await runFullCampaign(f.collector,{...f.options,reconciledReviewFailures:new Map([[jobId,{jobId,hash:'original'}]])});
  assert.equal(result.stop,'campaign-driver-failed');assert.match(result.reason,/evidence changed/);assert.equal(f.counts().reviewCalls,0);
});

for(const failures of [1,2])test(`verified infrastructure interruption retries within the original cap (${failures} failures)`,async t=>{
  const f=fixture(t,{players:0}),dispatch=f.api.dispatchHostJob;let calls=0;
  f.api.dispatchHostJob=async(...args)=>{const result=await dispatch(...args);if(++calls<=failures)throw Error('Unexpected MCP infrastructure startup failure');return result;};
  f.api.verifyFailedReviewInvocation=(_collector,claim)=>({jobId:claim.data.job.jobId,acceptedResponse:false});
  const result=await runFullCampaign(f.collector,f.options);
  assert.equal(result.stop,failures===1?'attempt-cap':'review-attempt-cap');
  assert.equal(readJournal(f.root).filter(r=>r.kind==='review-dispatch-claimed'&&r.data.reviewId==='decision:basic-solo-0:one').length,2);
  assert.equal(f.counts().reviewCalls,failures===1?3:2);
  assert.equal(readJournal(f.root).filter(r=>r.kind==='campaign-review-infrastructure-reconciled').length,failures);
});

test('host trust and provider failures pause without a content retry', async t => {
  for (const setting of [{ trustFailure: true }, { providerFailure: true }]) {
    const f = fixture(t, setting); const result = await runFullCampaign(f.collector, f.options);
    assert.equal(result.stop, 'campaign-driver-failed'); assert.equal(f.counts().reviewCalls, 1); assert.equal(f.counts().playerCalls, 0);
    assert.equal(f.preflightJobs.length, 0); assert.equal(f.collector.state().paused, true);
    assert.equal(readJournal(f.root).filter(r => r.kind === 'review-attempt-settled').length, 1);
  }
});

test('new operator pause stops after current review without another review or player', async t => {
  const f = fixture(t, { operatorPause: true }); const result = await runFullCampaign(f.collector, f.options);
  assert.equal(result.stop, 'paused'); assert.deepEqual(f.counts(), { playerCalls: 0, reviewCalls: 1 });
  assert.equal(f.collector.state().paused, true); assert.equal(readJournal(f.root).some(r => r.kind === 'resume'), false);
});

test('24 already accepted decision reviews remain unchanged and are not reviewed again', async t => {
  const f = fixture(t, { initial: 24, players: 0, allReviewed: true }); const old = structuredClone(f.oldReviews);
  const result = await runFullCampaign(f.collector, f.options);
  assert.equal(result.stop, 'attempt-cap'); assert.deepEqual(f.counts(), { playerCalls: 0, reviewCalls: 0 });
  assert.deepEqual(f.oldReviews, old); assert.equal(result.report.reviewCoverage.decision, 24);
});

test('collection close requires all decision and game reviews and actual request and contract caps', t => {
  const missing = fixture(t, { initial: 32 }); assert.throws(() => closeReviewedCollectionBatch(missing.collector, { closePhase: true }), /Every committed decision/);
  const short = fixture(t, { initial: 4, allReviewed: true }); assert.throws(() => closeReviewedCollectionBatch(short.collector, { closePhase: true }), /actual request cap/);
  closeReviewedCollectionBatch(short.collector); assert.equal(readJournal(short.root).filter(r => r.kind === 'phase-closed').length, 0);
  const wrongContract = fixture(t, { initial: 32, allReviewed: true }); wrongContract.outcomes[0] = { ...wrongContract.outcomes[0], request: 'king' };
  assert.throws(() => closeReviewedCollectionBatch(wrongContract.collector, { closePhase: true }), /Per-contract cap/);
});

test('completion requires all 160 requests, full per-phase coverage and every required review', async t => {
  const short = fixture(t, { initial: 159, allReviewed: true, forcedComplete: true });
  const result = await runFullCampaign(short.collector, short.options); assert.equal(result.stop, 'campaign-driver-failed'); assert.match(result.reason, /160 completed/);
  assert.equal(readJournal(short.root).some(r => r.kind === 'campaign-collection-completed'), false);
  const missing = fixture(t, { initial: 160, allReviewed: true, forcedComplete: true }); missing.oldReviews.pop();
  missing.api.makeReviewPacket = () => ({ stop: 'fixture suppresses missing review' });
  for (const phase of missing.collector.manifest.plan.phases) appendEvent(missing.root, 'phase-closed', { variant: phase.variant });
  const missingResult = await runFullCampaign(missing.collector, missing.options); assert.equal(missingResult.stop, 'campaign-driver-failed'); assert.match(missingResult.reason, /game review/);
  assert.equal(readJournal(missing.root).some(r => r.kind === 'campaign-collection-completed'), false);
});

test('all reviewed 160-request campaign closes each phase and records collection completion without selection or publication', async t => {
  const f = fixture(t, { initial: 160, allReviewed: true, players: 0 });
  const result = await runFullCampaign(f.collector, f.options);
  assert.equal(result.stop, 'campaign-collection-completed'); assert.equal(result.report.remainingRequests, 0);
  assert.deepEqual(result.report.requestCoverage.map(p => p.completed), [32, 32, 32, 64]);
  assert.deepEqual(result.report.reviewCoverage, { committedDecisions: 160, decision: 160, completedGames: 160, game: 160 });
  assert.equal(readJournal(f.root).filter(r => r.kind === 'phase-closed').length, 4);
  assert.equal(readJournal(f.root).filter(r => r.kind === 'campaign-collection-completed').length, 1);
  assert.equal(existsSync(join(f.root, 'exports')), false); assert.deepEqual(f.counts(), { playerCalls: 0, reviewCalls: 0 });
  const source = readFileSync(resolve('scripts/trix-scenario-collection/campaign-driver.mjs'), 'utf8');
  assert.doesNotMatch(source, /from ['"]\.\/(?:curate|export|derived-export)\.mjs['"]|\b(?:curate|exportCases|closeBatch)\(/);
  assert.equal('selectedAxes' in collectionReport(f.collector), false);
});

test('malformed or absent execution policy cannot enter full collection', async t => {
  const f = fixture(t); f.collector.executionPolicy.selectionDeferred = false;
  await assert.rejects(runFullCampaign(f.collector, f.options), /admitted full collection policy/);
  assert.deepEqual(f.counts(), { playerCalls: 0, reviewCalls: 0 });
});
