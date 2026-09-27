# Jev interface adapter evidence

Live state: **one request executed; response rejected** after local implementation acceptance at source `4145972`. The server-only loader read the owner-provisioned credential without exposing its contents. Requested `typesafe/jev-1.13`; observed `typesafe/jev-1.13-20260917`; recorded cost **USD 0.0000714**. The durable ledger contains exactly one attempt with `invalid-response`; [jev-smoke.json](jev-smoke.json) records the sanitized result. No retry, model promotion or runtime advice/action/grade change occurred.

The precise rejected response field was not retained by the deliberately minimal redacted report. Rechecking the official response example did not establish the cause; do not assume a provider defect or relax validation. Before a separately bounded follow-up experiment, add field-category diagnostics that retain no raw headers, payloads or credentials, reproduce the issue with a fixture, and review the validator. The frozen cap-one experiment is exhausted and must not be reset or bypassed. Live integration is **not passed**; normal application configuration remains Jev off.

Primary contract references, read on 2026-09-27:

- [OpenRouter Decisions API](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request) documents the alpha Decisions endpoint, Choice criteria, response answer/probability/confidence fields and usage cost.
- [Jev tutorial](https://openrouter.ai/docs/guides/community/jev-tutorial) describes structured decision use. The release is configured as `typesafe/jev-1.13`; the allowlisted snapshot `typesafe/jev-1.13-20260917` was observed in the rejected live response above.

Run the mocked adapter/credential tests with:

```powershell
node --test --test-isolation=none web/server/tests/openrouter.test.ts
```

The frozen cap-one smoke was run **after local implementation acceptance**. The following documents its invocation, not permission to reset its ledger. Configure the server environment with `JEV_MODE=shadow`, `JEV_MAX_REQUESTS=1`, `DATABASE_URL` and exactly one of `OPENROUTER_API_KEY` or `OPENROUTER_API_KEY_FILE`. No `VITE_` credential is supported:

```powershell
node web/server/evaluation/jev-smoke.ts --live
```

Without `--live`, the command neither initializes the database nor reads credentials or dispatches. The live smoke uses one original synthetic bidding fixture with 14 legal candidates. It reserves a durable attempt under a PostgreSQL advisory transaction lock before dispatch; the transaction is released before HTTP. The fixed experiment ID survives restart. Pending/unknown-cost records and the one-attempt cap block another request. The request cap is hard; recorded cumulative cost is checked against the budget, and unknown cost is never assumed zero.

Only sanitized status, requested/observed model, cost/unknown-cost and promotion=false are printed/saved. No hand, payload, header, key or raw provider error is emitted. The server loader opens the configured credential only for explicit live nonzero-cap work. A failed auth, credit, malformed response or timeout does not automatically retry. At most one definite 429/503 response with known cost may retry within the same eight-second deadline and durable budget; this cap-one smoke cannot retry.

This tests an interface if explicitly executed. It cannot establish strategy strength, coaching quality, calibration, shortlist quality or promotion. Full W17 controlled evidence remains unfinished.

Mock verification executed: `node --test --test-isolation=none web/server/tests/openrouter.test.ts` — 13 passed, 0 failed. This includes exact wire shape, off/zero bypass, forced/single-shortlist provenance, invalid model/distributions, timeout, Retry-After, durable reservation/restart behavior via a SQL port fixture, unknown-cost blocking and temporary fake credential loading. The SQL fixture is not evidence of a live PostgreSQL provider run; the integrator must verify that separately before live dispatch.

Final review found and fixed a deadline gap before live dispatch: credential, admission, HTTP/body, completion and retry waits now share the decision deadline. PostgreSQL uses the remaining lock/statement budget and destroys timed-out sessions; late reservations never dispatch and ambiguous costs stay fenced. `node --env-file=.env.local --test --test-isolation=none web/server/tests/openrouter.test.ts web/server/tests/provider-ledger.test.ts` passed **19/19**, including actual PostgreSQL lock races. The complete root suite passed **140/140**. Database-pool cleanup occurs outside the eight-second decision budget; connection acquisition has its own three-second timeout. The earlier 13-test paragraph is historical fixture evidence, superseded by these integrated results.
