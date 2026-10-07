import {test,expect} from '@playwright/test';
import {validateContract} from '../shared/local-service.validation';

test('empty configured launch offers remain separate from fixture billing and practice',async({page})=>{
 await page.goto('/#account');
 await expect(page.getByText('No offers are available.',{exact:true})).toBeVisible();
 await expect(page.getByLabel('Local account ID',{exact:true})).toHaveValue(/^[a-f0-9]{48}$/);
 await expect(page.getByRole('button',{name:'Preview test plan'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Manage family'})).toHaveCount(0);
 const account=await page.evaluate(async()=>{
  const response=await fetch('/api/account',{headers:{'X-Tricks-Tab':sessionStorage.getItem('tricks-tab')!}});
  if(!response.ok)throw Error(`account ${response.status}`);return response.json();
 });
 expect(validateContract('PlatformAccountView',account)).toBe(true);
 expect(account.mode).toBe('configured');expect(account.fixtureAccount).toBeNull();
 expect(account.availability).toHaveLength(3);
 for(const item of account.availability){expect(item.play.allowed).toBe(false);expect(item.coach.allowed).toBe(false);}
 const forbidden=await page.evaluate(async()=>fetch('/api/subscription/preview',{
  method:'POST',headers:{'Content-Type':'application/json','X-Tricks-Client':'1','X-Tricks-Tab':sessionStorage.getItem('tricks-tab')!},
  body:JSON.stringify({action:'select-plan',plan:'unlimited'}),
 }).then(r=>r.status));
 expect(forbidden).toBe(403);
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
