package trix

import (
	"cardford/server/internal/contracts"
	"fmt"
	"math"
	"strings"
)

func reasoningCandidate(o Observation, a Action) DecisionCandidate {
	c := DecisionCandidate{CandidateID: ActionID(a), Action: a, Support: []contracts.CoachSupport{}}
	switch a.Kind {
	case "choose-request":
		requestCandidate(o, &c)
	case "declare-doubles":
		doublesCandidate(o, &c)
	case "play-card":
		penaltyCandidate(o, &c)
	case "layout-card":
		layoutCandidate(o, &c)
	case "layout-pass":
		c.Purpose = "wait for a usable opening"
		c.Reason = "None of your remaining cards extends the current Jack rows. Passing is required, and its public constraint concerns this board only."
		c.Support = append(c.Support, support("trix-layout-no-placement", "exact", fmt.Sprintf("Your %d remaining cards have no legal placement on the current board.", len(o.Hand))))
	}
	return c
}

func requestCandidate(o Observation, c *DecisionCandidate) {
	a := c.Action
	c.Value = candidateValue(o, a)
	penalties, high, low, jacks := 0, 0, 0, 0
	for _, card := range o.Hand {
		if rank(card) >= 12 {
			high++
		}
		if rank(card) <= 8 {
			low++
		}
		if rank(card) == 11 {
			jacks++
		}
		r := a.Request
		if ((r == "diamonds" || r == "complex") && card[0] == 'D') || ((r == "queens" || r == "complex") && rank(card) == 12) || ((r == "king" || r == "complex") && card == "HK") {
			penalties++
		}
	}
	if a.Request == "trix" {
		connected := 0
		for _, card := range o.Hand {
			if rank(card) == 11 {
				for _, h := range o.Hand {
					if h[0] == card[0] && (rank(h) == 10 || rank(h) == 12) {
						connected++
					}
				}
			}
		}
		c.Value += float64(connected * 5)
		c.Purpose = "use your Jack openings"
		c.Reason = fmt.Sprintf("You hold %d jacks and %d immediately adjacent cards. The layout heuristic prefers openings that connect your own cards, because all finishes add points. Other players can also use those rows; their hidden cards and finish order are unknown.", jacks, connected)
		c.Support = append(c.Support, support("trix-request-layout-shape", "exact", fmt.Sprintf("Your hand has %d jacks and %d cards adjacent to those jacks.", jacks, connected)))
	} else {
		// Outside higher cards offer conditional losing exits; their ownership is
		// deliberately not assigned to opponents or a teammate.
		outside := 0
		for _, card := range o.Hand {
			if rank(card) >= 12 {
				outside += len(remainingHigher(o, card))
			}
		}
		c.Value += float64(low)*.15 + float64(outside)*.1
		c.Purpose = "limit exposure to this request's penalties"
		c.Reason = fmt.Sprintf("For %s, your hand has %d relevant penalty cards, %d high cards and %d low cards. The heuristic weighs those penalties against low exits and higher cards outside your hand. Those cards may help you lose tricks only if their holders and future play permit it; the request lasts this deal.", a.Request, penalties, high, low)
		c.Support = append(c.Support, support("trix-request-"+a.Request+"-shape", "exact", fmt.Sprintf("Own-hand counts for %s: %d relevant penalty cards, %d cards ranked queen or higher, %d cards ranked eight or lower.", a.Request, penalties, high, low)))
	}
	if partners(o.VariantID) {
		c.Reason += " Your objective is the combined team score; your teammate's hidden hand is not assumed."
	} else {
		c.Reason += " Your objective is your own score, with no partner assumption."
	}
}

func doublesCandidate(o Observation, c *DecisionCandidate) {
	details := []string{}
	eligible := []string{}
	for _, card := range o.Hand {
		if o.Request != nil && eligibleDouble(*o.Request, card) {
			eligible = append(eligible, card)
		}
	}
	for _, card := range eligible {
		lower, ownHigher := 0, 0
		for _, h := range o.Hand {
			if h[0] == card[0] {
				if rank(h) < rank(card) {
					lower++
				} else if rank(h) > rank(card) {
					ownHigher++
				}
			}
		}
		outside := len(remainingHigher(o, card))
		c.Support = append(c.Support, support("trix-double-cover-"+card, "exact", fmt.Sprintf("%s has %d lower same-suit cards and %d higher same-suit cards in your hand; %d higher same-suit cards remain outside it.", cardLabel(card), lower, ownHigher, outside)))
		if contains(c.Action.Cards, card) {
			v := 25.
			if card == "HK" {
				v = 75
			}
			safety := float64(lower)*.65 + float64(outside)*.9 - float64(ownHigher)*1.2 - 3.5
			if outside == 0 {
				safety -= 3
			}
			if o.Owner == o.Seat {
				safety -= .75
			}
			if partners(o.VariantID) {
				safety -= 1.5
			}
			c.Value += v * safety
			details = append(details, fmt.Sprintf("%s has %d low same-suit exits and %d higher cards outside your hand", cardLabel(card), lower, outside))
		}
	}
	if len(c.Action.Cards) == 0 {
		c.Purpose = "avoid increasing the capture penalty"
		c.Reason = "Declining doubles keeps eligible cards at their ordinary capture penalty. The heuristic requires enough low exits and outside higher cards before accepting the larger downside; a future discard to another seat is not guaranteed."
	} else {
		c.Purpose = "accept extra risk for a conditional bonus"
		c.Reason = "The selected double has conditional escape cover: " + strings.Join(details, "; ") + ". Those counts support a heuristic preference, not a guarantee that another seat will capture it."
	}
	if partners(o.VariantID) {
		c.Reason += " Either teammate's capture pays the doubled penalty for your team and awards the bonus to the opposing team."
	} else {
		c.Reason += " Another seat capturing your double awards you its bonus. Self-capture pays the doubled penalty; the current or previous external leader receives the bonus, or it is withheld when no giver exists."
	}
	c.Support = append(c.Support, support("trix-double-escape-risk", "conditional", "Lower cards may offer losing exits, and outside higher cards may help dispose of a double; neither guarantees its future capturer."))
}

func penaltyCandidate(o Observation, c *DecisionCandidate) {
	a := c.Action
	r := float64(rank(a.Card))
	cost := cardCost(o, a.Card)
	if len(o.Trick) == 0 {
		length, voidOpp := 0, 0
		for _, h := range o.Hand {
			if h[0] == a.Card[0] {
				length++
			}
		}
		voids := publicVoids(o)
		for seat := 0; seat < 4; seat++ {
			if seat != o.Seat && (!partners(o.VariantID) || seat%2 != o.Seat%2) && voids[seat][a.Card[0]] {
				voidOpp++
			}
		}
		outside := len(remainingHigher(o, a.Card))
		c.Value = -r*2 - cost*.7 + float64(length)*.3 - float64(voidOpp)*3
		if outside == 0 {
			c.Value -= cost*2 + 10
		}
		c.Purpose = "seek a low-risk lead"
		c.Reason = fmt.Sprintf("%s leads a suit of %d cards in your hand, with %d higher cards still outside it. The heuristic favors low leads that may lose control; %d publicly void opponents can discard instead. The holders of the remaining higher cards and any new penalties are unknown.", cardLabel(a.Card), length, outside, voidOpp)
		c.Support = append(c.Support, support("trix-lead-shape-"+a.Card, "exact", fmt.Sprintf("Own suit length %d; %d higher same-suit cards remain outside your hand; %d opponents have publicly shown a void in that suit.", length, outside, voidOpp)))
		return
	}
	plays := append(append([]Play{}, o.Trick...), Play{Seat: o.Seat, Card: a.Card})
	w := winner(plays)
	winnerCard := winningCard(plays)
	overtake := possibleOvertakingSeats(o, plays)
	own, enemy := prefixScore(o, plays)
	weight := 1.
	if len(overtake) > 0 {
		weight = .65
	}
	c.Value = (float64(own)*4 - float64(enemy)) * weight
	ownCapture := w == o.Seat || (partners(o.VariantID) && w%2 == o.Seat%2)
	if w == o.Seat {
		c.Value -= r
	} else {
		c.Value += r + cost*.5
	}
	if len(plays) == 4 {
		c.Value = finalTrickValue(o, a)
	}
	owner := "an opponent"
	if w == o.Seat {
		owner = "you"
	} else if partners(o.VariantID) && ownCapture {
		owner = "your teammate"
	}
	scoreOwner := "your own score"
	if partners(o.VariantID) {
		scoreOwner = "your team's score"
	}
	qualifier := "If the current winner remains"
	if len(overtake) == 0 {
		qualifier = "The public constraints fix the current winner"
	}
	if len(plays) == 4 {
		qualifier = "Your last play resolves this trick"
	}
	c.Support = append(c.Support, support("trix-prefix-winner-"+a.Card, "exact", fmt.Sprintf("After %s, seat %d is the current winner with %s.", cardLabel(a.Card), w, cardLabel(winnerCard))))
	ledgerKind := "conditional"
	if len(overtake) == 0 {
		ledgerKind = "exact"
	}
	c.Support = append(c.Support, support("trix-prefix-ledger-"+a.Card, ledgerKind, fmt.Sprintf("For the cards already in this trick including this action, capture by seat %d changes %s by %d points and opponents' scores by %d in total. Later penalty cards are excluded.", w, scoreOwner, own, enemy)))
	if len(overtake) == 0 {
		c.Support = append(c.Support, support("trix-overtaking-"+a.Card, "exact", "Remaining players cannot overtake the current winning card: no feasible higher card can be held by a player still to act."))
	} else {
		c.Support = append(c.Support, support("trix-overtaking-"+a.Card, "conditional", fmt.Sprintf("Seats %v may overtake with a remaining higher card of the led suit; its actual holder and future play are unknown.", overtake)))
	}
	if a.Card[0] != o.Trick[0].Card[0] && cost > 0 {
		if ownCapture {
			c.Purpose = "weigh future release against your team's capture cost"
			c.Reason = fmt.Sprintf("%s cannot win off suit. %s, %s captures the cards already played: %s changes by %d. Releasing this penalty card reduces future exposure in your hand, but feeding it to your own team still costs points; that future benefit does not cancel the present penalty.", cardLabel(a.Card), qualifier, owner, scoreOwner, own)
		} else {
			c.Purpose = "release a penalty toward an opponent"
			c.Reason = fmt.Sprintf("%s cannot win off suit. %s, %s captures its penalty, while %s changes by %d from the current cards. Releasing it removes a dangerous card from your future hand; a possible later overtake can change who pays.", cardLabel(a.Card), qualifier, owner, scoreOwner, own)
		}
	} else if ownCapture {
		c.Purpose = "limit the penalty carried into your capture"
		c.Reason = fmt.Sprintf("After %s, %s is the current winner with %s. %s, the current cards change %s by %d. Removing this card's future risk is weighed against that capture cost; a teammate's capture still costs your team.", cardLabel(a.Card), owner, cardLabel(winnerCard), qualifier, scoreOwner, own)
		if !partners(o.VariantID) {
			c.Reason = fmt.Sprintf("After %s, you are the current winner with %s. %s, the current cards change your own score by %d. The heuristic weighs that capture cost against removing this card's future risk.", cardLabel(a.Card), cardLabel(winnerCard), qualifier, own)
		}
	} else {
		c.Purpose = "keep the capture outside your team"
		if !partners(o.VariantID) {
			c.Purpose = "keep the capture away from you"
		}
		c.Reason = fmt.Sprintf("After %s, %s remains the current winner with %s. %s, %s changes by %d from the cards now in the trick. Compare which dangerous card would remain in your hand, and whether a later player could change who takes this trick.", cardLabel(a.Card), owner, cardLabel(winnerCard), qualifier, scoreOwner, own)
	}
	if ownCapture && partners(o.VariantID) {
		c.Reason += " Penalties taken by either teammate count against the same team."
	}
	if len(overtake) > 0 {
		c.Reason += " A later player may overtake; this capture assessment is conditional."
	} else if len(plays) < 4 {
		c.Reason += " The remaining player cannot overtake this card, but can still add a penalty."
	}
	if isDoubled(o, a.Card) && partners(o.VariantID) {
		c.Reason += " The doubled penalty also pays its bonus to the team opposite the capturer."
	}
}

func isDoubled(o Observation, card string) bool {
	for _, d := range o.Declarations {
		if contains(d.Cards, card) {
			return true
		}
	}
	return false
}

func layoutCandidate(o Observation, c *DecisionCandidate) {
	layoutCandidateWithHolders(o, c, possibleHolders, false)
}

func layoutCandidateWithHolders(o Observation, c *DecisionCandidate, holdersFor func(Observation, string) []int, ownership bool) {
	a := c.Action
	c.Value = candidateValue(o, a)
	newBoard := append([]Row{}, o.Board...)
	for i, r := range newBoard {
		if r.Suit == a.Card[:1] {
			if r.Low == 0 {
				newBoard[i].Low = rank(a.Card)
				newBoard[i].High = rank(a.Card)
			} else {
				newBoard[i].Low = int(math.Min(float64(r.Low), float64(rank(a.Card))))
				newBoard[i].High = int(math.Max(float64(r.High), float64(rank(a.Card))))
			}
		}
	}
	ownNext := []string{}
	teamNext := []string{}
	opponentNext := []string{}
	for _, card := range Deck() {
		if !placeable(newBoard, card) || placeable(o.Board, card) || card == a.Card {
			continue
		}
		holders := holdersFor(o, card)
		if contains(o.Hand, card) {
			ownNext = append(ownNext, card)
		}
		if len(holders) == 1 && holders[0] != o.Seat {
			seat := holders[0]
			isTeam := partners(o.VariantID) && seat%2 == o.Seat%2
			amount := 8.
			if o.HandCounts[seat] == 1 {
				amount = 45
			}
			if isTeam {
				c.Value += amount
				teamNext = append(teamNext, card)
			} else {
				c.Value -= amount
				opponentNext = append(opponentNext, card)
			}
			c.Support = append(c.Support, support("trix-layout-unlock-"+a.Card+"-"+card, "exact", fmt.Sprintf("Placing %s makes %s available to seat %d, its only observation-compatible holder; that seat has %d cards left.", cardLabel(a.Card), cardLabel(card), seat, o.HandCounts[seat])))
		}
	}
	c.Support = append(c.Support, support("trix-layout-own-connections-"+a.Card, "exact", fmt.Sprintf("This placement immediately opens %d cards in your own hand: %s.", len(ownNext), strings.Join(ownNext, ", "))))
	c.Purpose = "open a path through your remaining hand"
	c.Reason = fmt.Sprintf("Placing %s immediately opens %d of your own remaining cards. The heuristic prefers connected paths so you can finish earlier; future turns and hidden openings are not known.", cardLabel(a.Card), len(ownNext))
	if len(o.Hand) == 1 {
		c.Purpose = "finish your hand now"
		c.Reason = fmt.Sprintf("%s is your last card, so this placement finishes your hand in position %d for %d points.", cardLabel(a.Card), len(o.FinishOrder)+1, 200-50*len(o.FinishOrder))
		c.Support = append(c.Support, support("trix-layout-finish-now", "exact", fmt.Sprintf("Your last card is legal; the next finish is position %d and awards %d points.", len(o.FinishOrder)+1, 200-50*len(o.FinishOrder))))
	}
	if len(teamNext) > 0 {
		c.Purpose = "open a card for your teammate's finish"
		c.Reason += fmt.Sprintf(" Public ownership or forced-pass constraints show the newly opened %s belongs to your teammate, who has %d cards left. Enabling that card can help the team's finish order; it does not force the next player to choose it.", strings.Join(teamNext, ", "), o.HandCounts[(o.Seat+2)%4])
	}
	if len(opponentNext) > 0 {
		c.Reason += " This also opens an opponent's publicly constrained card (" + strings.Join(opponentNext, ", ") + "); the heuristic accounts for that finishing risk."
	}
	if partners(o.VariantID) {
		c.Reason += " Both teammates' finishing points count toward the team objective."
	}
	if o.TwoAnnouncements != nil && o.TwoAnnouncements.Status == "hidden" {
		if ownership {
			c.Reason += " Hidden announcements give original counts; a suit owner is used only when every supported joint assignment identifies that holder."
		} else {
			c.Reason += " Hidden two announcements give counts only, so no suit-specific assistance is assumed."
		}
	}
}
