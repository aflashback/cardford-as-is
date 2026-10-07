import { defineConfig } from '@playwright/test';

const origin = process.env.CARDFORD_M04E_ORIGIN;
if (!origin || new URL(origin).protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname) ||
    new URL(origin).origin !== origin)
  throw new Error('Run the M04E native Go browser harness with its exact loopback origin.');

export default defineConfig({
  testDir: './e2e',
  testMatch: process.env.M04E_CONFIGURED ? /platform-go-configured\.spec\.ts/ : /platform-go\.spec\.ts/,
  workers: 1,
  timeout: 240000,
  use: {baseURL: origin, browserName: 'chromium', channel: 'chrome', trace: 'retain-on-failure'},
  outputDir: '../test-results/m04e-platform',
  reporter: [['list']],
});
