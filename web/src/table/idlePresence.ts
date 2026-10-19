/** Foreground engagement is separate from the server lease and transport. */
export class IdlePresence {
  private warningTimer:ReturnType<typeof setTimeout>|null=null;
  private pauseTimer:ReturnType<typeof setTimeout>|null=null;
  private readonly eligible:()=>boolean;
  private readonly warning:(value:boolean)=>void;
  private readonly pause:()=>void;
  constructor(eligible:()=>boolean,warning:(value:boolean)=>void,pause:()=>void){this.eligible=eligible;this.warning=warning;this.pause=pause;}
  engage() {
    this.stop();this.warning(false);
    if(!this.eligible())return;
    this.warningTimer=setTimeout(()=>{
      this.warningTimer=null;if(!this.eligible())return;
      this.warning(true);
      this.pauseTimer=setTimeout(()=>{this.pauseTimer=null;if(this.eligible())this.pause();},30_000);
    },120_000);
  }
  stop(){if(this.warningTimer)clearTimeout(this.warningTimer);if(this.pauseTimer)clearTimeout(this.pauseTimer);this.warningTimer=null;this.pauseTimer=null;}
}
