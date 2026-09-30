import { loadLocalEnvironment, readConfig } from './config.ts';
import { createPool } from './records/database.ts';
import { migrate } from './records/migrations.ts';
import { createApp } from './http/app.ts';
loadLocalEnvironment();
const config = readConfig();
const pool = createPool(config.databaseUrl);
await migrate(pool);
const app = await createApp(config, pool);
await app.listen({ host: config.host, port: config.port });
console.log(
  `CardFord is ready at ${config.origin} (local identity, fixture billing, Jev off, Spades policy ${config.spadesPolicy ?? 'live default'}).`,
);
const stop = async () => {
  await app.close();
  await pool.end();
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
