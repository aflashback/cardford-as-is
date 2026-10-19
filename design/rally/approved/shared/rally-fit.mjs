// Authored Rally presentation geometry. No game decisions or private-card data.
export const CARD_ASPECT=82.4/57.6;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const tenth=value=>Math.floor(value*10)/10;

export function rallyFrameMetrics({width,height,padding={left:12,right:12,top:4,bottom:4}}) {
 const compact=height<=520;
 const contentWidth=Math.max(0,width-padding.left-padding.right);
 const handInsetLeft=compact?72:92,handInsetRight=compact?8:24;
 const handAvailable=Math.max(0,contentWidth-handInsetLeft-handInsetRight);
 // Canonical overlap is bounded at 62%; thirteen cards need 5.56 card widths.
 const handWidth=tenth(Math.max(24,Math.min(clamp(height*.17,50,154),(handAvailable-14)/5.56)));
 // The existing selected-card rotation reaches about .30 widths above its row.
 const handLift=Math.ceil(handWidth*.31+4),handHeight=handWidth*CARD_ASPECT+handLift;
 const rowGap=compact?2:6;
 const tableHeight=Math.max(0,height-padding.top-padding.bottom-handHeight-rowGap);
 const preferredWidth=Math.min(contentWidth,Math.max(Math.min(420,contentWidth),tableHeight*1.8+140));
 const previewCard=tenth(clamp(height*.064,22,48));
 return {compact,contentWidth,handInsetLeft,handInsetRight,handAvailable,handWidth,handLift,handHeight,rowGap,tableHeight,preferredWidth,
  maxTableCard:tenth(clamp(height*.15,40,136)),maxJacksCard:tenth(clamp(height*.12,36,96)),
  previewCard,previewWidth:Math.ceil(previewCard*3.3),previewHeight:Math.ceil(previewCard*CARD_ASPECT*2.1),
  avatar:tenth(clamp(height*.055,28,44)),nameSize:tenth(clamp(height*.019,12,16)),detailSize:tenth(clamp(height*.016,10,13))};
}

const positive=r=>r.right>r.left&&r.bottom>r.top;
const contains=(a,b)=>a.left<=b.left&&a.right>=b.right&&a.top<=b.top&&a.bottom>=b.bottom;
export function clearLayoutSpaces(bounds,obstacles=[],margin=6) {
 if(!positive(bounds))return [];
 let spaces=[bounds];
 for(const item of obstacles) {
  const obstacle={left:item.left-margin,right:item.right+margin,top:item.top-margin,bottom:item.bottom+margin};
  spaces=spaces.flatMap(space=>{
   if(obstacle.right<=space.left||obstacle.left>=space.right||obstacle.bottom<=space.top||obstacle.top>=space.bottom)return [space];
   return [{...space,right:obstacle.left},{...space,left:obstacle.right},{...space,bottom:obstacle.top},{...space,top:obstacle.bottom}].filter(positive);
  });
  spaces=[...new Map(spaces.map(space=>[Object.values(space).join(','),space])).values()];
  spaces=spaces.filter((space,index)=>!spaces.some((other,j)=>j!==index&&contains(other,space)));
 }
 return spaces;
}

function placement(space,widthUnits,heightUnits,maxCardWidth,center,centered) {
 const span=centered?2*Math.min(center.x-space.left,space.right-center.x):space.right-space.left;
 const cardWidth=tenth(Math.min(maxCardWidth,span/widthUnits,(space.bottom-space.top)/heightUnits));
 if(!(cardWidth>0))return null;
 const width=cardWidth*widthUnits,height=cardWidth*heightUnits;
 const x=centered?center.x:clamp(center.x,space.left+width/2,space.right-width/2);
 const y=clamp(center.y,space.top+height/2,space.bottom-height/2);
 return {cardWidth,width,height,x,y,left:x-width/2,right:x+width/2,top:y-height/2,bottom:y+height/2,
  distance:Math.abs(x-center.x)+Math.abs(y-center.y)};
}

export function fitRallyTrick({bounds,obstacles=[],center,maxCardWidth,margin=6}) {
 const candidates=clearLayoutSpaces(bounds,obstacles,margin).map(space=>placement(space,2.2,CARD_ASPECT*2.84,maxCardWidth,center,true)).filter(Boolean);
 candidates.sort((a,b)=>b.cardWidth-a.cardWidth||a.distance-b.distance);
 return candidates[0]||null;
}

export function fitRallyJacks({bounds,obstacles=[],center,maxCardWidth,rows,margin=6}) {
 // Reserve only the public rank range in this deal. All four Jacks share one
 // baseline; a short opening sequence no longer reserves nine empty ranks.
 const present=rows.filter(row=>row.low>0&&row.high>0);
 const low=Math.min(11,...present.map(row=>row.low)),high=Math.max(11,...present.map(row=>row.high));
 const firstRow=14-high,rankSpan=high-low;
 const candidates=[];
 for(const mode of [{spread:0,step:.58,gap:.4},{spread:.7,step:.25,gap:.28}]) {
  const widthUnits=4*(1+2*mode.spread)+3*mode.gap,heightUnits=rankSpan*mode.step+CARD_ASPECT;
  for(const space of clearLayoutSpaces(bounds,obstacles,margin)) {
   const fit=placement(space,widthUnits,heightUnits,maxCardWidth,center,false);
   if(fit)candidates.push({...fit,...mode,firstRow,low,high,widthUnits,heightUnits});
  }
 }
 candidates.sort((a,b)=>b.cardWidth-a.cardWidth||a.distance-b.distance||a.spread-b.spread);
 return candidates[0]||null;
}
