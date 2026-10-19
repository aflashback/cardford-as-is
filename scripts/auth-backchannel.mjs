// Private local bridge for signed provider logout. It never forwards browser
// credentials; the Go endpoint independently verifies each OIDC logout token.
import https from 'node:https';
import http from 'node:http';

export function backchannelAllowed(request, vmAddress) {
  return request.source === vmAddress && request.host === 'cardford-db:4444' &&
    request.method === 'POST' && request.path === '/auth/backchannel-logout' &&
    /^application\/x-www-form-urlencoded(?:\s*;.*)?$/i.test(request.contentType ?? '');
}

export function backchannelServer(tls, vmAddress) {
  return https.createServer(tls, (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (!backchannelAllowed({source:request.socket.remoteAddress, host:request.headers.host,
      method:request.method, path:request.url, contentType:request.headers['content-type']}, vmAddress)) {
      response.writeHead(404).end(); request.resume(); return;
    }
    let size = 0;
    const chunks = [];
    request.setTimeout(5000, () => request.destroy());
    request.on('data', chunk => {
      size += chunk.length;
      if (size > 16 * 1024) { response.writeHead(413).end(); request.destroy(); return; }
      chunks.push(chunk);
    });
    request.on('error', () => { if (!response.writableEnded) response.destroy(); });
    request.on('end', () => {
      if (response.writableEnded) return;
      const body = Buffer.concat(chunks);
      const upstream = http.request({host:'127.0.0.1', port:4179, path:'/auth/backchannel-logout', method:'POST',
        headers:{Host:'localhost:4443', 'Content-Type':'application/x-www-form-urlencoded', 'Content-Length':body.length},
        timeout:5000}, result => {
        response.writeHead(result.statusCode, {'Content-Type':'application/json'});
        result.pipe(response);
      });
      upstream.on('timeout', () => upstream.destroy());
      upstream.on('error', () => { if (!response.headersSent) response.writeHead(503); response.end(); });
      response.once('close', () => upstream.destroy());
      upstream.end(body);
    });
  });
}
