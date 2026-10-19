# CardFord local authentication theme — design QA

**Final result: passed** for AUTH-LOCAL-008, owner-selected option one.

## Target and normalization

Source: [approved option one](qa/implementation/auth-local/theme-20261018/approved-option-one.png). Implementation: real local Keycloak signup, light theme, empty fields, built-in browser. Source raster is scaled proportionally to 536px wide; implementation is 536x532 CSS pixels at one captured pixel per CSS pixel. The generated source has a slightly different aspect ratio, so the comparison retains bottom whitespace rather than stretching it. No browser chrome or device frame is present.

Reviewed both in the **same [comparison image](qa/implementation/auth-local/theme-20261018/comparison.png)**. Labels and controls are readable at this scale; no separate detail crop is necessary. Additional desktop and narrow-screen captures are linked in the [acceptance evidence](qa/implementation/auth-local/theme-20261018/README.md).

## Findings and iterations

- Resolved P1: inherited white branding was illegible on cream. Set the header text to the ink token; final screenshot shows readable CardFord branding.
- Resolved P2: inherited blue divider contradicted the chosen design. Remove the main-header border, retaining the subtle neutral header rule.
- Resolved P2: inherited desktop container padding reduced the intended 560px form to 364px. Reset container padding and set child width explicitly. Final 1280px screenshot shows the intended centered 560px column.
- Resolved P2: default OTP recipient field duplicated the custom recipient sentence. Add an opt-out parameter for that native block only on the OTP template; retain the native restart URL as the clear `Use a different email` link.
- Resolved P3: add six pixels between the OTP control and expiry helper. Final normal code screenshot verifies the spacing.
- Resolved P2: the inherited password-validator script referenced a nonexistent password field in this passwordless realm. Guard it with the same condition as the password fields; verify a fresh signup load has no new console errors and still rejects invalid email.

Post-fix comparison has no remaining P0/P1/P2 issues in the selected local flow. Earlier corrections were driven by actual browser views; the saved comparison represents the final reviewed signup.

## Required fidelity surfaces

| Surface | Assessment |
| --- | --- |
| Fonts/typography | Bundled Manrope headings and DM Sans UI text loaded. Strong left-aligned heading, restrained secondary text and readable labels match the chosen direction. Actual product fonts replace any uncertain generated glyphs. |
| Spacing/layout | Flat cream layout, top branding/rule, right watermark, two fields, full-width action and sign-in footer retained. Narrow layouts fit without horizontal overflow. Desktop caps content at 560px. |
| Colors/tokens | Cream `#eee9dc`, ink `#242820`, terracotta `#bd442d`, paper fields `#fffdf8`. Neutral boundaries and faint watermark retain the source palette. Native semantic alerts remain legible. |
| Images/assets | Exact existing CardFord vector assets reused, crisp at all sizes. No recreated logo, remote image or placeholder. Watermark uses mono SVG at low opacity. |
| Copy/content | Signup headline, subtitle, passwordless explanation, optional display name, Create account and Sign in match the source. Sign-in/code pages extend the same language, with provider-policy guidance. |

Acceptable product constraints: controls are at least 44px high and form text is 16px, slightly larger than the scaled generated mock; header branding is also slightly larger. This keeps native forms usable at narrow widths. The real mono logo differs subtly from the generated watermark; the exact existing product asset is intentional. The mock's subtle raster texture is represented by the product's flat cream surface. No new decorative asset is required.

## Interaction and scope

Actual browser checks passed: empty/malformed signup email, sign-in/signup navigation, wrong code, resend cooldown, successful existing-account OTP login returning to a paused game, and restart to a different email. Signup reviewed at 320x640, 390x844, 536x532 and 1280x800. Native labels, focus rings and linked descriptions are present; no claim of full WCAG conformance.

The complete automated live suite, new-account completion, alternate browsers, social login, RTL/localization and account-console screens were not verified in this pass. They remain outside this design acceptance scope. No outstanding decision is needed for the selected option.
