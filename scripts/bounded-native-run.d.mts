export const MAX_TEST_RUN_MS:number;
export interface NativeRunOptions {
 cwd?:string;env?:NodeJS.ProcessEnv;milliseconds?:number;maxBytes?:number;onData?:(value:string)=>void;
}
export interface NativeRunReceipt {
 exitCode:number|null;signal:NodeJS.Signals|null;error:string|null;shutdownError:string|null;
 timedOut:boolean;interrupted:boolean;outputLimitExceeded:boolean;elapsedMs:number;output:string;
 status:'passed'|'failed'|'pending-unverified';
}
export function runBoundedNative(executable:string,args:string[],options?:NativeRunOptions):Promise<NativeRunReceipt>;
