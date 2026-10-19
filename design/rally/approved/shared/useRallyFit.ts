import {useLayoutEffect,useRef} from 'react';
import {rallyFrameMetrics,fitRallyTrick} from './rally-fit.mjs';
import {lastTrickPocket,clearPreviewCards,emptyPreviewCards} from './last-trick-pocket.mjs';

// Fit only authored layout containers. Canonical faces and gesture hooks remain intact.
export function useRallyFit(tell:(action:string,data:Record<string,unknown>)=>void,game:string,phase:string) {
 const ref=useRef<HTMLDivElement>(null),lastClearance=useRef(-1);
 useLayoutEffect(()=>{
  const outer=ref.current;if(!outer)return;
  let scheduled=0,disposed=false;
  const put=(node:HTMLElement,key:string,value:string)=>{if(node.style.getPropertyValue(key)!==value)node.style.setProperty(key,value);};
  function fit(){
   if(disposed||!outer)return;
   const main=outer.querySelector<HTMLElement>('.game-shell:not([hidden])');
   const table=main?.querySelector<HTMLElement>('.table-zone'),hand=main?.querySelector<HTMLElement>('.hand-section');
   if(!main||!table||!hand||outer.clientWidth<=0||outer.clientHeight<=0)return;
   const style=getComputedStyle(main),padding={left:parseFloat(style.paddingLeft)||0,right:parseFloat(style.paddingRight)||0,top:parseFloat(style.paddingTop)||0,bottom:parseFloat(style.paddingBottom)||0};
   const metrics=rallyFrameMetrics({width:outer.clientWidth,height:outer.clientHeight,padding});
   main.dataset.rallyCompact=String(metrics.compact);main.dataset.rallyPhase=phase;
   for(const [name,value] of Object.entries({
    'hand-width':metrics.handWidth,'hand-lift':metrics.handLift,'hand-left':metrics.handInsetLeft,'hand-right':metrics.handInsetRight,
    'row-gap':metrics.rowGap,'preview-card':metrics.previewCard,'preview-width':metrics.previewWidth,'preview-height':metrics.previewHeight,
    'avatar':metrics.avatar,'name-size':metrics.nameSize,'detail-size':metrics.detailSize
   }))put(main,`--rally-${name}`,`${value}px`);
   const preview=main.querySelector<HTMLElement>('.rally-last');
   let placement={tableWidth:metrics.preferredWidth,tableLeft:(metrics.contentWidth-metrics.preferredWidth)/2};
   put(table,'--rally-east-offset','0px');
   if(preview&&phase==='play') {
    const tableStyle=getComputedStyle(table),inset=parseFloat(tableStyle.getPropertyValue('--rally-felt-right'))||30;
    const pocket=lastTrickPocket({contentWidth:metrics.contentWidth,preferredWidth:metrics.preferredWidth,feltRightInset:inset,previewWidth:metrics.previewWidth});
    placement=pocket;put(table,'--rally-pocket-felt-right',`${pocket.feltRightInset}px`);
    put(preview,'left',`${padding.left+pocket.previewLeft}px`);put(preview,'top',`${padding.top}px`);
   }
   put(table,'width',`${placement.tableWidth}px`);put(table,'margin-left',`${placement.tableLeft}px`);put(table,'justify-self','start');
   const zone=table.getBoundingClientRect(),felt=table.querySelector<HTMLElement>('.table-felt')!.getBoundingClientRect();
   if(preview&&phase==='play') {
    const actual=[...preview.querySelectorAll<HTMLElement>('.last-trick-card')].map(node=>node.getBoundingClientRect());
    const cards=actual.length?actual:emptyPreviewCards(preview.getBoundingClientRect(),{cardWidth:metrics.previewCard});
    const east=[...table.querySelectorAll<HTMLElement>('.player-3 .avatar,.player-3 .player-info')].map(node=>node.getBoundingClientRect());
    const south=table.querySelector<HTMLElement>('.player-0')?.getBoundingClientRect(),maxBottom=Math.max(...east.map(rect=>rect.bottom),0);
    const lower=south&&east.some(rect=>rect.left<south.right&&rect.right>south.left)?Math.min(zone.bottom-6,south.top-4):zone.bottom-6;
    const avoid=clearPreviewCards(cards,east,Math.max(0,lower-maxBottom),4);
    put(table,'--rally-east-offset',`${avoid.shift}px`);preview.dataset.fit=avoid.fits?'clear':'limited';
   }
   const trick=table.querySelector<HTMLElement>('.trick-area');
   if(trick) {
    const obstacles=[...table.querySelectorAll<HTMLElement>('.player,.announced-cards')].map(node=>node.getBoundingClientRect());
    const fit=fitRallyTrick({bounds:{left:felt.left+8,right:felt.right-8,top:felt.top+6,bottom:felt.bottom-6},obstacles,
     center:{x:zone.left+zone.width/2,y:zone.top+zone.height/2},maxCardWidth:metrics.maxTableCard});
    if(fit){put(table,'--table-card-width',`${fit.cardWidth}px`);put(trick,'left',`${fit.x-zone.left}px`);put(trick,'top',`${fit.y-zone.top}px`);put(trick,'visibility','visible');}
    else put(trick,'visibility','hidden');
   }
   put(main,'--rally-jacks-max',`${metrics.maxJacksCard}`);
   main.dispatchEvent(new Event('rally-fit'));
   const clearance=Math.ceil(Math.max(0,Math.min(outer.clientHeight,outer.getBoundingClientRect().bottom-hand.getBoundingClientRect().top+4)));
   if(Number.isFinite(clearance)&&Math.abs(clearance-lastClearance.current)>=1){lastClearance.current=clearance;tell('layout',{handClearance:clearance});}
  }
  const queue=()=>{if(!scheduled)scheduled=requestAnimationFrame(()=>{scheduled=0;fit();});};
  fit();const observer=new ResizeObserver(queue);observer.observe(outer);
  outer.querySelectorAll<HTMLElement>('.game-shell,.player,.announced-cards').forEach(node=>observer.observe(node));
  const attributes=new MutationObserver(queue);attributes.observe(document.documentElement,{attributes:true,attributeFilter:['data-game','data-phase']});
  window.addEventListener('resize',queue);
  return()=>{disposed=true;cancelAnimationFrame(scheduled);observer.disconnect();attributes.disconnect();window.removeEventListener('resize',queue);};
 },[game,phase]);
 // New public cards may change announcement dimensions without a viewport resize.
 useLayoutEffect(()=>{ref.current?.querySelector('.game-shell:not([hidden])')?.dispatchEvent(new Event('rally-fit'));});
 return ref;
}
