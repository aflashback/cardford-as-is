import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as geometry from '../src/table/responsiveGeometry.ts';
import {coachDimensions, coachDisplay, initialCoachUI} from '../src/rally/coachPresentation.ts';

test('thirteen held cards fit the SE content width with room for their selected lift', () => {
  const fit = geometry.rallyFrameMetrics({ width: 516, height: 320 });
  assert.ok(fit.handWidth * 5.56 + 14 <= fit.handAvailable);
  // Independent projection of the unchanged selected face: -15% lift, -12deg,
  // transform-origin 50% 85%. Check all four corners, not the fitter's factor.
  const width=fit.handWidth, height=width*geometry.CARD_ASPECT, angle=-12*Math.PI/180;
  const selectedTop=Math.min(...[[0,0],[width,0],[0,height],[width,height]].map(([x,y])=>
    height*.85+(x-width*.5)*Math.sin(angle)+(y-height*.85)*Math.cos(angle)-height*.15));
  assert.ok(fit.handLift >= -selectedTop);
  assert.ok(fit.tableHeight > 200);
  const wide = geometry.rallyFrameMetrics({ width: 1920, height: 1024 });
  const ultra = geometry.rallyFrameMetrics({ width: 2560, height: 1024 });
  assert.equal(wide.handWidth, ultra.handWidth);
  assert.equal(wide.maxTableCard, ultra.maxTableCard);
});

test('preview clearance moves the East badge only as far as the available lower boundary', () => {
  const card={left:90,right:120,top:0,bottom:45};
  const badge={left:100,right:140,top:30,bottom:70};
  assert.deepEqual(geometry.clearPreviewCards([card],[badge],30,4),{shift:19,fits:true});
  assert.deepEqual(geometry.clearPreviewCards([card],[badge],10,4),{shift:10,fits:false});
  assert.deepEqual(geometry.clearPreviewCards([card],[{...badge,left:130}],30,4),{shift:0,fits:true});
});

test('Jacks keeps one overlapping column per suit for asymmetric and full boards', () => {
  for (const height of [180, 290, 600]) for (const rows of [
    [{low:5,high:12},{low:10,high:13},{low:6,high:12},{low:10,high:13}],
    Array.from({length:4},()=>({low:2,high:14})),
  ]) {
    const fit=geometry.fitRallyJacks({bounds:{left:0,right:700,top:0,bottom:height},center:{x:350,y:height/2},maxCardWidth:80,rows});
    assert.ok(fit);
    assert.equal(fit.spread,0,'A shorter viewport must not fan ranks across three columns');
    assert.equal(fit.widthUnits,5.2,'The fitter budgets four single-card suit lanes and three gaps');
    const jackYs:number[]=[];
    rows.forEach((row,suit)=>{
      const laneX=fit.left+suit*fit.cardWidth*(1+fit.gap);
      let lastY=-Infinity;
      for(let rank=row.high;rank>=row.low;rank--){
        const rankRow=14-rank;
        const x=laneX+(rankRow%3)*fit.cardWidth*fit.spread;
        const y=fit.top+(rankRow-fit.firstRow)*fit.cardWidth*fit.step;
        assert.equal(x,laneX);
        if(Number.isFinite(lastY)) assert.ok(y>lastY&&y<lastY+fit.cardWidth*geometry.CARD_ASPECT);
        if(rank===11) jackYs.push(y);
        lastY=y;
      }
    });
    assert.equal(new Set(jackYs).size,1,'All Jacks align');
  }
});

test('Jacks shrinks symmetrically at the requested felt center instead of using larger off-center space', () => {
  const bounds={left:0,right:700,top:0,bottom:320},center={x:350,y:160};
  for(const rows of [[{low:9,high:12},{low:11,high:11},{low:10,high:11},{low:0,high:0}],
    Array.from({length:4},()=>({low:2,high:14}))]) {
    const clear=geometry.fitRallyJacks({bounds,center,maxCardWidth:80,rows});
    assert.ok(clear);
    for(const obstacle of [
      {left:230,right:300,top:80,bottom:200},
      {left:400,right:470,top:80,bottom:200},
      {left:200,right:500,top:0,bottom:100},
      {left:200,right:500,top:220,bottom:320},
    ]) {
      const fit=geometry.fitRallyJacks({bounds,center,maxCardWidth:80,rows,obstacles:[obstacle]});
      assert.ok(fit,'A smaller centered fit is available');
      assert.equal(fit.x,center.x,'Side announcements must not move the suit lanes sideways');
      assert.equal(fit.y,center.y,'North/South tags must not move the suit lanes vertically');
      assert.ok(fit.cardWidth<clear.cardWidth,'Use smaller cards before moving away from the felt center');
      validatePlacement(fit,bounds,[obstacle],'centered asymmetric obstacle');
    }
  }
  assert.equal(geometry.fitRallyJacks({bounds,center,maxCardWidth:80,rows:[{low:2,high:14}],
    obstacles:[{left:345,right:355,top:155,bottom:165}]}),null,'A blocked center cannot be bypassed with an off-center fit');
});

test('Jacks reclaims only the reserved hand lift while keeping canonical selection clearance unchanged', () => {
  for(const [width,height] of [[516,320],[792,390],[686,523],[1024,712],[1440,844],[2560,1024]]) {
    const ordinary=geometry.rallyFrameMetrics({width,height});
    const jacks=geometry.rallyFrameMetrics({width,height,overlapHandLift:true});
    assert.equal(jacks.handWidth,ordinary.handWidth,'Do not shrink the held faces to grow the table');
    assert.equal(jacks.handLift,ordinary.handLift,'Canonical selection/gesture clearance is still calculated');
    assert.equal(jacks.handHeight,jacks.handWidth*geometry.CARD_ASPECT,'Only the face height reserves a row in Jacks');
    assert.ok(Math.abs(jacks.tableHeight-ordinary.tableHeight-ordinary.handLift)<1e-8,'All reclaimed lift goes to table height');
    assert.equal(jacks.handInsetLeft,ordinary.handInsetLeft);
    assert.equal(jacks.handInsetRight,ordinary.handInsetRight);
  }
});

test('side twos prefer the lower felt rim and stay clear of names, South and the hand', () => {
  const bounds={left:0,right:500,top:0,bottom:300};
  const west={left:0,right:68,top:90,bottom:190};
  const south={left:365,right:475,top:240,bottom:300};
  const east={left:432,right:500,top:90,bottom:190};
  const westFit=geometry.fitRallyAnnouncement({bounds:{...bounds,right:166},obstacles:[west,south,east],
    center:{x:54,y:225},width:90,height:62});
  assert.ok(westFit);
  assert.equal(westFit.x,54);
  assert.equal(westFit.top,194,'Four-pixel gap below the badge');
  assert.ok(westFit.left<54&&westFit.right>54,'The decorative felt rim may cross the twos');
  const eastFit=geometry.fitRallyAnnouncement({bounds:{...bounds,left:334},obstacles:[west,south,east],
    center:{x:446,y:225},width:90,height:62});
  assert.ok(eastFit);
  assert.ok(eastFit.right<=east.left-4||eastFit.top>=east.bottom+4||eastFit.bottom<=east.top-4);
  assert.ok(eastFit.right<=south.left-4||eastFit.bottom<=south.top-4);
  assert.ok(eastFit.bottom<=bounds.bottom,'No encroachment on the hand below the table');
});

test('visible public Jacks ranks retain their full-board positions and avoid an announcement', () => {
  const rows = [{low:9,high:12},{low:11,high:11},{low:10,high:11},{low:0,high:0}];
  const obstacle = {left:10,right:100,top:10,bottom:95};
  const fit = geometry.fitRallyJacks({bounds:{left:0,right:470,top:0,bottom:205},obstacles:[obstacle],
    center:{x:235,y:102.5},maxCardWidth:38.4,rows});
  assert.ok(fit);
  assert.equal(fit.firstRow,0);
  assert.equal(fit.high-fit.low,12);
  assert.ok(fit.left >= obstacle.right+6 || fit.top >= obstacle.bottom+6);
  const full=geometry.fitRallyJacks({bounds:{left:0,right:470,top:0,bottom:205},obstacles:[obstacle],
    center:{x:235,y:102.5},maxCardWidth:38.4,rows:Array.from({length:4},()=>({low:2,high:14}))});
  assert.ok(full);
  assert.equal(fit.cardWidth,full.cardWidth,'A partial board does not enlarge its cards');
  assert.equal((3-fit.firstRow)*fit.cardWidth*fit.step,3*full.cardWidth*full.step,'Jack stays three rank steps below Ace');
});

test('impossible fit returns null so a resize cannot retain stale card geometry', () => {
  const options={bounds:{left:0,right:100,top:0,bottom:100},obstacles:[{left:-1,right:101,top:-1,bottom:101}],center:{x:50,y:50},maxCardWidth:56};
  assert.equal(geometry.fitRallyTrick(options),null);
  assert.equal(geometry.fitRallyJacks({...options,rows:[{low:2,high:14}]}),null);
});

test('live last-trick pocket keeps its 30–100px felt gap without changing hand width', () => {
  for(const width of [492,591,768,972,1392,2508]) {
    const fit=geometry.lastTrickPocket({contentWidth:width,preferredWidth:width*.9,feltRightInset:30,previewWidth:83});
    assert.ok(fit.gap>=30-1e-9 && fit.gap<=100+1e-9);
    assert.ok(fit.tableLeft>=0 && fit.tableLeft+fit.tableWidth<=width+1e-9);
    assert.ok(fit.previewLeft+83<=width+1e-9);
  }
});

test('phone through ultrawide allocations retain card proportions and all thirteen ranks', () => {
  const sizes = [[516,320],[615,375],[792,390],[572,390],[948,420],[1024,712],[1180,764],[1366,968],[1440,844],[1920,1024],[2560,1024]];
  for (const [width,height] of sizes) {
    const metrics = geometry.rallyFrameMetrics({width,height});
    const bounds = {left:0,right:metrics.contentWidth,top:0,bottom:metrics.tableHeight};
    const options = {bounds,center:{x:metrics.contentWidth/2,y:metrics.tableHeight/2},maxCardWidth:metrics.maxJacksCard};
    const fit = geometry.fitRallyJacks({...options,rows:Array.from({length:4},()=>({low:2,high:14}))});
    assert.ok(fit,`${width}x${height} has a positive full-rank fit`);
    assert.equal(fit.firstRow,0);
    assert.ok(fit.left>=0 && fit.top>=0 && fit.right<=bounds.right+1e-9 && fit.bottom<=bounds.bottom+1e-9);
    assert.ok(12*fit.cardWidth*fit.step+fit.cardWidth*geometry.CARD_ASPECT<=metrics.tableHeight+1e-9);
    assert.ok(metrics.handAvailable>=metrics.handWidth*5.56+14);
  }
});

type Profile = {id: string; width: number; height: number};
const registry = {module: {exports: {} as {profiles: Profile[]}}};
runInNewContext(readFileSync(new URL('../../design/rally/device-profiles.js', import.meta.url), 'utf8'), registry);
const profiles = registry.module.exports.profiles;
const phases = ['play', 'jacks', 'bid', 'pass', 'double', 'request', 'results'] as const;
const games = ['spades', 'hearts', 'trix'] as const;
const coachStates = ['closed', 'overlay', 'pin'] as const;
const epsilon = 1e-8;
const rect = (left: number, top: number, width: number, height: number): geometry.Rect =>
  ({left, right: left + width, top, bottom: top + height});

test('Jacks reserves the identical Ace-to-two footprint from empty to full across all 18 profiles',async t=>{
  const states=[
    {name:'empty',rows:Array.from({length:4},()=>({low:0,high:0}))},
    {name:'single Jack',rows:[{low:0,high:0},{low:11,high:11},{low:0,high:0},{low:0,high:0}]},
    {name:'asymmetric partial',rows:[{low:2,high:12},{low:10,high:14},{low:8,high:11},{low:0,high:0}]},
    {name:'full',rows:Array.from({length:4},()=>({low:2,high:14}))},
  ];
  const snapshot=(fit:NonNullable<ReturnType<typeof geometry.fitRallyJacks>>)=>({
    cardWidth:fit.cardWidth,width:fit.width,height:fit.height,firstRow:fit.firstRow,low:fit.low,high:fit.high,
    ranks:Array.from({length:4},(_,suit)=>Array.from({length:13},(_,index)=>({
      rank:14-index,x:fit.left+suit*fit.cardWidth*(1+fit.gap),
      y:fit.top+(index-fit.firstRow)*fit.cardWidth*fit.step,
    }))),
  });
  for(const profile of profiles)await t.test(profile.id,()=>{
    const rail=profile.width<=1000&&profile.height<=430?52:0;
    const header=rail?0:profile.height<=480?48:56;
    const screenWidth=profile.width-rail,screenHeight=profile.height-header;
    for(const coach of coachStates){
      const display=coachDisplay(initialCoachUI({open:coach!=='closed',pinPreferred:coach==='pin'}),false,screenWidth);
      const dimensions=coachDimensions(profile.width,profile.height,screenHeight,0);
      const compact=screenHeight<=520;
      const padding=compact?{left:12,right:12,top:4,bottom:4}:{left:24,right:24,top:12,bottom:10};
      const metrics=geometry.rallyFrameMetrics({width:screenWidth-(display.pinned?dimensions.laneWidth:0),height:screenHeight,padding,overlapHandLift:true});
      const side=compact?35:54,vertical=compact?18:26;
      const options={bounds:{left:side+8,right:metrics.preferredWidth-side-8,top:vertical+6,bottom:metrics.tableHeight-vertical-6},
        center:{x:metrics.preferredWidth/2,y:metrics.tableHeight/2},maxCardWidth:metrics.maxJacksCard};
      const full=geometry.fitRallyJacks({...options,rows:states[3].rows});
      assert.ok(full);
      const expected=snapshot(full);
      for(const state of states){
        const label=`${profile.id}/${coach}/${state.name}`;
        const fit=geometry.fitRallyJacks({...options,rows:state.rows});
        assert.ok(fit,`${label}: reserve a full-rank fit even before any Jack is played`);
        assert.equal(fit.firstRow,0,`${label}: Ace remains row zero`);
        assert.equal(fit.low,2,`${label}: reserve the two endpoint`);
        assert.equal(fit.high,14,`${label}: reserve the Ace endpoint`);
        assert.deepEqual(snapshot(fit),expected,`${label}: adding cards cannot resize the board or move any rank position`);
      }
    }
  });
});

function validatePlacement(value: ReturnType<typeof geometry.fitRallyTrick>, bounds: geometry.Rect, obstacles: geometry.Rect[], label: string) {
  assert.ok(value, `${label}: positive placement`);
  for (const [key, number] of Object.entries(value)) assert.ok(Number.isFinite(number), `${label}: finite ${key}`);
  assert.ok(value.left >= bounds.left-epsilon && value.right <= bounds.right+epsilon &&
    value.top >= bounds.top-epsilon && value.bottom <= bounds.bottom+epsilon, `${label}: contained in felt`);
  for (const item of obstacles) assert.ok(value.right <= item.left-6+epsilon || value.left >= item.right+6-epsilon ||
    value.bottom <= item.top-6+epsilon || value.top >= item.bottom+6-epsilon, `${label}: seat/announcement clearance`);
}

test('all 18 approved landscape presets × seven phases × three Coach states retain finite, contained allocations', async t => {
  assert.equal(profiles.length, 18);
  let allocations = 0, trickFits = 0, jackFits = 0, minFullJacks = Infinity;
  for (const profile of profiles) await t.test(`${profile.id} ${profile.width}×${profile.height}`, () => {
    // Shell budgets are fixtures from rally-shell.css; sizing/placement below
    // executes production helpers. Seat rectangles are conservative source
    // estimates, not browser measurements or a text/glyph readability claim.
    const {width, height} = profile;
    const sideRail = width <= 1000 && height <= 430 ? 52 : 0;
    const header = sideRail ? 0 : height <= 480 ? 48 : 56;
    const screenWidth = width-sideRail, screenHeight = height-header;
    for (const coach of coachStates) {
      const state = initialCoachUI({open: coach !== 'closed', pinPreferred: coach === 'pin'});
      const display = coachDisplay(state, false, screenWidth);
      const initialDimensions = coachDimensions(width, height, screenHeight, 0);
      const boardWidth = screenWidth-(display.pinned ? initialDimensions.laneWidth : 0);
      const compact = screenHeight <= 520;
      const padding = compact ? {left:12,right:12,top:4,bottom:4} : {left:24,right:24,top:12,bottom:10};
      for (const game of games) for (const phase of phases) {
        const metrics = geometry.rallyFrameMetrics({width:boardWidth,height:screenHeight,padding,overlapHandLift:phase==='jacks'});
        const label = `${profile.id}/${coach}/${game}/${phase}`; allocations++;
        for (const [key, value] of Object.entries(metrics)) if (typeof value === 'number')
          assert.ok(Number.isFinite(value) && value >= 0, `${label}: nonnegative ${key}`);
        assert.ok(boardWidth > 0 && metrics.tableHeight > 100, `${label}: useful table allocation`);
        assert.ok(metrics.handWidth*5.56+14 <= metrics.handAvailable+epsilon, `${label}: thirteen rank lanes fit`);
        const cardHeight = metrics.handWidth*geometry.CARD_ASPECT, angle = -12*Math.PI/180;
        const projected = [0,metrics.handWidth].flatMap(x => [0,cardHeight].map(y => ({
          x:metrics.handWidth/2+(x-metrics.handWidth/2)*Math.cos(angle)-(y-cardHeight*.85)*Math.sin(angle),
          y:cardHeight*.85+(x-metrics.handWidth/2)*Math.sin(angle)+(y-cardHeight*.85)*Math.cos(angle)-cardHeight*.15,
        })));
        assert.ok(Math.min(...projected.map(point => point.y))+metrics.handLift >= 0, `${label}: selected top fits hand row`);
        assert.ok(-Math.min(...projected.map(point => point.x)) <= metrics.handInsetLeft, `${label}: first card clears control lane`);
        assert.ok(Math.max(...projected.map(point => point.x))-metrics.handWidth <= metrics.handInsetRight, `${label}: last card clears edge`);
        const clearance = padding.bottom+metrics.handHeight+(phase==='jacks'?metrics.handLift:0)+4;
        const dimensions = coachDimensions(width,height,screenHeight,clearance);
        assert.ok(dimensions.bottom >= clearance, `${label}: overlay ends above hand`);
        assert.ok(dimensions.overlayHeight+dimensions.bottom+dimensions.edge <= screenHeight+epsilon, `${label}: overlay stays below header`);
        assert.ok(dimensions.pinnedHeight+dimensions.pinnedBottom+dimensions.edge <= screenHeight+epsilon, `${label}: pinned window stays inside stage`);
        const feltInset = game === 'trix' ? compact ? 35 : 54 : compact ? 30 : 42;
        const pocket = phase === 'play' ? geometry.lastTrickPocket({contentWidth:metrics.contentWidth,
          preferredWidth:metrics.preferredWidth,feltRightInset:feltInset,previewWidth:metrics.previewWidth}) : null;
        if (pocket) {
          assert.ok(pocket.gap >= 30-epsilon && pocket.gap <= 100+epsilon, `${label}: last trick felt gap`);
          assert.ok(pocket.tableLeft >= 0 && pocket.tableLeft+pocket.tableWidth <= metrics.contentWidth+epsilon, `${label}: table pocket containment`);
          assert.ok(pocket.previewLeft+metrics.previewWidth <= metrics.contentWidth+epsilon, `${label}: last trick containment`);
        }
        if (phase !== 'play' && phase !== 'jacks') continue;
        const tableWidth = pocket?.tableWidth ?? metrics.preferredWidth, tableHeight = metrics.tableHeight;
        const jacks=phase==='jacks';
        const badgeWidth = jacks ? compact?160:208 : compact?108:138;
        const badgeHeight = jacks ? compact?44:56 : compact?54:76;
        const sideWidth = jacks ? badgeWidth : compact?60:68;
        const sideHeight = jacks ? badgeHeight : metrics.avatar+(compact?3:6)+metrics.nameSize*1.2+metrics.detailSize*1.1+3+(compact?24:38);
        const northFraction = compact&&!jacks ? .2 : .5;
        const southFraction = compact&&!jacks ? .8 : .5;
        const sideTop = tableHeight*(jacks?.5:compact?.49:.43)-sideHeight/2;
        const seats = jacks ? geometry.rallyJacksPlayerSlots({zone:rect(0,0,tableWidth,tableHeight),compact,avatarSize:metrics.avatar}) : [rect(tableWidth*northFraction-badgeWidth/2,0,badgeWidth,badgeHeight),
          rect(tableWidth*southFraction-badgeWidth/2,tableHeight-badgeHeight,badgeWidth,badgeHeight),
          rect(0,sideTop,sideWidth,sideHeight),rect(tableWidth-sideWidth,sideTop,sideWidth,sideHeight)];
        const feltTop = jacks ? compact?18:26 : compact?16:game==='trix'?28:32;
        const feltBottom = jacks ? compact?18:26 : compact?10:game==='trix'?18:22;
        const bounds = {left:feltInset+8,right:tableWidth-(pocket?.feltRightInset ?? feltInset)-8,
          top:feltTop+6,bottom:tableHeight-feltBottom-6};
        const center = {x:tableWidth/2,y:tableHeight/2};
        if (phase === 'play') {
          const fit = geometry.fitRallyTrick({bounds,obstacles:seats,center,maxCardWidth:metrics.maxTableCard});
          validatePlacement(fit,bounds,seats,label); trickFits++;
        } else {
          const announcementCard = height<=520 ? 31.68 : 43.2;
          const slots=geometry.rallyJacksAnnouncementSlots({zone:rect(0,0,tableWidth,tableHeight),
            felt:{left:feltInset,right:tableWidth-feltInset,top:feltTop,bottom:tableHeight-feltBottom},
            players:seats,cardWidth:announcementCard,compact});
          assert.ok(slots.every(Boolean),`${label}: all permanent two pockets fit`);
          const announcements = slots.filter((slot):slot is geometry.Rect=>slot!==null);
          const obstacles = [...seats,...announcements];
          for (const rows of [[{low:9,high:11},{low:8,high:12},{low:9,high:11},{low:10,high:12}],
            Array.from({length:4},()=>({low:2,high:14}))]) {
            const fit = geometry.fitRallyJacks({bounds,obstacles,center,maxCardWidth:metrics.maxJacksCard,rows});
            validatePlacement(fit,bounds,obstacles,label); assert.ok(fit); jackFits++;
            assert.equal(fit.x,center.x,`${label}: exact horizontal felt center`);
            assert.equal(fit.y,center.y,`${label}: exact vertical felt center`);
            // Independently bound a centered rectangle against each obstacle:
            // either horizontal OR vertical separation is enough to avoid it.
            const constraints=[metrics.maxJacksCard,
              2*Math.min(center.x-bounds.left,bounds.right-center.x)/fit.widthUnits,
              2*Math.min(center.y-bounds.top,bounds.bottom-center.y)/fit.heightUnits,
              ...obstacles.map(item=>Math.max(
                2*Math.max(center.x-item.right-6,item.left-center.x-6)/fit.widthUnits,
                2*Math.max(center.y-item.bottom-6,item.top-center.y-6)/fit.heightUnits))];
            assert.ok(Math.min(...constraints)-fit.cardWidth<.1000001,
              `${label}: no needless face shrink beyond the largest collision-free centered fit`);
            if (fit.low === 2) minFullJacks = Math.min(minFullJacks,fit.cardWidth);
            for (const row of rows) for (const rank of [row.low,row.high]) {
              const top = fit.top+(14-rank-fit.firstRow)*fit.cardWidth*fit.step;
              assert.ok(top >= fit.top-epsilon && top+fit.cardWidth*geometry.CARD_ASPECT <= fit.bottom+epsilon, `${label}: public endpoint rank fits`);
            }
          }
        }
      }
    }
  });
  assert.equal(allocations, 18*7*3*3);
  t.diagnostic(`${allocations} source allocations; ${trickFits} trick fits; ${jackFits} opening/full Jacks fits; smallest full-Jacks face ${minFullJacks}px. All-game phase inputs stress the helper, including phases not reachable in every game. Prompt text and actual glyph legibility require browser QA.`);
});

test('actual responsive hook fits only playing piles and removes stale pile positioning for every other phase', () => {
  const source = ts.createSourceFile('useResponsiveTableFit.ts',readFileSync(new URL('../src/table/useResponsiveTableFit.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
  let callback: ts.ArrowFunction | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source)==='fit' && node.initializer && ts.isCallExpression(node.initializer)) {
      const candidate = node.initializer.arguments[0]; if (candidate && ts.isArrowFunction(candidate)) callback = candidate;
    }
    ts.forEachChild(node,visit);
  };
  visit(source); assert.ok(callback);
  class Style {
    values = new Map<string,string>();
    getPropertyValue(name:string) { return this.values.get(name) ?? ''; }
    setProperty(name:string,value:string) { this.values.set(name,value); }
    removeProperty(name:string) { this.values.delete(name); }
  }
  const trick = {style:new Style()};
  let obstacles: {getBoundingClientRect(): geometry.Rect}[] = [];
  const table = {style:new Style(),classList:{toggle(){}},getBoundingClientRect:()=>({left:0,top:0,width:600,height:400,bottom:400}),
    querySelector:(selector:string)=>selector==='.table-felt'?{getBoundingClientRect:()=>rect(40,30,520,340)}:selector==='.trick-area'?trick:null,
    querySelectorAll:()=>obstacles};
  const main = {style:new Style(),dataset:{} as Record<string,string>,clientWidth:800,clientHeight:600,
    querySelector:(selector:string)=>selector==='.table-zone'?table:selector==='.hand-section'?{getBoundingClientRect:()=>({top:480})}:null,
    getBoundingClientRect:()=>({bottom:600}),dispatchEvent(){}};
  let calls=0;
  const metricCalls:Parameters<typeof geometry.rallyFrameMetrics>[0][]=[],reported:number[]=[];
  const context = {...geometry,root:{current:main},clearance:{current:-1},report:{current:(value:number)=>reported.push(value)},
    game:'spades',phase:'play',lastTrickVisible:false,Event,
    rallyFrameMetrics:(options:Parameters<typeof geometry.rallyFrameMetrics>[0])=>{
      metricCalls.push(options);return geometry.rallyFrameMetrics(options);
    },
    fitRallyTrick:(...args:Parameters<typeof geometry.fitRallyTrick>)=>{calls++;return geometry.fitRallyTrick(...args);},
    getComputedStyle:()=>({paddingLeft:'24px',paddingRight:'24px',paddingTop:'12px',paddingBottom:'10px'}),exports:{fit:undefined as (()=>void)|undefined}};
  runInNewContext(ts.transpileModule(`exports.fit=${callback.getText(source)};`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,context);
  for (const game of games) for (const phase of phases) {
    context.game=game;context.phase=phase;calls=0;metricCalls.length=0;reported.length=0;context.clearance.current=-1;
    for (const property of ['left','top','visibility']) trick.style.setProperty(property,'stale');
    context.exports.fit!();
    assert.equal(calls,phase==='play'?1:0,`${game}/${phase}: prompts never use pile fitter`);
    for (const property of ['left','top','visibility']) assert.equal(trick.style.getPropertyValue(property)==='',phase!=='play',`${game}/${phase}: ${property}`);
    assert.equal(main.dataset.rallyPhase,phase);
    assert.equal(metricCalls.length,1);
    assert.equal(metricCalls[0].overlapHandLift,phase==='jacks',`${game}/${phase}: only Jacks borrows the hand lift`);
    const metrics=geometry.rallyFrameMetrics(metricCalls[0]);
    assert.equal(reported[0],Math.ceil(120+4+(phase==='jacks'?metrics.handLift:0)),
      `${game}/${phase}: Coach clears the entire canonical selected-hand envelope`);
  }
  context.phase='play'; obstacles=[{getBoundingClientRect:()=>rect(0,0,600,400)}];
  context.exports.fit!();
  assert.equal(trick.style.getPropertyValue('visibility'),'hidden');
  for (const property of ['left','top']) assert.equal(trick.style.getPropertyValue(property),'');
  assert.equal(table.style.getPropertyValue('--table-card-width'),'');
  obstacles=[];context.exports.fit!();
  assert.equal(trick.style.getPropertyValue('visibility'),'visible','A later viable frame restores the playing pile');
  assert.notEqual(table.style.getPropertyValue('--table-card-width'),'');
});
