// Pure geometry for the Rally-only live last-trick pocket. No card/game state.
export function lastTrickPocket({contentWidth, preferredWidth, feltRightInset, previewWidth, gap=30, maxGap=100, minTableWidth=278}) {
  const minimum=Math.min(contentWidth,minTableWidth);
  const natural=Math.min(contentWidth,Math.max(minimum,preferredWidth));
  const ordinaryCap=contentWidth-previewWidth-gap+feltRightInset;
  const tableWidth=Math.min(natural,Math.max(minimum,ordinaryCap));
  const inset=Math.max(feltRightInset,tableWidth-contentWidth+previewWidth+gap);
  const centeredLeft=(contentWidth-tableWidth)/2;
  const cornerLeft=Math.max(0,contentWidth-previewWidth);
  const centeredFeltRight=centeredLeft+tableWidth-inset;
  const previewLeft=cornerLeft-centeredFeltRight>maxGap?centeredFeltRight+maxGap:cornerLeft;
  const tableLeft=Math.min(centeredLeft,Math.max(0,previewLeft-gap-tableWidth+inset));
  return {tableWidth,tableLeft,previewLeft,feltRightInset:inset,gap:previewLeft-(tableLeft+tableWidth-inset)};
}

export function clearPreviewCards(cards,obstacles,maxShift,clearance=2) {
  let shift=0;
  for(let iteration=0;iteration<cards.length*obstacles.length+1;iteration++) {
    let next=shift;
    for(const card of cards)for(const obstacle of obstacles) {
      if(card.left>=obstacle.right||card.right<=obstacle.left)continue;
      if(card.bottom<=obstacle.top+shift||card.top>=obstacle.bottom+shift)continue;
      next=Math.max(next,card.bottom+clearance-obstacle.top);
    }
    if(next===shift)return {shift,fits:true};
    if(next>maxShift)return {shift:maxShift,fits:false};
    shift=next;
  }
  return {shift,fits:false};
}

// Reserve the same corner footprint while the canonical last-trick box is empty.
// These offsets mirror production.css; no faces or card IDs are created here.
export function emptyPreviewCards(rect,{cardWidth}={}) {
 if(cardWidth) {
  const height=cardWidth*82.4/57.6,center=(rect.width-cardWidth)/2,sideTop=(rect.height-height)/2;
  return [[center,0],[0,sideTop],[rect.width-cardWidth,sideTop],[center,rect.height-height]].map(([x,y])=>({left:rect.left+x,right:rect.left+x+cardWidth,top:rect.top+y,bottom:rect.top+y+height}));
 }
 const compact=rect.width<100,short=compact&&rect.height<70;
 const width=compact?(short?21:25):36,height=width*82.4/57.6;
 const center=compact?29:42,sideTop=compact?(short?17:19):29;
 return [[center,0],[0,sideTop],[rect.width-width,sideTop],[center,rect.height-height]].map(([x,y])=>({left:rect.left+x,right:rect.left+x+width,top:rect.top+y,bottom:rect.top+y+height}));
}
