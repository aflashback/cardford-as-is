// Development-only TLS termination and private native email capture. Never a hosted SMTP service.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { config, authRoot } from './auth-common.mjs';
import { backchannelServer } from './auth-backchannel.mjs';
const c = config();
const servers = [], sockets = new Set();
function track(server) { servers.push(server); server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); }); return server; }
const tls = { cert: readFileSync(c.tls.certFile), key: readFileSync(c.tls.keyFile), minVersion: 'TLSv1.2' };
function proxy(targetPort, keycloak = false) {
  const headers = request => {
    const h = { ...request.headers };
    // Only this loopback TLS terminator can set forwarding data. Origin is untouched.
    delete h.forwarded; delete h['x-forwarded-for']; delete h['x-forwarded-proto']; delete h['x-forwarded-host']; delete h['x-forwarded-port'];
    if (keycloak) Object.assign(h, { 'x-forwarded-for': '127.0.0.1', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'localhost:8443', 'x-forwarded-port': '8443' });
    return h;
  };
  const server = track(https.createServer(tls, (request, response) => {
    const expectedHost = keycloak ? 'localhost:8443' : 'localhost:4443';
    if (request.headers.host !== expectedHost) { response.writeHead(421).end(); return; }
    // Extension's privileged bypass endpoints are not used by the product.
    if (keycloak && /^\/realms\/cardford\/(magic-link|login-token)(\/|$|\?)/.test(request.url)) { response.writeHead(404).end(); return; }
    const port = keycloak ? targetPort : /^\/(api|auth)\//.test(request.url) ? 4179 : targetPort;
    const upstream = http.request({ host: '127.0.0.1', port, path: request.url, method: request.method, headers: headers(request), timeout: 15_000 }, result => {
      response.writeHead(result.statusCode, result.headers); result.pipe(response);
    });
    upstream.on('timeout', () => upstream.destroy());
    upstream.on('error', () => { if (!response.headersSent) response.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end('{"code":"SERVICE_UNAVAILABLE"}'); });
    request.on('aborted', () => upstream.destroy()); request.pipe(upstream);
  }));
  server.on('upgrade', (request, socket, head) => {
    if (keycloak || request.headers.host !== 'localhost:4443') { socket.destroy(); return; }
    const port = /^\/(api|auth)\//.test(request.url) ? 4179 : targetPort;
    const upstream = http.request({ host: '127.0.0.1', port, path: request.url, headers: headers(request) });
    let remoteSocket;
    const handshakeTimer = setTimeout(() => { upstream.destroy(); socket.destroy(); }, 5000);
    const close = () => { clearTimeout(handshakeTimer); upstream.destroy(); remoteSocket?.destroy(); };
    socket.once('close', close); socket.once('error', close);
    upstream.once('response', result => {
      // HTTP auth/origin failures are real upgrade responses, not pending WebSocket handshakes.
      clearTimeout(handshakeTimer);
      const responseHeaders = { ...result.headers, connection: 'close' };
      // IncomingMessage exposes decoded HTTP chunks. Delimit this raw socket response by close.
      delete responseHeaders['transfer-encoding']; delete responseHeaders['content-length'];
      socket.write(`HTTP/1.1 ${result.statusCode} ${result.statusMessage}\r\n${Object.entries(responseHeaders).flatMap(([k,v]) => (Array.isArray(v) ? v : [v]).map(value => `${k}: ${value}\r\n`)).join('')}\r\n`);
      result.on('error', () => socket.destroy()); result.pipe(socket);
    });
    upstream.on('upgrade', (result, remote, upstreamHead) => {
      clearTimeout(handshakeTimer); remoteSocket = remote;
      socket.write(`HTTP/1.1 ${result.statusCode} Switching Protocols\r\n${Object.entries(result.headers).flatMap(([k,v]) => (Array.isArray(v) ? v : [v]).map(value => `${k}: ${value}\r\n`)).join('')}\r\n`);
      if (head.length) remote.write(head); if (upstreamHead.length) socket.write(upstreamHead);
      remote.pipe(socket); socket.pipe(remote);
      remote.once('error', () => socket.destroy()); remote.once('close', () => socket.destroy());
    }); upstream.on('error', () => { clearTimeout(handshakeTimer); socket.destroy(); }); upstream.end();
  });
  return server;
}
const mailFile = join(authRoot, 'mail.json');
let mail = existsSync(mailFile) ? JSON.parse(readFileSync(mailFile, 'utf8')) : [];
const smtp = track(net.createServer(socket => {
  // Only the exact Podman VM source can submit development email.
  if (socket.remoteAddress !== c.resources.vmAddress) { socket.destroy(); return; }
  socket.setTimeout(30_000, () => socket.destroy()); socket.write('220 cardford-local ESMTP\r\n');
  let buffer = '', data = false, lines = [], recipient = '', size = 0;
  socket.on('data', chunk => {
    size += chunk.length;
    if (size > 1 << 20) { socket.destroy(); return; }
    buffer += chunk.toString('utf8');
    while (buffer.includes('\r\n')) {
      const end = buffer.indexOf('\r\n'), line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
      if (data) {
        if (line === '.') {
          mail.unshift({ id: randomUUID(), to: recipient, receivedAt: new Date().toISOString(), raw: lines.join('\r\n') });
          mail = mail.slice(0, 50); writeFileSync(mailFile, JSON.stringify(mail), { mode: 0o600 });
          data = false; lines = []; socket.write('250 captured locally\r\n');
        } else lines.push(line.startsWith('..') ? line.slice(1) : line);
      } else if (/^(EHLO|HELO)\b/i.test(line)) socket.write('250-cardford-local\r\n250 SIZE 1048576\r\n');
      else if (/^MAIL FROM:/i.test(line)) socket.write('250 OK\r\n');
      else if (/^RCPT TO:/i.test(line)) { recipient = line.slice(8).trim(); socket.write('250 OK\r\n'); }
      else if (/^DATA$/i.test(line)) { data = true; socket.write('354 End with dot\r\n'); }
      else if (/^QUIT$/i.test(line)) socket.end('221 Bye\r\n');
      else if (/^RSET$/i.test(line)) { lines = []; recipient = ''; socket.write('250 OK\r\n'); }
      else socket.write('502 Unsupported\r\n');
    }
  }); socket.on('error', () => {});
}));
const esc = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const inbox = track(http.createServer((req, res) => {
  if (!['127.0.0.1:8026', 'localhost:8026'].includes(req.headers.host)) { res.writeHead(421).end(); return; }
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
  if (req.method !== 'GET') { res.writeHead(405).end(); return; }
  if (req.url === '/messages') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(mail)); return; }
  if (req.url !== '/') { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><title>CardFord local email</title><style>body{font:16px system-ui;max-width:900px;margin:40px auto}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eee;padding:20px}</style><h1>CardFord local email</h1><p>Development capture. Refresh for new email. Messages remain private in .local/auth/mail.json.</p>${mail.map(m => `<h2>${esc(m.to)}</h2><p>${esc(m.receivedAt)}</p><pre>${esc(m.raw)}</pre>`).join('')}`);
}));
function stop() { for (const socket of sockets) socket.destroy(); for (const server of servers) server.close(); setTimeout(() => process.exit(0), 50).unref(); }
const control = track(http.createServer((req, res) => {
  const actual = Buffer.from(req.headers.authorization ?? ''), expected = Buffer.from(`Bearer ${c.controlToken}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) { res.writeHead(404).end(); return; }
  if (req.method === 'GET' && req.url === '/status') { res.end('cardford-local-auth'); return; }
  if (req.method !== 'POST' || req.url !== '/stop') { res.writeHead(404).end(); return; }
  res.end('Stopping owned auth processes.'); setTimeout(stop, 10);
}));
process.on('SIGINT', stop); process.on('SIGTERM', stop);
proxy(4178).listen(4443, '127.0.0.1'); proxy(8180, true).listen(8443, '127.0.0.1');
track(backchannelServer(tls, c.resources.vmAddress)).listen(4444, c.resources.gateway);
smtp.listen(c.email.smtpPort, c.resources.gateway); inbox.listen(8026, '127.0.0.1'); control.listen(4180, '127.0.0.1');
for (const server of servers) server.on('error', error => { console.error(`Local auth listener failed (${error.code}).`); stop(); process.exitCode = 1; });
console.log('Local TLS and native SMTP capture ready. Inbox: http://127.0.0.1:8026');
