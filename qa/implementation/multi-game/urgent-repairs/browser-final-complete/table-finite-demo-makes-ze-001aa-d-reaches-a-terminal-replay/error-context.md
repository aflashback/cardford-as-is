# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: table.spec.ts >> finite demo makes zero API requests and reaches a terminal replay
- Location: web\e2e\table.spec.ts:274:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Play the 4 of clubs' })

```

# Test source

```ts
  184 |           return route.abort();
  185 |         }
  186 |         if (path === '/api/identity') {
  187 |           if (!route.request().headers().cookie?.includes('tc_session=bootstrap-fixture'))
  188 |             return route.fulfill({
  189 |               status: 401,
  190 |               json: { code: 'UNAUTHENTICATED', message: 'Start a local session to continue.' },
  191 |             });
  192 |           return route.fulfill({ json: { playerId: '22222222-2222-4222-8222-222222222222' } });
  193 |         }
  194 |         if (path === '/api/session') {
  195 |           sessionReads++;
  196 |           if (loseOpeningResponse && sessionReads === 1) return route.abort('failed');
  197 |           return route.fulfill({
  198 |             headers: { 'set-cookie': 'tc_session=bootstrap-fixture; HttpOnly; Path=/; SameSite=Strict' },
  199 |             json: fixture(),
  200 |           });
  201 |         }
  202 |         if (path === '/api/dev/scenarios') return route.fulfill({ json: { scenarios: [] } });
  203 |         return route.fulfill({ json: fixture() });
  204 |       },
  205 |     );
  206 |     await page.goto('/');
  207 |     if (loseOpeningResponse) {
  208 |       await expect(page.getByRole('status')).not.toHaveText('Opening your table…');
  209 |       await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
  210 |     }
  211 |     await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  212 |     expect(requests[0]).toBe('/api/session');
  213 |     expect(requests.indexOf('/api/identity')).toBeGreaterThan(requests.indexOf('/api/session'));
  214 |     expect(mutations).toHaveLength(0);
  215 |     expect(
  216 |       await page.evaluate(() => localStorage.getItem('cardford-pending-v1:tab-identity-bootstrap:session')),
  217 |     ).toBeNull();
  218 |   });
  219 | }
  220 |
  221 | test('single card activation selects; fresh double activation commits one server command', async ({
  222 |   page,
  223 | }) => {
  224 |   const { commands } = await mount(page);
  225 |   await expect(page).toHaveTitle('Spades — CardFord');
  226 |   await expect(page.getByRole('link', { name: 'CardFord choose game' })).toBeVisible();
  227 |   await expect(page.locator('.brand-symbol')).toBeVisible();
  228 |   await expect(page.getByText('Tricks Coach')).toHaveCount(0);
  229 |   const card = page.getByRole('button', { name: '2 of clubs', exact: true });
  230 |   await card.click();
  231 |   await expect(card).toHaveAttribute('aria-pressed', 'true');
  232 |   expect(commands).toHaveLength(0);
  233 |   await page.waitForTimeout(400);
  234 |   await card.dblclick();
  235 |   await expect.poll(() => commands.length).toBe(1);
  236 |   expect(commands[0]).toMatchObject({
  237 |     gameId: 'ui-fixture',
  238 |     expectedRevision: 1,
  239 |     action: { kind: 'play', card: 'C2' },
  240 |   });
  241 |   await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  242 | });
  243 |
  244 | test('off-turn prepared card never autoplays on the human turn', async ({ page }) => {
  245 |   const initial = fixture();
  246 |   initial.game.turn = 1;
  247 |   initial.game.legalActions = [];
  248 |   const harness = await mount(page, initial);
  249 |   await page.getByRole('button', { name: '2 of clubs', exact: true }).dblclick();
  250 |   await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  251 |   const next = fixture();
  252 |   next.revision = 2;
  253 |   next.decisionId = 'human-turn';
  254 |   harness.setState(next);
  255 |   await page.getByRole('button', { name: 'Resume', exact: true }).click();
  256 |   await expect(page.getByRole('button', { name: '2 of clubs', exact: true })).toHaveAttribute(
  257 |     'aria-pressed',
  258 |     'true',
  259 |   );
  260 |   await page.waitForTimeout(1100);
  261 |   expect(harness.commands).toHaveLength(0);
  262 | });
  263 |
  264 | test('suggestion never commits or hides legal cards', async ({ page }) => {
  265 |   const { commands } = await mount(page);
  266 |   await page.getByRole('button', { name: 'Give me a cue' }).click();
  267 |   await expect(page.getByText('You may lead any legal card.')).toBeVisible();
  268 |   await page.getByRole('button', { name: 'Suggest a move', exact: true }).click();
  269 |   await expect(page.getByText('Consider your lowest club.')).toBeVisible();
  270 |   expect(commands).toHaveLength(0);
  271 |   await expect(page.locator('.hand-card')).toHaveCount(4);
  272 | });
  273 |
  274 | test('finite demo makes zero API requests and reaches a terminal replay', async ({ page }) => {
  275 |   const calls: string[] = [];
  276 |   await page.route(
  277 |     (url) => url.pathname.startsWith('/api/'),
  278 |     (route) => {
  279 |       calls.push(route.request().url());
  280 |       return route.abort();
  281 |     },
  282 |   );
  283 |   await page.goto('/#demo');
> 284 |   await page.getByRole('button', { name: 'Play the 4 of clubs' }).click();
      |                                                                   ^ Error: locator.click: Test timeout of 30000ms exceeded.
  285 |   await page.getByRole('button', { name: 'Show the original' }).click();
  286 |   await page.getByRole('button', { name: 'Finish example' }).click();
  287 |   await expect(page.getByRole('heading', { name: 'Example complete' })).toBeVisible();
  288 |   expect(calls).toEqual([]);
  289 | });
  290 |
  291 | test('phone portrait account bypasses table rotation gate', async ({ page }) => {
  292 |   await page.setViewportSize({ width: 390, height: 844 });
  293 |   const session = fixture();
  294 |   await page.route('**/api/account', (route) =>
  295 |     route.fulfill({
  296 |       json: {
  297 |         authMode: 'local-test',
  298 |         player: { id: '11111111-1111-4111-8111-111111111111', displayName: 'Local player' },
  299 |         access: session.access,
  300 |         subscription: {
  301 |           status: 'local-mock',
  302 |           plan: 'unlimited',
  303 |           cancelAtPeriodEnd: false,
  304 |           currentPeriodEnd: null,
  305 |           billingAvailable: false,
  306 |         },
  307 |         offers: [
  308 |           { id: 'practice', name: 'Practice', description: 'Test coverage', price: null, currency: null },
  309 |         ],
  310 |       },
  311 |     }),
  312 |   );
  313 |   await page.goto('/#account');
  314 |   await expect(page.getByRole('heading', { name: 'Account and subscription' })).toBeVisible();
  315 |   await expect(page.getByRole('button', { name: 'Cancel renewal' })).toBeVisible();
  316 |   await expect(page.getByText('Turn your phone')).toHaveCount(0);
  317 | });
  318 |
  319 | test('late refresh cannot overwrite a newly accepted game', async ({ page }) => {
  320 |   let release: (() => void) | undefined;
  321 |   let reads = 0;
  322 |   const initial = fixture();
  323 |   initial.game.turn = 1;
  324 |   initial.game.legalActions = [];
  325 |   const next = fixture();
  326 |   next.game.id = 'new-game';
  327 |   next.game.mode = 'hearts';
  328 |   next.decisionId = 'new-game-decision';
  329 |   let active = initial;
  330 |   await page.route(
  331 |     (url) => url.pathname.startsWith('/api/'),
  332 |     async (route) => {
  333 |       if (new URL(route.request().url()).pathname === '/api/account')
  334 |         return route.fulfill({ json: accountFixture(active) });
  335 |       if (new URL(route.request().url()).pathname === '/api/identity')
  336 |         return route.fulfill({ json: { playerId: '11111111-1111-4111-8111-111111111111' } });
  337 |       if (new URL(route.request().url()).pathname === '/api/sessions') {
  338 |         active = next;
  339 |         return route.fulfill({ json: next });
  340 |       }
  341 |       if (new URL(route.request().url()).pathname === '/api/dev/scenarios')
  342 |         return route.fulfill({ json: { scenarios: [] } });
  343 |       reads++;
  344 |       if (reads === 3) {
  345 |         await new Promise<void>((resolve) => {
  346 |           release = resolve;
  347 |         });
  348 |         return route.fulfill({ json: initial });
  349 |       }
  350 |       return route.fulfill({ json: active });
  351 |     },
  352 |   );
  353 |   await page.goto('/');
  354 |   await page.getByRole('button', { name: 'Resume', exact: true }).click();
  355 |   await expect.poll(() => reads).toBe(3);
  356 |   await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  357 |   await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  358 |   await page
  359 |     .locator('.game-option')
  360 |     .filter({ has: page.locator('.game-art-hearts') })
  361 |     .click();
  362 |   await expect(page.locator('.game-switch')).toContainText('Hearts');
  363 |   release?.();
  364 |   await page.waitForTimeout(250);
  365 |   await expect(page.locator('.game-switch')).toContainText('Hearts');
  366 | });
  367 |
  368 | test('new game wizard saves pace and starts from the chosen card', async ({ page }, testInfo) => {
  369 |   const initial = fixture();
  370 |   const harness = await mount(page, initial);
  371 |   const requests: unknown[] = [];
  372 |   await page.route('**/api/preferences', (route) => {
  373 |     const body = route.request().postDataJSON() as { preferences: SessionView['preferences'] };
  374 |     requests.push(body);
  375 |     const updated = { ...initial, preferences: body.preferences };
  376 |     harness.setState(updated);
  377 |     return route.fulfill({ json: updated });
  378 |   });
  379 |   await page.route('**/api/sessions', (route) => {
  380 |     requests.push(route.request().postDataJSON());
  381 |     const next = fixture();
  382 |     next.game.mode = 'hearts';
  383 |     next.game.id = 'wizard-game';
  384 |     next.preferences.gameSpeed = 1.2;
```