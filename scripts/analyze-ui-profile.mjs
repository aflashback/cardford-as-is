// Offline summary of recorded Chrome/Lighthouse evidence; this does not run a benchmark.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

const root = resolve('qa/implementation/trix/ui-performance');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const round = value => Math.round(value * 100) / 100;
const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  return round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0);
};
const results = {};
for (const label of ['before', 'after']) {
  const directory = resolve(root, label);
  const gameplay = read(resolve(directory, 'gameplay.json'));
  const profile = read(resolve(directory, 'chrome.cpuprofile'));
  const trace = JSON.parse(gunzipSync(readFileSync(resolve(directory, 'chrome-trace.json.gz'))).toString('utf8'));
  const nodes = new Map(profile.nodes.map(node => [node.id, node.callFrame]));
  const cpu = new Map();
  profile.samples.forEach((id, index) => {
    const frame = nodes.get(id);
    const key = `${frame?.functionName || '(anonymous)'}|${frame?.url || ''}|${frame?.lineNumber ?? -1}`;
    cpu.set(key, (cpu.get(key) ?? 0) + (profile.timeDeltas[index] ?? 0) / 1000);
  });
  const events = trace.traceEvents;
  const threads = events.filter(event => event.ph === 'M' && event.name === 'thread_name' &&
    event.args?.name === 'CrRendererMain').map(event => `${event.pid}:${event.tid}`);
  const taskName = events.some(event => event.name === 'RunTask') ? 'RunTask' : 'ThreadControllerImpl::RunTask';
  const tasks = events.filter(event => event.ph === 'X' && event.name === taskName &&
    threads.includes(`${event.pid}:${event.tid}`));
  const rendererEvents = events.filter(event => event.ph === 'X' &&
    threads.includes(`${event.pid}:${event.tid}`));
  const expensive = rendererEvents.filter(event => event.dur >= 50_000).map(event => ({
    name: event.name, milliseconds: round(event.dur / 1000), thread: `${event.pid}:${event.tid}`,
  }));
  const timeline = {};
  for (const name of ['RunTask', 'ThreadControllerImpl::RunTask', 'FunctionCall', 'EvaluateScript', 'UpdateLayoutTree', 'Layout', 'Paint', 'CompositeLayers']) {
    const entries = events.filter(event => event.ph === 'X' && event.name === name &&
      threads.includes(`${event.pid}:${event.tid}`));
    if (entries.length) timeline[name] = {
      count: entries.length, totalMs: round(entries.reduce((sum, event) => sum + event.dur / 1000, 0)),
      maxMs: round(Math.max(...entries.map(event => event.dur / 1000))),
    };
  }
  const audits = {};
  for (const kind of ['lighthouse', 'lighthouse-active']) {
    const report = read(resolve(directory, `${kind}.json`));
    audits[kind] = {
      version: report.lighthouseVersion, fetchedAt: report.fetchTime,
      scores: Object.fromEntries(Object.entries(report.categories).map(([name, value]) => [name, value.score * 100])),
      runtimeError: report.runtimeError ?? null,
      failedAudits: Object.values(report.audits).filter(value => value.score !== null && value.score < 1)
        .map(value => ({ id: value.id, title: value.title, score: value.score, displayValue: value.displayValue })),
    };
  }
  const requests = gameplay.requests.filter(request => request.path.startsWith('/api/'));
  results[label] = {
    chrome: gameplay.chrome, viewport: gameplay.viewport, sampleSeconds: round(gameplay.sampleMs / 1000),
    humanActions: gameplay.humanActions, acceptedCommandsIncludingSetup: gameplay.confirmedCommands,
    pauseCycles: gameplay.pauseCycles, validGameplaySample: gameplay.validGameplaySample,
    finalPhase: gameplay.finalPhase, frames: gameplay.frames,
    bufferedLongTasksIncludingNavigation: gameplay.longTasks,
    recordedMainThreadEvents: { count: rendererEvents.length,
      maxMs: round(Math.max(0, ...rendererEvents.map(event => event.dur / 1000))), over50ms: expensive },
    fullTaskDurations: tasks.length ? {count: tasks.length} : 'Not captured by these trace categories; use frame gaps and individual recorded events.',
    timeline,
    cpuSampledMilliseconds: round(profile.timeDeltas.reduce((sum, delta) => sum + delta / 1000, 0)),
    topCpuSelfSamples: [...cpu.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([frame, milliseconds]) => ({ frame, milliseconds: round(milliseconds) })),
    api: { count: requests.length, p95Ms: percentile(requests.map(request => request.ms), .95),
      maxMs: round(Math.max(0, ...requests.map(request => request.ms))),
      nonSuccess: requests.filter(request => request.status >= 400) },
    resumeObservedMs: gameplay.requests.filter(request => request.path === 'UI resume response').map(request => round(request.ms)),
    pageErrors: gameplay.errors, failedRequests: gameplay.failedRequests, audits,
  };
}
const summary = {
  scope: 'Headless local Chrome, native Go/test database, provider off, 1280x800, normal random first requests. Different deals are not a paired speed comparison.',
  measurementNotes: [
    'requestAnimationFrame gaps are local observer intervals, not physical-device presentation FPS.',
    'The Long Tasks observer is buffered and includes initial navigation. Complete RunTask durations are absent; individual main-thread events come from the gameplay trace.',
    'Accepted command and API totals include setup. Resume times include automated click and DOM observation, not just app rendering.',
    'Timeline totals are nested categories and must not be added together.',
    'Navigation Lighthouse reloads the saved table paused. The snapshot audits the active table separately.',
  ],
  results,
};
writeFileSync(resolve(root, 'analysis.json'), JSON.stringify(summary, null, 2));
for (const [label, result] of Object.entries(results)) console.log(JSON.stringify({ label, ...result }));
