# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: table.spec.ts >> anonymous reconnect after lost opening response establishes a session before identity verification
- Location: web\e2e\table.spec.ts:149:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: 'Resume', exact: true })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('button', { name: 'Resume', exact: true }) with timeout 5000ms
  - waiting for getByRole('button', { name: 'Resume', exact: true })

```

```yaml
- main:
  - img "CardFord"
  - status: Start a local session to continue.
  - button "Reconnect"
  - link "Try the example game":
    - /url: "#demo"
  - link "Account":
    - /url: "#account"
```

# Test source

```ts
  86  |         const body = route.request().postDataJSON() as Record<string, unknown>;
  87  |         commands.push(body);
  88  |         state = {
  89  |           ...state,
  90  |           revision: state.revision + 1,
  91  |           decisionId: 'decision-2',
  92  |           game: {
  93  |             ...state.game,
  94  |             turn: 1,
  95  |             hand: state.game.hand.filter((card) => card !== 'C2'),
  96  |             trick: [{ seat: 0, card: 'C2' }],
  97  |             legalActions: [],
  98  |           },
  99  |         };
  100 |         return route.fulfill({ json: state });
  101 |       }
  102 |       if (url.pathname === '/api/session/advice')
  103 |         return route.fulfill({
  104 |           json: {
  105 |             focus: 'Look at your options',
  106 |             notice: 'You may lead any legal card.',
  107 |             reason: 'The visible position gives you several choices.',
  108 |             suggestion: 'Consider your lowest club.',
  109 |             card: 'C2',
  110 |             source: 'code',
  111 |             decisionId: state.decisionId,
  112 |             requestedLevel: route.request().postDataJSON().requestedLevel,
  113 |           },
  114 |         });
  115 |       if (url.pathname === '/api/session/exposures') return route.fulfill({ json: { accepted: true } });
  116 |       if (url.pathname === '/api/session/prepare')
  117 |         return route.fulfill({
  118 |           json: {
  119 |             preparedDecisionId: 'prepared-1',
  120 |             decisionId: state.decisionId,
  121 |             revision: state.revision,
  122 |             source: 'code',
  123 |           },
  124 |         });
  125 |       return route.fulfill({ json: state });
  126 |     },
  127 |   );
  128 |   await page.goto('/');
  129 |   await page.getByRole('button', { name: 'Resume', exact: true }).click();
  130 |   return {
  131 |     commands,
  132 |     setState: (next: SessionView) => {
  133 |       state = next;
  134 |     },
  135 |   };
  136 | }
  137 |
  138 | test('connection screen shows CardFord logo when the table cannot load', async ({ page }, testInfo) => {
  139 |   await page.route(
  140 |     (url) => url.pathname.startsWith('/api/'),
  141 |     (route) => route.fulfill({ status: 503, json: { error: 'Unavailable' } }),
  142 |   );
  143 |   await page.goto('/');
  144 |   await expect(page.getByRole('img', { name: 'CardFord' })).toBeVisible();
  145 |   await page.screenshot({ path: testInfo.outputPath('cardford-loading.png') });
  146 | });
  147 |
  148 | for (const loseOpeningResponse of [false, true]) {
  149 |   test(`anonymous ${loseOpeningResponse ? 'reconnect after lost opening response' : 'first visit'} establishes a session before identity verification`, async ({ page }) => {
  150 |     const requests: string[] = [];
  151 |     const mutations: unknown[] = [];
  152 |     let sessionReads = 0;
  153 |     await page.addInitScript(() => {
  154 |       const now = Date.now();
  155 |       sessionStorage.setItem('tricks-tab', 'tab-identity-bootstrap');
  156 |       localStorage.setItem('cardford-pending-v1:tab-identity-bootstrap:session', JSON.stringify({
  157 |         version: 1, ownerId: '11111111-1111-4111-8111-111111111111', gameId: 'ui-fixture',
  158 |         createdAt: now, expiresAt: now + 24 * 60 * 60 * 1000,
  159 |         operation: { path: '/api/sessions', body: {
  160 |           commandId: '00000000-0000-4000-8000-000000000001', mode: 'hearts', expectedActiveGameId: 'ui-fixture',
  161 |         } },
  162 |       }));
  163 |     });
  164 |     await page.route((url) => url.pathname.startsWith('/api/'), route => {
  165 |       const path = new URL(route.request().url()).pathname;
  166 |       requests.push(path);
  167 |       if (route.request().method() !== 'GET') {
  168 |         mutations.push(route.request().postDataJSON());
  169 |         return route.abort();
  170 |       }
  171 |       if (path === '/api/identity') {
  172 |         if (!route.request().headers().cookie?.includes('tc_session=bootstrap-fixture'))
  173 |           return route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED', message: 'Start a local session to continue.' } });
  174 |         return route.fulfill({ json: { playerId: '22222222-2222-4222-8222-222222222222' } });
  175 |       }
  176 |       if (path === '/api/session') {
  177 |         sessionReads++;
  178 |         if (loseOpeningResponse && sessionReads === 1) return route.abort('failed');
  179 |         return route.fulfill({ headers: { 'set-cookie': 'tc_session=bootstrap-fixture; HttpOnly; Path=/; SameSite=Strict' }, json: fixture() });
  180 |       }
  181 |       if (path === '/api/dev/scenarios') return route.fulfill({ json: { scenarios: [] } });
  182 |       return route.fulfill({ json: fixture() });
  183 |     });
  184 |     await page.goto('/');
  185 |     if (loseOpeningResponse) await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
> 186 |     await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
      |                                                                             ^ Error: expect(locator).toBeVisible() failed
  187 |     expect(requests[0]).toBe('/api/session');
  188 |     expect(requests.indexOf('/api/identity')).toBeGreaterThan(requests.indexOf('/api/session'));
  189 |     expect(mutations).toHaveLength(0);
  190 |     expect(await page.evaluate(() => localStorage.getItem('cardford-pending-v1:tab-identity-bootstrap:session'))).toBeNull();
  191 |   });
  192 | }
  193 |
  194 | test('single card activation selects; fresh double activation commits one server command', async ({
  195 |   page,
  196 | }) => {
  197 |   const { commands } = await mount(page);
  198 |   await expect(page).toHaveTitle('Spades — CardFord');
  199 |   await expect(page.getByRole('link', { name: 'CardFord choose game' })).toBeVisible();
  200 |   await expect(page.locator('.brand-symbol')).toBeVisible();
  201 |   await expect(page.getByText('Tricks Coach')).toHaveCount(0);
  202 |   const card = page.getByRole('button', { name: '2 of clubs', exact: true });
  203 |   await card.click();
  204 |   await expect(card).toHaveAttribute('aria-pressed', 'true');
  205 |   expect(commands).toHaveLength(0);
  206 |   await page.waitForTimeout(400);
  207 |   await card.dblclick();
  208 |   await expect.poll(() => commands.length).toBe(1);
  209 |   expect(commands[0]).toMatchObject({
  210 |     gameId: 'ui-fixture',
  211 |     expectedRevision: 1,
  212 |     action: { kind: 'play', card: 'C2' },
  213 |   });
  214 |   await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  215 | });
  216 |
  217 | test('off-turn prepared card never autoplays on the human turn', async ({ page }) => {
  218 |   const initial = fixture();
  219 |   initial.game.turn = 1;
  220 |   initial.game.legalActions = [];
  221 |   const harness = await mount(page, initial);
  222 |   await page.getByRole('button', { name: '2 of clubs', exact: true }).dblclick();
  223 |   await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  224 |   const next = fixture();
  225 |   next.revision = 2;
  226 |   next.decisionId = 'human-turn';
  227 |   harness.setState(next);
  228 |   await page.getByRole('button', { name: 'Resume', exact: true }).click();
  229 |   await expect(page.getByRole('button', { name: '2 of clubs', exact: true })).toHaveAttribute(
  230 |     'aria-pressed',
  231 |     'true',
  232 |   );
  233 |   await page.waitForTimeout(1100);
  234 |   expect(harness.commands).toHaveLength(0);
  235 | });
  236 |
  237 | test('suggestion never commits or hides legal cards', async ({ page }) => {
  238 |   const { commands } = await mount(page);
  239 |   await page.getByRole('button', { name: 'Give me a cue' }).click();
  240 |   await expect(page.getByText('You may lead any legal card.')).toBeVisible();
  241 |   await page.getByRole('button', { name: 'Suggest a move', exact: true }).click();
  242 |   await expect(page.getByText('Consider your lowest club.')).toBeVisible();
  243 |   expect(commands).toHaveLength(0);
  244 |   await expect(page.locator('.hand-card')).toHaveCount(4);
  245 | });
  246 |
  247 | test('finite demo makes zero API requests and reaches a terminal replay', async ({ page }) => {
  248 |   const calls: string[] = [];
  249 |   await page.route(
  250 |     (url) => url.pathname.startsWith('/api/'),
  251 |     (route) => {
  252 |       calls.push(route.request().url());
  253 |       return route.abort();
  254 |     },
  255 |   );
  256 |   await page.goto('/#demo');
  257 |   await page.getByRole('button', { name: 'Play the 4 of clubs' }).click();
  258 |   await page.getByRole('button', { name: 'Show the original' }).click();
  259 |   await page.getByRole('button', { name: 'Finish example' }).click();
  260 |   await expect(page.getByRole('heading', { name: 'Example complete' })).toBeVisible();
  261 |   expect(calls).toEqual([]);
  262 | });
  263 |
  264 | test('phone portrait account bypasses table rotation gate', async ({ page }) => {
  265 |   await page.setViewportSize({ width: 390, height: 844 });
  266 |   const session = fixture();
  267 |   await page.route('**/api/account', (route) =>
  268 |     route.fulfill({
  269 |       json: {
  270 |         authMode: 'local-test',
  271 |         player: { id: '11111111-1111-4111-8111-111111111111', displayName: 'Local player' },
  272 |         access: session.access,
  273 |         subscription: {
  274 |           status: 'local-mock',
  275 |           plan: 'unlimited',
  276 |           cancelAtPeriodEnd: false,
  277 |           currentPeriodEnd: null,
  278 |           billingAvailable: false,
  279 |         },
  280 |         offers: [
  281 |           { id: 'practice', name: 'Practice', description: 'Test coverage', price: null, currency: null },
  282 |         ],
  283 |       },
  284 |     }),
  285 |   );
  286 |   await page.goto('/#account');
```