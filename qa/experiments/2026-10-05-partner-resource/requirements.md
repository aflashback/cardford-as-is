# Partnership resource family

This owner-requested development experiment implements the targeted CASE-01 successor and its counterexamples, with human review deferred. `spades-partner-resource-4.1.0` is explicitly selectable; existing 3.0, 4.0, frozen 2.1, rule profiles and live defaults retain their behavior. Solo retains 4.0 behavior under the successor's metadata.

| Requirement | Behavior | Acceptance evidence |
| --- | --- | --- |
| PR-01 | Offer a known-void positive partner a safe ruff while retaining a master trump entry, even when the actor holds more than one side suit. Require proved partner trump, no possible opposing winning ruff, positive contract need and no live opposing Nil. | `spades-partner-resource.test.ts`: two-suit lead changes `SJ` to `H5`; optional ruff and every legal fourth-seat response preserve the exact resource proof. |
| PR-02 | Bot selection and coach use the same selected analysis; strategic preference stays heuristic. Distinguish optional future play from exact public eligibility. Leave a secure positive partner in control when spending another winner adds no team trick. | Shared `analyzeDecision`/`chooseAction`/`explain` path, cue/action binding and secure-winner continuation tests. |
| PR-03 | Record non-trigger guards; reject unsafe overruff, unknown ownership, live own/partner/opponent Nil, made contract with bag risk, missing entry and incomplete history. Confirm factual claims independently without reading runtime proof/fact builders. | Actual legal `H4/HK/S4/S7` overruff; guard, forged claim, public-feasibility checker, rotations and indistinguishable concealed holdings tests. |
| PR-04 | Use a separate bounded seeded development measurement with manifests, exact replay material and observed action changes; preserve independent seed counts and partial actor coverage on wall cap. | `partner-cases/cli.ts`, `fresh/manifest.json`, `fresh/results.json`, private paired rows and first difference when present. |
| PR-05 | Preserve default/frozen/retained policy attribution and distinguish exact public eligibility from conditional strategic value and uncertainty. | Retained 4.0/frozen suites, hidden-holding parity, cue evidence/budget checks and `multi-game/preservation.json`; human quality judgments remain deferred. |

The safe-resource predicate proves that the partner possesses a sufficiently high trump and opponents cannot beat that ruff with a legal reply. It does not prove the partner will choose to trump or that this preference improves the eventual hand. Ordering weight 200 is conditional policy order, with no probability or strength interpretation. Counterexample guards are conservative: failure to prove a resource is uncertainty, not proof that no resource exists.

Run from repository root:

```powershell
node --test --test-isolation=none web/server/tests/spades-partner-resource.test.ts web/server/tests/spades-observed-cases.test.ts
npm run typecheck --workspace web
node web/server/evaluation/partner-cases/cli.ts --out qa/experiments/2026-10-05-partner-resource/fresh --count 64 --max-wall-ms 60000
```

The fresh run uses declared development seeds 64,100,001 through 64,100,064 and production reducers. Four evaluated-seat placements and both reference comparisons are related measurements for each seed. The output directory must be new; existing evidence is never overwritten. Runtime source hashes freeze before the first deal and are checked at completion. Decks and authoritative states remain in private evaluation artifacts; selectors receive only `observe(state, actor)`.

No strength, equivalence, optimal-action, teaching-benefit or live-Jev claim follows from this experiment. General strategic quality and novel unaided learning remain separate evidence gates. A bounded Jev comparison, when separately run, must use the exact actor observation from the fresh first-difference packet and send no private evaluation fields.
