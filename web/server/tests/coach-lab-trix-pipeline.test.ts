import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {validateDecision} from '../evaluation/multi-game/lab/contracts.ts';
import {exportBlindPacket} from '../evaluation/multi-game/lab/packets.ts';
import {buildRetrospectivePacket} from '../evaluation/multi-game/lab/retrospective.ts';
import * as retrospective from '../evaluation/multi-game/lab/retrospective.ts';
import {loadEvaluationEvidence} from '../evaluation/multi-game/lab/evidence.ts';

function layoutDecision(announcements:object,revision=0){
 const action={kind:'layout-card',card:'CJ'};
 return validateDecision({schemaVersion:'coach-lab-decision-1.0.0',decisionId:'trix-d-'+revision,familyId:'f1',episodeId:'e1',revision,actor:0,phase:'layout',executionStatus:'committed',forced:true,policyPin:{seat:0,id:'trix-deterministic-1.0.0',version:'1.0.0'},inputDigest:'a'.repeat(64),actorPacket:{publicSchemaVersion:'1.1.0',gameId:'trix',variantId:'basic-partners',seat:0,phase:'layout',observation:{id:'private-session',gameId:'trix',variantId:'basic-partners',seat:0,phase:'layout',turn:0,kingdom:1,dealNumber:1,owner:0,request:'trix',remainingRequests:['diamonds','lutoosh','queens','king'],hand:['C2','CJ'],handCounts:[2,2,2,2],trick:[],tricks:[],declarations:[],board:['C','D','H','S'].map(suit=>({suit,low:0,high:0})),finishOrder:[],passes:[],ledger:[],withheldBonuses:[],lastExternalLeader:[null,null,null,null],totals:[{id:'NS',seats:[0,2],total:0},{id:'EW',seats:[1,3],total:0}],requestTotals:[{id:'NS',seats:[0,2],total:0},{id:'EW',seats:[1,3],total:0}],kingdomTotals:[{id:'NS',seats:[0,2],total:0},{id:'EW',seats:[1,3],total:0}],winners:[],twoAnnouncements:announcements},candidates:[{id:'layout:CJ',public:action}]},legalCandidates:[{id:'layout:CJ',action}],selectedCandidateId:'layout:CJ',registeredAnalysis:{},originalAnalysis:{},originalAdvice:{},audit:{status:'pending',checks:[]}});
}

// Projection fixtures exercise archived public DTO transport, not a complete
// native deal. Each turn retains exactly the announcement visible before it.
const emptyBoard=['C','D','H','S'].map(suit=>({suit,low:0,high:0}));
const hiddenTwos={status:'hidden',counts:[1,1,1,1]};
const revealedTwos={status:'revealed',cards:[{seat:0,card:'C2'},{seat:1,card:'D2'},{seat:2,card:'H2'},{seat:3,card:'S2'}]};
const layoutTurns=[
 {ordinal:1,seat:0,kind:'layout-card',card:'CJ',boardBefore:emptyBoard,handCountsBefore:[13,13,13,13],twoAnnouncementsBefore:hiddenTwos},
 {ordinal:2,seat:3,kind:'layout-pass',boardBefore:emptyBoard.map(row=>row.suit==='C'?{...row,low:11,high:11}:row),handCountsBefore:[12,13,13,13],twoAnnouncementsBefore:hiddenTwos},
 {ordinal:3,seat:2,kind:'layout-card',card:'HJ',boardBefore:emptyBoard.map(row=>row.suit==='C'?{...row,low:11,high:11}:row),handCountsBefore:[12,13,13,13],twoAnnouncementsBefore:hiddenTwos},
 {ordinal:4,seat:1,kind:'layout-card',card:'DJ',boardBefore:emptyBoard.map(row=>['C','H'].includes(row.suit)?{...row,low:11,high:11}:row),handCountsBefore:[12,13,12,13],twoAnnouncementsBefore:hiddenTwos},
 {ordinal:5,seat:0,kind:'layout-card',card:'C10',boardBefore:emptyBoard.map(row=>['C','D','H'].includes(row.suit)?{...row,low:11,high:11}:row),handCountsBefore:[12,12,12,13],twoAnnouncementsBefore:revealedTwos},
];
function chronologyDecision(turns=layoutTurns,revision=5,dealNumber=1){
 const old=layoutDecision(turns.length>=4?revealedTwos:hiddenTwos,revision);
 return validateDecision({...old,actorPacket:{...old.actorPacket,publicSchemaVersion:'1.2.0',observation:{...old.actorPacket.observation,dealNumber,layoutHistory:{version:'1.0.0',status:'available',turns}}}});
}

function chronologyAppends(events:Record<string,unknown>[]):Record<string,unknown>[] {
 return events.flatMap(event=>{
  const append=(event.changes as Record<string,unknown>|undefined)?.layoutHistoryAppend as Record<string,unknown>|undefined;
  return append?[{revision:event.revision,...append}]:[];
 });
}

test('chronology blind export preserves decision-time turns and unchanged Partners rules',()=>{
 const decision=chronologyDecision(layoutTurns.slice(0,4),4);
 const packet=exportBlindPacket(decision);
 assert.equal(packet.ruleProfile,'trix-basic-partners-1.1.0');
 assert.deepEqual((packet.actorPacket.observation as unknown as Record<string,unknown>).layoutHistory,{version:'1.0.0',status:'available',turns:layoutTurns.slice(0,4)});
 assert.deepEqual(JSON.parse(JSON.stringify(packet)),packet);
 assert.ok(!JSON.stringify(packet).includes('private-session'));
 const history=(packet.actorPacket.observation as unknown as {layoutHistory:{turns:Record<string,unknown>[]}}).layoutHistory;
 assert.ok(history.turns.every(turn=>(turn.twoAnnouncementsBefore as {status:string}).status==='hidden'));
 assert.ok(!JSON.stringify(history).includes('"C2"'),'Fourth turn must not gain later revealed suits');
 const legacy=exportBlindPacket(layoutDecision(hiddenTwos));
 assert.equal(Object.hasOwn(legacy.actorPacket.observation,'layoutHistory'),false);
 const soloObservation={...decision.actorPacket.observation,variantId:'basic-solo',layoutHistory:{version:'1.0.0',status:'available',turns:[]}} as unknown as Record<string,unknown>;
 delete soloObservation.twoAnnouncements;
 const solo=exportBlindPacket({...decision,actorPacket:{...decision.actorPacket,variantId:'basic-solo',observation:soloObservation}});
 assert.equal(solo.ruleProfile,'trix-basic-solo-1.0.0');
});

test('blind export rejects unsupported Trix public schemas and Solo announcement profiles',()=>{
 const decision=layoutDecision(hiddenTwos);
 assert.throws(()=>exportBlindPacket({...decision,actorPacket:{...decision.actorPacket,publicSchemaVersion:'9.0.0'}}));
 assert.throws(()=>exportBlindPacket({...decision,actorPacket:{...decision.actorPacket,variantId:'basic-solo',observation:{...decision.actorPacket.observation,variantId:'basic-solo'}}}),/schema|Trix|RegisteredActorPacket|Invalid/);
});

test('retrospective appends each chronological turn once and resets between deals',()=>{
 const opening=chronologyDecision([],0),four=chronologyDecision(layoutTurns.slice(0,4),4),five=chronologyDecision(layoutTurns,5);
 const duplicate=structuredClone(five);duplicate.decisionId='same-revision';
 const next=chronologyDecision([],50,2),nextTurn=chronologyDecision(layoutTurns.slice(0,1),51,2);
 const absent=layoutDecision(hiddenTwos,70);(absent.actorPacket.observation as unknown as Record<string,unknown>).dealNumber=3;
 const later=chronologyDecision(layoutTurns.slice(0,1),90,4);
 const packet=buildRetrospectivePacket(opening,[opening,four,five,duplicate,next,nextTurn,absent,later],{episodes:[{episodeId:'e1',status:'complete',outcome:{scores:[100,0],winner:null,winnerSeats:[0,2],winnerIds:['NS'],rounds:20}}]});
 const events=packet.retrospective!.publicHistory as Record<string,unknown>[];
 assert.equal(events.filter(event=>event.kind==='executed-public-action'&&event.revision===5).length,1,'Repeated archived revision must not replay the same executed move twice');
 const appends=chronologyAppends(events);
 assert.deepEqual(appends.map(event=>({revision:event.revision,startIndex:event.startIndex,ordinals:(event.entries as {ordinal:number}[]).map(turn=>turn.ordinal)})),[
  {revision:4,startIndex:0,ordinals:[1,2,3,4]},{revision:5,startIndex:4,ordinals:[5]},{revision:51,startIndex:0,ordinals:[1]},{revision:90,startIndex:0,ordinals:[1]},
 ]);
 const changes=events.filter(event=>event.kind==='public-observation'&&Object.hasOwn(event.changes as object,'layoutHistory'));
 assert.deepEqual(changes.map(event=>({revision:event.revision,value:(event.changes as Record<string,unknown>).layoutHistory})),[
  {revision:0,value:{version:'1.0.0',status:'available',turns:[]}},{revision:50,value:{version:'1.0.0',status:'available',turns:[]}},{revision:70,value:null},{revision:90,value:{version:'1.0.0',status:'available',turns:[]}},
 ]);
 const decoded=retrospective.decodeRetrospectiveLayoutTurns(packet.retrospective!.layoutHistoryEncoding,appends[0]!.entries as Record<string,unknown>[]);
 assert.deepEqual(decoded,layoutTurns.slice(0,4));
 assert.deepEqual(retrospective.decodeRetrospectiveLayoutTurns(packet.retrospective!.layoutHistoryEncoding,appends[1]!.entries as Record<string,unknown>[],decoded.at(-1)),layoutTurns.slice(4));
 assert.deepEqual(retrospective.decodeRetrospectiveLayoutTurns(packet.retrospective!.layoutHistoryEncoding,appends[2]!.entries as Record<string,unknown>[]),layoutTurns.slice(0,1));
 assert.equal(new Set(events.map(event=>event.id)).size,events.length);
 for(const event of events)assert.ok(packet.evidenceRefs.includes(String(event.id)));
 assert.ok(!JSON.stringify(packet.retrospective).includes('"hand"'));
 const changed=chronologyDecision(layoutTurns.map(turn=>turn.ordinal===1?{...turn,seat:1}:turn),6);
 assert.throws(()=>buildRetrospectivePacket(opening,[opening,four,changed],{episodes:[{episodeId:'e1',status:'complete',outcome:{scores:[100,0]}}]}),/cumulative history changed/);
});

test('retrospective chronology uses lossless versioned snapshots only at anchors and changes',()=>{
 const opening=chronologyDecision([],0),four=chronologyDecision(layoutTurns.slice(0,4),4),five=chronologyDecision(layoutTurns,5);
 const packet=buildRetrospectivePacket(opening,[opening,four,five],{episodes:[{episodeId:'e1',status:'complete',outcome:{scores:[100,0]}}]});
 assert.equal(packet.retrospective!.layoutHistoryEncoding,'trix-layout-turn-delta-1.0.0');
 const events=packet.retrospective!.publicHistory as Record<string,unknown>[];
 const appends=chronologyAppends(events);
 const first=appends[0]!.entries as Record<string,unknown>[],last=appends[1]!.entries as Record<string,unknown>[];
 assert.deepEqual(first[0],layoutTurns[0]);
 for(const turn of [...first.slice(1),...last]){
  assert.equal(Object.hasOwn(turn,'boardBefore'),false,'Replay the previous captured action instead of copying its board');
  assert.equal(Object.hasOwn(turn,'handCountsBefore'),false,'Replay the previous captured action instead of copying its counts');
 }
 for(const turn of first.slice(1))assert.equal(Object.hasOwn(turn,'twoAnnouncementsBefore'),false);
 assert.deepEqual(last[0]!.twoAnnouncementsBefore,revealedTwos,'The reveal belongs only to the fifth pre-turn snapshot');
 const decode=retrospective.decodeRetrospectiveLayoutTurns;
 const decoded=decode(packet.retrospective!.layoutHistoryEncoding,first);
 assert.deepEqual(decoded,layoutTurns.slice(0,4));
 assert.ok(!JSON.stringify(decoded).includes('"C2"'),'An earlier prefix must not use a later suit reveal');
 assert.deepEqual(decode(packet.retrospective!.layoutHistoryEncoding,last,decoded.at(-1)),layoutTurns.slice(4));
 assert.ok(Buffer.byteLength(JSON.stringify([...first,...last]))<Buffer.byteLength(JSON.stringify(layoutTurns))/2);
 assert.throws(()=>decode('trix-layout-turn-delta-9.0.0',first),/encoding/);
 assert.throws(()=>decode(packet.retrospective!.layoutHistoryEncoding,first.slice(1)),/anchor|ordinal|TrixLayoutTurn/);
 assert.throws(()=>decode(packet.retrospective!.layoutHistoryEncoding,[{...last[0],ordinal:6}],decoded.at(-1)),/ordinal/);
 assert.throws(()=>decode(packet.retrospective!.layoutHistoryEncoding,[{...last[0],secret:'not-public'}],decoded.at(-1)),/TrixLayoutTurn/);
 const clear=[{...last[0],twoAnnouncementsBefore:null}];
 assert.equal(decode(packet.retrospective!.layoutHistoryEncoding,clear,decoded.at(-1))[0]!.twoAnnouncementsBefore,null,'Explicit null clears a prior announcement');
 assert.deepEqual(decode(packet.retrospective!.layoutHistoryEncoding,first),layoutTurns.slice(0,4),'A new deal starts from its own anchor');
 const supplied={...layoutTurns[4]!,boardBefore:emptyBoard,handCountsBefore:[9,9,9,9]};
 const overridden=chronologyDecision([...layoutTurns.slice(0,4),supplied],5);
 const overriddenPacket=buildRetrospectivePacket(opening,[opening,four,overridden],{episodes:[{episodeId:'e1',status:'complete',outcome:{scores:[100,0]}}]});
 const overriddenAppends=chronologyAppends(overriddenPacket.retrospective!.publicHistory as Record<string,unknown>[]);
 assert.deepEqual(decode(overriddenPacket.retrospective!.layoutHistoryEncoding,overriddenAppends[1]!.entries as Record<string,unknown>[],decoded.at(-1)),[supplied],'Explicit archived snapshots must survive even when they differ from the derived state');
});

test('blind Trix packets bind rules to the exact public schema and preserve announcement visibility',()=>{
 const hidden=layoutDecision({status:'hidden',counts:[1,1,1,1]});
 const packet=exportBlindPacket(hidden);
 assert.equal(packet.ruleProfile,'trix-basic-partners-1.1.0');
 assert.deepEqual((packet.actorPacket.observation as unknown as {twoAnnouncements:object}).twoAnnouncements,{status:'hidden',counts:[1,1,1,1]});
 assert.ok(!JSON.stringify(packet).includes('private-session'));
 const historical=structuredClone(hidden);historical.actorPacket.publicSchemaVersion='1.0.0';delete (historical.actorPacket.observation as unknown as Record<string,unknown>).twoAnnouncements;
 assert.equal(exportBlindPacket(historical).ruleProfile,'trix-basic-partners-1.0.0');
});

test('Trix retrospective records public count then suit announcements without other-seat hands',()=>{
 const hidden=layoutDecision({status:'hidden',counts:[1,1,1,1]});
 const revealed=layoutDecision({status:'revealed',cards:[{seat:0,card:'C2'},{seat:1,card:'D2'},{seat:2,card:'H2'},{seat:3,card:'S2'}]},4);
 const packet=buildRetrospectivePacket(hidden,[hidden,revealed],{episodes:[{episodeId:'e1',status:'complete',outcome:{scores:[100,0],winner:null,winnerSeats:[0,2],winnerIds:['NS'],rounds:20}}]});
 const history=packet.retrospective!.publicHistory as {changes?:{twoAnnouncements?:object}}[];
 assert.deepEqual(history.flatMap(event=>event.changes?.twoAnnouncements?[event.changes.twoAnnouncements]:[]),[{status:'hidden',counts:[1,1,1,1]},{status:'revealed',cards:[{seat:0,card:'C2'},{seat:1,card:'D2'},{seat:2,card:'H2'},{seat:3,card:'S2'}]}]);
 assert.ok(!JSON.stringify(packet.retrospective).includes('"hand"'));
});

test('Trix retrospective clears absent next-deal announcements and emits identical later announcements',()=>{
 const announcement={status:'revealed',cards:[{seat:0,card:'C2'},{seat:1,card:'D2'},{seat:2,card:'H2'},{seat:3,card:'S2'}]};
 const revealed=layoutDecision(announcement,4);
 // These are projection fixtures: a later layout without an announcement can
 // occur when all twos belong to one team. They are not complete native deals.
 const absent=structuredClone(layoutDecision(announcement,50));
 const absentObservation=absent.actorPacket.observation as unknown as Record<string,unknown>;
 absentObservation.dealNumber=2;delete absentObservation.twoAnnouncements;
 const stillAbsent=structuredClone(absent);stillAbsent.revision=51;stillAbsent.decisionId='trix-d-51';
 const later=structuredClone(layoutDecision(announcement,70));
 (later.actorPacket.observation as unknown as Record<string,unknown>).dealNumber=3;
 const packet=buildRetrospectivePacket(revealed,[revealed,absent,stillAbsent,later],{episodes:[{episodeId:'e1',status:'complete',outcome:{scores:[100,0],winner:null,winnerSeats:[0,2],winnerIds:['NS'],rounds:20}}]});
 const history=packet.retrospective!.publicHistory as {revision:number;kind:string;changes?:Record<string,unknown>}[];
 const updates=history.filter(event=>event.kind==='public-observation'&&Object.hasOwn(event.changes!,'twoAnnouncements'));
 assert.deepEqual(updates.map(event=>({revision:event.revision,value:event.changes!.twoAnnouncements})),[
  {revision:4,value:announcement},{revision:50,value:null},{revision:70,value:announcement},
 ]);
 const state:Record<string,unknown>={};
 for(const event of history.filter(event=>event.kind==='public-observation')){
  Object.assign(state,event.changes);
  if(event.revision===50)assert.equal(state.twoAnnouncements,null,'Prior-deal revealed owners must be cleared');
 }
 assert.deepEqual(state.twoAnnouncements,announcement);
});

for(const [publicSchemaVersion,moduleVersion,ruleVersion] of [['1.0.0','2.0.0','1.0.0'],['1.1.0','2.1.0','1.1.0'],['1.2.0','2.2.0','1.1.0']])test(`Trix ${publicSchemaVersion} evidence rejects a mixed native profile even when archive digests agree`,()=>{
 const out=mkdtempSync(join(tmpdir(),'trix-evidence-pin-')),sha=(text:string)=>createHash('sha256').update(text).digest('hex');
 try{
  const previous=layoutDecision(hiddenTwos),observation=structuredClone(previous.actorPacket.observation) as unknown as Record<string,unknown>;
  if(publicSchemaVersion==='1.0.0')delete observation.twoAnnouncements;
  if(publicSchemaVersion==='1.2.0')observation.layoutHistory={version:'1.0.0',status:'available',turns:[]};
  const d=validateDecision({...previous,actorPacket:{...previous.actorPacket,publicSchemaVersion,observation}}),manifest='a'.repeat(64);
  const request={version:'trix-request-evaluation-1.0.0',worlds:1,maxSamplerOperations:1000,maxSteps:1000,policies:Array(4).fill('trix-deterministic-1.0.0'),stream:'comparison'};
  const template={version:'coach-lab-trix-comparison-1.0.0',decisionId:'',originalId:'',request};
  const configuration={schemaVersion:'coach-lab-evaluation-batch-1.0.0',comparison:{},trixComparison:template,maxWallMs:1000,maxDecisionMs:1000},config=sha(JSON.stringify(configuration)),folder=join(out,'evaluations',config);
  mkdirSync(join(folder,'batches'),{recursive:true});
  const summary={schemaVersion:'coach-lab-evaluation-1.0.0',decisionId:d.decisionId,status:'completed',objective:'paired-actor-request-margin-difference',horizon:'current-request',assumptions:[],testedActions:['layout:CJ'],untestedActions:[],evidenceRefs:[],values:[{actionId:'layout:CJ',value:0,lower:0,upper:0,worlds:1}],limitations:['Conditional only.']};
  const pin={gameId:'trix',variantId:'basic-partners',moduleVersion,ruleProfileId:'trix-basic-partners-'+ruleVersion,publicSchemaVersion,observationSchemaVersion:publicSchemaVersion,stateSchemaVersion:publicSchemaVersion,eventSchemaVersion:'1.0.0'};
  let previousBatch:string|undefined;
  function save(rulePin:object){
   const detail={summary,configuration:{...template,decisionId:d.decisionId,originalId:d.selectedCandidateId},result:{version:'trix-request-evaluation-1.0.0',rulePin,status:'completed',inputDigest:'b'.repeat(64),candidateIds:['layout:CJ'],values:[[0]],work:{samplerOperations:4,steps:3,worlds:1,attempts:1},limitations:[]}};
   const evidence={schemaVersion:'coach-lab-decision-evidence-1.0.0',decisionId:d.decisionId,status:'completed',evaluation:summary,trixComparisonDetails:detail,limitations:[]};
   const relative=`evaluations/${config}/${sha(d.decisionId)}.json`,sidecar=JSON.stringify({schemaVersion:'coach-lab-saved-evidence-1.0.0',manifestHash:manifest,configurationHash:config,inputDigest:d.inputDigest,payloadDigest:sha(JSON.stringify(evidence)),evidence})+'\n';
   writeFileSync(join(out,relative),sidecar);
   const batch={schemaVersion:'coach-lab-evaluation-batch-receipt-1.0.0',status:'processed',manifestHash:manifest,configurationHash:config,configuration,totalDecisions:1,unsupported:0,pending:0,stored:1,completed:1,insufficient:0,attemptedNew:1,existingVerified:0,decisions:[{decisionId:d.decisionId,status:'completed',evidencePath:relative,evidenceDigest:sha(sidecar)}],limitations:[]};
   if(previousBatch)rmSync(previousBatch);const bytes=JSON.stringify(batch);previousBatch=join(folder,'batches',sha(bytes)+'.json');writeFileSync(previousBatch,bytes+'\n');
  }
  save({...pin,eventSchemaVersion:'9.0.0'});assert.throws(()=>loadEvaluationEvidence(out,manifest,[d]),/profile|version|pin/i);
  if(publicSchemaVersion==='1.2.0'){save({...pin,ruleProfileId:'trix-basic-partners-1.2.0'});assert.throws(()=>loadEvaluationEvidence(out,manifest,[d]),/profile|version|pin/i);}
  save(pin);const loaded=loadEvaluationEvidence(out,manifest,[d]);assert.equal(loaded.evaluations.length,1);assert.ok(!JSON.stringify(loaded.evaluations).includes('trixComparisonDetails'));
 }finally{rmSync(out,{recursive:true,force:true});}
});
