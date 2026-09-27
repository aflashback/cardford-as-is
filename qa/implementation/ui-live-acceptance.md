# Local UI acceptance — 27 September 2026

## Result and scope

**Passed:** eight browser journeys against the actual PostgreSQL-backed local service, ten isolated browser cases using public response fixtures, two source-boundary checks, strict UI TypeScript and the production UI build. Tests used Node v24.19.0 and installed Chrome 153.0.8010.53 on Windows. No physical phone/tablet or screen reader was used.

The integrated service ran at `http://127.0.0.1:4173`. Identity was **local-test**, billing was **fixture**, bots/advice were **local code**, and Jev was **off**. Observed remote model ID: **none — no live provider request**. No real Stripe payment, hosted identity or public deployment was exercised.

UI implementation commits: `854dde6` (safe server table/demo), `0326178` (preview/family/recovery/fonts), `a4cbbd1` (account controls and live tests). Root integrated the UI before starting the final live suite. The root source checkpoint observed after that run was `17796840d44e5a00e1d30ec1d02601108e5e1822`; the root was still an active integration workspace. File hashes below identify the inspected server/build files; this is not a claim that a clean immutable release was deployed.

## Exact checks

Commands ran from the UI worktree repository root unless a working directory is shown.

| Command | Result | Evidence scope |
|---|---|---|
| `node node_modules/@playwright/test/cli.js test -c web/e2e/live.config.ts` | 8 passed, 0 failed, 38.7 seconds | Real browser, HTTP service and PostgreSQL; no route fixtures. |
| `node node_modules/@playwright/test/cli.js test -c web/e2e/playwright.config.ts table.spec.ts` | 10 passed, 0 failed, 14.0 seconds | Isolated UI response fixtures; does not establish server enforcement. |
| `node --test --test-isolation=none web/e2e/boundary.test.ts` | 2 passed, 0 failed | Production table no longer imports browser game/coach/aggregate storage; static human-timer guard. |
| `node web/node_modules/typescript/bin/tsc -p web/tsconfig.json` | Passed | Strict UI and generated public contract compilation. |
| `npm run build` from `web/` | Passed, Vite 6.4.3 | Production build includes local fonts and CSP-safe generated validation. Main JS 665.69 kB, gzip 115.16 kB; Vite emitted its >500 kB chunk advisory. |

The final fixture and real-service suites use separate output directories. A prior simultaneous run produced a trace-cleanup ENOENT: 7 live tests passed and 1 was marked failed during browser-context cleanup, after its assertions. The directory collision was corrected; the complete real suite was rerun and passed 8/8. This failed harness run is not counted as a passing run.

During implementation, a stale-refresh regression first failed with 4 cards replacing an accepted 3-card view. A generation fence fixed it. The final regression exercises a late refresh after a new game is accepted and confirms the new table remains current. The transport retry case confirms the entire original mutation envelope, including command ID, is reused after a lost response.

## Real-service journeys observed

1. **Hearts:** choose mode, explicitly pass three cards, receive three, request Notice/Consider/Suggestion, play a legal card, complete a trick, pause for 500 ms, reload paused, review Original without changing live revision.
2. **Spades Solo:** confirm bid, request all help levels, play, complete a trick, pause/reload and immutable Original review.
3. **Spades Partners:** same flow with partnership display and unchanged live position during review.
4. **Account:** server preview before cancellation, explicit confirmation, resume renewal, portrait account/family entry and local account identifier.
5. **Responsive table:** desktop 1280×800 and phone 667×375, no horizontal page overflow, both locally hosted fonts loaded, no page errors.
6. **Family:** separate browser identities, payer selects the fixture family plan, creates a family and account-bound invitation, invited member accepts with individual-coverage acknowledgment, sees no payer-only invite control, keeps the same account, then leaves.
7. **Account data:** safe export response passes the generated client contract and produces a JSON download; deletion remains disabled until the exact typed phrase; confirmed deletion clears the account view, ends the local session and allows a distinct fresh local account.
8. **Actual trial worker:** select a recorded human play with multiple legal choices, open Original, request an alternate card, receive Possible continuation through the real worker, verify live revision/own hand/scores unchanged, return to Original.

The three mode browser journeys reach the **first completed trick**, not a whole hand. Full-hand score/replay correctness belongs to the separate deterministic/service acceptance. The fixture geometry case checks 13 exposed card targets at ≥44 CSS pixels at the supported phone width. The fixture demo reaches its finite terminal state and sends zero `/api/` requests.

These checks provide scoped evidence for UX-01–03, UX-05, UX-07, UX-09, UX-11–12; COACH-07–08; SUB-01/03/04; and LOCAL-01/02/04/05. They do not mark every scenario under those IDs complete.

## Review observations resolved during integration

- Replaced browser-owned rules/coaching/storage imports with generated public views and typed HTTP commands.
- Fixed stale refresh publication and coalesced initial local-session creation under development effect replay.
- Corrected displayed trick index for score-on-fourth-card semantics.
- Matched billing routes to frozen `/api/subscription/preview` and `/change`; root added the trial route.
- Runtime Ajv compilation violated strict CSP; generated standalone validators resolved it without unsafe-eval. Fonts are now local assets.
- Root added strict GET query checks and excluded forced actions from meaningful decision counters after review findings.
- Allowlisted `observationView` and per-seat strategy inputs were inspected; no hidden-hand leakage was found in this quick read. This is not an exhaustive security audit.

## Evidence images

- [Desktop table](local-live-desktop.png)
- [Landscape phone table](local-live-landscape-phone.png)
- [Portrait account](local-live-account-phone.png)

All images show disposable local test accounts. No credential file was read, printed, copied or committed.

## Remaining gates

**Not run here:** physical iPhone/iPad/Android, VoiceOver/TalkBack, Firefox/WebKit, experienced-player pilot, full-hand browser automation, paid-launch capacity, real Stripe sandbox/production, hosted identity, live Jev and optional strategy-quality promotion. Root service/database/security/recovery checks have separate reports and are not claimed by this UI report.

The local UI is reviewable and usable. The next unfinished external milestones are real-service staging, device/pilot validation and the inherited paid-launch gates; local fixtures cannot satisfy them. The main-bundle advisory remains a measured build limitation, not a failed build or demonstrated runtime-performance defect.

## Root checkpoint hashes (SHA-256)

| File | Hash |
|---|---|
| `web/server/http/app.ts` | `8814856E8A3A6C8E58AE338B33CFB453B8273EEA3952397D45C0F4201719A04D` |
| `web/server/http/game-service.ts` | `917CEC1C8C28A0A9086935B2B8BA130C2496E1C63550752C77609C7BE6B571E1` |
| `web/server/http/trial-service.ts` | `7CFFFB7FD32129264DF7672951A098328C74A547C87A5FAB944DA136CD27EDE9` |
| `web/server/coaching/trial-worker.ts` | `70736509EA0A8861F9D0B74D07FB47BB476228683D7864E4A42662180AD59BDC` |
| `web/dist/index.html` | `4C0DCBB96CAB0BAB71C76F4E85729821C92519C7184927E0CDE59B9E893DD00D` |
