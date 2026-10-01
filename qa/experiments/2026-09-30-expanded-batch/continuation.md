# Resume checkpoint

Collection stopped at 2026-10-01 00:46:19 UTC to retain time for verification and reporting within the owner-requested one-hour limit. No player jobs remain running. Resume only when the owner requests it.

| Saved hand | Accepted decisions | Next decision |
|---|---:|---:|
| partners-void-trumps-at-jason | 44/56 | 45 |
| solo-spread-late-score-bags | 27/56 | 28 |
| partners-spread-late-score-bags | 19/56 | 20 |
| solo-spread-honor-gap | 0/56 | 1 |
| partners-spread-honor-gap | 0/56 | 1 |

The other three hands are complete. There are 190 decisions remaining across these five hands. The first 49 accepted decisions remain GPT-6.1 Sol/xhigh; subsequent accepted decisions are GPT-6 Luna/xhigh. Preserve historical records and source fingerprints.

## On authorized resumption

Use the commands in README.md with a newly agreed time budget. The runner skips complete hands, resumes saved states and saves each attempt. Supply an episode ID to finish one selected hand first. Re-run write-summary.mjs, verify-provenance.mjs and check-public-facts.mjs afterward, then refresh the review site.

## Verification at stop

Passed: referee.mjs validate (8 exact authored setups), referee.mjs verify (258 legal accepted decisions; 3 complete, 3 partial, 2 unstarted), verify-provenance.mjs (49 unchanged Sol decisions; all later decisions Luna), check-public-facts.mjs (6 specific claims). Both batch summary generators ran successfully.

Transport: 4 saved failures (one early timeout and three deadline cancellations), plus 3 separately recorded in-flight Sol cancellations at the model switch. No rejected player replies or reported tool events. Missing usage remains explicitly unavailable. No Jev calls, runtime changes, expert strength review or human learning tests.
