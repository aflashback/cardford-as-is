import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const database = `tricks_restore_${Date.now()}_test`;
if (!/^tricks_restore_\d+_test$/.test(database)) throw new Error('Invalid isolated restore database name.');
const run = (args, input) =>
  spawnSync('podman', args, { input, windowsHide: true, maxBuffer: 100 * 1024 * 1024 });
const checked = (args, input) => {
  const r = run(args, input);
  if (r.status !== 0)
    throw new Error('PostgreSQL backup/restore command failed. No credentials or data were logged.');
  return r.stdout;
};
const container = 'tricks-coach-postgres';
const folder = path.join(root, '.local');
mkdirSync(folder, { recursive: true });
const backup = path.join(folder, 'local-backup.dump');
const start = performance.now();
const dump = checked(['exec', container, 'pg_dump', '-U', 'tricks', '-d', 'tricks_coach', '-Fc']);
writeFileSync(backup, dump);
checked(['exec', container, 'createdb', '-U', 'tricks', database]);
try {
  checked(
    ['exec', '-i', container, 'pg_restore', '-U', 'tricks', '-d', database, '--exit-on-error'],
    readFileSync(backup),
  );
  const query =
    "SELECT (SELECT count(*) FROM players)||','||(SELECT count(*) FROM games)||','||(SELECT count(*) FROM schema_migrations)";
  const source = checked(['exec', container, 'psql', '-U', 'tricks', '-d', 'tricks_coach', '-tAc', query])
    .toString()
    .trim();
  const restored = checked(['exec', container, 'psql', '-U', 'tricks', '-d', database, '-tAc', query])
    .toString()
    .trim();
  if (source !== restored) throw new Error('Restore verification row counts differ.');
  const report = {
    check: 'local PostgreSQL logical backup and isolated restore',
    status: 'passed',
    elapsedMs: Math.round(performance.now() - start),
    bytes: dump.length,
    counts: 'players,games,migrations',
    sourceCounts: source,
    restoredCounts: restored,
    scope: 'local rehearsal; not a measured production RPO/RTO',
    backup: 'ignored .local/local-backup.dump',
  };
  writeFileSync(
    path.join(root, 'qa', 'implementation', 'backup-restore.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report));
} finally {
  checked(['exec', container, 'dropdb', '-U', 'tricks', database]);
}
