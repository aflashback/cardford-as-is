# Active generated contract fixtures

`node scripts/windows-env.mjs node scripts/m02a-contracts.mjs` generates this directory from the active public schema and the original TypeScript reference operations. `--check` verifies the checked artifacts.

M04C moved active fixture generation here so adding public definitions cannot rewrite the frozen M02A acceptance evidence under `qa/implementation/multi-game/m02a/contracts/`. The original archive remains an independent compatibility input in `TestOriginalM02AFixturesRemainCompatible`. These generated fixtures test current schema parity; they are not a replacement for frozen game/policy goldens.

`web/shared/local-service.schema.json` is the sole editable source for M04C additions. The TypeScript generator registers it in a second combined output bundle named `local-service.*`, preserving the original client generation byte-for-byte for its M04B source fingerprints. The Go generator consumes that same combined registration and its actual Ajv validators.
