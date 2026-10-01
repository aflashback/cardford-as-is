import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const base = new URL('.', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, base), 'utf8'));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const switchRecord = read('provenance/model-switch.json');
const configuration = { 'gpt-6.1-sol': read('transport/config-sol.json'), 'gpt-6-luna': read('transport/config-luna.json') };
let preserved = 0, checked = 0;
for (const episode of read('deals.json').episodes) {
  const file = `records/${episode.id}.json`;
  if (!existsSync(new URL(file, base))) continue;
  const current = read(file), count = switchRecord.prefixes[episode.id] ?? 0;
  if (count) {
    const prefix = read(`provenance/sol-prefix-${episode.id}.json`);
    assert.equal(prefix.decisions.length, count);
    assert.deepEqual(current.decisions.slice(0, count), prefix.decisions, 'Historical Sol choices changed');
    preserved += count;
  }
  for (const [index, decision] of current.decisions.entries()) {
    const expected = index < count ? 'gpt-6.1-sol' : 'gpt-6-luna';
    assert.equal(decision.configuredModel, expected);
    assert.equal(decision.reasoningEffort, 'xhigh');
    assert.equal(decision.transportMetadata.transportConfigHash, hash(configuration[expected]));
    checked++;
  }
}
assert.equal(preserved, switchRecord.acceptedSolDecisions);
for (const name of readdirSync(new URL('transport/', base)).filter(name => /-\d{2}-\d+\.json$/.test(name))) {
  const attempt = read('transport/' + name);
  assert.equal(attempt.transportConfigHash, hash(configuration[attempt.configuredModel]));
  assert.equal(attempt.reasoningEffort, 'xhigh');
}
console.log(JSON.stringify({ status: 'passed', preservedSolDecisions: preserved, checkedDecisions: checked,
  scope: 'Original Sol prefixes unchanged; every saved decision/attempt matches its model configuration.' }));
