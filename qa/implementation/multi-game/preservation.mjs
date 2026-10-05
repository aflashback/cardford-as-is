import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const baseline = path.join(root, '.local/m00-baseline');
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const preserved = [
  'package-lock.json',
  'web/server/game/cards.ts',
  'web/server/game/rules.ts',
  'web/server/game/replay.ts',
  'web/server/games/spades/reasoning/manifest.ts',
  'web/server/games/hearts/reasoning/manifest.ts',
  'web/server/games/spades/reasoning/frozen',
  'web/server/games/spades/cases',
  'web/server/evaluation/spades-pack',
  'qa/experiments/2026-10-04-spades-evaluation-pack',
];
function files(relative) {
  const source = path.join(baseline, relative);
  return statSync(source).isDirectory()
    ? readdirSync(source).flatMap((name) => files(path.join(relative, name)))
    : [relative.replaceAll('\\', '/')];
}
const entries = preserved
  .flatMap(files)
  .toSorted()
  .map((file) => ({
    file,
    original: hash(path.join(baseline, file)),
    current: hash(path.join(root, file)),
  }));
const originalSchema = JSON.parse(
  readFileSync(path.join(baseline, 'web/shared/contracts.schema.json'), 'utf8'),
);
const currentSchema = JSON.parse(readFileSync(path.join(root, 'web/shared/contracts.schema.json'), 'utf8'));
const oldDefinitions = originalSchema.$defs ?? originalSchema.definitions;
const newDefinitions = currentSchema.$defs ?? currentSchema.definitions;
const changedDefinitions = Object.keys(oldDefinitions).filter(
  (key) => JSON.stringify(oldDefinitions[key]) !== JSON.stringify(newDefinitions[key]),
);
const report = {
  requirement: 'MG-09',
  sourceRevision: 'd66a046240a309fe25b6b79da52594d8ead2b5f0',
  preservedFiles: entries.length,
  entries,
  originalV1DefinitionCount: Object.keys(oldDefinitions).length,
  changedV1Definitions: changedDefinitions,
  passed: entries.every((entry) => entry.original === entry.current) && !changedDefinitions.length,
  limitation:
    'Tracked baseline snapshots only; new V2 contracts and the successor policy are additive. Production V2 migration is later work.',
};
writeFileSync(
  path.join(root, 'qa/implementation/multi-game/preservation.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    passed: report.passed,
    preservedFiles: report.preservedFiles,
    changedV1Definitions: changedDefinitions,
  }),
);
process.exitCode = report.passed ? 0 : 1;
