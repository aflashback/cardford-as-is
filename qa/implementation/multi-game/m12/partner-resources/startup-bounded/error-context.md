# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: platform-go.spec.ts >> actual Go spades-partners: full hand, saved advice, review alternative and next hand
- Location: web\e2e\platform-go.spec.ts:71:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Possible continuation', exact: true })
Expected: visible
Timeout: 60000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('heading', { name: 'Possible continuation', exact: true }) with timeout 60000ms
  - waiting for getByRole('heading', { name: 'Possible continuation', exact: true })

```

```yaml
- dialog "Review current game":
  - banner:
    - heading "Review current game" [level=2]
    - button "Close dialog":
      - img
  - alert: Continuation stopped. Retry the same continuation when ready.
  - button "Retry same continuation"
  - text: Hand
  - combobox "Hand":
    - option "All hands" [selected]
    - option "1"
  - 'button "Hand 1: Your decision and the information available then."'
  - 'button "Hand 1: Your decision and the information available then. · help issued"'
  - 'button "Hand 1: Your decision and the information available then."'
  - 'button "Hand 1: Your decision and the information available then."'
  - 'button "Hand 1: Your decision and the information available then."'
  - 'button "Hand 1: Your decision and the information available then."'
  - 'button "Hand 1: Your decision and the information available then."'
  - 'button "Hand 1: Your decision and the information available then."'
  - 'button "Hand 1: Your decision and the information available then."'
  - 'button "Hand 1: Your decision and the information available then."'
  - 'button "Hand 1: Your decision and the information available then."'
  - 'button "Hand 1: Your decision and the information available then."'
  - 'button "Hand 1: Your decision and the information available then."'
  - 'button "Hand 1: Your decision and the information available then."'
  - heading "Original" [level=3]
  - paragraph: Hand 1
  - heading "What you knew" [level=4]
  - paragraph: "Your cards: 2 of clubs, 3 of clubs, 4 of clubs, 6 of clubs, 9 of clubs, Ace of clubs, 2 of diamonds, 10 of diamonds, 6 of hearts, 9 of hearts, 5 of spades, 9 of spades, 10 of spades"
  - paragraph: "Visible trick: Seat 1: 4 of diamonds; Seat 2: 6 of diamonds; Seat 3: 7 of diamonds"
  - region "Original coach advice":
    - heading "Advice at your decision" [level=4]
    - paragraph: "Your team contract: 5 credited tricks are still needed."
    - paragraph: This takes the current lead toward the contract. Prefer an economical winner while retaining stronger control for later tricks. You play fourth, so the winner after your card is exact.
    - paragraph: Consider 10 of Diamonds for the current lead.
  - button "Previous" [disabled]
  - text: 1 / 63
  - button "Next"
  - group:
    - text: Explore another card
    - button "2 of diamonds"
    - button "10 of diamonds"
```

# Test source

```ts
  62  |     .poll(async () => (await current(page)).session!.presentation.hand.length, { timeout: 30_000 })
  63  |     .toBe(before.presentation.hand.length - 1);
  64  | }
  65  | async function resumeIfPaused(page: Page) {
  66  |   const resume = page.getByRole('button', { name: 'Resume', exact: true });
  67  |   if (await resume.isVisible()) await resume.click();
  68  | }
  69  | 
  70  | for (const mode of ['hearts', 'spades-solo', 'spades-partners'] as const) {
  71  |   test(`actual Go ${mode}: full hand, saved advice, review alternative and next hand`, async ({ page }) => {
  72  |     const errors: string[] = [];
  73  |     page.on('pageerror', (error) => errors.push(error.message));
  74  |     await open(page);
  75  |     await choose(page, mode);
  76  |     if (mode === 'hearts') {
  77  |       await expect(page.getByRole('heading', { name: 'Pass three cards left' })).toBeVisible();
  78  |       for (let n = 0; n < 3; n++) await page.locator('.hand-card').nth(n).click();
  79  |       await page.getByRole('button', { name: 'Pass 3 of 3', exact: true }).click();
  80  |       await expect.poll(async () => (await current(page)).session!.presentation.received.length).toBe(3);
  81  |     } else {
  82  |       await expect(page.getByRole('button', { name: 'Bid 3', exact: true })).toBeEnabled({ timeout: 30_000 });
  83  |       await page.getByRole('button', { name: 'Bid 3', exact: true }).click();
  84  |       await expect.poll(async () => (await current(page)).session!.presentation.bids[0]).toBe(3);
  85  |     }
  86  |     await waitHuman(page);
  87  |     // A forced opening C2 is deliberately excluded from assistance statistics.
  88  |     // Exercise coaching on a real choice, retaining the original count rule.
  89  |     for (let forced = 0; forced < 13; forced++) {
  90  |       const position = (await current(page)).session!;
  91  |       if (position.presentation.legalActions.length > 1) break;
  92  |       await playCard(page);
  93  |       await waitHuman(page);
  94  |     }
  95  |     const hintedPosition = (await current(page)).session!;
  96  |     expect(hintedPosition.presentation.legalActions.length).toBeGreaterThan(1);
  97  |     const hintedIndex = 1 + 13 - hintedPosition.presentation.hand.length;
  98  |     await page.getByRole('button', { name: 'Give me a cue', exact: true }).click();
  99  |     const unlock = page.getByRole('button', { name: 'Use coached hand', exact: true });
  100 |     await expect
  101 |       .poll(async () => (await unlock.isVisible()) || (await page.locator('.hint-stage').isVisible()))
  102 |       .toBe(true);
  103 |     if (await unlock.isVisible()) await unlock.click();
  104 |     await expect(page.locator('.hint-stage')).toContainText('Notice', { timeout: 30_000 });
  105 |     await page.getByRole('button', { name: 'More context', exact: true }).click();
  106 |     await expect(page.locator('.hint-stage')).toContainText('Consider');
  107 |     await page.getByRole('button', { name: 'Suggest a move', exact: true }).click();
  108 |     await expect(page.locator('.hint-stage')).toContainText('A suggestion');
  109 |     expect((await current(page)).session!.access.handUnlocked).toBe(true);
  110 |     await playCard(page);
  111 | 
  112 |     // Foreground and reload must revalidate the saved table without advancing
  113 |     // a paused game, and the original tab's retained lease remains usable.
  114 |     await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  115 |     const paused = (await current(page)).session!;
  116 |     await page.reload();
  117 |     await expect(page.getByRole('dialog', { name: 'Paused', exact: true })).toBeVisible();
  118 |     expect((await current(page)).session!.revision).toBe(paused.revision);
  119 |     await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  120 |     await expect.poll(async () => (await current(page)).session!.revision).toBe(paused.revision);
  121 |     await resumeIfPaused(page);
  122 |     for (let n = hintedPosition.presentation.hand.length - 1; n > 0; n--) await playCard(page);
  123 |     await expect
  124 |       .poll(async () => (await current(page)).session!.presentation.phase, { timeout: 30_000 })
  125 |       .toBe('hand-end');
  126 |     const completed = (await current(page)).session!;
  127 |     expect(completed.presentation.handCounts).toEqual([0, 0, 0, 0]);
  128 |     expect(completed.presentation.history).toHaveLength(13);
  129 |     expect(new Set(completed.presentation.history.flatMap((t) => t.plays.map((p) => p.card))).size).toBe(52);
  130 |     expect(completed.stats.helped).toBeGreaterThan(0);
  131 |     await expect(page.getByRole('dialog', { name: 'Hand 1 results', exact: true })).toBeVisible();
  132 |     await page.getByRole('button', { name: 'Back to table', exact: true }).click();
  133 |     await page.getByRole('button', { name: 'Review current game', exact: true }).click();
  134 |     const choices = page.locator('.review-choices button');
  135 |     await expect(choices).toHaveCount(14);
  136 |     // First source is pass/bid; the next is the original human card decision.
  137 |     await choices.nth(hintedIndex).click();
  138 |     await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible();
  139 |     const saved = page.getByRole('region', { name: 'Original coach advice', exact: true });
  140 |     const reveal = page.getByRole('button', { name: 'Show original coach advice', exact: true });
  141 |     // Source access arrives after the replay frame. Wait for the actual
  142 |     // reveal control instead of sampling visibility before that read finishes.
  143 |     await reveal.click();
  144 |     if (await unlock.isVisible()) await unlock.click();
  145 |     await expect(saved.getByRole('heading', { name: 'Advice at your decision', exact: true })).toBeVisible({
  146 |       timeout: 30_000,
  147 |     });
  148 |     // A random first turn can be forced. Find a source with multiple legal
  149 |     // cards before asking the registered continuation job to try another card.
  150 |     let alternatives = 0;
  151 |     for (let source = 1; source < 14; source++) {
  152 |       if (source > 1) await choices.nth(source).click();
  153 |       const explore = page.getByText('Explore another card', { exact: true });
  154 |       await expect(explore).toBeVisible();
  155 |       await explore.click();
  156 |       alternatives = await page.locator('.review-alternatives button').count();
  157 |       if (alternatives > 1) break;
  158 |     }
  159 |     expect(alternatives).toBeGreaterThan(1);
  160 |     await page.locator('.review-alternatives button').last().click();
  161 |     if (await unlock.isVisible()) await unlock.click();
> 162 |     await expect(page.getByRole('heading', { name: 'Possible continuation', exact: true })).toBeVisible({
      |                                                                                             ^ Error: expect(locator).toBeVisible() failed
  163 |       timeout: 60_000,
  164 |     });
  165 |     expect((await current(page)).session!.revision).toBe(completed.revision);
  166 |     await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  167 |     await page.getByRole('button', { name: 'Play again', exact: true }).click();
  168 |     await expect
  169 |       .poll(async () => (await current(page)).session!.presentation.handNumber, { timeout: 30_000 })
  170 |       .toBe(2);
  171 |     const next = (await current(page)).session!;
  172 |     expect(next.gameId).toBe(completed.gameId);
  173 |     expect(next.presentation.hand).toHaveLength(13);
  174 |     expect(next.presentation.scores).toEqual(completed.presentation.scores);
  175 |     expect(next.revision).toBeGreaterThan(completed.revision);
  176 |     const exported = await page.evaluate(async () => {
  177 |       const response = await fetch('/api/account/export', {
  178 |         credentials: 'same-origin',
  179 |         headers: { 'x-tricks-tab': sessionStorage.getItem('tricks-tab') ?? '' },
  180 |       });
  181 |       if (!response.ok) throw new Error(`Export HTTP ${response.status}`);
  182 |       return response.json();
  183 |     });
  184 |     expect(validateContract('PlatformExportView', exported)).toBe(true);
  185 |     expect(exported.games.some((game: any) => game.id === completed.gameId)).toBe(true);
  186 |     expect(exported.decisions.length).toBeGreaterThan(0);
  187 |     for (const decision of exported.decisions) expect(decision.packetVersion).toBe('2.0.0');
  188 |     if (mode === 'spades-partners' && process.env.CARDFORD_REASONING_PROFILE === 'partner-resources') {
  189 |       const currentDecisions = exported.decisions.filter((decision: any) => decision.gameId === completed.gameId);
  190 |       expect(currentDecisions.length).toBeGreaterThan(0);
  191 |       for (const decision of currentDecisions) expect(decision.policy.version).toBe('spades-partner-resource-5.0.0');
  192 |     }
  193 |     if (process.env.CARDFORD_REASONING_PROFILE === 'actor-rollout') {
  194 |       const currentDecisions = exported.decisions.filter((decision: any) => decision.gameId === completed.gameId);
  195 |       expect(currentDecisions.length).toBeGreaterThan(0);
  196 |       for (const decision of currentDecisions) expect(decision.policy.version).toBe('actor-rollout-2.0.0');
  197 |     }
  198 |     expect(errors).toEqual([]);
  199 |     await mkdir(evidence, { recursive: true });
  200 |     await page.screenshot({ path: `${evidence}/${mode}-next-hand.png` });
  201 |   });
  202 | }
  203 | 
  204 | test('actual Go account: lost accepted billing reply, same receipt recovery, export and portrait deletion', async ({
  205 |   page,
  206 | }) => {
  207 |   await page.goto(`${origin}/#account`);
  208 |   const id = page.getByLabel('Local account ID', { exact: true });
  209 |   await expect(id).toHaveValue(/^[a-f0-9]{48}$/);
  210 |   const owner = await id.inputValue();
  211 |   await page.getByRole('button', { name: 'Cancel renewal', exact: true }).click();
  212 |   let accepted: unknown;
  213 |   await page.route(
  214 |     '**/api/subscription/change',
  215 |     async (route) => {
  216 |       // Forward to Go, keep its exact accepted body, then lose only the reply.
  217 |       const response = await route.fetch();
  218 |       expect(response.status()).toBe(200);
  219 |       accepted = await response.json();
  220 |       await route.abort('connectionreset');
  221 |     },
  222 |     { times: 1 },
  223 |   );
  224 |   await page.getByRole('button', { name: 'Confirm test change', exact: true }).click();
  225 |   const pendingPreview = page.getByRole('region', { name: 'Confirm subscription change', exact: true });
  226 |   await expect(pendingPreview.getByRole('button', { name: 'Retry same change', exact: true })).toBeVisible();
  227 |   // The retry label appears when intent is saved, before the original HTTP
  228 |   // response arrives. Wait for the lost-reply attempt to settle first.
  229 |   await expect(pendingPreview.getByRole('button', { name: 'Retry same change', exact: true })).toBeEnabled();
  230 |   expect(validateContract('BillingOperation', accepted)).toBe(true);
  231 |   await page.reload();
  232 |   await expect(page.getByRole('button', { name: 'Retry same change', exact: true })).toBeVisible();
  233 |   const receipt = page.waitForResponse(
  234 |     (r) => r.url().endsWith('/api/platform/commands/reconcile') && r.status() === 200,
  235 |   );
  236 |   await page.getByRole('button', { name: 'Retry same change', exact: true }).click();
  237 |   expect((await (await receipt).json()).receipt).toEqual(accepted);
  238 |   await expect(page.getByRole('button', { name: 'Resume renewal', exact: true })).toBeVisible();
  239 |   expect(await id.inputValue()).toBe(owner);
  240 |   const persisted = await page.evaluate(() =>
  241 |     Object.entries(localStorage).filter(([k]) => k.startsWith('cardford-go-pending-v1:')),
  242 |   );
  243 |   expect(persisted).toEqual([]);
  244 |   await page.getByRole('button', { name: 'Resume renewal', exact: true }).click();
  245 |   await page.getByRole('button', { name: 'Confirm test change', exact: true }).click();
  246 |   await expect(page.getByRole('button', { name: 'Cancel renewal', exact: true })).toBeVisible();
  247 |   const download = page.waitForEvent('download');
  248 |   await page.getByRole('button', { name: 'Download my local data', exact: true }).click();
  249 |   const downloaded = await download;
  250 |   const exported = JSON.parse(await readFile((await downloaded.path())!, 'utf8')) as PlatformExportView;
  251 |   expect(validateContract('PlatformExportView', exported)).toBe(true);
  252 |   expect(exported.account.player.id).toBe(owner);
  253 |   expect(exported.account.preferences.preferences).toEqual({ coachMode: 'asked', gameSpeed: 1 });
  254 |   expect(exported.billing).toHaveLength(2);
  255 |   const raw = JSON.stringify(exported);
  256 |   for (const privateField of [
  257 |     'controlLeaseToken',
  258 |     'token_hash',
  259 |     'sealedCommitments',
  260 |     'privateDeal',
  261 |     'sessionHash',
  262 |   ])
```