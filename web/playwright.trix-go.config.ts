import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const origin = process.env.CARDFORD_TRIX_ORIGIN;
if (
  !origin ||
  new URL(origin).protocol !== 'http:' ||
  !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname) ||
  new URL(origin).origin !== origin
)
  throw new Error('Run node scripts/trix-checks.mjs browser with its native Go loopback origin.');

export default defineConfig({
  testDir: './e2e',
  testMatch: /trix\.spec\.ts/,
  // Each variant owns a fresh browser identity and mode-specific evidence.
  fullyParallel: true,
  workers: 4,
  timeout: 1_780_000,
  globalTimeout: 1_780_000,
  expect: { timeout: 30_000 },
  // Complete games make thousands of API calls. Continuous trace snapshots
  // overwhelm the bounded lane; phase screenshots and public receipts remain.
  use: {
    baseURL: origin,
    browserName: 'chromium',
    channel: 'chrome',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  outputDir: '../test-results/trix-go',
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: fileURLToPath(new URL('../.local/trix-acceptance/browser-report.json', import.meta.url)),
      },
    ],
  ],
});
