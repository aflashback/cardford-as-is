import test from 'node:test';
import assert from 'node:assert/strict';
import { backchannelAllowed } from './auth-backchannel.mjs';

test('provider bridge admits only the exact VM, host, route and form POST', () => {
  const vmAddress = '172.17.74.11';
  const request = { source: vmAddress, host: 'cardford-db:4444', method: 'POST',
    path: '/auth/backchannel-logout', contentType: 'application/x-www-form-urlencoded' };
  assert.equal(backchannelAllowed(request, vmAddress), true);
  for (const patch of [{source:'127.0.0.1'}, {source:'192.168.1.2'}, {host:'localhost:4443'},
    {method:'GET'}, {path:'/api/identity'}, {path:'/auth/backchannel-logout?x=1'}, {contentType:'application/json'}]) {
    assert.equal(backchannelAllowed({...request,...patch}, vmAddress), false);
  }
});
