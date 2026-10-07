// One bounded integration invocation. Failed or timed-out captures are immutable.
import {runBoundedNative} from '../../../../scripts/bounded-native-run.mjs';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,mkdirSync,existsSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const identity=process.argv[2];
if(!identity||!/^[a-z0-9-]+$/.test(identity)) throw Error('Provide a new capture identity');
const out=resolve('qa/implementation/multi-game/m12',identity);
if(existsSync(`${out}/receipt.json`)) throw Error('Preserve the previous capture');
mkdirSync(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${p}/${e.name}`):[`${p}/${e.name}`]);
const paths=['go.mod','go.sum','scripts/windows-tools.json','scripts/windows-env.mjs','scripts/bounded-native-run.mjs',
  ...walk('server').filter(p=>/\.(go|json)$/.test(p)),
  ...walk('web/shared').filter(p=>/\.(ts|json|mjs|mts)$/.test(p))].sort();
const hashes=()=>paths.map(path=>({path,sha256:sha(readFileSync(path))}));
const before=hashes();
const args=['scripts/windows-env.mjs','go','test','-p=1','./server/...','-count=1','-timeout=10m','-json'];
const result=await runBoundedNative(process.execPath,args,{milliseconds:1800000,maxBytes:16<<20});
const password=JSON.parse(readFileSync('.local/windows-postgres/credentials.json','utf8')).password;
const output=result.output.replaceAll(password,'[redacted]');
const events=output.split(/\r?\n/).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
const terminal=events.filter(e=>e.Test&&['pass','fail','skip'].includes(e.Action));
const {output:ignored,...receipt}=result;
const unchanged=JSON.stringify(before)===JSON.stringify(hashes());
const summary={receipt,args,unchanged,sources:before,outputSHA256:sha(output),
  passed:terminal.filter(e=>e.Action==='pass').length,
  topLevelPassed:terminal.filter(e=>e.Action==='pass'&&!e.Test.includes('/')).length,
  failed:terminal.filter(e=>e.Action==='fail').map(({Package,Test})=>({Package,Test})),
  skipped:terminal.filter(e=>e.Action==='skip').map(({Package,Test})=>({Package,Test})),
  provider:{mode:'off',attempts:0,observedModel:null}};
writeFileSync(`${out}/go.jsonl`,output);
writeFileSync(`${out}/receipt.json`,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({...summary,sources:undefined}));
process.exitCode=result.status==='passed'&&unchanged?0:result.timedOut?124:1;
