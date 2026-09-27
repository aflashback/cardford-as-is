/** Bounded local HTTP smoke measurement. Never use a development or production database. */
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import pg from 'pg';
import {assertContract} from '../shared/validation.ts';
import type {ContractName,ContractTypes,SessionView} from '../shared/contracts.ts';

const outputRoot=fileURLToPath(new URL('../../',import.meta.url));
const sourceRoot=resolve(process.env.LOCAL_LOAD_SOURCE_ROOT??outputRoot);
const {createApp}:typeof import('../server/http/app.ts')=await import(pathToFileURL(join(sourceRoot,'web/server/http/app.ts')).href);
const {readConfig}:typeof import('../server/config.ts')=await import(pathToFileURL(join(sourceRoot,'web/server/config.ts')).href);
const testUrl=process.env.TEST_DATABASE_URL;
if(!testUrl||testUrl===process.env.DATABASE_URL||!new URL(testUrl).pathname.endsWith('_test'))throw new Error('A separate TEST_DATABASE_URL ending _test is required.');
const parsed=new URL(testUrl);
if(!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname))throw new Error('This local smoke script only uses loopback PostgreSQL.');
const schema=`local_load_${randomUUID().replaceAll('-','')}`;
if(!/^local_load_[a-f0-9]{32}$/.test(schema))throw new Error('Invalid isolated schema.');
const admin=new pg.Pool({connectionString:testUrl,max:1});
const pool=new pg.Pool({connectionString:testUrl,options:`-c search_path=${schema}`,max:8,connectionTimeoutMillis:3000});
const config=readConfig({...process.env,APP_ENV:'test',IDENTITY_MODE:'local-test',BILLING_MODE:'fixture',DATABASE_URL:testUrl,JEV_MODE:'off',JEV_MAX_REQUESTS:'0',HOST:'127.0.0.1'});
const app=await createApp(config,pool);
interface Sample {route:string;milliseconds:number;status:number}
interface Table {cookie:string;tab:string}
interface ErrorSample {table:number;route:string;status:number;code:string}
const users:Table[]=Array.from({length:100},()=>({cookie:'',tab:randomUUID()}));
const stages:{concurrentTables:number;admitted:number;completed:number;errors:number;httpRequests:number;durationMs:number;requestLatencyMs:{p50:number;p95:number;p99:number;max:number};routes:Record<string,{requests:number;p50:number;p95:number;p99:number}>;failures:ErrorSample[]}[]=[];
const round=(n:number)=>Math.round(n*100)/100;
function percentile(values:number[],fraction:number):number {const ordered=[...values].sort((a,b)=>a-b);return round(ordered[Math.max(0,Math.ceil(fraction*ordered.length)-1)]??0);}
let origin='';let databaseCounts={players:0,games:0};let cleanupComplete=false;
const startedAt=new Date().toISOString();
let overallFailure:unknown;
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  const migrationDirectory=join(sourceRoot,'web/server/records/migrations');
  for(const name of (await readdir(migrationDirectory)).filter(n=>/^00[1-5]-.*\.sql$/.test(n)).sort())await pool.query(await readFile(join(migrationDirectory,name),'utf8'));
  origin=await app.listen({host:'127.0.0.1',port:0});
  if(new URL(origin).hostname!=='127.0.0.1')throw new Error('Server did not bind loopback.');
  for(const concurrency of [1,10,100]){
    const samples:Sample[]=[],failures:ErrorSample[]=[];const started=performance.now();let completed=0;
    async function request<N extends ContractName>(table:Table,route:string,responseName:N,body?:unknown):Promise<ContractTypes[N]> {
      const requestStarted=performance.now();let status=0;
      try {
        const response=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{'x-tricks-tab':table.tab,'x-tricks-client':'1',...(table.cookie?{cookie:table.cookie}:{}),...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
        status=response.status;const cookie=response.headers.get('set-cookie');if(cookie)table.cookie=cookie.split(';')[0]!;
        const value:unknown=await response.json();
        if(!response.ok){let code='HTTP_ERROR';if(value&&typeof value==='object'&&'code' in value&&typeof value.code==='string')code=value.code;throw Object.assign(new Error(code),{route,status,code});}
        assertContract(responseName,value);return value;
      }finally{samples.push({route,status,milliseconds:performance.now()-requestStarted});}
    }
    await Promise.all(users.slice(0,concurrency).map(async(table,index)=>{
      let route='/api/session';
      try {
        const view:SessionView=await request(table,route,'SessionView');
        const envelope={commandId:randomUUID(),gameId:view.game.id,expectedRevision:view.revision,controlLeaseToken:view.controlLeaseToken};
        let next:SessionView;
        if(view.game.legalActions.length){route='/api/session/actions';next=await request(table,route,'SessionView',{...envelope,action:view.game.legalActions[0]});}
        else if(view.game.phase==='trick-end'){route='/api/session/advance';next=await request(table,route,'SessionView',{...envelope,kind:'collect-trick'});}
        else {route='/api/session/prepare';const ready=await request(table,route,'PrepareView',envelope);route='/api/session/advance';next=await request(table,route,'SessionView',{...envelope,commandId:randomUUID(),kind:'bot',preparedDecisionId:ready.preparedDecisionId});}
        if(next.revision!==view.revision+1)throw new Error('REVISION_NOT_ADVANCED_ONCE');completed++;
      }catch(error){const e=error as {status?:number;code?:string;message?:string};failures.push({table:index,route,status:e.status??0,code:e.code??e.message??'REQUEST_FAILED'});}
    }));
    const values=samples.map(s=>s.milliseconds);const routes:Record<string,{requests:number;p50:number;p95:number;p99:number}>={};
    for(const route of [...new Set(samples.map(s=>s.route))]){const times=samples.filter(s=>s.route===route).map(s=>s.milliseconds);routes[route]={requests:times.length,p50:percentile(times,.5),p95:percentile(times,.95),p99:percentile(times,.99)};}
    stages.push({concurrentTables:concurrency,admitted:concurrency,completed,errors:failures.length,httpRequests:samples.length,durationMs:round(performance.now()-started),requestLatencyMs:{p50:percentile(values,.5),p95:percentile(values,.95),p99:percentile(values,.99),max:round(Math.max(...values,0))},routes,failures});
    console.log(JSON.stringify(stages.at(-1)));
  }
  const counts=(await pool.query<{players:string;games:string}>('SELECT (SELECT count(*) FROM players) AS players,(SELECT count(*) FROM games) AS games')).rows[0]!;
  databaseCounts={players:Number(counts.players),games:Number(counts.games)};
  if(databaseCounts.players>100||databaseCounts.games>100)throw new Error('The bounded 100-table limit was exceeded.');
}catch(error){overallFailure=error;}
finally{
  await app.close();await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();cleanupComplete=true;
}
const sourceFiles=['web/server/http/app.ts','web/server/http/game-service.ts','web/server/http/views.ts','web/server/records/repository.ts','web/shared/contracts.schema.json'];
const sourceHashes:Record<string,string>={};for(const file of sourceFiles)sourceHashes[file]=createHash('sha256').update(await readFile(join(sourceRoot,file))).digest('hex');
const git=(...args:string[])=>execFileSync('git',args,{cwd:sourceRoot,encoding:'utf8',windowsHide:true}).trim();
const evidence={kind:'local-operating-smoke',startedAt,finishedAt:new Date().toISOString(),runtime:process.version,platform:process.platform,architecture:process.arch,sourceCommit:git('rev-parse','HEAD'),sourceWorkingTreeDirty:git('status','--porcelain').length>0,sourceHashes,transport:'real HTTP over ephemeral 127.0.0.1 port',database:'isolated random schema in loopback *_test database',databasePoolMax:8,identity:'local-test',payments:'fixture; no external calls',provider:'off; no requests',uniqueTableLimit:100,databaseCounts,cleanupComplete,stages,status:overallFailure||stages.some(s=>s.errors)?'failed':'passed',limitations:['One local process and short samples on the current workstation; no production capacity claim.','Tables are reused between stages: 100 distinct identities/tables maximum, 111 measured transitions.','HTTP latency includes local connection, application, database and JSON transfer; no browser rendering or external provider latency.','No sustained-load, remote-client, hosted multi-replica, failover or paid-load gate is established.'],...(overallFailure?{failure:overallFailure instanceof Error?overallFailure.message:'Unexpected smoke error'}:{})};
await mkdir(join(outputRoot,'qa/implementation'),{recursive:true});await writeFile(join(outputRoot,'qa/implementation/local-load.json'),JSON.stringify(evidence,null,2)+'\n');
if(evidence.status==='failed')process.exitCode=1;
