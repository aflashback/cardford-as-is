# Rally component reference

**Version 1.1.0 · 2026-10-13 · DESIGN-R09**

[Interactive reference](index.html) · [Design guide](../DESIGN-GUIDE.md) · [Approved mock](../approved/#play) · [JSON tokens](tokens.json)

The owner approved the original Rally design direction and SVG artwork. **R09 adds requested responsive refinements for review**, preserving that visual baseline. Components shown here remain isolated specimens; production implementation is separate. Primary sources are the packaged [shell](../approved/style.css), [responsive overrides](../approved/responsive.css), [Coach styles](../approved/coaching.css), [Coach behavior](../approved/coaching.js), and [board overrides](../approved/shared/board-theme.css). Historical original-file provenance is recorded in [SOURCE.json](../approved/SOURCE.json); superseded working directories are not dependencies.

## Token contract

`tokens.json` contains `themes.light|dark|warm.shell|board` and `fixed`. Every entry has `$value`, `$type` and `source: {file, line, selector, property}`. Responsive metadata records conditions separately. `tokens.css` exports namespaced aliases; `tokens.js` is the same manifest wrapped as a local script so the reference needs no fetch. None is imported by the approved mock.

Run `node design/rally/design-system/build-tokens.mjs` to regenerate all three from the approved snapshot. The generator checks fixed values against the selected declaration and preserves inherited board values. Do not regenerate from an unrelated or later draft and present it as the approved version. Version any later requested design change against this baseline.

## HUD and navigation

| Component | Visual contract | Interaction / accessible state |
|---|---|---|
| CardFord mark | Original SVG, 31px desktop / 28px short landscape, within 44px target | Named home/menu action; no altered logo |
| Game switch | Compact label + variant, 44px minimum, 7px radius | Accessible game/variant name; on-demand choices |
| Score button | Centered competitors, 25px tabular Manrope scores, compact variants | Opens scores; keep labels meaningful for solo vs partners |
| Icon action | 44 × 44px, radius 8px; 22px icon / 1.8 stroke | `aria-label` and `title`; pressed state where meaningful |
| HUD | 56px top normally; 48px at height ≤480px landscape unless the side-strip rule applies | One control area; no second persistent navigation row |
| Short-phone controls | Width ≤1000px, height ≤430px landscape: 52px left strip, five 44px targets | Home, game, scores, pause, menu; full-height card iframe; Coach via sticker |

The play route reserves the viewport below the HUD for one persistent iframe. Off-table pages may scroll. Dialogs are for menu/settings/scores/account; coaching stays in its own window. Preserve the native dialog focus and portrait-transition close behavior.

## Controls and surfaces

| Component | Source values | Required states |
|---|---|---|
| Primary action | Accent fill / accent ink, 48px minimum, 8px radius, 14px/750 | Rest, hover brightness 1.07, focus, disabled |
| Secondary action | Surface fill / line border, same dimensions | Rest, hover ink border, focus, disabled |
| Quiet action | Muted ink, tint on hover | Rest, hover, focus; use for lower-priority actions |
| Segment | 48px minimum, 7px radius, 14px/700 | `aria-pressed`; selected accent fill |
| Field | 46px minimum in shell; 44px in Coach | Explicit label, focus, optional/required meaning |
| Game tile | 12px radius, distinct game/suit treatment | Selected mode is explicit; no fictitious availability |
| Dialog | 16px radius; 12px short landscape; max viewport height | Close target ≥44px, bounded scrolling, orientation closes |
| Disabled control | Native `disabled`, shell opacity .38 | No click or keyboard action; future audio remains disabled |
| Focus | Shell 3px accent outline / 3px offset | Keyboard visible; do not rely on color alone |

Board controls are separate: phase actions have 44px minimum targets, their own board palette and pill rounding. At narrow iframe sizes the phase prompt uses compact layouts while retaining the targets. Never reuse shell disabled opacity on an entire card face.

## Coach window and launcher

DOM in the approved mock: `#coach-panel` contains `#coach-panel-header` and focusable `#coach-panel-body`. `#coach-launcher` remains outside the window with `aria-controls="coach-panel"`, `aria-expanded`, an image alternative and a separate polite status. It is visible when the window is open as well as closed, while on the landscape play route.

| Property | Desktop | Compact |
|---|---:|---:|
| Window width | `clamp(240px, 22vw, 320px)` at width ≥901px and height ≥481px | 204px |
| Edge | 12px | 8px |
| Height limit | `min(560px, 70dvh)` on larger screens, additionally constrained by available space | 380px base limit, additionally constrained by available space |
| Corner radius | 16px | 12px |
| Header minimum | 60px | 52px |
| Body padding | 14px | 10px |
| Sticker | 72px | 52px |
| Header controls | 44px | 44px |

Compact means width ≤900px **or** height ≤480px in landscape. The board reports measured hand clearance; the shell bounds that value between 72px and 65% of viewport height. The older 172 / 144 / 112 / 96px breakpoint values are initialization fallbacks. Content scrolls within the stable responsive window. Pin reserves width plus gap plus left edge only when the measured table screen is at least 760px wide. Below that, Coach displays as an overlay and the pin preference is remembered. The 240px/204px reference specimens are nominal component examples, not fixed responsive layout claims. Use the [workbench](../responsive.html) for the actual allocation.

The header is **Coach**, allowance, **Pin**, **X**. Pin is disabled with an explanatory label when the table screen is too narrow. X dismisses and acknowledges; it is not an on/off switch. The waiting sticker opens/closes. The whistle indicates an unacknowledged eligible Trix double, Spades bid or Hearts pass decision, with fresh access. It neither charges nor opens automatically. Exhausted access must not tease a fresh session; an existing session remains readable. Reopening/closing does not immediately re-arm the same attention cue.

## Coach content states

| State | Contract |
|---|---|
| Welcome | No advice leakage before the user explicitly requests a session |
| Cue | Brief recommendation; use saved-example wording if live context does not match |
| Selection | Name actual selected Hearts pass/Trix double cards; do not invent a selection phase for normal play |
| Confirmed | Replace pending/current-selection claims with confirmed facts, even if the window was closed |
| Played | Archive earlier cue; optional comment clearly marked Played |
| Saved/reloaded | Saved label remains; never silently retarget historical text to the current decision |
| Review | Two sample items, Strength and Next practice; separate Why/feedback IDs |
| Rating | 1,240 / fourth of eight fictional peers; demo label; no accuracy or real-population claim |
| Exhausted | New requests blocked, current session accessible; “Back tomorrow, or unlock coaching.” |
| Unlocked | Clearly Demo Unlock / no purchase; requests remain explicit |
| Portrait | Panel/sticker hidden; input inert and replay paused |

Settings modes are When I ask, Occasional cues and After the hand. Automatic responses require a visible, requested session and honor that timing choice. Changing or confirming a decision still retires stale wording; retirement does not mean generating a fresh unsolicited recommendation.

The mock stores two uses per local calendar day in localStorage. Only an explicit new session spends one use. Related selected/post-play comments, Why, seek and feedback are included. A new game removes the session, not the use count. Day rollover resets local usage; local Demo Unlock is not payment verification. These are provisional mock rules, not server authority.

## Why, feedback and history

Every recommendation has **Why** plus Helpful / Not helpful. Why opens guided playback on the game view, using the shared replay component and authored histories. Live state stays mounted and frozen. Previous/next and a stable range input move through moments; play/pause advances at the chosen pace; exit restores the same live hand. A concise frame caption uses `aria-live="polite"`.

Frames identify round and trick, or phase `moment` such as Pass left / Doubling. History is navigable across two rounds; selection lessons differ from ordinary trick lessons. No what-if simulator is implied. The reference page's playback is an eight-moment text/control specimen only; use the approved mock for exact cards and topic-specific fixtures.

Helpful / Not helpful is recommendation-specific. Optional reason and note are editable, local-only in the mock, and never submitted by this package. The isolated design reference keeps no feedback. Pause replay when opening feedback/history, leaving the route, entering portrait, hiding the page, opening another modal or reaching the end. Explicit navigation focuses the body/new content; automatic selected-card comments retain card focus.

## Cards, table and preservation boundary

Use the copied `CardFace`, `HandCards`, `PlayerBadge`, `TrickCards`, layout and gesture hooks. Keep the proportion, semantic card names, unplayable opaque face, rank/suit inks, hand spacing, throws and accessible keyboard paths. The reference page does not render replacement cards.

Rally-specific surrounding presentation includes 9px badge rounding, accent active-seat ring, rounded Spades/Hearts felt and wider Trix felt. The source hides the old compass totals and permanent status prose visually; HUD/on-demand scores carry the shell's score display. Do not infer that an old production-only visual rule is now part of this selected mock.

Trix selected doubles use −6% upward translation with 4° clockwise face tilt and normal stacking. The live-play last-trick pocket reserves a corner outside the felt while preserving hand width. Pause/portrait/replay retain the current hand and pending timing. These are source responsibilities, not adjustable decorative examples in the system page.

R09's authored [fit helpers](../approved/shared/rally-fit.mjs), [measurement hook](../approved/shared/useRallyFit.ts) and [Jacks wrapper](../approved/shared/RallyJacksLayout.tsx) allocate hand, lift clearance, trick, badges and public Jacks ranks from the real remaining iframe dimensions. The Jacks wrapper renders canonical `CardFace` and retains accessible card labels and throw targets. The copied vendor source and artwork remain unchanged; context sizing and public layout fitting are authored mock behavior. Resizing does not reset the board.

## Responsive reviewer

The [workbench](../responsive.html) provides representative phone, tablet, desktop and ultrawide CSS classes plus tighter verified registry viewport examples. Device labels do not claim exact physical emulation. Fit scales the review canvas; 100% exposes its selected dimensions with scrolling. The iframe retains its CSS width and height in both modes. Rotate preserves the hand and exercises the real portrait gate.

Game/phase shortcuts use same-origin parent-to-shell `cardford-review` messages so shell scores, game labels, coaching and the board remain coherent. Only explicit scenario loading resets the fixture. Theme and Coach presentation changes request no coaching session. The shell reports effective `coachDisplay`; the reviewer identifies pin-to-overlay fallback. URL `?device=se1&mode=trix-basic-partners&phase=jacks` is whitelisted and loaded once after readiness, never on later resize or state notifications. See [device-profiles.js](../device-profiles.js) for size provenance.

## Evidence and known limits

The token exports can be checked exactly against source. The existing offline suites cover coaching state/DOM contracts, replay fixtures and pocket calculations; see the [package evidence report](../evidence/package-report.md) for receipts. These checks do not measure pixels, screen-reader output, touch ergonomics or production service integration.

The current reference preserves the approved small-text values rather than claiming all text is suitable for every older player. Future production validation should cover zoom, contrast in every state, visible focus, long text, all seven game modes, dense hands and 844 × 390 / 756 × 352 landscape. Agent-run HTML/UI rendering, browser and device QA was not run under the existing security restriction. Standalone SVG asset rasterizations were inspected separately in the [asset-only inspection record](../assets/stickers/asset-inspection.json). The owner's completed design/SVG approval is distinct from those agent test receipts and is not a declaration of accessibility conformance.
