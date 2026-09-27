import { test, expect, type Page } from '@playwright/test';
import type { SessionView } from '../shared/contracts';

function fixture(): SessionView {
  return { game: { id: 'ui-fixture', mode: 'spades-partners', phase: 'play', hand: ['C2', 'D3', 'H4', 'S5'], handCounts: [4,4,4,4], bids: [3,2,3,2], tricks: [0,0,0,0], scores: [0,0,0,0], bags: [0,0,0,0], trick: [], history: [], turn: 0, dealer: 3, handNumber: 1, heartsBroken: false, spadesBroken: false, passDirection: 'hold', received: [], outgoing: [], handResult: null, currentWinner: null, legalActions: [{kind:'play',card:'C2'},{kind:'play',card:'D3'},{kind:'play',card:'H4'},{kind:'play',card:'S5'}] }, revision: 1, decisionId: 'decision-1', preferences: {coachMode:'asked',gameSpeed:1}, access: {plan:'unlimited',coverage:'active',canPlay:true,canCoach:true,remainingHands:null,resetsAt:null,handUnlocked:true,canStartWork:true,localMock:true},source:'code',controlLeaseToken:'lease-ui',stats:{decisions:0,helped:0,suggestions:0} };
}
async function mount(page: Page, value: SessionView = fixture()) {
  let state = structuredClone(value); const commands: Record<string,unknown>[] = [];
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const url = new URL(route.request().url());
    expect(route.request().headers()['x-tricks-tab']).toBeTruthy();
    if (route.request().method() !== 'GET') expect(route.request().headers()['x-tricks-client']).toBe('1');
    if (url.pathname === '/api/session/actions') {
      const body = route.request().postDataJSON() as Record<string,unknown>; commands.push(body);
      state = {...state, revision: state.revision + 1, decisionId:'decision-2',game:{...state.game,turn:1,hand:state.game.hand.filter(card => card !== 'C2'),trick:[{seat:0,card:'C2'}],legalActions:[]}};
      return route.fulfill({json:state});
    }
    if (url.pathname === '/api/session/advice') return route.fulfill({json:{focus:'Look at your options',notice:'You may lead any legal card.',reason:'The visible position gives you several choices.',suggestion:'Consider your lowest club.',card:'C2',source:'code',decisionId:state.decisionId,requestedLevel:route.request().postDataJSON().requestedLevel}});
    if (url.pathname === '/api/session/exposures') return route.fulfill({json:{accepted:true}});
    if (url.pathname === '/api/session/prepare') return route.fulfill({json:{preparedDecisionId:'prepared-1',decisionId:state.decisionId,revision:state.revision,source:'code'}});
    return route.fulfill({json:state});
  });
  await page.goto('/'); await page.getByRole('button',{name:'Resume',exact:true}).click();
  return {commands, setState:(next:SessionView)=>{state=next;}};
}

test('single card activation selects; fresh double activation commits one server command', async ({page}) => {
  const {commands}=await mount(page);
  const card=page.getByRole('button',{name:'2 of clubs',exact:true});
  await card.click(); await expect(card).toHaveAttribute('aria-pressed','true'); expect(commands).toHaveLength(0);
  await page.waitForTimeout(400); await card.dblclick();
  await expect.poll(()=>commands.length).toBe(1);
  expect(commands[0]).toMatchObject({gameId:'ui-fixture',expectedRevision:1,action:{kind:'play',card:'C2'}});
  await page.getByRole('button',{name:'Pause game',exact:true}).click();
});

test('off-turn prepared card never autoplays on the human turn', async ({page}) => {
  const initial=fixture(); initial.game.turn=1; initial.game.legalActions=[];
  const harness=await mount(page,initial);
  await page.getByRole('button',{name:'2 of clubs',exact:true}).dblclick();
  await page.getByRole('button',{name:'Pause game',exact:true}).click();
  const next=fixture(); next.revision=2;next.decisionId='human-turn'; harness.setState(next);
  await page.getByRole('button',{name:'Resume',exact:true}).click();
  await expect(page.getByRole('button',{name:'2 of clubs',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.waitForTimeout(1100); expect(harness.commands).toHaveLength(0);
});

test('suggestion never commits or hides legal cards',async({page})=>{
  const {commands}=await mount(page);
  await page.getByRole('button',{name:'Give me a cue'}).click();
  await expect(page.getByText('You may lead any legal card.')).toBeVisible();
  await page.getByRole('button',{name:'Suggest a move',exact:true}).click();
  await expect(page.getByText('Consider your lowest club.')).toBeVisible();
  expect(commands).toHaveLength(0); await expect(page.locator('.hand-card')).toHaveCount(4);
});

test('finite demo makes zero API requests and reaches a terminal replay',async({page})=>{
  const calls:string[]=[]; await page.route(url => url.pathname.startsWith('/api/'),route=>{calls.push(route.request().url());return route.abort();});
  await page.goto('/#demo'); await page.getByRole('button',{name:'Play the 4 of clubs'}).click(); await page.getByRole('button',{name:'Show the original'}).click(); await page.getByRole('button',{name:'Finish example'}).click();
  await expect(page.getByRole('heading',{name:'Example complete'})).toBeVisible(); expect(calls).toEqual([]);
});

test('phone portrait account bypasses table rotation gate',async({page})=>{
  await page.setViewportSize({width:390,height:844}); const session=fixture();
  await page.route('**/api/account',route=>route.fulfill({json:{authMode:'local-test',player:{displayName:'Local player'},access:session.access,subscription:{status:'local-mock',plan:'unlimited',cancelAtPeriodEnd:false,currentPeriodEnd:null,billingAvailable:false},offers:[{id:'practice',name:'Practice',description:'Test coverage',price:null,currency:null}]}}));
  await page.goto('/#account'); await expect(page.getByRole('heading',{name:'Account and subscription'})).toBeVisible(); await expect(page.getByRole('button',{name:'Cancel renewal'})).toBeVisible(); await expect(page.getByText('Turn your phone')).toHaveCount(0);
});
