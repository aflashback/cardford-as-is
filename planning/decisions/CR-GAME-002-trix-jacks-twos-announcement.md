# CR-GAME-002 — Trix Jacks and automatic Partners twos announcements

Date: 2026-10-08. Status: owner-confirmed; implemented and focused verification passed. Local Go/Vite app refreshed. Broader baseline resource limits remain recorded separately.

## Decision and requirements

**TRX-13 — Naming.** Use **Trix Jacks** when specifically naming the Jack-starting layout request in Basic/Complex and Solo/Partners. The game family remains Trix. Keep the internal request ID `trix` and existing recorded IDs stable.

**TRX-14 — Partners twos announcement.** Immediately after the kingdom owner selects Trix Jacks, the server checks the original holders of C2, D2, H2 and S2. Enable the announcement only when both opposite-seat teams hold at least one of those cards. If all four belong to one team, omit the entire announcement without identifying that team.

When enabled, show all four cards face-down beside their owners in the same area as doubled cards. The public response contains only the four holder counts, never concealed suits/card IDs. One opening round is exactly four layout turns starting with the owner, counting forced passes. The fourth accepted turn atomically makes all four original card/holder identities public, before the owner's second turn. Reveal is driven by persisted game state, not browser timing or user confirmation.

Normal layout legality applies throughout: after a Jack opens a suit, a legal adjacent 10 or Queen can be played immediately. The owner explicitly rejected an opening Jacks-only restriction. Announced twos remain in their owners' hands, count toward those hands and can be played normally later. Announcement does not change points, finishing, turn direction or request scheduling. Once a revealed two is played, remove its duplicate badge announcement as with doubled cards; the public historical announcement remains available in saved observations.

No announcement in either Solo variant, other requests, or a skipped one-team case. No popup, announcement action, new phase, confirmation, delay or runtime provider is introduced.

## Architecture and compatibility

Keep the rule in the typed Trix reducer and allowlisted observation. Use a separate optional `twoAnnouncements` union: hidden holder counts or revealed exact card/seat pairs. Do not put concealed twos into public doubling declarations or hide their suits only with CSS.

New Partners sessions use module `2.1.0`, rule profiles `trix-basic-partners-1.1.0` / `trix-complex-partners-1.1.0`, and state/observation/public schemas `1.1.0`. Event commands keep schema `1.0.0`; the reveal is a deterministic consequence of the existing fourth turn. Solo pins remain unchanged. Preserve historical Partners installations for exact-pin load/replay/resume, omit them from new-game catalog/admission, and keep old saved advice and observations unchanged.

Use the existing shared badge/card geometry and server-issued legal candidates. Presentation changes must preserve the current shared table work in [CR-UX-007](CR-UX-007-trix-shared-table.md).

## Alternatives rejected

- Public card IDs with face-down CSS would disclose suits before the permitted reveal.
- A separate confirmation/declaration phase would contradict the automatic rule.
- Restricting the opening round to Jacks would change normal legality, contrary to the owner's clarification.
- Silently applying new semantics to an old pin would alter saved games and historical evidence.

## Verification

Cover both Partners variants; 1/3, 2/2 and 3/1 team splits; either team holding all four; several twos held by one player; all opening owners; passes and adjacent cards in the first circuit; reveal timing; reset, restart, stale/duplicate commands and old pins. Check that hidden projections contain counts only and that announced cards remain in hand. Verify automatic badge rendering and shared responsive layouts without announcement prompts.

Results belong in [the focused acceptance report](../../qa/implementation/trix/twos-announcement.md). Preserve the earlier full-session resource-gate limitation; do not rerun the full twenty-deal browser campaign for this bounded amendment. Test invocations retain the 30-minute maximum.
