# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: table.spec.ts >> in-place review owner switch removes old choices, frames and advice before another trial
- Location: web\e2e\table.spec.ts:533:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('.review-evidence')
Expected: 0
Received: 1
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" locator('.review-evidence') with timeout 5000ms
  - waiting for locator('.review-evidence')
    14 × locator resolved to 1 element
       - unexpected value "1"

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [aria-hidden] [ref=e3]:
    - banner [ref=e4]:
      - link [ref=e5] [cursor=pointer]:
        - /url: "#"
        - generic [ref=e6]: CardFord
      - button [ref=e7] [cursor=pointer]:
        - generic [ref=e8]: ♠
        - generic [ref=e9]: Spades
        - generic [ref=e10]: Partners
      - navigation [ref=e13]:
        - link [ref=e14] [cursor=pointer]:
          - /url: "#account"
          - text: ◎
        - button [ref=e15] [cursor=pointer]
        - button [ref=e19] [cursor=pointer]
        - button [ref=e23] [cursor=pointer]
    - main [ref=e27]:
      - generic [ref=e28]:
        - region [ref=e31]:
          - generic [ref=e32]: CardFord
          - generic [ref=e35]:
            - generic [ref=e36]: L
            - generic [ref=e38]:
              - generic [ref=e39]: Leo
              - generic [ref=e40]:
                - generic [aria-hidden] [ref=e41]: 0 / 2
                - generic [ref=e42]: 0 tricks, bid 2
          - generic [ref=e43]:
            - generic [ref=e44]: M
            - generic [ref=e49]:
              - generic [ref=e50]:
                - text: Maya
                - generic [ref=e51]: Partner
              - generic [ref=e52]:
                - generic [aria-hidden] [ref=e53]: 0 / 3
                - generic [ref=e54]: 0 tricks, bid 3
          - generic [ref=e55]:
            - generic [ref=e56]: T
            - generic [ref=e58]:
              - generic [ref=e59]: Theo
              - generic [ref=e60]:
                - generic [aria-hidden] [ref=e61]: 0 / 2
                - generic [ref=e62]: 0 tricks, bid 2
        - complementary [ref=e72]:
          - generic [ref=e73]:
            - heading [level=2] [ref=e78]: Coach
            - button [ref=e79] [cursor=pointer]
          - button [ref=e85] [cursor=pointer]: Give me a cue
      - region [ref=e95]:
        - generic [ref=e96]:
          - generic [ref=e97]:
            - generic [ref=e98]: "Y"
            - generic [ref=e99]: You
            - generic [ref=e100]:
              - generic [aria-hidden] [ref=e101]: 0 / 3
              - generic [ref=e102]: 0 tricks, bid 3
          - status [ref=e104]: Your turn
        - generic [ref=e105]:
          - button [disabled] [ref=e106]:
            - generic [ref=e107]:
              - generic [ref=e108]:
                - generic [ref=e109]: "2"
                - generic [ref=e110]: ♣
              - generic [ref=e111]: ♣
              - generic [ref=e112]:
                - generic [ref=e113]: "2"
                - generic [ref=e114]: ♣
          - button [disabled] [ref=e115]:
            - generic [ref=e116]:
              - generic [ref=e117]:
                - generic [ref=e118]: "3"
                - generic [ref=e119]: ♦
              - generic [ref=e120]: ♦
              - generic [ref=e121]:
                - generic [ref=e122]: "3"
                - generic [ref=e123]: ♦
          - button [disabled] [ref=e124]:
            - generic [ref=e125]:
              - generic [ref=e126]:
                - generic [ref=e127]: "4"
                - generic [ref=e128]: ♥
              - generic [ref=e129]: ♥
              - generic [ref=e130]:
                - generic [ref=e131]: "4"
                - generic [ref=e132]: ♥
          - button [disabled] [ref=e133]:
            - generic [ref=e134]:
              - generic [ref=e135]:
                - generic [ref=e136]: "5"
                - generic [ref=e137]: ♠
              - generic [ref=e138]: ♠
              - generic [ref=e139]:
                - generic [ref=e140]: "5"
                - generic [ref=e141]: ♠
        - generic [ref=e142]: "Double-click or double-tap to play on your turn, or prepare a card while waiting. A prepared card never plays automatically. Keyboard: Space selects, Enter plays. Confirm three-card passes separately."
    - generic: Local test access · no payment
  - dialog "Review current game" [ref=e144]:
    - banner [ref=e145]:
      - heading "Review current game" [level=2] [ref=e146]
      - button "Close dialog" [ref=e147] [cursor=pointer]
    - generic [ref=e151]:
      - alert [ref=e152]: The signed-in player changed. Reopen review before continuing.
      - generic [ref=e153]:
        - text: Hand
        - combobox "Hand" [ref=e154]:
          - option "All hands" [selected]
          - option "1"
      - 'button "Hand 1: Owner A decision" [ref=e156] [cursor=pointer]'
      - generic [ref=e157]:
        - heading "Original" [level=3] [ref=e158]
        - paragraph [ref=e159]: Hand 1
        - heading "What you knew" [level=4] [ref=e160]
        - paragraph [ref=e161]: "Your cards: 2 of clubs, 3 of diamonds, 4 of hearts, 5 of spades"
        - paragraph [ref=e162]: "Visible trick: No cards played"
        - region "Original coach advice" [ref=e163]:
          - heading "Advice at your decision" [level=4] [ref=e164]
          - paragraph [ref=e165]: "Owner A advice: Old private advice."
          - paragraph [ref=e166]: Original recorded reason.
          - paragraph [ref=e167]: Original recorded suggestion.
        - generic [ref=e168]:
          - button "Previous" [disabled] [ref=e169]
          - generic [ref=e170]: 1 / 1
          - button "Next" [disabled] [ref=e171]
        - group [ref=e172]:
          - generic "Explore another card" [ref=e173] [cursor=pointer]
          - generic [ref=e174]:
            - button "2 of clubs" [ref=e175] [cursor=pointer]
            - button "3 of diamonds" [ref=e176] [cursor=pointer]
            - button "4 of hearts" [ref=e177] [cursor=pointer]
            - button "5 of spades" [ref=e178] [cursor=pointer]
```

# Test source

```ts
  464 |   expect(bodies).toHaveLength(1);
  465 | });
  466 |
  467 | test('a different signed-in owner discards a pending command instead of replaying it', async ({ page }) => {
  468 |   await mount(page);
  469 |   const bodies: Record<string, unknown>[] = [];
  470 |   await page.route('**/api/session/actions', (route) => {
  471 |     bodies.push(route.request().postDataJSON());
  472 |     return route.abort('failed');
  473 |   });
  474 |   await page.getByRole('button', { name: '2 of clubs', exact: true }).dblclick();
  475 |   await expect(page.getByRole('alert')).toBeVisible();
  476 |   await page.route('**/api/account', (route) =>
  477 |     route.fulfill({ json: accountFixture(fixture(), '22222222-2222-4222-8222-222222222222') }),
  478 |   );
  479 |   await page.reload();
  480 |   await page.getByRole('button', { name: 'Resume', exact: true }).click();
  481 |   await expect(page.getByRole('alert')).toHaveCount(0);
  482 |   expect(bodies).toHaveLength(1);
  483 |   await page.getByRole('button', { name: '2 of clubs', exact: true }).dblclick();
  484 |   await expect.poll(() => bodies.length).toBe(2);
  485 |   expect(bodies[1].commandId).not.toEqual(bodies[0].commandId);
  486 | });
  487 |
  488 | test('in-place owner switch removes the prior table and fences a late refresh before preferences can resume', async ({ page }) => {
  489 |   const harness = await mount(page);
  490 |   const old = fixture();
  491 |   const next = fixture();
  492 |   next.game.id = 'owner-b-game';
  493 |   next.game.hand = ['CA', 'DA', 'HA', 'SA'];
  494 |   next.game.legalActions = next.game.hand.map(card => ({ kind: 'play', card }));
  495 |   next.preferences = { coachMode: 'after', gameSpeed: 1.4 };
  496 |   const preferences: unknown[] = [];
  497 |   let release: (() => void) | undefined;
  498 |   let delayed = false;
  499 |   await page.route('**/api/preferences', route => {
  500 |     preferences.push(route.request().postDataJSON());
  501 |     return route.fulfill({ json: next });
  502 |   });
  503 |   await page.route('**/api/session', async route => {
  504 |     if (!delayed) {
  505 |       delayed = true;
  506 |       await new Promise<void>(resolve => { release = resolve; });
  507 |       return route.fulfill({ json: old });
  508 |     }
  509 |     return route.fulfill({ json: next });
  510 |   });
  511 |   await page.getByRole('button', { name: 'Settings', exact: true }).click();
  512 |   await page.getByRole('button', { name: 'Done', exact: true }).click();
  513 |   await expect.poll(() => delayed).toBe(true);
  514 |   await page.route('**/api/account', route => route.fulfill({ json: accountFixture(next, '22222222-2222-4222-8222-222222222222') }));
  515 |   await page.route('**/api/identity', route => route.fulfill({ json: { playerId: '22222222-2222-4222-8222-222222222222' } }));
  516 |   harness.setState(next);
  517 |   await page.getByRole('button', { name: 'Occasional cues', exact: true }).click();
  518 |   await expect(page.locator('.hand-card')).toHaveCount(0);
  519 |   release?.();
  520 |   await expect(page.getByRole('status')).toContainText('signed-in player changed');
  521 |   await expect(page.locator('.hand-card')).toHaveCount(0);
  522 |   expect(preferences).toHaveLength(0);
  523 |   await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
  524 |   await page.getByRole('button', { name: 'Resume', exact: true }).click();
  525 |   await expect(page.getByRole('button', { name: 'Ace of clubs', exact: true })).toBeVisible();
  526 |   await expect(page.getByRole('button', { name: '2 of clubs', exact: true })).toHaveCount(0);
  527 |   await page.getByRole('button', { name: 'Settings', exact: true }).click();
  528 |   await page.getByRole('button', { name: 'Occasional cues', exact: true }).click();
  529 |   await expect.poll(() => preferences.length).toBe(1);
  530 |   expect(preferences[0]).toMatchObject({ preferences: { coachMode: 'nudges', gameSpeed: 1.4 } });
  531 | });
  532 |
  533 | test('in-place review owner switch removes old choices, frames and advice before another trial', async ({ page }) => {
  534 |   const value = fixture();
  535 |   await mount(page, value);
  536 |   await page.route('**/api/session/reviews?scope=match', route => route.fulfill({ json: { cases: [{
  537 |     decisionId: 'owner-a-record', handNumber: 1, action: { kind: 'play', card: 'C2' }, assisted: false,
  538 |     status: 'not-assessed', summary: 'Owner A decision',
  539 |   }] } }));
  540 |   await page.route('**/api/session/reviews/owner-a-record?step=0', route => route.fulfill({ json: {
  541 |     decisionId: 'owner-a-record', label: 'Original', liveRevision: value.revision,
  542 |     frames: [{ game: value.game, action: null, decisionId: 'owner-a-record', notes: [] }],
  543 |   } }));
  544 |   await page.route('**/api/coaching/access?*', route => route.fulfill({ json: value.access }));
  545 |   await page.route('**/api/coaching/hand-unlocks', route => route.fulfill({ json: {
  546 |     access: value.access, advice: {
  547 |       focus: 'Owner A advice', notice: 'Old private advice.', reason: 'Original recorded reason.',
  548 |       suggestion: 'Original recorded suggestion.', source: 'code', decisionId: 'owner-a-record', requestedLevel: 3,
  549 |     },
  550 |   } }));
  551 |   const trials: unknown[] = [];
  552 |   await page.route('**/api/session/reviews/owner-a-record/trials', route => {
  553 |     trials.push(route.request().postDataJSON());
  554 |     return route.abort();
  555 |   });
  556 |   await page.getByRole('button', { name: 'Review current game', exact: true }).click();
  557 |   await page.getByRole('button', { name: 'Hand 1: Owner A decision', exact: true }).click();
  558 |   await page.getByRole('button', { name: 'Show original coach advice', exact: true }).click();
  559 |   await expect(page.getByText('Old private advice.', { exact: false })).toBeVisible();
  560 |   await page.route('**/api/account', route => route.fulfill({ json: accountFixture(value, '22222222-2222-4222-8222-222222222222') }));
  561 |   await page.route('**/api/identity', route => route.fulfill({ json: { playerId: '22222222-2222-4222-8222-222222222222' } }));
  562 |   await page.getByText('Explore another card', { exact: true }).click();
  563 |   await page.locator('.review-alternatives').getByRole('button', { name: '3 of diamonds', exact: true }).click();
> 564 |   await expect(page.locator('.review-evidence')).toHaveCount(0);
      |                                                  ^ Error: expect(locator).toHaveCount(expected) failed
  565 |   await expect(page.getByText('Old private advice.', { exact: false })).toHaveCount(0);
  566 |   await expect(page.getByRole('button', { name: 'Hand 1: Owner A decision', exact: true })).toHaveCount(0);
  567 |   expect(trials).toHaveLength(0);
  568 | });
  569 |
  570 | test('queued review retry and lost-response reload recover the same trial and command', async ({ page }) => {
  571 |   const value = fixture();
  572 |   await mount(page, value);
  573 |   await page.route('**/api/session/reviews?scope=match', (route) =>
  574 |     route.fulfill({
  575 |       json: {
  576 |         cases: [
  577 |           {
  578 |             decisionId: 'record-retry',
  579 |             handNumber: 1,
  580 |             action: { kind: 'play', card: 'C2' },
  581 |             assisted: false,
  582 |             status: 'not-assessed',
  583 |             summary: 'Retry decision',
  584 |           },
  585 |         ],
  586 |       },
  587 |     }),
  588 |   );
  589 |   await page.route('**/api/session/reviews/record-retry?step=0', (route) =>
  590 |     route.fulfill({
  591 |       json: {
  592 |         decisionId: 'record-retry',
  593 |         label: 'Original',
  594 |         liveRevision: value.revision,
  595 |         frames: [
  596 |           { game: value.game, action: { kind: 'play', card: 'C2' }, decisionId: 'record-retry', notes: [] },
  597 |         ],
  598 |       },
  599 |     }),
  600 |   );
  601 |   await page.route('**/api/coaching/access?*', (route) => route.fulfill({ json: value.access }));
  602 |   const bodies: Record<string, unknown>[] = [];
  603 |   let ready = false;
  604 |   await page.route('**/api/session/reviews/record-retry/trials', (route) => {
  605 |     bodies.push(route.request().postDataJSON());
  606 |     if (bodies.length === 1)
  607 |       return route.fulfill({
  608 |         status: 503,
  609 |         json: {
  610 |           code: 'SERVICE_UNAVAILABLE',
  611 |           message: 'This continuation is still being prepared. Retry the same request.',
  612 |         },
  613 |       });
  614 |     ready = true;
  615 |     return route.abort('failed');
  616 |   });
  617 |   await page.route('**/api/review-trials/*', (route) =>
  618 |     ready
  619 |       ? route.fulfill({
  620 |           json: {
  621 |             trialId: bodies[0].trialId,
  622 |             decisionId: 'record-retry',
  623 |             label: 'Possible continuation',
  624 |             liveRevision: value.revision,
  625 |             frames: [
  626 |               { game: value.game, action: null, decisionId: 'record-retry', notes: ['Same sampled branch.'] },
  627 |             ],
  628 |           },
  629 |         })
  630 |       : route.fulfill({ status: 404, json: { code: 'NOT_FOUND', message: 'Not ready.' } }),
  631 |   );
  632 |   await page.getByRole('button', { name: 'Review current game', exact: true }).click();
  633 |   await page.getByRole('button', { name: 'Hand 1: Retry decision', exact: true }).click();
  634 |   await page.getByText('Explore another card', { exact: true }).click();
  635 |   await page
  636 |     .locator('.review-alternatives')
  637 |     .getByRole('button', { name: '3 of diamonds', exact: true })
  638 |     .click();
  639 |   await expect(page.getByRole('button', { name: 'Retry same continuation', exact: true })).toBeVisible();
  640 |   await page.getByRole('button', { name: 'Retry same continuation', exact: true }).click();
  641 |   await expect.poll(() => bodies.length).toBe(2);
  642 |   expect(bodies[1]).toEqual(bodies[0]);
  643 |   await page.reload();
  644 |   await page.getByRole('button', { name: 'Resume', exact: true }).click();
  645 |   await page.getByRole('button', { name: 'Review current game', exact: true }).click();
  646 |   await page.getByRole('button', { name: 'Retry same continuation', exact: true }).click();
  647 |   await expect(page.getByRole('heading', { name: 'Possible continuation', exact: true })).toBeVisible();
  648 |   expect(bodies).toHaveLength(2);
  649 | });
  650 |
  651 | test('selected deals stage locally, restrict the game and label the resulting table', async ({
  652 |   page,
  653 | }, testInfo) => {
  654 |   const scenario: DevScenarioView = {
  655 |     id: 'partners-opening-a',
  656 |     version: '1.0.0',
  657 |     label: 'Opening A',
  658 |     mode: 'spades-partners',
  659 |   };
  660 |   const initial = fixture();
  661 |   const controls = await mount(page, initial, [scenario]);
  662 |   const requests: Record<string, unknown>[] = [];
  663 |   await page.route('**/api/sessions', (route) => {
  664 |     requests.push(route.request().postDataJSON());
```