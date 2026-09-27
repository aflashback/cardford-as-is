import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// Worktrees can reuse installed dependencies through junctions. Only the app and
// its dependency directories are served; never add the repository/credential root.
export default defineConfig({ plugins: [react()], server: { host: '127.0.0.1', port: 5175, strictPort: true, fs: { allow: [fileURLToPath(new URL('../', import.meta.url)), realpathSync(fileURLToPath(new URL('../node_modules', import.meta.url))), realpathSync(fileURLToPath(new URL('../../node_modules', import.meta.url)))] } } });
