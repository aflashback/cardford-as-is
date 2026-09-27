import {cardLabel,cardSuit} from '../game/cards.ts';
import {trickWinner} from '../game/rules.ts';
import type {Card,Seat,Suit} from '../game/kernel/types.ts';
import {assertObservation,type SeatObservation} from '../observations/index.ts';
import {chooseAction,POLICY_VERSION} from '../strategy/index.ts';
export type Advice={focus:string;notice:string;reason:string;suggestion:string;card?:Card;pass?:Card[];bid?:number;highlightSuit?:Suit;provenance:'code'|'forced';policyVersion:string};
/** Original templates use only verified predicates and the same selected action as bots. */
export function explain(obs:SeatObservation):Advice{
 assertObservation(obs);const base={provenance:obs.legalActions.length===1?'forced' as const:'code' as const,policyVersion:POLICY_VERSION};
 if(!obs.legalActions.length)return {...base,focus:obs.phase==='hand-end'||obs.phase==='match-end'?'Hand complete':'Watch the table',notice:'No decision for you right now.',reason:'The memory aid shows facts from this hand’s public plays.',suggestion:''};
 const action=chooseAction(obs);
 if(action.kind==='pass')return {...base,focus:'Plan the whole pass',notice:'Choose three cards before committing.',reason:'This local starting plan favors passing high cards. Keeping queen protection, a short suit or a possible moon plan can favor another. Received cards can change your suits.',suggestion:'Consider these three together. Recheck your suits after receiving.',pass:action.cards};
 if(action.kind==='bid')return {...base,focus:obs.mode==='spades-partners'?'Your team contract':'Your own contract',notice:'Count likely tricks before bidding.',reason:'High cards and spade length suggest a starting bid. These heuristic weights are not calibrated probabilities.',suggestion:`Consider ${action.bid}. It is a starting estimate, not a guarantee.`,bid:action.bid};
 const card=action.card;const led=obs.trick.length?cardSuit(obs.trick[0].card):undefined;const payload={...base,card,...(led?{highlightSuit:led}:{})};
 if(obs.legalActions.length===1)return {...payload,focus:'One legal play',notice:`${cardLabel(card)} is your only legal card.`,reason:'The rules leave no strategic choice on this turn.',suggestion:`Play ${cardLabel(card)}.`};
 const remaining=3-obs.trick.length;const below=obs.trick.length>0&&trickWinner([...obs.trick,{seat:obs.seat,card}],obs.mode)!==obs.seat;
 if(obs.mode!=='hearts'&&obs.bids[obs.seat]===0){
  const live=obs.tricks[obs.seat]===0;
  return {...payload,focus:live?'Protect your Nil':'Avoid more bags',notice:live?'You bid Nil: take no tricks.':'Your Nil has already broken.',reason:!live?(obs.mode==='spades-partners'?'Extra tricks add bags; they do not help your partner’s contract.':'Extra tricks add bags even after your Nil has broken.'):!obs.trick.length?'A low lead may help avoid a trick, but the other hands are unknown.':below?(remaining>0?'Stay below the current winner. Others still have a play.':'Staying below the winner avoids this trick.'):(remaining>0?'Every legal card puts you ahead for now. Another player may still overtake.':'Every legal card wins this trick, so your Nil cannot survive it.'),suggestion:!obs.trick.length?`Consider ${cardLabel(card)} as a low lead.`:below?`Consider ${cardLabel(card)} to stay below the current winner.`:`Consider ${cardLabel(card)}; no legal card stays below the current winner.`};
 }
 const partner=((obs.seat+2)%4) as Seat;
 if(obs.mode==='spades-partners'&&obs.trick.length&&trickWinner(obs.trick,obs.mode)===partner){
  if(obs.bids[partner]===0){const cover=obs.legalActions.some(a=>a.kind==='play'&&trickWinner([...obs.trick,{seat:obs.seat,card:a.card}],obs.mode)===obs.seat);const live=obs.tricks[partner]===0;return {...payload,focus:live?'Cover your partner’s Nil':'Partner’s Nil has broken',notice:'Your Nil partner is winning so far.',reason:!live?'The Nil bonus is already lost. Extra tricks by the Nil bidder add bags without contract credit.':cover?(remaining>0?'You can overtake your partner. An opponent still has a play.':'You can take this trick off your partner; all opponents have played.'):(remaining>0?'No legal card can cover your partner. An opponent still has a play.':'No legal card can cover your partner, and all opponents have played.'),suggestion:live&&cover?`Consider ${cardLabel(card)} to take the trick off your partner.`:live?`No covering play is available; consider ${cardLabel(card)}.`:`Consider ${cardLabel(card)}. The contract and bags still matter.`};}
  return {...payload,focus:'Partner is currently ahead',notice:'Your partner has the winning card so far.',reason:remaining>0?`${remaining} opponent ${remaining===1?'is':'are'} still to play; the trick can change.`:'All opponents have played. Taking the next lead yourself can still be useful.',suggestion:below?`Consider ${cardLabel(card)} to leave partner ahead for now.`:`Consider ${cardLabel(card)} if taking the lead fits your next play.`};
 }
 const suitNames={C:'clubs',D:'diamonds',H:'hearts',S:'spades'};
 return {...payload,focus:led?`${suitNames[led]} were led`:'Choose your lead',notice:led?(obs.hand.some(c=>cardSuit(c)===led)?`${suitNames[led]} were led. You must follow suit.`:`You have no ${suitNames[led]} to follow.`):`${obs.legalActions.length} cards are legal to lead.`,reason:obs.mode==='hearts'?'Hearts and the queen carry points. A lower card does not always avoid taking the trick.':obs.mode==='spades-partners'?'Watch your team’s remaining bid. Saving a high card or taking the lead can each help.':'Watch your own remaining bid. Saving a high card or taking the lead can each help.',suggestion:`Consider ${cardLabel(card)}. Other plans can be reasonable.`};
}

