import React from 'react';
import {CardFace,PlayerBadge,RemainingCards,TrickCards} from './vendor/src/table/CardPrimitives';
import {cardLabel} from './vendor/src/api/display';
import type {ReplayFrame} from './coach-replay-data';

// A separate, read-only presentation. It never writes to the current hand.
export function CoachReplay({frame,game,variant}:{frame:ReplayFrame;game:string;variant:'solo'|'partners'}) {
 const focused=new Set(frame.focusCards||[]);
 const selected=new Set(frame.selected||[]);
 const playedSeats=frame.plays.map(play=>play.seat);
 const layers=new Map(frame.plays.map((play,index)=>[play.seat,play.seat===frame.winner?5:index+1]));
 return <main className="game-shell coach-replay-board" data-replay-phase={frame.phase||'play'} aria-label={`Recorded ${game} table, round ${frame.round}, ${frame.moment||`trick ${frame.trick}`}`}>
  <div className="table-zone" aria-label="Recorded public table">
   <div className="table-felt"><div className="table-line"/></div>
   <span className="replay-stamp">Replay · Round {frame.round}</span>
   {[0,1,2,3].map(seat=><PlayerBadge key={seat} seat={seat as 0|1|2|3} active={false} partner={variant==='partners'&&game!=='hearts'&&seat===2} cards={seat===0?frame.doubled as any:[]}>
    <span className="player-detail"><RemainingCards count={frame.remaining?.[seat]??(seat===0?frame.hand.length:Math.max(0,frame.hand.length-(playedSeats.includes(seat as 0|1|2|3)?1:0)))}/></span>
   </PlayerBadge>)}
   <div className="trick-area"><TrickCards plays={frame.plays as any} winner={frame.winner} layers={layers} cueSeats={frame.plays.filter(play=>focused.has(play.card)).map(play=>play.seat)}/></div>
   {frame.phase&&<div className="replay-phase-label">{frame.phase==='double'?'×2':frame.moment||'Pass'}</div>}
  </div>
  <section className="hand-section replay-hand" aria-label="Your hand at this moment">
   <div className="hand-cards" style={{'--cards':frame.hand.length} as React.CSSProperties}>{frame.hand.map((card,index)=><button key={card} disabled
    className={`hand-card ${selected.has(card)?'selected':''} ${focused.has(card)?'replay-focus':''} ${index>0&&card[0]!==frame.hand[index-1][0]?'suit-start':''}`}
    aria-label={cardLabel(card as any)}><CardFace card={card as any}/></button>)}</div>
  </section>
 </main>;
}
