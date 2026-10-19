// Uses the installed lockfile-pinned Playwright CLI and workspace-only runtimes.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../web/package.json', import.meta.url));
const cli = resolve(dirname(require.resolve('playwright/package.json')), 'cli.js');
const forwarded = process.argv.slice(2);
const install = forwarded[0] === '--install';
if (install && forwarded.length !== 1) {
  throw new Error('Use --install alone to install the pinned Firefox/WebKit runtimes.');
}
const args = install
  ? ['install', 'firefox', 'webkit']
  : ['test', '--config', 'web/playwright.auth-matrix.config.ts', ...forwarded];
const child = spawn(process.execPath, [cli, ...args], {
  cwd: root,
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: resolve(root, '.local/auth/playwright-browsers'),
  },
  stdio: 'inherit',
  windowsHide: true,
});
child.on('error', error => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
