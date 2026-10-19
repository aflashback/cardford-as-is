import { defineConfig } from '@playwright/test';
import base from './playwright.trix-go.config';

export default defineConfig({
  ...base,
  testMatch: /trix-twos\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  globalTimeout: 240_000,
  use: { ...base.use, viewport: { width: 1280, height: 800 } },
  outputDir: '../test-results/trix-twos-go',
});
