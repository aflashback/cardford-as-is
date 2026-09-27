import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({ testDir: '.', testMatch: /.*\.spec\.ts/, workers: 1, use: { baseURL: 'http://127.0.0.1:5175', browserName: 'chromium', channel: 'chrome' }, webServer: { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5175', cwd: fileURLToPath(new URL('../', import.meta.url)), url: 'http://127.0.0.1:5175', reuseExistingServer: false } });
