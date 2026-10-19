# Rally annotation corrections — 14 October 2026

Requirement: CR-UX-008, owner browser comments on the actual native game at `http://127.0.0.1:4174/`. Status: implemented, rebuilt from current repository source, and checked in the visible built-in browser.

## Findings and changes

1. **Jacks shape:** the fitter compared a straight stack with a three-column fan and preferred the larger faces. Cards also carried a modulo-three column offset. The fitter, card positions and compact CSS now agree on four suit lanes, one overlapping vertical stack in each. Jacks retain a common baseline. Both live and saved tables use this component.
2. **Announced twos:** West/East used the generic declaration anchors, which occupied central table space. A dimension-only fitter now prefers the space below each tag, centered across that side's felt rim, with player tags and the hand boundary excluded. Narrow fallback remains beside the same owner. Hidden/revealed wrappers use identical dimensions and no private card information. North/South and generic doubles retain their existing anchors.
3. **Joe:** default seat names now have one presentation source. Live labels, teams, winner/score copy, avatar initials and replay/accessible labels use Joe. Backend state uses seat IDs; no persisted games or backend rule/contract changes are required.

## Verification

- `node --test --test-isolation=none web/tests/rally-announcements.test.ts web/tests/rally-responsive.test.ts web/tests/rally-phase-prompts.test.ts`: **56 passed, 0 failed/skipped**. New stack-shape and lower-announcement tests failed before implementation and pass after. The announcement matrix exercises the actual placement effect across 18 profiles, pin preferences, hidden/revealed states and 25 valid distributions: **2,304 placements**, including 1,408 compact placements, with no failed fit. The broader source matrix includes three Coach states. These are source geometry checks, not device acceptance.
- Name correction: focused adapter, replay and Coach integration tests **27 passed**; TypeScript and diff checks passed before the combined rebuild.
- Original integrity baseline retained: the six protected artwork/gesture/motion files remain byte-identical. CardPrimitives has an authorized display-name import/export delta only; card-rendering JSX is unchanged.
- Backend search found no separate Theo default or required API change. Server-owned two counts, reveal state, legal actions and history remain untouched.
- Independent final review of these three corrections found no high-confidence regression. The combined source test command above and `git diff --check` passed after integration.

## Rebuilt browser verification

- Native Go, TypeScript and Vite builds passed. The main server runs `C:\repos\test-jev\.local\cardford.exe` at **4174**, built from the current checkout. Health is ready, local-test identity, fixture payments and provider off. No alternate source folder or QA server was used. The existing large-bundle build warning remains.
- **18 landscape profiles**, from 568×320 to 2560×1080, plus the owner's actual **686×579** viewport: the existing Trix Complex Partners game contains 37 public cards, including the full Ace-to-two Clubs stack, and Leo's three revealed twos. Every applicable recorded check passed: one x-coordinate per suit, common Jack baseline, screen containment, player-label clearance, and announcement/hand clearance. All visible images loaded, including Coach.
- **Coach and Why at 568×320, 844×390, 1024×768 and 1440×900**: all applicable layout checks passed. Coach falls back to overlay on narrow screens and honors the existing pin preference where there is room. Joe appears in the header, live table and saved table. This cue contains one saved frame; previous/next/play are correctly disabled, so this run does not claim multi-frame playback coverage.
- Inspected screenshots at the owner's viewport, iPhone SE, iPhone 12, iPad and desktop. All ranks remain exposed in single vertical stacks. The full 13-rank SE stack necessarily has small faces; physical-device readability and touch acceptance remain manual checks. Conservative source fixtures reach a minimum full-Jacks face width of 20.6 CSS px.
- Returned from Why without playing a card, closed Coach, and reset the temporary viewport override to the owner's original 686×579 browser. The existing hand and scores remain available for annotation. One local preview cue was added to saved coaching sessions.

Evidence prefixes: `annotations-jacks-*`, `annotations-coach-*`, and `annotations-why-*`, each with screenshot, measured DOM JSON and accessible text. [Current review view](annotations-jacks-final.jpg), [iPhone SE](annotations-jacks-se1.jpg), [iPhone 12](annotations-jacks-iphone12.jpg), [iPad](annotations-jacks-ipad.jpg), [desktop Why](annotations-why-desktop.jpg).

Scope: this is acceptance evidence for the three annotated corrections. It does not close the earlier full-game review, the unresolved intermittent server-pause investigation, physical Safari/touch checks, or the older Help used metric finding. Hidden twos and alternate distributions were covered by source geometry; this live capture used the existing revealed-twos hand. Historical captures, including the rejected three-column shape, remain evidence of the earlier state rather than current acceptance.
