import assert from 'node:assert/strict';
import {readFile,stat,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const directory=fileURLToPath(new URL('.',import.meta.url));
const root=resolve(directory,'../../../../..');
const summary=JSON.parse(await readFile(resolve(directory,'summary.json'),'utf8'));
assert.equal(summary.total,64);
assert.equal(new Set(summary.cases.map(item=>item.name)).size,64);
assert.deepEqual(summary.failures,[]);
for(const item of summary.cases) {
  const saved=JSON.parse(await readFile(resolve(directory,`${item.name}.json`),'utf8'));
  assert.equal(saved.context.mode,'complex-partners');
  assert.equal(saved.measure.request.buttons.length,2);
  assert.equal(saved.measure.request.inline,null,`${item.name}: no inherited trick coordinates`);
  assert.ok(Math.abs(saved.measure.request.dx)<=1&&Math.abs(saved.measure.request.dy)<=1);
  assert.ok(Object.values(saved.checks).every(check=>check!==false),item.name);
  assert.match(saved.captureMethod,/getScreenshot/);
  assert.ok((await stat(resolve(directory,`${item.name}.jpg`))).size>1000);
}
const origin='http://127.0.0.1:4174';
const health=await (await fetch(`${origin}/api/health`)).json();
assert.deepEqual(health,{identity:'local-test',mode:'local',payments:'fixture',provider:'off',status:'ready'});
const servedIndex=await (await fetch(origin)).text();
const localIndex=await readFile(resolve(root,'web/dist/index.html'),'utf8');
assert.equal(servedIndex,localIndex,'The actual game serves this checkout build');
const assets=[];
for(const [,path] of localIndex.matchAll(/(?:src|href)="(\/assets\/[^\"]+\.(?:js|css))"/g)) {
  const local=await readFile(resolve(root,'web/dist',path.slice(1)));
  const response=await fetch(`${origin}${path}`);
  assert.equal(response.status,200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),local);
  assets.push({path,bytes:local.length,sha256:createHash('sha256').update(local).digest('hex')});
}
assert.equal(assets.length,2);
const verified={verifiedAt:new Date().toISOString(),url:origin,health,cases:64,
  matrix:'21 CSS viewports (18 landscape presets plus reported/breakpoint cases) x 3 Coach preferences; 1 restored native view',
  maximumCenterError:Math.max(...summary.cases.flatMap(item=>[Math.abs(item.dx),Math.abs(item.dy)])),
  assets,scope:'Rendered current Complex Partners two-choice request; five-choice compact allocation covered by source tests, not live Basic-game captures'};
await writeFile(resolve(directory,'verified.json'),JSON.stringify(verified,null,2)+'\n');
console.log(JSON.stringify(verified,null,2));
