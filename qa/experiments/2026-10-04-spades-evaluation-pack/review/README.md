# Blind Spades development review pack

32 replayed, nonforced, deduplicated player packets. These are unreviewed development cases, with no accepted answers or expert verdicts.

Give a human reviewer only one case from cases.json at a time and its blank human-labels.json entry. Family identifiers are neutral grouping markers. Do not supply private/source-index.json, source records, coverage strata, bot answers, player paragraphs, cues, later hands or outcomes until labels are frozen. Follow the assignment and exposure safeguards in ../human-review.md: keep one actor trajectory in chronological order, withhold cross-seat hands, later play and related mode/deal twins until its original labels are frozen, and flag/exclude exposed reviews. Randomizing all cases or showing one at a time does not by itself preserve blinding.

Review status is supported, unknown or contested. Each reviewer uses an independent copy; preserve those originals before adjudication. Fill reviewer identity and acceptable alternatives from actual independent human review; an archived agent choice is never an answer key. The coverage file records context counts and unfilled evidence. Score pressure uses synthetic match prefixes. Related deals and rotations remain together as development material.

Regenerate or validate from repository root:

```powershell
node --input-type=module -e "import {writeReviewPack} from './web/server/evaluation/spades-pack/review.ts'; writeReviewPack('qa/experiments/2026-10-04-spades-evaluation-pack/review');"
node --test --test-isolation=none web/server/tests/spades-review-pack.test.ts
```

Existing complete packs are validated without rewriting any files, including human labels. Case, source or coverage drift fails closed. No runtime/default changes or Jev calls are part of extraction. Private provenance records source byte hashes and precise record sequence/JSONL line pointers.
