# Try the local app

From `C:\repos\test-jev`, start native PostgreSQL with `node scripts/windows-env.mjs pg:start`, then run `npm run start:go -- --partner-resources`. Open **http://127.0.0.1:4174**. The startup line must say `reasoning=partner-resources`, `provider=off` and `payments=fixture`.

The Go process serves the API and built React app; PostgreSQL saves games and advice. Node is used by the build/start scripts. There is one authoritative backend for this app.

1. Resume, choose Spades Partners and start a new game. Saved games keep the policy they started with.
2. Bid, then double-click a legal card on your turn. Your partner is opposite you.
3. Open **Give me a cue**, **More context**, then **Suggest a move**. Coach and bots share the same saved reasoning. The partner experiment offers help only when its public-information conditions are met; ordinary random hands may not trigger a new recommendation.
4. Finish the hand, open **Review current game**, reveal the original advice and explore another card. The sample continuation must leave the live table unchanged.
5. Pause/reload, resume and play the next hand. Also try Hearts and Spades Solo to check the existing experience.

To try the separate experimental planner, stop the app and run `npm run start:go -- --actor-rollout`, then create a new game. It evaluates every legal choice on two possible deals and uses the same comparison for bot and coach. Start with Spades; exhaustive Hearts passing currently takes about a minute for all four players on this machine. Review examples disclose their simpler reply rules. Returning to the other startup option preserves saved games and their original advice.

Both experiments are available for hands-on testing. Neither has demonstrated stronger play. No Jev request or real payment is made. Formal human evaluation, independent labels and Tarneeb/Trix rules remain separate pending work.

For foreground startup, Ctrl+C stops Go; `node scripts/windows-env.mjs pg:stop` stops this project's native database. When the agent leaves a background app running, its exact process and executable hash are recorded in the adjacent runtime receipt and ignored `.local/human-app-process.json`; stop that specific process before restarting on the same port.
