import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const origin = process.env.CARDFORD_REALTIME_ORIGIN;
if (!origin || new URL(origin).hostname !== '127.0.0.1')
  throw new Error('Run scripts/realtime-browser.mjs through windows-env.');
export default defineConfig({
  testDir: './e2e',
  testMatch: /realtime\.spec\.ts/,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: origin,
    browserName: 'chromium',
    channel: 'chrome',
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
  },
  outputDir: '../test-results/realtime',
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: fileURLToPath(
          new URL('../.local/realtime-acceptance/browser-report.json', import.meta.url),
        ),
      },
    ],
  ],
});
