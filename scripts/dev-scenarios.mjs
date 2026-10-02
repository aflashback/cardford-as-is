import { fileURLToPath } from 'node:url';
import { loadLocalEnvironment } from '../web/server/config.ts';

loadLocalEnvironment();
process.env.DEV_SCENARIOS_FILE ||= fileURLToPath(new URL('../examples/dev-deals.json', import.meta.url));
await import('../web/server/index.ts');
