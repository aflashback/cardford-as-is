import assert from 'node:assert/strict';
import { trixPinForPublicSchema } from './trix-pins.ts';
import {createHash} from 'node:crypto';
import {existsSync,readdirSync,readFileSync,realpathSync} from 'node:fs';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {validateRecord,type DecisionRecord,type JsonObject} from './contracts.ts';
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
type Row={decisionId:string;status:string;evidencePath?:string;evidenceDigest?:string};

// Native hashes cover compact JSON bytes, including Go's number/string spelling.
// Keep those tokens instead of parsing and serializing them with JS semantics.
function rawMembers(text:string){
 const members=new Map<string,string>();let i=0;
 const whitespace=()=>{while(i<text.length&&/\s/.test(text[i]))i++;};
 whitespace();assert.equal(text[i++],'{','Expected native JSON object');
 while(true){
  whitespace();if(text[i]==='}'){i++;break;}
  const start=i;assert.equal(text[i++],'"');let escaped=false;
  while(i<text.length){const c=text[i++];if(escaped){escaped=false;continue;}if(c==='\\'){escaped=true;continue;}if(c==='"')break;}
  const key=JSON.parse(text.slice(start,i)) as string;assert.ok(!members.has(key),'Duplicate native JSON member');
  whitespace();assert.equal(text[i++],':');whitespace();const valueStart=i;
  let depth=0,quoted=false;escaped=false;
  for(;i<text.length;i++){
   const c=text[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
   if(c==='"')quoted=true;else if(c==='{'||c==='[')depth++;else if(c==='}'||c===']'){if(depth===0)break;depth--;}else if(c===','&&depth===0)break;
  }
  const raw=text.slice(valueStart,i);let compact='',inString=false;escaped=false;
  for(const c of raw){if(inString){compact+=c;if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')inString=false;}else if(c==='"'){inString=true;compact+=c;}else if(!/\s/.test(c))compact+=c;}
  members.set(key,compact);whitespace();if(text[i]===','){i++;continue;}assert.equal(text[i++],'}');break;
 }
 whitespace();assert.equal(i,text.length,'Trailing native JSON');return members;
}

/** Private detail objects are checked for immutable identity, then excluded. */
export function loadEvaluationEvidence(out:string,manifestHash:string,decisions:DecisionRecord[],configurationHash?:string){
 if(configurationHash!==undefined)assert.match(configurationHash,/^[a-f0-9]{64}$/,'Exact evaluation configuration hash required');
 const missing=()=>({evaluations:[] as JsonObject[],inferences:[] as JsonObject[],coverage:{status:'not-run',totalDecisions:decisions.length,pending:decisions.length,stored:0,configurationHash:null}});
 const root=join(out,'evaluations');if(!existsSync(root)){assert.equal(configurationHash,undefined,'Selected evaluation configuration is absent');return missing();}
 const configs=readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory()&&/^[a-f0-9]{64}$/.test(d.name)).map(d=>d.name);
 assert.ok(configurationHash?configs.includes(configurationHash):configs.length<=1,'Select --evaluation-config-hash; multiple evaluators cannot be mixed');
 const selected=configurationHash??configs[0];if(!selected)return missing();
 const folder=join(root,selected),batches=join(folder,'batches');assert.ok(existsSync(batches),'Evaluation sidecars require a native batch receipt');
 const rows=new Map<string,Row>(),receipts:JsonObject[]=[],original=new Map(decisions.map(d=>[d.decisionId,d]));
 assert.equal(original.size,decisions.length,'Duplicate original decision identity');
 for(const file of readdirSync(batches).filter(f=>/^[a-f0-9]{64}\.json$/.test(f)).sort()){
  const raw=readFileSync(join(batches,file));assert.equal(raw.at(-1),10,'Truncated evaluation receipt');assert.equal(sha(raw.subarray(0,-1)),file.slice(0,-5),'Evaluation receipt digest mismatch');
  const source=raw.toString('utf8'),r=JSON.parse(source) as JsonObject,members=rawMembers(source);
  assert.deepEqual(Object.keys(r).sort(),['schemaVersion','status','manifestHash','configurationHash','configuration','totalDecisions','unsupported','pending','stored','completed','insufficient','attemptedNew','existingVerified','decisions','limitations'].sort(),'Unknown batch field');
  assert.equal(r.schemaVersion,'coach-lab-evaluation-batch-receipt-1.0.0');assert.equal(r.manifestHash,manifestHash);assert.equal(r.configurationHash,selected);
  assert.equal(sha(members.get('configuration')!),selected,'Evaluation configuration payload digest mismatch');
  const config=r.configuration as JsonObject;assert.ok(config&&Object.keys(config).every(key=>['schemaVersion','beliefs','comparison','trixComparison','maxWallMs','maxDecisionMs'].includes(key)),'Unknown evaluation configuration field');
  assert.equal(r.totalDecisions,decisions.length,'Evaluation denominator mismatch');assert.ok(Array.isArray(r.decisions));
  const batchRows=r.decisions as Row[];assert.deepEqual(batchRows.map(row=>row.decisionId).sort(),decisions.map(d=>d.decisionId).sort(),'Evaluation decision set mismatch');
  for(const row of batchRows){
   assert.ok(Object.keys(row).every(k=>['decisionId','status','evidencePath','evidenceDigest'].includes(k)),'Unknown evaluation row field');assert.ok(original.has(row.decisionId));
   assert.ok(['pending','pending-timeout','pending-analysis-error','unsupported','completed','incomplete','insufficient'].includes(row.status),'Unknown evaluation row status');
   assert.equal(Boolean(row.evidencePath),Boolean(row.evidenceDigest),'Incomplete evidence identity');
   const old=rows.get(row.decisionId);
   if(old?.evidencePath&&row.evidencePath)assert.deepEqual(row,old,'Immutable evidence identity changed between batches');
   if(row.evidencePath||!old)rows.set(row.decisionId,row);
  }
  receipts.push(r);
 }
 assert.ok(receipts.length,'No native evaluation batch receipt');const evaluations:JsonObject[]=[],inferences:JsonObject[]=[];let stored=0,unsupported=0;
 for(const [id,row] of rows){
  if(row.status==='unsupported')unsupported++;if(!row.evidencePath)continue;
  assert.equal(row.evidencePath,'evaluations/'+selected+'/'+sha(id)+'.json','Evidence path identity mismatch');assert.ok(row.evidenceDigest&&/^[a-f0-9]{64}$/.test(row.evidenceDigest),'Native evidence digest required');
  const path=realpathSync(resolve(out,row.evidencePath)),rel=relative(realpathSync(folder),path);assert.ok(!rel.startsWith('..')&&!isAbsolute(rel),'Evidence path escapes evaluator');
  const bytes=readFileSync(path);assert.equal(sha(bytes),row.evidenceDigest,'Evidence file digest mismatch');assert.equal(bytes.at(-1),10,'Truncated evidence envelope');
  const source=bytes.toString('utf8'),s=JSON.parse(source) as JsonObject,members=rawMembers(source);
  assert.deepEqual(Object.keys(s).sort(),['schemaVersion','manifestHash','configurationHash','inputDigest','payloadDigest','evidence'].sort(),'Unknown evidence envelope field');
  assert.equal(s.schemaVersion,'coach-lab-saved-evidence-1.0.0');assert.equal(s.manifestHash,manifestHash);assert.equal(s.configurationHash,selected);assert.equal(s.inputDigest,original.get(id)!.inputDigest,'Evidence actor input mismatch');
  assert.equal(sha(members.get('evidence')!),s.payloadDigest,'Evidence payload digest mismatch');
  const evidence=s.evidence as JsonObject;assert.equal(evidence.schemaVersion,'coach-lab-decision-evidence-1.0.0');assert.equal(evidence.decisionId,id);assert.equal(evidence.status,row.status,'Evidence row status mismatch');
  assert.ok(Object.keys(evidence).every(k=>['schemaVersion','decisionId','status','inference','evaluation','beliefDetails','comparisonDetails','trixComparisonDetails','limitations'].includes(k)),'Unknown evidence payload field');
  if(evidence.inference){const summary=validateRecord<JsonObject>('inference',evidence.inference);assert.equal(summary.decisionId,id,'Inference identity mismatch');inferences.push(summary);}
  if(evidence.evaluation){
   const summary=validateRecord<JsonObject>('evaluation',evidence.evaluation);assert.equal(summary.decisionId,id,'Evaluation identity mismatch');
   const legal=new Set(original.get(id)!.legalCandidates.map(candidate=>candidate.id));
   for(const action of [...summary.testedActions as string[],...summary.untestedActions as string[],...(summary.values as JsonObject[]).map(value=>String(value.actionId))])assert.ok(legal.has(action),'Evaluation action is not original legal action');
   if(evidence.trixComparisonDetails){
    assert.equal(original.get(id)!.actorPacket.gameId,'trix','Trix comparison attached to another module');
    const detail=evidence.trixComparisonDetails as JsonObject,config=detail.configuration as JsonObject,result=detail.result as JsonObject;
    assert.equal(config.decisionId,id,'Trix comparison decision identity mismatch');assert.equal(config.originalId,original.get(id)!.selectedCandidateId,'Trix comparison original action mismatch');
    const pin=result.rulePin as JsonObject,actor=original.get(id)!.actorPacket;
    assert.deepEqual(pin,trixPinForPublicSchema(actor.variantId,actor.publicSchemaVersion),'Trix evidence exact native rule pin mismatch');
   }
   evaluations.push(summary);
  }
  stored++;
 }
 return {evaluations,inferences,coverage:{status:'conditional-diagnostics',configurationHash:selected,totalDecisions:decisions.length,stored,unsupported,pending:decisions.length-stored-unsupported,batchReceipts:receipts.map(r=>({status:r.status,pending:r.pending,stored:r.stored,completed:r.completed,insufficient:r.insufficient,limitations:r.limitations})),limitations:['Private belief/rollout details are not judge inputs.','Conditional evaluator output is not domain truth or proof of a better policy.']}};
}
