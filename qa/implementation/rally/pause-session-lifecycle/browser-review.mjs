// Helpers used only through the visible cua_repl built-in browser.
// No hidden browser, application-state mutation, credentials or private hands.
import {mkdir, writeFile} from 'node:fs/promises';
export {cssViewport} from '../browser-2026-10-14/browser-review.mjs';

export async function capture(tab, directory, name, context = {}) {
  await mkdir(directory, {recursive:true});
  const dom = await tab.playwright.domSnapshot();
  const geometry = await tab.playwright.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; };
    const visible = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(visible).map(el => ({
      name:el.getAttribute('aria-label'),...rect(el),scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,
      controls:[...el.querySelectorAll('button,a[href],select,input')].filter(visible).map(control => ({
        label:control.getAttribute('aria-label') || control.textContent?.trim(),...rect(control),disabled:control.disabled === true,
      })),
    }));
    return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
      scrollHeight:document.documentElement.scrollHeight,dialogs,
      brokenImages:[...document.images].filter(el => visible(el) && el.complete && el.naturalWidth === 0).map(el => el.getAttribute('src')),
      coachOpen:[...document.querySelectorAll('#rally-live-coach')].some(el => !el.hidden && visible(el)),
    };
  });
  const record = {name,at:new Date().toISOString(),...context,geometry,
    checks:{noHorizontalPageOverflow:geometry.scrollWidth<=geometry.width+1,
      dialogsInside:geometry.dialogs.every(d=>d.x>=-1&&d.y>=-1&&d.right<=geometry.width+1&&d.bottom<=geometry.height+1),
      noBrokenImages:geometry.brokenImages.length===0,
      controlsInside:geometry.dialogs.every(d=>d.controls.every(c=>c.x>=-1&&c.y>=-1&&c.right<=geometry.width+1&&c.bottom<=geometry.height+1))}};
  await writeFile(`${directory}/${name}.json`,JSON.stringify(record,null,2)+'\n');
  await writeFile(`${directory}/${name}.txt`,dom+'\n');
  await writeFile(`${directory}/${name}.jpg`,await tab.getScreenshot({emit:false}));
  return record;
}

const methods=['Network.requestWillBeSent','Network.responseReceived','Network.loadingFinished','Network.loadingFailed','Network.webSocketCreated','Network.webSocketClosed','Network.webSocketFrameReceived'];
const pickPlayback = p => p ? Object.fromEntries(['running','generation','phase','pauseReason','serverNow','foregroundLeaseUntil','pausedAt','expiresAt','policyVersion','retentionSeconds'].filter(k=>k in p).map(k=>[k,p[k]])) : null;
export async function recorder(cdp, directory) {
  await mkdir(directory,{recursive:true});
  await cdp.send('Network.enable');
  let cursor=(await cdp.readEvents({methods,limit:1000})).cursor;
  const events=[], requests=new Map();
  return {
    async collect(label) {
      let batch;
      do {
        batch=await cdp.readEvents({afterSequence:cursor,methods,limit:1000});
        cursor=batch.cursor;
        for(const e of batch.events) {
          const p=e.params??{};
          if(e.method==='Network.requestWillBeSent') {
            const path=new URL(p.request.url).pathname;
            if(!path.startsWith('/api/'))continue;
            requests.set(p.requestId,path);
            let intent;
            try{const body=JSON.parse(p.request.postData??'{}');intent=Object.fromEntries(['running','intent','reason','sequence','expectedPlaybackGeneration'].filter(k=>k in body).map(k=>[k,body[k]]));}catch{}
            events.push({label,type:'request',time:p.timestamp,id:p.requestId,path,method:p.request.method,intent});
          } else if(e.method==='Network.responseReceived'&&requests.has(p.requestId)) {
            const path=requests.get(p.requestId);
            events.push({label,type:'response',time:p.timestamp,id:p.requestId,path,status:p.response.status});
          } else if(e.method==='Network.loadingFinished'&&requests.has(p.requestId)) {
            const path=requests.get(p.requestId);
            let playback=null;
            if(['/api/session/playback','/api/session/presence','/api/realtime/snapshot'].includes(path)) {
              try{const response=await cdp.send('Network.getResponseBody',{requestId:p.requestId}); const body=JSON.parse(response.body);playback=pickPlayback(body.playback??body);}catch{}
            }
            if(playback)events.push({label,type:'playback',time:p.timestamp,id:p.requestId,path,playback});
          } else if(e.method==='Network.loadingFailed'&&requests.has(p.requestId)) {
            events.push({label,type:'failed',time:p.timestamp,path:requests.get(p.requestId),error:p.errorText});
          } else if(e.method==='Network.webSocketFrameReceived') {
            try{const body=JSON.parse(p.response.payloadData);events.push({label,type:'frame',time:p.timestamp,id:p.requestId,event:body.type,sequence:body.sequence,playback:pickPlayback(body.playback)});}catch{}
          } else if(e.method==='Network.webSocketCreated'||e.method==='Network.webSocketClosed') {
            events.push({label,type:e.method.split('.').at(-1),time:p.timestamp,id:p.requestId});
          }
        }
      } while(batch.hasMore);
      await writeFile(`${directory}/network.json`,JSON.stringify(events,null,2)+'\n');
      return {label,total:events.length,recent:events.filter(e=>e.label===label).map(({id,...e})=>e)};
    },
    async close(){await cdp.send('Network.disable');},
    events,
  };
}
