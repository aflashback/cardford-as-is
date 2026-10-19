// Explicitly reevaluate selection using a new frozen offline exporter. Player
// packets, moves, native build, original manifest and original archives stay pinned.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { preserveBuild, resolveBuild, sourceDigest } from '../coach-lab-builds.mjs';
import { repository, sourceHashes } from './runner.mjs';
import { selectionPolicyVersion } from './curate.mjs';
import { appendEvent, jsonBytes, putBlob, safePath, sha, withRunLock } from './journal.mjs';

const reason='Exclude Basic request decisions after all scoring cards have settled in completed public tricks; interleave eligible stages within each physical deal family, giving verified corrections priority within otherwise balanced stages. Preserve raw decisions, rationale reviews and prior selected-case identities.';
const nativeSource=name=>name==='go.mod'||name==='go.sum'||name.startsWith('server/');
export function verifyNativeCompatibility(originalHashes,currentHashes) {
  const original=Object.keys(originalHashes).filter(nativeSource).sort(),current=Object.keys(currentHashes).filter(nativeSource).sort();
  assert.ok(original.includes('go.mod')&&original.includes('go.sum')&&original.some(name=>name.startsWith('server/')),'Original native source graph is missing');
  assert.deepEqual(current,original,'Native source file set changed; derived selection cannot reuse the original binary');
  for(const name of original)assert.equal(currentHashes[name],originalHashes[name],`Native source changed: ${name}; preserve original run and use a separately reviewed native migration`);
}
export function assertDerivationQuiescent(root,state) {
  const driver=safePath(root,'private/driver.lock');
  if(existsSync(driver)){
    const owner=JSON.parse(readFileSync(driver,'utf8'));assert.ok(Number.isInteger(owner.pid)&&owner.pid>0,'Invalid driver ownership receipt');
    let alive=true;try{process.kill(owner.pid,0);}catch(error){if(error.code==='ESRCH')alive=false;}
    assert.equal(alive,false,'Stop the live collection driver before derived export');
  }
  assert.ok(!state.claimed&&!state.intent,'Settle the outstanding player dispatch/commit intent before derived export');
  assert.ok(!(state.episode||state.pending)||state.paused===true,'Pause the active request before derived export; preserve its checkpoint');
  const rows=state.rows??[];
  assert.ok(!rows.some(row=>row.kind==='review-dispatch-claimed'&&!rows.some(done=>done.kind==='review-attempt-settled'&&done.data.jobId===row.data.job.jobId)),'Settle the outstanding reviewer dispatch before derived export');
}
const evidenceDigest=state=>sha(jsonBytes({commits:state.commits,reviews:state.reviews,outcomes:state.outcomes,checkpoint:{episode:state.episode??null,frameRef:state.frameRef??null,pending:state.pending??null,claimed:state.claimed??null,intent:state.intent??null,paused:state.paused??false}}));
export async function deriveSelectionExport(originalCollector) {
  const root=originalCollector.root;
  const prepared=withRunLock(root,()=>{
    const original=JSON.parse(readFileSync(safePath(root,'manifest.json'),'utf8'));
    assert.deepEqual(originalCollector.manifest,original,'Derived export requires the untouched original collector manifest');
    assert.ok(original.build&&original.sourceHashes,'Original preserved build required for selection audit');
    const state=originalCollector.state();assertDerivationQuiescent(root,state);
    const pinned=resolveBuild(root,original.sourceHashes,{sourceDigest:original.build.sourceDigest,binaryDigest:original.build.binaryDigest});
    const hashes=sourceHashes();verifyNativeCompatibility(original.sourceHashes,hashes);
    const pins={sourceDigest:sourceDigest(hashes),binaryDigest:original.build.binaryDigest};
    const frozen=preserveBuild(root,repository,hashes,pins,pinned.binaryPath);
    const audit={schemaVersion:'trix-selection-audit-1.0.1',selectionPolicyVersion,originalSourceDigest:original.build.sourceDigest,selectionSourceDigest:pins.sourceDigest,nativeBinaryDigest:pins.binaryDigest,originalManifestHash:sha(jsonBytes(original)),reason};
    const auditRef=putBlob(root,{...audit,originalSourceHashes:original.sourceHashes,selectionSourceHashes:hashes,selectionBuild:{...pins,sourceArchive:frozen.sourceRoot,binaryPath:frozen.binaryPath}});
    // Bind a reviewed-state snapshot so a concurrent player/review change cannot
    // silently become part of this prepared derivation after its archive is made.
    return {original,hashes,pins,frozen,audit:{...audit,auditRef},evidenceDigest:evidenceDigest(state)};
  });
  const evaluator=await import(pathToFileURL(resolve(prepared.frozen.sourceRoot,'scripts/trix-scenario-collection/export.mjs')).href);
  const facade={
    root,
    manifest:{...prepared.original,sourceHashes:prepared.hashes,build:{...prepared.original.build,...prepared.pins,sourceArchive:prepared.frozen.sourceRoot,binaryPath:prepared.frozen.binaryPath}},
    selectionAudit:prepared.audit,
    native:originalCollector.native.bind(originalCollector),
    replay:originalCollector.replay.bind(originalCollector),
    status:originalCollector.status.bind(originalCollector),
    state:()=>{
      const state=originalCollector.state();
      assertDerivationQuiescent(root,state);
      assert.equal(evidenceDigest(state),prepared.evidenceDigest,'Evidence or checkpoint changed during derived selection preparation; retry the explicit audit');
      return state;
    },
  };
  const publication=evaluator.exportCases(facade);
  return withRunLock(root,()=>{
    assert.deepEqual(JSON.parse(readFileSync(safePath(root,'manifest.json'),'utf8')),prepared.original,'Original manifest changed during selection audit');
    const publicationRef=putBlob(root,publication.source);
    const event=appendEvent(root,'selection-audit',{...prepared.audit,evidenceDigest:prepared.evidenceDigest,derivedPublication:publication.directory,derivedPublicationRef:publicationRef});
    return {...publication,selectionAudit:prepared.audit,selectionAuditSequence:event.sequence};
  });
}
