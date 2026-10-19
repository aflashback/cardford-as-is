import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read=name=>JSON.parse(readFileSync(new URL(name,import.meta.url),'utf8'));
const before=read('before-solo-592.json'),after=read('after-solo-592.json');
assert.ok(after.measure.tableCards[0].width>=36);
assert.ok(after.measure.tableCards[0].width/before.measure.tableCards[0].width>=1.6);
let captures=0;
for(const name of readdirSync(new URL('.',import.meta.url)).filter(name=>name.endsWith('.json')&&!name.startsWith('verified-'))){
  const value=read(name);
  if(!value.measure)continue;
  assert.deepEqual(Object.entries(value.checks).filter(([,pass])=>pass===false),[],name);
  assert.ok(Math.abs(value.measure.jacksFeltCenter.dx)<.1,name);
  assert.ok(Math.abs(value.measure.jacksFeltCenter.dy)<.1,name);
  captures++;
}
for(const size of ['se1','se','iphone12','ipad','desktop']){
  const live=read(`coach-${size}.json`).measure,saved=read(`why-${size}.json`).measure;
  for(const key of ['jacksBoard','jacksGeometry','jacksLanes','jacksRows'])assert.deepEqual(saved[key],live[key],`${size}/${key}`);
}

const receiptPath=new URL('../../../../../.local/rally-review/server.json',import.meta.url);
const receipt=JSON.parse(readFileSync(receiptPath));
const dist=new URL('../../../../../web/dist/',import.meta.url);
const html=readFileSync(new URL('index.html',dist),'utf8');
assert.equal(await (await fetch(receipt.url)).text(),html,'served HTML must match the final build');
receipt.batch='latest-jacks-coach';receipt.assetSmoke=[];
for(const [,asset]of html.matchAll(/(?:src|href)="(\/assets\/[^\"]+\.(?:js|css))"/g)){
  const response=await fetch(receipt.url+asset),bytes=Buffer.from(await response.arrayBuffer());
  assert.equal(response.status,200);
  assert.deepEqual(bytes,readFileSync(new URL(asset.slice(1),dist)));
  receipt.assetSmoke.push({asset,status:response.status,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
assert.equal(receipt.assetSmoke.length,2);
receipt.verifiedAt=new Date().toISOString();writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n');
const result={captures,matchedLiveWhySizes:5,cardWidthBefore:before.measure.tableCards[0].width,
  cardWidthAfter:after.measure.tableCards[0].width,assets:receipt.assetSmoke,nativePid:receipt.nativePid};
writeFileSync(new URL('verified-evidence.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
