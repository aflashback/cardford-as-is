import assert from 'node:assert/strict';
import {lastTrickPocket,clearPreviewCards,emptyPreviewCards} from './last-trick-pocket.mjs';
const cases=[
  {name:'desktop',width:1280,padding:24,ratio:.86,limit:930,inset:42,preview:120},
  {name:'wide desktop',width:1920,padding:24,ratio:.86,limit:930,inset:42,preview:120},
  {name:'iPhone 12',width:844,padding:12,ratio:.84,limit:850,inset:30,preview:82},
  {name:'short phone pinned',width:450,padding:12,ratio:.84,limit:850,inset:30,preview:82},
  {name:'safe area pinned',width:442,padding:12,ratio:.84,limit:850,inset:30,preview:82},
  {name:'568x320 pinned',width:348,padding:12,ratio:.84,limit:850,inset:30,preview:82},
  {name:'Trix penalties pinned',width:348,padding:12,ratio:.98,limit:1160,inset:35,preview:82},
];
for(const test of cases) {
 const contentWidth=test.width-test.padding*2;
 const result=lastTrickPocket({contentWidth,preferredWidth:Math.min(contentWidth*test.ratio,test.limit),feltRightInset:test.inset,previewWidth:test.preview});
 assert.ok(result.gap>=30-1e-9&&result.gap<=100+1e-9,test.name+' gap');
 assert.ok(result.tableLeft>=0&&result.tableLeft+result.tableWidth<=contentWidth+1e-9,test.name+' table bounds');
 assert.ok(result.previewLeft>=0&&result.previewLeft+test.preview<=contentWidth+1e-9,test.name+' preview bounds');
 assert.ok(result.tableWidth>=278,test.name+' seat corridor');
  if(test.name==='wide desktop')assert.equal(result.gap,100);
 console.log(`${test.name}: table ${result.tableWidth.toFixed(1)}px, gap ${result.gap.toFixed(1)}px, felt inset ${result.feltRightInset.toFixed(1)}px`);
}
const avoid=clearPreviewCards([{left:254,right:275,top:17,bottom:47},{left:283,right:304,top:34,bottom:64}],[{left:246,right:274,top:44,bottom:72},{left:230,right:290,top:75,bottom:115}],55);
assert.equal(avoid.fits,true);assert.equal(avoid.shift,5);
assert.deepEqual(clearPreviewCards([{left:1,right:3,top:1,bottom:4}],[{left:10,right:15,top:1,bottom:4}],0),{shift:0,fits:true});
const reserved=emptyPreviewCards({left:254,top:0,width:82,height:64});
assert.equal(reserved.length,4);assert.equal(reserved[1].left,254);assert.equal(reserved[1].top,17);
assert.ok(Math.abs(reserved[3].bottom-64)<1e-9);
assert.equal(clearPreviewCards(reserved,[{left:246,right:274,top:44,bottom:72}],55).fits,true);
// Estimated from the unchanged short-landscape rules: 50px hand faces +14px
// row padding; 28px avatar; 3px side gap; 12px/1.2 name, 10px/1.1 detail,
// 16px fan +2px margin; 6px info padding. South is a horizontal badge.
for(const {width,height} of [{width:348,height:272},{width:447,height:327}]) {
 const contentWidth=width-24;
 const pocket=lastTrickPocket({contentWidth,preferredWidth:contentWidth*.84,feltRightInset:30,previewWidth:82});
 const tableHeight=height-8-(50*82.4/57.6+14),infoHeight=14.4+2+11+2+16+6,sideHeight=28+3+infoHeight;
 const eastRight=12+pocket.tableLeft+pocket.tableWidth,eastTop=4+tableHeight*.49-sideHeight/2;
 const east=[{left:eastRight-44,right:eastRight-16,top:eastTop,bottom:eastTop+28},{left:eastRight-60,right:eastRight,top:eastTop+31,bottom:eastTop+sideHeight}];
 const southTop=4+tableHeight-(14.4+2+16+8);
 const cards=emptyPreviewCards({left:12+pocket.previewLeft,top:0,width:82,height:64});
 const maxShift=southTop-2-Math.max(...east.map(rect=>rect.bottom));
 const clearance=clearPreviewCards(cards,east,Math.max(0,maxShift));
 assert.equal(clearance.fits,true,`${width}x${height} preview/east clearance`);
 assert.ok(east[1].bottom+clearance.shift<=southTop-2,`${width}x${height} east/south clearance`);
 for(const card of cards)for(const obstacle of east)assert.ok(card.right<=obstacle.left||card.left>=obstacle.right||card.bottom<=obstacle.top+clearance.shift||card.top>=obstacle.bottom+clearance.shift,`${width}x${height} no overlap`);
 console.log(`${width}x${height}: estimated East offset ${clearance.shift.toFixed(1)}px; South gap ${(southTop-east[1].bottom-clearance.shift).toFixed(1)}px`);
}
console.log('PASS 7 pocket sizes + 5 card/seat clearance cases, including empty reservation and two source-metric narrow layouts (numerical only).');
