// Run through cua_repl with its existing internal-browser handles. This helper
// only resizes and reads the rendered page; game actions remain explicit UI steps.
import {mkdir, writeFile} from 'node:fs/promises';

export const evidenceVersion = 10;

export async function waitForCoachSettled(tab) {
  const started = Date.now();
  let previous, stable = 0;
  // The Coach entry animation runs for 180ms. Wait for three matching rendered
  // geometry/transform/opacity samples, including after a pinned-to-overlay
  // resize. The read-only browser facade does not expose getAnimations.
  // No page timers, style changes or game actions.
  for (let sample = 1; sample <= 12; sample++) {
    const state = await tab.playwright.evaluate(() => {
      const coach = Array.from(document.querySelectorAll('.rally-coach-window')).find(el => {
        const r = el.getBoundingClientRect(), style = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.visibility !== 'collapse';
      });
      const viewport = {width:innerWidth, height:innerHeight};
      if (!coach) return {viewport, coach:null};
      const r = coach.getBoundingClientRect(), style = getComputedStyle(coach);
      return {
        viewport, coach:{x:r.x, y:r.y, width:r.width, height:r.height},
        pinned:coach.closest('.rally-coach-layer')?.getAttribute('data-pinned'),
        transform:style.transform, opacity:style.opacity,
      };
    });
    const snapshot = JSON.stringify(state);
    stable = snapshot === previous ? stable + 1 : 0;
    if (stable >= 2) return {coachSettled:true, samples:sample, elapsedMs:Date.now() - started};
    previous = snapshot;
    if (sample < 12) await new Promise(resolve => setTimeout(resolve, 60));
  }
  // Do not save a geometry/screenshot pair from an unresolved transition.
  throw new Error('Coach did not settle within 12 read-only samples; no capture was saved. Retry after the layout settles.');
}

export async function cssViewport(viewport, tab, width, height) {
  let requested = {width, height};
  let actual;
  for (let attempt = 0; attempt < 4; attempt++) {
    await viewport.set(requested);
    actual = await tab.playwright.evaluate(() => ({width: innerWidth, height: innerHeight}));
    if (actual.width === width && actual.height === height) break;
    requested = {
      width: Math.max(1, Math.round(requested.width * width / actual.width)),
      height: Math.max(1, Math.round(requested.height * height / actual.height)),
    };
  }
  if (Math.abs(actual.width - width) > 1 || Math.abs(actual.height - height) > 1)
    throw new Error(`Viewport did not settle: requested ${width}x${height}; measured ${actual.width}x${actual.height}`);
  return {requested: {width, height}, actual};
}

export async function captureCase(tab, directory, name, context = {}) {
  const stability = await waitForCoachSettled(tab);
  const dom = await tab.playwright.domSnapshot();
  const measure = await tab.playwright.evaluate(() => {
    const rect = el => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom};
    };
    const visible = el => {
      const r = el.getBoundingClientRect(), style = getComputedStyle(el);
      // A display:none ancestor collapses the descendant rect as well. A
      // visibility:hidden ancestor is inherited, even when it keeps its space.
      return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.visibility !== 'collapse';
    };
    const all = (selector, root = document) => Array.from(root.querySelectorAll(selector)).filter(visible);
    const main = all('.rally-game-shell').at(-1);
    const onTable = selector => main ? all(selector, main) : [];
    const hand = main?.querySelector('.hand-section');
    const coach = all('.rally-coach-window')[0];
    const layer = document.querySelector('.rally-coach-layer');
    const layout = onTable('.trix-layout')[0];
    const announcement = el => ({
      label:el.getAttribute('aria-label'), state:el.getAttribute('data-state'), rect:rect(el),
      seat:el.closest('[data-player-seat]')?.getAttribute('data-player-seat') ?? null,
      // Includes exposed canonical faces and the intentionally face-down twos.
      cards:all('.card-face,.announced-two-back',el).map(rect),
    });
    const horizontalSize = el => ({width:el.scrollWidth,clientWidth:el.clientWidth});
    return {
      viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
      document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},
      phase:main?.getAttribute('data-rally-phase'), game:main?.getAttribute('data-game'),
      theme:document.documentElement.getAttribute('data-theme'),
      replay:!!document.querySelector('.rally-replay-table'),
      main:rect(main), hand:rect(hand), felt:rect(main?.querySelector('.table-felt')),
      players:onTable('.player').map(rect),
      playerDetails:onTable('.player').map(el=>{
        const name=el.querySelector('.player-name'), info=el.querySelector('.player-info');
        const tagStyle=getComputedStyle(el), nameStyle=name ? getComputedStyle(name) : null;
        const infoStyle=info ? getComputedStyle(info) : null;
        return {
          seat:el.getAttribute('data-player-seat'), rect:rect(el),
          name:name?.textContent.trim() ?? null, nameRect:rect(name), infoRect:rect(info),
          // Raw box/typography evidence, not an inferred count of rendered text
          // lines. Child rects show whether name/score/status occupy one row.
          lineEvidence:{
            tagDisplay:tagStyle.display, tagDirection:tagStyle.flexDirection,
            infoDisplay:infoStyle?.display ?? null, infoDirection:infoStyle?.flexDirection ?? null,
            nameLineHeight:nameStyle?.lineHeight ?? null, nameWhiteSpace:nameStyle?.whiteSpace ?? null,
            infoItems:all('.player-info > *',el).map(child=>{
              const style=getComputedStyle(child);
              return {text:child.textContent.trim(), rect:rect(child), lineHeight:style.lineHeight, whiteSpace:style.whiteSpace};
            }),
          },
        };
      }),
      handCards:onTable('.hand-card').map(rect),
      tableCards:onTable('[data-played-card] .card-face').map(rect),
      previewCards:onTable('.last-trick-card').map(rect),
      jacksBoard:rect(layout),
      jacksGeometry:layout ? {
        firstRow:Number(getComputedStyle(layout).getPropertyValue('--layout-first-row')),
        rankSpan:Number(getComputedStyle(layout).getPropertyValue('--layout-rank-span')),
        cardWidth:Number(getComputedStyle(layout).getPropertyValue('--layout-width').replace('px','')),
        step:Number(getComputedStyle(layout).getPropertyValue('--layout-step').replace('px','')),
      } : null,
      jacksRows:layout ? all('.trix-layout-row',layout).map(el=>({label:el.getAttribute('aria-label'),rect:rect(el)})) : [],
      jacksCards:layout ? all('.trix-lane-cards [data-played-card] .card-face',layout).map(rect) : [],
      jacksLanes:layout ? all('.trix-layout-row',layout).map(el=>{
        const label=el.getAttribute('aria-label');
        const cards=all('.trix-lane-cards [data-played-card]',el).map(card=>({
          card:card.getAttribute('data-played-card'), label:card.getAttribute('aria-label'),
          rect:rect(card.querySelector('.card-face')),
        }));
        return {label, suit:cards[0]?.card?.slice(0,1) ?? ({'Clubs lane':'C','Diamonds lane':'D','Hearts lane':'H','Spades lane':'S'}[label] ?? null), rect:rect(el), cards};
      }) : [],
      declaredDoubles:onTable('.announced-cards:not(.trix-two-announcements)').map(announcement),
      twoAnnouncements:onTable('.trix-two-announcements').map(announcement),
      prompt:rect(onTable('.table-prompt,.trix-double-picker,.trix-request-picker')[0]),
      promptControls:onTable('.table-prompt button,.trix-double-picker button,.trix-request-picker button').map(el=>({label:el.textContent.trim(),rect:rect(el)})),
      lastTrick:rect(main?.querySelector('.rally-last:not([hidden])')),
      coach:rect(coach), pinned:layer?.getAttribute('data-pinned') === 'true',
      coachScroll:coach ? {width:coach.scrollWidth,clientWidth:coach.clientWidth} : null,
      images:all('img').map(el=>({src:el.getAttribute('src'),complete:el.complete,width:el.naturalWidth})),
      dialogs:all('[role=dialog],dialog[open]').map(el=>({
        label:el.getAttribute('aria-label'),rect:rect(el),scroll:horizontalSize(el),
        // A nested scroll region can overflow without expanding its dialog.
        scrollAreas:all('*',el).filter(child=>['auto','scroll'].includes(getComputedStyle(child).overflowX))
          .map(child=>({label:child.getAttribute('aria-label'),...horizontalSize(child)})),
      })),
    };
  });
  const v = measure.viewport;
  const overlaps = (a,b) => a.x < b.right-1 && a.right > b.x+1 && a.y < b.bottom-1 && a.bottom > b.y+1;
  const inViewport = r => r.x >= -1 && r.y >= -1 && r.right <= v.width + 1 && r.bottom <= v.height + 1;
  const announcementsFit = items => items.length ? items.every(item=>inViewport(item.rect) && item.cards.every(inViewport)) : null;
  // The visible felt is the target, not its enclosing table zone. Store signed
  // deviations so captures show both the amount and direction of misalignment.
  measure.jacksFeltCenter=measure.jacksBoard && measure.felt ? {
    board:{x:measure.jacksBoard.x+measure.jacksBoard.width/2, y:measure.jacksBoard.y+measure.jacksBoard.height/2},
    felt:{x:measure.felt.x+measure.felt.width/2, y:measure.felt.y+measure.felt.height/2},
    dx:(measure.jacksBoard.x+measure.jacksBoard.width/2)-(measure.felt.x+measure.felt.width/2),
    dy:(measure.jacksBoard.y+measure.jacksBoard.height/2)-(measure.felt.y+measure.felt.height/2),
  } : null;
  for (const lane of measure.jacksLanes) {
    const xs=lane.cards.filter(card=>card.rect).map(card=>card.rect.x);
    lane.xSpread=xs.length ? Math.max(...xs)-Math.min(...xs) : null;
    lane.sameX=xs.length > 1 ? lane.xSpread < 1 : null;
    lane.jackY=lane.cards.find(card=>card.card?.slice(1)==='J')?.rect?.y ?? null;
  }
  const comparableLanes=measure.jacksLanes.filter(lane=>lane.sameX !== null);
  const jackYs=measure.jacksLanes.map(lane=>lane.jackY).filter(y=>y !== null);
  const playerInfo=measure.playerDetails.flatMap(player=>[player.nameRect,player.infoRect]).filter(Boolean);
  // Announcements may straddle the felt. Protect the visible player details
  // and hand, including card faces extending outside an announcement wrapper.
  const twoRects=measure.twoAnnouncements.flatMap(item=>[item.rect,...item.cards]);
  const checks = {
    pageFits:measure.document.width <= v.width + 1 && measure.document.height <= v.height + 1,
    visibleImagesLoaded:measure.images.every(image => image.complete && image.width > 0),
    handCardsInViewport:measure.handCards.length ? measure.handCards.every(r=>r.x>=-1 && r.y>=-1 && r.right<=v.width+1 && r.bottom<=v.height+1) : null,
    playersInViewport:measure.players.length ? measure.players.every(r=>r.x>=-1 && r.y>=-1 && r.right<=v.width+1 && r.bottom<=v.height+1) : null,
    promptClearPlayers:measure.prompt && measure.players.length ? measure.players.every(r=>!overlaps(measure.prompt,r)) : null,
    promptControlsContained:measure.prompt && measure.promptControls.length ? measure.promptControls.every(({rect:r})=>r.x>=measure.prompt.x-1 && r.right<=measure.prompt.right+1) : null,
    tableCardsInViewport:measure.tableCards.length ? measure.tableCards.every(r=>r.x>=-1 && r.y>=-1 && r.right<=v.width+1 && r.bottom<=v.height+1) : null,
    tableCardsClearPlayers:measure.tableCards.length ? measure.tableCards.every(r=>measure.players.every(p=>!overlaps(r,p))) : null,
    previewCardsInViewport:measure.previewCards.length ? measure.previewCards.every(r=>r.x>=-1 && r.y>=-1 && r.right<=v.width+1 && r.bottom<=v.height+1) : null,
    // Lane/card overlap is intentional. Only outer bounds are checked here.
    jacksBoardInViewport:measure.jacksBoard ? inViewport(measure.jacksBoard) : null,
    jacksRowsInViewport:measure.jacksRows.length ? measure.jacksRows.every(row=>inViewport(row.rect)) : null,
    jacksCardsInViewport:measure.jacksCards.length ? measure.jacksCards.every(inViewport) : null,
    jacksCenteredOnFeltX:measure.jacksFeltCenter ? Math.abs(measure.jacksFeltCenter.dx) <= 1 : null,
    jacksCenteredOnFeltY:measure.jacksFeltCenter ? Math.abs(measure.jacksFeltCenter.dy) <= 1 : null,
    jacksReservesAceThroughTwo:measure.jacksGeometry ? measure.jacksGeometry.firstRow===0 && measure.jacksGeometry.rankSpan===12 : null,
    jacksLanesSameX:comparableLanes.length ? comparableLanes.every(lane=>lane.sameX) : null,
    jacksJackYAligned:jackYs.length > 1 ? Math.max(...jackYs)-Math.min(...jackYs) < 1 : null,
    declaredDoublesInViewport:announcementsFit(measure.declaredDoubles),
    twoAnnouncementsInViewport:announcementsFit(measure.twoAnnouncements),
    twoAnnouncementsClearPlayerInfo:twoRects.length && playerInfo.length ? twoRects.every(r=>playerInfo.every(info=>!overlaps(r,info))) : null,
    twoAnnouncementsClearHand:twoRects.length && measure.hand ? twoRects.every(r=>!overlaps(r,measure.hand)) : null,
    dialogsInViewport:measure.dialogs.length ? measure.dialogs.every(dialog=>inViewport(dialog.rect)) : null,
    dialogsNoHorizontalScroll:measure.dialogs.length ? measure.dialogs.every(dialog=>
      [dialog.scroll,...dialog.scrollAreas].every(scroll=>scroll.width <= scroll.clientWidth + 1)) : null,
    coachInViewport:!measure.coach || (measure.coach.x>=-1 && measure.coach.y>=-1 && measure.coach.right<=v.width+1 && measure.coach.bottom<=v.height+1),
    overlayClearsHand:!measure.coach || !measure.hand || measure.pinned || measure.coach.bottom <= measure.hand.y + 1,
    coachNoHorizontalScroll:!measure.coachScroll || measure.coachScroll.width <= measure.coachScroll.clientWidth + 1,
  };
  // Capture the actual viewport without a clip. Beyond-viewport clipping can
  // temporarily resize the page and cancel a held card through its resize guard.
  // Native raster dimensions may differ from the measured CSS viewport at zoom.
  const cdp = await tab.capabilities.get('cdp');
  const screenshot = await cdp.send('Page.captureScreenshot', {
    format:'jpeg', fromSurface:true, captureBeyondViewport:false,
  });
  await mkdir(directory,{recursive:true});
  await writeFile(`${directory}/${name}.jpg`,Buffer.from(screenshot.data,'base64'));
  await writeFile(`${directory}/${name}.json`,JSON.stringify({evidenceVersion,context,stability,measure,checks},null,2)+'\n');
  await writeFile(`${directory}/${name}.txt`,dom+'\n');
  return {evidenceVersion,name,stability,viewport:v,phase:measure.phase,checks};
}
