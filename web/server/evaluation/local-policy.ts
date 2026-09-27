import {readFileSync,writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createGame,fullDeck,apply,collectTrick,type Mode,type Seat,type Card,type Four,type GameAction} from '../game/index.ts';
import {observe,type SeatObservation} from '../observations/index.ts';
import {chooseAction,POLICY_VERSION} from '../strategy/index.ts';
type Policy='local-baseline-1.0.0'|'first-legal-1.0.0';
type Manifest={id:string;seedSplit:{development:number[];heldOut:number[]};modes:Mode[];actorSeats:Seat[];candidatePolicies:Policy[];opponentPolicies:Policy[];budget:{hands:number;maxTransitionsPerHand:number;networkRequests:number};limitations:string[]};
type Row={mode:Mode;seed:number;seat:Seat;candidate:Policy;opponent:Policy;handScore:number;tricks:number;bid:number|null;contractMet:boolean|null;nilSuccess:boolean|null};
function deckFor(seed:number):Card[]{const deck=fullDeck();let state=seed;for(let i=51;i>0;i--){state=(Math.imul(state,1664525)+1013904223)>>>0;const j=state%(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}return deck;}
function choose(obs:SeatObservation,policy:Policy):GameAction{if(policy===POLICY_VERSION)return chooseAction(obs);if(policy!=='first-legal-1.0.0')throw new Error('Unsupported evaluation policy.');return structuredClone(obs.legalActions[0]);}
export function runPolicySmoke(manifestPath:string,outputPath:string):void{
 const raw=readFileSync(manifestPath,'utf8');const manifest=JSON.parse(raw) as Manifest;
 if(manifest.budget.networkRequests!==0||manifest.budget.hands>500||manifest.budget.maxTransitionsPerHand>100||manifest.seedSplit.heldOut.some(seed=>seed>=manifest.seedSplit.development[0]&&seed<=manifest.seedSplit.development[1]))throw new Error('Invalid bounded evaluation manifest.');
 const rows:Row[]=[];const started=performance.now();
 for(const mode of manifest.modes)for(const seed of manifest.seedSplit.heldOut)for(const seat of manifest.actorSeats)for(const opponent of manifest.opponentPolicies)for(const candidate of manifest.candidatePolicies){
  if(rows.length>=manifest.budget.hands)throw new Error('Evaluation hand budget exceeded.');
  let state=createGame({id:'synthetic-evaluation',mode,dealer:seed%4 as Seat},deckFor(seed));
  for(let n=0;n<manifest.budget.maxTransitionsPerHand&&!['hand-end','match-end'].includes(state.phase);n++){
   if(state.phase==='trick-end')state=collectTrick(state);
   else if(state.phase==='pass'){
    // All pass commitments use unchanged pre-exchange observations.
    const passes=([0,1,2,3] as Seat[]).map(actor=>{const action=choose(observe(state,actor),actor===seat?candidate:opponent);if(action.kind!=='pass')throw new Error('Expected pass');return action.cards;}) as Four<Card[]>;state=apply(state,{kind:'pass-bundle',passes});
   }else{const actor=state.turn!;const action=choose(observe(state,actor),actor===seat?candidate:opponent);if(action.kind==='pass')throw new Error('Unexpected pass');state=apply(state,action);}
  }
  if(!state.handResult||state.history.length!==13||!['hand-end','match-end'].includes(state.phase))throw new Error(`Nonterminating fixture ${mode}/${seed}/${seat}`);
  const group:Seat[]=mode==='spades-partners'?[seat,((seat+2)%4) as Seat]:[seat];const bid=state.bids[seat];const contract=group.reduce<number>((total,s)=>total+(state.bids[s]??0),0);const credit=group.reduce<number>((total,s)=>total+(state.bids[s]===0?0:state.tricks[s]),0);
  rows.push({mode,seed,seat,candidate,opponent,handScore:state.handResult.points[seat],tricks:state.tricks[seat],bid,contractMet:mode==='hearts'?null:credit>=contract,nilSuccess:bid===0?state.tricks[seat]===0:null});
 }
 const summaries=manifest.modes.flatMap(mode=>manifest.opponentPolicies.map(opponent=>{
  const selected=rows.filter(r=>r.mode===mode&&r.opponent===opponent);const groups=manifest.candidatePolicies.map(candidate=>{const sample=selected.filter(r=>r.candidate===candidate);return {candidate,hands:sample.length,meanHandScore:sample.reduce((n,r)=>n+r.handScore,0)/sample.length,meanTricks:sample.reduce((n,r)=>n+r.tricks,0)/sample.length,contractsMet:sample.filter(r=>r.contractMet===true).length,nilBids:sample.filter(r=>r.bid===0).length,nilSuccesses:sample.filter(r=>r.nilSuccess===true).length};});
  return {mode,opponent,groups,pairedMeanScoreDifference:groups[0].meanHandScore-groups[1].meanHandScore,preferredScoreDirection:mode==='hearts'?'lower':'higher'};
 }));
 writeFileSync(outputPath,JSON.stringify({manifestId:manifest.id,manifestSha256:createHash('sha256').update(raw).digest('hex'),status:'smoke-passed-no-promotion',runtime:process.version,providerMode:'off',observedModelId:null,networkRequests:0,hands:rows.length,elapsedMs:Math.round(performance.now()-started),categoricalGradesEnabled:false,calibration:'not implemented',limitations:manifest.limitations,summaries,rows},null,2)+'\n');
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const manifestPath=process.argv[2]??fileURLToPath(new URL('./local-policy-manifest.json',import.meta.url));const outputPath=process.argv[3]??fileURLToPath(new URL('./evidence/local-policy-smoke.json',import.meta.url));runPolicySmoke(manifestPath,outputPath);process.stdout.write('Completed bounded synthetic policy smoke; results do not promote strategic quality.\n');}
