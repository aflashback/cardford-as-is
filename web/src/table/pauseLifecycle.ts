/** Presentation intent survives temporary menus and is cleared only by Resume. */
export class PauseIntent {
  private state=createLifecycle();
  private readonly changed:(paused:boolean,reason:PauseReason)=>void;
  constructor(changed:(paused:boolean,reason:PauseReason)=>void) {this.changed=changed;}
  invalidateResume() {this.state={...this.state,epoch:this.state.epoch+1};}
  pause(reason:PauseReason='manual') {this.state=reduceLifecycle(this.state,{type:'interrupt',reason});this.changed(true,this.state.reason);}
  beginResume() {return this.state.epoch;}
  canResume(ticket:number) {return canResumeLifecycle(this.state,ticket);}
  finishResume(ticket:number) {
    if(!this.canResume(ticket))return false;
    this.state=reduceLifecycle(this.state,{type:'resumeConfirmed',epoch:ticket});
    this.changed(false,this.state.reason);return true;
  }
}

let exitGuard:(()=>Promise<boolean>)|undefined;
export function registerTableExitGuard(guard:()=>Promise<boolean>) {
  exitGuard=guard;
  return ()=>{if(exitGuard===guard)exitGuard=undefined;};
}
export const pauseBeforeTableExit=()=>exitGuard?.()??Promise.resolve(true);
export const isTableRoute=(route:string)=>route!=='#account'&&route!=='#demo';
import {createLifecycle,reduceLifecycle,canResumeLifecycle,type PauseReason} from './sessionLifecycle.ts';
