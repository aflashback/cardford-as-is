import { test, expect } from '@playwright/test';

const signedOut={mode:'keycloak',state:'signed-out',refreshUrl:'/auth/refresh',authenticated:false,loginUrl:'/auth/login',logoutUrl:'/auth/logout',accountUrl:'https://localhost:8443/realms/cardford/account/'};
const signedIn={...signedOut,state:'authenticated',session:{id:'family-a',serverTime:new Date().toISOString(),accessExpiresAt:new Date(Date.now()+900_000).toISOString(),idleExpiresAt:new Date(Date.now()+90*86400_000).toISOString(),absoluteExpiresAt:new Date(Date.now()+180*86400_000).toISOString()},authenticated:true,csrfToken:'a'.repeat(43),account:{id:'owner-a',displayName:'Ali',plan:'free'}};
test.beforeEach(({},testInfo)=>{test.skip(testInfo.project.metadata.authProfile!=='keycloak-mocked','Requires the explicit Keycloak browser build profile.');});

test('portrait welcome verifies identity before any game hook and demo remains public',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const requests:string[]=[];
  await page.route(url=>url.pathname.startsWith('/api/'),async route=>{requests.push(new URL(route.request().url()).pathname);await route.fulfill({json:signedOut});});
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Good cards. Better company.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Sign in or create an account'})).toBeVisible();
  expect(requests.length).toBeGreaterThan(0);expect(requests.every(path=>path==='/api/auth/status')).toBeTruthy();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.screenshot({path:test.info().outputPath('welcome-portrait.png'),fullPage:true});
  await page.getByRole('link',{name:'Try an example game'}).click();
  await expect(page.getByRole('heading',{name:/example/i}).first()).toBeVisible();
  const count=requests.filter(path=>path==='/api/auth/status').length;
  await page.reload();await expect(page.getByRole('heading',{name:/example/i}).first()).toBeVisible();
  expect(requests.filter(path=>path==='/api/auth/status').length).toBe(count);
});

test('failed bootstrap blocks private table and offers an accessible retry',async({page})=>{
  let failed=true;
  await page.route('**/api/auth/status',async route=>{await route.fulfill(failed ? {status:503,body:''} : {json:signedOut});});
  await page.goto('/');await expect(page.getByRole('alert')).toBeVisible();
  failed=false;
  await page.getByRole('button',{name:'Try again'}).click();
  await expect(page.getByRole('heading',{name:'Good cards. Better company.'})).toBeVisible();
});

test('authenticated account hides fixture billing and signout revokes with CSRF',async({page})=>{
  const apiPaths:string[]=[];
  await page.route(url=>url.pathname.startsWith('/api/'),async route=>{apiPaths.push(new URL(route.request().url()).pathname);await route.fulfill({json:signedIn});});
  let logoutCsrf='';
  await page.route('**/auth/logout',async route=>{logoutCsrf=route.request().headers()['x-csrf-token'];await route.fulfill({status:204});});
  await page.goto('/#account');
  await expect(page.getByRole('heading',{name:'Ali',exact:true})).toBeVisible();
  await expect(page.getByText('Free',{exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Manage sign-in and security'})).toHaveAttribute('href',signedOut.accountUrl);
  await expect(page.getByRole('button',{name:/test plan|local account|trial|delete/i})).toHaveCount(0);
  expect(apiPaths.every(path=>path==='/api/auth/status')).toBeTruthy();
  await page.screenshot({path:test.info().outputPath('account.png'),fullPage:true});
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Good cards. Better company.'})).toBeVisible();
  expect(logoutCsrf).toBe(signedIn.csrfToken);
  await expect(page.getByRole('heading',{name:'Ali',exact:true})).toHaveCount(0);
});

test('identity revocation clears the gate without fixture account enrollment',async({page})=>{
  const paths:string[]=[];
  await page.route(url=>url.pathname.startsWith('/api/'),async route=>{
    const path=new URL(route.request().url()).pathname;paths.push(path);
    await route.fulfill(path==='/api/auth/status' ? {json:signedIn} : {status:401,json:{code:'UNAUTHENTICATED',message:'Session ended.'}});
  });
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Your session ended.'})).toBeVisible();
  expect(paths).toContain('/api/identity');expect(paths).not.toContain('/api/local/session');
});

test('an idle account makes no recurring requests and clears private UI at the local access deadline',async({page})=>{
  await page.clock.install();
  let current:typeof signedOut|typeof signedIn=signedIn;
  let checks=0;
  await page.route('**/api/auth/status',async route=>{checks++;await route.fulfill({json:current});});
  await page.goto('/#account');
  await expect(page.getByRole('heading',{name:'Ali',exact:true})).toBeVisible();
  const initialChecks=checks;
  current=signedOut;
  await page.clock.fastForward(31_000);
  await expect(page.getByRole('heading',{name:'Ali',exact:true})).toBeVisible();
  expect(checks).toBe(initialChecks);
  await page.clock.fastForward(900_000);
  await expect(page.getByRole('heading',{name:'Welcome back.'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Ali',exact:true})).toHaveCount(0);
  expect(checks).toBe(initialChecks);
});

test('hidden pages make no recurring auth requests and recheck immediately when visible',async({page})=>{
  await page.clock.install();
  let current:typeof signedOut|typeof signedIn=signedIn;
  let checks=0;
  await page.route('**/api/auth/status',async route=>{checks++;await route.fulfill({json:current});});
  await page.goto('/#account');
  await expect(page.getByRole('heading',{name:'Ali',exact:true})).toBeVisible();
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,value:true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const initialChecks=checks;
  current=signedOut;
  await page.clock.fastForward(90_000);
  expect(checks).toBe(initialChecks);
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,value:false});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('heading',{name:'Good cards. Better company.'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Ali',exact:true})).toHaveCount(0);
});

test('returning from the public demo verifies again before mounting private hooks',async({page})=>{
  let release:(()=>void)|undefined;
  let waiting:Promise<void>|undefined;
  const paths:string[]=[];
  await page.route(url=>url.pathname.startsWith('/api/'),async route=>{
    const path=new URL(route.request().url()).pathname;paths.push(path);
    if (path==='/api/auth/status') {
      await waiting;
      await route.fulfill({json:waiting ? signedOut : signedIn});
    } else await route.fulfill({status:503,body:''});
  });
  await page.goto('/#account');
  await expect(page.getByRole('heading',{name:'Ali',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Try the example game',exact:true}).click();
  await expect(page.getByRole('heading',{name:/example/i}).first()).toBeVisible();
  paths.length=0;
  waiting=new Promise<void>(resolve=>{release=resolve;});
  await page.evaluate(()=>{location.hash='account';});
  await expect(page.getByText('Checking your sign-in…',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Ali',exact:true})).toHaveCount(0);
  expect(paths.every(path=>path==='/api/auth/status')).toBe(true);
  release?.();
  await expect(page.getByRole('heading',{name:'Good cards. Better company.'})).toBeVisible();
});


test('remembered access requires explicit Continue and focus alone does not renew',async({page})=>{
 const {account:_account,...remembered}=signedIn;let renewals=0;let checks=0;
 await page.route('**/api/auth/status',async route=>{checks++;await route.fulfill({json:{...remembered,state:'renewal-required',authenticated:false}});});
 await page.route('**/auth/refresh',async route=>{renewals++;expect(route.request().headers()['x-csrf-token']).toBe(signedIn.csrfToken);await route.fulfill({json:signedIn});});
 await page.goto('/#account');await expect(page.getByRole('heading',{name:'Welcome back.'})).toBeVisible();
 await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));});
 await expect.poll(()=>checks).toBeGreaterThan(1);expect(renewals).toBe(0);
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Ali',exact:true})).toBeVisible();expect(renewals).toBe(1);
});
