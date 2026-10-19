// Execution-only filesystem closure. Historical semantic validators remain frozen.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
export const footprintVersion='trix-frozen-loader-filesystem-footprint-1.0.0';
const sha=b=>createHash('sha256').update(b).digest('hex');
const pathOf=p=>resolve(p instanceof URL?fileURLToPath(p):Buffer.isBuffer(p)?p.toString('utf8'):p).replaceAll('\\','/');
const canonical=x=>JSON.stringify(x);
const serialize=x=>x instanceof Date?{date:x.toISOString()}:typeof x==='bigint'?{bigint:x.toString()}:x;
const methods=['isFile','isDirectory','isBlockDevice','isCharacterDevice','isSymbolicLink','isFIFO','isSocket'];
const fields=['size','mode','ino','dev','nlink','uid','gid','rdev','blksize','blocks','atimeMs','mtimeMs','ctimeMs','birthtimeMs','atimeNs','mtimeNs','ctimeNs','birthtimeNs','atime','mtime','ctime','birthtime'];
export function createFsFootprintTracker({journalPath,fsModule=fs}={}) {
  assert.ok(journalPath);const journal=pathOf(journalPath),observations=new Map(),original={};
  for(const key of Object.keys(fsModule))if(typeof fsModule[key]==='function')original[key]=fsModule[key].bind(fsModule);
  let internalRead=0,violated=null;
  const violation=name=>{violated??='Forbidden or unknown filesystem operation: '+name;throw Error(violated)};
  function record(effect){const key=canonical([effect.kind,effect.path,effect.options??null,effect.probe??null]);const previous=observations.get(key);assert.ok(!previous||canonical(previous)===canonical(effect),'Filesystem dependency changed during capture: '+effect.path);observations.set(key,effect);}
  const tracked={
    readFileSync(path,options){const p=pathOf(path);let encoding=null;assert.ok(options===undefined||options===null||typeof options==='string'||typeof options==='object');if(typeof options==='string')encoding=options;else if(options){assert.ok(Object.keys(options).every(k=>['encoding','flag'].includes(k)),'Unknown readFile options');assert.ok(options.flag===undefined||options.flag==='r','Mutating readFile flag forbidden');encoding=options.encoding??null;}let bytes;internalRead++;try{bytes=original.readFileSync(p)}finally{internalRead--}record({kind:p===journal?'journal-prefix-read':'readFile',path:p,sha256:sha(bytes),bytes:bytes.length});return encoding?bytes.toString(encoding):bytes;},
    existsSync(path){const p=pathOf(path),value=original.existsSync(p);record({kind:'exists',path:p,value});return value;},
    lstatSync(path,options){return stat('lstat',path,options)},
    statSync(path,options){return stat('stat',path,options)},
    realpathSync(path,options){const symbols=options&&typeof options==='object'?Object.getOwnPropertySymbols(options):[];const internal=symbols.length===1&&String(symbols[0])==='Symbol(realpathCacheKey)'&&options[symbols[0]]?.constructor?.name==='SafeMap'&&Object.keys(options).length===0;assert.ok(options===undefined||options==='utf8'||options===null||internal,'Unknown realpath options');const p=pathOf(path),value=original.realpathSync(p,options);assert.equal(value,original.realpathSync(p),'Node resolver cache disagrees with actual filesystem');record({kind:'realpath',path:p,value});return value;},
    readdirSync(path,options){assert.ok(options===undefined||options===null||typeof options==='string'||typeof options==='object');const opt=typeof options==='string'?{encoding:options}:options??{};assert.ok(Object.keys(opt).every(k=>['encoding','withFileTypes','recursive'].includes(k)),'Unknown readdir options');assert.ok(!opt.recursive,'Recursive readdir requires separate audit support');assert.ok(opt.encoding===undefined||opt.encoding==='utf8','Unknown readdir encoding');const p=pathOf(path),values=original.readdirSync(p,opt),value=opt.withFileTypes?values.map(d=>({name:d.name,...Object.fromEntries(methods.map(k=>[k,d[k]()])),parentPath:d.parentPath??null})):values;record({kind:'readdir',path:p,options:{withFileTypes:Boolean(opt.withFileTypes)},value});return values;},
  };
  function stat(kind,path,options){assert.ok(options===undefined||options===null||typeof options==='object');const opt=options??{};assert.ok(Object.keys(opt).every(k=>['bigint','throwIfNoEntry'].includes(k)),'Unknown stat options');const p=pathOf(path),value=original[kind+'Sync'](p,opt),base={kind,path:p,options:{bigint:Boolean(opt.bigint),throwIfNoEntry:opt.throwIfNoEntry!==false}};if(value===undefined){record({...base,probe:'exists',value:false});return value;}record({...base,probe:'exists',value:true});return new Proxy(value,{get(target,key){if(methods.includes(key))return()=>{const result=target[key]();record({...base,probe:key,value:result});return result};if(fields.includes(key)){const result=target[key];record({...base,probe:key,value:serialize(result)});return result;}return violation('unobserved Stats property '+String(key));},ownKeys(){return violation('Stats ownKeys')},getOwnPropertyDescriptor(){return violation('Stats descriptor')},has(){return violation('Stats has')},set(){return violation('Stats mutation')}});}
  for(const [name,fn] of Object.entries(tracked)) tracked[name]=(...args)=>{try{return fn(...args)}catch(error){violated??='Capture failed in '+name+': '+error.message;throw error}};
  function install(){
    const restore=[];
    const swap=(object,name,replacement)=>{const descriptor=Object.getOwnPropertyDescriptor(object,name);assert.ok(descriptor?.configurable||descriptor?.writable,'Unpatchable filesystem method: '+name);Object.defineProperty(object,name,{value:replacement,writable:true,enumerable:descriptor.enumerable,configurable:true});restore.push(()=>Object.defineProperty(object,name,descriptor));};
    const reset=()=>{for(const fn of restore.reverse())fn();syncBuiltinESMExports()};
    try{
      for(const [name,fn]of Object.entries(original)){const replacement=tracked[name]??function(...args){if(internalRead&&['openSync','readSync','closeSync','fstatSync'].includes(name))return fn(...args);return violation(name)};swap(fsModule,name,replacement);}
      const promises=fsModule.promises;
      for(const key of Object.keys(promises))if(typeof promises[key]==='function')swap(promises,key,function(){return violation('promises.'+key)});
      syncBuiltinESMExports();return reset;
    }catch(error){violated??='Incomplete strict FS installation: '+error.message;reset();throw error;}
  }
  function finish(){assert.equal(violated,null,'Forbidden operation prevents certificate');return{schemaVersion:footprintVersion,complete:true,effects:[...observations.values()].sort((a,b)=>canonical(a).localeCompare(canonical(b)))};}
  return{tracked,install,finish};
}
export function recheckFsFootprint(footprint,{fsModule=fs,verifyJournalPrefix}={}) {
  assert.equal(footprint.schemaVersion,footprintVersion);assert.equal(footprint.complete,true);assert.ok(Array.isArray(footprint.effects)&&footprint.effects.length>0);let journalChecked=false;
  for(const effect of footprint.effects){assert.equal(effect.path,pathOf(effect.path),'Noncanonical footprint path');let actual;
    switch(effect.kind){
      case 'readFile':{const b=fsModule.readFileSync(effect.path);assert.equal(sha(b),effect.sha256,'Static dependency bytes changed: '+effect.path);assert.equal(b.length,effect.bytes);break;}
      case 'journal-prefix-read':assert.equal(typeof verifyJournalPrefix,'function');verifyJournalPrefix(effect);journalChecked=true;break;
      case 'exists':assert.equal(fsModule.existsSync(effect.path),effect.value,'Dependency existence changed');break;
      case 'realpath':assert.equal(fsModule.realpathSync(effect.path),effect.value,'Dependency realpath changed');break;
      case 'readdir':{const entries=fsModule.readdirSync(effect.path,effect.options);actual=effect.options.withFileTypes?entries.map(d=>({name:d.name,...Object.fromEntries(methods.map(k=>[k,d[k]()])),parentPath:d.parentPath??null})):entries;assert.deepEqual(actual,effect.value,'Dependency directory changed');break;}
      case 'stat':case 'lstat':{const stat=fsModule[effect.kind+'Sync'](effect.path,effect.options);actual=effect.probe==='exists'?stat!==undefined:methods.includes(effect.probe)?stat[effect.probe]():fields.includes(effect.probe)?serialize(stat[effect.probe]):undefined;assert.notEqual(actual,undefined,'Unknown footprint stat probe');assert.deepEqual(actual,effect.value,'Dependency stat predicate changed');break;}
      default:assert.fail('Unknown footprint effect: '+effect.kind);
    }
  }
  assert.equal(journalChecked,true,'Certified journal dependency missing');
}





