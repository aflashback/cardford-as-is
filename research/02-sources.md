# Source register

Checked 26 September 2026. Sources below support external facts, not the project's original requirements or proposed performance targets. No third-party articles, screenshots, source code or commercial lesson text are redistributed in this pack.

| ID | Primary source | Used for |
|---|---|---|
| R01 | [TypeSafe HTTP API](https://docs.typesafe.ai/api) | Endpoint, request/response fields, error codes |
| R02 | [TypeSafe model catalog](https://docs.typesafe.ai/models) | Version, pricing, limits, model pinning, customization |
| R03 | [TypeSafe Choice](https://docs.typesafe.ai/primitives/choice) | Choice criteria and option distribution |
| R04 | [TypeSafe confidence](https://docs.typesafe.ai/confidence) | Distribution-derived confidence and calibration caution |
| R05 | [Jev 1.13 limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13) | Arithmetic, counting, context and consistency limitations |
| R06 | [Pagat: Spades](https://www.pagat.com/auctionwhist/spades.html) | Partnership rule reference and variants |
| R07 | [Bicycle: Spades](https://bicyclecards.com/how-to-play/spades) | General play mechanics; contrasting introductory rule choices |
| R08 | [Chess.com: Play Coach](https://support.chess.com/en/articles/10877257-how-do-i-play-against-the-coach) | Guided play, hints and resuming |
| R09 | [Chess.com: Game Review](https://support.chess.com/en/articles/8584089-how-does-game-review-work) | Review and retry interaction concepts |
| R10 | [Cowling, Powley & Whitehouse (2012), university record](https://pure.york.ac.uk/portal/en/publications/information-set-monte-carlo-tree-search/) · [manuscript](https://eprints.whiterose.ac.uk/id/eprint/75048/1/CowlingPowleyWhitehouse2012.pdf) | Information sets and strategy-fusion caveat; introduction visually checked |
| R11 | [Goodman (2019), Re-determinizing IS-MCTS](https://arxiv.org/abs/1902.06075) | Hidden-information leakage into modeled players; Hanabi, not proof about Spades |
| R12 | [React versions](https://react.dev/versions) | React 19.3 baseline |
| R13 | [Node.js releases](https://nodejs.org/en/about/previous-releases) | Node 24 LTS baseline |
| R14 | [TypeScript 6.0](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html) | TypeScript baseline |
| R15 | [Fastify V5 migration](https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/) · [LTS policy](https://fastify.dev/docs/latest/Reference/LTS/) | API framework baseline; compatibility must still be smoke-tested |
| R16 | [Vite guide](https://vite.dev/guide/) | Build-tool selection |
| R17 | [SQLite appropriate uses](https://www.sqlite.org/whentouse.html) | Local persistence decision and scaling boundary |
| R18 | [Playwright emulation](https://playwright.dev/docs/emulation) | Device/viewport automated testing; not a substitute for physical devices |
| R19 | [W3C target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | WCAG 2.2 target sizing; project chooses larger 44px controls |
| R20 | [Trickster Spades bot class rules](https://www.trickstercards.com/home/help/BotClasses.html) | Concrete evidence that failed-Nil behavior varies across rule profiles |
| R21 | [fast-check introduction](https://fast-check.dev/docs/introduction/) | Property-test tool |
| R22 | [Vitest guide](https://vitest.dev/guide/) | Unit-test tool |
| R23 | [TypeSafe: how to build](https://docs.typesafe.ai/concepts/how-to-build-with-system-one) | Code-controlled, bounded model integration pattern |

## Time-sensitive snapshot, not a service promise

R02 listed `jev-1.13.0`, input pricing of $0.042 per million tokens and free output tokens; 64k request total and 32k state-plus-longest-question budgets; and adjustable advertised request/token rate limits. Verify currency, billing terms, actual account quotas and availability before spending. This pack deliberately does not size the application against an advertised quota.

The model page says customer requests are not used for training; that is not the same promise as universal zero retention. Review current terms before inviting external testers. V1 sends card-game information, not names, email addresses, user profiles or authentication data.

## Evidence quality

Vendor documentation establishes the interface it advertises. It does not independently validate strategic intelligence or learning outcomes. Academic sources explain design hazards; they do not validate Jev. User experience sources establish interaction concepts, not permission to reproduce assets. The rulebook in this package is a named product variant and overrides ambiguous external descriptions for this app.
