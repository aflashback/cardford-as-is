// One-time, explicitly pinned historical input preservation. No corpus edits.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
const paths=['web/server/tests/module-contract.test.ts','web/shared/contracts.schema.json','web/shared/contracts.ts','web/shared/openapi.json','web/shared/validation.ts'];
const corpus=JSON.parse(readFileSync('qa/implementation/multi-game/m04b/reference-corpus.json','utf8'));
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const entries=[];
for(const path of paths){
 const reference=corpus.sources.find(entry=>entry.path===path);
 if(!reference)throw Error(`Unlisted original input: ${path}`);
 const raw=execFileSync('git',['show',`b822d0d:${path}`],{windowsHide:true,maxBuffer:8<<20});
 if(sha(raw)!==reference.sha256)throw Error(`Pinned blob differs from original corpus: ${path}`);
 const target=`qa/implementation/multi-game/m06/retained-m04b-source/${path}`;
 if(existsSync(target)&&!raw.equals(readFileSync(target)))throw Error(`Refusing to replace historical source: ${path}`);
 mkdirSync(dirname(target),{recursive:true});writeFileSync(target,raw);
 entries.push({path,retained:target,sha256:sha(raw),bytes:raw.length});
}
writeFileSync('qa/implementation/multi-game/m06/retained-m04b-source/manifest.json',JSON.stringify({version:'1.0.0',sourceCommit:'b822d0d',purpose:'Original M04B schema/test inputs, superseded only by additive M06 generation; original corpus untouched',entries},null,2)+'\n');
console.log(JSON.stringify({preservedOriginalInputs:entries.length,unchangedCorpus:true}));
