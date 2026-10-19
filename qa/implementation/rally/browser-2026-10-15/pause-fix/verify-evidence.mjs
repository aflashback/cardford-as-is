import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read=name=>JSON.parse(readFileSync(new URL(name,import.meta.url),'utf8'));
const result=read('browser-results.json');
assert.equal(result.modes.length,7);
assert.equal(new Set(result.modes.map(item=>item.mode)).size,7);
for(const item of result.modes){
  for(const key of ['menus','explicitDismissal','accountReturnPaused','backgroundReturnPaused'])assert.equal(item[key],true,`${item.mode}/${key}`);
  const state=read(`${item.mode}-account-return.json`);
  assert.equal(state.dialog,'Game paused');
  assert.deepEqual(state.buttons.map(button=>button.label),['Resume game','Settings','Choose game']);
  assert.ok(state.buttons.every(button=>!button.disabled));
  assert.ok(existsSync(new URL(`${item.mode}-account-return.jpg`,import.meta.url)));
  const snapshots=result.network.filter(event=>event.label===`${item.mode}-account-return`&&event.kind==='snapshot');
  assert.ok(snapshots.length);assert.ok(snapshots.every(event=>event.running===false));
}
const responses=result.network.filter(event=>event.kind==='response');
assert.ok(responses.length>=28);assert.ok(responses.every(event=>event.status===200));
assert.ok(Object.values(result.extras).every(value=>value===true));
const final=read('review-ready.json');assert.equal(final.dialog,'Game paused');

const receiptPath=new URL('../../../../../.local/rally-review/server.json',import.meta.url);
const receipt=JSON.parse(readFileSync(receiptPath));
const dist=new URL('../../../../../web/dist/',import.meta.url);
const html=readFileSync(new URL('index.html',dist),'utf8');
assert.equal(await (await fetch(receipt.url)).text(),html);
receipt.batch='latest-pause-fix';receipt.assetSmoke=[];
for(const [,asset]of html.matchAll(/(?:src|href)="(\/assets\/[^\"]+\.(?:js|css))"/g)){
  const response=await fetch(receipt.url+asset),bytes=Buffer.from(await response.arrayBuffer());
  assert.equal(response.status,200);assert.deepEqual(bytes,readFileSync(new URL(asset.slice(1),dist)));
  receipt.assetSmoke.push({asset,status:response.status,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
assert.equal(receipt.assetSmoke.length,2);
receipt.verifiedAt=new Date().toISOString();writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n');
const verified={modes:result.modes.length,successfulPlaybackResponses:responses.length,nativePid:receipt.nativePid,assets:receipt.assetSmoke};
writeFileSync(new URL('verified-evidence.json',import.meta.url),JSON.stringify(verified,null,2)+'\n');
console.log(JSON.stringify(verified,null,2));
