# Guide and implementation review (pre-R09 baseline)

The layout figures below describe the earlier approved baseline. See [DESIGN-R09 responsive evidence](responsive-report.md) and the current [design guide](../DESIGN-GUIDE.md) for revised geometry.

Reviewed on 13 October 2026 against the approved snapshot. This is a bounded source review; no browser, alternate renderer or physical device was used.

The primary sources in `DESIGN-GUIDE.md`, `design-system/COMPONENTS.md` and the token manifest point into `approved/`. The original repository paths remain provenance references in `approved/SOURCE.json`. All 85 exported token values matched their exact CSS declaration, selector and line in the package verifier.

The guide's three themes, DM Sans body / Manrope heading-and-HUD typography, 56px/48px HUD, 240px/204px Coach widths, 72px/52px launcher, safe-area rules, portrait predicate, optional left overlay and explicit pinned lane agree with the snapshot. Pin/close/reload, allowance, decision attention and replay/feedback lifecycle are checked by the copied offline coaching harness. Cards and input hooks remain identical to the frozen 20-file canonical baseline; the documented −6% / +4° double-selection adjustment is scoped to Rally live/replay doubling in the surrounding design CSS.

The guide labels these layout figures as zero-inset CSS arithmetic, correctly separating them from screenshots:

| Viewport | Table height | Pinned iframe width | Overlay Coach height cap |
|---|---:|---:|---:|
| 1280 × 720 | 720 − 56 = 664 | 1280 − 240 − 12 − 12 = 1016 | min(380, 664 − 172 − 12) = 380 |
| 844 × 390 | 390 − 48 = 342 | 844 − 204 − 8 − 8 = 624 | min(380, 342 − 96 − 8) = 238 |
| 756 × 352 | 352 − 48 = 304 | 756 − 204 − 8 − 8 = 536 | min(380, 304 − 96 − 8) = 200 |

The seven native mode names, three pace values and Basic/Complex request lists match the authored adapter. Account, family/data controls, two-session allowance, unlocked access, peer rating, review and historical playback remain explicitly marked local mock/sample behavior. The reference page separates its text/control specimens from the mock's historical card fixtures. No guide claim of production services, strategy proof, pixel-perfect tracing, medical benefit or accessibility/device acceptance was found.

Five PNG copies and their path-based SVG derivatives match the sticker manifest hashes. Independent XML parsing accepted only SVG/title/description/group/definition/mask/path elements, with external resolution disabled and DTD prohibited; the exact file hashes and path counts are in `svg-xml.json`. PNGs remain canonical and remain the runtime launcher assets. The owner has subsequently approved the PNG/SVG comparison; the mock retains PNG runtime assets.

Known limits: source-derived geometry does not establish actual font, notch, hand, badge or prompt fit; the minimum last-trick case is a 348 × 272 iframe with estimated 9.4px South clearance. Small metadata, long text, screen-reader/focus behavior and card touch interactions remain unverified. This source-only audit did not inspect vector visual fidelity; the separate authorized [asset-only SVG rasterization inspection](../assets/stickers/asset-inspection.json) is complete, and the owner subsequently reviewed and approved the vector assets. HTML/UI browser and device QA were not run. The server HEAD receipt establishes HTTP availability only. No production game/backend tests or package rebuild were run in this audit.
