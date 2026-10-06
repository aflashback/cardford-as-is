# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: table.spec.ts >> pending command still reconciles when identity verification fails during opening
- Location: web\e2e\table.spec.ts:496:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 2
Received: 1

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=f1e3]:
  - banner [ref=f1e4]:
    - link "CardFord choose game" [ref=f1e5] [cursor=pointer]:
      - /url: "#"
      - generic [ref=f1e6]: CardFord
    - button "Choose game" [ref=f1e7] [cursor=pointer]:
      - generic [ref=f1e8]: ♠
      - generic [ref=f1e9]: Spades
      - generic [ref=f1e10]: Partners
    - navigation "Table controls" [ref=f1e13]:
      - link "Account" [ref=f1e14] [cursor=pointer]:
        - /url: "#account"
        - text: ◎
      - button "Review current game" [ref=f1e15] [cursor=pointer]
      - button "Settings" [ref=f1e19] [cursor=pointer]
      - button "Pause game" [ref=f1e23] [cursor=pointer]
  - main [ref=f1e27]:
    - generic [ref=f1e28]:
      - region "Card table" [ref=f1e31]:
        - generic [ref=f1e32]: CardFord
        - generic [ref=f1e35]:
          - generic [ref=f1e36]: L
          - generic [ref=f1e38]:
            - generic [ref=f1e39]: Leo
            - generic [ref=f1e40]:
              - generic [aria-hidden] [ref=f1e41]: 0 / 2
              - generic [ref=f1e42]: 0 tricks, bid 2
        - generic [ref=f1e43]:
          - generic [ref=f1e44]:
            - generic [ref=f1e45]: M
            - generic "Your partner" [ref=f1e46]
          - generic [ref=f1e49]:
            - generic [ref=f1e50]:
              - text: Maya
              - generic [ref=f1e51]: Partner
            - generic [ref=f1e52]:
              - generic [aria-hidden] [ref=f1e53]: 0 / 3
              - generic [ref=f1e54]: 0 tricks, bid 3
        - generic [ref=f1e55]:
          - generic [ref=f1e56]: T
          - generic [ref=f1e58]:
            - generic [ref=f1e59]: Theo
            - generic [ref=f1e60]:
              - generic [aria-hidden] [ref=f1e61]: 0 / 2
              - generic [ref=f1e62]: 0 tricks, bid 2
      - complementary "Your coach" [ref=f1e72]:
        - generic [ref=f1e73]:
          - heading "Coach" [level=2] [ref=f1e78]
          - button "Adjust coach" [ref=f1e79] [cursor=pointer]
        - button "Give me a cue" [ref=f1e85] [cursor=pointer]
    - region "Your hand" [ref=f1e95]:
      - generic [ref=f1e96]:
        - generic [ref=f1e97]:
          - generic [ref=f1e98]: "Y"
          - generic [ref=f1e99]: You
          - generic [ref=f1e100]:
            - generic [aria-hidden] [ref=f1e101]: 0 / 3
            - generic [ref=f1e102]: 0 tricks, bid 3
        - status [ref=f1e104]: Your turn
      - generic [ref=f1e105]:
        - button "3 of diamonds" [active] [pressed] [ref=f1e106] [cursor=pointer]:
          - generic [ref=f1e107]:
            - generic [ref=f1e108]:
              - generic [ref=f1e109]: "3"
              - generic [ref=f1e110]: ♦
            - generic [ref=f1e111]: ♦
            - generic [ref=f1e112]:
              - generic [ref=f1e113]: "3"
              - generic [ref=f1e114]: ♦
        - button "4 of hearts, unavailable this turn" [disabled] [ref=f1e118]:
          - generic [ref=f1e119]:
            - generic [ref=f1e120]:
              - generic [ref=f1e121]: "4"
              - generic [ref=f1e122]: ♥
            - generic [ref=f1e123]: ♥
            - generic [ref=f1e124]:
              - generic [ref=f1e125]: "4"
              - generic [ref=f1e126]: ♥
        - button "5 of spades, unavailable this turn" [disabled] [ref=f1e127]:
          - generic [ref=f1e128]:
            - generic [ref=f1e129]:
              - generic [ref=f1e130]: "5"
              - generic [ref=f1e131]: ♠
            - generic [ref=f1e132]: ♠
            - generic [ref=f1e133]:
              - generic [ref=f1e134]: "5"
              - generic [ref=f1e135]: ♠
      - generic [ref=f1e136]: "Double-click or double-tap to play on your turn, or prepare a card while waiting. A prepared card never plays automatically. Keyboard: Space selects, Enter plays. Confirm three-card passes separately."
  - generic: Local test access · no payment
```

# Test source

```ts
  439 |     const initial = fixture();
  440 |     initial.game.mode = mode;
  441 |     const harness = await mount(page, initial);
  442 |     const bodies: unknown[] = [];
  443 |     const next = structuredClone(initial);
  444 |     next.revision++;
  445 |     next.decisionId = 'after-accepted';
  446 |     next.game.hand = ['D3', 'H4', 'S5'];
  447 |     await page.route('**/api/session/actions', (route) => {
  448 |       bodies.push(route.request().postDataJSON());
  449 |       harness.setState(next);
  450 |       return route.abort('failed');
  451 |     });
  452 |     await page.route('**/api/commands/*', (route) => route.fulfill({ json: { status: 'accepted' } }));
  453 |     await page.getByRole('button', { name: '2 of clubs', exact: true }).dblclick();
  454 |     await expect(page.getByRole('alert')).toBeVisible();
  455 |     await page.reload();
  456 |     await expect(
  457 |       page.getByText('A previous request has an unconfirmed outcome.', { exact: false }),
  458 |     ).toBeVisible();
  459 |     await page.waitForTimeout(100);
  460 |     expect(bodies).toHaveLength(1);
  461 |     await page.getByRole('button', { name: 'Resume', exact: true }).click();
  462 |     await page.getByRole('button', { name: 'Retry', exact: true }).click();
  463 |     await expect(page.getByRole('alert')).toHaveCount(0);
  464 |     await expect(page.locator('.hand-card')).toHaveCount(3);
  465 |     expect(bodies).toHaveLength(1);
  466 |   });
  467 | }
  468 |
  469 | test('lost unaccepted new-game request survives reload and retries its original body', async ({ page }) => {
  470 |   const harness = await mount(page);
  471 |   const bodies: unknown[] = [];
  472 |   await page.route('**/api/sessions', (route) => {
  473 |     bodies.push(route.request().postDataJSON());
  474 |     if (bodies.length === 1) return route.abort('failed');
  475 |     const next = fixture();
  476 |     next.game.id = 'retried-new-game';
  477 |     next.game.mode = 'hearts';
  478 |     harness.setState(next);
  479 |     return route.fulfill({ json: next });
  480 |   });
  481 |   await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  482 |   await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  483 |   await page
  484 |     .locator('.game-option')
  485 |     .filter({ has: page.locator('.game-art-hearts') })
  486 |     .click();
  487 |   await expect(page.getByRole('alert')).toBeVisible();
  488 |   await page.reload();
  489 |   await page.getByRole('button', { name: 'Resume', exact: true }).click();
  490 |   await page.getByRole('button', { name: 'Retry', exact: true }).click();
  491 |   await expect(page.locator('.game-switch')).toContainText('Hearts');
  492 |   expect(bodies).toHaveLength(2);
  493 |   expect(bodies[1]).toEqual(bodies[0]);
  494 | });
  495 |
  496 | test('pending command still reconciles when identity verification fails during opening', async ({ page }) => {
  497 |   const harness = await mount(page);
  498 |   const bodies: unknown[] = [];
  499 |   const next = fixture();
  500 |   next.revision++;
  501 |   next.game.hand = ['D3', 'H4', 'S5'];
  502 |   next.game.legalActions = [{ kind: 'play', card: 'D3' }];
  503 |   await page.route('**/api/session/actions', (route) => {
  504 |     bodies.push(route.request().postDataJSON());
  505 |     if (bodies.length > 1) {
  506 |       const fresh = structuredClone(next);
  507 |       fresh.revision++;
  508 |       fresh.game.hand = ['H4', 'S5'];
  509 |       fresh.game.legalActions = [];
  510 |       harness.setState(fresh);
  511 |       return route.fulfill({ json: fresh });
  512 |     }
  513 |     harness.setState(next);
  514 |     return route.abort('failed');
  515 |   });
  516 |   await page.getByRole('button', { name: '2 of clubs', exact: true }).dblclick();
  517 |   await expect(page.getByRole('alert')).toBeVisible();
  518 |   await page.route('**/api/identity', (route) =>
  519 |     route.fulfill({
  520 |       status: 503,
  521 |       json: {
  522 |         code: 'SERVICE_UNAVAILABLE',
  523 |         message: 'Opening unavailable.',
  524 |       },
  525 |     }),
  526 |   );
  527 |   await page.reload();
  528 |   await expect(page.getByRole('status')).toHaveText('Opening unavailable.');
  529 |   await page.route('**/api/identity', (route) =>
  530 |     route.fulfill({ json: { playerId: '11111111-1111-4111-8111-111111111111' } }),
  531 |   );
  532 |   await page.route('**/api/commands/*', (route) => route.fulfill({ json: { status: 'accepted' } }));
  533 |   await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
  534 |   await page.getByRole('button', { name: 'Resume', exact: true }).click();
  535 |   await expect(page.locator('.hand-card')).toHaveCount(3);
  536 |   await expect(page.getByRole('alert')).toHaveCount(0);
  537 |   expect(bodies).toHaveLength(1);
  538 |   await page.getByRole('button', { name: '3 of diamonds', exact: true }).dblclick();
> 539 |   await expect.poll(() => bodies.length).toBe(2);
      |                                          ^ Error: expect(received).toBe(expected) // Object.is equality
  540 |   expect((bodies[1] as { commandId: string }).commandId).not.toBe(
  541 |     (bodies[0] as { commandId: string }).commandId,
  542 |   );
  543 |   await expect(page.locator('.hand-card')).toHaveCount(2);
  544 | });
  545 |
  546 | test('transport deadline frees the table and keeps a recoverable same-command retry', async ({ page }) => {
  547 |   await page.clock.install();
  548 |   await mount(page);
  549 |   const bodies: unknown[] = [];
  550 |   await page.route('**/api/session/actions', (route) => {
  551 |     bodies.push(route.request().postDataJSON());
  552 |   });
  553 |   await page.getByRole('button', { name: '2 of clubs', exact: true }).dblclick();
  554 |   await expect.poll(() => bodies.length).toBe(1);
  555 |   await page.clock.fastForward(15_001);
  556 |   await expect(page.getByRole('alert')).toContainText('outcome is unconfirmed');
  557 |   await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeEnabled();
  558 |   expect(bodies).toHaveLength(1);
  559 | });
  560 |
  561 | test('a different signed-in owner discards a pending command instead of replaying it', async ({ page }) => {
  562 |   await mount(page);
  563 |   const bodies: Record<string, unknown>[] = [];
  564 |   await page.route('**/api/session/actions', (route) => {
  565 |     bodies.push(route.request().postDataJSON());
  566 |     return route.abort('failed');
  567 |   });
  568 |   await page.getByRole('button', { name: '2 of clubs', exact: true }).dblclick();
  569 |   await expect(page.getByRole('alert')).toBeVisible();
  570 |   await page.route('**/api/account', (route) =>
  571 |     route.fulfill({ json: accountFixture(fixture(), '22222222-2222-4222-8222-222222222222') }),
  572 |   );
  573 |   await page.route('**/api/identity', (route) =>
  574 |     route.fulfill({ json: { playerId: '22222222-2222-4222-8222-222222222222' } }),
  575 |   );
  576 |   await page.reload();
  577 |   await page.getByRole('button', { name: 'Resume', exact: true }).click();
  578 |   await expect(page.getByRole('alert')).toHaveCount(0);
  579 |   expect(bodies).toHaveLength(1);
  580 |   await page.getByRole('button', { name: '2 of clubs', exact: true }).dblclick();
  581 |   await expect.poll(() => bodies.length).toBe(2);
  582 |   expect(bodies[1].commandId).not.toEqual(bodies[0].commandId);
  583 | });
  584 |
  585 | test('in-place owner switch removes the prior table and fences a late refresh before preferences can resume', async ({
  586 |   page,
  587 | }) => {
  588 |   const harness = await mount(page);
  589 |   const old = fixture();
  590 |   const next = fixture();
  591 |   next.game.id = 'owner-b-game';
  592 |   next.game.hand = ['CA', 'DA', 'HA', 'SA'];
  593 |   next.game.legalActions = next.game.hand.map((card) => ({ kind: 'play', card }));
  594 |   next.preferences = { coachMode: 'after', gameSpeed: 1.4 };
  595 |   const preferences: unknown[] = [];
  596 |   let release: (() => void) | undefined;
  597 |   let delayed = false;
  598 |   await page.route('**/api/preferences', (route) => {
  599 |     preferences.push(route.request().postDataJSON());
  600 |     return route.fulfill({ json: next });
  601 |   });
  602 |   await page.route('**/api/session', async (route) => {
  603 |     if (!delayed) {
  604 |       delayed = true;
  605 |       await new Promise<void>((resolve) => {
  606 |         release = resolve;
  607 |       });
  608 |       return route.fulfill({ json: old });
  609 |     }
  610 |     return route.fulfill({ json: next });
  611 |   });
  612 |   await page.getByRole('button', { name: 'Settings', exact: true }).click();
  613 |   await page.getByRole('button', { name: 'Done', exact: true }).click();
  614 |   await expect.poll(() => delayed).toBe(true);
  615 |   await page.route('**/api/account', (route) =>
  616 |     route.fulfill({ json: accountFixture(next, '22222222-2222-4222-8222-222222222222') }),
  617 |   );
  618 |   await page.route('**/api/identity', (route) =>
  619 |     route.fulfill({ json: { playerId: '22222222-2222-4222-8222-222222222222' } }),
  620 |   );
  621 |   harness.setState(next);
  622 |   await page.getByRole('button', { name: 'Occasional cues', exact: true }).click();
  623 |   await expect(page.locator('.hand-card')).toHaveCount(0);
  624 |   release?.();
  625 |   await expect(page.getByRole('status')).toContainText('signed-in player changed');
  626 |   await expect(page.locator('.hand-card')).toHaveCount(0);
  627 |   expect(preferences).toHaveLength(0);
  628 |   await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
  629 |   await page.getByRole('button', { name: 'Resume', exact: true }).click();
  630 |   await expect(page.getByRole('button', { name: 'Ace of clubs', exact: true })).toBeVisible();
  631 |   await expect(page.getByRole('button', { name: '2 of clubs', exact: true })).toHaveCount(0);
  632 |   await page.getByRole('button', { name: 'Settings', exact: true }).click();
  633 |   await page.getByRole('button', { name: 'Occasional cues', exact: true }).click();
  634 |   await expect.poll(() => preferences.length).toBe(1);
  635 |   expect(preferences[0]).toMatchObject({ preferences: { coachMode: 'nudges', gameSpeed: 1.4 } });
  636 | });
  637 |
  638 | test('in-place review owner switch removes old choices, frames and advice before another trial', async ({
  639 |   page,
```