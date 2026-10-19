import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTrixActorPacket } from '../shared/validation.ts';

// Shape fixtures; native chronology tests establish reachability and legality.
function packet(version='1.2.0') {
 const scores=[{id:'NS',seats:[0,2],total:0},{id:'EW',seats:[1,3],total:0}];
 return {publicSchemaVersion:version,gameId:'trix',variantId:'basic-partners',seat:0,phase:'layout',observation:{id:'shape-fixture',gameId:'trix',variantId:'basic-partners',seat:0,phase:'layout',turn:0,kingdom:1,dealNumber:1,owner:0,request:'trix',remainingRequests:[],hand:['CJ'],handCounts:[1,1,1,1],trick:[],tricks:[],declarations:[],board:['C','D','H','S'].map(suit=>({suit,low:0,high:0})),finishOrder:[],passes:[],ledger:[],withheldBonuses:[],lastExternalLeader:[null,null,null,null],totals:scores,requestTotals:scores,kingdomTotals:scores,winners:[],layoutHistory:{version:'1.0.0',status:'available',turns:[] as object[]}},candidates:[{id:'layout:CJ',public:{kind:'layout-card',card:'CJ'}}]};
}

test('current Trix packets require bounded public chronology and old packets cannot acquire it',()=>{
 const p=packet();assert.equal(validateTrixActorPacket(p),true,JSON.stringify(validateTrixActorPacket.errors));
 const absent=structuredClone(p) as unknown as {observation:Record<string,unknown>};delete absent.observation.layoutHistory;assert.equal(validateTrixActorPacket(absent),false);
 for(const version of ['1.0.0','1.1.0']){
  const old=packet(version);assert.equal(validateTrixActorPacket(old),false,'Historical packet must not acquire new information');
  delete (old.observation as unknown as Record<string,unknown>).layoutHistory;assert.equal(validateTrixActorPacket(old),true);
 }
 const solo=packet('1.1.0');delete (solo.observation as unknown as Record<string,unknown>).layoutHistory;solo.variantId=solo.observation.variantId='basic-solo';assert.equal(validateTrixActorPacket(solo),false);
 const turn={ordinal:1,seat:0,kind:'layout-card',card:'CJ',boardBefore:p.observation.board,handCountsBefore:[13,13,13,13],twoAnnouncementsBefore:null};
 p.observation.layoutHistory.turns=[turn];assert.equal(validateTrixActorPacket(p),true);
 for(const changed of [{...turn,hand:['SA']},{...turn,ordinal:0},{...turn,kind:'layout-pass'},{...turn,handCountsBefore:[13,13]},{...turn,twoAnnouncementsBefore:{status:'hidden',counts:[1,1,1,1],cards:[{seat:1,card:'S2'}]}}]){
  p.observation.layoutHistory.turns=[changed];assert.equal(validateTrixActorPacket(p),false,JSON.stringify(changed));
 }
 p.observation.layoutHistory.turns=Array.from({length:209},()=>turn);assert.equal(validateTrixActorPacket(p),false);
 const pass={...turn,kind:'layout-pass'} as Record<string,unknown>;delete pass.card;p.observation.layoutHistory.turns=[pass];assert.equal(validateTrixActorPacket(p),true);
});
