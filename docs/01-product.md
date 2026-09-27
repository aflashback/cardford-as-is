# 01 — Product requirements

**Product:** Card Coach (working title, not a cleared brand) · **Release:** v0.2 specification / first private prototype

## Outcome and audience

Help a beginner learn legal play and scoring, then help an improving player notice bidding, partnership, Nil, trump and bag-management decisions. The app must make an ordinary hand teachable without turning each card into a long lecture. It is not a gambling product or a general-purpose chat assistant.

The first-session success condition is: a person opens the app on a phone, starts a guided hand without registration, understands whose turn it is, finishes the hand, reviews one meaningful moment and tries a related drill.

## Modes

**Guided hand** is the default. One deal, South as human, three Jev seats, progressive hints, short post-action notes and end-of-hand review. A contextual rule explanation is always available.

**Practice hand** hides unsolicited advice but allows a requested hint. Record hinted/unhinted attempts separately. It uses the same rule profile and bot strength; difficulty initially changes instructional support, not an invented bot rating.

**Full match** repeats hands to 500, preserves scores/bags and offers review between deals. The user advances to the next deal explicitly.

**Drills** are twelve authored, versioned exercises, each tied to one skill and independently verified accepted answers. A drill can use a clearly marked simplified/full-information teaching position; it must not be confused with a normal hidden-hand game.

## Functional requirements and acceptance

| ID | Requirement | Acceptance evidence |
|---|---|---|
| FR-01 | Start/resume/delete guest sessions | No account required; refresh or API restart returns the same committed position; clear device-data deletion path |
| FR-02 | Play an entire hand/match | Bid, play, trick resolution, score breakdown and next hand; only legal actions accepted |
| FR-03 | Progressive hints | Three stages: concept, exact situational facts, then Jev's suggested action; hint level is recorded |
| FR-04 | Brief feedback | At most one short inline note per human action; facts/provisional strategy distinguished; no future-card leakage |
| FR-05 | Review a hand | Navigate every human decision; show up to three selected moments with original information and advice provenance |
| FR-06 | Retry a decision | Fork the pre-decision state without changing the original; mark replay contamination after cards were revealed |
| FR-07 | Practise skills | Twelve original drills with accepted action sets, explanations and validation records |
| FR-08 | Show learning progress | Per-skill drill attempts, unaided completions, hint usage and recent practice; no inferred Elo or strategic accuracy |
| FR-09 | Explain rules/scoring | Rule drawer includes the exact active variant, Nil and bag behavior; score breakdown reconciles to totals |
| FR-10 | Work across form factors | Phone portrait, phone landscape, tablet and desktop; keyboard-only and screen-reader operation |
| FR-11 | Identify intelligence mode | Real Jev, forced move, and demo/basic bot are distinguishable; outages never silently impersonate Jev |
| FR-12 | Recover safely | Stale actions, duplicate taps, timeout, reload and restart do not corrupt a hand or duplicate a score |
| FR-13 | Inspect decision provenance | Review shows model version and recommendation status; operator diagnostics show exact local observation/prompt versions |
| FR-14 | Preserve fair information | No hidden card values in human-facing payloads before allowed reveal; every bot has a separate view |
| FR-15 | Resume learning on this browser | Guest session cookie restores history; no cross-device identity or sync promise in the first release |
| FR-16 | Reveal after completion | Optional completed-hand reveal, with label; does not recompute or overwrite original fair-information advice |
| FR-17 | Add games without rewriting the platform | Game ID, variant, module version, typed actions/observations and capability-driven UI; test-only alternate module passes conformance |
| FR-18 | Model individual and pair competition | Explicit four singleton competitors or two disjoint two-seat teams; shared services never assume a partner |
| FR-19 | Keep presentation minimal | Four simple icons/initials, readable cards and status; no 3D renderer, animated character or decorative asset dependency |

## User stories that drive the interface

A novice selecting an unavailable spade sees why it cannot be led, without losing a turn. A player uncertain about bidding can inspect their code-computed hand facts and then ask for Jev's suggestion. A player surprised by a score can see contract points, Nil adjustments, bag points and penalties separately. A returning learner can resume immediately rather than recreate an account or read a tutorial again.

An experienced player can disagree with Jev without being marked wrong. Their different move remains a legitimate comparison unless a separately verified rule or scenario proves otherwise.

## Nonfunctional acceptance targets

These are proposed targets to measure, not achieved benchmarks. Deterministic engine transitions should be below 10ms p95 on the declared test host. Local UI selection should respond within 100ms p95. A completed non-forced bot action should be visible within 2.5s p95 under the measured pilot workload; the hard provider deadline is 4s. At the deadline, display recovery instead of an endless spinner.

Start with ten concurrent active sessions on a declared single-host configuration. Test a bounded request queue and record p50/p95 latency and failure rate. No promise of enterprise scale, global availability or offline Jev gameplay is made.

## Scope exclusions

No monetization, ads, billing, multiplayer, rankings, tournament integrations, payments, real-money stakes, free-form chat, speech, camera card recognition, native apps, a second production game engine, custom rule editor, fine-tuning, reinforcement-learning training, graph database, Redis, Kubernetes, or runtime multi-agent orchestration.

No import/export of real external games in the first release. Do not create account/authentication complexity solely for this prototype; a secure server-owned anonymous identity is sufficient.

## Definition of a working release

All FR requirements have passing tests or explicit, owner-approved exceptions. Real Jev has completed at least the smoke session and evaluation gates. The app runs from documented local instructions and a reproducible single-host deployment. A basic-bot demo alone is useful development progress, not fulfillment of the Jev requirement.
