import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {CARD_ASPECT, fitRallyAnnouncement, fitRallyJacks, rallyFrameMetrics, rallyJacksAnnouncementSlots, rallyJacksPlayerSlots, type Rect} from '../src/table/responsiveGeometry.ts';
import {coachDimensions, coachDisplay, initialCoachUI} from '../src/rally/coachPresentation.ts';

// Offline geometry and actual-hook checks, not browser or glyph acceptance.
type Profile = {id:string;width:number;height:number};
const registry = {module:{exports:{} as {profiles:Profile[]}}};
runInNewContext(readFileSync(new URL('../../design/rally/device-profiles.js',import.meta.url),'utf8'),registry);
const profiles = registry.module.exports.profiles;
const epsilon = 1e-7;
const rect = (left:number,top:number,width:number,height:number) =>
  ({left,top,right:left+width,bottom:top+height,width,height});
const separate = (a:Rect,b:Rect,gap=0) => a.right<=b.left-gap+epsilon || a.left>=b.right+gap-epsilon ||
  a.bottom<=b.top-gap+epsilon || a.top>=b.bottom+gap-epsilon;

const rallyCSS=readFileSync(new URL('../src/table/rally-table.css',import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
function jacksDeclarations(compact:boolean,element:'.player'|'.remaining-cards') {
  const selector=`.rally-game-shell${compact?'[data-rally-compact=true]':''}[data-rally-phase=jacks] .table-zone ${element}`;
  const block=[...rallyCSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(match=>match[1].trim()===selector);
  assert.ok(block,`Source sizing fixture needs the actual ${selector} rule`);
  return Object.fromEntries([...block[2].matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g)].map(match=>[match[1],match[2].trim()]));
}

test('visible Jacks tags fit their content while fan width stays with the intrinsic count styling',()=>{
  const normal=jacksDeclarations(false,'.player');
  assert.equal(normal.width,'max-content','Visible tags must not use the fixed clearance width');
  assert.equal(normal['justify-content'],'flex-start','Content remains grouped rather than spread across a reserved box');
  for(const compact of [false,true]){
    const player=jacksDeclarations(compact,'.player'),fan=jacksDeclarations(compact,'.remaining-cards');
    assert.ok(player.width===undefined||player.width==='max-content','Compact tags must not restore a fixed width');
    assert.ok(fan.width===undefined||fan.width.includes('var(--remaining)'),
      'Rally must not override the count-dependent fan wrapper with a fixed width');
  }
});

const source = ts.createSourceFile('useLayoutFit.ts',readFileSync(new URL('../src/games/trix/useLayoutFit.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
let fitFunction:ts.FunctionDeclaration|undefined;
function findFit(node:ts.Node) {
  if(ts.isFunctionDeclaration(node)&&node.name?.text==='fit') fitFunction=node;
  ts.forEachChild(node,findFit);
}
findFit(source);
assert.ok(fitFunction,'Exercise the actual announcement placement effect');
const fitCode = ts.transpileModule(`${fitFunction.getText(source)};exports.fit=fit;`,{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
}).outputText;

class Style {
  left='';right='';top='';bottom='';transform='';visibility='';
  values=new Map<string,string>();
  setProperty(key:string,value:string){this.values.set(key,value);}
  removeProperty(key:string){this.values.delete(key);}
}

// Visible tag widths are independent source fixtures, not browser font metrics.
// Production helpers reserve the larger, fixed clearance envelopes separately.
const opening=[{low:9,high:12},{low:11,high:11},{low:10,high:11},{low:0,high:0}];
const dense=Array.from({length:4},()=>({low:2,high:14}));
function scene(profile:Profile,pin:boolean,counts:number[],state:'hidden'|'revealed',feltOffset={top:0,bottom:0},publicBoard=opening,actualTagWidths?:number[],partners=true) {
  const rail=profile.width<=1000&&profile.height<=430?52:0;
  const header=rail?0:profile.height<=480?48:56;
  const screenWidth=profile.width-rail,screenHeight=profile.height-header;
  const display=coachDisplay(initialCoachUI({open:pin,pinPreferred:pin}),false,screenWidth);
  const dimensions=coachDimensions(profile.width,profile.height,screenHeight,0);
  const mainWidth=screenWidth-(display.pinned?dimensions.laneWidth:0);
  const compact=screenHeight<=520;
  const padding=compact?{left:12,right:12,top:4,bottom:4}:{left:24,right:24,top:12,bottom:10};
  const metrics=rallyFrameMetrics({width:mainWidth,height:screenHeight,padding,overlapHandLift:true});
  const x=rail+(display.pinned?dimensions.laneWidth:0)+padding.left+(metrics.contentWidth-metrics.preferredWidth)/2;
  const y=header+padding.top;
  const zone=rect(x,y,metrics.preferredWidth,metrics.tableHeight);
  const widths=actualTagWidths??(compact?[75,120,118,120]:[90,155,145,155]);
  const tagHeight=metrics.avatar+8;
  const sideTop=y+zone.height*.5-tagHeight/2;
  const boxes=[
    rect(x+zone.width*.5-widths[0]/2,zone.bottom-tagHeight,widths[0],tagHeight),
    rect(x,sideTop,widths[1],tagHeight),
    rect(x+zone.width*.5-widths[2]/2,y,widths[2],tagHeight),
    rect(zone.right-widths[3],sideTop,widths[3],tagHeight),
  ];
  const cardWidth=profile.height<=520?31.68:43.2;
  const announcements=counts.map((count,seat)=>{
    if(!count)return null;
    const width=cardWidth*(1+(count-1)*.55),height=cardWidth*CARD_ASPECT,owner=boxes[seat];
    const initial=seat===0?rect(compact?owner.left-width-8:owner.right+8,owner.bottom-height-8,width,height):
      seat===2?rect(owner.right+14,owner.bottom-height-8,width,height):
      rect(seat===1?owner.right+6:owner.left-width-6,owner.top+owner.height/2,width,height);
    const style=new Style();
    return {style,dataset:{state},getBoundingClientRect:()=>rect(
      style.left?owner.left+parseFloat(style.left):initial.left,
      style.top?owner.top+parseFloat(style.top):initial.top,width,height)};
  });
  const players=boxes.map((box,seat)=>({getBoundingClientRect:()=>box,
    querySelector:(selector:string)=>selector==='.trix-two-announcements'?announcements[seat]:
      selector==='.player-name'?{getBoundingClientRect:()=>({width:metrics.nameSize*2.7})}:null}));
  const inset=compact?35:54;
  const verticalInset=compact?18:26;
  const felt=rect(zone.left+inset,zone.top+verticalInset+feltOffset.top,zone.width-2*inset,
    zone.height-2*verticalInset-feltOffset.top-feltOffset.bottom);
  const main={dataset:{rallyCompact:String(compact)}};
  const table={getBoundingClientRect:()=>zone,closest:()=>main,
    querySelector:(selector:string)=>selector==='.table-felt'?{getBoundingClientRect:()=>felt}:
      /^\.player-[0-3]$/.test(selector)?players[Number(selector.at(-1))]:null,
    querySelectorAll:(selector:string)=>selector==='.player'?players:
      selector==='.player-0 .announced-cards,.player-2 .announced-cards'?[announcements[0],announcements[2]].filter(Boolean):
      selector==='.player,.announced-cards'?[...players,...announcements.filter(Boolean)]:[],
  };
  const board={closest:()=>table,dataset:{} as Record<string,string>,style:new Style()};
  const slotCalls:{options:Parameters<typeof rallyJacksAnnouncementSlots>[0];slots:ReturnType<typeof rallyJacksAnnouncementSlots>}[]=[];
  const playerSlotCalls:{options:Parameters<typeof rallyJacksPlayerSlots>[0];slots:ReturnType<typeof rallyJacksPlayerSlots>}[]=[];
  const jacksCalls:{options:Parameters<typeof fitRallyJacks>[0];result:ReturnType<typeof fitRallyJacks>}[]=[];
  const context={ref:{current:board},publicBoard,partners,document:{createElement:()=>({getContext:()=>({font:'',measureText:()=>({width:metrics.detailSize*1.8})})})},rallyJacksPlayerSlots:(options:Parameters<typeof rallyJacksPlayerSlots>[0])=>{
      const slots=rallyJacksPlayerSlots(options);playerSlotCalls.push({options,slots});return slots;
    },rallyJacksAnnouncementSlots:(options:Parameters<typeof rallyJacksAnnouncementSlots>[0])=>{
      const slots=rallyJacksAnnouncementSlots(options);slotCalls.push({options,slots});return slots;
    },
    fitRallyJacks:(options:Parameters<typeof fitRallyJacks>[0])=>{
      const result=fitRallyJacks(options);jacksCalls.push({options,result});return result;
    },getComputedStyle:()=>({fontFamily:'sans-serif',getPropertyValue:(name:string)=>String(name==='--rally-two-width'?cardWidth:name==='--rally-avatar'?metrics.avatar:name==='--rally-detail-size'?metrics.detailSize:metrics.maxJacksCard)}),exports:{} as {fit:()=>void}};
  runInNewContext(fitCode,context);context.exports.fit();
  return {zone,felt,boxes,announcements,slotCalls,playerSlotCalls,jacksCalls,board,metrics};
}

// Exactly four twos, with both partnerships represented. No invented all-four
// announcement: the game deliberately suppresses that case.
const distributions:number[][]=[];
for(let south=0;south<=3;south++)for(let west=0;west<=3;west++)for(let north=0;north<=3;north++){
  const east=4-south-west-north;
  if(east>=0&&east<=3&&south+north>0&&west+east>0) distributions.push([south,west,north,east]);
}

// Every physically reachable removal state from a valid four-two announcement,
// including no announcements remaining. No hidden card identities are needed.
const progressCounts=[...new Map(distributions.flatMap(initial=>{
  const values:number[][]=[];
  for(let a=0;a<=initial[0];a++)for(let b=0;b<=initial[1];b++)
    for(let c=0;c<=initial[2];c++)for(let d=0;d<=initial[3];d++)values.push([a,b,c,d]);
  return values;
}).map(counts=>[counts.join(','),counts])).values()];

test('592px Solo Jacks uses the available felt instead of obsolete wide tags or phantom twos',()=>{
  const profile={id:'annotated-narrow-panel',width:592,height:579};
  const first=scene(profile,false,[0,0,0,0],'hidden',{top:0,bottom:0},opening,undefined,false);
  const last=scene(profile,false,[0,0,0,0],'hidden',{top:0,bottom:0},dense,[72,90,100,90],false);
  assert.equal(first.slotCalls.length,0,'Solo does not reserve Partners-only announcement pockets');
  const fit=first.jacksCalls[0].result!;
  assert.ok(fit.cardWidth>=36,`Available table height supports readable faces, got ${fit.cardWidth}`);
  assert.ok(first.playerSlotCalls[0].options.playerWidth!<180,'Small typography does not reserve an old 208px tag');
  assert.deepEqual(last.jacksCalls[0].result,fit,'Opening and full Ace-to-two board remain identical');
  assert.equal(fit.x,(first.felt.left+first.felt.right)/2);
  assert.equal(fit.y,(first.felt.top+first.felt.bottom)/2);
});

test('all four Trix variants retain identical opening/full rank geometry across landscape profiles',()=>{
  for(const variant of ['basic-solo','complex-solo','basic-partners','complex-partners']) {
    const partners=variant.endsWith('partners');
    for(const profile of [...profiles,{id:'annotated-narrow-panel',width:592,height:579}]) for(const pin of [false,true]) {
      const first=scene(profile,pin,[0,0,0,0],'hidden',{top:0,bottom:0},opening,undefined,partners);
      const last=scene(profile,pin,[0,0,0,0],'revealed',{top:0,bottom:0},dense,undefined,partners);
      assert.ok(first.jacksCalls[0].result,`${variant}/${profile.id}/${pin}: board fits`);
      assert.deepEqual(last.jacksCalls[0].result,first.jacksCalls[0].result,`${variant}/${profile.id}/${pin}: stable full rank footprint`);
      assert.equal(first.slotCalls.length,partners?1:0,`${variant}: only Partners reserves two announcements`);
    }
  }
});

test('content-sized player tags and declining hand counts cannot change permanent Jacks clearance or rank geometry',async t=>{
  let comparisons=0;
  for(const profile of profiles)await t.test(profile.id,()=>{
    for(const pin of [false,true]){
      const baseline=scene(profile,pin,[1,1,1,1],'revealed',{top:0,bottom:0},dense);
      assert.equal(baseline.playerSlotCalls.length,1);
      const clearance=baseline.playerSlotCalls[0].slots;
      const {zone,metrics}=baseline;
      const maximum=baseline.playerSlotCalls[0].options.playerWidth!,height=metrics.avatar+8;
      assert.equal(clearance.length,4);
      clearance.forEach((box,seat)=>{
        assert.ok(Math.abs(box.right-box.left-maximum)<epsilon,`${profile.id}/${seat}: permanent width is independent of text/counts`);
        assert.ok(Math.abs(box.bottom-box.top-height)<epsilon,`${profile.id}/${seat}: avatar plus padding sets clearance height`);
      });
      assert.ok(Math.abs((clearance[0].left+clearance[0].right)/2-zone.left-zone.width/2)<epsilon);
      assert.ok(Math.abs(clearance[0].bottom-zone.bottom)<epsilon);
      assert.ok(Math.abs(clearance[2].top-zone.top)<epsilon);
      assert.ok(Math.abs(clearance[1].left-zone.left)<epsilon);
      assert.ok(Math.abs(clearance[3].right-zone.right)<epsilon);
      assert.ok(Math.abs((clearance[1].top+clearance[1].bottom)/2-zone.top-zone.height/2)<epsilon);
      assert.ok(Math.abs((clearance[3].top+clearance[3].bottom)/2-zone.top-zone.height/2)<epsilon);
      for(let remaining=13;remaining>=0;remaining--){
        // Width stress covers the full source input envelope, not browser glyph
        // measurement. South stays compact without its own remaining-card fan.
        const widest=Math.min(maximum,200),wide=75+(widest-75)*remaining/13;
        const narrow=75+(widest-75)*(13-remaining)/13;
        const value=scene(profile,pin,[1,1,1,1],'revealed',{top:0,bottom:0},opening,[75,wide,narrow,wide]);
        comparisons++;
        assert.notEqual(value.boxes[0].width,maximum,'The visible South tag is not expanded to its clearance box');
        assert.deepEqual(value.playerSlotCalls[0].slots,clearance,'Actual content widths cannot change clearance');
        assert.deepEqual(value.slotCalls[0].slots,baseline.slotCalls[0].slots,'Twos pockets cannot follow shrinking tag widths');
        assert.deepEqual(value.jacksCalls[0].result,baseline.jacksCalls[0].result,'All rank coordinates and card sizes remain unchanged');
        assert.deepEqual([...value.board.style.values],[...baseline.board.style.values],'Actual layout effect writes the same geometry');
        for(const [seat,announcement] of value.announcements.entries())if(announcement){
          const box=announcement.getBoundingClientRect(),slot=value.slotCalls[0].slots[seat];
          assert.ok(slot&&Math.abs((box.left+box.right-slot.left-slot.right)/2)<epsilon&&Math.abs(box.top-slot.top)<epsilon,
            'Visible twos use actual player coordinates to reach their permanent pocket');
          for(const tag of value.boxes)assert.ok(separate(box,tag,4),'Shrinking tags remain clear of visible twos');
        }
      }
    }
  });
  t.diagnostic(`${comparisons} width/count envelope comparisons across all 18 profiles and pin preferences; source geometry only.`);
});

test('the actual hook keeps its full footprint while public ranks and announced twos appear, reveal and disappear',async t=>{
  let comparisons=0;
  const empty=Array.from({length:4},()=>({low:0,high:0}));
  const single=[{low:0,high:0},{low:11,high:11},{low:0,high:0},{low:0,high:0}];
  for(const profile of profiles)await t.test(profile.id,()=>{
    for(const pin of [false,true]){
      const baseline=scene(profile,pin,[0,0,0,0],'hidden',{top:0,bottom:0},empty);
      const expected=baseline.jacksCalls[0].result;
      assert.ok(expected);
      assert.equal(expected.firstRow,0);
      assert.equal(expected.low,2);
      assert.equal(expected.high,14);
      const compare=(value:ReturnType<typeof scene>,label:string)=>{
        comparisons++;
        assert.ok(value.slotCalls[0].slots.every(Boolean),`${label}: reserve all four pockets, including absent announcements`);
        assert.deepEqual(value.slotCalls[0].slots,baseline.slotCalls[0].slots,`${label}: permanent pockets do not follow remaining two counts`);
        assert.deepEqual(value.jacksCalls[0].result,expected,`${label}: card size, board rectangle and every rank offset remain fixed`);
        assert.deepEqual([...value.board.style.values],[...baseline.board.style.values],`${label}: the actual effect writes identical CSS geometry`);
      };
      for(const ranks of [empty,single,opening,dense])compare(
        scene(profile,pin,[0,3,1,0],'revealed',{top:0,bottom:0},ranks),`${profile.id}/${pin}/rank progression`);
      for(const counts of progressCounts)for(const state of ['hidden','revealed'] as const)compare(
        scene(profile,pin,counts,state,{top:0,bottom:0},dense),`${profile.id}/${pin}/${state}/${counts.join('-')}`);
    }
  });
  t.diagnostic(`${comparisons} actual-hook stability comparisons across ${progressCounts.length} reachable remaining-two distributions plus empty/single/partial/full board states. No browser or glyph acceptance claim.`);
});

test('side twos stay by their owner and clear names/hand across 18 profiles, pin preference and reveal state',async t=>{
  assert.equal(profiles.length,18);
  let placements=0,compactPlacements=0,rimPlacements=0,fallbackPlacements=0,minOpening=Infinity,minDense=Infinity;
  for(const profile of profiles)await t.test(profile.id,()=>{
    for(const pin of [false,true])for(const counts of distributions)for(const ranks of [opening,dense]){
      let hidden:ReturnType<typeof scene>|undefined;
      for(const state of ['hidden','revealed'] as const){
        const label=`${profile.id}/${pin?'pin':'closed'}/${state}/${counts.join('-')}/${ranks===dense?'dense':'opening'}`;
        const value=scene(profile,pin,counts,state,{top:0,bottom:0},ranks);
        const sideSeats=[1,3].filter(seat=>counts[seat]>0);
        assert.equal(value.slotCalls.length,1,`${label}: reserve all slots before fitting public lanes`);
        const slots=value.slotCalls[0].slots;
        assert.ok(slots.every(Boolean),`${label}: every reserved slot fits even when no cards are shown`);
        assert.equal(value.board.dataset.fit,'clear',`${label}: leave room for the public Jack lanes`);
        const {options:fitOptions,result:fit}=value.jacksCalls[0];
        assert.ok(fit,`${label}: centered public lanes remain visible`);
        assert.equal(fit.x,(value.felt.left+value.felt.right)/2,`${label}: exact horizontal felt center`);
        assert.equal(fit.y,(value.felt.top+value.felt.bottom)/2,`${label}: exact vertical felt center`);
        assert.ok(fit.left>=fitOptions.bounds.left-epsilon&&fit.right<=fitOptions.bounds.right+epsilon&&
          fit.top>=fitOptions.bounds.top-epsilon&&fit.bottom<=fitOptions.bounds.bottom+epsilon,`${label}: Jacks stays on the felt`);
        for(const obstacle of fitOptions.obstacles??[])assert.ok(separate(fit,obstacle,6),`${label}: public lanes clear all names and twos`);
        // An independent per-obstacle bound catches unnecessarily tiny fits,
        // without turning a numerical threshold into a glyph-readability claim.
        const limits=[fitOptions.maxCardWidth,
          2*Math.min(fit.x-fitOptions.bounds.left,fitOptions.bounds.right-fit.x)/fit.widthUnits,
          2*Math.min(fit.y-fitOptions.bounds.top,fitOptions.bounds.bottom-fit.y)/fit.heightUnits,
          ...(fitOptions.obstacles??[]).map(item=>Math.max(
            2*Math.max(fit.x-item.right-6,item.left-fit.x-6)/fit.widthUnits,
            2*Math.max(fit.y-item.bottom-6,item.top-fit.y-6)/fit.heightUnits))];
        assert.ok(Math.min(...limits)-fit.cardWidth<.1000001,`${label}: largest centered fit within rounding tolerance`);
        if(ranks===dense)minDense=Math.min(minDense,fit.cardWidth);else minOpening=Math.min(minOpening,fit.cardWidth);
        sideSeats.forEach(seat=>{
          const slot=slots[seat];
          assert.ok(slot,`${label}: seat ${seat} must not retain an unfitted position`);
          const result=value.announcements[seat]!.getBoundingClientRect();
          placements++;if(value.metrics.compact)compactPlacements++;
          for(const number of Object.values(result))assert.ok(Number.isFinite(number),`${label}: finite placement`);
          assert.ok(result.left>=value.zone.left-epsilon&&result.right<=value.zone.right+epsilon&&
            result.top>=value.zone.top-epsilon&&result.bottom<=value.zone.bottom+epsilon,`${label}: contained above the hand`);
          for(const box of value.boxes)assert.ok(separate(result,box,4),`${label}: clear every complete player/name/score tag`);
          for(const obstacle of [slots[0],slots[2]])assert.ok(obstacle&&separate(result,obstacle,4),`${label}: clear fixed North/South announcements`);
          const centerX=(result.left+result.right)/2;
          assert.ok(seat===1?centerX<value.zone.left+value.zone.width/2:centerX>value.zone.left+value.zone.width/2,
            `${label}: do not move twos to another owner's side`);
          assert.ok(Math.abs(centerX-(slot.left+slot.right)/2)<epsilon&&Math.abs(result.top-slot.top)<epsilon,
            `${label}: actual hook centers any remaining card count inside its stable slot`);
          const edge=seat===1?value.felt.left:value.felt.right;
          if(result.left<edge&&result.right>edge)rimPlacements++;
          if(result.top<value.boxes[seat].bottom+4-epsilon)fallbackPlacements++;
          if(hidden)assert.deepEqual(result,hidden.announcements[seat]!.getBoundingClientRect(),`${label}: revealing faces must not move the announcement`);
        });
        if(state==='hidden')hidden=value;
      }
    }
  });
  assert.ok(compactPlacements>0&&rimPlacements>0,
    'Cover short screens and permitted decorative-rim overlap');
  t.diagnostic(`${placements} side placements (${compactPlacements} compact, ${fallbackPlacements} constrained fallbacks), ${distributions.length} valid four-two distributions; hidden/revealed geometry equivalent. Smallest opening/full faces ${minOpening}/${minDense}px. Source geometry, not browser acceptance.`);
});

test('the actual layout effect centers on the felt rather than the table box at a nonzero page origin',()=>{
  const value=scene({id:'offset-felt',width:1440,height:900},true,[1,1,1,1],'revealed',{top:3,bottom:9});
  const {options,result}=value.jacksCalls[0];
  assert.ok(result);
  const x=(value.felt.left+value.felt.right)/2,y=(value.felt.top+value.felt.bottom)/2;
  assert.notEqual(y,value.zone.top+value.zone.height/2,'The fixture distinguishes felt center from zone center');
  assert.equal(options.center.x,x);
  assert.equal(options.center.y,y);
  assert.equal(Number.parseFloat(value.board.style.values.get('left')!),x-value.zone.left);
  assert.equal(Number.parseFloat(value.board.style.values.get('top')!),y-value.zone.top);
});

test('North and South announcement pockets remain beside the flat tags and inside every viewport',()=>{
  for(const profile of profiles)for(const pin of [false,true])for(const counts of distributions){
    const value=scene(profile,pin,counts,'revealed');
    const slots=value.slotCalls[0].slots;
    for(const seat of [0,2]){
      const slot=slots[seat];
      assert.ok(slot,`${profile.id}/${pin}/${seat}: reserve a pocket`);
      assert.ok(slot.top>=0&&slot.bottom<=profile.height&&slot.left>=0&&slot.right<=profile.width,
        `${profile.id}/${pin}/${seat}: reserved twos cannot clip past the viewport`);
      const announcement=value.announcements[seat];
      if(!announcement)continue;
      const actual=announcement.getBoundingClientRect();
      assert.ok(actual.top>=slot.top-epsilon&&actual.bottom<=slot.bottom+epsilon&&
        actual.left>=slot.left-epsilon&&actual.right<=slot.right+epsilon,
        `${profile.id}/${pin}/${seat}: visible announcement uses its reserved pocket`);
      assert.ok(separate(actual,value.boxes[seat],4),`${profile.id}/${pin}/${seat}: cards do not cover their owner name`);
    }
  }
});

test('announcement fitter uses the requested lower rim position when clear and refuses an impossible box',()=>{
  const bounds=rect(0,0,500,300),owner=rect(0,60,68,110),width=43.2*2.1,height=43.2*CARD_ASPECT;
  const result=fitRallyAnnouncement({bounds,obstacles:[owner],center:{x:54,y:owner.bottom+4+height/2},width,height});
  assert.ok(result);
  assert.equal(result.top,owner.bottom+4,'Prefer the lower position, not a position above the tag');
  assert.ok(result.left<54&&result.right>54,'Decorative rim may pass through the announcement');
  assert.equal(fitRallyAnnouncement({bounds:rect(0,0,width-1,height),center:{x:0,y:0},width,height}),null);
  assert.equal(fitRallyAnnouncement({bounds,obstacles:[bounds],center:{x:250,y:150},width,height}),null);
});
