// Source/numerical regression checks only. No renderer or production game.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {CARD_ASPECT,rallyFrameMetrics,fitRallyTrick,fitRallyJacks} from './approved/shared/rally-fit.mjs';
import {lastTrickPocket} from './approved/shared/last-trick-pocket.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const report={checkedAt:new Date().toISOString(),scope:'Authored helper outputs with source-estimated seat/announcement rectangles and calculated shell budgets; not measured CSS rendering or device acceptance.',matrix:[],checks:[],failures:[]};
function check(name,fn){try{fn();report.checks.push({name,status:'passed'});console.log(`PASS ${name}`)}catch(e){report.failures.push(`${name}: ${e.message}`);report.checks.push({name,status:'failed',detail:e.message});console.error(`FAIL ${name}: ${e.message}`)}}
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const overlap=(a,b)=>a.left<b.right-1e-7&&a.right>b.left+1e-7&&a.top<b.bottom-1e-7&&a.bottom>b.top+1e-7;
const rect=(x,y,w,h)=>({left:x,right:x+w,top:y,bottom:y+h});
const opening=[{suit:'C',low:9,high:11},{suit:'D',low:8,high:12},{suit:'H',low:9,high:11},{suit:'S',low:10,high:12}];
const full=['C','D','H','S'].map(suit=>({suit,low:2,high:14}));

// Budget arithmetic follows the selected shell's source declarations. The
// canPin boundary is exercised against real coaching.js by its separate VM suite.
function frame(w,h,pin,safe={left:0,right:0,top:0,bottom:0}){
 const side=w<=1000&&h<=430&&w>h,rail=side?52:0;
 const hud=side?0:h<=480&&w>h?48:56;
 const clientWidth=w-rail-(side?safe.left:0),canPin=clientWidth>=760;
 const coach=w>900&&h>480?clamp(w*.22,240,320):204,edge=coach===204?8:12;
 const pinned=pin&&canPin;
 return {width:w-rail-safe.left-safe.right-(pinned?coach+2*edge:0),height:h-hud-safe.top-safe.bottom,clientWidth,canPin,pinned,hud,rail,coach,edge};
}
function validateFit(fit,bounds,obstacles){
 assert(fit,'No positive clear placement');
 for(const [key,value]of Object.entries(fit))if(typeof value==='number')assert(Number.isFinite(value),`Nonfinite ${key}`);
 assert(fit.left>=bounds.left-1e-8&&fit.right<=bounds.right+1e-8&&fit.top>=bounds.top-1e-8&&fit.bottom<=bounds.bottom+1e-8,'Outside available bounds');
 for(const obstacle of obstacles)assert(!overlap(fit,{left:obstacle.left-6,right:obstacle.right+6,top:obstacle.top-6,bottom:obstacle.bottom+6}),'Seat or announcement overlap');
}
function selectedExtent(width){
 const height=width*CARD_ASPECT,angle=-12*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),ox=width/2,oy=height*.85;
 return [0,width].flatMap(x=>[0,height].map(y=>({x:ox+(x-ox)*c-(y-oy)*s,y:oy+(x-ox)*s+(y-oy)*c-height*.15})));
}
function geometry(budget,jacks=false){
 const compact=budget.height<=520,padding=compact?{left:12,right:12,top:4,bottom:4}:{left:24,right:24,top:12,bottom:10};
 const m=rallyFrameMetrics({width:budget.width,height:budget.height,padding});
 const pocket=lastTrickPocket({contentWidth:m.contentWidth,preferredWidth:m.preferredWidth,feltRightInset:compact?30:42,previewWidth:m.previewWidth});
 const width=jacks?m.preferredWidth:pocket.tableWidth,height=m.tableHeight;
 const badgeWidth=compact?108:138,badgeHeight=compact?54:76,sideWidth=compact?60:68;
 const sideHeight=m.avatar+(compact?3:6)+m.nameSize*1.2+m.detailSize*1.1+3+(compact?18:28)+(compact?6:10);
 const northX=compact?(jacks?.12:.2):.5,southX=compact?(jacks?.88:.8):.5;
 const sideY=compact?.49:.43;
 const seats=[rect(width*northX-badgeWidth/2,0,badgeWidth,badgeHeight),rect(width*southX-badgeWidth/2,height-badgeHeight,badgeWidth,badgeHeight),rect(0,height*sideY-sideHeight/2,sideWidth,sideHeight),rect(width-sideWidth,height*sideY-sideHeight/2,sideWidth,sideHeight)];
 const inset=jacks?(compact?35:54):pocket.feltRightInset,leftInset=jacks?(compact?35:54):(compact?30:42);
 return {metrics:m,bounds:{left:leftInset+8,right:width-inset-8,top:(compact?16:jacks?28:32)+6,bottom:height-(compact?10:jacks?18:22)-6},seats,width,height};
}
const sizes=[[568,320],[667,375],[844,390],[915,412],[1024,768],[1180,820],[1366,1024],[1440,900],[1920,1080]];
check('Nine viewport matrix: hand containment, selected lift, tricks and both Jacks histories',()=>{
 for(const [w,h]of sizes)for(const requestPin of [false,true]){
  const budget=frame(w,h,requestPin),g=geometry(budget),m=g.metrics;
  assert(m.tableHeight>100,'No useful table height');
  const ideal=(13*m.handWidth-(m.handAvailable-14))/12,fanOverlap=clamp(ideal,m.handWidth*.4,m.handWidth*.62);
  const fanWidth=13*m.handWidth-12*fanOverlap;
  assert(fanWidth<=m.handAvailable-14+1e-8,'Thirteen-card fan exceeds its available width');
  const projected=selectedExtent(m.handWidth);
  assert(Math.min(...projected.map(p=>p.y))+m.handLift>=0,'Selected card clips above allocated hand row');
  assert(-Math.min(...projected.map(p=>p.x))<=m.handInsetLeft,'Selected first card reaches left control lane');
  assert(Math.max(...projected.map(p=>p.x))-m.handWidth<=m.handInsetRight,'Selected last card clips right edge');
  const trick=fitRallyTrick({bounds:g.bounds,obstacles:g.seats,center:{x:g.width/2,y:g.height/2},maxCardWidth:m.maxTableCard});validateFit(trick,g.bounds,g.seats);
  const j=geometry(budget,true),announcedWidth=(m.compact?31.68:43.2)*1.55,announcedHeight=(m.compact?31.68:43.2)*CARD_ASPECT;
  const announcements=[rect(j.seats[0].right+8,8,announcedWidth,announcedHeight),rect(j.seats[1].left-announcedWidth-8,j.height-announcedHeight-8,announcedWidth,announcedHeight)];
  const obstacles=[...j.seats,...announcements],center={x:j.width/2,y:j.height/2};
  const jackFits=[opening,full].map(rows=>{const fit=fitRallyJacks({bounds:j.bounds,obstacles,center,maxCardWidth:m.maxJacksCard,rows});validateFit(fit,j.bounds,obstacles);for(const row of rows)for(const rank of [row.low,row.high]){const top=fit.top+(14-rank-fit.firstRow)*fit.step*fit.cardWidth;assert(top>=fit.top-1e-8&&top+fit.cardWidth*CARD_ASPECT<=fit.bottom+1e-8,'A public endpoint card leaves the layout');}return fit;});
  report.matrix.push({viewport:`${w}×${h}`,requestPin,actualPin:budget.pinned,iframe:`${budget.width.toFixed(1)}×${budget.height.toFixed(1)}`,tableHeight:+m.tableHeight.toFixed(1),handWidth:m.handWidth,trickWidth:trick.cardWidth,jacksOpening:jackFits[0].cardWidth,jacksFull:jackFits[1].cardWidth,trickBoundingAreaRatio:+(trick.width*trick.height/((g.bounds.right-g.bounds.left)*(g.bounds.bottom-g.bounds.top))).toFixed(3)});
 }
});
check('Notched phone and layout thresholds preserve positive budgets',()=>{
 const phone=frame(844,390,true,{left:47,right:47,top:0,bottom:21});assert.equal(phone.pinned,false);assert.equal(phone.width,698);assert.equal(phone.height,369);
 for(const [w,h]of [[1000,430],[1001,430],[1000,431],[768,1024]]){const b=frame(w,h,true);assert(b.width>0&&b.height>0);const m=rallyFrameMetrics({width:b.width,height:b.height});assert(m.tableHeight>100);}
 const g=geometry(phone,true),fit=fitRallyJacks({bounds:g.bounds,obstacles:g.seats,center:{x:g.width/2,y:g.height/2},maxCardWidth:g.metrics.maxJacksCard,rows:full});validateFit(fit,g.bounds,g.seats);
 report.notchedPinBoundary=[];
 for(const w of [858,859,860]){
  const b=frame(w,390,true,{left:47,right:47,top:0,bottom:21});assert.equal(b.clientWidth,w-99);assert.equal(b.pinned,w>=859);
  const field=geometry(b,true),placed=fitRallyJacks({bounds:field.bounds,obstacles:field.seats,center:{x:field.width/2,y:field.height/2},maxCardWidth:field.metrics.maxJacksCard,rows:full});validateFit(placed,field.bounds,field.seats);
  report.notchedPinBoundary.push({viewport:`${w}×390`,clientWidth:b.clientWidth,actualPin:b.pinned,iframe:`${b.width}×${b.height}`,fullJacksWidth:placed.cardWidth});
 }
});
check('Large play activity grows instead of retaining a tiny fixed public pile',()=>{
 const rows=report.matrix.filter(row=>!row.requestPin&&['1366×1024','1440×900','1920×1080'].includes(row.viewport));assert.equal(rows.length,3);
 for(const row of rows){assert(row.trickWidth>57.6,`${row.viewport} still uses the old fixed width`);assert(row.trickBoundingAreaRatio>=.08,`${row.viewport} sparse activity area`);}
});
check('Fit is stateless across large, short, impossible and recovered public histories',()=>{
 const large={bounds:rect(0,0,800,600),center:{x:400,y:300},maxCardWidth:96,rows:opening};
 const first=fitRallyJacks(large);validateFit(first,large.bounds,[]);
 const small={...large,bounds:rect(0,0,310,180),center:{x:155,y:90},rows:full};validateFit(fitRallyJacks(small),small.bounds,[]);
 assert.equal(fitRallyJacks({...small,bounds:rect(0,0,0,0)}),null);
 assert.deepEqual(fitRallyJacks(large),first,'Recovery retains no prior small/invalid fit');
 assert.equal(fitRallyTrick({bounds:rect(0,0,200,100),obstacles:[rect(0,0,200,100)],center:{x:100,y:50},maxCardWidth:40}),null);
});
const out=path.join(here,'evidence');fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'responsive-report.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(out,'responsive-report.md'),`# Rally responsive numerical review\n\n${report.checkedAt}\n\n${report.scope}\n\n`+report.checks.map(c=>`- **${c.status.toUpperCase()}** ${c.name}${c.detail?`: ${c.detail}`:''}`).join('\n')+'\n\n| Viewport | Requested pin | Actual pin | Iframe | Hand width | Trick width | Opening Jacks | Full Jacks |\n|---|---|---|---|---:|---:|---:|---:|\n'+report.matrix.map(r=>`| ${r.viewport} | ${r.requestPin} | ${r.actualPin} | ${r.iframe} | ${r.handWidth} | ${r.trickWidth} | ${r.jacksOpening} | ${r.jacksFull} |`).join('\n')+'\n\nSeat dimensions and CSS shell budgets are source-derived estimates, not actual DOM rectangles. Selected-card projection uses the canonical transform origin and angle. Glyph readability, clipping in a browser, safe-area behavior on a physical device, drag/throw animation, Coach overlap and prompt fit still need rendered QA. Pin/session/replay behavior is tested separately by approved/verify-coaching-panel.mjs. No renderer, backend or production-game tests were run.\n');
process.exitCode=report.failures.length?1:0;
