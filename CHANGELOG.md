# Changelog

## Unreleased — 2026-10-18 CardFord account and security theme

AUTH-LOCAL-012: extend the approved CardFord branding to the native Keycloak account console. Add the product logo, cream palette, bundled typography, terracotta actions and compact mobile header; persist the account theme in local realm setup. Preserve Keycloak's profile, sign-in, device and application controls. [Verification](qa/implementation/auth-local/account-theme-20261018/README.md).

## Unreleased — 2026-10-18 Focused welcome-back layout

AUTH-LOCAL-011: address the owner's three browser annotations by removing the decorative club card, aligning the app authentication gate with the approved CardFord sign-in styling, and removing Appearance from auth and account pages. Keep the existing in-game theme pickers, session renewal, sign-out and explicit Resume behavior. [Verification](qa/implementation/auth-local/welcome-layout-20261018/README.md).

## Unreleased — 2026-10-18 Local account-console access

AUTH-LOCAL-010: repair the Keycloak account console's exact local browser origin and restore normal realm-default self-service roles on the two existing seeded test identities. Preserve client scopes, PKCE, unrelated users and credentials; make reconciliation idempotent and cover it in focused auth tests. Verified Personal info and Signing in load in the real local console. [Evidence](qa/implementation/auth-local/account-console-20261018/README.md).

## Unreleased — 2026-10-18 Sign-in callback recovery

AUTH-LOCAL-009: show a branded CardFord recovery page for failed browser login callbacks, with an explicit fresh sign-in action and home link. Retain rejected HTTP statuses, browser-binding/expiry checks and JSON responses for API clients. Do not reflect callback parameters or retry automatically. [Verification](qa/implementation/auth-local/callback-recovery-20261018/README.md).

## Unreleased — 2026-10-18 CardFord authentication theme

AUTH-LOCAL-008: implement owner-selected option one across local Keycloak signup, sign-in and email-code forms. Add the existing CardFord vector logo and watermark, cream/terracotta styling, bundled Rally typography, passwordless guidance, optional display-name labeling and responsive focus/error states. Preserve native forms and server authentication policy. Update live-test labels. [Visual and real-runtime verification](qa/implementation/auth-local/theme-20261018/README.md).

## Unreleased — 2026-10-18 Local administrator password rotation

AUTH-LOCAL-001/006: allow an owner-chosen local Keycloak administrator password in the launcher configuration while retaining generated service-secret checks. Document synchronizing the private configuration after rotation; cover validation with focused setup tests.

## Unreleased — 2026-10-18 Renewable player sessions

AUTH-SESSION-001–009: add server-held encrypted provider refresh, fifteen-minute access, ninety-day qualifying refresh inactivity and a fixed 180-day full-login limit. Keep one active application login, stable control across ordinary renewal, typed access-expiry recovery, signed provider logout and durable refresh/replacement fences. Restrict game WebSockets to accepted active play; pause, hold, logout and expiry close them immediately, with HTTP-only paused recovery and no blanket idle auth polling. Add forward migrations 015/016, persistent local key setup and critical-path tests. [Setup and manual operations](docs/development/local-auth.md) · [Verification and limits](qa/implementation/auth-local/STATUS.md).

Logout/refresh responses retain an inert revoked cookie rather than risking a delayed response deleting a newer login. Safe app-originated provider cleanup, external disable/delete orchestration, hosted key rotation and Firefox/WebKit acceptance remain explicit gates; Paddle/social login are unchanged.

AUTH-SESSION-004/006 review follow-up: preserve typed renewable expiry when access expires between transport preflight and Go service admission. Treat GET/HEAD reads as passive so background Coach reloads cannot initiate refresh; retain explicit Continue and qualifying mutation recovery. Add regressions for renewable versus revoked admission and read-only expiry preserving pending actions. Focused auth checks pass (50 Node checks and six Go packages), with web typechecking.

## Unreleased — 2026-10-16 Local Keycloak authentication foundation

AUTH-LOCAL-001–006: add a separately configured native Go/Vite/PostgreSQL authentication profile with pinned Podman Keycloak, email-OTP browser authentication, secure opaque app sessions, generated auth contracts and a Rally login/account gate. Fresh logins replace old app sessions and fence control without extending expired game retention. Fixture self-enrollment/billing/deletion routes are unavailable in real-auth mode; synthetic Paid access is an expiring audited operator grant with explicit test provenance. Preserve the existing fixture workflow and game databases. [Human and agent setup](docs/development/local-auth.md) · [Requirements](docs/superpowers/plans/2026-10-16-keycloak-local-auth.md).

This is a local foundation. Automatic regional discovery, real social-provider acceptance, identity-event revocation/deletion workflows, multi-instance hosted operation and Paddle remain release gates.

AUTH-LOCAL-007: review actual session/ownership/CSRF/realtime boundaries before social login. Fix stale signed-in display on idle Account or suspended paused tables with foreground auth verification independent of game transport; coalesce checks and clear timers/listeners on unmount. Require new bootstrap after the public demo, and recover if returning while logout is pending. Preserve durable game deadlines and explicit Resume. [Verification](qa/implementation/auth-local/STATUS.md).

## Unreleased — 2026-10-15 Pause, foreground presence and session expiry

CR-ARCH-006: retain paused games for five minutes on Free and one hour on verified Paid access, with PostgreSQL as authority. Require explicit Resume after leaving, losing connectivity, rotating to an unsupported layout or reopening. Keep Settings and Choose game available while paused. Separate temporary review/Why holds from persistent pause, stop background transport and preparation work, enforce foreground deadlines at mutation boundaries, and expire resumability without deleting historical receipts or games. Preserve the countdown across settings and reconnects. [Implementation and verification](qa/implementation/rally/pause-session-lifecycle/IMPLEMENTATION.md).

The 100,000 independent-player target remains a staging capacity objective. Bounded local measurements and current distributed-routing limitations are recorded in the [capacity packet](qa/implementation/rally/pause-session-lifecycle/capacity/README.md); no production server count or throughput is claimed. Redis remains deferred transient caching, not a replacement for PostgreSQL persistence.

## Unreleased — 2026-10-14 Rally annotated layout corrections

CR-UX-008: keep each Jacks suit in one vertical overlapping stack across live play and replay; position West/East announced twos lower beside their owners, allowing felt-rim overlap while avoiding names and the hand; use Joe consistently for the fourth seat. Preserve card rendering, gestures, server-owned reveal state and rules. [Annotation verification](qa/implementation/rally/browser-2026-10-14/ANNOTATION-FIXES.md).

Follow-up: anchor the Jacks board to the felt center on both axes, flatten Jacks player tags and use the hand-lift clearance as additional table space. Resting hand cards remain fixed; lifted cards may overlay the table or tag. [Centered Jacks verification](qa/implementation/rally/browser-2026-10-14/CENTERED-JACKS.md).

Follow-up: reserve the complete Ace-to-two Jacks footprint from the opening play, with stable player/announcement pockets as cards leave hands. Live and Why boards resize with the viewport or pinned Coach, not with round progress. [Fixed Jacks verification](qa/implementation/rally/browser-2026-10-14/FIXED-JACKS.md).

Follow-up: fit visible Jacks tags to their contents while reserving stable clearance invisibly; remove the player's own card-count fan and hide in-progress Jacks seat scores until completion. Header totals and other request scores remain available. [Compact tag verification](qa/implementation/rally/browser-2026-10-14/COMPACT-TAGS.md).

Follow-up: sequence each confirmed fourth card through its existing landing motion and a full completed-trick dwell before updating the last-trick pocket or releasing the next lead in Hearts, Spades and Trix trick-taking requests. Pause/resume retains the remaining interval; native state, rules, scoring and receipts remain unchanged. Verified with 80 bounded source tests and 20 built-in-browser trick intervals across all seven modes, including pause/resume and a final Trix trick. [Fourth-card verification](qa/implementation/rally/browser-2026-10-14/trick-timing/FIX-VERIFICATION.md).

Follow-up: use current content-sized player clearance for Jacks and omit Partners-only announcement pockets in Solo, while preserving the fixed Ace-to-two footprint. Hide the Coach sticker while its overlay or pinned drawer is open and restore focus when closed. Verified with 130 source checks and visible built-in-browser Solo/Why checks at the annotated width plus five landscape presets. [Jacks and Coach verification](qa/implementation/rally/browser-2026-10-15/jacks-coach/VERIFICATION.md).

Follow-up: apply one persistent pause policy across Hearts, both Spades modes and all four Trix variants. Confirm the server stop before Account/Demo navigation; require explicit Resume after app focus/visibility loss, portrait or reopening; retain paused Settings and Choose game navigation. Remove X/Escape/backdrop resume and reject Resume completions after another pause or table removal. Verified with 89 focused checks and all seven modes in the visible built-in browser. [Pause verification](qa/implementation/rally/browser-2026-10-15/pause-fix/VERIFICATION.md).

Follow-up: center Trix request selection on the felt at every layout height and prevent previous trick coordinates from carrying into the picker. Keep choices visible without internal scrolling. Verified with 67 focused source checks and 64 built-in-browser captures of the current Complex Partners request across the landscape registry, the annotated size, height breakpoints and Coach states. [Request picker verification](qa/implementation/rally/browser-2026-10-15/request-center/VERIFICATION.md).

## Unreleased — 2026-10-13 Rally live UI and Coach preview service

CR-UX-008: apply the approved Rally layout, themes, responsive table geometry and left overlay/pinned Coach to the native game UI. Preserve canonical cards, gestures, authoritative choices and historical advice. Add separate server-owned two-per-UTC-day Coach sessions, entitlement-based unlimited access, immutable preview items, actor-visible Why replay and revisioned feedback, including account export/erasure. The replaceable mock provider labels every explanation and fictional comparison as a preview; trained intelligence and real-player rating remain deferred. [Implementation plan](docs/superpowers/plans/2026-10-13-rally-live-ui.md); [verification and review instructions](qa/implementation/rally/status.md).

## Unreleased — 2026-10-12 Trix partial reviewer deadline recovery

TSC-20: separately preserve and verify an exact interrupted partial reviewer stream without accepting it as a completed review. Bind the existing player-timeout processor, original host/context/guard evidence, stopped boundary and consumed first attempt before the sole remaining attempt. Historical proofs, responses and validators remain intact. Actual focused checks and admission are recorded separately in the runbook.

## Unreleased — 2026-10-12 Trix player deadline recovery

TSC-19: add a separately audited recovery for an exact first player timeout with no final response, preserving its fatal settlement and consumed attempt. Bind the original native position and host/context/transport evidence before the remaining second attempt. Prior processors, reviews, raw bundles, rules and scoring remain unchanged; later pauses and unrelated failures still stop collection. Focused checks and actual admission are recorded separately in the runbook.

## Unreleased — 2026-10-12 Trix reviewer deadline recovery

TSC-18: preserve and separately verify an exact stopped reviewer timeout with no final response, retaining the consumed first attempt and existing second-attempt limit. Add a shutdown guard around the unchanged app-server adapter to prevent cleanup writes after closing stdin. Historical processors, context inventories, response validators and reviews remain intact; later pauses and unrelated failures still stop collection. Actual checks and frozen admission are recorded separately in the runbook.

## Unreleased — 2026-10-12 Trix saved-player context recovery

TSC-17: add a separately audited second context cutover and exact saved-player reconciliation after the host removed an unrelated skill catalog entry. Preserve the original fatal settlement, raw host evidence and consumed attempt. Bind the active native frame and use original player/receipt/reducer validation, with explicit historical context routing, immutable processor delegation and idempotent crash recovery. Tests and actual admission are reported separately in the runbook; no automatic context approval or extra model call is implied.

## Unreleased — 2026-10-12 Trix final-game correction references

TSC-16: distinguish explanation-quality flags from proved alternative-action references in the offline game report. A separately audited projection preserves raw bytes, text and grades, retains excluded quality references in a classification receipt, and applies the unchanged game validator with strict proof requirements. Add immutable recovery for both consumed attempts and matching raw-export validation, without a third call or rewriting historical reviews. Actual tests and admission are reported separately in the [runbook](planning/implementation/coach-lab/trix-scenario-collection/README.md).

## Unreleased — 2026-10-12 Trix forced-explanation policy

TSC-15: separate native forced-move status from reported explanation quality in the audited review importer and raw-game validator. Preserve schema-valid original text and grades, require no missed alternative on forced actions, and retain all other host/context/content/proof checks. Freeze a predecessor-bound semantic recovery and reuse the earliest eligible saved response without another attempt. Historical validators, prompts, reviews and rejected evidence remain intact. Tests and live admission are recorded separately in the [evidence ledger](qa/evaluation/coach-lab/trix-scenario-collection.md) and run reports.

## Unreleased — 2026-10-12 Trix whole-array reference recovery

TSC-14: extend the existing `handCounts` container repair to its exact whole-array pointer. Preserve raw bytes, prose and grading; keep ordinary content diagnostics when no supported repair exists. Add a predecessor-bound metadata recovery version while preserving historical processor/normalizer pins, context routing and cumulative attempt limits. Chronological evidence selects the first saved response for the current failure. Actual frozen admission remains pending. [Runbook](planning/implementation/coach-lab/trix-scenario-collection/README.md).

## Unreleased — 2026-10-12 Trix evidence-reference recovery

TSC-14: add an audited reference-only envelope and immutable stopped-review recovery. Correct only a misplaced actor `handCounts` container after full transport validation, preserving original response bytes, prose, grades and cumulative attempts. Original content/proof checks still apply; zero-call frozen admission precedes reuse of saved evidence. Preserve the observed review disagreement and public card-counting error as a separate research limitation. Reference-envelope fixtures passed 35/35; actual recovery admission is pending. [Runbook](planning/implementation/coach-lab/trix-scenario-collection/README.md).

## Unreleased — 2026-10-11 Trix saved-response context admission

TSC-14: add a separate audited context amendment and immutable evidence replay view for a completed response rejected only by its old context inventory. The unchanged inspector and original validator must pass before importing the exact saved response; original rejection and consumed attempts remain. Historical calls keep their original context inventories, while new calls use the explicit cutover. The context evidence suite passed 37/37; actual context-recovery admission remains pending. [Runbook](planning/implementation/coach-lab/trix-scenario-collection/README.md).

## Unreleased — 2026-10-11 audited Trix campaign startup recovery

TSC-14: add append-only recovery for a host-verified MCP startup timeout interrupted before any final output. `recover-campaign` freezes a new compatible processor and proof-bound recovery record while preserving the original manifest, continuation amendment and invocation evidence; `campaign-recovery-check` performs zero-call admission; `campaign` selects the latest authorized recovery. A failed invocation consumes its original attempt, with no third attempt or operator-pause bypass. Raw game revalidation can preserve a published processor audit only when the hash journal recognizes it, without rewriting the publication. Combined continuation/driver/recovery/raw-export fixtures passed 55/55; failed-invocation fixtures passed 29/29. Actual strict failure verification passed over 46 wire frames without journal changes; frozen recovery admission is pending. The live continuation stopped with one completed game, 26/52 accepted decision reviews and zero game reviews; no campaign completion or selected-case claim follows. [Runbook](planning/implementation/coach-lab/trix-scenario-collection/README.md); [evidence ledger](qa/evaluation/coach-lab/trix-scenario-collection.md).

## Unreleased — 2026-10-11 Trix campaign continuation

TSC-13: add the approved continuation path for the full 160-request campaign, preserving the prior journal and checkpoint evidence. Freeze the audited amendment, run `campaign-check` with zero model calls and no journal changes, then start `campaign`. Keep 300-second invocation and two-attempt-per-decision limits, review each game before the next, and defer selection/export while retaining all raw evidence. Focused continuation suite passed 49/49; actual frozen CLI admission passed and live continuation started at 22:12 UTC. At launch one game was complete with 24/52 decision reviews and zero game reviews; the worker subsequently stopped at 26/52 decision reviews after the startup failure documented above. [Runbook](planning/implementation/coach-lab/trix-scenario-collection/README.md); [continuation note](docs/superpowers/plans/2026-10-11-trix-campaign-continuation.md).

## Unreleased — 2026-10-11 offline Trix scenario collection

TSC-01–12: add a separate native-backed collection harness for Basic/Complex Solo and Partners penalty requests, actor-only Luna Max prompts, durable attempts and replay, conservative reviews, capped case selection and versioned external lab exports. Exclude Trix Jacks and non-Trix games. Production bots and coach policies are unchanged. [Runbook](planning/implementation/coach-lab/trix-scenario-collection/README.md); [scope authorization](planning/decisions/CR-STRAT-012-offline-trix-scenario-collection.md). Actual collection and verification status are recorded separately from implementation.

## Unreleased — 2026-10-10 South King discard comparison

CFL-14: isolate South's discard after a low partner return, comparing all legal cards on South-compatible hands with complete team scores. Add identical-observation safe/harmful king-release twins, partial-trick timing checks, bounded reproducible runs and actor-bound reports. Preserve the facts-only allocation reference and document the remaining behavioral-inference stage; no runtime policy changes. [Protocol](planning/implementation/coach-lab/trix-king-discard.md); [results and running instructions](qa/evaluation/coach-lab/trix-king-discard.md).

## Unreleased — 2026-10-10 King partner-return comparison

CFL-13: compare every legal lead at the saved North partner-return position on common feasible hands in four fixed deterministic environments. Preserve each actor's information boundary, record South's actual response and complete team scores, and retain separate Basic/Complex streams, current-policy choices and immutable source-bound receipts. Runtime policies remain unchanged. [Protocol](planning/implementation/coach-lab/trix-king-return.md); [results and running instructions](qa/evaluation/coach-lab/trix-king-return.md).

## Unreleased — 2026-10-10 protected King of Hearts scenarios

CFL-12: add eight complete authored deals and ten legal escape/trap witnesses for six-heart K♥ hands. A bounded headless operator compares existing deterministic policies in Basic/Complex Solo and Partners, retaining natural versus imposed declarations, actor-scoped history, literal bonus provenance and complete component scores. Keep witnesses separate from bot choices and preserve live defaults. [Protocol](planning/implementation/coach-lab/trix-king-scenarios.md); [results and running instructions](qa/evaluation/coach-lab/trix-king-scenarios.md).

## Unreleased — 2026-10-10 partner-release timing diagnostics

CFL-11: add a bounded sampled Jacks comparison using common plausible deals, observation-only continuations, team finishing points and separate card availability/placement timing. Add opt-in `trix-ownership-comparison-1.0.0` with unchanged Ownership choices and scores and versioned comparative explanations. Preserve earlier traces and live defaults. [Protocol](planning/implementation/coach-lab/trix-release-timing.md); [results and running instructions](qa/evaluation/coach-lab/trix-release-timing.md).

## Unreleased — 2026-10-09 local WebSocket updates and server-owned bots

RT-01–RT-10 / [CR-ARCH-005](planning/decisions/CR-ARCH-005-local-realtime-and-server-bots.md): add a receive-only, authenticated local WebSocket channel backed by transactional player-safe projections and a bounded outbox. HTTP retains commands, receipts and recovery. Go now prepares and commits bot and automatic transitions without browser pacing requests; browser animations consume committed views. Durable playback generations fence pause and restart. Clear mounted private views on authentication invalidation and reject late responses. Cloud hosting and 100K concurrency validation remain deferred. [Acceptance evidence](qa/implementation/realtime-acceptance.md).

RT-09 startup follow-up: add `npm run pg:start` / `npm run pg:stop` for the project-local database and make `start:go` check port 4174 before building. Show separate Go, TypeScript and Vite build stages so local startup progress is visible. The V1 Node startup remains available as a legacy reference.

RT-07/RT-09 Resume recovery: make **Take control** available inside both pause dialogs when the current tab lacks the saved game's control lease. Keep control recovery and Resume explicit, show failures inside the dialog, and disable duplicate recovery clicks. Preserve the existing game and server authorization checks.

## Unreleased — 2026-10-09 larger Trix twos announcements

UX-49: enlarge announced twos by 20% for every player, in both face-down and revealed states. Preserve the shared card proportions, overlap and table-edge anchors. Desktop width is 43.2 px; short landscape width is 31.68 px. Other cards retain their sizes. [Acceptance evidence](qa/implementation/trix/shared-card-followup.md).

## Unreleased — 2026-10-09 remove deliberate double-click waits

UX-48: remove the remaining 75 ms human-action preparation polling sleep and make next-turn queued-card lifts immediate. On-turn double-click/tap already acknowledges and submits in the activation task; it continues to do so. Confirmed throws retain smooth motion and server authority. [Timing and regression evidence](qa/implementation/trix/shared-card-followup.md).

## Unreleased — 2026-10-09 automatic pass with no doubles

UX-47: all Trix variants hide the doubling prompt and automatically submit the server's empty declaration when no cards are eligible to double. Respect pause, busy, access and error gates. Rename the manual doubling decline action from Skip to Pass. [Acceptance evidence](qa/implementation/trix/shared-card-followup.md).

## Unreleased — 2026-10-09 quicker card selection and throws

UX-46: halve the shared queued/selected-card lift from 160 to 80 ms and confirmed throw from about 231 to 115 ms at normal speed. Check human-action preparation every 75 ms instead of 150 ms so completed server work is noticed sooner. Immediate on-turn acknowledgement and submission, the 200 ms drag hold, bot turn pace and completed-trick display hold remain intact. [Acceptance evidence](qa/implementation/trix/shared-card-followup.md).

## Unreleased — 2026-10-09 reliable next-turn card selection

UX-45: preserve a two-click gesture across opponent decisions in the same deal and allow local next-turn selection while opponent server work is busy. A stationary 200 ms pickup no longer swallows the first click of a double-click/tap; actual dragging still consumes that click. Keep active-turn submissions and pauses gated. Pickup tolerates small pointer movement instead of canceling at 10 px. [Live trace and regression evidence](qa/implementation/trix/shared-card-followup.md).

## Unreleased — 2026-10-09 Trix Ownership session comparison

CFL-10: add separate candidate/focal-seat Ownership activation accounting and complete the frozen 256-session, 3,584-deal Partners comparison specified in [the protocol](planning/implementation/coach-lab/trix-ownership-study.md). Preserve a Basic partner-release case with a 50-point team loss, a comparative explanation gap, and neutral fresh-validation outcomes. All cohorts remain insufficient evidence for promotion. [Verification, outcomes and operator instructions](qa/evaluation/coach-lab/trix-ownership-study.md); runtime defaults stay unchanged.

## Unreleased — 2026-10-09 Trix Jacks ending comparisons

CFL-09: add bounded exhaustive small-ending allocation comparisons with native finishes, separate team/individual objectives, all legal roots and fixed observation-only continuations. Retain actor-safe case inputs, full seat awards and separate board-opening/placement timing. Add a reproducible private operator and reachable partner-release/blocker counterexamples. [Scope](planning/implementation/coach-lab/trix-jacks-endings.md), [checks, findings and run instructions](qa/evaluation/coach-lab/trix-jacks-endings-acceptance.md).

## Unreleased — 2026-10-09 Trix public twos ownership candidate

CFL-08: add a separate `trix-ownership-1.0.0` lab candidate for public twos ownership deductions, including count restrictions and supported single-team announcement suppression. Preserve original versus remaining ownership, unresolved alternatives and shared saved bot/coach evidence. Reuse history policy and its immediate opening weights; retain old policies and the live default. [Scope](planning/implementation/coach-lab/trix-ownership.md), [checks and run instructions](qa/evaluation/coach-lab/trix-ownership-acceptance.md).

## Unreleased — 2026-10-09 Trix frontier candidate

CFL-07: add separately selectable `trix-frontier-1.0.0`, removing inherited own-card credit beyond gaps in Partners Jacks. Save each compared path and score correction alongside the bot action and coach reason; preserve historical policies and the live default. Add native counterexamples and a predeclared headless comparison against the frozen history policy. [Rule](planning/implementation/coach-lab/trix-frontier-rule.md), [verification and study results](qa/evaluation/coach-lab/trix-frontier-study.md).

CFL-03 follow-up: after the frozen campaign, change study reporting to consume one cell archive at a time instead of retaining every decision trace across all cells. Preserve summary structure, family accounting and calculations; add lazy-consumption and exact-output regression tests. Native policies and collected results are unchanged.

## Unreleased — 2026-10-09 Trix Jacks public chronology

CFL-05–CFL-06: add versioned public layout chronology to new Trix games, native replay validation, actor-safe choice evidence and lab export integration; preserve historical pins and scoring rules. Add the reproducible J♦/10♠ case investigation with common feasible hands, deterministic population sensitivity and retained counterexamples. No policy-weight or live-default change. [Scope](planning/implementation/coach-lab/trix-layout-history.md), [case study and verification](qa/evaluation/coach-lab/trix-layout-case-study.md).

## Unreleased — 2026-10-09 faster held-card pickup

UX-42 refinement: mouse and touch holds lift the card and enable dragging after 200 ms across all games, reduced from 400 ms. Existing turn legality, drag bounds and release behavior are preserved. [Acceptance evidence](qa/implementation/trix/shared-card-followup.md).

## Unreleased — 2026-10-09 compact game picker

UX-44: shorten the shared header game selector to 32 px. Use a compact 420 px dialog for the Trix catalog, with tighter padding, heading spacing and game-option gaps; retain all seven choices and existing keyboard close/focus behavior. [Live visual evidence](qa/implementation/trix/shared-card-followup.md).

## Unreleased — 2026-10-09 deterministic Trix feedback loop

CFL-01–CFL-04: connect separately identified human and numerical feedback to reproducible hypotheses, add the selectable `trix-history-1.0.0` candidate with exact public-history constrained penalty-ending comparisons and a shared saved bot/coach trace, and add frozen paired Partners studies with bounded native subruns, original-family accounting and fresh validation seed isolation. Preserve conditional behavioral cases and explicit Jacks history coverage limits. No model selection, game-rule change, UI change or default-policy promotion. [Implementation and scope](planning/implementation/coach-lab/trix-feedback-loop.md), [operator instructions](qa/evaluation/coach-lab/README.md).

## Unreleased — 2026-10-09 announcement separation and immediate card response

UX-43: move North's revealed/face-down announcements beside the owner's badge at the upper table edge, separate from the Jack stacks. Remove the 100 ms delay before double-activation requests in every game and keep the picked card visible through server preparation/confirmation instead of dropping it back when busy starts. Rejection returns the card; confirmed throws retain their existing destinations. [Verification and timing](qa/implementation/trix/shared-card-followup.md).

## Unreleased — 2026-10-09 shared hand gestures

UX-42: remove card hover and single-click effects across Hearts, Spades and Trix. Long-hold a legal card to lift and drag within a narrow path toward the table; release near the hand to return it or closer to the table to play. Double-click/tap pops and plays on turn, or queues automatic play on the next legal human turn. Recheck current legality, cancel stale gestures, and keep pass/double confirmation separate. Confirmed throws start at the lifted/drop position without changing destinations. [Design decision](planning/decisions/CR-UX-007-trix-shared-table.md), [verification](qa/implementation/trix/shared-card-followup.md).

UX-28 follow-up: clear Trix's stale connection notice after a successful resume/reconnect, preserving current game and pause behavior.

## Unreleased — 2026-10-09 table fit and individual player scores

UX-26/UX-40: remove empty Jack markers and fit larger Trix Jacks stacks into the space clear of player tags and announced cards. Shrink the shared decorative felt to 90% of its width and height, keeping all other cards and player tags at their existing sizes and coordinates.

UX-41: Trix player tags show individual current-deal points in every variant; corner boxes and the manual team table retain combined totals. Add four server-projected seat values without exposing the live ledger or changing original decisions or score rules. Team-only doubling bonuses stay in team totals.

UX-31 refinement: unavailable play/doubling cards keep full-colour ranks and suits; only their opaque white surface shifts 30% toward neutral grey. Reused across Hearts, Spades and Trix. [Verification](qa/implementation/trix/shared-card-followup.md).

## Unreleased — Trix deterministic lab extension

TLAB-01–TLAB-08: align headless Trix runs with current Solo/Partners rule profiles while preserving historical replay. Add the selectable `trix-reasoning-1.0.0` lab candidate, public-information partnership reasoning and saved action-first cues with contextual reasons. Compare every legal request, doubling, penalty and layout choice using bounded actor-only native continuations through request end. Preserve the original live policy. Feedback automation, independent strategic validation and promotion remain deferred. [Runbook](qa/evaluation/coach-lab/README.md), [extension acceptance](qa/evaluation/coach-lab/trix-gap-acceptance.md).

## Unreleased — 2026-10-08 Trix Jacks Partners twos announcement

TRX-13/14 and [CR-GAME-002](planning/decisions/CR-GAME-002-trix-jacks-twos-announcement.md): name the layout request Trix Jacks in every variant. In new Basic/Complex Partners games, automatically announce holder counts face-down only when both teams hold a two, then reveal all four original suits/owners after four turns including passes. Keep normal card legality, hand ownership and scoring. Reuse the doubled-card badge area without prompts. Preserve old Partners games under their original pins; new Partners use module 2.1.0 / rules 1.1.0. [Focused verification](qa/implementation/trix/twos-announcement.md) records current results.

## Unreleased — 2026-10-08 deterministic coach feedback lab

LAB-01–LAB-09/LAB-16 and CR-STRAT-011: add a local headless collector using the native game engine, immutable original decisions, replay/checkpoint recovery, strict actor-only review packets, bounded offline belief/alternative comparisons, offline review imports, gap proposals and reports. Support Hearts, both Spades modes and explicit V2 collection adapters for all four installed Trix variants. Paid model dispatch stays disabled; reports preserve incomplete, forced, unreviewed and unsupported cases.

LAB-02A: archive versioned action-first cues and complete saved reasons where current deterministic analysis supports them; record unsupported explanations as gaps. This adds lab content and public message contracts. Production UI delivery, stronger-policy promotion, calibrated reviewers and Tarneeb retain their separate gates. Trix numerical comparison was deferred in this original delivery and added by the extension above. [Runbook](qa/evaluation/coach-lab/README.md), [implementation evidence](qa/evaluation/coach-lab/implementation.md).

## Unreleased — 2026-10-08 shared-card and Trix follow-up

UX-26/UX-39: enlarge Trix Jacks cards and lane spacing by 15% while keeping ranks clear of player badges. Place North-seat face-down and revealed announcements on the felt outside the name tag and Jack lanes. Shorten the shared header by 20% across all games.

UX-29/UX-38: move the small non-overlay doubling prompt onto the table just above the human badge and preview selected cards there while keeping selection in the hand. Add a quick shared throw for confirmed plays in Hearts, Spades and all Trix rounds including Jacks, preserving final positions/overlap and respecting reduced motion and pause.

UX-37: show four equal score squares in a compass arrangement in the top-left corner across all games, repeating team totals at partner seats and retaining individual solo scores. Remove the visible Game heading and scope switch; kingdom totals remain in the manual Scores table. Use each game's score direction for green leaders, red trailing scores and neutral tied leaders; retain current-round player details and exact accessible totals.

UX-31 colour refinement: unavailable cards retain suit colours with roughly 10% lighter ink and a subtle opaque surface change. Remove unintended Trix recommendation borders when no coach advice exists.

UX-26/UX-36: tighten Trix layout overlap to expose ranks with suits visible on the front cards, and remove suit headers. Complete the shared South badge with rounded bottom corners, padding and a visible avatar; add a clear active-seat highlight and replace the visible Partner word with the existing accessible icon.

UX-29/UX-35: mark the kingdom owner with an avatar crown in every Trix variant. Keep a compact Double?/Double/Skip prompt above the hand; only server-eligible queens and King of Hearts remain selectable and coloured during doubling, while other cards use the shared opaque grey unavailable state.

UX-31 correction: keep unplayable hand cards fully opaque with muted surfaces and artwork across all games, so overlapping cards cannot show through.

UX-31–UX-34: give every card context one proportional face, changing only size. Use a small non-overlay Double? control with eligible selections in the full-colour hand; enlarge read-only doubled announcements by 20% and clear selections before play begins. Replace automatic request-complete dialogs with paced continuation, manual Current / Kingdom / Total scores and authenticated on-demand completed-round history from the native persisted ledger. Add generated history contracts; live Trix transport omits score ledgers while original decision-time observations remain intact.

Centre the human badge at the South table edge in Hearts, Spades and every Trix variant, with a separate table-aligned hand. Use named recent iPhone, Galaxy, Pixel and iPad landscape profiles for responsive acceptance, including all 52 readable Trix layout cards. [Design guide](docs/14-card-table-design-guide.md), [current verification](qa/implementation/trix/shared-card-followup.md).

## Unreleased — 2026-10-08 initial Trix shared-table UI

UX-25–UX-30: extract the accepted Spades card, hand, seat, count-fan, trick/history and dialog components for reuse by all four Trix variants. Replace horizontal Jack rows with compact vertical suit lanes; automatically pass a confirmed forced layout move and announce it above the avatar. Hold all four collected trick cards before the next decision/results, freeze that hold while paused and restore the mounted table immediately on resume. Remove routine context/request/score panels, move points into player tags, and keep the permanent last-trick box above the coach.

The initial doubling picker exposed eligible Q/K♥ faces, selection and confirmation/skip; UX-31 subsequently moved selection into the hand. Double-click/tap retains the selection; confirmed cards appear read-only beside their declaring seats until played. Correct the active-table contrast findings and provide complete accessible card names. Add watched Go-backed development at 4174, a [reuse guide](docs/14-card-table-design-guide.md), and [browser/profiling evidence](qa/implementation/trix/shared-table-ui.md). This initial change preserved rules, server legal candidates, stored decisions and public contracts.

## Unreleased — 2026-10-07 native Trix four-variant integration

Implement the native Trix functional scope under TRX-01–TRX-12: Basic Solo/Partners and Complex Solo/Partners, rightward turns, full kingdom/request sessions, penalty scoring, public doubles, Solo lead-source/withheld bonuses, direct team bonuses and Jack layout. Add closed generated Trix contracts, compiled catalog modes, request access units, private sequence fixtures, deterministic baseline bots/current coach, immutable saved advice/review, native recovery and React controls. Preserve Hearts/Spades and the Node reference. Installed rules/schemas use `1.0.0` and module `2.0.0`; historical draft IDs remain unchanged. TRX-D01/D02 follow the [owner-confirmed rules](docs/rules/trix.md).

Verify the local baseline across all four variants: both Complex browser sessions completed, and both original Basic games completed across restart with paused reload and earliest original saved cues. Fix selected-request review construction while preserving full archive validation. The final core run passed in 77.7 seconds and the native app is running on 4174. The combined campaign failed after 28m19s; no uninterrupted Basic browser pass or strategic-strength claim is made. [Acceptance](qa/implementation/trix/status.md) records exact evidence and remaining limits. The [delivery ledger](planning/implementation/trix/delivery.md) defers optimization, expanded strategy/48 contrast cases, future feedback-pipeline integration and the second fixture browser session per variant. The [original plan](docs/superpowers/plans/2026-10-07-trix-four-variants.md) and [scenario packet](planning/implementation/trix/scenarios-and-evaluation.md) remain historical/full-scope references, with no teaching-benefit promotion.

## Unreleased — 2026-10-07 shared card table UI

UX-24: boost the shared playback pace by 30% at all three speed presets, shortening bot-turn/bidding and trick-collection pauses while preserving saved relative speed preferences.

UX-19/UX-21 readability follow-up: fan the remaining-card backs, reduce active-card edge overlap to 8%, and inset the ranks beyond that overlap so the numbers remain visible.

UX-19 follow-up: separate the left/right trick cards with a clear gap, retaining the top/bottom edge overlap and winner depth across all current games.

UX-23 follow-up: reserve the history box from the beginning of each hand and remove its visible heading, keeping the coach in place as trick history fills or clears.

UX-21 follow-up: replace numeric remaining-card text with card-back fans that are countable at 1–4 and 5–8 and densely overlapping at 9–13, with exact accessible labels.

UX-18–UX-23: use smaller overlapping trick cards with the confirmed winner above the pile, simplified rank/suit faces, responsive overlapping hands, faded illegal cards without locks, and remaining-card counts for every seat. Keep selection's pointer target fixed while raising and tilting the face so double-click/tap plays immediately on turn or prepares while waiting. Move last-trick history above the shortened coach. Applies to Hearts Solo and both Spades variants through the shared table. [Decision](planning/decisions/CR-UX-006-card-table-experience.md), [actual verification](qa/implementation/ui-card-experience-acceptance.md).

## Unreleased — 2026-10-07 continuous local implementation

Add optional actor-only continuation planning with bounded work and exact persisted bot/coach results, an experimental Partners resource policy, and compiled non-card module installation through real persistence and authorization. Preserve current React gameplay, old policy pins and original advice. Add maintained case provenance, conservative fresh-deal evaluation and provider fixture diagnostics; no strategy or human-learning promotion. Native test invocations now stop within 30 minutes. Strict decoder/statistics improvements and a complete ten-hand request profile retain the remaining history-growth and intermittent Windows connection limitations. [Execution ledger](planning/implementation/multi-game/continuous-local-build.md) records current acceptance and deferred rule branches.

SYS-01/SYS-08: explicit native local startup gains one narrowly classified loopback connection retry within the existing deadline and optional sanitized connection spans. SQL operations and ordinary test-store connections are not retried. [Investigation and actual checks](qa/implementation/multi-game/m04f-followup/startup-connection-investigation.md) retain the unproven underlying OS cause.

MG-07/MG-08: repair saved-policy review illustrations for the experimental Partners and actor-rollout profiles. Bind dispatch to complete installed source pins, use the declared reply policy, disclose retained replies for actor-rollout, and preserve original frames and saved advice. [Focused regression evidence](qa/implementation/multi-game/m05/review-continuation-fix.md).

## Unreleased — 2026-10-06 M04F first measured slice

Reduce Spades history-copy allocations while retaining deep import isolation. Reuse validation of identical public projections within each event while preserving all viewer callbacks and distinct-output checks. Add focused native test selections, reproducible replay profiles and bounded database-stage diagnostics. [Results and remaining gates](qa/implementation/multi-game/m04f/status.md). No rule, policy, schema, UI, operation deadline or default-backend change.

## Unreleased — 2026-10-06 M04E

Connect the preserved React table, coaching, review and local accounts to one Go/PostgreSQL backend through additive generated platform contracts. Add original progressive advice and accepted-decision replay, source-bound saved advice and actor-safe possible continuations, preferences, fixture billing/family/export/deletion, and exact recovery across uncertain replies. Forward migration 010 preserves existing records and pins. Fix concurrent hint escalation and saved-delivery revocation/expiry recovery. `npm run start:go` explicitly builds and runs the native Windows app. Default Node/V1 startup remains available while complete normal Spades match evidence, cumulative-history resource work and the earlier PostgreSQL timeout investigation gate full activation. [M04E verification and remaining limits](qa/implementation/multi-game/m04e/status.md) record scoped functional acceptance. No UI redesign, live Jev/payments, hosting or strategy-strength claim.

## Unreleased — 2026-10-06 M04D scoped acceptance

Implement the finite Go-authored online demo and exact-target configurable offer backend. React demo open/choice/replay now requires validated server frames; the offline graph is removed, and the original Node service accurately reports unavailable. Add independent play/coaching grants, authoritative saved-delivery/admission/usage reads, atomic original unlock/trial receipts and source security revocation fences through forward migration 009, including legacy reservation backfill. Optional `--access-policy` selects the empty launch policy or an explicit local demonstration; omitting it preserves M04C fixtures, with cookies mode-fenced. Optional `--web web/dist` connects the public `#demo` journey only. [M04D acceptance](qa/implementation/multi-game/m04d/status.md) passes MG-15 and the MG-16 backend: 1,336 normal Go checks, 1,334 race checks, 9/9 real Go/React browser tests and 32/32 Node regressions, with expected skips recorded. M04E's complete platform/client/account integration and preserved three-mode journeys remain open. No hosting, live Jev/payments, strategy or human-learning claim.

## Unreleased — 2026-10-06 M04C

Connect the original game policies and V2 sessions to an explicit local Go/PostgreSQL API with server-issued identity, tab leases, bounded preparation, saved original advice, atomic receipts and restart recovery. Add owner-scoped account erasure through forward migration 008 and strict generated local-service contracts while preserving the existing client artifacts. [Acceptance, native database observations and remaining M04 gates](qa/implementation/multi-game/m04c/status.md). The existing React interface and TypeScript service remain active until the later client cutover.

## Unreleased — 2026-10-06 M04B

Port the exact original Hearts/Spades bot policies and coach output to Go, and add registered V2 sessions with atomic passing, immutable preparation, automatic steps and separate round/chance boundaries. Unsupported policy pins fail explicitly. Independent references cover 6,380 complete decisions, all help levels and 1,099 session checkpoints; review fixes remove internal observation JSON round trips and redundant clones while preserving numeric/Unicode import semantics. [Acceptance and remaining service gates](qa/implementation/multi-game/m04b/status.md). The existing UI and TypeScript service remain active.

## Unreleased — 2026-10-06 M04A

Complete the original Go Hearts rules, player-safe observations and compact save/replay path beyond opening passing. Preserve V1 state/events/candidates, all passing directions, scoring/moon/tied-match behavior and original saved decisions. Independent fixtures verify 668 Hearts checkpoints; native Go/race and durable next-hand recovery pass. Strict compact imports now reject `events:null`. [Evidence, initial database failure and remaining M04 gates](qa/implementation/multi-game/m04/status.md). The existing UI and TypeScript service remain active while exact policy and service ports continue.

## Unreleased — 2026-10-06 M03

Add private Go/PostgreSQL versioned records, exact replay anchors, compact current snapshots, append-only history, immutable original advice and atomic command/allowance receipts. Durable work now has duplicate suppression, finite attempt leases, stale-result fences and explicit retry; grant/trial/unit records preserve purchased terms and original charges. Migration 007 shares the existing Node migration ledger. [M03 scope, verification and limits](qa/implementation/multi-game/m03/status.md). The current TypeScript app and UI remain active; M04 owns replacement-service integration.

Close the completed Go/Node comparison and remove 1.33 GB of disposable artifacts while preserving evidence and database data. Native Windows is the selected local workflow for Node, Go and PostgreSQL.

## Unreleased — 2026-10-06 UTC

Correct the M02A performance comparison and provide native Windows Node/Go/PostgreSQL setup. Pin the maintained Go 1.26.8 toolchain after a reproducible 1.27.1 Windows profiling crash. Add immutable typed snapshots, reuse actor projections, and encode evidence frames once; the unexposed HTTP/database seam uses the same state boundary. Original contract/checkpoint evidence and the current TypeScript/UI behavior remain unchanged. [Findings and exact verification](qa/implementation/multi-game/performance-windows/report.md), [architecture amendment](planning/decisions/CR-ARCH-004-native-windows-performance.md).

## Unreleased — 2026-10-05

M02A: add an unexposed Go/PostgreSQL compatibility slice with generated strict public contracts, frozen deterministic primitives, independent Spades replay, representative Hearts passing/scoring, bounded execution and disposable database tests. Preserve the current TypeScript app, React UI, policy pins and original evidence. [Acceptance and limits](qa/implementation/multi-game/m02a/status.md); M03 durable records are next. This does not activate a replacement server or establish better performance/strategy.

## Unreleased — 2026-10-02

[CR-STRAT-010](planning/decisions/CR-STRAT-010-observed-cases-and-browser-baseline.md): add selectable `spades-cases-4.0.0` and authored cues for partner spade conservation, lost lead access, proved remaining sweeps and unbeatable leads. Preserve the existing default and frozen baseline. Pin each game's policy and retain private original bot analyses; saved decisions and later trials retain their source policy. Add source-linked counterexamples and a [real browser baseline protocol](qa/experiments/2026-10-02-browser-baseline/README.md), with separate Luna player/observer evidence. Runtime Jev stays off; strategic-strength and human-learning gates remain open.

## Unreleased — 2026-10-01

Added RD-01–RD-04 selected opening deals for local training and repeatable tests: server-only versioned JSON fixtures, an opt-in practice picker, saved-deal replay and strict validation/visibility checks. Normal games retain cryptographic Fisher–Yates shuffling. Hosted fixture overrides remain blocked. [CR-DEV-001](planning/decisions/CR-DEV-001-selected-deals.md) · [usage](planning/dev-deals.md) · [acceptance](qa/implementation/selected-deals-acceptance.md).

Repaired a pre-existing missing Hearts plan trace field so the combined branch typechecks; live Hearts choices are unchanged.

## Unreleased — 2026-09-30

Added [automated authored-hand research collection](qa/experiments/2026-09-30-expanded-batch/results.md), exact prompt/response evidence, an owner-directed Sol-to-Luna model switch, preserved historical choices, and checks of specific public-card explanations. Completion is reported per hand; runtime rules, bots and coaching policies are unchanged.

## Unreleased — 2026-09-29

Owner-directed [CR-STRAT-009](planning/decisions/CR-STRAT-009-game-plan-and-strength-gate.md): generic game plan layer, frozen Spades baseline, selectable Spades plan profiles, case store and strength gate. Default policies, rules, scoring and the Jev boundary are unchanged.

## 0.2.0 — 2026-09-26

Incorporates the owner's additional requirements before implementation: future four-player card games, individual or two-pair competition, new capabilities, and minimal visuals. Adds normative multi-game module interfaces, generic envelopes, explicit competition, capability negotiation, extension conformance, UI seams, version isolation and a next-game work packet. Spades remains the only first-release production game.

## 0.1.0 — 2026-09-26

Initial researched planning baseline: Jev-only bounded strategy; deterministic partnership Spades; exact failed-Nil/bag conventions; fair-information coaching; responsive TypeScript app; server-authoritative state; source research, evaluation and agent handoff.

Neither version is an implementation, live model evaluation, deployment or completed user study.
