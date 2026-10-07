# M04E — Go platform and preserved React client

**Scoped functional acceptance passed.** Started from `54d6e10` on native Windows. This milestone connects the preserved React experience to one Go/PostgreSQL authority through the additive platform contracts. It covers local client portions of MG-04–06, MG-09 and MG-16–18. Its current terminal acceptance uses replay-validated reachable fixtures; complete normal Spades matches, cumulative-history resource readiness and the prior native-database cause remain separate gates before default activation. Final source preservation and cleanup are verified below.

## Implemented scope

- Registered game view and complete human legal candidates, game-owned current-game presentation, competition/controllers, account access, preferences and assistance statistics.
- Original progressive coaching, notes, accepted-human decision review, source-hand unlocks and bounded synthetic one-trick alternatives. Saved delivered advice has a read-only route independent of current purchase expiry or tab control; source security revocation still denies it.
- Exact mutation recovery across lost replies, reload and service restart. Raw leases and invitation credentials stay in tab storage; unknown outcomes retain their original command. Definite failed continuations can be cleared without discarding uncertain work.
- Native fixture preferences, billing previews/changes, private family membership, data export and account erasure, with server-enforced permission and generation fences. Configured offers remain separate from fixture plans.
- Forward migration 010, generated TypeScript/Go validation and an explicit `start:go` launch path. Existing styles and original V1 behavior/readers remain preserved.

## Run locally

```powershell
node scripts/windows-env.mjs pg:start
npm run start:go
```

Open `http://127.0.0.1:4174`. This explicitly builds the React client with `VITE_BACKEND=go` and starts only Go as the application backend. Node runs build tooling. Use `npm run start:go -- --configured` for the empty configured launch policy; use a separate browser session because identity modes are fenced. Stop the app with Ctrl+C, then stop the project PostgreSQL instance with `node scripts/windows-env.mjs pg:stop` when no other local app needs it.

`npm run start:reference` and the existing Node development path retain the original V1 reader and selected-deal developer tooling. Go uses normal random deals. Default startup is not silently switched while the full activation gate remains open.

Both production builds currently use `web/dist`. When switching back from Go to the Node reference, stop Go, set `$env:VITE_BACKEND = 'node'`, run `node scripts/windows-env.mjs npm run build`, then `node scripts/windows-env.mjs npm run start:reference` (port 4173). `start:go` always rebuilds with its own Go selection. A build must match its backend; there is no fallback between authorities. The Node development server builds its client separately through Vite.

## Evidence

The [execution packet](../../../../planning/implementation/multi-game/m04e-execution.md), [integration review](review.md), [native environment](environment.json), [native capture runner](verify.mjs) and [actual Go browser harness](browser-smoke.mjs) record the scope and checks. Preliminary failures are retained: [forced-choice test assumption](browser-initial-failure.txt), [real hint escalation race](browser-second-failure.txt), [early billing-response assertion](browser-third-failure.txt), [ambiguous retry locator](browser-account-failure.txt), [native family identity boundary](browser-family-failure.txt) and [asynchronous review-button test assumption](browser-fourth-failure.txt). Final acceptance counts below come from the complete frozen-source captures.

| Check | Current result |
|---|---|
| Native Go build, vet; React build and typecheck | Passed on frozen source |
| Generated public and Go contracts | Passed: 149 definitions, 357 actual Ajv fixtures, nine RNG vectors |
| Client storage/recovery, progressive advice and boundaries | 30 passed |
| Original import-boundary/edge fixtures | 78 and 21 cases passed |
| Preserved Node policy regressions | 32 passed; native capture 124.33 seconds |
| Actual Go/React full-hand/account/family journeys | Passed 5/5 normal-random/prepared-work journeys; native capture 416.64 seconds |
| Actual Go/React terminal fixture journeys | Passed 3/3; source unchanged; native capture 56.99 seconds |
| Terminal fixture test-binary build | Passed on frozen source |
| Optional normal-random match soak | Latest coached run incomplete: Hearts passed, Solo censored, Partners did not run |
| Empty configured-policy browser journey | Passed 1/1; native capture 4.77 seconds |
| Complete native Go suite | Passed: 1,425 checks, 18 packages, two named skips; native capture 364.284 seconds |
| Native Go race suite (`-race -short`) | Passed: 1,423 checks, 18 packages, four named skips; native capture 1,168.309 seconds |

Each final check runs as `node qa/implementation/multi-game/m04e/verify.mjs <check-name>`; the runner selects the pinned native tools and records the exact command, source list, output hash and start/end times. All 16 required captures passed with `sourceUnchanged:true` and the shared source SHA-256 `c3523da0c0b222ea011073024aab5b811bb9031e17034068f66b061d08dc31ea`; source preservation and cleanup are verified below. `browser-soak` is optional. Browser tests use the compiled Go executable and built React assets with an owned temporary schema in `cardford_windows_test`. The five full-hand/account/family journeys retain normal server-random play, actual prepared work and real UI gestures. Terminal fixture journeys have the narrower scope described below. Neither group establishes full-match gesture coverage or strategy quality.

For a rerun, first start native PostgreSQL with `node scripts/windows-env.mjs pg:start`. Run the capture runner's `build`, `go-build` and `fixture-build` checks before the browser groups; they produce the matching React assets, Go application and test-only importer. Run `browser-smoke`, `browser-terminal` and `browser-configured` serially against that source. The [full-suite capture](go-full.json) records no failures and two skips: `TestDemoWebRejectsSymlinkedBuildAsset` on Windows and the environment-gated `TestM04ETerminalFixtureInstall`. The latter is exercised explicitly by all three passing browser fixture installations. The [smoke](browser-smoke.json), [terminal](browser-terminal.json) and [configured](browser-configured.json) captures together record nine passing actual Go/React journeys.

The [race capture](go-race.json) also records no failures. Its four skips are `http.TestDemoWebRejectsSymlinkedBuildAsset`, `records.TestRecordLongHistoryGrowth`, `records.TestM04ETerminalFixtureInstall` and `records.TestM03StoreReplayChanceCheckpointsAndHandGrowth`. The two long-growth tests skip under `-short` and passed in the normal suite. The Windows symlink case and environment-gated installer have the same limitations described above. The race run is therefore reported with its exact short-suite scope rather than as every normal check under race instrumentation.

The preliminary terminal driver chose the first issued legal human candidate, which always selected nil bids in Spades. Its first 550-second run remains recorded as an incomplete, censored check in [browser-terminal-time-bound.txt](browser-terminal-time-bound.txt). The later 1,150-second run passed Hearts in 7.3 minutes; Spades Solo completed 17 hands and was progressing through hand 18 without observed HTTP failures when censored after 19.3 minutes. Partners did not run. That second run is preserved in [browser-terminal-first-candidate-bound.txt](browser-terminal-first-candidate-bound.txt) and its [capture manifest](browser-terminal-first-candidate-bound.json). The manifest's `output` field retains the original `browser-terminal-native.txt` filename; the preserved text bytes match its recorded `outputSHA256`. Neither censored run establishes complete three-mode acceptance.

The latest normal-random coached run requested public delivered level-three advice for genuine human choices, used its explicit suggestion or first supplied tie, and verified exactly one issued legal candidate before committing. Bots used their actual prepared policy results. Hearts completed 11 hands at revision 744 with scores `[107,76,84,71]`; Solo completed 15 hands and was in hand 16 at revision 1091 with scores `[316,203,411,413]` when its 1,150-second command-loop bound expired. Partners did not run. The complete group failed and is retained in [browser-terminal-coached-bound.txt](browser-terminal-coached-bound.txt) and its [capture manifest](browser-terminal-coached-bound.json). These results are incomplete normal-match/resource evidence, not three-mode acceptance or strategy evidence.

## Terminal acceptance scope adjustment

`browser-terminal` now exercises three reachable terminal fixtures through the real Go listener and preserved React table. The [test-only fixture builder/importer](../../../../server/internal/records/platform_terminal_fixture_test.go) starts from each fresh owner's untouched revision-zero game and preserves its recorded real random opening. It constructs subsequent deterministic legal actions and chance material under the existing rule/module pins, then replays the full command/event archive and verifies every checkpoint and expected terminal result before import. The importer is available only in the compiled records test binary, requires the isolated native test database and an existing owned fresh game, and rechecks opening/anchor identity and absence of commands, work, decisions and help. It is not a production route or ordinary-play override.

Private archives remain under `.local/m04e-terminal-fixture-<mode>.json`; public evidence retains their SHA-256, scope and safe terminal receipt. No original analysis, prepared-work or delivered-help records are imported. Fixture results cannot establish coaching, assistance statistics, policy behavior or normal full-match completion. The real final automatic collection is withheld until the browser resumes; the journey then verifies terminal transition, expected scores, reload/resume, recap/display and rejection of next-hand advancement without another revision.

This scoped terminal group passed 3/3 with `sourceUnchanged:true` in the [capture manifest](browser-terminal.json) and [output](browser-terminal-native.txt): native capture 56.99 seconds; individual Hearts/Solo/Partners journeys 29.1/11.3/10.0 seconds. Safe fixture receipts and terminal screenshots are retained for [Hearts](hearts-terminal-fixture.json) ([table](hearts-terminal-fixture.png)), [Solo](spades-solo-terminal-fixture.json) ([table](spades-solo-terminal-fixture.png)) and [Partners](spades-partners-terminal-fixture.json) ([table](spades-partners-terminal-fixture.png)). This supplies scoped lifecycle acceptance alongside the other passing required checks; source preservation and cleanup are verified below.

The required groups are `browser-smoke` (five normal full-hand/account/family journeys), `browser-terminal` (three terminal fixture journeys) and `browser-configured` (one empty-offer journey). `browser-soak` retains the three old normal-random match journeys as optional bounded resource evidence. Existing limits and runtime rules/policies remain unchanged; repeated retries until a green soak do not substitute for resolving the incomplete evidence. The [terminal selector failure](browser-terminal-failure.txt) and all censored earlier drivers remain separately recorded. Passing scoped M04E functional acceptance does not close complete normal Spades/resource acceptance or default activation.

Session statistics now select only accepted human-choice revisions before decoding saved analyses. Sealed Hearts passing still includes the other records sharing that revision. Existing strict validation and finite history bounds remain; very long-history aggregation, bundle splitting and production concurrency measurements remain later resource work. Local functional checks do not establish production capacity.

Code inspection found two concrete cumulative-history cost paths: [ReadDecision](../../../../server/internal/records/store_history.go) performs another full replay to validate the original historical decision, and [Spades state cloning](../../../../server/internal/games/spades/snapshot.go) copies cumulative `Events` during transitions/replay. Nested historical reads can repeat that growing work. This is a resource-readiness finding, not a measured cause of the bounded Solo failure or older PostgreSQL timeouts. The current `Load` validation does not replace historical decision/checkpoint corruption checks; bypassing the extra replay would weaken validation. A later resource pass must preserve those safeguards while measuring the costs.

## Delivery and cleanup

[Delivery verification](delivery-checks.json) validates all 16 output/source manifests against the captured bytes, preserves the 251 original reference sources and earlier milestone evidence, checks local report links and confirms the private database credential is absent from this evidence. Generated contracts, formatting and `git diff --check` passed. Source checks cover runtime, fixtures and harnesses; the separate Markdown status updates record the resulting evidence.

The final [database snapshot](database-cleanup.json) found only its diagnostic client, no blockers and no owned test schemas. The [cleanup record](cleanup.json) confirms native PostgreSQL stopped, recorded task ports closed and no M04E executables left running. Seventeen owned temporary paths were removed, including executables and private browser traces. The three private replay archives remain under `.local` with hashes matching their public receipts; installed tools, credentials and database data are preserved. The preexisting `.claude` directory is untouched. The unchanged Node default's matching frontend was restored with a separate passing [reference build](reference-build-native.txt); `start:go` rebuilds its own matching frontend when launched.

## Remaining boundaries

The prior intermittent native PostgreSQL connection/transaction timeout cause remains unresolved. [Bounded diagnostic tooling](database-diagnostic.mjs) captures failure-time activity/waits/blockers and socket state without increasing product timeouts or printing private SQL/credentials. A passing run does not establish the cause of an older failure.

Default activation remains gated on complete normal Spades match/resource evidence and the prior native PostgreSQL cause. Terminal fixtures supply scoped functional lifecycle evidence only.

No hosting, live identity/payments, production-capacity claim, native packaging or strategy-strength claim. Jev stays **off**, with **0 live requests** and **no observed model**. Human review remains deferred.
