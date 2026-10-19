import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {completedIntervals} from './browser-trace.mjs';
const cases = [
  'hearts-desktop-1.4', 'spades-solo-iphone-se-1.4', 'spades-partners-ipad-1.4',
  'trix-basic-solo-iphone-se-1.4', 'trix-basic-partners-iphone12-1.4',
  'trix-complex-solo-ipad-1.4', 'trix-complex-partners-desktop-final-1.4',
  'hearts-iphone-se-pause', 'trix-complex-partners-pause',
  ...Array.from({length:11}, (_,i) => `trix-complex-partners-round-trick-${i+3}`),
];
const results = [];
for (const name of cases) {
  const trace = JSON.parse(await readFile(new URL(`${name}.json`, import.meta.url), 'utf8'));
  const intervals = completedIntervals(trace);
  assert.equal(intervals.length, 1, `${name}: exactly one completed hold measured`);
  const interval = intervals[0];
  const fourthLandingObserved = trace.rows.some(row => row.cards.length === 4 && row.flights > 0 && row.cards.some(card => !card.visible));
  assert.ok(fourthLandingObserved, `${name}: fourth-card flight observed`);
  // rAF sampling is discrete. Allow one 60Hz frame at each measured boundary.
  assert.ok(interval.activeVisibleMs >= 2100 / (1.4 * 1.3) - 34, `${name}: full unpaused reading time`);
  assert.equal(interval.pocketChangedDuringHold, false, `${name}: previous pocket remains during hold`);
  assert.equal(interval.pocketAdvancedAtCollection, true, `${name}: pocket updates at collection`);
  results.push({name, viewport:trace.viewport, fourthLandingObserved, ...interval});
}
await writeFile(new URL('verified-traces.json', import.meta.url), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify({passed:results.length, minActiveVisibleMs:Math.min(...results.map(r=>r.activeVisibleMs)),
  maxActiveVisibleMs:Math.max(...results.map(r=>r.activeVisibleMs)), pauses:results.filter(r=>r.interrupted)}, null, 2));
