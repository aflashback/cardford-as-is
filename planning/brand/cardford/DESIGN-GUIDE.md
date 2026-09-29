# Cardford design guide

**Status:** owner-selected identity direction, 28 September 2026. This guide describes the reusable vector interpretation of the selected [Open Hand board](../../cardford-open-hand-selected.png). These files are not yet installed in the running application.

## Brand idea and voice

Cardford is a place to play card games for enjoyment and to get better when a player wants help. The identity should work for Spades, Hearts, bridge-like games and future card games without implying that every visit is a lesson. It is confident, clear and welcoming to adult players. It must not resemble an automotive mark, a casino, a toy or a single game's suit.

Write the name **Cardford** as one word, with a capital C and the remaining letters lowercase. Keep **Card** legible as the first four letters. The approved motto is **Card games. Your way**: retain the internal period and omit a period at the end. The banner uses this motto alone; the discarded “Stay for another hand.” line is not part of the selected design.

## Assets

All files below are standalone SVGs in [`svg/`](svg/). The transparent assets have no painted background. The example header and banner are fixed compositions for review; implement navigation and responsive layout as real UI when the app is rebranded.

| File | Intended use |
|---|---|
| [`cardford-symbol.svg`](svg/cardford-symbol.svg) | Full-color three-card mark on a light surface. |
| [`cardford-symbol-mono.svg`](svg/cardford-symbol-mono.svg) | One-ink navy mark for restricted reproduction. |
| [`cardford-app-icon.svg`](svg/cardford-app-icon.svg) | Square blue app icon. Keep the square when exporting platform icons. |
| [`cardford-wordmark.svg`](svg/cardford-wordmark.svg) | Name alone when the card context is already evident. |
| [`cardford-logo-horizontal.svg`](svg/cardford-logo-horizontal.svg) | Default logo for headers and compact placements. |
| [`cardford-logo-tagline.svg`](svg/cardford-logo-tagline.svg) | Logo with the approved motto on a light surface. |
| [`cardford-logo-reverse.svg`](svg/cardford-logo-reverse.svg) | Ivory logo for navy backgrounds. |
| [`cardford-stamp.svg`](svg/cardford-stamp.svg) | Compact outlined “Card Games” brand badge. |
| [`cardford-banner.svg`](svg/cardford-banner.svg) | Selected navy banner with logo and motto only. |
| [`cardford-header-example.svg`](svg/cardford-header-example.svg) | Illustrative header arrangement, not an interactive header. |

`build-assets.mjs` is the editable source for the vector geometry, text, palette and asset variants. Run `node planning/brand/cardford/build-assets.mjs` from the repository root after editing it. The generator reads the project's existing Manrope font package and embeds the licensed Latin WOFF2 in text-bearing SVGs, so the files do not need an external font URL. Keep [`LICENSE-Manrope.txt`](LICENSE-Manrope.txt) with the source assets. SVG viewers that do not support embedded WOFF2 may substitute a font; outline the lettering in the target design application before sending files to a print vendor that requires path-only artwork.

The generated concept board is a raster design reference. These SVGs redraw its geometry in clean flat vectors; they are not an automated pixel trace. Verify any future refinements against the selected board.

## Visual tokens

| Role | Hex | Use |
|---|---|---|
| Navy | `#13304D` | Wordmark, outline, stamp and dark banner. |
| Cobalt | `#2B57E6` | Rear card and app-icon ground. |
| Diamond red | `#CA282B` | One small diamond pip; never the only cue for an action. |
| Warm ivory | `#F6F4ED` | Card faces and reverse lettering. |
| White | `#FFFFFF` | Optional neutral surface. |

These solid vector colors approximate the selected raster board, which has subtle tonal variation. Do not add gradients, shadows, distressed texture or metallic effects to the core mark.

## Construction and sizing

The symbol is three staggered upright playing cards. The navy front-card edge and single red diamond must remain visible. Use the same mark geometry across variants; do not swap in a spade or a coach icon for a different game. The wordmark uses Manrope ExtraBold (weight 800) with close spacing. Supporting text uses Manrope Medium (weight 500). Avoid stretching, outlining with a decorative stroke, or separating “Card” from “ford.”

Use the horizontal logo when its rendered height is at least **32 px**; use the symbol alone where the full name would become too small. Keep clear space around the logo of at least one diamond-pip width, measured at the chosen scale. Test every icon export at **32 px** and **16 px**; at 16 px prefer the square app icon over the stamp or tagline lockup. The stamp is for placements wide enough to keep “CARD GAMES” readable; never use it as a favicon.

On light backgrounds use the primary navy/cobalt/red logo. On navy use the reverse logo. For one-color production use the mono symbol with the navy wordmark. Do not place the primary navy wordmark on dark felt, and do not rely on the red pip alone to distinguish a game state. Preserve an accessible text name in product UI; if adjacent text already says Cardford, mark the decorative symbol `aria-hidden="true"`.

## UI use and boundaries

The header example shows the preferred relationship: symbol, full wordmark, then gameplay navigation. The banner places the logo on the left and **Card games. Your way** on the right. Build these as responsive UI elements rather than placing a single fixed SVG over an interactive surface. Keep the four-seat table and gameplay cues readable; the brand art should not become a card back, playable-card face, seat avatar or coaching signal.

This identity choice does not prove domain ownership, app-store availability, trademark clearance, a live deployment or a completed app-wide rename. Those checks and the UI rollout have separate evidence gates in [the brand decision](../../brand-and-domain.md).
