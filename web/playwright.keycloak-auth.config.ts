import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir:'./e2e',testMatch:'keycloak-auth.spec.ts',workers:1,timeout:20_000,
  metadata:{authProfile:'keycloak-mocked'},
  use:{baseURL:'http://127.0.0.1:4198',browserName:'chromium',channel:'chrome',trace:'retain-on-failure'},
  outputDir:'../test-results/keycloak-auth',reporter:[['list']],
  webServer:{command:'node web/node_modules/vite/bin/vite.js web --config web/vite.config.ts --host 127.0.0.1 --port 4198',
    cwd:fileURLToPath(new URL('../',import.meta.url)),url:'http://127.0.0.1:4198',reuseExistingServer:false,timeout:20_000,
    env:{VITE_AUTH_MODE:'keycloak',VITE_BACKEND:'go',VITE_KEYCLOAK_ORIGIN:'https://localhost:8443'}},
});
