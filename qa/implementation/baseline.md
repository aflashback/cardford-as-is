# Implementation baseline — 27 September 2026

Source: `3b1d164`. Branch: `v1/local`. Node 24.19.0, Windows PowerShell, PostgreSQL 16 container image available through Podman 6.0.2.

| Check | Actual result |
|---|---|
| `node --test --test-isolation=none tests/*.test.ts` from `web` | Passed: 38 tests, 0 failed |
| `npm.cmd run build` from `web` | Passed with elevated process permissions; Vite 6.4.3 |
| Original default test/build sandbox invocation | Blocked by child-process `spawn EPERM`; rerun above avoids isolation / permits bundler process |
| Git preservation | Original artifacts/prototype preserved in baseline commit; token filename excluded before staging |

This evidence concerns the original prototype only. It does not validate new implementation, live Jev, identity, Stripe, devices or deployment.
