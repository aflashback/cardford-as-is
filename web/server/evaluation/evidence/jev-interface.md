# Jev interface adapter evidence

Live state: **not run**. Provider adapter tests use injected fake responses; secret-loader tests use a fresh temporary fake credential only. The implementing agent did not open the owner credential file and made no model request. No runtime advice, bot action or player grade depends on this adapter.

Primary contract references, read on 2026-09-27:

- [OpenRouter Decisions API](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request) documents the alpha Decisions endpoint, Choice criteria, response answer/probability/confidence fields and usage cost.
- [Jev tutorial](https://openrouter.ai/docs/guides/community/jev-tutorial) describes structured decision use. The release is configured as `typesafe/jev-1.13`; the API example's snapshot `typesafe/jev-1.13-20260917` is an allowlisted configuration, not a live observation.

Run the mocked adapter/credential tests with:

```powershell
node --test --test-isolation=none web/server/tests/openrouter.test.ts
```

The root integrator may run the frozen cap-one smoke **only after local implementation acceptance**. Configure the server environment with `JEV_MODE=shadow`, `JEV_MAX_REQUESTS=1`, `DATABASE_URL` and exactly one of `OPENROUTER_API_KEY` or `OPENROUTER_API_KEY_FILE`. No `VITE_` credential is supported. Then:

```powershell
node web/server/evaluation/jev-smoke.ts --live
```

Without `--live`, the command neither initializes the database nor reads credentials or dispatches. The live smoke uses one original synthetic bidding fixture with 14 legal candidates. It reserves a durable attempt under a PostgreSQL advisory transaction lock before dispatch; the transaction is released before HTTP. The fixed experiment ID survives restart. Pending/unknown-cost records and the one-attempt cap block another request. The request cap is hard; recorded cumulative cost is checked against the budget, and unknown cost is never assumed zero.

Only sanitized status, requested/observed model, cost/unknown-cost and promotion=false are printed/saved. No hand, payload, header, key or raw provider error is emitted. The server loader opens the configured credential only for explicit live nonzero-cap work. A failed auth, credit, malformed response or timeout does not automatically retry. At most one definite 429/503 response with known cost may retry within the same eight-second deadline and durable budget; this cap-one smoke cannot retry.

This tests an interface if explicitly executed. It cannot establish strategy strength, coaching quality, calibration, shortlist quality or promotion. Full W17 controlled evidence remains unfinished.

Mock verification executed: `node --test --test-isolation=none web/server/tests/openrouter.test.ts` — 13 passed, 0 failed. This includes exact wire shape, off/zero bypass, forced/single-shortlist provenance, invalid model/distributions, timeout, Retry-After, durable reservation/restart behavior via a SQL port fixture, unknown-cost blocking and temporary fake credential loading. The SQL fixture is not evidence of a live PostgreSQL provider run; the integrator must verify that separately before live dispatch.
