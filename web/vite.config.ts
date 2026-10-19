import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { Agent, ServerResponse } from 'node:http';
const devApi = process.env.CARDFORD_DEV_API_ORIGIN;
if (devApi && !/^http:\/\/127\.0\.0\.1:\d+$/.test(devApi)) throw Error('The watched Go backend must use a loopback origin.');
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy: { '/api': devApi ? {
    target: devApi, changeOrigin: true, ws: true,
    // Reuse a bounded pool instead of opening a Windows loopback socket per poll.
    agent: new Agent({ keepAlive: true, maxSockets: 8, maxFreeSockets: 4, timeout: 15_000 }),
    proxyTimeout: 6_000,
    configure(proxy) {
      proxy.on('proxyReq', (request, incoming) => {
        // A dev-only same-origin proxy; keep the native listener's origin check intact.
        if (incoming.headers.origin === 'http://127.0.0.1:4174') request.setHeader('origin', devApi);
      });
      proxy.on('proxyReqWs', (request, incoming) => {
        if (incoming.headers.origin === 'http://127.0.0.1:4174') request.setHeader('origin', devApi);
      });
      proxy.on('error', (_error, _request, response) => {
        if (response instanceof ServerResponse && !response.headersSent) {
          response.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          response.end(JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: 'Connection unavailable. Reconnect to continue.' }));
        }
      });
    },
  } : 'http://127.0.0.1:4173' } },
  build: { target: 'es2020', sourcemap: false, assetsInlineLimit: 0 },
});
