# Spades partnership reasoning guide

**Version:** `spades-partnership-guide-0.2.0`, 29 September 2026. **Status:** authored reasoning and proposed tactics: 60 foundation recipes plus six compound child scenarios. The diamond examples below are executable; the wider recipes are not implemented or independently validated strategies.

**Purpose:** explain what a capable partner notices, what they can infer, and how that changes a decision. This supplies detail beneath the existing S01–S14 / P01–P12 catalog. [Implementation plan](../plans/2026-09-29-partnership-inference.md) · [Decision record](../../../planning/decisions/CR-STRAT-007-partnership-inference-guide.md) · [Example validation](../../../qa/implementation/partnership-guide-validation.md).

**Coverage review:** [Success criteria and discovery method](2026-09-29-scenario-coverage-and-success.md) govern how we find gaps without fitting the system to this example. [Future Jev and coaching evaluation](../plans/2026-09-29-scenario-and-jev-evaluation.md) separates probabilities, action agreement, match results and unaided learning. The A♦–Q♦ sequence is one development family; card identity is not a rule trigger.

## 1. The reasoning contract

For every meaningful play, answer five questions:

1. **What changed?** Cards seen, winner, remaining actors, voids, contract need, Nil status, entries and trump resources.
2. **What does it prove?** Use our hand, legal public history and the exact rule profile.
3. **What could explain it?** List competing holdings and motives, including deliberate ducking and imperfect play.
4. **What should we try next?** Compare legal actions against the team objective, including the cost if our interpretation is wrong.
5. **What would change the plan?** A new void, exposed honor, lost entry, failed Nil or changed score objective.

This can be authored and implemented deterministically. It does not require Jev to recognize a sequence or explain an inference. Strategic preferences remain proposals unless proved for the stated information set; they can still support useful conditional advice.

### Information and rules

The [frozen rule profile](../../02-rules.md) governs. Follow suit when possible; winning, trumping and overtrumping are optional. A side-suit master can be trumped. The trick winner leads next. A Nil player's tricks do not credit the positive team contract. Both Nils score independently. All score comparisons include existing bags and the complete hand's result.

Use **all prior public tricks**, the current partial trick, our cards, public bids and score. Do not use the actual concealed deal, a bot's private plan, future plays, animation timing or another seat's inference cache. UI assistance settings change presentation, never knowledge or analysis. Each seat builds its own view.

| Kind | Meaning | Example |
|---|---|---|
| Fact | Required by cards/rules; store its evidence. | East played a heart on a diamond lead, so East was diamond-void. |
| Hypothesis | Compatible explanation; retains alternatives and cancellation conditions. | East's J♦ may have been its last diamond. |
| Proposed tactic | A conditional preference serving an explicit objective. | Preserve a trump instead of ruffing a secure positive-bidding partner. |
| Proof of an action | Every legal response in the declared information set satisfies the claim. | A fourth-seat underplay leaves an opponent the trick. |

No percentage accompanies a hypothesis in this design. `open`, `supported`, `weakened` and `refuted` describe rule conditions, not measured probability. A `supported` hypothesis may still lose to an alternative explanation. Behavioral evidence never removes a feasible card owner.

## 2. Worked example: partner wins A♦, then Q♦

### Exact position

North is partner, South is us; clockwise order is N → E → S → W. Dealer is West; all four bids are 3. Scores and bags start at zero. South initially holds **♦9 6 3, ♣J 10 9, ♥10 9 8, ♠J 10 9 8**.

| Trick | North | East | South | West | Winner |
|---|---|---|---|---|---|
| 1 | A♦ | 2♦ | 3♦ | 4♦ | North |
| 2 | Q♦ | J♦ | 6♦ | 5♦ | North |

After trick 2:

- North supplied two tricks toward our **combined six-trick contract** and leads next. South cannot choose that next lead.
- Each opponent followed diamonds twice: each originally had at least two diamonds. Either may now be void.
- Five diamonds remain: K, 10, 9, 8, 7. We hold 9; the other four are concealed.
- K♦ may be with North, East or West. Their choice not to play it excludes no owner.
- East's J♦ is a following card, not an off-suit discard. It could be the last diamond, or East could retain K♦/10♦/other diamonds.
- North's A–Q sequence is compatible with more control, but North could have started with only those two diamonds. A future diamond entry is not established.
- Spades are still unbroken. North cannot lead one now unless holding only spades; an opponent void in diamonds may nevertheless ruff a diamond lead.

### Four indistinguishable legal deals

These are full deals in the [verification script](../../../qa/implementation/verify-partnership-guide.mjs). Only concealed cards move; South's entire observation after the two tricks is identical.

| Case | Initial North diamonds | Initial East diamonds | Initial South diamonds | Initial West diamonds | Lesson |
|---|---|---|---|---|---|
| DG-A | A Q K 10 8 | 2 J | 3 6 9 | 4 5 7 | Partner has K; East is now void and retains spades. |
| DG-B | A Q 10 8 | 2 J K | 3 6 9 | 4 5 7 | East followed J while retaining K. |
| DG-C | A Q K 8 | 2 J 10 | 3 6 9 | 4 5 7 | Partner has K; East still must follow with 10. |
| DG-D | A Q 10 8 | 2 J | 3 6 9 | 4 5 7 K | West followed 5 while retaining K; East is void. |

On a third diamond, DG-A permits East's 2♠ to beat North's K♦; DG-C requires East to follow 10♦ and North's K♦ wins this example. In DG-B, East can take a 10♦ lead with K♦. In DG-D, East can ruff 10♦ even though West holds K♦. These are possible continuations, not a forecast or a recommendation to North.

The example therefore creates **two separate questions**: where is K♦, and who can ruff the next diamond? Solving one does not solve the other.

### When a missing cover is informative

| Check | Effect on the interpretation |
|---|---|
| K♦ is in our hand, already played, or exactly located elsewhere | Resolve ownership first; no behavioral guess is needed. |
| Opponent was fourth to play, Q was winning, and their team still needed credit | Holding K would have offered an immediate winning option. Declining it supports investigating other owners, conditional on an ordinary trick-seeking motive. |
| Opponent acted second, with two players still to act | Covering might not secure the trick; entry timing and partner support remain explanations. |
| Opponent has live Nil, a made contract/bag concern, or a reason to keep an entry | Ducking K is strategically plausible. Weaken the missing-cover inference. |
| A later, distinct opportunity again goes unused under the same objective | Retain the repeated pattern, but group correlated evidence; do not manufacture multiple independent votes. |
| Public count/void/capacity constraints eventually leave one feasible K owner | Only this exact deduction can promote ownership to fact. |

In the stated example, West's fourth-seat non-cover is stronger evidence of an opportunity declined than East's second-seat non-cover. Neither proves absence. We cannot verify an opponent's affordable alternatives from a concealed hand, so “they would surely have taken it” is never a fact.

### What to do with the information

| Our actual decision/context | Candidate plan and reason | What overturns it |
|---|---|---|
| During trick 2, after North Q and East J, we hold a lower diamond | Usually follow low and retain useful cards. West still acts, so label partner **currently** winning. | A specific entry transfer or unblocking plan; a different Nil/contract objective. |
| Same position, but we hold K♦ and a low diamond | Usually retain K: no opponent diamond can beat Q, and K cannot protect Q from a spade. | We need the lead for a stated next play; conserving K would block the suit; a relevant Nil rescue in a different history. |
| After Q wins, we are off turn | Save the updated interpretation; prepare responses. Coach offers no “play now” instruction. | North's next card creates our next legal decision. |
| North next leads K♦ and East ruffs; we still hold 9♦ | Follow diamonds. We cannot overruff while holding a diamond. Update East's void as fact. | None under this rule profile. |
| North leads K♦ and East follows; we follow our diamond | Keep lower-cost resources; do not assume West will follow too. | West's action resolves the trick. |
| Later we gain the lead and still have a diamond | Consider returning it if partner can benefit; compare a safer winner/switch when an opponent may be void. | Partner's known void, Nil, no remaining trump, an overruff route, or bag/match cost. |
| We become diamond-void while partner leads a master | Discard a useful loser when partner is secure; consider a protective ruff only if it changes the team outcome. | Later opponent can overruff, or we need a different lead/credit recipient. |
| Opponent was Nil and shed J under Q | Recognize that our winning lead helped unload that danger. Consider a different attack when we next control the lead. | Winning more credit or covering our own Nil is more valuable. |
| Partner bid Nil in this history | A♦ already failed that Nil. Recompute contract credit and bags immediately. | Never describe partner as still live-Nil after the completed A♦ win. |

**Short review cue:** “Partner won two diamond tricks. K♦ is unaccounted for; a third diamond may be ruffed.” A live cue should instead address the card we can actually choose, with the main condition only.

## 3. Scenario recipes

These **60 subcases in nine groups** cover decision families, not every deal or combination. All tactics below are authored candidates. Exact statements inherit the rules above; no row alone establishes optimality. Every implementation needs a reachable positive case, a changed-condition case and its stated counterexample. Parent IDs keep compatibility with the existing catalog. Short cues are templates: show them only when their specific claim and referent are supported, not merely because the row matched.

### H — Honors, missed opportunities and interpretations

| ID | Observable situation / inference | Candidate decision; exception | Short cue | Parent |
|---|---|---|---|---|
| SP-H01 | Partner's A then Q wins; K unaccounted for. Extra control is possible, not proved. | Keep a return option when useful; check opponent length/trump before committing to the suit. | “Partner may still control this suit.” | P08, S03 |
| SP-H02 | A missing honor could have beaten the current winner at an opponent's turn; they followed lower. | Consider other honor owners when their team needs tricks; distinguish current from final winning opportunities and weaken for Nil, bags, entry timing and unknown style. | “The missing cover is a clue, not proof.” | P08, S03 |
| SP-H03 | We hold the missing higher honor; partner is currently winning below it. | Save our honor unless overtaking enables a concrete plan. It cannot prevent a side-suit ruff. | “Keep your king; it cannot stop a ruff.” | P01, P09 |
| SP-H04 | Every higher card in the suit has been played. | Treat our remaining card as a suit master; separately check who can legally trump a side-suit card. | “Highest diamond; still vulnerable to spades.” | S03, P09 |
| SP-H05 | Partner plays a high card as third hand and wins. | Consider remaining lower sequence cards, but do not infer a higher honor or continued length from the win. | “That trick is secure; the next is separate.” | P08, S04 |
| SP-H06 | Partner leads low from an unexposed suit. | Evaluate a return, establishment or short-suit route. Low lead alone promises neither an ace nor shortness. | “Keep the return option open.” | P08, P11 |
| SP-H07 | A high-low sequence resembles a count/preference signal. | Decode only an explicitly supported, public convention; otherwise retain length, forced play and resource-shedding explanations. | “No agreed signal establishes the suit count.” | P08 |
| SP-H08 | A later public card or void contradicts a control hypothesis. | Refute or expire that hypothesis and reconsider its dependent plan; never preserve it as an extra score bonus. | “The new void changes the plan.” | P08, S02 |

### L — Length, voids and cards shed

| ID | Observable situation / inference | Candidate decision; exception | Short cue | Parent |
|---|---|---|---|---|
| SP-L01 | A player follows the same suit twice. Initial length was at least two; residual length is unknown. | Consider third-round ruff risk; a public minimum of one remaining card can remove that immediate risk. | “Two follows do not guarantee a third.” | S02, P08 |
| SP-L02 | J or another high follower goes under a winner. | Keep both exhaustion and retained-sequence/honor explanations. Do not spend trump just because shortness seems plausible. | “The jack may be their last diamond.” | P08, S03 |
| SP-L03 | A player fails to follow suit in legal public play. | Record a persistent void for this no-draw hand; consider ruffs/discards on a return. | “East is out of diamonds.” | S02, P06 |
| SP-L04 | A diamond-void player discards a heart instead of trumping. | Preserve possible trump ownership; they may conserve, avoid bags or protect Nil. | “Passing the ruff does not mean no spades.” | P07, P08 |
| SP-L05 | Partner discards a side suit while void in the lead. | Consider shedding losers, creating a void, saving an entry or a declared preference. Do not label a ruff as a preference discard. | “This may be a suit partner wants to shed.” | P08, S11 |
| SP-L06 | All remaining cards, voids and hand capacities constrain suit length. | Compute exact minimum/maximum counts from feasible allocations; use forced exhaustion/ownership only when established. Inconsistent history gives no certainty. | “The public count rules out another diamond.” | S02, S03 |

### W — Who should win this trick?

| ID | Observable situation / inference | Candidate decision; exception | Short cue | Parent |
|---|---|---|---|---|
| SP-W01 | Positive-bidding partner wins if we underplay in fourth seat. | Usually underplay to retain a winner; an entry transfer, unblock or bag-shedding plan may justify overtaking. | “Partner has this; save a winner.” | P01 |
| SP-W02 | Partner leads for now; an opponent still acts. | Test that actor's possible covers/ruffs before relying on partner. A currently high card is not a finished trick. | “West still has a play.” | P09, S04 |
| SP-W03 | Our higher follow protects against an opponent's possible lower honor. | Cover economically when needed team credit outweighs entry cost. Compare leaving the threat to partner/resources later. | “Your ace removes the king threat.” | P09, S08 |
| SP-W04 | Only a ruff threatens partner's side-suit winner; we must follow. | Do not spend a higher side-suit honor as false protection. Save it unless another stated purpose applies. | “A higher diamond will not beat a spade.” | P09, S01 |
| SP-W05 | Partner still plays after us and opponent is currently winning. | Use an affordable winner when necessary; duck only with a supported rescue/lead plan. A high partner bid is not proof of a cover. | “Do not leave the rescue to an unknown card.” | P01, P09 |
| SP-W06 | We have made our personal positive bid but the team is short. | Keep securing combined contract credit. Personal totals do not end our obligation; Nil tricks are a separate case. | “The team still needs two.” | P10, P12 |

### T — Trump and ruffing resources

| ID | Observable situation / inference | Candidate decision; exception | Short cue | Parent |
|---|---|---|---|---|
| SP-T01 | Partner is known void in a side suit and may hold trump. | Offer a ruff when needed, with opponent order/overruff and partner Nil checked. A void does not promise a ruff. | “This suit may give partner a ruff.” | P06 |
| SP-T02 | Partner is known void in both that side suit and spades. | Stop proposing ruff transfers; consider giving partner a discard or leading another entry suit. | “Partner cannot ruff this one.” | P07, P11 |
| SP-T03 | Partner's ruff would be followed by a possibly void opponent. | Compare another lead or a trump-removal plan. A higher ruff costs partner resources and may still lose. | “West can overruff after partner.” | P06, P09 |
| SP-T04 | Opponent ruffs before our turn and we are void in the lead. | Overruff with the cheapest sufficient trump when valuable; account for the remaining actor and later trump control. Overruffing is optional. | “Take it cheaply if the team needs it.” | S11, P10 |
| SP-T05 | We are void; positive partner is already secure. | Discard a useful loser and keep trump. A deliberate lead transfer or future bag avoidance can change that preference. | “Save the trump behind partner.” | P01, S11 |
| SP-T06 | Long side-suit winners face opposing ruffs; a trump lead is legal. | Compare drawing opposing trump with preserving our/partner's ruffs and entries. Do not strip partner by default. | “Drawing spades also uses partner's spades.” | P06, P11 |
| SP-T07 | Partner needs ruffs for the team contract. | Delay drawing trump when the ruff plan is productive; reverse if overruffs or opponent control make it fail. | “Keep partner's ruffing resource.” | P06, P10 |
| SP-T08 | Repeated side-suit leads can pressure an opponent's trump resources. | Consider reducing their control; they may discard instead, and giving a needed opponent trick or exposing partner Nil can defeat the plan. | “Make their trump expensive to keep.” | S12, P11 |

### E — Entries, sequences and lead transfers

| ID | Observable situation / inference | Candidate decision; exception | Short cue | Parent |
|---|---|---|---|---|
| SP-E01 | A low return could put partner on lead in a productive suit. | Retain/lead the low connector if partner has a credible remaining winner; do not invent residual length from earlier wins. | “Keep a way back to partner.” | P11, P08 |
| SP-E02 | Our honor can block access to partner's long suit. | Consider unblocking under partner's winner if it preserves access and does not surrender a needed control. Unknown partner length weakens the plan. | “Unblock only if the return is useful.” | P11, P01 |
| SP-E03 | Overtaking partner lets us lead a suit where partner can ruff. | Require the actual two-step route, affordable overtake, partner resource and overruff checks. Taking the lead without a route adds no team trick. | “Take the lead to offer the ruff.” | P11, P06 |
| SP-E04 | Our only entry is needed after a suit is established. | Preserve it until the suit can be used; an urgent contract trick or Nil cover may take precedence. | “Save the entry for the established suit.” | P11, S10 |
| SP-E05 | Developing a long suit requires losing control first. | Compare the sacrificed trick and safe return route with cashing immediate winners. Opponents can change suit instead of cooperating. | “The suit needs a loss before it pays.” | P11, S08 |
| SP-E06 | A lead toward a separated honor could benefit from opponent position. | Test a finesse/hold-up route against all relevant honor locations and ruffs. Never assume Bridge agreements or a favorable hidden deal. | “Lead toward the honor, with a fallback.” | P11, S03 |

### N — Nil obligations and their conflicts

| ID | Observable situation / inference | Candidate decision; exception | Short cue | Parent |
|---|---|---|---|---|
| SP-N01 | Our live Nil has several current underplays. | An underplay cannot win this trick. Compare future suit exits when choosing what to shed; the highest-ranked discard across different suits is not automatically the most dangerous card. | “Shed danger while staying underneath.” | S05 |
| SP-N02 | Our live Nil has no current underplay. | Seek possible later rescue without claiming it; if winning is forced, choose resources for the now-failed-Nil continuation. | “No safe underplay is available.” | S06, S07 |
| SP-N03 | Live Nil partner is winning and we can cover. | Usually cover; compare own live Nil and exact team consequences before a sacrifice. Later opponent rescue does not undo the benefit of removing partner from the lead. | “Cover partner's Nil danger.” | P02, P04 |
| SP-N04 | We lead while protecting live partner Nil. | Compare covering leads, safe discards and future cover resources. A high lead may help now yet exhaust the only later rescue. | “Cover now without spending every exit.” | P02, P11 |
| SP-N05 | Partner's live Nil is exposed and we cannot cover legally. | Distinguish certain failure from a later opponent's possible rescue; avoid reassuring cues. Replan only after failure is settled. | “Rescue is uncertain” or, when proved, “Nil cannot survive this trick.” | P03, S04 |
| SP-N06 | Partner Nil has failed. | Stop spending resources to protect it. Favor positive-bidder credit where needed; failed-Nil tricks add bags and may still deny opponents. | “Partner's tricks cannot fill our contract.” | P05, P10 |
| SP-N07 | Opponent Nil can be pressured in a suit. | Compare low leads, refusal to cover and removal of its protector's entries; check own contract/Nil first. High cashing may instead unload its dangerous cards. | “This lead may let their Nil escape.” | S12 |
| SP-N08 | Both our Nils are live and an opponent is guaranteed to win if we underplay. | Preserve both with a legal underplay; avoid an unnecessary cover. Check the entire trick, not only the current winner. | “Both Nils survive this trick.” | P04 |
| SP-N09 | Both live Nils face an unavoidable team trick. | Compare which hand can absorb failure while protecting the other; use remaining cards and exits. Losing one Nil is not permission to lose both. | “Choose which Nil to preserve.” | P04, P05 |
| SP-N10 | Protecting Nil competes with a large positive contract or match result. | Compare complete scored outcomes and their assumptions; no absolute Nil-first rule. Include the 200-point swing between Nil success and failure. | “Compare the whole team result.” | P02, P04, S14 |

### B — Bidding creates the partnership plan

| ID | Observable situation / inference | Candidate decision; exception | Short cue | Parent |
|---|---|---|---|---|
| SP-B01 | Partner bid before us; its positive commitment is known. | Assess complementary winners, shared ruffs and total exposure. Partner's bid gives no exact trump/honor ownership. | “Build the team bid from complementary tricks.” | S13, P10 |
| SP-B02 | Partner has already bid Nil. | Include cover capacity and realistic positive credit in our bid; avoid treating Nil partner's possible winners as contract help. | “Bid what you can take while covering.” | S13, P02 |
| SP-B03 | Our hand suggests Nil but has a dangerous short suit or trump. | Compare legal positive bids and Nil cover/exit scenarios; an unlosable ace of spades rules out Nil success, while low cards alone do not prove it. | “Check where this Nil can get trapped.” | S13, S05 |
| SP-B04 | Our proposed Nil would create two partner Nils. | Examine survival without a dedicated coverer and one-failure recovery; do not borrow a special double-Nil bonus or prohibit the legal bid. | “Both Nils would need independent escapes.” | S13, P04 |
| SP-B05 | Earlier opponent bids are large; later bids remain unknown. | Account for contested tricks and remaining bid order. Do not subtract a fixed count of our winners or read future bids. | “Those tricks are being contested.” | S13, S12 |
| SP-B06 | Scores/bags make different bids change possible terminal outcomes. | Compare reachable success/failure ranges with the actual scorer. Ambitious match-saving bids need an explicit risk rationale; bag room never justifies a guaranteed impossible contract. | “Bid for the match situation.” | S13, S14 |

### O — Contracts, bags and match outcomes

| ID | Observable situation / inference | Candidate decision; exception | Short cue | Parent |
|---|---|---|---|---|
| SP-O01 | Team contract is short with few tricks left. | Secure needed credit with suitable winners; personal bid completion is irrelevant. Include the cost of exposing Nil or losing the match. | “Secure the remaining team trick.” | S08, P10 |
| SP-O02 | Contract is met; another ordinary trick reaches the tenth bag. | Compare avoiding that trick with setting opponents or securing the match. Overtaking partner still gives our team the same trick. | “This extra trick crosses the bag limit.” | S09, P10 |
| SP-O03 | Taking extra tricks might set the opposing positive contract. | Score success and failure of the attack; surrendering our own contract for an unsupported set is not automatically sensible. | “The set must justify the extra bags.” | S12, P10 |
| SP-O04 | Giving opponents a trick might cause their bag penalty. | First establish their contract is made and include who receives credit; otherwise the gift may rescue their bid or Nil. | “A gift may help their contract.” | S12, S09 |
| SP-O05 | A team's needed credit exceeds remaining tricks, or combined table bids exceed thirteen. | The first can prove that team's failure; the second only proves both teams cannot make their contracts. At 7 versus 7 either team can still make seven. Abandon only an individually proved impossible contract. | “Both teams cannot make these bids” or, when proved, “Our contract is unreachable.” | S08, S12, P10 |
| SP-O06 | One or both teams can finish at/above target, including a tie. | Compare both complete scores and bag penalties. Unique high score wins after the hand; a tie continues. Maximizing our hand score alone can lose the match. | “Check both final scores.” | S14, P10 |

### X — Endgame, information and variant checks

| ID | Observable situation / inference | Candidate decision; exception | Short cue | Parent |
|---|---|---|---|---|
| SP-X01 | Few cards remain and ownership/response alternatives are enumerable. | Evaluate a single executable plan across indistinguishable worlds. A plan may not pick a different concealed-world move before information distinguishes them. | “This line works across the remaining possibilities.” | S14, P11 |
| SP-X02 | Facts are incomplete, contradictory or search stops early. | Keep safe legal reasoning and state the specific limitation internally; do not promote the most convenient world to certainty. | “Keep the plan flexible.” | S01, S03 |
| SP-X03 | Partner/opponent style is unfamiliar or hints conflict. | Prefer plans that survive alternative interpretations; keep style assumptions explicit. Public bot identity is not a secret signaling agreement. | “Do not rely on that signal alone.” | P08, P11 |
| SP-X04 | Same own/public cards are considered in Solo and Partners. | Recompute beneficiary and objective. Solo has no partner rescue, shared bid or return obligation; reusable counting/legality remains. | “The objective changes with the table.” | P12, S08 |

### Combining the recipes

The same sequence must be checked across **seat order × own suit length × partner/opponent Nil status × possible trump × contract need × bags/score × available entries**. Test ordinary pairs and the explicit three-way conflicts in section 4; finding a new failure adds a named sibling case or a new subcase, never a silent rule exception.

Advanced continuations also combine these recipes: a **crossruff** alternates T01/T07 and E03 but fails when an opponent overruffs or removes trump; an **endplay** uses E06/X01 to make an opponent lead, but succeeds only if that opponent has no safe exit; a **guard-preserving discard** combines L05/E04/X01 to avoid releasing control of a second suit. A possible **squeeze** needs such a forced resource conflict, a retained threat and a usable entry. Do not announce these plans merely because few cards remain; their reachable cases belong in the entries/endgame milestone.

### Six compound child scenarios found in the coverage review

These are additional recipes awaiting complete legal fixtures, not new test results. Keep them under their parent mechanisms rather than inflating the top-level catalog. Suit names illustrate the pattern; they are not special-case inputs.

| Child ID | Observation and candidate plan | Changed-condition counterexample | Short cue |
|---|---|---|---|
| SP-E03.crossruff | South is heart-void; North is publicly club-void. South can lead a club for North to ruff, then a heart return could let South ruff. Check both players' resources, both transfers and who acts after each ruff. | North has no trump/heart return, or East can overruff North. One successful transfer does not establish the return. | “Keep both ruffs and the return available.” |
| SP-T05.guard | Partner wins a club trick; club-void South can discard 5♥ from K♥5♥ or a low diamond. With A♥ outstanding, retaining 5♥ leaves an underplay that may protect K♥ on a later heart lead. | A♥ is gone, our Nil makes K♥ itself a disposal priority, or a different discard destroys a necessary entry/ruff plan. | “Keep a low heart to protect your king.” |
| SP-T05.first-trump | West leads 3♥, North plays A♥, East follows 4♥; South is fourth and heart-void, spades unbroken. Discarding 2♣ leaves North the trick and keeps spade leads restricted; ruffing 2♠ transfers the lead and breaks spades. | North is live Nil, or South needs the lead for a supported continuation. Compare both consequences; breaking spades is not always bad. | “Discard to keep partner's lead and delay spades.” |
| SP-N07.cover-window | North leads 3♣; East, still on a live Nil, plays 9♣. South can underplay; West, East's partner, is fourth and a legal West cover remains feasible. Keeping East ahead applies pressure but does not settle Nil failure. | If public/own information excludes every legal West cover, underplaying guarantees East takes this trick and fails Nil; use the stronger supported cue. Our own contract can also require taking the trick. | “Their partner still has a chance to cover.” |
| SP-O02.second-cycle | Both our Nils have failed. Nine old bags plus ten team tricks already total nineteen; one more failed-Nil trick creates the second ten-bag penalty and adds no ordinary overtrick point. | A terminal match consequence may dominate the penalty. Score both complete team results; do not apply the ordinary extra-trick value of −99 here. | “Another trick costs the next 100-point penalty.” |
| SP-X01.endplay | Near the end, consider losing a low club to East so East must lead toward our protected heart winner. Verify the forced winner, lack of a safe exit and usable entry across the available information. | East retains a safe lead or another player can ruff. A cooperative rollout is not proof of a forced return. | “Give up the club only if the return is forced.” |

First-trump, guard and Nil-cover-window cases belong in the ordinary-play discovery batch. Crossruff is a multi-trick interaction. Second bag cycles and endplays are deliberate stress cases; their frequency is unmeasured.

## 4. Resolve competing plans explicitly

No universal priority list can replace scoring and future consequences. Use the following conflicts as required paired cases.

| Competing plans | Required comparison |
|---|---|
| Let partner win / take the lead | Same immediate team trick; show the next lead, entry cost and credit recipient. |
| Cash a master / offer a ruff | Opponent voids, possible trump, turn order and entry preservation. |
| Draw trump / preserve partner ruffs | Which plan produces usable team tricks after both teams lose trump? |
| Save own Nil / cover partner Nil | Both survival paths, failure already forced, future ability to protect the survivor. |
| Protect Nil / make positive contract | Complete outcome scoring; projected totals remain assumptions. |
| Avoid bags / set opponents | Compare a successful set, a failed attack and contract security. |
| Return a signaled suit / contradicting public evidence | Exact facts override the signal; unsupported convention has no authority. |
| Gain more points / win the match | Both final totals and tied-target continuation; no mid-hand win claim. |

Two arithmetic anchors make the conflict concrete:

- With bids **0 + 11**, successful Nil and only ten positive tricks scores **−10**; failed Nil with one trick and eleven positive tricks scores **+10** at zero old bags. Those projections do not prove either plan is reachable from a given hand; they show why “Nil always first” is unsound.
- With positive team bid **6** and **9 old bags**, six credited tricks score **+60**; seven score **−39**. The extra ordinary trick changes the hand score by **−99**, but may still deny a larger opponent score or secure the match.

Both are checked against the production scorer in the documentation verifier. Tactic tests must additionally prove a legal route from their fixture; arithmetic-only examples are not strategic fixtures.

## 5. How the system should represent this

Keep the typed game-pack approach. Share the authoring structure and evidence plumbing; keep game-specific meanings inside each game.

| Record | Required contents |
|---|---|
| Scenario | Stable subcase ID, parent IDs, game/variant/rule versions, observable trigger, exclusions, question, counterexamples. |
| Evidence | Seat-visible event/card references, observation version, exact deduction or conditional opportunity, valid time range. |
| Hypothesis | Proposition, alternatives, support/weakening/refutation rules, assumption profile, correlated-evidence group, expiry. No numeric confidence. |
| Tactic | Legal candidate/plan, objective served, required facts, hypotheses used, competing tactics, cancellation and deterministic tie rule. |
| Decision trace | All legal candidates, applicable/rejected tactics, conflicts, outcome assumptions, chosen action, explanation ID, versions and fallback. |
| Case | Complete deal plus legal prefix; acting observation; acceptable alternatives/forbidden claims; counterworld group; label author and rationale. |
| Evidence status | Recognition, fact proof, action rubric, implementation, independent review and outcome evaluation tracked separately. |

**Processing:** observation → exact facts → conditional opportunities → revisable hypotheses → applicable tactics → objective/conflict comparison → action plus authored cue. Run the same analysis for bot choice and human advice; retain original results even when cues are hidden.

### Deterministic inference rules

1. Rebuild from the seat-visible event prefix or use a cache keyed by that prefix, rule version and seat. Nothing learned after a decision may enter its original advice.
2. Compute exact suit-count bounds with card uniqueness, possible owners and hand capacities. A bound is exact only when all relevant constraints are checked; budget exhaustion yields unknown.
3. Detect **conditional opportunities**: if a hypothesized card had been held, was it legal, would it beat the current winner, and could later actors still beat it? Record the actor's public objective at that time. Do not pretend to know that actor's other cards or motives.
4. Apply named hypothesis rules. For H01, retain `partner-retains-control`, `opponent-retains-K`, and `partner-exhausted` when feasible. For L02, retain `last-diamond` and `diamonds-remain`. Supported does not mean other explanations disappear.
5. Group A–Q, the missed K cover and the J follower as one sequence context where they overlap. Do not count derived restatements as independent evidence or blindly add bonuses.
6. Cancel evidence when its proposition stops being relevant: new deal, card played, proved void, changed Nil status or lost entry. Recompute dependent tactics.
7. Prefer a low-cost action that serves the objective across the retained explanations when one exists. If useful plans conflict, compare conditional continuations; record which assumptions matter. Keeping a conservative fallback is a policy choice, not proof of optimality.
8. A plan is observation-dependent: simulated actors choose from their own information. Never average the best omniscient line from each concealed deal and call that a playable strategy. A proof needs every feasible holding and every legal response by uncontrolled players through its claimed horizon, or an independent analytical derivation. This includes an unfamiliar partner; a proof assuming a particular partner policy must state that condition. Success in sampled/stress worlds alone remains heuristic.

Do not begin with a universal natural-language rule interpreter or dozens of free-floating weights. Maintainers should edit a named TypeScript rule next to its scenario, counterexample, cue and tests. A generated read-only catalog can expose those links. A future editing backend or bot-difficulty control remains a separate idea.

### Coach wording

- Facts: “East is out of diamonds.” Hypotheses: “East may be out after that jack.” Actions: “Keep your king; it cannot stop a ruff.”
- Show the selected plan's main reason and one material caveat. Preserve competing reasons privately for review.
- Bind cue IDs to the actual template registry and rendered output. A synthetic catalog label is insufficient.
- Never teach “partner definitely holds K” from a missed cover, “J means void”, “void means will trump”, or “a good outcome proves the decision was good”.
- Replay explains the information available then. Any later-card comparison must be separately labelled, never substituted for the saved advice or unaided evaluation.

## 6. What current code supplies, and what is missing

Inspected at `751ebc9`; these are code findings, not newly run strategy-strength results.

| Area | Present | Needed for this guide |
|---|---|---|
| [Knowledge](../../../web/server/games/spades/reasoning/knowledge.ts) | Own/public cards, voids, conservative possible owners, current-trick checks. | Exact residual suit bounds with evidence; explicit distinction between complete history and resolved holdings. |
| [Signals](../../../web/server/games/spades/reasoning/signals.ts) | Void facts and text hypotheses for partner wins/discards. | Cross-player sequence interpretation, opportunities declined, alternatives, contradiction/expiry, no ruff-as-discard confusion. |
| [Policy](../../../web/server/games/spades/reasoning/policy.ts) | Shared bot/coach tactics, legal set and private additive trace. | Named conflicts and conditional plans; signals currently do not provide the requested multi-trick reasoning. |
| [Entries](../../../web/server/games/spades/reasoning/entries.ts) | Limited take-lead/offer-ruff heuristic. | Unblocking, preserved entries, counterplay and dependent multi-trick routes. |
| [Bids](../../../web/server/games/spades/reasoning/bidding.ts) / [objectives](../../../web/server/games/spades/reasoning/objectives.ts) | Limited bid context; exact scoring of supplied complete projections. | Candidate-specific reachable continuations and full objective tradeoffs; projected arithmetic is not a forecast. |
| [Continuations](../../../web/server/games/spades/reasoning/continuations.ts) | Bounded late-hand experiment, seat-scoped actor observations. | Hypothesis/counterexample coverage, information-consistent plans and operational integration; current helper is not general live planning. |
| [Casebook](../../../web/server/games/spades/reasoning/casebook.ts) / [catalog](../../../web/server/games/spades/reasoning/catalog.ts) | 26 broad families, reachable recognition cases and status links. | The 60 finer recipes, accepted-action rubrics, adversarial siblings, real cue bindings and impact reporting. |
| [Shared types](../../../web/server/strategy/types.ts) | Trace/analysis plumbing. | Shared facts still contain Spades concepts; split game facts without exporting those assumptions to other games. |

The [saved implementation evidence](../../../qa/implementation/TYPED-REASONING-IMPLEMENTATION.md) remains the record of earlier tests. This guide makes no new claim of stronger bots, human learning or complete partnership mastery.

## 7. Reuse in other games

Reuse the **question pattern**, evidence lifecycle, trace and test method. Re-author the trigger, legal implications, objective and cue within each game module.

| Reusable pattern | Spades specialization | What another game must define |
|---|---|---|
| Opportunity declined | Optional K cover, optional ruff. | Whether beating/trumping is compulsory and which alternatives were legal. |
| Resource exhaustion | No more diamonds/trump in this no-draw hand. | Deck/rank mapping, draws, exchanges and when a void fact expires. |
| Control and entry | Fixed spade trump, opposite partner, winner leads. | Trump selection, lead rights, exposed hands/dummy and partner roles. |
| Signal interpretation | Public plays; no implicit convention. | Allowed conventions, public disclosure and legitimate player knowledge. |
| Competing obligations | Shared positive bid, individual Nil, bags, match target. | Points, contracts, penalties and who benefits from an action. |
| Information-consistent planning | Own hand plus public history at each decision. | Which cards are lawfully visible and whether teams share any permitted information. |

For a future Bridge module, known dummy changes visibility; for a future game with changing trump/rank, effective suit and rank must come from its rules. Hearts retains an individual penalty objective. These are extension questions, not implementations or imported Spades rules. The current platform still supports exactly four seats, individually or two teams of two; different seat counts or changing alliances need an explicit kernel change.

## 8. Source checks and authorship

The scenario recipes and counterworlds above are original authored analysis for our frozen rules. Sources informed the checks, not an assertion that these 60 tactics have been independently approved.

- [Bicycle: Spades](https://bicyclecards.com/how-to-play/spades) confirms following suit, optional trump/discard and winner-led continuation. Its scoring/bidding presentation differs from our chosen profile; our specification controls.
- [Pagat: Spades](https://www.pagat.com/auctionwhist/spades.html) documents substantial variant differences, including a named Solo variant with compulsory beating. We retain our own optional-winning profile.
- [AI Factory: opponent-hand inference](https://www.aifactory.co.uk/newsletter/2018_02_opponent_hand.htm) provides a first-party example of separating certain void information from behavioral hand inference. We do not import its proprietary code, numerical adjustments or certainty thresholds.
- [Cowling et al., AIIDE 2013](https://edpowley.com/academic/papers/aiide13.pdf) evaluates Spades search and authored knowledge together; plausible-looking play and measured strength need separate checks. This supports testing our proposed tactics and their conflicts rather than declaring the guide sufficient evidence of strength.
- [Bidding in Spades](https://arxiv.org/html/1912.11323v2) studies contextual bidding, Nil and endgame adjustments. Its learned estimates and outcomes are not calibration for our rules or bots.

**Recommended first acceptance batch:** secure partner versus a pending threat (W01/W02), guarded discards and the first-trump consequence (T05 children), Nil rescue/cover windows (N03/N07), contextual bidding (B01/B02), and contract/bag conflict (O01/O02), plus one ambiguous-sequence group (H01/L02). The diamond example occupies only that last group. Author and validate these across multiple suits, seats, objectives and styles before widening implementation.
