# AUTH-LOCAL-011 — welcome and account annotations

18 October 2026. Owner requested removal of the unexplained club decoration, a more coherent welcome layout, and Appearance controls only inside the game.

## Changes

- Remove the custom rotated club card from the shared authentication screen. Reuse the original CardFord logo and faint mono watermark from the selected sign-in direction.
- Use a centered 560px content column, smaller heading and measured spacing. Continue is the primary full-width action; Sign out and the example-game link are compact secondary actions with at least 44px targets.
- Replace technical session-check wording with `Continue securely to CardFord.` The existing renewal and logout handlers are unchanged.
- Remove Appearance from the auth gate, real account page and both fixture account paths. Existing game-settings pickers in `App.tsx` and `games/trix/Table.tsx` remain. Theme storage and selection behavior are unchanged.

## Passed

- `npm --prefix web run typecheck`.
- `node --test --test-isolation=none web/tests/keycloak-browser-auth.test.ts web/tests/rally-appearance.test.ts`: **20 passed**. These test session coordination/renewal/logout and appearance behavior with controlled dependencies, not a live Keycloak matrix.
- Actual running local app: renewal-required welcome renders without the club or Appearance section. At 475x532 it fits without scrolling. At 320x640 and 1280x800 there is no horizontal overflow; desktop content is 560px. Continue measures 48px high and secondary actions 44px.
- Clicked Continue in the live app: renewal succeeded and the real account page opened with no Appearance section. No game was started or resumed.
- Focused `git diff --check` passed for tracked files; edited untracked source was reviewed separately.

## Visual evidence

- [Annotated viewport, 475x532](welcome-475.jpg)
- [Narrow viewport, 320x640](welcome-320.jpg)
- [Desktop, 1280x800](welcome-desktop.jpg)

Compared with the owner's supplied annotated screenshots: the oversized decorative region and collapsed settings list are removed, and all actions remain visible above the fold. Fonts and colors use the existing product tokens; the watermark is the existing vector asset. Viewport overrides were reset after capture.

## Not run / scope

Full automated browser suite, external browsers and live in-game theme selection were not rerun. In-game picker preservation was verified in source and the existing appearance tests. Authentication policy, endpoints, game rules and session deadlines were not changed. No model or payment provider was used. No commit created; the real account page remains open for review.
