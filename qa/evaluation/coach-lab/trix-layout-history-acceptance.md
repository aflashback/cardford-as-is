# Trix Jacks chronology acceptance — 9 October 2026

Scope: CFL-05 public chronological history and CFL-06 the first saved Jacks case. The implementation keeps the live default deterministic policy, game scoring and existing archived information unchanged. It adds evidence for later strategy development; it does not establish stronger bot play.

## Implemented behavior

New module `2.2.0` sessions in all four Trix variants expose public schema `1.2.0` with available per-deal chronology. Each accepted layout placement or pass retains seat, ordinal, board/counts before action, and announcement information public at that time. New requests reset the history. Copies do not share writable history slices.

Native validation checks chronological consistency, public ownership, legal frontier changes, counts, turn rotation, finishes, forced passes and reveal timing. Feasible-hand comparisons restore the recorded cards to their owners, replay native actions and require the resulting actor observation to match. Historical `2.0.0` games and Partners `2.1.0` games retain their pins and original absence of chronology.

The selectable history candidate saves exact known-choice facts and conditional behavioral interpretations. Only already-public later placements in the frozen prefix, or the observing actor's own cards, can prove an earlier alternative. Forced and unknown choices remain distinct. These new signals change no candidate action weights. Bot action and coach evidence still come from the same deterministic decision.

Blind exports preserve the actor-safe chronology. Retrospectives append observed turns once, reset on a new deal, explicitly clear absent chronology and distinguish observation records from executed moves. Their versioned `trix-layout-turn-delta-1.0.0` encoding anchors each deal, derives unchanged board/count snapshots from the preceding captured action, and explicitly records announcement changes. Decoding restores the original snapshots exactly; no turns are truncated. Native audits now also reject forged fact kinds/candidate bindings and changed objective metadata.

## Focused verification

- Native chronology capture, deep-copy/reset, tampering and current/historical profile tests.
- Actor-safe frozen-prefix evidence, voluntary versus forced/unknown choices, malformed-history rejection and unchanged action ranking.
- Current-profile alternative evaluation in all four variants; exact historical announcement-profile replay.
- HTTP service restart and all six historical record profiles, including original-byte preservation.
- Public contract generation/validation, blind export, retrospective reset/reveal timing, exact pin admission and both TypeScript projects.

The initial integrated `lab:check` passed 66 Node checks and six native packages, including the complete native coach-lab suite (341.365 seconds). It exposed outdated Trix test fixtures that paired a historical observation with the new current pin. Those fixtures were corrected without loosening production admission; the complete Trix package then passed in 40.894 seconds. HTTP/service and all six historical record-profile tests passed separately.

A real completed-game check also exposed oversized Basic Partners retrospectives. After the lossless compaction repair, all **67** lab Node tests, both TypeScript projects and schema checks passed. Independent review found no remaining actionable issue. The follow-up verified that the only source changes since the initial run were three historical test files and the retrospective exporter; native production and decision-policy source bytes are unchanged. This is combined initial/follow-up verification, not a claim that the original failed `lab:check` receipt passed.

Receipts: `.local/evaluation/coach-lab/checks/2026-10-09T12-42-02.444Z.json`, `.local/evaluation/coach-lab/layout-history-work/native-report.md`, and `.local/evaluation/coach-lab/layout-history-work/check-followup.json`. Final checked source digest: `a7ea9a59188eb9de692bd3eeed84f70ab5168afcdb1827a61ead7b1932072a5e`. The named-case protocol/results live in [the case study](trix-layout-case-study.md).

## Fresh headless evidence

| Run | Complete sessions | Deals | Decisions | Layout decisions / blind history exports |
| --- | ---: | ---: | ---: | ---: |
| `jacks-history-complex-20261009` | 2 | 16 | 928 | 464 |
| `jacks-history-basic-20261009` | 2 | 40 | 2,294 | 526 |

All 3,222 decisions passed mechanical audit, with zero failed checks. Strategic correctness remains pending. The 124 history-policy layout decisions include 113 traces with provable voluntary-choice evidence and 61 with conditional repeated-upper-play evidence. These overlapping counts establish exercised features, not accuracy or independent case counts. Both comparison arms had equal session results; no strength gain is claimed.

The current Complex archive completed all eight requested two-world comparisons, including layout decisions, with 920 other decisions still pending. Five evaluated decisions were unforced; the report correctly gives forced moves no strategic review credit. Reports and feedback hypotheses were generated for both runs; human/model review coverage remains zero.

All 990 layout blind exports preserve the full decision-time history. For each of the four sessions, the largest actor/coach bundle was a genuinely forced decision, so complete retrospective testing required no fabricated reviewer judgment. Every recorded prefix decodes exactly, including boards, counts and reveal timing. Complex packet sizes are 252,257 bytes each; Basic sizes are 505,098 and 505,933 bytes, below the unchanged 524,288-byte limit. Larger future packets still fail explicitly rather than truncate. See `.local/evaluation/coach-lab/layout-history-work/current-pipeline-verification.json` and its retained verification script.

Collection used source digest `4944b78f395cf977b7c860f44e1bd1d3d0bcce748cd0718e200f624b82bdea9c` and retained worker digest `07b167bbcdd3ba0b1cc27c6f40d0a48366d84d32b15f58cf330543ca75169ad7`. Original manifests, frozen builds, native exports and game outcomes were preserved through the export/test-only follow-up. Run artifacts and readable `report.md` files are under `.local/evaluation/coach-lab/runs/<run-id>/`.

## Repeatable operator sequence

From `C:\repos\test-jev`:

```powershell
npm run lab:check
npm run lab:init -- --run-id jacks-history-first --game trix-complex-partners --candidate-policy trix-history-1.0.0 --reference-policy trix-reasoning-1.0.0
npm run lab:run -- --manifest .local/evaluation/coach-lab/manifests/jacks-history-first.json
node scripts/coach-lab.mjs audit --manifest .local/evaluation/coach-lab/manifests/jacks-history-first.json
npm run lab:report -- --manifest .local/evaluation/coach-lab/manifests/jacks-history-first.json
```

Use a fresh run ID on repeats. Start with `report.md`, then inspect a layout decision's `actorPacket.observation.layoutHistory` and history policy `originalAnalysis.historyEvidence.signals` / `factCatalog`. The report counts completed work and gaps; it is not a coaching accuracy percentage. For Basic Partners use `--game trix-basic-partners` with a different ID.

Run the named J♦/10♠ diagnostic using the separate command in [its runbook](trix-layout-case-study.md). Its output directory must be new, and its default immutable source archive must remain available. Review adverse outcomes before proposing any new rule. A proposed rule then needs focused positive/negative cases followed by the existing frozen development/fresh-validation session protocol.
