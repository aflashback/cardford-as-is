# Rally package verification

Generated 2026-10-14T01:27:12.109Z.

Offline dependency, source, license, SVG and mock-contract checks; not rendered UI or production-game acceptance.

- **PASSED** approved entry and viewport
- **PASSED** canonical copies 20/20: Package matches frozen SHA-256 baseline; production checkout not required
- **PASSED** SOURCE manifest hashes: 56 authoritative snapshot SHA-256 records
- **PASSED** runtime local dependency closure: 20 resolved references plus dynamic launcher alternatives
- **PASSED** authored runtime has no remote-service calls: Static source check, not network capture
- **PASSED** licenses and fonts included: Nonempty notices/fonts; bytes validated in SOURCE manifest
- **PASSED** snapshot rebuild dependency path: Ready bundle needs no modules at runtime; rebuild uses repo modules (currently present) or RALLY_NODE_MODULES. This verification check does not rebuild the bundle.
- **PASSED** guide and reference local links: 53 document/reference asset links, scripts parsed without execution
- **PASSED** exported tokens match source declarations: 85 values with exact property, selector and line provenance
- **PASSED** SVG paths without raster embedding: 5 SVG text checks; XML parse is recorded separately
- **PASSED** sticker manifest, PNG and SVG hashes: Five exact PNG masters and five traced derivative hashes; license present
- **PASSED** recorded SVG XML parse matches delivered bytes: Five .NET XML parses with DTD prohibited; evidence hashes match current SVGs
- **PASSED** approved verify-coaching-panel.mjs: 30 offline state/DOM contract groups passed. No browser/rendering assertions were run.
- **PASSED** approved shared/verify-coaching.mjs: PASS: 36 authored replay frames; five lessons; two rounds each; public winners, turn order, selection and pass exchange.
- **PASSED** approved shared/verify-last-trick-pocket.mjs: PASS 7 pocket sizes + 5 card/seat clearance cases, including empty reservation and two source-metric narrow layouts (numerical only).
- **PASSED** approved shared/verify-rally-fit.mjs: PASS hand containment/lift, aligned Jack baselines, public range fit, announcement clearance, null-fit reset, trick proportions and ultrawide height stability. Numerical/source checks only.
- **PASSED** approved app.js syntax: Parsed without execution
- **PASSED** approved coaching.js syntax: Parsed without execution

Full mock-test output and resolved asset references are in [package-report.json](package-report.json). The single intentional navigation link to ../index.html opens the Rally guide portal; runtime assets stay inside approved.

Not run by this verification script: browser/rendering/device QA, production game/server/account tests or package rebuild. The bundle is rebuilt separately from these checks; see the current change record for its scope. SVG checks above are text/content checks; true vector artwork need not exactly match the raster master. XML parsing and manual guide/source review, when performed, are separate evidence files.
