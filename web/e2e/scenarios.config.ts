import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'dev-scenarios.live.ts',
  outputDir: '../test-results/scenarios',
  workers: 1,
  timeout: 90_000,
  use: {
    baseURL: process.env.TRICKS_LIVE_URL || 'http://127.0.0.1:4184',
    browserName: 'chromium',
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
});
