import {test,expect} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {PlatformSessionView} from '../shared/local-service.contracts.ts';
import {assertContract} from '../shared/local-service.validation.ts';

for(const variant of ['individual','neighbour-teams'] as const)test(`M06 real numeric UI ${variant}: advice, reveal, reload, bots and lowest score`,async({page,context})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const actions:string[]=[];page.on('request',request=>{const path=new URL(request.url()).pathname;if(path.startsWith('/api/'))actions.push(`${request.method()} ${path}`);});
 await page.goto('/');await expect(page.getByRole('status',{name:'Fixture status'})).toHaveText('Ready');
 const grant=await context.request.post('/__m06/grants',{headers:{Origin:process.env.M06_TOKEN_ORIGIN!,'X-M06-Fixture':process.env.M06_FIXTURE_NONCE!},data:{variant}});expect(grant.status()).toBe(200);
 await page.getByRole('button',{name:variant==='individual'?'Start individual':'Start neighbour teams',exact:true}).click();
 await expect(page.getByRole('status',{name:'Fixture status'})).toHaveText('Ready');await expect(page.getByRole('region',{name:'Numeric token conformance table'})).toBeVisible();
 const current=async():Promise<PlatformSessionView>=>{const wire:unknown=await page.evaluate(async()=>{const response=await fetch('/api/platform/session',{headers:{'X-Tricks-Tab':sessionStorage.getItem('m06-tab')!}});if(!response.ok)throw Error('Read failed');return response.json();});assertContract('PlatformSessionView',wire);return wire;};
 const initial=await current();expect(initial.session?.pin.gameId).toBe('test-token');expect(initial.catalog.every(item=>item.selector.gameId!=='test-token')).toBe(true);
 if(variant==='neighbour-teams'){await expect(page.getByText('A: seats 0, 1; collected 0',{exact:true})).toBeVisible();await expect(page.getByText('B: seats 2, 3; collected 0',{exact:true})).toBeVisible();}
 await page.getByRole('button',{name:'Show saved advice',exact:true}).click();await expect(page.getByRole('status',{name:'Fixture status'})).toHaveText('Ready');
 const saved=page.getByLabel('Saved original advice');await expect(saved).toContainText('Source: demo');const originalAdvice=await saved.innerText();
 await page.getByRole('button',{name:/^Reveal /}).first().click();await expect(page.getByRole('status',{name:'Fixture status'})).toHaveText('Ready');
 const beforeReload=await current();expect(beforeReload.session!.revision).toBeGreaterThan(0);const ownedTokensBefore=beforeReload.session!.view.gameId==='test-token'?beforeReload.session!.view.table.own:[];
 await page.reload();await expect(page.getByRole('status',{name:'Fixture status'})).toHaveText('Ready');const recovered=await current();expect(recovered.session!.gameId).toBe(beforeReload.session!.gameId);expect(recovered.session!.revision).toBe(beforeReload.session!.revision);
 if(recovered.session!.view.gameId!=='test-token')throw Error('Wrong registered branch');expect(recovered.session!.view.table.own).toEqual(ownedTokensBefore);
 for(let i=0;i<5;i++){const wire=await current();if(wire.session?.node.kind==='session-complete')break;await page.getByRole('button',{name:/^Reveal /}).filter({visible:true}).first().click();await expect(page.getByRole('status',{name:'Fixture status'})).toHaveText('Ready');}
 await expect(page.getByLabel('Lifecycle')).toHaveText('session-complete');const terminal=await current();if(terminal.session?.view.gameId!=='test-token')throw Error('Wrong terminal branch');
 expect(terminal.session.revision).toBe(25);expect(terminal.session.view.table.collections).toEqual([0,0,0,5]);
 expect(terminal.session.view.table.winners).toEqual(variant==='individual'?['seat-0','seat-1','seat-2']:['A']);
 await page.getByRole('button',{name:'Show saved advice',exact:true}).click();await expect(page.getByRole('status',{name:'Fixture status'})).toHaveText('Ready');expect(await saved.innerText()).toBe(originalAdvice);
 await page.reload();await expect(page.getByRole('status',{name:'Fixture status'})).toHaveText('Ready');await expect(page.getByLabel('Lifecycle')).toHaveText('session-complete');
 const final=await current();expect(final.session!.revision).toBe(25);expect(errors).toEqual([]);expect(actions.some(a=>a==='POST /api/session/actions')).toBe(true);expect(actions.some(a=>a==='POST /api/session/advance')).toBe(true);expect(actions.some(a=>a.startsWith('GET /api/decisions/'))).toBe(true);
 const output=process.env.M06_BROWSER_OUTPUT!;await mkdir(output,{recursive:true});await page.screenshot({path:resolve(output,`${variant}.png`),fullPage:true});
 await writeFile(resolve(output,`${variant}.json`),JSON.stringify({variant,gameId:terminal.session.gameId,revision:terminal.session.revision,collections:terminal.session.view.table.collections,winners:terminal.session.view.table.winners,actions,consoleErrors:errors,privateStateInjected:false,apiResponsesMocked:false},null,2)+'\n');
});
