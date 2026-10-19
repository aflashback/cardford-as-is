# CFL-12: protected King of Hearts cases and results

10 October 2026. The first authored scenario family is implemented and executed. It contains **eight complete distributions, ten authored witness prefixes, and 232 complete request runs**: 192 policy runs and 40 witness runs, totaling 13,224 accepted actions and 3,016 completed tricks. Each request finishes all thirteen tricks. This is not 232 complete Trix sessions or independent random deals.

[Scope and fixed protocol](../../../planning/implementation/coach-lab/trix-king-scenarios.md), [change authority](../../../planning/decisions/CR-STRAT-011-deterministic-feedback-lab.md), [dataset](../../../server/internal/games/trix/testdata/king-scenarios.json), [operator](../../../scripts/coach-lab-king-scenarios.mjs).

## What was built

Each South hand contains K♥ plus five other hearts. Run each authored distribution in Basic Solo, Complex Solo, Basic Partners and Complex Partners. Basic fixes the King request; Complex fixes the combined penalty request. The natural request suggestion is saved separately; this study does not compare choosing different requests or subsequent kingdoms.

All seats use either original Baseline or Ownership Comparison, in separate runs. Both remain unchanged. Each has three declaration arms: natural bot declarations, only K♥ doubled, or all doubles declined. Every subsequent bot decision sees only its own cards and public history. Controlled declarations and authored witness moves are labelled as experimental actions, with the policy suggestion kept separately. A move being imposed does not make it legally forced.

Witnesses establish legal escape/trap paths on the specified deal. They can include voluntary opponent cooperation. They are not optimal-play solutions or acceptable-action labels. Native tests separately verify a forced consequence at the late trap position and the public facts needed for the partner-return opportunity.

| Distribution | Pattern or contrast |
| --- | --- |
| `six-low-hearts-outside-ace-east` | Low-heart cover, short diamond exit; immediate escape, public partner return, and a reachable exhausted-cover trap |
| `six-low-hearts-outside-ace-north` | Same South observation, concealed ace with North; Solo versus teammate-capture contrast |
| `six-low-hearts-outside-ace-west` | Same South observation, concealed ace with West |
| `six-hearts-own-ace-external-opening` | South also has A♥; self-capture on another player's lead tests bonus recipient |
| `six-hearts-own-ace-owner-opening` | Own ace and opening responsibility; self-led capture with no prior giver withholds the Solo bonus |
| `six-low-hearts-owner-outside-ace` | Opening responsibility, club lead transfer, then release beneath an outside ace |
| `six-high-hearts-owner-outside-ace` | Higher cover ranks and different full Complex costs |
| `six-low-hearts-short-side-suits` | Exhaust two clubs to create an off-suit king discard |

The ace-location twins are dependent variations of one hand shape. No row or variant repetition counts as a new independent population sample.

## Verified observations

**Doubling is worth investigating, but the corpus is not a doubling classifier.** All 64 fixed double-versus-decline comparisons gained exactly 75 focal points. The actual 52-card play sequences were identical within every pair, so this difference came from doubling arithmetic on those outcomes. Natural bots doubled in 16/32 Solo cells and 0/32 Partners cells. These are selected favorable distributions; the negative witnesses do not establish that an adversary can force the same bad outcomes from the initial deal. Before changing doubling, add fresh comparable distributions with genuinely contested exits, opponent heart attacks and unsafe own-team captures.

**Solo escape and team escape differ.** In the `release-under-north-ace` witness, North takes South's doubled king. South earns +75 in Basic Solo, but South/North lose 150 in Basic Partners. The Partners bonus goes directly to East/West. Counting only South's personal relief would teach the wrong partnership action.

**The public partner return is reproducible.** In `six-low-hearts-outside-ace-east`, witness `partner-return-to-publicly-known-void`:

1. East leads A♦; North plays 8♦, West 4♠, South 2♦.
2. East leads 4♦; North plays K♦, West 5♠, South 2♣.
3. North now knows South and West are void in diamonds. North's own remaining diamonds and the public plays leave only 5♦/6♦ outside North, both necessarily with East. South publicly doubled K♥.
4. Leading 3♦ gives East the trick under either legal diamond follow. South can discard K♥. This is an opportunity derived from public facts, conditional on South choosing that discard.

At the third-trick lead, the saved Baseline suggestion is 2♠; the authored action is 3♦. At South's ensuing turn, Baseline already suggests K♥. This identifies a concrete partner-release alternative and a generic explanation gap. It does **not** prove that 2♠ is worse over the whole request: compare both choices from this same actor position across feasible hidden hands before assigning a mistake label. Witness continuations use Baseline only, so this observation does not describe Ownership Comparison's choice at this exact imposed prefix.

Basic Partners finishes this witness at **+75** for South/North. Complex Partners finishes at **+40**: +75 king bonus, −20 diamonds, −15 trick. The full team score is the objective; +75 is only the king-related net component. Other natural doubles, where present, are separately preserved in the natural arm.

**The late trap is exact, the opening is uncertain.** After 36 plays in `exhaust-cover-then-take-club-lead`, South leads holding only 4♥/5♥/6♥/K♥, while all other seats are heart-void. All 256 legal branches of the next trick preserve the forced king-capture consequence. This proves the reachable tail is trapped; it does not prove its earlier voluntary moves were inevitable. The three concealed-ace twins also produce identical initial South observations, preventing certainty about the ace holder at that time.

## Feedback register for the next deterministic rule

These are development hypotheses, not promoted policy changes or imported human/LLM judgments. Evidence below refers to `king-20261010-v3/study.json`; identify a run by fixture, variant, profile, arm and optional witness ID, then use the ordinal. Each `actorRecords` entry is individually scoped. Do not send the combined archive, another seat's record, author labels or later outcomes as decision-time judge input.

| ID | Evidence and current gap | Next test before changing bots/coach |
| --- | --- | --- |
| KH-01 | All 64 controlled pairs gain 75; both Partners profiles decline naturally. Opening doubling may be over-conservative in this family. | Preserve these examples; add fresh adverse deals and alternative deterministic opponents. Evaluate side-suit exits, lower cover, own ace and opening responsibility together. Do not adopt “six hearts means double.” |
| KH-02 | First fixture, Basic/Complex Partners, Baseline, controlled double, partner-return witness: ordinal 14 North suggests `play:S2`; public facts support a losing `play:D3` exit for partner. | Compare those legal roots from North's observation on common feasible hands, retaining full team points and adverse cases. Include partner not void, king undeclared, uncertain opposing ownership and higher diamond leads as counterexamples. |
| KH-03 | Same witness ordinal 16: South chooses `play:HK` but the cue is only “Avoid the request's penalties.” | A shared deterministic fact trace should connect partner's losing diamond, South's proven void and the opponent's required capture. Generate the short cue and optional explanation from those facts; no model chooses the move. |
| KH-04 | First fixture's trap witness after 36 plays, before timeline ordinal 42. Own hand plus public history proves no remaining outside hearts. | Add a narrowly triggered forced-tail classification and a separate earlier exit-preservation hypothesis. Do not turn the later known trap into information available at the opening. |
| KH-05 | High-cover fixture, Complex Partners, controlled double: Baseline −10 versus Ownership Comparison −35, despite both escaping K♥ and earning the same +75 king bonus. | Investigate the other components and legal decisions; do not treat king escape as equivalent to best full-request score. This is one authored distribution, not relative policy strength. |

Recommended order: investigate KH-02 at the exact public-information position, attach the corresponding evidence/explanation, then consider one separately versioned shared bot/coach rule. Use this consumed corpus for development/regression and newly authored variations plus fresh complete sessions for validation. Doubling remains a broader uncertainty problem requiring additional evidence.

CFL-13 follow-up qualification: KH-03 must respect which actor knows the facts. North's guaranteed losing-diamond deduction uses North's private remaining diamonds; South cannot inherit that certainty in its explanation. [The next comparison](../../../planning/implementation/coach-lab/trix-king-return.md) therefore records South's actual response under separate fixed policies.

## How to run and inspect

No browser, running app, database, API key or model is needed. Use PowerShell in the repository with its Node dependencies and local Go toolchain installed:

```powershell
Set-Location C:\repos\test-jev
node scripts/windows-env.mjs go test ./server/internal/games/trix -run '^TestKingScenario' -count=1 -timeout=90s
node --test --test-isolation=none web/tests/coach-lab-king-scenarios.test.ts
node scripts/coach-lab-king-scenarios.mjs --out .local/evaluation/coach-lab/king-scenario-work/my-first-king-study
```

Choose a new output directory name on every run; the operator refuses to overwrite evidence. The focused Go test skips the opt-in study; the operator freezes sources/corpus/binary and executes it. The operator admits only a direct child of the private `king-scenario-work` directory and enforces time, action and output limits. Unsupported, failed, timed-out or changed-source runs stay `pending-unverified`.

Inspect in this order:

1. `invocation.json`: must say `passed`, with `sourceUnchanged: true`.
2. `report.md`: comparisons grouped by variant, including natural, doubled and declined outcomes.
3. `summary.json`: full focal points, king net points, component totals and separate witness results.
4. `study.json`: public tricks, exact king/bonus provenance, individual actor observations, saved suggestions, executed actions and intervention flags. This archive is private and about 120 MiB in this run.
5. `protocol.json` and the retained `builds/` directory: exact corpus, profiles, caps and source/binary identity.

When extending the dataset, author the pattern, actor-visible conditions, positive case and counterexample before examining policy results. Give it a stable ID, keep hidden allocations outside selectors, and preserve earlier evidence. This first operator admits six to eight fixtures with one to three witnesses each; extending its bounded scope requires updating the protocol and corresponding tests explicitly.

For integrated verification after implementation changes:

```powershell
npm run lab:check
```

## Evidence and verification

- Successful frozen study: `.local/evaluation/coach-lab/king-scenario-work/king-20261010-v3/`. Native build 2.057 s, study invocation 5.648 s; unchanged source; all 232 runs completed. No runtime policy/default, rules or UI were modified.
- Source digest: `6e1e986c33d836159fa24bc8f256007324b94d26495b03ee41213897e1027873`.
- Corpus digest: `ebc8061d72b7c86a766ca184945926f81c514de222369a8b57a18c28aff1dc8d`.
- Study digest: `cdf334d3a1f1f7aa257421cadaab1404d15a7414f73d44c7ddb2b3382267edf1`.
- Native focused scenario suite passed, 0.849 s. Includes strict corpus boundaries, duplicate cards/extra hands, literal Solo/Partners score oracles, unknown-ace invariance, legal witness replay, the public partner return, trap branches and immutable/bounded study output.
- Six Node reporting/admission tests passed, 0.134 s. Includes omitted native empty declarations, redaction, intervention labels, complete pair/witness coverage, score/trick integrity and incomplete receipt rejection.
- Integrated `npm run lab:check` passed: 98 Node tests, seven native packages, both generated-contract checks and both TypeScript projects. Receipt: `.local/evaluation/coach-lab/checks/2026-10-10T14-13-11.354Z.json`; unchanged source during the gate. The native lab package took 288.231 s. Local document links and `git diff --check` also passed.
- Independent native and operator reviews completed. Six-heart/four-hand corpus admission findings were corrected. The first operator attempt (`v1`) hit sandbox `spawn EPERM`; `v2` completed all native runs but exposed the omitted empty-declaration field in the reader. Both are retained as `pending-unverified`. The corrected reader has its own regression test; `v3` is the accepted run. No case or policy was changed after examining study outcomes.

No LLM judging, calibrated outcome probabilities, automatic feedback ingestion, action-changing candidate, stronger-play claim or live promotion is included in this milestone.
