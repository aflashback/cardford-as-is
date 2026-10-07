import type { AdviceView } from '../../shared/contracts.ts';

/** A displayed level is confirmed only after the matching advice is received. */
export class ProgressiveAdviceRequests {
  private inFlight=false;
  get pending() { return this.inFlight; }

  async request(decisionId:string, level:1|2|3, load:()=>Promise<AdviceView>,
    accept:(advice:AdviceView)=>Promise<void>):Promise<boolean> {
    if (this.inFlight) return false;
    this.inFlight=true;
    try {
      const advice=await load();
      if (advice.decisionId!==decisionId || advice.requestedLevel!==level)
        throw new Error('The advice does not match this request. Ask again for the current decision.');
      await accept(advice);
      return true;
    } finally { this.inFlight=false; }
  }
}
