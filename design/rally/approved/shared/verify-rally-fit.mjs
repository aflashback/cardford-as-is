import assert from 'node:assert/strict';
import {CARD_ASPECT,rallyFrameMetrics,fitRallyTrick,fitRallyJacks} from './rally-fit.mjs';

const opening=[{suit:'C',low:9,high:11},{suit:'D',low:8,high:12},{suit:'H',low:9,high:11},{suit:'S',low:10,high:12}];
const frame=rallyFrameMetrics({width:516,height:320,padding:{left:12,right:12,top:4,bottom:4}});
assert.equal(frame.handWidth,54.4);
assert.ok(frame.handWidth*5.56+14<=frame.handAvailable);
assert.ok(frame.handLift>=frame.handWidth*.30+3);
assert.ok(Math.abs(frame.tableHeight+frame.handHeight+frame.rowGap+8-320)<1e-8);
const bounds={left:47,right:469,top:26,bottom:199};
// Conservative compact badge/announcement rectangles, not captured browser geometry.
const obstacles=[{left:21,right:121,top:4,bottom:60},{left:123,right:155,top:6,bottom:52},
 {left:395,right:495,top:159,bottom:215},{left:355,right:387,top:161,bottom:207},
 {left:12,right:88,top:62,bottom:154},{left:94,right:126,top:108,bottom:154},
 {left:428,right:504,top:62,bottom:154},{left:390,right:422,top:108,bottom:154}];
const request={bounds,obstacles,center:{x:258,y:109.5},maxCardWidth:frame.maxJacksCard,rows:opening};
const fit=fitRallyJacks(request);
assert.ok(fit&&fit.cardWidth>=30,'SE opening keeps a readable proportional face');
for(const obstacle of obstacles)assert.ok(fit.right<=obstacle.left-6||fit.left>=obstacle.right+6||fit.bottom<=obstacle.top-6||fit.top>=obstacle.bottom+6,'opening avoids badge/announcement');
const jackY=fit.top+(3-fit.firstRow)*fit.cardWidth*fit.step;
for(const row of opening){assert.ok(row.low<=11&&row.high>=11);assert.equal(fit.top+(14-11-fit.firstRow)*fit.cardWidth*fit.step,jackY);}
assert.equal(fit.height,fit.cardWidth*((fit.high-fit.low)*fit.step+CARD_ASPECT));
const full=fitRallyJacks({...request,rows:opening.map(row=>({...row,low:2,high:14}))});
assert.ok(full&&full.spread===.7,'full public range can use canonical compact spread');
const impossible={...request,obstacles:[bounds]};
assert.equal(fitRallyJacks(impossible),null,'no clear space cannot retain stale geometry');
assert.equal(fitRallyTrick({...impossible,maxCardWidth:48}),null);
const trick=fitRallyTrick({bounds:{left:0,right:400,top:0,bottom:200},obstacles:[],center:{x:200,y:100},maxCardWidth:80});
assert.ok(trick&&trick.left>=0&&trick.right<=400&&trick.top>=0&&trick.bottom<=200);
assert.ok(Math.abs(trick.height/trick.cardWidth-CARD_ASPECT*2.84)<1e-8);
const tall=rallyFrameMetrics({width:1920,height:1024,padding:{left:24,right:24,top:12,bottom:10}});
const ultrawide=rallyFrameMetrics({width:2560,height:1024,padding:{left:24,right:24,top:12,bottom:10}});
assert.equal(tall.handWidth,154);assert.equal(tall.maxTableCard,136);
assert.equal(ultrawide.handWidth,tall.handWidth);assert.equal(ultrawide.maxTableCard,tall.maxTableCard);
console.log(`SE source model: hand ${frame.handWidth}px; Jacks opening ${fit.cardWidth}px (${fit.spread?'spread':'straight'}), full rank range ${full.cardWidth}px.`);
console.log('PASS hand containment/lift, aligned Jack baselines, public range fit, announcement clearance, null-fit reset, trick proportions and ultrawide height stability. Numerical/source checks only.');
