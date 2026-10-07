import {readFileSync,readdirSync,existsSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
const folder='qa/implementation/multi-game/m04e';
const names=['go-full','go-race','go-vet','go-contracts','public-contracts','typecheck','build','go-build','fixture-build','browser-smoke','browser-terminal','browser-configured','frontend-tests','boundary-check','edge-check','node-reference'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const reports=names.map(n=>JSON.parse(readFileSync(`${folder}/${n}.json`)));
for(const r of reports){
 if(r.exitCode!==0||!r.sourceUnchanged)throw Error(`Failed acceptance ${r.name}`);
 if(sha(readFileSync(`${folder}/${r.output}`))!==r.outputSHA256)throw Error(`Output drift ${r.name}`);
 if(sha(JSON.stringify(r.source))!==r.sourceSHA256)throw Error(`Manifest drift ${r.name}`);
 for(const f of r.source)if(sha(readFileSync(f.path))!==f.sha256)throw Error(`Source drift ${f.path}`);
}
if(new Set(reports.map(r=>r.sourceSHA256)).size!==1)throw Error('Final source manifests differ');
const original=JSON.parse(readFileSync('qa/implementation/multi-game/m04c/original-reference-manifest.json'));
for(const f of original.currentOriginalSources.sources)if(sha(readFileSync(f.path))!==f.sha256)throw Error(`Original source drift ${f.path}`);
const preserved=['web/server',':!web/server/records/migrations/010-platform-client.sql','web/shared/contracts.schema.json','web/shared/contracts.ts','web/shared/validators.mjs','web/shared/validation.ts','web/shared/openapi.json','web/shared/games','go.mod','go.sum','package-lock.json','scripts/windows-env.mjs','scripts/windows-tools.json',...['m02','m02a','m03','m04','m04b','m04c','m04d','performance-windows'].map(p=>`qa/implementation/multi-game/${p}`)];
const git=spawnSync('git',['diff','--exit-code','54d6e10','--',...preserved],{encoding:'utf8',windowsHide:true});if(git.status!==0)throw Error('Original source/evidence paths changed');
const docs=['CHANGELOG.md','planning/CHANGELOG.md','planning/README.md','planning/IMPLEMENTATION-START-HERE.md','qa/implementation/multi-game/status.md','docs/superpowers/plans/2026-10-04-multi-game-reasoning-implementation.md',...['m04-execution','m04d-execution','m04e-execution','contracts','private-records','windows-development','launch-access-and-client','backend-readiness'].map(p=>`planning/implementation/multi-game/${p}.md`),...readdirSync(folder).filter(p=>p.endsWith('.md')).map(p=>`${folder}/${p}`)];
let links=0;
for(const file of docs)for(const m of readFileSync(file,'utf8').matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){
 const href=m[1].split('#')[0];if(!href||/^[a-z]+:/.test(href))continue;
 const target=resolve(dirname(file),decodeURIComponent(href));if(target!==resolve(`${folder}/delivery-checks.json`)&&!existsSync(target))throw Error(`Broken link ${file} -> ${href}`);links++;
}
const credentials=JSON.parse(readFileSync('.local/windows-postgres/credentials.json'));
for(const f of readdirSync(folder))if(readFileSync(`${folder}/${f}`,'utf8').includes(credentials.password))throw Error(`Credential in evidence ${f}`);
const summary={checkedAt:new Date().toISOString(),checks:names,sourceSHA256:reports[0].sourceSHA256,sourceAndOutputHashes:'match final captured bytes',originalReferenceSources:original.currentOriginalSources.sources.length,preservedFrom:'54d6e10',preservedPaths:preserved,localMarkdownLinks:links,privateDatabaseCredential:'absent from M04E evidence'};
writeFileSync(`${folder}/delivery-checks.json`,JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
