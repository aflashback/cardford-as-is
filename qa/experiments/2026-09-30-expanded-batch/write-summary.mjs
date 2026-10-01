import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listEpisodes, load, audit } from './referee.mjs';
const directory = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(directory, 'records'), { recursive: true });
const episodes = listEpisodes().map(episode => {
  const report = audit(episode.id);
  writeFileSync(join(directory, 'records', episode.id + '.audit.json'), JSON.stringify(report, null, 2) + '\n');
  const { rec, episode: setup } = load(episode.id);
  return { ...report, mode: episode.mode, initialScores: setup.scores, initialBags: setup.bags,
    deltas: report.complete ? report.result.scores.map((score, seat) => score - setup.scores[seat]) : null,
    nonforced: rec.decisions.filter(decision => !decision.forced).length };
});
const attempts = readdirSync(join(directory, 'transport')).filter(name => /-\d{2}-\d+\.json$/.test(name))
  .map(name => JSON.parse(readFileSync(join(directory, 'transport', name), 'utf8')));
for (const episode of episodes) {
  episode.recordedAttempts = attempts.filter(attempt => attempt.episodeId === episode.episodeId).length;
  if (episode.status === 'not-run' && episode.recordedAttempts) episode.status = 'attempted-no-action';
}
const usage = {};
for (const attempt of attempts) for (const [key, value] of Object.entries(attempt.usage ?? {})) {
  if (typeof value === 'number') usage[key] = (usage[key] ?? 0) + value;
}
const report = { schemaVersion: 'expanded-batch-summary-1.0.0',
  status: episodes.every(episode => episode.complete) ? 'complete' : 'incomplete',
  planned: 8, completed: episodes.filter(episode => episode.complete).length,
  decisions: episodes.reduce((sum, episode) => sum + episode.accepted, 0),
  rejected: episodes.reduce((sum, episode) => sum + episode.rejected, 0),
  forced: episodes.reduce((sum, episode) => sum + episode.forced, 0),
  invocations: attempts.length, transportFailures: attempts.filter(attempt => !attempt.validTransport).length,
  toolEvents: attempts.reduce((sum, attempt) => sum + attempt.toolEvents.length, 0),
  attemptsMissingUsage: attempts.filter(attempt => !attempt.usage).length, usage,
  configuredModels: ['gpt-6.1-sol', 'gpt-6-luna'], reasoningEffort: 'xhigh',
  modelCounts: Object.fromEntries(['gpt-6.1-sol', 'gpt-6-luna'].map(model => [model, episodes.reduce((sum, episode) => sum + (episode.modelCounts[model] ?? 0), 0)])),
  jevCalls: 0, episodes };
writeFileSync(join(directory, 'records', 'integrity.json'), JSON.stringify(report, null, 2) + '\n');
const rows = mode => episodes.filter(episode => episode.mode === mode).map(episode =>
  `| ${episode.episodeId} | ${episode.status} | ${episode.accepted}/56 | ${episode.result.bids.map(bid => bid ?? '—').join('/')} | ${episode.result.tricks.join('/')} | ${episode.complete ? episode.result.scores.join('/') : 'not final'} | ${episode.deltas?.join('/') ?? '—'} |`).join('\n');
const table = mode => `| Hand | Status | Decisions | Bids | Tricks | Final scores | Points this hand |\n|---|---|---|---|---|---|---|\n${rows(mode)}`;
writeFileSync(join(directory, 'results.md'), `# Expanded batch results

**${report.completed} of 8 hands complete; ${report.decisions} accepted decisions (${report.forced} forced).** Per owner request, play switched from GPT-6.1 Sol to GPT-6 Luna, both at extra-high reasoning. Accepted decisions: Sol ${report.modelCounts['gpt-6.1-sol']}, Luna ${report.modelCounts['gpt-6-luna']}. Seat order: Maya / Leo / Jason / Sarah. Partners scores repeat each team's value across its seats.

## Solo

${table('spades-solo')}

## Partners

${table('spades-partners')}

## Checks and limits

Recorded ${report.invocations} player invocations, ${report.rejected} rejected replies, ${report.transportFailures} transport failures and ${report.toolEvents} reported tool events. Every accepted action is replayed through the production rules. Complete hands have 56 decisions, 13 tricks and 52 unique played cards. Audits check exact delivered prompts and responses, hashes, public-information projections and scoring. Reported token usage is retained in [integrity.json](records/integrity.json); usage is unavailable for ${report.attemptsMissingUsage} attempt(s), and setup transport probes are excluded.

Each choice used a fresh player context, unlike the first batch's persistent chats. Three hands contain a Sol prefix followed by Luna; the remaining hands use Luna throughout. The switch and context changes prevent a clean model comparison. The cases are authored development samples, one path each. They cannot establish optimal moves, general strength, probabilities or improved teaching. Late scores/bags are synthetic starting states. Three in-flight Sol requests were cancelled for the owner-directed switch without accepting a response; their usage is unavailable and excluded from the reported invocation total.

No Jev or OpenRouter calls; no runtime bot, coach or rules changes. The CLI model setting is recorded, but the exact backend snapshot is not independently exposed.

See [decision findings](review-notes.md), [protocol and commands](README.md), and [raw records and audits](records/integrity.json). The earlier six-hand batch remains separate at [its saved results](../2026-09-30-two-suit-batch/results.md).
`);
console.log(JSON.stringify({ status: report.status, completed: report.completed, decisions: report.decisions, forced: report.forced, rejected: report.rejected, invocations: report.invocations, transportFailures: report.transportFailures, toolEvents: report.toolEvents, usage }, null, 2));
