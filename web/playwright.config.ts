import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  outputDir: '../test-results',
  reporter: [['list']],
  webServer: {
    command: 'node web/server/index.ts',
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    url: 'http://127.0.0.1:4173/api/health',
    reuseExistingServer: true,
    timeout: 15000,
  },
});
