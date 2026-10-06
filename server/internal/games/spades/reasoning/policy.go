package reasoning

import (
	d "cardford/server/internal/legacydecision"
	"fmt"
	"slices"
	"sort"
	"strings"
)

// Analyze uses the exact original pin. It never mutates or retains observation
// slices; the resulting actions and knowledge belong exclusively to the caller.
func Analyze(o d.Observation) (d.Analysis, error) {
	if err := d.ValidateObservation(o); err != nil {
		return d.Analysis{}, err
	}
	if o.Mode != "spades-solo" && o.Mode != "spades-partners" {
		return d.Analysis{}, fmt.Errorf("Spades policy requires a Spades observation")
	}
	if len(o.LegalActions) == 0 {
		return d.Analysis{}, fmt.Errorf("No decision is available for this seat.")
	}
	return analyze(o, d.BuildFacts(o))
}

func analyze(o d.Observation, f d.Facts) (d.Analysis, error) {
	reasons := []d.Reason{}
	scenarios := []string{}
	common := []string{}
	add := func(id, kind, text string, actions []string) string {
		scenario := strings.Split(id, ".")[0]
		if !slices.Contains(scenarios, scenario) {
			scenarios = append(scenarios, scenario)
		}
		for i := range reasons {
			if reasons[i].ID == id {
				for _, a := range actions {
					if !slices.Contains(reasons[i].ActionIDs, a) {
						reasons[i].ActionIDs = append(reasons[i].ActionIDs, a)
					}
				}
				return id
			}
		}
		reasons = append(reasons, d.Reason{ID: id, Kind: kind, Text: text, ActionIDs: actions})
		return id
	}
	shared := func(id, kind, text string) { common = append(common, add(id, kind, text, nil)) }
	partner := f.Partner
	opponents := []int{}
	opponentNils := []int{}
	for _, s := range d.Seats() {
		if s != o.Seat && !eq(partner, s) {
			opponents = append(opponents, s)
			if eq(o.Bids[s], 0) && o.Tricks[s] == 0 {
				opponentNils = append(opponentNils, s)
			}
		}
	}
	positiveNeed := d.Value(f.ContractNeeded) > 0
	ownCanCredit := d.Value(f.OwnBid) > 0
	contractValue := 20 * d.Value(f.ContractBid)
	outcomes := map[string]d.CardOutcome{}
	for _, v := range f.CardOutcomes {
		outcomes[v.ActionID] = v
	}
	laterOpponents := []int{}
	for _, s := range f.ActorsAfter {
		if slices.Contains(opponents, s) {
			laterOpponents = append(laterOpponents, s)
		}
	}
	liveOwn := f.OwnNil == "live"
	livePartner := eq(f.PartnerNil, "live")
	bothNil := liveOwn && livePartner
	doubleNil := assessDoubleNil(o, f)
	losing := []d.Action{}
	for _, a := range o.LegalActions {
		if a.Kind == "play" && outcomes[d.ActionID(a)].CurrentWinner != o.Seat {
			losing = append(losing, a)
		}
	}
	covers := []d.CardOutcome{}
	for _, v := range f.CardOutcomes {
		if v.CoversPartnerNil {
			covers = append(covers, v)
		}
	}
	winnerOpponentNil := f.CurrentWinner != nil && slices.Contains(opponentNils, *f.CurrentWinner)
	if o.Phase == "bid" {
		b, err := assessBids(o)
		if err != nil {
			return d.Analysis{}, err
		}
		var selected d.Action
		for _, a := range o.LegalActions {
			if a.Kind == "bid" && a.Bid == b.selected {
				selected = d.CloneAction(a)
				break
			}
		}
		shared("S13.structure", "heuristic", "Hand structure estimates high cards, trump length and protected side-suit honors. Its weights are not calibrated probabilities.")
		shared("S13.contextual-bid", "heuristic", strings.Join(b.reasons, " "))
		if any(o.Bids, func(v *int) bool { return v != nil }) {
			shared("S13.public-bids", "fact", "Earlier bids are public commitments; they do not prove which unplayed cards anyone holds.")
		}
		if livePartner {
			shared("P04.bidding-nil", "heuristic", "A Nil partner cannot supply positive-contract credit. Both players may bid Nil, but two independent Nil commitments can compete for protection.")
		}
		candidates := []d.Candidate{}
		traces := []d.TraceCandidate{}
		for i, a := range o.LegalActions {
			candidates = append(candidates, d.Candidate{Action: d.CloneAction(a), ReasonIDs: append([]string{}, common...), Disposition: tern(d.ActionID(a) == d.ActionID(selected), "selected", "alternative"), Evidence: "heuristic"})
			c := b.candidates[i]
			effects := []d.Effect{{ID: "S13.heuristic-distance", Delta: -c.distance}, {ID: "S13.feasibility", Delta: tern(c.contractFeasible, 0.0, -100.0)}, {ID: "S13.known-failed-nil", Delta: tern(c.nilFeasible, 0.0, -200.0)}}
			score := 0.0
			for _, e := range effects {
				score += e.Delta
			}
			traces = append(traces, d.TraceCandidate{ActionID: d.ActionID(a), Score: d.Ptr(score), Effects: effects, TieOrder: i})
		}
		return d.Analysis{
			SchemaVersion: "1.0.0", PolicyVersion: PolicyVersion, Provenance: "code",
			Action: selected, ScenarioIDs: scenarios, Reasons: reasons, Facts: f,
			Candidates: candidates, Limitations: append([]string{}, b.limitations...),
			Trace: &d.Trace{
				SchemaVersion: "1.0.0", PolicyVersion: PolicyVersion,
				CatalogVersion: "spades-catalog-1.0.0", SelectedActionID: d.ActionID(selected),
				SelectedBy: "heuristic-rank", ScenarioChecks: scenarioChecks(o.Mode, "bid", scenarios),
				Candidates: traces, Limitations: append([]string{}, b.limitations...),
			},
		}, nil
	}
	shared("S01.legal-set", "fact", fmt.Sprintf("%d legal card %s available under this rule profile.", len(o.LegalActions), tern(len(o.LegalActions) == 1, "action is", "actions are")))
	if len(f.OutstandingCards) > len(o.Hand) {
		shared("S03.ownership", "fact", "Unplayed higher cards remain possible holdings; choosing a low card or declining to trump does not reveal their owner.")
	}
	if len(o.Trick) > 0 {
		text := "You play fourth, so the winner after your card is exact."
		if len(f.ActorsAfter) > 0 {
			text = fmt.Sprintf("%d %s to play; a current winner is provisional unless every possible response is excluded.", len(f.ActorsAfter), tern(len(f.ActorsAfter) == 1, "player still has", "players still have"))
		}
		shared("S04.turn-order", "fact", text)
	}
	if f.LedSuit != nil && f.SuitLengths[*f.LedSuit] == 0 {
		shared("S02.void", "fact", "You have no card of the led suit, so any card in your hand is legal.")
		shared("S11.trump-choice", "fact", "There is no obligation to trump or overtrump in this profile.")
	}
	if liveOwn {
		if len(losing) > 0 {
			shared("S05.live-nil", "fact", "Your Nil is still live. A card below the current winner keeps you from taking this trick.")
		} else {
			shared("S06.no-underplay", "fact", tern(all(f.CardOutcomes, func(v d.CardOutcome) bool { return eq(v.GuaranteedWinner, o.Seat) }), "Every legal card guarantees you this trick, so your Nil fails even if other players still have to play.", "Every legal card currently wins. A later player may overtake if their legal response can beat it; rescue is not guaranteed."))
		}
	}
	if f.OwnNil == "failed" {
		shared("S07.failed-nil", "fact", "Your Nil has failed. Further tricks add bags, earn no overtrick points and cannot help a positive contract.")
	}
	if f.ContractNeeded != nil {
		if positiveNeed {
			shared("S08.contract", "fact", fmt.Sprintf("%s %d credited %s; only positive bidders supply that credit.", tern(partner == nil, "Your contract needs", "Your team contract still needs"), *f.ContractNeeded, tern(*f.ContractNeeded == 1, "trick", "tricks")))
		} else {
			text := "There is no positive contract. Nil awards are individual; failed-Nil tricks add bags without overtrick points."
			if !eq(f.ContractBid, 0) {
				text = fmt.Sprintf("The positive contract is met. The next ordinary bag changes this hand's score by %s.", tern(eq(f.NextOrdinaryBagDelta, -99), "-99 at the ten-bag boundary", "+1 before any later bag penalty"))
			}
			shared("S09.contract-met", "fact", text)
		}
	}
	if len(o.Trick) == 0 {
		shared("S10.lead-choice", "heuristic", "Compare cashing control with developing a short suit. A side-suit master may still be trumped.")
	}
	if len(opponentNils) > 0 {
		shared("S12.opponent-nil", "fact", "An opponent still has a live Nil. Making that player take a trick changes the Nil award from +100 to -100.")
	}
	if len(o.History) >= 10 || any(o.Scores, func(v int) bool { return v >= 400 }) {
		shared("S14.late-score", "heuristic", "Late-hand choices depend on contracts, Nil and bag penalties. Match victory is checked only after the complete hand is scored; this tactical policy does not solve the remaining hand.")
	}
	if partner != nil {
		shared("P10.team-contract", "fact", "Positive partnership bids share one contract; each positive bidder can cover the other. Nil tricks never count toward it.")
		shared("P12.mode-objective", "fact", "This table scores the two opposite seats together. A teammate trick can serve the shared positive contract; Solo scores each seat separately.")
		if same(f.CurrentWinner, partner) && !eq(o.Bids[*partner], 0) {
			shared("P01.partner-current", "fact", "Your positive-bidding partner is currently winning this trick.")
			under := any(f.CardOutcomes, func(v d.CardOutcome) bool { return v.CurrentWinner == *partner })
			safe := any(f.CardOutcomes, func(v d.CardOutcome) bool { return eq(v.GuaranteedWinner, *partner) })
			text := "A later player may overtake your partner; compare conserving a card with economical protection."
			if safe {
				text = "A legal underplay leaves your partner the guaranteed winner of this trick."
			} else if !under {
				text = "Every legal card overtakes your partner; no legal underplay can leave your partner winning."
			}
			shared("P09.partner-security", tern(safe || !under, "fact", "heuristic"), text)
		}
		if livePartner && same(f.CurrentWinner, partner) {
			if len(covers) > 0 {
				shared("P02.live-nil-cover", "fact", "Your partner Nil is still live. Overtaking now takes this trick off your partner even if an opponent later wins; the positive contract being met does not remove this need.")
			} else {
				shared("P03.no-cover", "fact", "No legal card can overtake your Nil partner."+tern(all(f.CardOutcomes, func(v d.CardOutcome) bool { return eq(v.GuaranteedWinner, *partner) }), " Your partner is guaranteed this trick and the Nil fails.", " A later opponent can rescue the Nil only if they have a legal card that beats it."))
			}
		}
		if bothNil {
			shared("P04.double-nil", "heuristic", "Both Nil commitments are live. Covering your partner may put your own Nil at risk; there is no universal sacrifice rule.")
		}
		if eq(f.PartnerNil, "failed") {
			shared("P05.failed-partner", "fact", "Your partner Nil has failed. Their further tricks add bags without positive-contract credit; the Nil bonus cannot be recovered.")
		}
		relevant := []string{}
		if f.LedSuit != nil {
			relevant = append(relevant, *f.LedSuit)
		} else {
			for _, c := range o.Hand {
				relevant = append(relevant, d.CardSuit(c))
			}
		}
		if any(relevant, func(s string) bool { return s != "S" && slices.Contains(f.Voids[s], *partner) }) {
			shared("P06.partner-void", "heuristic", tern(canHold(f, *partner, "S"), "Your partner is publicly void in a relevant side suit and may be able to ruff. Trump ownership and possible opponent overruffs remain uncertain.", "Your partner is publicly void in a relevant side suit, but no remaining spade is possible for them."))
		}
		if slices.Contains(f.Voids["S"], *partner) {
			shared("P07.no-partner-trump", "fact", "Your partner is publicly void in spades and cannot ruff a future side-suit trick.")
		}
		hints := inferPartner(o)
		public := append([]d.Play{}, o.Trick...)
		for _, t := range o.History {
			public = append(public, t.Plays...)
		}
		if any(public, func(p d.Play) bool { return p.Seat == *partner }) {
			text := "Partner has played publicly, but no suit preference follows from that alone; no signaling convention is assumed."
			if len(hints) > 0 {
				h := hints[len(hints)-1]
				text = h.evidence + " " + h.counterexample + " A winning high card does not identify an unplayed higher card's owner; no signaling convention is assumed."
			}
			shared("P08.public-hints", "heuristic", text)
		}
		if len(o.Trick) == 0 || f.LedSuit != nil && f.SuitLengths[*f.LedSuit] == 0 {
			shared("P11.entries", "heuristic", "Consider who gains the next lead and whether spending trump removes a later partnership entry or ruff.")
		}
	}
	type rankedEntry struct {
		action    d.Action
		index     int
		score     float64
		effects   []d.Effect
		reasonIDs []string
	}
	ranked := []rankedEntry{}
	for index, action := range o.LegalActions {
		if action.Kind != "play" {
			return d.Analysis{}, fmt.Errorf("Spades play requires a card action.")
		}
		id := d.ActionID(action)
		outcome := outcomes[id]
		suit := d.CardSuit(action.Card)
		rank := float64(d.CardRank(action.Card))
		winsNow := outcome.CurrentWinner == o.Seat
		confirmedWin := eq(outcome.GuaranteedWinner, o.Seat)
		lead := len(o.Trick) == 0
		r := rankedEntry{action: d.CloneAction(action), index: index, effects: []d.Effect{}, reasonIDs: []string{}}
		reason := func(id, kind, text string) {
			r.reasonIDs = append(r.reasonIDs, add(id, kind, text, []string{d.ActionID(action)}))
		}
		effect := func(id string, delta float64) {
			r.score += delta
			r.effects = append(r.effects, d.Effect{ID: id, Delta: delta})
		}
		effect("tie.economical-rank", -rank/100)
		if doubleNil[id] == "both-survive-this-trick" {
			effect("P04.keep-both-live", 1000)
			reason("P04.keep-both-live", "fact", "This completed trick belongs to an opponent, so both Nil commitments remain live for now. Their final success still depends on later tricks.")
		}
		if liveOwn {
			if !lead && !winsNow {
				effect("S05.shed-risk", 600+rank+tern(suit == "S", 20.0, 0.0))
				reason("S05.shed-risk", "heuristic", "This card loses to an already played card. Prefer shedding a dangerous high loser while keeping the Nil live.")
			} else {
				effect("S06.rescue", -(rank*3 + tern(suit == "S", 35.0, 0.0)))
				if confirmedWin {
					effect("S06.guaranteed-failure", -500)
				}
				reason(tern(confirmedWin, "S06.guaranteed-failure", "S06.rescue"), tern(confirmedWin, "fact", "heuristic"), tern(confirmedWin, "This card guarantees you the trick, which fails your live Nil.", "When no safe underplay exists, prefer a card that leaves later players room to overtake; that rescue is uncertain."))
			}
			if bothNil && outcome.CoversPartnerNil {
				effect("P04.cover-tradeoff", tern(confirmedWin, 20.0, 90.0))
				reason("P04.cover-tradeoff", "heuristic", "This covers your partner now, but transfers the current lead to you while your own Nil is live.")
			}
		} else if !lead {
			if positiveNeed && ownCanCredit {
				if winsNow {
					effect("S08.economical-winner", tern(confirmedWin, 150.0, 90.0))
					if eq(f.ContractNeeded, 1) {
						effect("S08.last-needed", float64(contractValue)/4)
					}
					effect("S08.resource-cost", -(rank + tern(suit == "S", 16.0, 0.0)))
					reason("S08.economical-winner", "heuristic", "This takes the current lead toward the contract. Prefer an economical winner while retaining stronger control for later tricks.")
				} else {
					effect("S08.preserve-control", -rank/3)
					reason("S08.preserve-control", "heuristic", "This does not take the current lead. Compare the control left in your hand before saving a card for a later contract trick.")
				}
			} else {
				effect("S09.limit-bags", tern(winsNow, -100.0-tern(eq(f.BagRoom, 1), 100.0, 0.0), 60+rank))
				reason("S09.limit-bags", "heuristic", "When no credited contract trick is needed from this seat, prefer avoiding an extra trick and shedding a higher loser.")
			}
			if !winsNow && suit == "S" {
				effect("S11.keep-trump", -12)
			}
			if winnerOpponentNil {
				if eq(f.CurrentWinner, outcome.CurrentWinner) {
					effect("S12.leave-nil-winning", tern(len(f.ActorsAfter) > 0, 140.0, 240.0))
					reason("S12.leave-nil-winning", tern(len(f.ActorsAfter) > 0, "heuristic", "fact"), tern(len(f.ActorsAfter) > 0, "This leaves the opposing Nil currently winning; later players may still change the result.", "This leaves the opposing Nil winning the completed trick, so that Nil fails."))
				} else if winsNow {
					effect("S12.avoid-cover-opponent-nil", -80)
				}
			}
		} else {
			knownRuffers := 0
			for _, s := range opponents {
				if suit != "S" && slices.Contains(f.Voids[suit], s) && canHold(f, s, "S") {
					knownRuffers++
				}
			}
			if positiveNeed && ownCanCredit {
				effect("S10.lead-control", tern(outcome.IsMaster, 70.0, 20/float64(f.SuitLengths[suit])-rank))
				if confirmedWin {
					effect("S10.guaranteed-lead", 70)
				}
				effect("S10.known-ruff-risk", float64(-knownRuffers*35))
				if suit == "S" {
					effect("S10.keep-trump", -22)
				}
				reason(tern(outcome.IsMaster, "S10.cash-control", "S10.develop-suit"), "heuristic", tern(outcome.IsMaster, "This is the highest unplayed card of its suit. Cashing it may help the contract, while possible ruffs still matter.", "A low lead from a shorter suit can develop a future void while preserving higher cards."))
			} else {
				effect("S09.low-lead", -(rank*2 + tern(outcome.IsMaster, 25.0, 0.0) + tern(suit == "S", 20.0, 0.0)))
				reason("S09.low-lead", "heuristic", "A lower lead may help avoid an unwanted trick; it cannot guarantee another player will win.")
			}
			if len(opponentNils) > 0 && !livePartner {
				effect("S12.nil-pressure-lead", 16-rank)
				reason("S12.nil-pressure-lead", "heuristic", "A low lead may pressure an opposing Nil, but its cover and your own contract still matter.")
			}
		}
		if partner != nil {
			entry := assessEntry(o, f, action)
			if entry != nil {
				effect("P11.route-to-ruff", entry.weight)
				reason("P11.route-to-ruff", "heuristic", fmt.Sprintf("Taking this trick %s the next lead. You retain %s to offer your publicly void partner a possible ruff%s. Partner trump ownership remains uncertain.", tern(entry.certain, "secures", "may earn"), entry.suit, tern(entry.risk, ", with a known overruff risk", "")))
			}
			if !liveOwn && outcome.CoversPartnerNil {
				effect("P02.cover-action", 1000)
				effect("P02.cover-resource-cost", -(rank + tern(suit == "S", 10.0, 0.0)))
				reason("P02.cover-action", "fact", "This legal card overtakes your live Nil partner and keeps this trick off your partner.")
			}
			if !liveOwn && livePartner && slices.Contains(f.ActorsAfter, *partner) && winsNow {
				effect("P02.cover-before-partner", 180+rank*2+tern(outcome.IsMaster, 35.0, 0.0))
				reason("P02.cover-before-partner", "heuristic", "Playing above the current lead gives your Nil partner room to duck when they play; their concealed hand is still unknown.")
			}
			if !liveOwn && livePartner && lead {
				effect("P02.covering-lead", 260+rank*5+tern(outcome.IsMaster, 45.0, 0.0)-tern(suit == "S", 45.0, 0.0))
				reason("P02.covering-lead", "heuristic", "Prefer a high covering lead for your live Nil partner, even after the positive contract is met. This does not prove their Nil is safe.")
			}
			if !liveOwn && same(f.CurrentWinner, partner) && eq(f.PartnerNil, "none") {
				if !winsNow {
					threat := (len(f.ActorsAfter) > 0 && !f.KnowledgeComplete) || any(outcome.CanBeOvertakenBy, func(s int) bool { return slices.Contains(opponents, s) })
					effect("P01.conserve-under-partner", tern(threat, 85.0, 210.0))
					reason("P01.conserve-under-partner", "heuristic", tern(threat, "Underplaying preserves your resources, but an opponent still to act may overtake your partner.", "Underplaying preserves resources behind your partner; no remaining opponent response can overtake the current winner under the known constraints."))
				} else {
					protected := eq(outcome.GuaranteedWinner, o.Seat) || (f.KnowledgeComplete && !any(outcome.CanBeOvertakenBy, func(s int) bool { return slices.Contains(opponents, s) }))
					previous := any(losing, func(a d.Action) bool {
						return any(outcomes[d.ActionID(a)].CanBeOvertakenBy, func(s int) bool { return slices.Contains(opponents, s) })
					})
					effect("P09.protect-partner", tern(positiveNeed && protected && previous, 160.0, -120.0))
					reason("P09.protect-partner", "heuristic", "Overtaking a positive-bidding partner needs a reason, such as removing a later opponent threat or gaining a useful lead.")
				}
			}
			if lead && positiveNeed && !liveOwn && eq(f.PartnerNil, "none") && suit != "S" && slices.Contains(f.Voids[suit], *partner) && canHold(f, *partner, "S") {
				effect("P06.offer-ruff", 40)
				risk := any(laterOpponents, func(s int) bool {
					return slices.Index(f.ActorsAfter, s) > slices.Index(f.ActorsAfter, *partner) && slices.Contains(f.Voids[suit], s) && canHold(f, s, "S")
				})
				if risk {
					effect("P06.overruff-risk", -35)
				}
				reason("P06.offer-ruff", "heuristic", "This leads a suit your partner is known to lack. A partner ruff is possible, with overruff risk depending on later opponents.")
			}
			if lead && suit == "S" && eq(f.PartnerNil, "none") && canHold(f, *partner, "S") && any([]string{"C", "D", "H"}, func(s string) bool { return slices.Contains(f.Voids[s], *partner) }) {
				effect("P11.preserve-ruff", -45)
				reason("P11.preserve-ruff", "heuristic", "Leading spades may remove trump your partner could use to ruff a publicly void side suit.")
			}
		}
		r.reasonIDs = append(r.reasonIDs, common...)
		ranked = append(ranked, r)
	}
	sort.SliceStable(ranked, func(i, j int) bool {
		return ranked[i].score > ranked[j].score || ranked[i].score == ranked[j].score && ranked[i].index < ranked[j].index
	})
	forced := len(o.LegalActions) == 1
	if forced {
		shared("S01.forced", "fact", "Only one legal action exists, so this move is forced rather than a strategic preference.")
		ranked[0].reasonIDs = append([]string{"S01.forced"}, ranked[0].reasonIDs...)
	}
	candidates := []d.Candidate{}
	traces := []d.TraceCandidate{}
	for i, r := range ranked {
		candidates = append(candidates, d.Candidate{Action: d.CloneAction(r.action), ReasonIDs: r.reasonIDs, Disposition: tern(i == 0, "selected", "alternative"), Evidence: tern(forced, "exact", "heuristic")})
		traces = append(traces, d.TraceCandidate{ActionID: d.ActionID(r.action), Score: d.Ptr(r.score), Effects: r.effects, TieOrder: r.index})
	}
	limitations := []string{"Conditional tactical policy, not a solved position or calibrated probability model.", "Unobserved hands remain unknown; card-choice signals are not treated as ownership proof."}
	if !f.KnowledgeComplete {
		limitations = append(limitations, "Public history or capacities are incomplete or inconsistent; concealed ownership and future-winner deductions are widened.")
	}
	if slices.Contains(scenarios, "S14") {
		limitations = append(limitations, "Late-match tradeoffs are not evaluated by full remaining-hand search.")
	}
	return d.Analysis{
		SchemaVersion: "1.0.0", PolicyVersion: PolicyVersion,
		Provenance: tern(forced, "forced", "code"), Action: d.CloneAction(ranked[0].action),
		ScenarioIDs: scenarios, Reasons: reasons, Facts: f,
		Candidates: candidates, Limitations: limitations,
		Trace: &d.Trace{
			SchemaVersion: "1.0.0", PolicyVersion: PolicyVersion,
			CatalogVersion: "spades-catalog-1.0.0", SelectedActionID: d.ActionID(ranked[0].action),
			SelectedBy:     tern(forced, "forced", "heuristic-rank"),
			ScenarioChecks: scenarioChecks(o.Mode, "play", scenarios), Candidates: traces,
			Limitations: []string{"Numeric effects are policy ordering weights, not probabilities or match-point estimates."},
		},
	}, nil
}
