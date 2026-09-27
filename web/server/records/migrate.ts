import { loadLocalEnvironment, readConfig } from '../config.ts';
import { createPool } from './database.ts';
import { migrate } from './migrations.ts';
loadLocalEnvironment();
const pool = createPool(readConfig().databaseUrl);
try {
  await migrate(pool);
  console.log('Database migrations applied.');
} finally {
  await pool.end();
}
