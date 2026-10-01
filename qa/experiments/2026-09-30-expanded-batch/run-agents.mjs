// Offline research transport. No application runtime imports other than the referee.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { listEpisodes, load, promptFor, accept, audit } from './referee.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const executable = process.env.CARDFORD_CODEX_EXE;
if (!executable || !existsSync(executable)) throw Error('Set CARDFORD_CODEX_EXE to the installed codex.exe path.');
const sha = value => createHash('sha256').update(value).digest('hex');
const model = 'gpt-6-luna';
const effort = 'xhigh';
const playerDirectory = join(tmpdir(), 'cardford-text-players-20260930');
mkdirSync(playerDirectory, { recursive: true });
mkdirSync(join(directory, 'transport'), { recursive: true });
const flags = [
  'exec', '--ephemeral', '--ignore-user-config', '--skip-git-repo-check',
  '--sandbox', 'read-only', '--model', model, '--cd', playerDirectory,
  '-c', `model_reasoning_effort="${effort}"`, '-c', 'project_doc_max_bytes=0',
  '-c', 'web_search="disabled"', '-c', 'suppress_unstable_features_warning=true', '--enable', 'skip_host_skill_discovery',
  ...['shell_tool', 'multi_agent', 'plugins', 'memories', 'apps', 'browser_use',
    'computer_use', 'code_mode', 'hooks'].flatMap(feature => ['--disable', feature]),
  '--json', '-'
];
const cliVersion = execFileSync(executable, ['--version'], { encoding: 'utf8', windowsHide: true }).trim();
const runConfig = { schemaVersion: 'offline-codex-transport-1.0.0', model, reasoningEffort: effort,
  cliVersion, flags, context: 'Fresh invocation for every decision; own remaining cards plus complete public history.',
  limit: 'No model weights or exact backend snapshot attestation. Tool events cause rejection.', jevCalls: 0 };
const configFile = join(directory, 'transport', 'config-luna.json');
if (existsSync(configFile) && readFileSync(configFile, 'utf8') !== JSON.stringify(runConfig, null, 2) + '\n') {
  throw Error('Transport configuration changed; do not mix configurations in one batch.');
}
writeFileSync(configFile, JSON.stringify(runConfig, null, 2) + '\n');

async function invoke(prompt) {
  const startedAt = new Date().toISOString();
  const timeoutMs = Math.min(600_000, Math.max(1, started + budgetMs - Date.now()));
  return await new Promise(resolve => {
    const child = spawn(executable, flags, { cwd: playerDirectory, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.stdin.on('error', () => {});
    child.on('error', error => { stderr += error.message; });
    child.on('close', code => {
      clearTimeout(timeout);
      const events = stdout.split(/\r?\n/).filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return { type: 'unparsed', line }; } });
      const messages = events.filter(e => e.type === 'item.completed' && e.item?.type === 'agent_message').map(e => e.item.text);
      const toolEvents = events.filter(e => e.item && !['agent_message', 'reasoning', 'error'].includes(e.item.type)).map(e => ({ type: e.type, itemType: e.item.type }));
      const completed = events.find(e => e.type === 'turn.completed');
      const failures = events.filter(e => ['error', 'turn.failed', 'unparsed'].includes(e.type) || e.item?.type === 'error');
      resolve({ response: messages.length === 1 ? messages[0] : messages.join('\n'), validTransport: code === 0 && !timedOut && !!completed && toolEvents.length === 0 && messages.length === 1 && failures.length === 0,
        metadata: { transport: 'codex-exec-stdin', configuredModel: model, reasoningEffort: effort, cliVersion,
          startedAt, finishedAt: new Date().toISOString(), threadId: events.find(e => e.type === 'thread.started')?.thread_id ?? null,
          exitCode: code, timedOut, timeoutMs, deliveredPromptHash: sha(prompt), responseMessageCount: messages.length,
          toolEvents, usage: completed?.usage ?? null, failures,
          stderr: stderr.slice(-12000), transportConfigHash: sha(JSON.stringify(runConfig)),
          modelSnapshot: 'not independently exposed; configured model and CLI success recorded' } });
    });
    child.stdin.end(prompt);
  });
}

const started = Date.now();
const budgetMs = Number(process.env.CARDFORD_BATCH_MINUTES ?? 50) * 60_000;
const requested = process.argv.slice(2);
const episodes = listEpisodes().filter(e => requested.length === 0 || requested.includes(e.id));
let next = 0, stop = false;
const progress = message => console.log(`${new Date().toISOString()} ${message}`);
async function play(episode) {
  while (!stop && Date.now() - started < budgetMs) {
    const current = load(episode.id);
    if (['hand-end', 'match-end'].includes(current.state.phase)) {
      const report = audit(episode.id);
      progress(`COMPLETE ${episode.id} ${JSON.stringify({ bids: report.result.bids, tricks: report.result.tricks, scores: report.result.scores })}`);
      return;
    }
    const seq = current.rec.decisions.length + 1;
    const prompt = promptFor(episode.id);
    let accepted = false;
    const attemptPrefix = `${episode.id}-${String(seq).padStart(2, '0')}-`;
    const previousAttempts = readdirSync(join(directory, 'transport')).filter(name => name.startsWith(attemptPrefix) && name.endsWith('.json'))
      .map(name => Number(name.slice(attemptPrefix.length, -5)));
    const attemptBase = previousAttempts.length ? Math.max(...previousAttempts) : 0;
    for (let retry = 1; retry <= 2 && !accepted; retry++) {
      const attempt = attemptBase + retry;
      const outcome = await invoke(prompt);
      const evidence = { episodeId: episode.id, seq, attempt, prompt, promptHash: sha(prompt), response: outcome.response, responseHash: sha(outcome.response), ...outcome.metadata, validTransport: outcome.validTransport };
      const evidencePath = join(directory, 'transport', `${episode.id}-${String(seq).padStart(2, '0')}-${attempt}.json`);
      if (existsSync(evidencePath)) throw Error(`Existing transport attempt must not be overwritten: ${evidencePath}`);
      writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
      if (!outcome.validTransport) {
        progress(`TRANSPORT_FAILURE ${episode.id} decision ${seq}: ${JSON.stringify({ code: outcome.metadata.exitCode, failures: outcome.metadata.failures, tools: outcome.metadata.toolEvents })}`);
        stop = true; return;
      }
      const name = ['maya', 'leo', 'jason', 'sarah'][current.state.turn];
      const result = accept(episode.id, outcome.response, `cli_${name}`, { ...outcome.metadata, evidenceFile: `transport/${episode.id}-${String(seq).padStart(2, '0')}-${attempt}.json` });
      accepted = result.accepted;
      progress(`${accepted ? 'ACCEPT' : 'REJECT'} ${episode.id} ${seq}/56 ${name} ${outcome.response.split(/\r?\n/)[0]}${accepted ? '' : ' ' + result.reason}`);
    }
    if (!accepted) { stop = true; progress(`STOP ${episode.id}: no valid player response after two attempts`); }
  }
  progress(`PAUSED ${episode.id}: budget or transport stop; saved state retained`);
}
async function worker() {
  while (!stop && next < episodes.length && Date.now() - started < budgetMs) await play(episodes[next++]);
}
progress(`START ${episodes.length} hands; ${model}/${effort}; concurrency 3; ${budgetMs / 60000} minute collection budget`);
await Promise.all([worker(), worker(), worker()]);
progress(`END elapsedSeconds=${Math.round((Date.now() - started) / 1000)} stopped=${stop}`);
