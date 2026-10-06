# Original V1 decision compatibility

`Observation`, `Analysis`, and `Advice` mirror the frozen original decision DTOs.
`ParseObservation` is the untrusted JSON entry point: it rejects duplicate and
unknown properties, null/malformed shapes, unsupported pins, and mismatched legal
actions or public suit memory. `ValidateObservation` performs the equivalent
typed checks without serialization. A decoded DTO is not an authoritative game.

`BuildFacts` is the original compatibility derivation used by both Hearts and
Spades defaults. Call it only after observation validation. Its historical shape
includes mode-specific bid/partner fields because original saved analysis does.
This package is not the V2 generic session/platform facts contract and supplies
no tactical weights or policy selection. Card primitives and the frozen legal
reference projection support validation of the original input.

The importer decodes the checked JSON tree directly; analysis stays typed and
uses neither JSON subprocesses nor TypeScript execution. Derived slices, maps
and nullable values belong to each result. Optional newer policy planning,
claims and search fields are intentionally outside the original analysis DTO.

Focused native verification:

```powershell
node scripts/windows-env.mjs go test ./server/internal/legacydecision ./server/internal/games/spades/reasoning
```
