# Build kickoff — give this to the lead coding agent

You are implementing **Card Coach (Spades first)**, a coaching-first responsive web application, from this specification directory. This file is an instruction for a future build; the directory itself is a planning artifact.

Read `AGENTS.md`, `README.md`, all numbered documents, the source findings and machine-readable contracts before selecting implementation boundaries. The owner has authorized the technical defaults in the pack. Do not ask them to choose a framework, database, rule variant or deployment platform unless an actual new constraint cannot be resolved from the specification.

## Required outcome

Deliver a complete, runnable, phone/desktop web app in which one human plays South and Jev controls three seats. Use a reusable four-seat platform with trusted replaceable game modules. Support individual and two-team competition in shared contracts; implement only the Spades production game plus the required test-only individual module. Keep UI to readable cards, four simple icons/initials and a coach panel. Code implements all rules, scoring, legal options, information permissions, persistence, replay and factual explanations. Jev chooses bids/cards from legal candidates and supplies human recommendations. No generative runtime model, fabricated confidence interpretation or hidden-information advantage is allowed.

Implement the full coaching loop: guided hand, independent practice, full match, staged hints, short factual feedback, hand review, immutable retry branches, twelve original complete drills and assistance-aware progress. Respect the explicit rule profile and failed-Nil scoring convention. Do not ship buttons backed only by placeholder alerts.

## First work

Inspect the empty or existing repository before modifying it. Produce a concise file-ownership/work-package plan and identify conflicts with this specification. Resolve compatible dependency patches and lock them; the selected major versions are a baseline, not proof of compatibility.

Start W00, the G0 Jev capability spike and W02 deterministic engine. Use real authenticated Jev only when credentials are available through the environment. Never ask for a key to be pasted into chat or commit it. Without credentials, implement fake-server contract tests and an explicit demo mode, and mark live G0 blocked. Do not report a live call that did not happen.

Freeze contracts through the lead integrator before parallel subagents work. Assign the bounded packets in `AGENT-WORK-PACKETS.md`. Keep shared DTOs generated from schemas. Run tests as modules land; integrate a complete vertical slice before polishing optional UI details.

## Hard checks before claiming success

Pass game/scoring/property tests, information-set invariance, stale/duplicate command and provider races, guest authorization, provider shape/timeout failures, template predicates, all drill answers, restart/resume and deletion. Run phone/desktop/keyboard tests and capture actual screenshots. Demonstrate a completed hand in demo mode and, separately, real Jev mode when authenticated.

A successful legal game is not evidence of good strategy. Execute the evaluation plan, preserve failures and uncertainty, and do not use Jev to grade itself. Review uses the original pre-action observation, never later hidden cards. A different legal move receives neutral feedback unless an authored exact objective proves it fails.

## Final delivery

Provide the repository, exact run/test/build commands, environment setup without secrets, reproducible container configuration, migration and backup/restore instructions, architecture changes, screenshots, test/evaluation reports and known limitations. Distinguish mock/demo/live evidence. Update the traceability map and changelog.

Continue through the bounded implementation steps rather than stopping after scaffolding. When a real external dependency blocks a gate, finish independent work and report the precise blocker honestly. Do not remove the gate, invent a result, silently swap in a frontier model, or call a fixture-only mockup the completed product.
