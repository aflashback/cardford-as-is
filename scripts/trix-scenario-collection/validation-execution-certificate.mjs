// Exact-head input verification; no claim, dispatch, import or admission authority.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {recheckFsFootprint} from './validation-execution-footprint.mjs';
export const certificateVersion='trix-full-current-loader-certificate-1.0.0';
const bytes=x=>Buffer.from(JSON.stringify(x)+'\n'),sha=b=>createHash('sha256').update(b).digest('hex');
const sync=value=>{assert.equal(Boolean(value&&typeof value.then==='function'),false,'Certificate callbacks must finish synchronously');return value};
export function verifyCurrentLoaderCertificate(certificate,{certificateBytes,expectedCertificateHash,expectedLoaderHash,expectedTrackerHash,expectedLatest,expectedNonFsInputs,bareCollector,readCurrentState,assertCurrentState,fsModule=fs}={}){
  // Pins must come from separately admitted immutable wrapper authorization;
  // an arbitrary caller-provided good result is not campaign authorization.
  assert.equal(sha(certificateBytes),expectedCertificateHash,'Certificate pin changed');
  assert.deepEqual(JSON.parse(certificateBytes),certificate);
  assert.equal(certificate.schemaVersion,certificateVersion);assert.ok(!process.env.NODE_OPTIONS&&!process.env.NODE_PATH,'Ambient Node bootstrap options forbidden');
  assert.equal(certificate.loaderSourceHash,expectedLoaderHash);
  assert.equal(certificate.trackerSourceHash,expectedTrackerHash);
  assert.deepEqual(certificate.nonFsInputs,expectedNonFsInputs,'Non-filesystem inputs changed');
  assert.ok(bareCollector?.root && bareCollector?.manifest);
  const envReads=Object.fromEntries(Object.keys(certificate.nonFsInputs.environmentReads??{}).map(key=>{const value=process.env[key];return[key,value===undefined?{present:false}:{present:true,sha256:sha(Buffer.from(value))}]}));
  assert.deepEqual(certificate.nonFsInputs,{runRoot:resolve(bareCollector.root).replaceAll('\\','/'),manifestHash:sha(bytes(bareCollector.manifest)),sourceRoot:resolve(bareCollector.sourceRoot).replaceAll('\\','/'),templateRoot:resolve(bareCollector.templateRoot).replaceAll('\\','/'),platform:process.platform,arch:process.arch,nodeVersion:process.version,nativeBinaryDigest:bareCollector.manifest.build.binaryDigest,cwd:process.cwd().replaceAll('\\','/'),execPath:process.execPath.replaceAll('\\','/'),execArgv:[...process.execArgv],environmentReads:envReads},'Live collector/environment inputs changed');
  assert.deepEqual(certificate.result,expectedLatest,'Full frozen loader result changed');
  assert.equal(certificate.resultHash,sha(bytes(certificate.result)));
  assert.equal(certificate.journalPath,resolve(bareCollector.root,'private/journal.jsonl').replaceAll('\\','/'),'Certificate journal path differs from actual collector');
  const physicalBefore=fsModule.readFileSync(certificate.journalPath);assert.equal(sha(physicalBefore),certificate.journalHash,'Physical journal bytes changed');const state=sync(readCurrentState()),journalBytes=Buffer.concat(state.rows.map(bytes));
  assert.equal(sha(journalBytes),certificate.journalHash,'New journal head requires fresh full original loader');
  assert.deepEqual({sequence:state.rows.at(-1)?.sequence??0,hash:state.rows.at(-1)?.hash??'0'.repeat(64)},certificate.journalBoundary);
  recheckFsFootprint(certificate.footprint,{fsModule,verifyJournalPrefix:effect=>{assert.equal(effect.path,certificate.journalPath,'Footprint journal path changed');assert.equal(effect.sha256,certificate.journalHash);assert.equal(effect.bytes,journalBytes.length)}});
  // No hand-written substitute for ancestor rules: the ORIGINAL full loader
  // ran for this exact head; its source+all inputs are freshly byte-rechecked.
  // Current all-row cap/pause guard is also called, never cached as a boolean.
  assert.ok(bareCollector?.root && bareCollector?.manifest);const view=Object.create(bareCollector);view.state=()=>state;
  const dynamic=sync(assertCurrentState(view,expectedLatest,state));
  const after=sync(readCurrentState());assert.equal(sha(Buffer.concat(after.rows.map(bytes))),certificate.journalHash,'Journal changed during certificate verification');assert.equal(sha(fsModule.readFileSync(certificate.journalPath)),certificate.journalHash,'Physical journal changed during verification');
  return{latest:certificate.result,state:{...state,paused:dynamic.paused},journalHash:certificate.journalHash};
}







