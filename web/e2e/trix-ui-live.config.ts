import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const origin = process.env.CARDFORD_TRIX_UI_ORIGIN ?? 'http://127.0.0.1:4174';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error('Trix UI smoke requires a loopback origin.');
export default defineConfig({
  testDir: '.', testMatch: 'trix-ui-live.spec.ts', workers: 1, timeout: 90_000, globalTimeout: 300_000,
  use: { baseURL: origin, channel: 'chrome', viewport: { width: 1280, height: 800 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  outputDir: '../test-results/trix-ui-live',
  reporter: [['line'], ['json', { outputFile: fileURLToPath(new URL('../../.local/trix-ui-live-report.json', import.meta.url)) }]],
});
