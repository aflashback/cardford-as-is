# Pause behavior review — 14 October 2026 (Toronto)

Requested inspection only. No production code changed. Actual current game at http://127.0.0.1:4174/; built-in browser visible, viewport reset, game left paused. No card choices submitted during this review.

## How it works

- Manual Pause immediately blocks table input and browser progression. The controller sends an idempotent, control/playback-generation-checked stop command. The server cancels its bot runner; final bot commits check the playback fence. Already-computing preparation may finish and be reused, but cannot commit against a stopped generation. Already-accepted player actions are not undone.
- The browser's presentation timer retains its remaining interval. A running throw settles to the table when animation becomes inactive; the throw is not replayed on resume.
- Resume refreshes/reconciles the session, confirms server playback and then clears the manual pause state. A refresh/reopen starts behind a pause dialog. Lost control requires Take control before Resume.
- Settings, scores, game selection, saved reviews, Coach Why, phone portrait, access/control loss and errors also block progression. Normal Coach notes alone do not pause the game. Closing a temporary menu/Why or returning to landscape resumes if there is no other pause reason.

## Findings

1. **Account navigation can leave server playback running. Confirmed functional gap.** App's hash route unmounts LiveTable; useGoSession cleanup closes the stream and presentation queue without a stop command. Realtime binding closure does not stop the independent bot runner. In the built-in browser, direct navigation to Account emitted zero playback commands. On Return to table, the initial public snapshot still reported `running:true` (generation 9); the freshly mounted table then emitted `running:false`. Bot/automatic turns can therefore continue while away, until a human/boundary or another stop condition. The current hand was at a human choice, so no unseen bot plays were induced. Coach's Unlock coaching path uses this same direct hash navigation; menu-to-Account is usually already paused by the menu. Pause must be confirmed before navigation, with a lifecycle fallback for unexpected exits.
2. **X, Escape and the backdrop mean Resume. Confirmed behavior / UX concern.** The pause dialog passes resumeGame/closeModal as its generic onClose callback. Dialog calls it from all three dismissal methods. Browser verification clicked X and observed a successful `running:true` command and return to play. Initial focus is on X rather than the Resume button. Recommendation: use the explicit Resume action for manual pause; remove ambiguous dismiss paths or give them clear resume semantics.
3. **Background return differs by game. Source-confirmed inconsistency.** Trix visibilitychange sets the persistent paused flag; returning does not clear it, so Resume is required. Hearts/Spades set pageVisible false, then refresh and set it true on foreground, allowing automatic resume if no other blocker remains. Recommendation: choose one policy for every game. Explicit Resume after leaving the app is the less surprising default for this single-player experience.
4. **Trix pause removes access to the rest of the game. Confirmed UI asymmetry.** The Trix pause dialog offers only Resume while the table and Coach are inert/hidden. Hearts/Spades also offer Choose another game. Recommendation: expose consistent paused navigation so a player can change game or open settings without resuming first.

## Evidence and verification

- Current Trix Complex Solo manual pause command: HTTP 200, `running:false`. X dismissal: HTTP 200, `running:true`.
- Phone portrait (390×844): rotation gate and confirmed stop. Return to the original 592×579 landscape: automatic `running:true`, with no Resume dialog.
- Account navigation/re-entry: no stop while leaving, initial return snapshot running, then stop after the table mounts.
- `network-observations.json` contains only the relevant running flags/statuses; credentials and payload details are omitted.
- `paused.jpg` shows the final paused screen. Temporary network observation was disabled.
- `node --test --test-isolation=none web/tests/trick-playback.test.ts`: **35 passed, zero failures/skips**. Includes remaining dwell, late updates, pause/resume overlap and current-revision safeguards. Existing backend pause-fence tests were read, not rerun in this inspection.
- Cross-game visibility policy, lifecycle handling and Escape/backdrop paths were inspected in source. Browser interactions in this review were with the current Trix game; other games were not newly started to verify them.

## Source pointers

- `web/src/api/useGoSession.ts`: updatePlayback (64), lifecycle cleanup (255), setPlayback (279).
- `web/src/games/trix/Table.tsx`: blocked/effect (116), visibility handler (166), resumeGame (346), pause dialog (478).
- `web/src/App.tsx`: route (99), pause conditions (181), closeModal (222), visibility handler (292), pause dialog (934).
- `web/src/table/Dialog.tsx`: Escape (29), backdrop dismissal (62), X (79).
- `server/internal/records/realtime_playback.go`: commit fence (28), durable stop/resume (65).
- `server/internal/service/bot_playback.go`: runner stop (190), serialized command (316), bot-only progression (359).
- `server/internal/service/realtime.go`: connection close (74), independent of bot runner.
