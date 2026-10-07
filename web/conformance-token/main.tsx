import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { PlatformSessionView, LocalServicePrepareView, LocalServiceDecisionView,
  TokenActorPacket, TokenPresentation } from '../shared/local-service.contracts.ts';
import { assertContract } from '../shared/local-service.validation.ts';
import { TokenConformanceTable } from '../src/api/tokenConformance.ts';

const tab=sessionStorage.getItem('m06-tab')??`m06-${crypto.randomUUID()}`;sessionStorage.setItem('m06-tab',tab);
const headers={'X-Tricks-Tab':tab,'X-Tricks-Client':'1','Content-Type':'application/json'};
async function api(path:string,body?:unknown):Promise<unknown>{const response=await fetch(path,{method:body===undefined?'GET':'POST',headers,credentials:'same-origin',...(body===undefined?{}:{body:JSON.stringify(body)})});const value:unknown=await response.json();if(!response.ok)throw Error(`${path}: HTTP ${response.status} ${JSON.stringify(value)}`);return value;}
async function current(){const value=await api('/api/platform/session');assertContract('PlatformSessionView',value);return value;}
function binding(wire:PlatformSessionView){const s=wire.session;if(!s)throw Error('No confirmed token session');const lease=sessionStorage.getItem(`m06-lease:${s.gameId}`);if(!lease)throw Error('Lease recovery required');return {gameId:s.gameId,expectedRevision:s.revision,controlLeaseToken:lease};}
async function prepared(wire:PlatformSessionView,purpose:'human-analysis'|'bot-action'|'coach-advice'){
 const value=await api('/api/session/prepare',{...binding(wire),purpose});assertContract('LocalServicePrepareView',value);const deadline=performance.now()+15000;
 for(const id of value.workIds){while(true){const work=await api(`/api/work/${id}`);assertContract('LocalServicePrepareView',work);if(work.status==='completed'){if(id===value.workId)value.decisionId=work.decisionId;break;}if(work.status==='rejected'||work.status==='canceled'||performance.now()>deadline)throw Error('Token preparation did not complete');await new Promise(resolve=>setTimeout(resolve,25));}}
 return value;
}
async function settle(wire:PlatformSessionView){for(let i=0;i<30;i++){const s=wire.session;if(!s||s.node.kind==='session-complete'||s.node.kind==='actor'&&s.node.actor===0)return wire;
 const body={commandId:crypto.randomUUID(),...binding(wire)};
 if(s.node.kind==='actor'){const p=await prepared(wire,'bot-action');await api('/api/session/advance',{...body,kind:'bot',preparedDecisionId:p.preparedDecisionId});}
 else if(s.node.kind==='automatic')await api('/api/session/advance',{...body,kind:'automatic',transitionId:s.node.transitionId});else throw Error('Unsupported numeric fixture lifecycle');wire=await current();}throw Error('Token lifecycle budget');}

function App(){
 const [wire,setWire]=useState<PlatformSessionView|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[advice,setAdvice]=useState<LocalServiceDecisionView|null>(null);
 const run=async(work:()=>Promise<void>)=>{setBusy(true);setError('');try{await work();}catch(error){setError(error instanceof Error?error.message:String(error));}finally{setBusy(false);}};
 useEffect(()=>{void run(async()=>{await api('/api/local/session',{});setWire(await settle(await current()));});},[]);
 const start=(variant:'individual'|'neighbour-teams')=>void run(async()=>{const prior=wire?.session;const receipt=await api('/api/sessions',{commandId:crypto.randomUUID(),selector:{gameId:'test-token',variantId:variant,moduleVersion:'2.0.0',ruleProfileId:'token-conformance-1.0.0'},expectedActiveGameId:prior?.gameId??null,expectedRevision:prior?.revision??null,controlLeaseToken:prior?binding(wire!).controlLeaseToken:null});assertContract('LocalServiceCommandReceipt',receipt);if(!receipt.controlLeaseToken)throw Error('Missing confirmed lease');sessionStorage.setItem(`m06-lease:${receipt.gameId}`,receipt.controlLeaseToken);setAdvice(null);setWire(await settle(await current()));});
 const reveal=(candidateId:string)=>void run(async()=>{if(!wire)throw Error('No confirmed table');const p=await prepared(wire,'human-analysis');await api('/api/session/actions',{commandId:crypto.randomUUID(),...binding(wire),candidateId,preparedDecisionId:p.preparedDecisionId,preparedWorkIds:p.workIds});setWire(await settle(await current()));});
 const coach=()=>void run(async()=>{if(!wire?.session)throw Error('No confirmed table');const key=`m06-advice:${wire.session.gameId}`;let id=sessionStorage.getItem(key);if(!id){await api('/api/access/unlocks',{commandId:crypto.randomUUID(),...binding(wire),toolId:'advice'});const p=await prepared(wire,'coach-advice');id=p.decisionId??null;if(!id)throw Error('Missing saved advice identity');sessionStorage.setItem(key,id);}const saved=await api(`/api/decisions/${id}`);assertContract('LocalServiceDecisionView',saved);setAdvice(saved);});
 const s=wire?.session;let packet:TokenActorPacket|null=null;let display:TokenPresentation|null=null;
 if(s){if('gameId' in s.presentation&&s.presentation.gameId==='test-token')display=s.presentation;else throw Error('Test host returned a card presentation');if(s.actor){if(s.actor.gameId!=='test-token')throw Error('Test host returned a card packet');packet=s.actor;}}
 return <main><h1>Actual token service conformance</h1><p role="status" aria-label="Fixture status">{error?'Failed':busy?'Working':'Ready'}</p>{error&&<p role="alert">{error}</p>}
 <button disabled={busy} onClick={()=>start('individual')}>Start individual</button><button disabled={busy} onClick={()=>start('neighbour-teams')}>Start neighbour teams</button>
 {s&&display&&<><p>Confirmed revision: <output aria-label="Confirmed revision">{s.revision}</output></p><p>Lifecycle: <output aria-label="Lifecycle">{s.node.kind}</output></p>
 <TokenConformanceTable presentation={display} packet={packet} busy={busy} onReveal={reveal}/><button disabled={busy||(!packet&&!sessionStorage.getItem(`m06-advice:${s.gameId}`))} onClick={coach}>Show saved advice</button></>}
 {advice&&<output aria-label="Saved original advice"><p>{advice.advice.notice}</p><p>{advice.advice.reason}</p><p>{advice.advice.suggestion}</p><p>Source: {advice.advice.source}</p></output>}</main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
