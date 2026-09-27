import type {Seat} from './types.ts';
export type Competition={mode:'individual'|'partnership';competitors:{id:string;seats:Seat[]}[]};
export type Lifecycle='awaiting_action'|'round_complete'|'session_complete';
/** The shared seam makes no assumption about cards, tricks, bids, trump or score direction. */
export interface GameModule<State,Observation,Action>{
 manifest:{id:string;version:string;capabilities:string[]};
 competition:Competition;
 create():State;
 lifecycle(state:State):Lifecycle;
 observe(state:State,seat:Seat):Observation;
 legalActions(observation:Observation):Action[];
 apply(state:State,seat:Seat,action:Action):State;
 scores(state:State):{competitorId:string;value:number}[];
}
export function validateCompetition(value:Competition):void{
 if(value.mode!=='individual'&&value.mode!=='partnership')throw new Error('Unsupported competition mode.');
 const seats=value.competitors.flatMap(c=>c.seats);const size=value.mode==='individual'?1:2;
 if(seats.length!==4||new Set(seats).size!==4||seats.some(s=>![0,1,2,3].includes(s))||new Set(value.competitors.map(c=>c.id)).size!==value.competitors.length||value.competitors.some(c=>!c.id||c.seats.length!==size))throw new Error('Invalid four-seat competition.');
}
export const catalog=['hearts','spades-solo','spades-partners'] as const;
export function assertCatalogMode(mode:string):void{if(!(catalog as readonly string[]).includes(mode))throw new Error('Unsupported game mode.');}

