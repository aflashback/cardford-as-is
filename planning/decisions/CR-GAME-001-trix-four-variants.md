# CR-GAME-001 — Four Trix variants on the Go platform

Date: 2026-10-07. **Status: owner-approved scope and doubling semantics; native local functional baseline delivered and verified across all four variants. Basic completion was verified across restart; the combined resource gate remains unpassed.** [Current acceptance](../../qa/implementation/trix/status.md) · [Delivery ledger](../implementation/trix/delivery.md).

## Decision and authority

The owner requested Trix Basic Solo/Partners and Trix Complex Solo/Partners, beginning with Basic. This expands the earlier M09 scope of Trix Solo and Complex Partners. Preserve Hearts and both Spades variants.

Use one compiled Go Trix family with four explicit profiles, one shared request engine and separate individual/team objectives. Preserve the React client, native Go/PostgreSQL session service, player-safe observations and immutable advice. Bots and the current coach use the same deterministic policy under [CR-STRAT-011](CR-STRAT-011-deterministic-feedback-lab.md); no runtime model or Jev deliverable is introduced.

The owner's scoring, Jack layout, initial 7♥ owner and counterclockwise direction take precedence. [The rule specification](../../docs/rules/trix.md) records the confirmed rules. TRX-D01/D02 are resolved by explicit owner answers; rule approval does not enable a catalog entry.

### Confirmed doubling amendment

- One public declaration turn per seat, owner then rightward; declare eligible cards together or decline before play.
- Capturer pays −50/−150. Partners award +25/+75 directly to the team opposite the capturing team, including announcer/teammate captures.
- Solo awards another player's capture bonus to the announcer. Self-capture awards it to the current external leader, otherwise the last player who handed over the lead in that deal. If none exists, withhold the bonus.
- Persist/replay public lead provenance and reset on each deal; score each doubled card separately. Complex's other components remain additive.
- This rejects the draft.2 self-credit proposal. Solo score totals must subtract withheld bonuses; Partners totals retain the zero-sum kingdom invariant.

Owner approval includes the rare opening-streak/no-bonus case even though the owner expects rational players to avoid it. Do not prohibit that legal play or silently credit the announcer. Record direct team credits instead of choosing a fictional seat recipient.

## Why / alternatives

- Current Go `SessionModel`, compiled registrations and durable records already support actor, automatic, chance and round-boundary work.
- Four copied engines would duplicate fixes. A universal rules language would add unnecessary scope. Use typed Trix code with Basic/Complex scheduling and Solo/Partners competition axes.
- Extending the legacy Spades/Hearts observation would give layout and selection fake bid/trick meanings. Add registered Trix packets and presentation instead.

## Compatibility and affected work

The [Trix implementation plan](../../docs/superpowers/plans/2026-10-07-trix-four-variants.md) replaces **Trix-specific** TypeScript file proposals and the two-variant limit in the earlier M09/game packet. It does not change Tarneeb rules or claim other milestones complete. Earlier Trix draft dossiers remain research history; new playable IDs are explicit in the new rule specification.

The feedback-lab plan must register all four Trix objectives after their engine gates. Existing lab work and historical experiments stay unchanged. Do not require the whole feedback lab to finish before Trix can be played locally; strategy promotion remains a separate gate.

Public behavior requirements: **TRX-01–TRX-12** in the plan. Tests affected: generated contracts, direction/rules/scoring, observation isolation, complete sessions, persisted recovery, policy/coaching identity, access, React controls and variant-specific evaluation. Existing current-game compatibility tests remain gates.

## Approval and delivery boundary

The original approval covered investigation, planning and this confirmed doubling revision. The owner subsequently authorized the complete native four-variant implementation, recorded in the [delivery ledger](../implementation/trix/delivery.md). The Go module, registered contracts/service, deterministic baseline and React table are implemented and the local functional baseline is verified. Both Complex browser sessions completed; both original Basic games completed across restart with paused reload and earliest saved review checks. The combined resource campaign remains failed, and no uninterrupted Basic browser pass is claimed. Installed rule profiles use `1.0.0`, module `2.0.0`, and state/observation/public/event schemas `1.0.0`, implementing the revised draft.3 semantics. Prior draft IDs and historical advice remain immutable. Prices, paid experiments, hosting, multiplayer activation and strategic-strength claims remain outside this approval.

Documentation changelog: adds the four-profile rule design, native implementation sequence and reusable scenario/evaluation packet; applies the owner's resolved doubling procedure, recipient routing, public lead tracking, withheld-bonus exception and revised arithmetic/cue fixtures. Acceptance evidence is document consistency, independent review and arithmetic checks; future game-engine checks are not results.

## Historical documentation revision verification — 7 October 2026

- Passed: inline Node document validation across 14 files, 168 local link targets, three new section anchors and 12 distinct doubling cases; no broken targets or stale active doubling gates.
- Passed: 64 recipient combinations plus lead-transfer/reset, Complex arithmetic and withheld-bonus total examples. The initial scratch checker distinguished JavaScript `0` from `-0`; its comparison was corrected and the full arithmetic check rerun successfully. These are specification checks, not a production scorer.
- Passed: independent document review; its stale active-ledger finding was corrected. Historical M00/M01 execution evidence remains unchanged. `git diff --check` exited 0.
- Not run: Trix engine, policy, persistence or browser tests; game implementation remains pending. No provider calls, runtime changes, commits or branch merges in this documentation revision.
