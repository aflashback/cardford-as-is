import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
const webRequire=createRequire(new URL('../web/package.json',import.meta.url));
const vite=path.join(path.dirname(webRequire.resolve('vite/package.json')),'bin','vite.js');
const processes = [
  spawn(process.execPath, ['--watch', 'web/server/index.ts'], { stdio: 'inherit', windowsHide: true }),
  spawn(process.execPath, [vite, '--config', 'web/vite.config.ts', 'web', '--host', '127.0.0.1'], { stdio: 'inherit', windowsHide: true })
];
const stop = () => { for (const child of processes) child.kill(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of processes) child.on('exit', code => { if (code) { stop(); process.exitCode = code; } });
