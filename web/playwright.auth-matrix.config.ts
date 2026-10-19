import { defineConfig } from '@playwright/test';
import authConfig from './playwright.keycloak-auth.config';

// Critical browser-coordinator checks only. Auth/API responses are mocked;
// this profile does not exercise Keycloak, TLS, cookies, or live game sockets.
export default defineConfig(authConfig, {
  grep: /authenticated account hides fixture billing|an idle account makes no recurring requests|returning from the public demo verifies again|remembered access requires explicit Continue/,
  use: { ...authConfig.use, channel: undefined },
  projects: [
    { name: 'chrome', use: { browserName: 'chromium', channel: 'chrome' } },
    { name: 'firefox', use: { browserName: 'firefox', channel: undefined } },
    { name: 'webkit', use: { browserName: 'webkit', channel: undefined } },
  ],
  outputDir: '../test-results/auth-matrix',
  reporter: [
    ['list'],
    ['json', { outputFile: '../test-results/auth-matrix.json' }],
  ],
});
