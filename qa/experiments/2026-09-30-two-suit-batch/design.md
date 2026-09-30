# Authored two-suit research batch

Six offline research episodes pair three complete deals across Spades Solo and Spades Partners. This adds fixtures only; it changes no gameplay, scoring, runtime policy or public behavior. The three-mode scope follows the supersession in `docs/12-multi-game-extensibility.md`; the original Spades-only wording is historical. Rules are the existing scenario-lab `templates/spades-rules.md` and the selected frozen mode profile.

Maya (seat 0) always holds exactly S10 SJ SQ SK SA H4 H5 H6 H7 H8 H9 H10 HJ. Seats 1, 2 and 3 are Leo, Jason and Sarah. Dealer 3 makes Maya first bidder and initial leader. Scores and bags start at zero. Each matched pair has identical hands and dealer; only its competition mode and associated scoring objective change. Partners are Maya/Jason and Leo/Sarah.

| Deal suffix | Leo: spades / hearts | Jason: spades / hearts | Sarah: spades / hearts |
|---|---|---|---|
| spread | S2 S5 S8 / H2 HQ | S3 S6 S9 / H3 HK | S4 S7 / HA |
| void | S2 S3 S4 S5 S6 S7 / none | S8 / H2 HQ HK | S9 / H3 HA |
| concentrated | S2 S3 S4 S5 S6 S7 S8 S9 / none | none / H2 HQ HK | none / H3 HA |

Stable episode IDs are `solo-spread`, `solo-void`, `solo-concentrated`, `partners-spread`, `partners-void` and `partners-concentrated`.

The spread deal supplies a relatively favorable distributional condition for Maya's heart development: all other players can follow the first heart and nobody outside Maya holds more than three spades. The void deal creates adverse immediate heart-ruff exposure and six low trumps in Leo's hand. The concentrated deal places all eight remaining trumps with the same heart-void opponent while both other seats hold hearts. These are design hypotheses about structural opportunities and risks, not established favorable outcomes, guaranteed trick counts, recommended bids or known optimal policies. In particular, high trump ownership alone does not establish the value of Maya's eight hearts.

Clubs and diamonds are fully authored rank lists in `deals.json`, not random filler. In spread, each suit's ranks cycle through Leo/Jason/Sarah from 2 through Q, with K/A assigned to Sarah to meet hand sizes. The void and concentrated rows explicitly redistribute those cards to satisfy the changed capacities and retain varied side-suit honors. Their exact lists are the reproducible source; no seed or generation algorithm is required. Side-suit holdings also change between distributions, so cross-distribution results do not isolate trump concentration alone.

This design and the complete deals are referee/reviewer material. Player packets must contain only the acting seat's hand and allowed public state. Exclude intended coverage, distribution labels, hidden hands and this design text from player prompts. The stable experiment IDs must not provide players with hidden-distribution hints. The original scenario-lab seat-packet allowlist already excludes IDs and fixture metadata.

Missing dimensions include alternative dealer/lead positions; permutations of the long-trump seat; long trumps held by Jason as a partner; different heart-honor placement; nonzero carried scores/bags and late-match incentives; many distinct deals per category; independently reviewed acceptable decisions; multiple opponent styles; repeated runs; and unseen evaluation deals. Three paired deals cannot establish general strategic quality or optimality. Shared mechanics do not make Solo and Partners strategic results interchangeable.

Validation uses independent standard-deck set assertions, exact Maya-hand matching, 13 cards per seat, six unique episode IDs, exact mode pairs, zero starts and identical cards within each Solo/Partners pair. No playout or provider call is claimed by these fixture checks.
