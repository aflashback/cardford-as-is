// Cross-runtime migration acceptance helper. The SQL and ledger are canonical;
// this command only restricts the existing Node runner to an isolated test schema.
import pg from 'pg';
import { migrate } from '../web/server/records/migrations.ts';

const args = process.argv.slice(2);
if (args.length !== 1 || !/^--schema=m03_[a-z0-9_]{1,48}$/.test(args[0]))
  throw new Error('Requires exactly --schema=m03_<isolated test schema>');
const schema = args[0].slice('--schema='.length);
const url = process.env.TEST_DATABASE_URL;
let isolated = false;
try { isolated = Boolean(url && new URL(url).pathname.endsWith('_test')); } catch { /* sanitized below */ }
if (!isolated)
  throw new Error('Requires a separate TEST_DATABASE_URL ending in _test');
const pool = new pg.Pool({
  connectionString: url,
  max: 1,
  connectionTimeoutMillis: 5000,
  options: `-c search_path=${schema} -c statement_timeout=5000 -c lock_timeout=1000`,
});
try {
  // A pre-existing schema is intentional. Never fall through to public.
  const result = await pool.query('SELECT current_schema() AS schema');
  if (result.rows[0]?.schema !== schema) throw new Error('Missing isolated test schema');
  await migrate(pool);
  console.log(JSON.stringify({ schema, runner: 'canonical-node', migrated: true }));
} catch {
  // Database diagnostics can include configuration/SQL; keep this process output safe.
  throw new Error('Isolated canonical Node migration failed');
} finally {
  await pool.end();
}
