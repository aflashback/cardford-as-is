// Local comparison servers; runtime strategy remains deterministic code.
const arm = process.argv[2];
if (!['baseline', 'candidate'].includes(arm)) throw Error('Expected baseline or candidate');
process.env.PORT = arm === 'baseline' ? '4191' : '4192';
process.env.HOST = '127.0.0.1';
process.env.APP_ORIGIN = `http://127.0.0.1:${process.env.PORT}`;
process.env.JEV_MODE = 'off';
process.env.SPADES_POLICY = arm === 'baseline' ? 'spades-tactics-2.1.0' : 'spades-cases-4.0.0';
process.env.DEV_SCENARIOS_FILE = 'qa/experiments/2026-10-02-browser-baseline/dev-deals.json';
await import('../../../web/server/index.ts');
