# CR-UX-006 — Readable cards and shared table interactions

Recorded: 7 October 2026. Approval: the owner's explicit request to implement these UI changes across games, with an attached visual reference. The reference informs layout and information hierarchy; all card faces remain original CSS and text.

The shared React table applies these changes to Hearts Solo, Spades Solo and Spades Partners on both installed backend paths. Later card games should reuse the shared components with their own presentation adapter. This does not add a new playable game or change rules, strategy, persistence, legal choices or public contracts.

| Requirement | Implemented behavior |
|---|---|
| UX-18 | Active table cards are 20% smaller in width and height than the former sizes at the corresponding breakpoints. Only played cards render; there are no empty card outlines. |
| UX-19 | A compact pile preserves North/West/East/South placement with 15% edge overlap. Visual depth follows public suit/rank order in the current game's presentation adapter. The server's `currentWinner` always occupies the highest layer; the browser never decides the actual winner. |
| UX-20 | Original card faces emphasize a bold upper-left rank and suit and a large lower-right suit. Hands overlap by 40% of card width, increasing as necessary up to 62% on narrower windows. Illegal cards remain faded and disabled without lock icons. |
| UX-21 | Every seat displays its server-provided remaining-card count throughout the hand, alongside existing trick/bid counts. Opponent card identities remain private. |
| UX-22 | A double click/tap plays one legal card on the human turn or prepares it while waiting. Prepared cards never autoplay and clear if the next server legal set excludes them. Selection raises the face 15% and rotates it 12 degrees without a green outline/check badge. The button's hit area stays fixed so the second activation is not lost when the face moves. Native desktop double-click settings, touch timing, keyboard play and separate pass confirmation are retained. |
| UX-23 | Last trick appears above the shorter coach panel, retaining seat placement, accessible names and winner marking. It is absent before the first trick and needs no coaching/notes request. Portrait phones retain the rotation gate. |

This supersedes CR-UX-004's lock icon, left-side last-trick placement and fixed hand spacing/scrolling choices (UX-13/14/17). Ordinary desktop and supported landscape hands fit through proportional overlap; keyboard focus still reveals overflow in exceptionally narrow layouts. Existing tablet layouts remain available.

Alternatives considered: moving the entire selected button loses the second pointer hit; fixed negative pixel margins do not adapt to card size; a universal trump sort would misrepresent Hearts; fetching hidden hands to count cards is unnecessary. The retained public `handCounts` and `currentWinner` projections serve the display without contract or stored-data changes.

Acceptance and review images: [UI verification report](../../qa/implementation/ui-card-experience-acceptance.md). These UI checks do not measure bot strength or live Jev quality.
