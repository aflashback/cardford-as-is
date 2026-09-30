import { defineConfig } from '@playwright/test';

/**
 * Browser checks against a server started by hand from a git worktree.
 * It never starts or reuses a server itself, so it cannot silently test another checkout.
 * Set TRICKS_LIVE_URL to that server's origin.
 */
const baseURL = process.env.TRICKS_LIVE_URL;
if (!baseURL) throw new Error('Set TRICKS_LIVE_URL to the worktree server origin.');
if (new URL(baseURL).port === '4173')
  throw new Error('Port 4173 belongs to the main checkout. Start the worktree server on another port.');

export default defineConfig({
  testDir: '.',
  outputDir: '../test-results/worktree',
  testMatch: ['local-live.spec.ts', 'spades-full-hand.spec.ts'],
  workers: 1,
  timeout: 90_000,
  use: { browserName: 'chromium', channel: 'chrome', baseURL, trace: 'retain-on-failure' },
});
