import type {Trick,Four} from '../kernel/types.ts';
import {cardSuit} from '../cards.ts';
export function scoreHearts(history:Trick[]):Four<number>{
 const points:Four<number>=[0,0,0,0];
 for(const trick of history)for(const play of trick.plays)points[trick.winner]+=play.card==='SQ'?13:cardSuit(play.card)==='H'?1:0;
 const moon=points.indexOf(26);return moon===-1?points:points.map((_,s)=>s===moon?0:26) as Four<number>;
}
