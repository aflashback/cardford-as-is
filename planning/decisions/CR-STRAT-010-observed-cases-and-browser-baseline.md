# CR-STRAT-010 — Observed Spades cases and browser baseline

**Owner authorization:** 2 October 2026: plan and implement useful cases from the collected sessions; then a Luna player and separate Luna observer evaluate real browser games against three programmed bots. Maximum 10 Solo and 10 Partners games. Wait for selected-deal implementation, tests and merge before integration or browser evaluation.

**Status:** implementation verified; browser baseline in progress. Dependency `21cf9df` is tested and merged into `main`. This record authorizes a selectable local candidate, not a strategic-strength claim or default promotion.

## Evidence and admission

All three discovery archives are inputs: `2026-09-30-agent-scenario-lab`, `2026-09-30-two-suit-batch`, and `2026-09-30-expanded-batch`. Read-only review replayed 706 accepted decisions: 11 complete hands, three partial hands and two unstarted setups. These are development evidence. Player explanations are hypotheses, not labels for the best move.

| Requirement | Admit | Boundary / counterexample |
|---|---|---|
| CASE-01 | Preserve a positive partner's useful spades when opponents are proved out of spades, partner is proved out of an offered side suit, own high spade retains an entry, and the positive team contract still needs tricks. | A conditional preference, never a promised outcome. Require all four bids positive; disable for Solo, any Nil (live or failed), fulfilled contract, uncertain opponent trump, or missing own entry. Competing Nil priorities need separate evidence. |
| CASE-02 | Prove no future own trick when the actor holds only one side suit, owns every remaining card of it, cannot win the current different-suit trick, and history is complete. | One outside card, another held suit/trump, leading now or incomplete history removes the proof. No claim that the teammate cannot score. |
| CASE-03 | Recognize a forced remaining sweep only with a proved next leader, complete history, no outside trump after the current trick, and a proved monopoly of that leader's remaining suit. | Unknown trump, another lead route or an unproved winner removes certainty. Equivalent defender discards get no single preferred-card cue. |
| CASE-04 | Say a selected lead is unbeatable when public facts prove it. | A merely highest side-suit card still needs trump-risk qualification. Wording must refer to the selected action. |
| CASE-05 | Existing ownership, void, Nil, partner-winner and bidding behavior becomes source-linked regression coverage. | Do not tune bids to reproduce an LLM's bid or a single realized deal. The current bidder already counts the five top spades conservatively. |

Keep higher-card withholding and high discards uncertain. Do not install declared partner conventions, inferred probabilities, learned weights or a universal diamond-example rule.

## Integration

Reuse seat observations, exact facts, competition declarations, the plan layer, policy registry and cue registry. Add `spades-cases-4.0.0` and its own cue version. The frozen `spades-tactics-2.1.0` and the live default retain their behavior. `SPADES_POLICY` selects the local comparison arm for new games.

| Requirement | Contract |
|---|---|
| CASE-06 | Bots and human coach consume the same registered analysis. Cue preferences affect display only; original saved advice never changes. |
| AUDIT-01 | New games pin their resolved policy. Restart configuration cannot change their future bot or human analysis, including searched profiles and later hands. Legacy attribution is explicit; historical provenance is not invented. |
| AUDIT-02 | Save a private, immutable original analysis for each committed bot move, with pre-action revision, seat-safe observation, policy and action. Prepare outside transactions; commit with existing version, authorization and idempotency checks. |
| AUDIT-03 | Read legacy action-only jobs without fabricating original analysis. Public views exclude bot observations, audits, private deals and hashes. |

No rule, scoring, visibility or runtime-model boundary changes. Jev remains off. No public DTO extension is needed for the private audit. Earlier analyses and experimental source files are retained byte-for-byte.

## Browser baseline protocol

**Twelve measured single-hand games:** three fixed deal groups × two modes × old/candidate policy. Six Solo and six Partners total. Two unused automatic Partners bootstrap sessions are also counted: expected 14 created sessions, six Solo and eight Partners. Count aborted starts; stop before 10 starts in either mode. No unrecorded warmup games. Ordinary engine tests are reported separately.

Pin fixtures before play. Cover control/entry, Nil and partner-resource shapes; rotate strong hands into bot seats. Both arms receive the same opening cards/dealer and zero opening scores/bags. This does not evaluate late-match or accumulated-bag strategy.

The Luna player receives South's own cards, public history, rules, goal and legal choices only. Fresh context per decision; GPT-6 Luna at extra-high. A mechanical Playwright driver submits its chosen action through actual DOM controls. Real server bots choose the other moves. No mocked API, screenshots, injected moves, engine simulation or hidden deal is used by the player. Identical safe packets may reuse a recorded player choice across paired arms, with reuse identified.

A separate Luna observer reviews public packets captured after tricks 3, 7 and 11 and sends nothing to the player. Private bot observations and original analyses become available for retrospective audit only after the hand ends. Its bounded retrospective sample takes at most eight original bot decisions: matched cases first, bids second, then chronological moves. Complete audits are saved for deterministic checks. Save public responses/revisions, DOM action evidence, original player outputs, observer outputs, actual actions/results, configuration and source hashes. Store no auth secrets.

After each completed hand, use the review UI to display one original saved coach response and compare its text to the saved snapshot. Prefer an observed-case decision, otherwise the first play. This happens after play and cannot inform the Luna player's choices.

Report per mode: points and margins, contracts/Nil/bags, forced versus chosen actions, case occurrences and missed cases, original bot analysis, coach fact/selection fidelity, abstentions, and old/candidate disagreements. Separate browser outcomes from earlier text-discovery outcomes and offline shadow diagnostics. Luna judgments are agent evidence. Three paired deals cannot establish overall strength or pass CR-STRAT-009; later Jev and human comparisons use these records plus fresh held-out deals.

**Alternatives:** copying LLM moves would overfit; replacing the full policy with a model violates the current runtime boundary; broad weight tuning lacks evidence. Narrow predicates plus explicit counterexamples fit the existing architecture.
