import assert from 'node:assert/strict';
import { mkdirSync,openSync,writeSync,fsyncSync,closeSync,readFileSync,existsSync,readdirSync,renameSync } from 'node:fs';
import { join,dirname } from 'node:path';
import { canonical,digest,type JsonObject } from './contracts.ts';
export function immutableJson(path:string,value:unknown){const bytes=JSON.stringify(value,null,2)+'\n';mkdirSync(dirname(path),{recursive:true});if(existsSync(path)){assert.equal(readFileSync(path,'utf8'),bytes,'Original artifact cannot be overwritten');return;}const fd=openSync(path,'wx');try{writeSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}}
export function readJson<T=unknown>(path:string):T{return JSON.parse(readFileSync(path,'utf8')) as T;}
export function readJsonLines<T=unknown>(path:string):T[]{const text=readFileSync(path,'utf8');assert.ok(!text||text.endsWith('\n'),'Truncated JSONL archive');return text.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line) as T);}
export function readJsonDirectory<T=unknown>(dir:string):T[]{if(!existsSync(dir))return [];return readdirSync(dir).filter(f=>f.endsWith('.json')).sort().map(f=>readJson<T>(join(dir,f)));}
export function artifactId(value:unknown){return digest(value);}
/** Only derived conveniences may replace; immutable source snapshots remain. */
export function replaceDerived(path:string,bytes:string){mkdirSync(dirname(path),{recursive:true});const temp=path+'.'+process.pid+'.tmp';const fd=openSync(temp,'wx');try{writeSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}renameSync(temp,path);}
