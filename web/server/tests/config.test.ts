import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../config.ts';

const local = { APP_ENV:'local', IDENTITY_MODE:'local-test', BILLING_MODE:'fixture', DATABASE_URL:'postgres://test@127.0.0.1/tricks', HOST:'127.0.0.1', PORT:'4173', APP_ORIGIN:'http://127.0.0.1:4173' };
test('local fixtures require explicit loopback local configuration', () => {
  assert.equal(readConfig(local).identityMode, 'local-test');
  assert.throws(() => readConfig({ ...local, APP_ENV:'production' }), /hosted|Hosted/);
  assert.throws(() => readConfig({ ...local, HOST:'0.0.0.0' }), /loopback/);
  assert.throws(() => readConfig({ ...local, APP_ENV:undefined }), /APP_ENV/);
});
test('hosted startup cannot quietly accept unimplemented managed identity', () => {
  assert.throws(() => readConfig({ ...local, APP_ENV:'staging', IDENTITY_MODE:'managed', BILLING_MODE:'stripe-test' }), /managed identity/);
});
test('unknown flags, ports and public secrets are rejected', () => {
  assert.throws(() => readConfig({ ...local, PORT:'oops' }), /PORT/);
  assert.throws(() => readConfig({ ...local, JEV_MODE:'auto' }), /JEV_MODE/);
  assert.throws(() => readConfig({ ...local, VITE_OPENROUTER_API_KEY:'fake-canary' }), /VITE_/);
});
