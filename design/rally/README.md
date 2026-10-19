# CardFord Rally · approved design package

Version **1.1.0** · 13 October 2026 · Responsive refinement **DESIGN-R09**

The owner has reviewed and approved Rally, its design system and guide, and the selected PNG/SVG coach artwork. The selected direction remains the approved baseline. At the request of the owner, DESIGN-R09 refines its landscape proportions for review; production game implementation remains a separate task. Owner approval does not change the recorded limits of agent-run browser/device QA.

## Open the approved package

With the existing design server running:

- [Package home](http://127.0.0.1:4188/rally/)
- [Approved Rally mock](http://127.0.0.1:4188/rally/approved/#play)
- [Interactive design system](http://127.0.0.1:4188/rally/design-system/)
- [PNG / SVG sticker comparison](http://127.0.0.1:4188/rally/assets/stickers/)
- [Screen-size reviewer](http://127.0.0.1:4188/rally/responsive.html)

Use `/rally/approved/#play` for the retained interactive mock. Superseded competition concepts and duplicate working copies, including the old `/studio/` preview, are no longer active references. Original source paths in provenance records identify their historical origin; the packaged files are self-contained.

## Restart the preview server

From `C:\repos\test-jev`, run:

```powershell
node design/serve.mjs
```

Leave that terminal running and open the package home above. The server serves only `design/` over loopback. It needs no game backend, database, API key or account. It is a local process, not an installed startup service. If port 4188 is occupied, use the existing preview or set `DESIGN_PORT` to a free local port.

Serve over HTTP. Opening the HTML through `file://` is not the supported review path because the shell and card-table iframe use same-origin messaging. No build is needed to review the supplied bundle.

## Contents

| Location | Purpose |
|---|---|
| `approved/index.html` | Selected interactive Rally game mock |
| `approved/shared/` | Local table bundle, source, original card/gesture copies, fonts, logo and runtime license notices |
| `approved/coach-stickers/assets/` | Five selected original PNG poses; the mock keeps its original PNG artwork |
| `approved/SOURCE.json` | Source paths, source hashes, packaged hashes and explicit packaging adaptations |
| `DESIGN-GUIDE.md` | Product and visual principles, usage rules, responsive behavior and implementation boundaries |
| `design-system/index.html` | Interactive reference for themes, typography, tokens and components |
| `design-system/tokens.json`, `tokens.css` | Source-traced design tokens for later implementation |
| `assets/stickers/` | PNG originals, path-based SVG derivatives, comparison page and conversion provenance |
| `responsive.html` | Landscape/portrait viewport presets without replacing the current hand |
| `verify-package.mjs`, `evidence/` | Offline verification and recorded limitations |

The original card faces, ranks/suits, dimming, selection/drag/throw rules and replay fixtures are preserved. Packaging adjusts relative resource paths, the reference-navigation label and rebuild dependency lookup. After approval, cleanup removed unused competitor theme rules and the non-Rally last-trick branch, then rebuilt the bundle. All 85 Rally token values remained unchanged. It does not implement payments, entitlements, actual peer ratings, coach services or feedback endpoints.

The embedded board retains the internal `concept=studio` key used by this selected mock. Its display name is Rally; keeping the key preserves the existing theme, coaching and card overrides.

## Stickers

The Regular is the selected character. The current poses are Whistle v3, Thinking v2, Explaining v2, Waiting v2 and Reading v8. Earlier concepts and superseded revisions are not promoted into this asset package.

The owner has approved both the original PNGs and the SVG derivatives. PNGs remain the canonical artwork used by the approved mock. SVGs use path geometry rather than embedded raster images; tracing can simplify small details and transparency edges. The comparison page remains available as a reference. Design approval does not automatically replace PNG usage in the runtime.

## Rebuild and verification

Only when changing the copied presentation source:

```powershell
node design/rally/approved/shared/build.mjs
node design/rally/verify-package.mjs
node design/rally/verify-responsive.mjs
```

The rebuild locates the repository's existing `web/node_modules`. Outside this repository, set `RALLY_NODE_MODULES` to a compatible dependency directory containing React, React DOM, Lucide React and esbuild. The delivered browser bundle itself has no runtime package dependency.

Read [the verification report](evidence/package-report.md) for the checks actually run. Offline state tests, source-derived geometry and SVG structure validation do not establish touch, accessibility or cross-browser acceptance. The earlier browser-tool restriction prevented agent-run HTML/UI rendering QA; standalone SVG asset inspection is recorded separately. The owner's completed design review and approval are distinct from those agent test receipts.

## Change control

This package is the approved design baseline. The selected visual direction was approved; the requested DESIGN-R09 responsive changes are versioned against that baseline. Preserve the card contract, show usage/entitlement ideas as mock behavior until backend requirements are approved, and keep production implementation as a separate explicitly authorized task. No production UI or backend files were edited for this delivery.

### DESIGN-R07 · 13 October 2026

- Restored the local preview server after finding it was not running; the original Rally URL returned HTTP 200.
- Packaged the selected mock and its dependency closure under `design/rally/approved/`; original review files were retained during review and superseded by this package after approval.
- Added a separate design guide, interactive design-system reference and source-traced tokens.
- Added the selected PNG artwork and SVG vector derivatives with a comparison gallery.
- Retained the original card/gesture source copies and explicit offline-versus-browser verification boundaries.
- Owner review and approval completed for the full design package, including SVG derivatives; closed the design phase and retained Rally as the active design reference.

### DESIGN-R08 · approved-design cleanup

- Recorded the owner's completed review and approval, including the SVG derivatives, and closed the design phase.
- Removed unselected concepts, duplicate working copies, competition pages, obsolete reports/screenshots and the local vector-tool installation. Retained only Rally and its local server/entry files.
- Kept the former `/studio/` entry as a redirect to `/rally/approved/`; source paths in hash manifests remain historical provenance.
- Removed inactive competitor code, preserved canonical card files, rebuilt the approved mock and regenerated matching token source pointers.
- Changes are confined to `design/`; production implementation remains separate.

### DESIGN-R09 · landscape proportions

- Added a 52px side control rail on short landscape phones, with five 44px targets and no top HUD on the play route.
- Sized hand, trick, last-trick and Jacks presentation from the available iframe bounds; preserved canonical card faces and gesture sources.
- Kept Coach as an overlay by default. Pinning requires a table-screen width of at least 760px; smaller views temporarily overlay without erasing the pin preference. The measured hand area sets Coach clearance.
- Added named representative phone, tablet and desktop CSS viewports, scenario controls, Coach states, themes, rotation and fit/100% views to the screen-size reviewer. Changing size preserves the current hand; loading a demo resets it explicitly.
- Kept changes inside `design/`. Numerical/source checks are distinct from browser, Safari, touch and physical-device acceptance; the earlier preview browser restriction still prevents agent-rendered QA.
