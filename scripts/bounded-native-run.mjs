// A deadline covers the whole owned native Windows process tree, not each test.
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_TEST_RUN_MS = 30 * 60 * 1000;
export async function runBoundedNative(executable, args, options = {}) {
  if (process.platform !== 'win32') throw Error('Native Windows process-tree watchdog required.');
  const milliseconds = options.milliseconds ?? MAX_TEST_RUN_MS;
  if (!Number.isFinite(milliseconds) || milliseconds <= 0 || milliseconds > MAX_TEST_RUN_MS)
    throw Error('Deadline must be positive and no longer than 1800 seconds.');
  const maxBytes = options.maxBytes ?? (8 << 20);
  const start = performance.now();
  const child = spawn(executable, args, { cwd: options.cwd, env: options.env ?? process.env,
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', bytes = 0, timedOut = false, outputLimitExceeded = false, interrupted = false;
  let error, shutdownError, stopping = false, closeObserved = false;
  function stopOwnedTree(reason) {
    if (stopping || closeObserved) return;
    stopping = true;
    timedOut = reason === 'deadline';
    outputLimitExceeded = reason === 'output-limit';
    interrupted = reason === 'interrupt';
    if (!Number.isInteger(child.pid) || child.pid <= 0) return;
    // Only the PID returned by this spawn and its descendants are in scope.
    const result = spawnSync(resolve(process.env.SystemRoot ?? 'C:/Windows', 'System32/taskkill.exe'),
      ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, encoding: 'utf8', timeout: 5000, maxBuffer: 65536 });
    if (result.error || result.status !== 0) {
      shutdownError = result.error?.code ?? `taskkill-exit-${result.status}`;
      child.kill();
    }
  }
  // Reserve time inside the ceiling for native process-tree termination.
  const shutdownReserveMs = Math.min(5000, milliseconds / 2);
  const timer = setTimeout(() => stopOwnedTree('deadline'), Math.max(1, milliseconds - shutdownReserveMs));
  const interrupt = () => stopOwnedTree('interrupt');
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  function collect(chunk) {
    bytes += chunk.length;
    if (bytes > maxBytes) { stopOwnedTree('output-limit'); return; }
    const value = chunk.toString('utf8');
    output += value;
    options.onData?.(value);
  }
  child.stdout.on('data', collect); child.stderr.on('data', collect);
  child.on('error', e => { error = e.code ?? String(e); });
  const result = await new Promise(done => child.on('close', (exitCode, signal) => {
    closeObserved = true;
    done({ exitCode, signal });
  }));
  clearTimeout(timer);
  process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
  return { ...result, error: error ?? null, shutdownError: shutdownError ?? null, timedOut,
    interrupted, outputLimitExceeded, elapsedMs: performance.now() - start, output,
    status: timedOut || interrupted ? 'pending-unverified' : result.exitCode === 0 && !error && !outputLimitExceeded && !shutdownError ? 'passed' : 'failed' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2), separator = argv.indexOf('--');
  const options = argv.slice(0, separator), command = argv.slice(separator + 1);
  if (separator < 0 || command.length < 1 || options.length > 1 ||
      (options.length && !/^--seconds=\d+(\.\d+)?$/.test(options[0])))
    throw Error('Use node scripts/bounded-native-run.mjs [--seconds=1800] -- <executable> [arguments...]');
  const seconds = options.length ? Number(options[0].slice('--seconds='.length)) : 1800;
  const executable = command[0] === 'node' ? process.execPath : command[0];
  const result = await runBoundedNative(executable, command.slice(1), { milliseconds: seconds * 1000,
    onData: value => process.stdout.write(value) });
  const { output, ...receipt } = result;
  console.log(JSON.stringify({ nativeWatchdog: receipt }));
  process.exitCode = result.timedOut ? 124 : result.status === 'passed' ? 0 : 1;
}
