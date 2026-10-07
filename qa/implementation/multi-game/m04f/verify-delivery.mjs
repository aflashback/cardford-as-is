import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
const folder='qa/implementation/multi-game/m04f';
const sha=b=>createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(readFileSync(p));
function sources(files){for(const f of files)if(sha(readFileSync(f.path))!==f.sha256)throw Error(`Source drift: ${f.path}`);}
function output(dir,name,digest){if(sha(readFileSync(`${dir}/${name}`))!==digest)throw Error(`Output drift: ${name}`);}
for(const lane of ['history','parity']){
 const dir=`${folder}/${lane}-checks`,r=json(`${dir}/report.json`);
 if(!r.sourceUnchanged)throw Error(`Changed source: ${lane}`);
 sources(r.source);
 for(const c of r.reports){if(c.exitCode!==0||c.missingTests.length||c.unexpectedSkips.length)throw Error(`Failed lane: ${lane}`);output(dir,c.output,c.outputSHA256);}
}
const final=json(`${folder}/replay-final.json`);
if(final.exitCode!==0||!final.sourceUnchanged)throw Error('Final replay failed');
sources(final.source);output(folder,final.output,final.outputSHA256);
for(const name of ['clone-after','event-projection-checks']){
 const r=json(`${folder}/${name}.json`);sources(r.sources);
 for(const c of r.checks)output(folder,c.output,c.sha256);
}
const safety=json(`${folder}/history-safety.json`);sources(safety.source);
for(const c of safety.checks){if(c.exitCode!==0)throw Error('Failed safety check');output(folder,c.output,c.outputSHA256);}
const db=json(`${folder}/database-probe-20261007025552750.json`);
if(db.exitCode!==0||!db.sourceUnchanged||!db.result.passed||db.result.iterations.length!==3||db.result.iterations.some(i=>!i.passed||!i.cleanupOK))throw Error('Database probe failed');
sources(db.sources);
const original=json('qa/implementation/multi-game/m04c/original-reference-manifest.json');sources(original.currentOriginalSources.sources);
const preserved=['web','go.mod','go.sum','scripts/windows-env.mjs','scripts/windows-tools.json',
 'server/internal/contracts','server/internal/records/codec.go','server/internal/records/store_history.go',
 'server/internal/service',...['m02','m02a','m03','m04','m04b','m04c','m04d','m04e','performance-windows'].map(p=>`qa/implementation/multi-game/${p}`)];
const git=spawnSync('git',['diff','--exit-code','e0956a5','--',...preserved],{encoding:'utf8',windowsHide:true});
if(git.status!==0)throw Error('Original contracts/policies/validation/evidence changed');
const docs=['CHANGELOG.md','planning/CHANGELOG.md','planning/README.md','planning/IMPLEMENTATION-START-HERE.md',
 'qa/implementation/multi-game/status.md','docs/superpowers/plans/2026-10-04-multi-game-reasoning-implementation.md',
 'planning/implementation/multi-game/backend-readiness.md','planning/implementation/multi-game/m04-execution.md',
 'planning/implementation/multi-game/m04f-execution.md',...readdirSync(folder).filter(f=>f.endsWith('.md')).map(f=>`${folder}/${f}`)];
let links=0;
for(const doc of docs)for(const m of readFileSync(doc,'utf8').matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){
 const href=m[1].split('#')[0];if(!href||/^[a-z]+:/.test(href))continue;
 const p=resolve(dirname(doc),decodeURIComponent(href));
 if(p!==resolve(`${folder}/delivery-checks.json`)&&!existsSync(p))throw Error(`Missing link ${doc} -> ${href}`);links++;
}
function walk(p){return readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${p}/${e.name}`):[`${p}/${e.name}`]);}
const password=json('.local/windows-postgres/credentials.json').password;
for(const p of walk(folder))if(readFileSync(p,'utf8').includes(password))throw Error(`Credential in evidence ${p}`);
const cleanup=json(`${folder}/cleanup.json`);
if(cleanup.postgres!=='stopped'||cleanup.listeners.length||cleanup.ownedExecutables.length)throw Error('Cleanup incomplete');
const report={checkedAt:new Date().toISOString(),scope:'Focused first-slice verification; not complete M04F acceptance',
 finalReplaySourceSHA256:final.sourceSHA256,originalReferenceSources:original.currentOriginalSources.sources.length,
 sourceOutputAndPrivateCredentialChecks:'passed',preservedFrom:'e0956a5',preservedPaths:preserved,localMarkdownLinks:links,
 noFullAcceptanceOrNormalMatchSoakRun:true};
writeFileSync(`${folder}/delivery-checks.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
