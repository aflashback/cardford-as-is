# Spades reasoning — local evidence

**Status:** implemented tactical foundation; partnership mastery remains unproven. Started 2026-09-29 03:18:41 UTC, with an owner limit of one hour. Base `be1189c`; design commit `48e959b`; implementation `44b9ea8`, access fixes `687b2c6`; branch `codex/spades-reasoning`.

## Delivered

- [Checked facts, design and 26 scenario families](../../planning/12-spades-reasoning.md): Solo objectives, partnership exceptions, exact deductions versus uncertain hints, and Jev confidence limits.
- Shared `spades-tactics-2.0.0` analysis for bots and coach. Actual concealed hands are excluded. Rules/scoring remain unchanged.
- Every human decision retains its original analysis/advice, including forced moves and quiet play. Hidden analysis neither charges nor marks assistance. Current-game review can reveal that saved advice later.
- Independent table type, **three trained players** copy, and final-hand trick winners at match end. Future four-human tables remain specified, unavailable locally.

Validation completed 2026-09-29 04:02 UTC, within 44 minutes. Integration preserves the existing unrelated brand edits.

## Passed checks

| Command/check | Result |
|---|---|
| `node --env-file=C:\repos\test-jev\.env.local --test --test-isolation=none web/tests/*.test.ts web/server/tests/*.test.ts` | 182 passed; 0 failed/skipped |
| `npm run typecheck`, `npm run build` | Passed; existing bundle-size warning remains |
| `npm run contracts:check`, `npm run lint:boundaries`, `npm run check:artifacts` | Passed |
| `node web/server/evaluation/spades-reasoning.ts qa/implementation/spades-reasoning-comparison.json` | 512 complete hands; legal play/conservation/independent score checks passed |
| Frozen `local-policy.ts` manifest, output `.local/frozen-baseline-verification.json` | 384 compatibility hands passed; baseline source preserved |
| Isolated Playwright `table.spec.ts` | 20 fixture checks passed |
| Isolated `local-live.spec.ts -g 'live spades'` | Solo and Partners setup, cues, play and durable review passed |
| `spades-full-hand.spec.ts` | 2 complete quiet hands; scores, 14 reviews, saved advice, unchanged assistance and zero console errors passed |

Browser validation uses `TRICKS_LIVE_URL=http://localhost:4187`, the test database and `.local/spades-playwright.config.ts`. Normal local commands use `web/playwright.config.ts` on port 4173. No hosted claim. [Partner review screenshot](spades-partners-saved-advice.png).

## Strategy results

[Seeded machine evidence](spades-reasoning-comparison.json): 432 initial comparison/composition hands, 32 reachable carryover hands, 48 matched-team hands. Carryover cases exercised 11 bag penalties and 5 match completions.

| Comparison against frozen baseline | Mean own-score difference | Mean score-margin difference |
|---|---:|---:|
| Solo, one changed seat; 96 pairs | +3.89 | +4.68 |
| Partners, one changed seat; 96 pairs | -2.88 | +3.55 |
| Partners, both teammates changed; 48 pairs | -4.60 | +0.35 |

Deal rotations are correlated. These exploratory results **do not establish stronger partnership play**. Scenario occurrence is not proof of optimal choice.

## Fixes and remaining work

Fixed observed Nil-cover wording, impossible-rescue claims, fourth-seat opponent claims, incomplete-history void inference, unavailable-trump wording, long advice, stale review advice, saved-advice expiry/retry access, exhausted-allowance wording and a font/CSP build defect.

Next milestone: contextual bidding, soft partner signals, multi-trick entries, double-Nil tradeoffs, opponent contract denial and match-end objectives; independently label these cases and compare multiple opponent styles before claiming mastery. See the partial-scenario table in the design.

**Provider:** local code; Jev off; zero live requests; observed model ID: none. No confidence percentage or strategy grade was enabled.
