# Local branch consolidation — 27 September 2026

Owner requested merging completed worktrees and branches. `main` was fast-forwarded from `3b1d164` to `483d62e`.

All commits unique by identity on `v1/billing`, `v1/build-guide`, `v1/contracts`, `v1/domain`, `v1/provider`, `v1/provider-ledger`, `v1/trials` and `v1/ui` were reported patch-equivalent by `git cherry codex/table-cues <branch>` (only minus entries). Their changes had already been cherry-picked into V1. Commit `483d62e` records those branches as merged using the ours strategy without changing the integrated tree. `v1/local` was already an ancestor. UI commits `8a66bbf` and `a8869f3` are included.

Completed future-play planning and its scoped renderer/evidence were preserved separately in `32613b2`. These documents describe future options, not activated product features. The three linked worktrees were clean; their checkouts and branch references remain intact for recovery. No branch has commits outside `main` after consolidation. No Git remote is configured, so this is a local integration only.

## Checks on the consolidated work

| Command | Actual result |
|---|---|
| `npm run test:all` before merge | 140 passed, 0 failed, 25.3 seconds. |
| `npm run test:all` on merged main | 140 passed, 0 failed, 26.5 seconds. |
| `npm exec -- playwright test -c web/e2e/playwright.config.ts table.spec.ts` on merged main | 17 passed, 18.1 seconds. |
| `node planning/evidence/render-diagrams.cjs --document planning/11-future-play-and-membership.md --output future-play` | 2 diagrams rendered; no failures or original manifest changes. |
| `git diff 32613b2 main --stat` at merge completion | Empty: ancestry merge preserved tested files. |
| `git branch --no-merged main` | Empty. |
| `git status --short` at merge completion | Empty. |

No new public behavior is introduced by consolidation. The earlier [UI acceptance](ui-external-trick-acceptance.md) records UX-14/17 and the build/typecheck checks. Local-code strategy remains active; Jev is off and provider tests use fixtures. No live model ID was observed. No hosted deployment, live Stripe/provider verification or physical-device testing was performed. Hosted identity/Stripe and W18/W19 release evidence remain unfinished.
