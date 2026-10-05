# Spades evaluation pack

**4 October 2026 — development evidence.** Human reviewers are deferred by the owner. This pack prepares the missing independent strategy and learning checks; it does not certify bot strength.

## What is ready

- [32 blind decisions](review/cases.json): 15 Solo, 17 Partners; replayed from saved text-agent and actual-browser records. [Coverage and gaps](review/coverage.json) keep those sources separate. Bot choices, explanations and later outcomes are withheld.
- [Human review instructions](human-review.md) and [blank labels](review/human-labels.json). Every answer remains pending; reviewers use separate copies.
- [Paired engine protocol](protocol.md): frozen baseline versus the existing candidate, one changed seat, eight development deal families, both modes, four seats and two fixed environments. 128 pairs / 256 streams; 100 hands per stream, 20 minutes per invocation.
- [Human learning study](human-learning.md) and [confirmation planning template](confirmation-template.json). Neither has been run or approved as a confirming study.

The pilot uses production rules and match transitions, not text-agent play. It measures the programmed policies under fixed conditions. Jev is off; provider calls: **0**, observed model: **none**. No runtime strategy or default is changed.

## Run from repository root

```powershell
node web/server/evaluation/spades-pack/cli.ts prepare
node web/server/evaluation/spades-pack/cli.ts run
node web/server/evaluation/spades-pack/cli.ts audit
node web/server/evaluation/spades-pack/cli.ts report
```

`prepare` preserves human annotations and rejects changed packets/source. `run` resumes complete pairs under the frozen manifest; changed source or tampered actions reject. `audit` is read-only and replays recorded actions without invoking the strategic selector. `report` derives summaries from audited records. A fresh source revision requires a separately identified experiment.

Private administrator material: `review/private/`, pilot decks, checkpoints and action archives. Give reviewers only their assigned actor-safe packets, [rule handout](rule-handout.md) and blank entries. Follow the sequencing safeguards in [human-review.md](human-review.md); opening the whole case file can expose other hands or future play.

## Evidence and next step

- [Verification](verification.json), [pilot results](pilot/results.md), [machine results](pilot/results.json), [frozen manifest](pilot/pilot-manifest.json).
- [Implementation plan](../../../docs/superpowers/plans/2026-10-04-spades-evaluation-pack.md) and [milestone changes](CHANGELOG.md).
- Next: obtain independent acceptable-action labels, review one tactical family, then define a fresh confirmation experiment. Human learning requires novel unaided assessment. A later Jev comparison needs its own validated adapter, authorization and bounded manifest.

Eight related development families cannot establish general strength, teaching benefit or a confirmation sample size. Existing per-hand promotion thresholds do not apply to this single-seat full-match pilot.
