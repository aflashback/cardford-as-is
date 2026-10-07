// Bounded, read-only failure-time evidence. Never prints SQL, URLs or secrets.
import pg from 'pg';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const url=new URL(process.env.TEST_DATABASE_URL);
assert.equal(process.platform,'win32');assert.equal(url.hostname,'127.0.0.1');
assert.equal(url.port,'54331');assert.equal(url.pathname,'/cardford_windows_test');
const client=new pg.Client({connectionString:url.href,connectionTimeoutMillis:3000,
  query_timeout:3000,application_name:'cardford:m04e-diagnostic',options:'-c statement_timeout=2000 -c lock_timeout=1000'});
const report={at:new Date().toISOString(),reads:[],sockets:null,serverEvents:[]};
try {
 await client.connect();
 for(const [name,sql] of [
  ['activity',"SELECT pid,datname,application_name,state,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE backend_type='client backend' ORDER BY pid"],
  ['limits',"SELECT name,setting FROM pg_settings WHERE name IN ('max_connections','checkpoint_timeout','fsync') ORDER BY name"],
  ['schemas',"SELECT nspname FROM pg_namespace WHERE left(nspname,4)='m03_' OR nspname='cardford_go_local' ORDER BY nspname"],
 ]) report.reads.push({name,rows:(await client.query(sql)).rows});
}catch(error){report.failure={code:error.code??null,name:error.name};}
finally{await client.end().catch(()=>{});}
const sockets=spawnSync('powershell.exe',['-NoProfile','-Command',
 "Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq 54331 -or $_.RemotePort -eq 54331 } | Group-Object State | Select-Object Name,Count | ConvertTo-Json -Compress"],
 {encoding:'utf8',windowsHide:true,timeout:5000});
report.sockets={exitCode:sockets.status,error:sockets.error?.code??null,counts:sockets.stdout?.trim()??''};
const log=readFileSync(resolve('.local/windows-postgres/postgres.log'),'utf8');
report.serverEvents=log.split(/\r?\n/).slice(-500).filter(line=>
 /LOG:  (checkpoint (starting|complete)|database system|could not (receive|send)|unexpected EOF)|FATAL:  (remaining connection|sorry, too many|terminating connection)/.test(line)).slice(-30);
const password=decodeURIComponent(url.password);
const raw=JSON.stringify(report,null,2).replaceAll(password,'[redacted]')+'\n';
writeFileSync(resolve('.local/m04e-database-diagnostic.json'),raw);
console.log(raw);
