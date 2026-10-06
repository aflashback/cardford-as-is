import { defineConfig } from '@playwright/test';

const origin = process.env.CARDFORD_M04D_ORIGIN;
if (origin) {
  const url = new URL(origin);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.origin !== origin
  )
    throw new Error('CARDFORD_M04D_ORIGIN must be an exact native Go loopback origin');
}

// The integrator starts the actual Go listener with its trusted built frontend.
// There is deliberately no Node server, proxy or automatic webServer startup.
export default defineConfig({
  testDir: './e2e',
  testMatch: /demo-online\.spec\.ts/,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: origin ?? 'http://127.0.0.1:4174',
    browserName: 'chromium',
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  outputDir: '../test-results/m04d-demo',
  reporter: [['list']],
});
