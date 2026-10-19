import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Inventory only local capture metadata and accessibility-text companions.
// Never read native fixtures, infer current resolutions, or rewrite captures.
const directory = dirname(fileURLToPath(import.meta.url));
const names = readdirSync(directory).sort();
const records = [], issues = [];
const text = value => String(value).replace(/[\\|`]/g, '\\$&').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\r\n]+/g, ' ');
const link = (label, file) => `[${text(label)}](${encodeURIComponent(file)})`;
const coreDevices = new Map([['se1', 'SE1'], ['se2', 'SE2'], ['iphone12', 'iPhone12'], ['ipad', 'iPad'], ['desktop', 'desktop']]);

for (const name of names.filter(name => name.endsWith('.json'))) {
  try {
    const data = JSON.parse(readFileSync(join(directory, name), 'utf8'));
    if (typeof data.context?.state !== 'string' || !data.measure || !data.checks || typeof data.checks !== 'object') {
      issues.push(`${name}: not capture metadata; excluded`);
      continue;
    }
    const stem = name.slice(0, -5), jpg = `${stem}.jpg`, txt = `${stem}.txt`;
    const viewport = data.measure.viewport;
    const measured = Number.isFinite(viewport?.width) && Number.isFinite(viewport?.height) && viewport.width > 0 && viewport.height > 0;
    const hasJpg = existsSync(join(directory, jpg));
    const hasText = existsSync(join(directory, txt)) && readFileSync(join(directory, txt), 'utf8').trim().length > 0;
    if (!measured) issues.push(`${name}: missing valid measured viewport`);
    if (!hasJpg) issues.push(`${name}: missing JPG companion`);
    if (!hasText) issues.push(`${name}: missing or empty TXT companion`);
    records.push({ name, jpg, hasJpg, hasText, state: data.context.state,
      device: String(data.context.device ?? ''),
      width: measured ? viewport.width : 0, height: measured ? viewport.height : 0,
      size: measured ? `${viewport.width}×${viewport.height}` : 'not recorded',
      flags: Object.entries(data.checks).filter(([, value]) => value === false).map(([key]) => key).sort() });
  } catch (error) {
    issues.push(`${name}: ${error.message}`);
  }
}

const groups = new Map();
for (const record of records) {
  if (!groups.has(record.state)) groups.set(record.state, []);
  groups.get(record.state).push(record);
}
const orderedGroups = [...groups].sort(([a], [b]) => a.localeCompare(b, 'en'));
const sizeSets = new Map();
const sizeCell = captures => {
  const sizes = [...new Set([...captures].sort((a, b) => a.width - b.width || a.height - b.height).map(capture => capture.size))];
  if (sizes.length <= 4) return sizes.join(', ');
  const key = sizes.join(', ');
  if (!sizeSets.has(key)) sizeSets.set(key, sizeSets.size + 1);
  const id = sizeSets.get(key);
  return `[${sizes.length} sizes · set ${id}](#size-set-${id})`;
};
const flagged = records.filter(record => record.flags.length);
const lines = [
  '# Historical capture index', '',
  '**Capture log only — not current pass status.** Before/after captures and recorded failures remain together. A recorded `false` may describe a resolved defect or an intentional overlay; only curated review can decide. A row without recorded flags is not visual acceptance. Missing or `null` checks are not passes.', '',
  `Review method and batch evidence: [REVIEW-PLAN.md](REVIEW-PLAN.md). ${existsSync(join(directory, 'RESULTS.md')) ? 'Current curated dispositions: [RESULTS.md](RESULTS.md).' : 'Current dispositions will be documented separately in RESULTS.md.'}`, '',
  `${records.length} JSON captures across ${groups.size} recorded states; ${records.filter(record => record.hasJpg).length} JPG and ${records.filter(record => record.hasText).length} nonempty TXT companions. ${flagged.length} captures contain ${flagged.reduce((sum, record) => sum + record.flags.length, 0)} recorded false checks. Counts are capture inventory, not coverage of every game/phase/device combination.`, '',
  'Sizes below are measured CSS pixels, including zoom rounding. Core image links use recorded device labels: SE1, SE2, iPhone12, iPad and desktop. A dash means no matching core JPG in that state. TXT files are accessibility snapshots; their availability does not prove visual layout.', '',
  '| Recorded context.state | Captures | Measured sizes | Recorded false checks | Core JPGs |',
  '| --- | ---: | --- | --- | --- |',
];
for (const [state, captures] of orderedGroups) {
  const flagCounts = new Map();
  for (const capture of captures) for (const flag of capture.flags) flagCounts.set(flag, (flagCounts.get(flag) ?? 0) + 1);
  const flags = [...flagCounts].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([flag, count]) => `${text(flag)} ×${count}`).join('; ') || 'None recorded';
  const core = [...captures].filter(capture => capture.hasJpg && coreDevices.has(capture.device.toLowerCase()))
    .sort((a, b) => [...coreDevices.keys()].indexOf(a.device.toLowerCase()) - [...coreDevices.keys()].indexOf(b.device.toLowerCase()) || a.name.localeCompare(b.name, 'en'))
    .map(capture => link(coreDevices.get(capture.device.toLowerCase()), capture.jpg)).join(' · ') || '—';
  lines.push(`| ${text(state)} | ${captures.length} | ${sizeCell(captures)} | ${flags} | ${core} |`);
}
if (sizeSets.size) {
  lines.push('', '## Shared measured size sets', '');
  for (const [sizes, id] of sizeSets) lines.push(`### Size set ${id}`, '', sizes, '');
}
if (flagged.length) {
  lines.push('## Historical flag details', '', 'Links below point to the original metadata, without assigning a current resolution.', '');
  for (const [state, captures] of orderedGroups) {
    const checks = [...new Set(captures.flatMap(capture => capture.flags))].sort();
    for (const check of checks) lines.push(`- ${text(state)} · ${text(check)}: ${captures.filter(capture => capture.flags.includes(check)).map(capture => link(capture.device || capture.name, capture.name)).join(', ')}.`);
  }
}
if (issues.length) lines.push('', '## Indexing notes', '', ...issues.map(issue => `- ${text(issue)}`));
lines.push('', '## Regenerate', '', 'Run from the repository root after adding captures. This rewrites only CAPTURES.md; it does not alter any source evidence.', '',
  '```text', 'node qa/implementation/rally/browser-2026-10-14/capture-index.mjs', '```', '');
writeFileSync(join(directory, 'CAPTURES.md'), lines.join('\n'));
console.log(`Indexed ${records.length} captures / ${groups.size} states; ${flagged.length} historically flagged captures; ${issues.length} indexing notes.`);
