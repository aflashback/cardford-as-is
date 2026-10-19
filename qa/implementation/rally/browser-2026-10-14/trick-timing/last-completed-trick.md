# Completed trick timing — source and public records

Read-only inspection of main local backend. No game actions, server restart or hidden-hand queries. Identifiers and credentials omitted.

Deal 7, Trix Complex Partners. Public completed trick 2: You S9, Joe S2, Maya S7, Leo S8; winner You. Revision 390 includes all four cards in completed history and an empty active trick. The third-card and completion projections are 1,571 ms apart; dispatcher delivery follows completion by 30 ms. These facts do not prove browser paint.

| Sequence | Event | Revision | Created UTC | Dispatcher completed UTC |
| --- | --- | --- | --- | --- |
| 1122 | session | 386 | 2026-10-15T00:12:04.922Z | 2026-10-15T00:12:04.970Z |
| 1123 | work completed | 386 | 2026-10-15T00:12:06.404Z | 2026-10-15T00:12:06.406Z |
| 1124 | session | 387 | 2026-10-15T00:12:07.834Z | 2026-10-15T00:12:07.861Z |
| 1125 | work completed | 387 | 2026-10-15T00:12:07.960Z | 2026-10-15T00:12:07.963Z |
| 1126 | session | 388 | 2026-10-15T00:12:09.402Z | 2026-10-15T00:12:09.441Z |
| 1127 | work completed | 388 | 2026-10-15T00:12:09.526Z | 2026-10-15T00:12:09.528Z |
| 1128 | session | 389 | 2026-10-15T00:12:10.969Z | 2026-10-15T00:12:11.008Z |
| 1129 | work completed | 389 | 2026-10-15T00:12:11.098Z | 2026-10-15T00:12:11.100Z |
| 1130 | session | 390 | 2026-10-15T00:12:12.540Z | 2026-10-15T00:12:12.570Z |
| 1131 | playback paused | 390 | 2026-10-15T00:14:40.012Z | 2026-10-15T00:14:40.039Z |

No control/access events were retained in this sequence range or the trick window ±5 seconds (00:12:02–00:12:18Z). The earlier control-loss diagnostic at 00:10:40Z predates this trick; it is not its established cause. First trick completed at 00:12:04.922Z (revision 386).

Current persisted preference: speed 1.4, preference revision 1, Coach asked. Historical projections do not snapshot preferences, so this does not establish speed at event time. At speed 1.4 the source specifies 494.5 ms turn waits, 1,153.8 ms completed-trick hold and 82.4 ms card throws.

Native collection commits the fourth play and completed trick together. The mounted UI's useTrickPlayback hook reconstructs the four-card pile from public history; initial mount treats existing history as seen. A later nonempty active trick retires a hold. Outbox dispatcher completion is not client receipt or paint confirmation. Remount, queue collapse or coalesced renders are unproved hypotheses; no root cause or fix is claimed.

The companion JSON lists exact source files and narrowly selected public metadata. No product files changed.
