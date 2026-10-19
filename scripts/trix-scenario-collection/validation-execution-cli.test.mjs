import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {main,selectValidationExecutionRoute,validationExecutionPreparationOptions} from '../trix-scenario-collection.mjs';

const repository=fileURLToPath(new URL('../../',import.meta.url));
const pilot='trix-luna-20261011-pilot';
const auditPath='reports/review-startup-rpc-preclaim-worker-stop-audit-20261013.json';
function fixture(t,{runId=pilot,rows=[]}={}){
  const root=mkdtempSync(resolve(tmpdir(),'trix-execution-cli-'));
  t.after(()=>{assert.equal(dirname(root),resolve(tmpdir()));assert.ok(basename(root).startsWith('trix-execution-cli-'));rmSync(root,{recursive:true,force:true});});
  return{root,manifest:{runId},state:()=>({rows})};
}
test('all campaign/check aliases choose new authority before older loaders',t=>{
  const c=fixture(t,{rows:[{kind:'validation-execution-amendment-authorized'}]});
  for(const command of ['campaign','campaign-check','campaign-recovery-check','campaign-context-check','campaign-reference-check','campaign-rationale-check','campaign-game-review-check','campaign-player-context-check','campaign-review-timeout-check','campaign-player-timeout-check','campaign-review-deadline-check','campaign-review-memory-check','campaign-isolated-host-stop-check','campaign-isolated-host-stop-v2-check','campaign-player-archive-cancellation-check','campaign-review-startup-rpc-check','campaign-validation-execution-check'])assert.equal(selectValidationExecutionRoute(c,command),true,command);
});
test('new check cannot silently fall back to old execution',t=>assert.throws(()=>selectValidationExecutionRoute(fixture(t),'campaign-validation-execution-check'),/not yet admitted/));
test('unrelated commands do not load execution history',()=>assert.equal(selectValidationExecutionRoute({state(){throw Error('unexpected state read');}},'pause'),false));
test('runs without the inspected stop retain old routing',t=>assert.equal(selectValidationExecutionRoute(fixture(t),'campaign'),false));
test('exact preserved pilot stop blocks blind restart',t=>{
  const c=fixture(t);mkdirSync(resolve(c.root,'reports'));
  writeFileSync(resolve(c.root,auditPath),readFileSync(resolve(repository,'.local/evaluation/trix-scenarios',pilot,auditPath)));
  assert.throws(()=>selectValidationExecutionRoute(c,'campaign'),/audited preclaim stop blocks/);
});
test('present corrupt stop artifact cannot become absent',t=>{
  const c=fixture(t);mkdirSync(resolve(c.root,'reports'));writeFileSync(resolve(c.root,auditPath),'{}');
  assert.throws(()=>selectValidationExecutionRoute(c,'campaign'),/Controlled-stop audit changed/);
});
test('non-file stop artifact fails closed',t=>{
  const c=fixture(t);mkdirSync(resolve(c.root,auditPath),{recursive:true});
  assert.throws(()=>selectValidationExecutionRoute(c,'campaign'),/regular file/);
});
test('different run does not inherit pilot stop policy',t=>{
  const c=fixture(t,{runId:'different-run'});mkdirSync(resolve(c.root,'reports'));writeFileSync(resolve(c.root,auditPath),'{}');
  assert.equal(selectValidationExecutionRoute(c,'campaign'),false);
});
test('new authority routes to its validator even if an old stop artifact is corrupt',t=>{
  const c=fixture(t,{rows:[{kind:'validation-execution-amendment-authorized',data:{invalid:true}}]});
  mkdirSync(resolve(c.root,'reports'));writeFileSync(resolve(c.root,auditPath),'{}');
  assert.equal(selectValidationExecutionRoute(c,'campaign'),true);
});
test('preparation requires independent path and externally pinned review hash',t=>{
  const c=fixture(t),h='a'.repeat(64),candidate={evidence:{sourceReviewRef:{path:'reports/review.json',sha256:h}}};
  const path=resolve(c.root,'candidate.json');writeFileSync(path,JSON.stringify(candidate));
  const o={candidate:path,'source-review':resolve(c.root,'reports/review.json'),'source-review-hash':h};
  assert.deepEqual(validationExecutionPreparationOptions(c,o),{candidate,sourceReviewHash:h});
  for(const key of ['candidate','source-review','source-review-hash']){const missing={...o};delete missing[key];assert.throws(()=>validationExecutionPreparationOptions(c,missing),/required/);}
  assert.throws(()=>validationExecutionPreparationOptions(c,{...o,'source-review-hash':'b'.repeat(64)}),/External source review hash/);
  assert.throws(()=>validationExecutionPreparationOptions(c,{...o,'source-review':resolve(c.root,'other.json')}),/path must match/);
});
test('check rejects executable options before any run or provider action',async()=>{
  await assert.rejects(main(['campaign-validation-execution-check','--run-id','absent-test','--executable','wrong']),/Unknown option --executable/);
});
