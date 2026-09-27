import {assertSeat,SUITS,type PrivateGame,type GameEvent,type Play,type Seat,type Card} from '../game/kernel/types.ts';
import {cardSuit} from '../game/cards.ts';
import {legalActions} from '../game/index.ts';
import type {SeatObservation,SuitMemory} from './types.ts';
export * from './types.ts';
const play=(p:Play):Play=>({seat:p.seat,card:p.card});
export function projectEvent(event:GameEvent):GameEvent{
 const result:GameEvent={id:event.id,type:event.type,message:event.message};
 if(event.seat!==undefined)result.seat=event.seat;if(event.card!==undefined)result.card=event.card;if(event.bid!==undefined)result.bid=event.bid;return result;
}
export function getMemory(context:Pick<SeatObservation,'history'|'trick'>):SuitMemory[]{
 const seen=new Set<Card>();const voids=new Map(SUITS.map(s=>[s,new Set<Seat>()]));
 for(const trick of [...context.history.map(t=>t.plays),context.trick]){if(!trick.length)continue;const led=cardSuit(trick[0].card);for(const p of trick){seen.add(p.card);if(cardSuit(p.card)!==led)voids.get(led)!.add(p.seat);}}
 return SUITS.map(suit=>{const played=[...seen].filter(c=>cardSuit(c)===suit).length;return {suit,played,remaining:13-played,voidSeats:[...voids.get(suit)!].sort()};});
}
export function observe(state:PrivateGame,seat:Seat):SeatObservation{
 assertSeat(seat);const memory=state.passes[seat];const seen=new Set([...state.history.flatMap(t=>t.plays.map(p=>p.card)),...state.trick.map(p=>p.card)]);
 const result:SeatObservation={mode:state.mode,seat,moduleVersion:state.moduleVersion,ruleProfileId:state.ruleProfileId,observationSchemaVersion:'1.0.0',featureVersion:'1.0.0',phase:state.phase,hand:[...state.hands[seat]],handSizes:state.hands.map(h=>h.length),bids:[...state.bids],tricks:[...state.tricks],scores:[...state.scores],bags:[...state.bags],trick:state.trick.map(play),history:state.history.map(t=>({plays:t.plays.map(play),winner:t.winner})),turn:state.phase==='pass'?null:state.turn,dealer:state.dealer,handNumber:state.handNumber,heartsBroken:state.heartsBroken,spadesBroken:state.spadesBroken,events:state.events.map(projectEvent),passDirection:state.passDirection,pass:{outgoing:[...memory.outgoing],incoming:[...memory.incoming],to:memory.to,from:memory.from},legalActions:legalActions(state,seat),memory:getMemory(state),knownHoldings:memory.to===null?[]:memory.outgoing.filter(c=>!seen.has(c)).map(card=>({seat:memory.to as Seat,card}))};
 if(state.handResult){result.handResult={points:[...state.handResult.points],bags:[...state.handResult.bags]};if(state.handResult.winner!==undefined)result.handResult.winner=state.handResult.winner;}
 return result;
}
/** Reject unknown fields at every object boundary; do not strip a private aggregate into a valid observation. */
function keys(value:unknown,allowed:string[]):asserts value is Record<string,unknown>{
 if(typeof value!=='object'||value===null||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))throw new Error('Unexpected observation field.');
}
export function assertObservation(value:SeatObservation):void{
 keys(value,['mode','seat','moduleVersion','ruleProfileId','observationSchemaVersion','featureVersion','phase','hand','handSizes','bids','tricks','scores','bags','trick','history','turn','dealer','handNumber','heartsBroken','spadesBroken','events','handResult','passDirection','pass','legalActions','memory','knownHoldings']);
 assertSeat(value.seat);value.hand.forEach(cardSuit);keys(value.pass,['outgoing','incoming','to','from']);value.pass.outgoing.forEach(cardSuit);value.pass.incoming.forEach(cardSuit);
 for(const p of value.trick)keys(p,['seat','card']);for(const t of value.history){keys(t,['plays','winner']);for(const p of t.plays)keys(p,['seat','card']);}
 for(const e of value.events)keys(e,['id','type','message','seat','card','bid']);for(const m of value.memory)keys(m,['suit','played','remaining','voidSeats']);for(const k of value.knownHoldings)keys(k,['seat','card']);
 for(const action of value.legalActions)keys(action,action.kind==='pass'?['kind','seat','cards']:action.kind==='bid'?['kind','seat','bid']:['kind','seat','card']);
 if(value.handResult)keys(value.handResult,['points','bags','winner']);
}
