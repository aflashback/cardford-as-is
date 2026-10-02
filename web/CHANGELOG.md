# Web changes

## 2026-10-01 — Selected opening deals

[CR-DEV-001](../planning/decisions/CR-DEV-001-selected-deals.md): local/test servers may load private, versioned full deals through `DEV_SCENARIOS_FILE`. New-game setup then offers a Practice deal picker and labels selected hands. Replay this deal restores the saved opening cards/dealer in a fresh game, including after fixture edits. Normal starts stay random. [Run instructions](../planning/dev-deals.md).

## 2026-09-29 — Game plan, policy profiles and coach outcomes

[CR-STRAT-009](../planning/decisions/CR-STRAT-009-game-plan-and-strength-gate.md). The server can run a named Spades policy profile for local trial through `SPADES_POLICY`; without it the default policy is unchanged. Analysis that uses playouts is computed outside database transactions. Advice gains optional fields for cue version, outcome, explanation and considered choices; advice saved earlier is unchanged. The coach panel shows “Several reasonable plays” when the evidence cannot separate distinct choices.

## 2026-09-28 — CardFord game entry and quiet table

Use the supplied CardFord SVG assets in the header, loading and portrait rotate screen. New games use a full-page pace/game flow and start from the chosen game card. Remove table notes and redundant top-of-table text; keep seat counters and recap. [Decision](../planning/decisions/CR-UX-005-game-entry.md) · [validation](../qa/implementation/cardford-minimal-ui-acceptance.md).

## 2026-09-28 — CardFord name

The owner renamed the product to CardFord. The site, browser title, accessible game picker and generated API title now use CardFord. Historical domain and technical identifiers remain unchanged. [CR-BRAND-002](../planning/brand-and-domain.md) and [acceptance](../qa/implementation/cardford-brand-acceptance.md).

## 2026-09-27 — External last trick

Owner-approved UX-14/UX-17: reserve a left column outside the smaller table for the last trick, adapt centre cards to narrow tables, and retain reachable hand cards through horizontal scrolling on small landscape phones and vertical scrolling on short tablets. No game or API semantics change.

Decision: [CR-UX-004](../planning/decisions/CR-UX-004-table-cues.md). Validation: [acceptance report](../qa/implementation/ui-external-trick-acceptance.md).
