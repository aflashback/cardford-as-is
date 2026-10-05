import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const start = 'ea09f81c3fe799350dac0d802795892ed4e39e8a';
const hash = (data) => createHash('sha256').update(data).digest('hex');
const previous = JSON.parse(
  readFileSync(path.join(root, 'qa/implementation/multi-game/preservation.json'), 'utf8'),
);
const refactored = new Set(['web/server/game/rules.ts', 'web/server/game/replay.ts']);
const preserved = previous.entries
  .filter((entry) => !refactored.has(entry.file))
  .map((entry) => ({
    file: entry.file,
    original: entry.current,
    current: hash(readFileSync(path.join(root, entry.file))),
  }));
const rootTypescript = path.join(root, 'node_modules/typescript/lib/typescript.js');
const ts = await import(
  pathToFileURL(
    existsSync(rootTypescript)
      ? rootTypescript
      : path.join(root, 'web/node_modules/typescript/lib/typescript.js'),
  ).href
);
const body = (source) =>
  ts.default
    .createSourceFile('snapshot.ts', source, ts.default.ScriptTarget.Latest, true)
    .statements.filter(
      (node) => !ts.default.isImportDeclaration(node) && !ts.default.isExportDeclaration(node),
    )
    .map((node) => node.getText().replace(/\r\n/g, '\n'))
    .join('\n');
const pairs = [
  ['web/server/game/index.ts', 'web/server/game/legacy/v1.ts'],
  ['web/server/game/rules.ts', 'web/server/game/legacy/rules.ts'],
  ['web/server/observations/index.ts', 'web/server/game/legacy/observation.ts'],
];
const snapshots = pairs.map(([original, frozen]) => {
  const source = execFileSync('git', ['show', `${start}:${original}`], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  return {
    original,
    frozen,
    originalBodyHash: hash(body(source)),
    frozenBodyHash: hash(body(readFileSync(path.join(root, frozen), 'utf8'))),
  };
});
const publicFiles = readdirSync(path.join(root, 'web/shared'), { withFileTypes: true })
  .filter((file) => file.isFile())
  .map((file) => `web/shared/${file.name}`);
publicFiles.push('web/shared/games/hearts.schema.json', 'web/shared/games/spades.schema.json');
const publicContracts = publicFiles.map((file) => ({
  file,
  original: hash(
    execFileSync('git', ['show', `${start}:${file}`], {
      cwd: root,
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
    }),
  ),
  current: hash(readFileSync(path.join(root, file))),
}));
const reports = [
  'qa/experiments/2026-10-05-partner-resource/fresh/manifest.json',
  'qa/experiments/2026-10-05-partner-resource/fresh/results.json',
  'qa/experiments/2026-10-05-partner-resource/fresh/fixture-report.json',
  'qa/experiments/2026-10-05-partner-resource/fresh/pairs.private.jsonl',
];
const partnershipArchive = reports.map((file) => ({
  file,
  original: hash(
    execFileSync('git', ['show', `${start}:${file}`], {
      cwd: root,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    }),
  ),
  current: hash(readFileSync(path.join(root, file))),
}));
const passed =
  preserved.every((e) => e.original === e.current) &&
  snapshots.every((e) => e.originalBodyHash === e.frozenBodyHash) &&
  publicContracts.every((e) => e.original === e.current) &&
  partnershipArchive.every((e) => e.original === e.current);
const report = {
  requirement: 'MG-09',
  start,
  passed,
  preserved,
  snapshots,
  publicContracts,
  partnershipArchive,
  ruling:
    'Rules/replay facade paths are intentionally extracted; unchanged function bodies are retained independently and behavior is checked against saved legal logs. All other prior preservation entries stay unchanged.',
};
writeFileSync(
  path.join(root, 'qa/implementation/multi-game/m02/preservation.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    passed,
    preservedFiles: preserved.length,
    frozenBodies: snapshots.length,
    publicFiles: publicContracts.length,
    partnershipArchiveFiles: partnershipArchive.length,
  }),
);
if (!passed) process.exitCode = 1;
