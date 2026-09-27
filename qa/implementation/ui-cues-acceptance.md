# Table cues and shorter copy — 27 September 2026

Scope: owner-requested UX-13–16 in [CR-UX-004](../../planning/decisions/CR-UX-004-table-cues.md). Base commit: `fdeb75b`. The commit containing this report implements this follow-up; retrieve it with `git log -1 --format=%H -- qa/implementation/ui-cues-acceptance.md`.

## Implemented

- Active-seat rings/dots and numeric player counts replace visible turn/lead/objective sentences. Screen-reader status and descriptive counters remain. No broken/unbroken suit caption.
- Every currently unavailable card is grey and lock-marked, using only the server legal-action set. The UI does not duplicate Spades or Hearts rules. Off-turn preparation and explicit human play remain intact.
- Last completed trick stays at the lower left, with four seat positions and an outline/check for the winner. No visible player names, dialog, notes call or coached-hand unlock. It clears when hand history clears.
- Game picker and settings have shorter labels. Notes expose public counts/voids first; rules, played cards and Hearts private pass memory expand on request. Recap/review explanations are optional. Review provenance and coach usage confirmation remain.
- Play again sends next-hand after a hand or starts the same mode after match completion. Score/permission/version/idempotency authority stays in existing server operations.
- Dialog keyboard navigation includes expandable summaries and excludes hidden controls. Closing restores the opening control after the inert background clears, including React Strict Mode effect replay.

## Actual verification

Run from `C:\repos\test-jev`.

| Command / check | Result |
|---|---|
| `npm run typecheck` | Passed: client and server strict TypeScript. |
| `npm run build` | Passed. Vite reported its >500 kB JavaScript chunk advisory; no build failure. |
| `npm run lint:boundaries` | Passed: 13 reachable client modules, no privileged browser imports. |
| `npm run check:artifacts` | Passed: source boundary and built artifacts, no forbidden server identifiers or source maps. |
| `node --test --test-isolation=none web/e2e/boundary.test.ts` | Passed: 2 tests. |
| `npm exec -- playwright test -c web/e2e/playwright.config.ts table.spec.ts` | Passed: 17 Chrome fixture checks, 17.0 seconds on the final source. This is API-response-fixture evidence, not model or database evidence. |
| `npm exec -- playwright test -c web/e2e/live.config.ts --grep 'live (hearts\|spades-solo\|spades-partners):'` | Passed: 3 real local-service/PostgreSQL browser journeys, 28.1 seconds. Each covers setup, staged help, accepted card play, first trick, pause/reload and original review. |
| `git diff --check` | Passed. |
| Visual inspection | Desktop, tablet portrait, phone landscape, notes and settings screenshots inspected. Automated geometry also covers the short phone. |

Initial failures were resolved: ES2020 does not support `Array.at`, so history uses indexed access; a test initially counted clipped screen-reader text as visible; dialog focus checks exposed a real trigger-restoration defect fixed above. Browser launching was initially blocked by sandbox process restrictions; the permitted host run supplied the reported results. No failing application checks remain in this scoped run.

## Screenshots

These are scripted **safe-view fixtures**, captured from the real React UI. They do not represent observed Jev decisions or completed strategic evaluation.

- [Desktop, 1280×800](ui-cues-desktop.png)
- [Tablet portrait, 768×1024](ui-cues-tablet.png)
- [Landscape phone, 667×375](ui-cues-phone.png)
- [Short landscape phone, 667×320](ui-cues-short-phone.png)
- [Table notes](ui-cues-notes.png)
- [Settings](ui-cues-settings.png)

The 13-card fixture retains at least 44 CSS pixels of exposed horizontal target width at 667×375. Last-trick geometry is separate from the current trick and West seat at all four tested sizes. The last-trick test asserts zero notes/unlock requests, descriptive winner labels, and clearing on a new hand. Existing card-gesture, hint, stale-response, retry, demo and account fixture checks also pass.

## Runtime, limits and next milestone

The site is available locally at `http://127.0.0.1:4173`. It uses the existing server and PostgreSQL with local-test identity, fixture billing and local-code strategy. **Jev is off; no live model was called and no model ID was observed in this task.** The finite public demo remains labelled as an example and its zero-API check passed.

Known scoped defects: none observed in the checks above. Not run: physical touch devices, actual screen-reader speech, Safari/Firefox, 200% zoom, the full server regression suite, a full-hand real-service browser journey, or live provider/payment testing. The Play again end states use isolated UI fixtures; they do not establish a full-match gameplay result.

The next unfinished project milestone remains hosted identity/Stripe integration and W18/W19 release evidence in [the existing project status](status.md). This visual update does not claim hosted or paid-launch completion.

To view the built site, run `npm start` if the existing local server is stopped. To develop with hot reload, follow [LOCAL-README](../../LOCAL-README.md).
