// Native Windows developer selections; full acceptance stays a separate gate.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_TEST_RUN_MS, runBoundedNative } from './bounded-native-run.mjs';

const laneStarted = performance.now();

const root = fileURLToPath(new URL('../', import.meta.url));
const exactSelections = new Map();
const exact = names => {
  const pattern = `^(${names.join('|')})$`;
  exactSelections.set(pattern, names);
  return pattern;
};
const check = (packages, run, flags = []) => ({ packages, run, flags });
const historyTests = [
  'TestRecordClosedUntrustedEnvelope', 'TestRecordArchiveAndInvalidStateFailClosed',
  'TestRecordExactPolicyModuleAndReadOnlyReaders', 'TestRecordOpeningAnchorBindsConfigChanceAndCheckpoint',
  'TestRecordDecisionBindingsAndOriginalBytes', 'TestRecordSupportedOriginalLegacyStateBytes',
  'TestRecordCommandDigestBindsEntireIntent', 'TestRecordDecisionCommandAndWindowBinding',
  'TestRecordHeartsSealedOpeningRestoresKnownHoldings', 'TestRecordReplayFrozenOriginalCorpus',
  'TestRecordHeartsProgressionCompactReopenAndReplay', 'TestRecordHeartsDecisionAndRejectedCommandBindings',
  'TestRecordHeartsTerminalHistoryRemainsOriginalAndReadOnly', 'TestRecordCompactEventPlaceholderRequiresArray',
  'TestRecordHistoricalReaderReplaysWithoutEnablingPlay', 'TestM04CStrictBindingsAndHistoricalOriginalBytes',
  'TestM04CFrozenOriginalReaderRejectsChangedViewsAndActions', 'TestM04CV1NeverImplicitlyRepinned',
  'TestM04CStrictCompactArchiveAndOperationBoundary',
];
const recordRaceTests = [
  'TestM03AccessTrialActivationAndPurchasedTerms', 'TestM03AllowanceAtomicCommandStableAcrossGrantPolicy',
  'TestM04DConfiguredUnlockConcurrentRecoveryAndOriginalTerms',
  'TestM04DConfiguredCommercialTrialOnceAcrossOffersAndTargets',
  'TestM03StoreRestartConcurrentAcceptanceAndReconciliation',
  'TestM03StoreConcurrentGameReplacementRetainsHistory', 'TestM03StoreLockAndPoolWaitsAreBounded',
  'TestM03WorkTwoInstancesReclaimAndImmutableReceipt', 'TestM03WorkAdmissionFences',
  'TestM03WorkFiniteExpiryRequeueAndCancel', 'TestM03ExpiredIssuedWorkCannotAcceptNewCommand',
  'TestM04RevocationAndLeaseExpiryFencePublication', 'TestM04CancellationStageAndPoolRecovery',
  'TestM04AdviceDeliveryExposureAndFinalAuthentication', 'TestM04EHelpPriorReceiptCannotRaceSourceRevocation',
];
const lanes = {
  trix: { database: false, cached: true, description: 'Four Trix profiles: rules, score, lifecycle, observations, replay and deterministic policy.', checks: [check(['./server/internal/games/trix'])] },
  'trix-service': { database: true, cached: false, description: 'Native Trix catalog, contracts, persistence, access, saved advice and command recovery.', checks: [check(['./server/internal/service', './server/internal/records', './server/internal/access'], '^TestTrix')] },
  fast: { database: false, cached: true, description: 'Pure rules, projections, contracts and shared services; Go test-result cache enabled.', checks: [check([
    'access', 'coaching', 'contracts', 'demo', 'gamekernel', 'legacydecision', 'sessions',
    'games/hearts', 'games/hearts/reasoning', 'games/hearts/coaching',
    'games/spades', 'games/spades/reasoning', 'games/spades/coaching',
  ].map(p => `./server/internal/${p}`))] },
  history: { database: false, cached: true, description: 'Pure archive/replay, checkpoint corruption and original-byte protection; no long growth or fixture construction.', checks: [check(['./server/internal/records'], exact(historyTests))] },
  persistence: { database: true, cached: false, description: 'Fresh store/fence/work/access/history checks and service recovery; no long growth or terminal fixture construction.', checks: [
    check(['./server/internal/records'], `^(${historyTests.join('|')}|TestM03Store.*|TestM03Historical.*|TestM03Work.*|TestM03Expired.*|TestM03Access.*|TestM03Allowance.*|TestM03Natural.*|TestM03Admitted.*|TestM04Store.*|TestM04DConfigured.*|TestM04Local.*|TestM04Revocation.*|TestM04Cancellation.*|TestM04Advice.*|TestM04EHelp.*|TestM04EStats.*)$`, ['-short']),
    check(['./server/internal/service'], exact(['TestLocalServiceAdviceControlDeletionAndRestart', 'TestM04EReviewOriginalAdviceLevelsTrialIsolationAndRestart', 'TestM04EPreviousHandUnlockIsIndependentOfCurrentHand']), ['-short']),
    check(['./server/internal/http'], exact(['TestPostgresSaveReloadAndRevisionFence', 'TestStoredIdentityBinding', 'TestStoredCorruptionDoesNotPublish', 'TestRequestUsesOneStrictSnapshotImport']), ['-short']),
  ] },
  concurrency: { database: true, cached: false, description: 'Fresh race instrumentation on concurrent admission, receipt, work, grant, lease/revocation and cancellation paths.', checks: [
    check(['./server/internal/records'], exact(recordRaceTests), ['-race', '-short']),
    check(['./server/internal/http'], exact(['TestAdmissionNoQueue', 'TestPostgresSaveReloadAndRevisionFence', 'TestCanceledStalledBodyReleasesAdmission', 'TestLocalTransportAdmissionAndCancellation', 'TestLocalTransportStalledBodySettles', 'TestLocalListenerBoundsSlowHeadersAndServesHealth']), ['-race', '-short']),
    check(['./server/internal/gamekernel'], exact(['TestAdmissionHasTwoSlotsAndNoQueue', 'TestCancellationBeforeAdmissionAndAfterTransition', 'TestCancellationBetweenSeatProjections', 'TestVisitorFailureReleasesAdmission', 'TestNativeCancellationBetweenProjectionsAndAdmissionRelease']), ['-race', '-short']),
    check(['./server/internal/service'], exact(['TestSchedulerBoundsDedupAndCancellation']), ['-race', '-short']),
    check(['./server/internal/demo'], exact(['TestAnonymousRequestsAreRepeatableAndIndependent']), ['-race', '-short']),
  ] },
  parity: { database: false, cached: true, description: 'Complete frozen compatibility policy/session corpora, without race instrumentation.', checks: [check(['./server/internal/compatibility'])] },
  growth: { database: true, cached: false, description: 'Both long growth safeguards, explicitly outside short/race developer checks.', checks: [check(['./server/internal/records'], exact(['TestRecordLongHistoryGrowth', 'TestM03StoreReplayChanceCheckpointsAndHandGrowth']))] },
  release: { database: true, cached: false, description: 'Complete original server normal and race-short gates, then vet. This is not all 16 M04E captures or activation.', checks: [
    check(['./server/...']), check(['./server/...'], undefined, ['-race', '-short']),
  ], vet: true },
};
const [name, ...options] = process.argv.slice(2);
if (name === '--list' && options.length === 0) {
  for (const [lane, spec] of Object.entries(lanes)) console.log(`${lane}: ${spec.description}`);
  process.exit(0);
}
if (!Object.hasOwn(lanes, name) || options.some(o => !['--dry-run', '--fresh'].includes(o) && !/^--deadline-seconds=\d+(\.\d+)?$/.test(o)) ||
    new Set(options).size !== options.length || options.filter(o => o.startsWith('--deadline-seconds=')).length > 1)
  throw Error('Use node scripts/m04-focused-checks.mjs --list | <lane> [--dry-run] [--fresh] [--deadline-seconds=1800]');
const deadlineOption = options.find(o => o.startsWith('--deadline-seconds='));
const deadlineMs = deadlineOption ? Number(deadlineOption.slice('--deadline-seconds='.length)) * 1000 : MAX_TEST_RUN_MS;
if (!Number.isFinite(deadlineMs) || deadlineMs <= 0 || deadlineMs > MAX_TEST_RUN_MS)
  throw Error('Total test deadline must be positive and no longer than 1800 seconds.');
const deadline = laneStarted + deadlineMs;
const lane = lanes[name], fresh = options.includes('--fresh');
if (fresh && !lane.cached) throw Error('--fresh is only needed for cached fast/history/parity selections.');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function walk(path) {
  return readdirSync(resolve(root, path), { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(`${path}/${e.name}`) : [`${path}/${e.name}`]);
}
const testFiles = walk('server').filter(p => p.endsWith('_test.go'));
const declared = testFiles.flatMap(path => [...readFileSync(resolve(root, path), 'utf8').matchAll(/^func (Test\w+)\(t \*testing\.T\)/gm)]
  .map(m => ({ package: `./${path.slice(0, path.lastIndexOf('/'))}`, test: m[1] })));
const plan = lane.checks.map(c => {
  const selected = declared.filter(t => c.packages.some(p => p === './server/...' || t.package === p) && (!c.run || new RegExp(c.run).test(t.test)));
  if (!selected.length) throw Error(`Selection matched no declared tests: ${JSON.stringify(c)}`);
  const undeclared = (exactSelections.get(c.run) ?? []).filter(name => !selected.some(t => t.test === name));
  if (undeclared.length) throw Error(`Explicit tests renamed or missing: ${undeclared.join(', ')}`);
  const args = ['go', 'test', '-p=1', ...c.packages, ...c.flags, ...(c.run ? ['-run', c.run] : []),
    ...(!lane.cached || fresh ? ['-count=1'] : []), '-timeout=10m', '-json'];
  return { args, selected };
});
if (lane.vet) plan.push({ args: ['go', 'vet', './server/...'], selected: [] });
console.log(JSON.stringify({ lane: name, databaseRequired: lane.database, cacheEnabled: lane.cached && !fresh, totalDeadlineMs: deadlineMs,
  commands: plan.map(p => ({ executable: process.execPath, args: ['scripts/windows-env.mjs', ...p.args],
    selectedTestCount: p.selected.length, ...(options.includes('--dry-run') ? { selectedTests: p.selected } : {}) })) }, null, 2));
if (options.includes('--dry-run')) process.exit(0);
if (process.platform !== 'win32') throw Error('Requires the project native Windows host.');
const credentialsFile = resolve(root, '.local/windows-postgres/credentials.json');
if (lane.database && !existsSync(credentialsFile)) throw Error('Native test database not initialized; use node scripts/windows-env.mjs pg:start explicitly.');
// The native wrapper sets isolated test database identity; this runner never starts PostgreSQL.
const sourceFiles = [...new Set(['go.mod', 'go.sum', 'package.json', 'package-lock.json',
  'scripts/m04-focused-checks.mjs', 'scripts/bounded-native-run.mjs', 'scripts/windows-env.mjs', 'scripts/windows-tools.json',
  ...walk('server').filter(p => /\.(go|json)$/.test(p)),
  ...walk('web/server').filter(p => /\.(ts|json|sql)$/.test(p)),
  ...walk('web/shared').filter(p => /\.(ts|json|mjs|mts)$/.test(p)),
  ...walk('qa/implementation/multi-game/m02a/corpus').filter(p => /\.json$/.test(p)),
  ...walk('qa/implementation/multi-game/m04b').filter(p => /\.(json|ts)$/.test(p)),
])].sort();
const sources = () => sourceFiles.map(path => ({ path, sha256: sha(readFileSync(resolve(root, path))) }));
const before = sources(), startedAt = new Date().toISOString();
const evidence = resolve(root, '.local/m04-focused-checks', `${startedAt.replaceAll(/[:.]/g, '-')}-${name}`);
mkdirSync(evidence, { recursive: true });
const password = existsSync(credentialsFile) ? JSON.parse(readFileSync(credentialsFile, 'utf8')).password : '';
const reports = [];
let timedOut = false;
for (const [index, step] of plan.entries()) {
  const remaining = deadline - performance.now();
  if (remaining <= 0) { timedOut = true; process.exitCode = 124; break; }
  const run = await runBoundedNative(process.execPath, ['scripts/windows-env.mjs', ...step.args], { cwd: root,
    milliseconds: remaining, env: { ...process.env, JEV_MODE: 'off', JEV_MAX_REQUESTS: '0' }, maxBytes: 8 << 20 });
  let output = run.output;
  const { output: capturedOutput, ...result } = run;
  if (password) output = output.replaceAll(password, '[redacted]');
  const events = output.split(/\r?\n/).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
  const outcomes = events.filter(e => e.Test && ['pass', 'fail', 'skip'].includes(e.Action));
  const missingTests = step.selected.filter(t => !outcomes.some(e => e.Package === `cardford/${t.package.slice(2)}` && e.Test === t.test));
  const allowedReleaseSkips = ['TestDemoWebRejectsSymlinkedBuildAsset', 'TestM04ETerminalFixtureInstall',
    'TestM04FPreparedRequestProfile', 'TestFreshPairedPartnerDevelopment',
    'TestM06TokenBrowserFixtureHost',
    'TestStartupDiagnosticsWindowsProbe',
    ...(step.args.includes('-short') ? ['TestRecordLongHistoryGrowth', 'TestM03StoreReplayChanceCheckpointsAndHandGrowth'] : [])];
  const unexpectedSkips = outcomes.filter(e => e.Action === 'skip' && !(name === 'release' && allowedReleaseSkips.includes(e.Test))
    && !(name === 'persistence' && e.Test === 'TestM03StoreReplayChanceCheckpointsAndHandGrowth'));
  const filename = `${index + 1}.${step.args.includes('-json') ? 'jsonl' : 'txt'}`;
  writeFileSync(resolve(evidence, filename), output);
  const report = { args: ['scripts/windows-env.mjs', ...step.args], ...result,
    output: filename, outputSHA256: sha(output),
    missingTests, unexpectedSkips: unexpectedSkips.map(e => ({ package: e.Package, test: e.Test })) };
  reports.push(report);
  console.log(JSON.stringify({ lane: name, step: index + 1, ...result, elapsedMs: report.elapsedMs,
    missingTests: missingTests.length, unexpectedSkips: unexpectedSkips.length }));
  if (result.timedOut) { timedOut = true; process.exitCode = 124; break; }
  if (result.status !== 'passed' || missingTests.length || unexpectedSkips.length) { process.exitCode = 1; break; }
}
const sourceUnchanged = JSON.stringify(before) === JSON.stringify(sources());
if (!sourceUnchanged && !timedOut) process.exitCode = 1;
writeFileSync(resolve(evidence, 'report.json'), JSON.stringify({ lane: name, startedAt, completedAt: new Date().toISOString(),
  source: before, sourceSHA256: sha(JSON.stringify(before)), sourceUnchanged, totalDeadlineMs: deadlineMs, timedOut,
  status: timedOut ? 'pending-unverified' : process.exitCode ? 'failed' : 'passed',
  notRunCommands: plan.slice(reports.length).map(step => step.args),
  harnessSHA256: sha(readFileSync(fileURLToPath(import.meta.url))), provider: { mode: 'off', requests: 0, observedModel: null }, reports,
}, null, 2) + '\n');
console.log(JSON.stringify({ evidence, sourceUnchanged, timedOut, status: timedOut ? 'pending-unverified' : process.exitCode ? 'failed' : 'passed', exitCode: process.exitCode ?? 0 }));
