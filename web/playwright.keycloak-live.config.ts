import { defineConfig } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash, X509Certificate } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const c = JSON.parse(readFileSync(fileURLToPath(new URL('../.local/auth/config.json', import.meta.url)), 'utf8'));
const cert = new X509Certificate(readFileSync(c.tls.certFile));
const spki = createHash('sha256').update(cert.publicKey.export({type:'spki',format:'der'})).digest('base64');
export default defineConfig({
  testDir: './e2e', testMatch: 'keycloak-live.spec.ts', workers: 1, timeout: 90_000,
  metadata: { authProfile: 'keycloak-live' },
  expect: { timeout: 20_000 },
  use: { baseURL: c.origin, browserName: 'chromium', channel: 'chrome',
    launchOptions: { args: [`--ignore-certificate-errors-spki-list=${spki}`] },
    screenshot: 'only-on-failure', trace: 'off' },
  outputDir: '../test-results/keycloak-live', reporter: [['list']],
});
