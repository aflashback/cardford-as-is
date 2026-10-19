# CR-UX-006 — Readable cards and shared table interactions

Recorded: 7 October 2026. Approval: the owner's explicit request to implement these UI changes across games, with an attached visual reference. The reference informs layout and information hierarchy; all card faces remain original CSS and text.

The shared React table applies these changes to Hearts Solo, Spades Solo and Spades Partners on both installed backend paths. Later card games should reuse the shared components with their own presentation adapter. This does not add a new playable game or change rules, strategy, persistence, legal choices or public contracts.

| Requirement | Implemented behavior |
|---|---|
| UX-18 | Active table cards are 20% smaller in width and height than the former sizes at the corresponding breakpoints. Only played cards render; there are no empty card outlines. |
| UX-19 | A compact pile preserves North/West/East/South placement. Top/bottom cards overlap the side cards by 8% vertically, reduced from 15% per the owner's readability follow-up; left/right cards have a gap of 20% of card width. Rank/suit corners are inset beyond the overlap strip so ranks remain visible. Visual depth follows public suit/rank order in the current game's presentation adapter. The server's `currentWinner` always occupies the highest layer; the browser never decides the actual winner. |
| UX-20 | Original card faces emphasize a bold upper-left rank and suit and a large lower-right suit. Hands overlap by 40% of card width, increasing as necessary up to 62% on narrower windows. Illegal cards remain faded and disabled without lock icons. |
| UX-21 | Every seat represents its server-provided remaining-card count with small card backs, per the owner's browser follow-ups: a countable fan for 1–4, a countable overlapping fan for 5–8, and a dense fan for 9–13. Zero shows no backs. Exact counts remain accessible labels; visible numeric card-count text is removed. Existing trick/bid counts remain. Opponent card identities remain private. |
| UX-22 | Historical behavior, superseded by the owner's 9 October [UX-42 gesture request](CR-UX-007-trix-shared-table.md): a double click/tap played on turn or prepared without autoplay; selection raised the face 15% and tilted it 12 degrees. Current play uses long-hold dragging and explicit double-activation queues that autoplay only when legal. Stable hit targets, keyboard access and separate pass/double confirmation remain. |
| UX-23 | A permanent history box above the shorter coach reserves space from the start, per the owner's browser follow-up. It has no visible heading and stays empty until the first completed trick, then shows cards with seat placement, accessible names and winner marking. It empties for the next hand without moving the coach and needs no coaching/notes request. Portrait phones retain the rotation gate. |
| UX-24 | All game speed presets have 30% faster shared playback: bot-turn/bidding and trick-collection pauses divide by an additional 1.3. Existing relative 1×/1.2×/1.4× preferences remain compatible. At 1×, the deliberate pauses change from 900/2100 ms to approximately 692/1615 ms. This applies to every game using the shared table; actual backend thinking/network time is additional. |

This supersedes CR-UX-004's lock icon, left-side last-trick placement and fixed hand spacing/scrolling choices (UX-13/14/17). Ordinary desktop and supported landscape hands fit through proportional overlap; keyboard focus still reveals overflow in exceptionally narrow layouts. Existing tablet layouts remain available.

Alternatives considered: moving the entire selected button loses the second pointer hit; fixed negative pixel margins do not adapt to card size; a universal trump sort would misrepresent Hearts; fetching hidden hands to count cards is unnecessary. The retained public `handCounts` and `currentWinner` projections serve the display without contract or stored-data changes.

Acceptance and review images: [UI verification report](../../qa/implementation/ui-card-experience-acceptance.md). These UI checks do not measure bot strength or live Jev quality.
