import {SEATS,assertSeat,four,nextSeat,RULE_PROFILES,type PrivateGame,type GameConfig,type Card,type Seat,type Mode,type GameAction,type AcceptedAction,type GameEvent,type Four} from './kernel/types.ts';
import {cardLabel,cardSuit,sorted,validateDeal} from './cards.ts';
import {actionsFor,actionId,trickWinner} from './rules.ts';
import {scoreCompetitor} from './spades/score.ts';
import {scoreHearts} from './hearts/score.ts';
export * from './kernel/types.ts';
export * from './cards.ts';
export {actionId,trickWinner} from './rules.ts';
const seatName=(s:Seat)=>['You','West','North','East'][s];
function emit(state:PrivateGame,type:GameEvent['type'],message:string,details:Pick<GameEvent,'seat'|'card'|'bid'>={}){state.events.push({id:(state.events.at(-1)?.id??0)+1,type,message,...details});}
function deal(state:PrivateGame,deck:Card[]):PrivateGame{
 validateDeal(deck);const next=structuredClone(state);next.hands=four(()=>[] as Card[]);
 const first=nextSeat(next.dealer);deck.forEach((card,i)=>next.hands[(first+i)%4].push(card));next.hands=next.hands.map(sorted) as Four<Card[]>;
 next.bids=four(()=>null);next.tricks=four(()=>0);next.trick=[];next.history=[];next.passes=four(()=>({outgoing:[],incoming:[],to:null,from:null}));
 next.heartsBroken=false;next.spadesBroken=false;delete next.handResult;
 next.passDirection=(['left','right','across','hold'] as const)[(next.handNumber-1)%4];
 next.phase=next.mode==='hearts'?(next.passDirection==='hold'?'play':'pass'):'bid';
 next.turn=next.phase==='pass'?null:next.mode==='hearts'?next.hands.findIndex(h=>h.includes('C2')) as Seat:first;
 emit(next,'hand-started',`Hand ${next.handNumber} dealt. ${next.mode==='hearts'?(next.passDirection==='hold'?'No pass this hand.':`Pass three cards ${next.passDirection}.`):`${seatName(first)} bid first.`}`);return next;
}
export function createGame(config:GameConfig,deck:Card[]):PrivateGame{
 if(!Object.hasOwn(RULE_PROFILES,config.mode)||typeof config.id!=='string'||!config.id)throw new Error('Invalid game configuration.');assertSeat(config.dealer);
 return deal({id:config.id,mode:config.mode,moduleVersion:'1.0.0',ruleProfileId:RULE_PROFILES[config.mode],eventSchemaVersion:'1.0.0',phase:'bid',hands:four(()=>[]),bids:four(()=>null),tricks:four(()=>0),scores:four(()=>0),bags:four(()=>0),trick:[],history:[],turn:null,dealer:config.dealer,handNumber:1,heartsBroken:false,spadesBroken:false,events:[],passDirection:'left',passes:four(()=>({outgoing:[],incoming:[],to:null,from:null}))},deck);
}
export function legalActions(state:PrivateGame,seat:Seat):GameAction[]{assertSeat(seat);return actionsFor({mode:state.mode,phase:state.phase,turn:state.turn,trick:state.trick,history:state.history,heartsBroken:state.heartsBroken,spadesBroken:state.spadesBroken,hand:state.hands[seat]},seat);}
export function matchWinner(mode:Mode,scores:number[]):Seat|undefined{
 if(Math.max(...scores)<(mode==='hearts'?100:500))return undefined;
 const best=mode==='hearts'?Math.min(...scores):Math.max(...scores);const contenders:Seat[]=mode==='spades-partners'?[0,1]:SEATS;
 const winners=contenders.filter(s=>scores[s]===best);return winners.length===1?winners[0]:undefined;
}
function scoreHand(state:PrivateGame){
 const points:Four<number>=four(()=>0);
 if(state.mode==='hearts'){const result=scoreHearts(state.history);for(const s of SEATS){points[s]=result[s];state.scores[s]+=result[s];}}
 else{
  const groups:Seat[][]=state.mode==='spades-partners'?[[0,2],[1,3]]:SEATS.map(s=>[s]);
  for(const group of groups){const bids=group.map(s=>{const b=state.bids[s];if(b===null)throw new Error('Missing bid.');return b;});const result=scoreCompetitor({bids,tricks:group.map(s=>state.tricks[s]),oldBags:state.bags[group[0]]});const score=state.scores[group[0]]+result.delta;for(const s of group){points[s]=result.delta;state.scores[s]=score;state.bags[s]=result.bags;}}
 }
 state.handResult={points,bags:[...state.bags]};const winner=matchWinner(state.mode,state.scores);if(winner!==undefined)state.handResult.winner=winner;
 emit(state,'hand-scored',`Hand ${state.handNumber} scored. ${winner!==undefined?'Match complete.':'Review the result before the next deal.'}`);
}
export function apply(state:PrivateGame,action:AcceptedAction):PrivateGame{
 if(state.moduleVersion!=='1.0.0'||state.eventSchemaVersion!=='1.0.0'||state.ruleProfileId!==RULE_PROFILES[state.mode])throw new Error('Unsupported stored rules version.');
 if(action.kind==='pass-bundle'){
  if(state.mode!=='hearts'||state.phase!=='pass'||state.passDirection==='hold'||action.passes.length!==4)throw new Error('There is no pass to make.');
  for(const s of SEATS){const cards=action.passes[s];if(!Array.isArray(cards)||cards.length!==3||new Set(cards).size!==3||cards.some(c=>!state.hands[s].includes(c)))throw new Error('Invalid sealed pass.');}
  const next=structuredClone(state);const offset={left:1,right:3,across:2}[state.passDirection];
  next.hands=state.hands.map((hand,s)=>hand.filter(c=>!action.passes[s].includes(c))) as Four<Card[]>;
  for(const s of SEATS){const to=((s+offset)%4) as Seat;const from=((s+4-offset)%4) as Seat;next.hands[to].push(...action.passes[s]);next.passes[s]={outgoing:sorted(action.passes[s]),incoming:sorted(action.passes[from]),to,from};}
  next.hands=next.hands.map(sorted) as Four<Card[]>;next.phase='play';next.turn=next.hands.findIndex(h=>h.includes('C2')) as Seat;
  emit(next,'cards-passed',`Three cards passed ${next.passDirection}. ${seatName(next.turn)} lead with the 2 of Clubs.`);return next;
 }
 if(action.kind!=='play'&&action.kind!=='bid')throw new Error('Unsupported action.');
 if(action.kind==='bid'&&(!Number.isInteger(action.bid)||action.bid<0||action.bid>13))throw new Error('Invalid bid.');
 assertSeat(action.seat);if(!legalActions(state,action.seat).some(a=>actionId(a)===actionId(action)))throw new Error('Action is not legal for this seat and phase.');
 const next=structuredClone(state);const seat=action.seat;
 if(action.kind==='bid'){
  next.bids[seat]=action.bid;emit(next,'bid-placed',`${seatName(seat)} bid ${action.bid===0?'Nil':action.bid}.`,{seat,bid:action.bid});next.turn=nextSeat(seat);
  if(next.bids.every(b=>b!==null)){next.phase='play';next.turn=nextSeat(next.dealer);}return next;
 }
 next.hands[seat]=next.hands[seat].filter(c=>c!==action.card);next.trick.push({seat,card:action.card});
 if(cardSuit(action.card)==='H')next.heartsBroken=true;if(cardSuit(action.card)==='S')next.spadesBroken=true;
 emit(next,'card-played',`${seatName(seat)} played ${cardLabel(action.card)}.`,{seat,card:action.card});
 if(next.trick.length===4){
  const winner=trickWinner(next.trick,next.mode);next.phase='trick-end';next.turn=winner;next.history.push({plays:structuredClone(next.trick),winner});next.tricks[winner]++;
  emit(next,'trick-resolved',`${seatName(winner)} won trick ${next.history.length}.`,{seat:winner});if(next.history.length===13)scoreHand(next);
 }else next.turn=nextSeat(seat);return next;
}
export function collectTrick(state:PrivateGame):PrivateGame{
 if(state.phase!=='trick-end'||state.trick.length!==4)throw new Error('The trick is not complete.');
 const next=structuredClone(state);next.trick=[];next.phase=next.handResult?(next.handResult.winner===undefined?'hand-end':'match-end'):'play';
 emit(next,'trick-collected','Completed trick cleared from the table.');return next;
}
export function nextHand(state:PrivateGame,deck:Card[]):PrivateGame{if(state.phase!=='hand-end')throw new Error('Finish and review this hand before dealing another.');return deal({...state,dealer:nextSeat(state.dealer),handNumber:state.handNumber+1},deck);}
export function applyAction(state:PrivateGame,action:AcceptedAction):{state:PrivateGame;events:GameEvent[]}{const next=apply(state,action);return {state:next,events:next.events.slice(state.events.length)};}

