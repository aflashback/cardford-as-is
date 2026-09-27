import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: 'local-live.spec.ts', workers: 1, use: { browserName: 'chromium', channel: 'chrome', baseURL: process.env.TRICKS_LIVE_URL || 'http://127.0.0.1:4173', trace: 'retain-on-failure' } });
