# Collection data contract

Proposed contract version `trix-scenario-collection-1.0.0`. This document defines records to implement after plan approval; it is not a claim that current lab validators admit them. Close every JSON object to unknown fields, generate TS/Go bindings from the future shared schemas, and verify semantic bindings in code. The two prepared response schemas are syntax contracts; native legality is an additional check.

## On-disk layout

```text
.local/evaluation/trix-scenarios/<runId>/
  manifest.json                  immutable frozen campaign, hashes and runtime admission
  build/source/                  immutable allowlisted source bytes, including dirty files
  build/native/                  exact native executable plus build/runtime receipts
  private/deals.jsonl             decks, private seeds, family lineage and admission rejects
  private/journal.jsonl           fsynced hash chain, responses and transitions by reference
  private/checkpoints/            immutable native snapshots plus resume receipts
  private/host-transcripts/       full invocation receipts; never player-readable exports
  blobs/<sha256>                  exact UTF-8 inputs/outputs and canonical JSON records
  outbox/<jobId>.json             one pending actor or review job
  outbox/<jobId>.prompt.txt       exact rendered prompt
  inbox/                         quarantined responses, host receipts and model reviews
  decisions.jsonl                external-player decision records with blob references
  outcomes.jsonl                 completed/incomplete request receipts and native scores
  reviews/decision.jsonl          original actor-information reviews
  reviews/retrospective.jsonl     later outcome reviews, separately linked
  exports/<exportVersion>/
    cases.jsonl
    category-strategies.jsonl
    coverage.json
    casebook.md
    source-manifest.json          safe provenance and hashes, no secret reconstruction data
```

JSONL files are append-only journals or derived versioned snapshots, explicitly distinguished in the manifest. The durable journal is authoritative; interrupted export generation can rebuild projections. All files live under a containment-checked private run root. Refuse symlink/path escapes. A path named `private` is not a model-access security boundary; accepted player invocations must separately pass the tool/context isolation gate.

## Primitive types

`Hash` = lowercase 64-character SHA-256. `Seat` = native integer 0..3 with mapping **0=S, 1=W, 2=N, 3=E**. `SeatLabel` = S/E/N/W. `Variant` = basic-solo/complex-solo/basic-partners/complex-partners. `Request` = diamonds/king/queens/lutoosh/complex. `Objective` = own-request-points/combined-team-request-points. `Ref` = immutable blob/record ID plus digest, never an unchecked arbitrary path. Dates are ISO UTC instants; user reports use America/Toronto. `Pin` is the existing complete native `gamekernel.Pin`.

`NativeActorPacket` retains the original complete `RegisteredActorPacket` from Go. `PlayerPacket` is the separately versioned allowlist below. Do not label a reduced projection as the native packet. The bridge never sends the private aggregate or seed, even if the receiver is called a reviewer.

## Record fields

| Record | Required fields and meaning |
|---|---|
| Frozen manifest | `schemaVersion, runId, corpusId, status, campaignPlanHash, sourceCommit, sourceHashes, dirtySourceDigest, sourceArchiveRef, nativeBinaryHash, nativeBinaryRef, buildReceiptRef, cliVersion, pinsByVariant, promptHashes, schemaHashes, taxonomyHash, phaseScheduleRef, modelRequest, hostCapabilityReceiptRef, workCaps, createdAt`. `sourceCommit` alone is insufficient for a dirty tree. Preserve exact allowlisted source bytes (including relevant uncommitted/untracked files), native binary and prompt/schema assets. Verify their hashes on resume; never rely on hashes to recover missing bytes. Private seed schedule is a reference outside model packets. |
| PlayerPacket | `schemaVersion, invocationId, actor, actorLabel, nativeRevision, gameId, variant, request, pin, sharedRulesHash, sharedGameDescriptor, rulesAndScoring, seatAndCompetition, objective, ownHand, handCounts, publicPhaseAndTurn, declarations, completedTricks, currentTrick, publicScoresAndBonusFacts, legalOptions`. `ownHand` has only actor cards in requested notation. Public H7-owner fact, trick chronology and last-external-leader bonus provenance must survive projection. No category target, answer cue, private seed, future event, other rationale or arbitrary text extension. |
| Pending job | `schemaVersion, jobId, runId, episodeId, decisionId, actor, revision, phase, expectedNativePin, packetRef, packetHash, promptRef, promptHash, sharedRulesHash, responseSchemaHash, requestedModel, requestedEffort, attempt, deadlineAt, idempotencyKey`. Model-visible invocation IDs are opaque; family/seed information stays outside the prompt. |
| Host receipt | `schemaVersion, jobId, dispatchToken, promptHash, responseHash, hostAgentId, requestedModel, requestedEffort, effectiveConfigurationEvidenceRef, reportedModelId, reportedModelAvailability, contextMode, toolTranscriptRef, toolCallCount, inspectionStatus, startedAt, finishedAt, usage, dispatchStatus`. `reportedModelId` may be null only if the host verifies the effective requested configuration but does not expose a resolved backend revision; record that limitation. Missing configuration verification is fatal. Never use model-written identity as host evidence. Failed dispatches may have null responseHash/hostAgentId with a trusted failure receipt; they cannot enter accepted data. |
| External decision | `schemaVersion=trix-external-player-decision-1.0.0, source=offline-llm-player, decisionId, runId, familyId, episodeId, revision, actor, pin, phase, request, objective, forced, selectionSource, nativeActorPacketRef, playerPacketRef, inputDigest, legalCandidates, attempts, acceptedAttemptId, selectedCandidateId, acceptedResponseRef, rationaleRef, confidence, commitRef, status`. `selectionSource` is model or scheduled-request; request scheduling has no invented rationale/confidence/accepted model attempt and stays outside the strategic case list. Model records never contain fake `registeredAnalysis`, `DecisionTrace` or production `policyPin`. |
| Attempt | `attemptId, jobId, dispatchToken, claimedAt, inputRef, rawOutputRef, hostReceiptRef, validationStatus, errors, responseReceivedAt, parsedResponse`. Claim is persisted and budget-counted before invoking the host. No returned response means rawOutputRef/responseReceivedAt/parsedResponse are null, not an uncounted attempt. Preserve malformed/late/tool-contaminated outputs. Failed parse gives null parsed response; successful parse alone does not imply legal/native acceptance. |
| Commit | `decisionId, expectedRevision, nextRevision, candidateId, responseHash, nativeBeforeDigest, nativeAfterDigest, privateEventRefs, sequence, previousJournalHash, journalHash`. Advance only once. A response with the right card but wrong job/seat/revision is stale and rejected. |
| Outcome | `schemaVersion, episodeId, familyId, pin, request, status, completedTricks, acceptedPlays, scheduledRequestRef, declarationRefs, playDecisionRefs, nativeTerminalPhase, scoreTotals, componentTotals, ledgerRef, withheldBonuses, replayReceiptRef, incompleteReason`. Completed means 13 tricks/52 unique plays and native round-complete; no fabricated session-complete flag. |
| Decision review | Fields defined by the decision-review template plus `reviewId, reviewerReceiptRef, createdAt, acceptedProofRefs, validationStatus`. Prompt confidence omitted for initial review. Review is an LLM proposal unless independently verified fields are explicitly stamped with native proof evidence. |
| Retrospective review | Fields in the game-review template plus `reviewId, frozenDecisionReviewDigest, reviewerReceiptRef, createdAt`. It cannot edit the frozen actor review or introduce a new actor-time correction from later cards. |
| Curated case | `schemaVersion=trix-coaching-case-1.0.0, corpusId, caseId, exportVersion, decisionId, familyId, variant, request, pin, objective, actor, stage, primaryCategory, tags, actorPacket, originalChoice, originalRationale, selfReportedConfidence, rationaleAssessment, actionAssessment, missedOpportunity, evidenceRefs, retrospectiveRef, limitations, provenance, eligibilityReceiptRef`. `actionAssessment` is supported-for-testing/proved-correction/ambiguous/counterexample. Retrospective/private references are not expanded in blind actor exports. |

Required-but-inapplicable fields use an explicitly permitted null, not invented data. The scheduled-request branch is a discriminated record alternative; it cannot masquerade as a player decision. Exported case IDs identify one original decision, even if its review/version changes.

## Proof and review binding

`missedOpportunity` is null or an object with `alternativeCandidateId, objective, advantage, proofKind, proofRef, actorEvidenceRefs, correction`. Its certificate must bind the exact observation hash, rule pin, original and alternative IDs, objective, continuation scope and independently verified positive difference. Both actions must be legal at the original revision. A sampled result cannot set this field; raw hypotheses live under their own proposal list.

The minimum viable harness may validate a conservative native terminal comparison certificate where every relevant remainder is publicly determined, with no hidden-information branching. It must decline to prove broader endings rather than implement a misleading perfect-information solver. `information-set-exhaustive` certificates remain unsupported until a checked information-set verifier exists; a string claiming this kind does not admit it. Current sampled `EvaluateRequest` output stays conditional numerical evidence with its actual margin objective.

No threshold on confidence, score, rationale word count, reviewer eloquence or number of matching model opinions constitutes proof. Native fact audit can prove a statement is false without proving the alternative action is superior. Save these two findings separately.

## State machine and interruption

```text
episode: admitted -> active -> round-complete -> reviewed -> eligible-for-curation
                         -> paused | failed | incomplete
decision: prepared -> dispatch-claimed -> dispatched -> responded -> validated -> committed
                              -> dispatch-uncertain | rejected | timed-out
```

Persist pending input before dispatch, then persist a unique dispatch token and increment attempt counters before the coordinator can invoke the host. Bind the returned host agent ID to that token immediately. After a crash, reconcile token/agent activity with the host journal; unresolved dispatches remain counted and paused. Never infer no invocation occurred merely from absence of a response. Persist raw output and receipt before response validation. Persist a durable commit intent with expected native revision before applying; persist resulting native events/state digest and commit record before acknowledging acceptance. On restart replay the journal from the last verified snapshot and resolve an intent from its stored response. Never regenerate a response when the accepted bytes already exist. Lock the run to one owner; reject a second active worker. Journal corruption stops recovery; do not silently truncate away evidence.

One retry is permitted for a transport/format/illegal-card failure; it uses the same frozen actor packet and a machine-generated error explanation without suggested strategy. Any repair suffix is hashed and stored. A late response after timeout is retained but cannot replace an already accepted attempt. Identity, inherited-context, tool-use, secrecy or native-consistency failures stop the episode, not retry into normal data. Deliberate replays preserve their original recorded choices.

## Lab integration boundary

Do not send external records to current `coach-lab.mjs import-model` or force them through `coach-lab-decision-1.0.0`. The latter binds deterministic original preparations and advice. The proposed `external-cases` reader validates this independent case schema and supplies safe observations to existing review/evaluation concepts through an explicit adapter.

If the current deterministic coach is evaluated on the same observation, save a separate record with its real policy/profile and original trace, linked by the observation digest. Reports display `model original`, `deterministic comparison` and `reviewed alternative` separately. Future deterministic candidate/gap proposals continue through the lab's existing independent gates; collection does not weaken those gates.

Coverage reports include target/selected/raw counts, contract/category/stage/seat cross-tabs, deduplication losses, family concentration, rationale statuses, proved corrections, hypotheses, missing counterexamples, failures, incomplete episodes, tokens/latency when observed, and exact source/protocol versions. Export checks reject >1,000 corpus cases, any phase excess, duplicate case identities or a family with more than eight cases.
