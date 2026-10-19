import {useLayoutEffect,useRef,type CSSProperties} from 'react';
import type {TrixObservation} from './vendor/shared/local-service.contracts';
import {boardCards} from './vendor/src/games/trix/adapter';
import {CardFace} from './vendor/src/table/CardPrimitives';
import {cardLabel,cardRank} from './vendor/src/api/display';
import {fitRallyJacks} from './rally-fit.mjs';

const names:Record<string,string>={C:'Clubs',D:'Diamonds',H:'Hearts',S:'Spades'};
// Same public rows, canonical faces and data-played-card throw targets as LayoutBoard.
// Only the design mock's fit differs: visible ranks determine its height budget.
export function RallyJacksLayout({board}:{board:TrixObservation['board']}) {
 const ref=useRef<HTMLElement>(null);
 useLayoutEffect(()=>{
  const element=ref.current,table=element?.closest<HTMLElement>('.table-zone'),main=element?.closest<HTMLElement>('.game-shell');
  if(!element||!table||!main)return;
  let scheduled=0;
  function fit(){
   if(!element||!table||!main)return;
   const zone=table.getBoundingClientRect(),felt=table.querySelector<HTMLElement>('.table-felt')!.getBoundingClientRect();
   const obstacles=[...table.querySelectorAll<HTMLElement>('.player,.announced-cards')].map(node=>node.getBoundingClientRect());
   const result=fitRallyJacks({bounds:{left:felt.left+8,right:felt.right-8,top:felt.top+6,bottom:felt.bottom-6},obstacles,
    center:{x:zone.left+zone.width/2,y:zone.top+zone.height/2},maxCardWidth:Number(getComputedStyle(main).getPropertyValue('--rally-jacks-max'))||48,rows:board});
   element.dataset.fit=result?'clear':'limited';element.style.visibility=result?'visible':'hidden';
   if(!result){for(const property of ['--layout-width','--layout-step','--layout-gap','--layout-spread','--layout-first-row','--rally-layout-stack','left','top'])element.style.removeProperty(property);return;}
   for(const [name,value] of Object.entries({'--layout-width':`${result.cardWidth}px`,'--layout-step':`${result.cardWidth*result.step}px`,
    '--layout-gap':`${result.cardWidth*result.gap}px`,'--layout-spread':String(result.spread),'--layout-first-row':String(result.firstRow),
    '--layout-rank-span':String(result.high-result.low),'--rally-layout-stack':result.spread?'20':'0','left':`${result.x-zone.left}px`,'top':`${result.y-zone.top}px`}))element.style.setProperty(name,value);
  }
  const queue=()=>{if(!scheduled)scheduled=requestAnimationFrame(()=>{scheduled=0;fit();});};
  fit();const observer=new ResizeObserver(queue);observer.observe(table);table.querySelectorAll('.player,.announced-cards').forEach(node=>observer.observe(node));
  main.addEventListener('rally-fit',fit);
  return()=>{cancelAnimationFrame(scheduled);observer.disconnect();main.removeEventListener('rally-fit',fit);};
 },[board]);
 return <section ref={ref} className="trix-layout rally-jacks-layout" aria-label="Jack layout board">
  {board.map(row=><div className={`trix-layout-row ${row.suit==='D'||row.suit==='H'?'red-card':''}`} key={row.suit} role="group" aria-label={`${names[row.suit]} lane`}>
   <div className="trix-lane-cards">{[...boardCards(row)].reverse().map(card=><span key={card} data-played-card={card} role="img" aria-label={cardLabel(card)} style={{'--layout-row':14-cardRank(card),'--layout-column':(14-cardRank(card))%3} as CSSProperties}><CardFace card={card}/></span>)}</div>
  </div>)}
 </section>;
}
