// Run with the existing visible cua_repl tab and viewport handles. Only resize
// and inspect rendered DOM; all game and Coach actions remain explicit UI steps.
import {readFile,writeFile} from 'node:fs/promises';
import {captureCase,cssViewport} from '../../browser-2026-10-14/browser-review.mjs';
export {cssViewport};

export async function captureRequest(tab,directory,name,context={}) {
  const summary=await captureCase(tab,directory,name,context);
  const path=`${directory}/${name}.json`;
  const saved=JSON.parse(await readFile(path,'utf8'));
  const request=await tab.playwright.evaluate(()=>{
    const picker=document.querySelector('.trix-request-picker');
    return {
      compact:document.querySelector('.rally-game-shell')?.getAttribute('data-rally-compact'),
      inline:document.querySelector('.trix-center')?.getAttribute('style'),
      width:picker?.clientWidth,scrollWidth:picker?.scrollWidth,
      height:picker?.clientHeight,scrollHeight:picker?.scrollHeight,
      buttons:Array.from(document.querySelectorAll('.trix-request-options button')).map(el=>{
        const r=el.getBoundingClientRect();
        return {text:el.textContent,width:r.width,height:r.height,top:r.top,bottom:r.bottom};
      }),
    };
  });
  const p=saved.measure.prompt,f=saved.measure.felt;
  const dx=p&&f?(p.x+p.width/2)-(f.x+f.width/2):null;
  const dy=p&&f?(p.y+p.height/2)-(f.y+f.height/2):null;
  saved.measure.request={...request,dx,dy};
  Object.assign(saved.checks,{
    requestPresent:!!p,
    requestCenteredX:dx!==null&&Math.abs(dx)<=1,
    requestCenteredY:dy!==null&&Math.abs(dy)<=1,
    requestNoScroll:request.scrollHeight<=request.height+1&&request.scrollWidth<=request.width+1,
    requestTargets:request.buttons.length>0&&request.buttons.every(b=>b.width>=43.9&&b.height>=43.9),
    requestAllChoicesInside:!!p&&request.buttons.every(b=>b.top>=p.y-1&&b.bottom<=p.bottom+1),
  });
  // Direct CDP capture at this app's zoom cropped wide frames despite correct
  // DOM dimensions. The browser's native screenshot returns the complete view.
  await writeFile(`${directory}/${name}.jpg`,await tab.getScreenshot({emit:false}));
  saved.captureMethod='built-in-browser getScreenshot; full viewport, no CDP clipping';
  await writeFile(path,JSON.stringify(saved,null,2)+'\n');
  return {name,viewport:summary.viewport,pinned:saved.measure.pinned,compact:request.compact,
    dx,dy,count:request.buttons.length,checks:saved.checks};
}
