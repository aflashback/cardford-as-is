// Research agents only. The application runtime never imports this module.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

export const sha = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const executable = process.env.CARDFORD_CODEX_EXE;
if (!executable || !existsSync(executable)) throw Error('Set CARDFORD_CODEX_EXE to the installed Codex executable.');
const model = 'gpt-6-luna', effort = 'xhigh';
const emptyDirectory = join(tmpdir(), 'cardford-browser-agent-empty');
mkdirSync(emptyDirectory, { recursive: true });
const flags = ['exec', '--ephemeral', '--ignore-user-config', '--skip-git-repo-check', '--sandbox', 'read-only', '--model', model, '--cd', emptyDirectory,
  '-c', `model_reasoning_effort="${effort}"`, '-c', 'project_doc_max_bytes=0', '-c', 'web_search="disabled"', '-c', 'suppress_unstable_features_warning=true', '--enable', 'skip_host_skill_discovery',
  ...['shell_tool', 'multi_agent', 'plugins', 'memories', 'apps', 'browser_use', 'computer_use', 'code_mode', 'hooks'].flatMap(name => ['--disable', name]), '--json', '-'];
const cliVersion = execFileSync(executable, ['--version'], { encoding: 'utf8', windowsHide: true }).trim();
export const transportConfig = { schemaVersion: 'browser-agent-transport-1.0.0', configuredModel: model, reasoningEffort: effort, cliVersion,
  isolation: 'Fresh ephemeral invocation per packet, empty working directory, tool events rejected.', flags, jevCalls: 0,
  modelSnapshot: 'Configured model recorded; exact backend snapshot not independently exposed.' };

export async function invoke(prompt, role) {
  const startedAt = new Date().toISOString(), timeoutMs = 300_000;
  return await new Promise(resolve => {
    const child = spawn(executable, flags, { cwd: emptyDirectory, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', text => { stdout += text; }); child.stderr.on('data', text => { stderr += text; });
    child.stdin.on('error', () => {}); child.on('error', error => { stderr += error.message; });
    child.on('close', exitCode => {
      clearTimeout(timeout);
      const events = stdout.split(/\r?\n/).filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return { type: 'unparsed' }; } });
      const messages = events.filter(e => e.type === 'item.completed' && e.item?.type === 'agent_message').map(e => e.item.text);
      const toolEvents = events.filter(e => e.item && !['agent_message', 'reasoning', 'error'].includes(e.item.type)).map(e => ({ type: e.type, itemType: e.item.type }));
      const completion = events.find(e => e.type === 'turn.completed');
      const failures = events.filter(e => ['error', 'turn.failed', 'unparsed'].includes(e.type) || e.item?.type === 'error');
      resolve({ schemaVersion: 'browser-agent-response-1.0.0', role, prompt, promptHash: sha(prompt), response: messages.join('\n'), responseHash: sha(messages.join('\n')),
        validTransport: exitCode === 0 && !timedOut && !!completion && messages.length === 1 && toolEvents.length === 0 && failures.length === 0,
        metadata: { ...transportConfig, startedAt, finishedAt: new Date().toISOString(), timeoutMs, timedOut, exitCode, threadId: events.find(e => e.type === 'thread.started')?.thread_id ?? null,
          usage: completion?.usage ?? null, toolEvents, failures, stderr: stderr.slice(-4000) } });
    });
    child.stdin.end(prompt);
  });
}
