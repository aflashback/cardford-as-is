package coaching

import (
	"fmt"
	"slices"
	"strings"
	"unicode/utf16"

	d "cardford/server/internal/legacydecision"
)

// reasonText retains the original preference order and JavaScript UTF-16 copy
// budget. The private analysis still carries every reason.
func reasonText(analysis d.Analysis, preferred []string) string {
	available := []string{}
	for _, c := range analysis.Candidates {
		if c.Disposition == "selected" {
			available = c.ReasonIDs
			break
		}
	}
	ids := append(append([]string{}, preferred...), available...)
	seen := map[string]bool{}
	statements := []string{}
	for _, id := range ids {
		if seen[id] {
			continue
		}
		seen[id] = true
		if !slices.Contains(available, id) {
			continue
		}
		var reason *d.Reason
		for i := range analysis.Reasons {
			if analysis.Reasons[i].ID == id {
				reason = &analysis.Reasons[i]
				break
			}
		}
		if reason == nil {
			continue
		}
		candidate := append(append([]string{}, statements...), reason.Text)
		if len(utf16.Encode([]rune(strings.Join(candidate, " ")))) > 1700 {
			continue
		}
		statements = append(statements, reason.Text)
		if len(statements) == 2 {
			break
		}
	}
	return strings.Join(statements, " ")
}

// Render preserves the original spades-tactics-2.1.0 cue order and text. Optional
// policies cannot silently borrow the live policy's coach.
func Render(obs d.Observation, analysis d.Analysis) (d.Advice, error) {
	if analysis.PolicyVersion != "spades-tactics-2.1.0" {
		return d.Advice{}, fmt.Errorf("Unsupported coaching policy: %s", analysis.PolicyVersion)
	}
	advice := d.Advice{Provenance: analysis.Provenance, PolicyVersion: analysis.PolicyVersion, ReasonIDs: []string{}, Evidence: "heuristic"}
	for _, c := range analysis.Candidates {
		if c.Disposition == "selected" {
			advice.ReasonIDs = append([]string{}, c.ReasonIDs...)
			advice.Evidence = c.Evidence
			break
		}
	}
	action := analysis.Action
	if action.Kind == "pass" {
		return d.Advice{}, fmt.Errorf("Spades has no pass.")
	}
	if action.Kind == "bid" {
		advice.Focus = "Your own contract"
		if obs.Mode == "spades-partners" {
			advice.Focus = "Your team contract"
		}
		advice.Notice = "Count likely tricks before bidding."
		advice.Reason = reasonText(analysis, nil)
		advice.Suggestion = fmt.Sprintf("Consider %d. It is a starting estimate, not a guarantee.", action.Bid)
		advice.Bid = d.Ptr(action.Bid)
		return advice, nil
	}
	card := action.Card
	advice.Card = card
	if len(obs.Trick) > 0 {
		advice.HighlightSuit = d.CardSuit(obs.Trick[0].Card)
	}
	facts := analysis.Facts
	var outcome *d.CardOutcome
	for i := range facts.CardOutcomes {
		if facts.CardOutcomes[i].ActionID == d.ActionID(action) {
			outcome = &facts.CardOutcomes[i]
			break
		}
	}
	winsNow := outcome != nil && outcome.CurrentWinner == obs.Seat
	has := func(id string) bool { return slices.Contains(advice.ReasonIDs, id) }
	reason := func(ids ...string) string { return reasonText(analysis, ids) }
	lead := len(obs.Trick) == 0
	label := d.CardLabel(card)
	cue := func(focus, notice, explanation, suggestion string) (d.Advice, error) {
		advice.Focus = focus
		advice.Notice = notice
		advice.Reason = explanation
		advice.Suggestion = suggestion
		return advice, nil
	}
	if has("P04.keep-both-live") {
		return cue("Keep both Nils live", "An opponent is guaranteed this trick.", reason("P04.keep-both-live", "P04.double-nil"), "Consider "+label+"; later tricks can still break either Nil.")
	}
	if outcome != nil && outcome.CoversPartnerNil {
		notice := "Your Nil partner is currently ahead."
		explanation := reason("P02.live-nil-cover", "S04.turn-order")
		if facts.OwnNil == "live" {
			notice = "Both Nil commitments are still live."
			explanation = reason("P04.cover-tradeoff", "P04.double-nil")
		}
		return cue("Cover your partner’s Nil", notice, explanation, "Consider "+label+" to take the trick off your partner.")
	}
	if has("P02.covering-lead") || has("P02.cover-before-partner") {
		id := "P02.cover-before-partner"
		if has("P02.covering-lead") {
			id = "P02.covering-lead"
		}
		return cue("Give your Nil partner cover", "Your partner’s Nil is still live.", reason(id, "S04.turn-order"), "Consider "+label+" to give your partner room to duck.")
	}
	if has("P03.no-cover") {
		return cue("No legal Nil cover", "Your Nil partner is currently ahead.", reason("P03.no-cover", "S04.turn-order"), "No covering play is available; consider "+label+".")
	}
	if facts.OwnNil == "live" {
		canUnderplay := false
		for _, entry := range facts.CardOutcomes {
			if entry.CurrentWinner != obs.Seat {
				canUnderplay = true
				break
			}
		}
		notice, id2 := "You bid Nil: take no tricks.", "S04.turn-order"
		if d.Value(facts.PartnerNil) == "live" {
			notice = "Both Nil commitments are still live."
			id2 = "P04.double-nil"
		}
		id1 := "S06.no-underplay"
		if !lead && !winsNow {
			id1 = "S05.shed-risk"
		}
		suggestion := "Consider " + label + "; no legal card stays below the current winner."
		if lead {
			suggestion = "Consider " + label + " as a low lead."
		} else if !winsNow {
			suggestion = "Consider " + label + " to stay below the current winner."
		} else if canUnderplay {
			suggestion = "Consider " + label + " only with its Nil tradeoff in mind."
		}
		return cue("Protect your Nil", notice, reason(id1, id2), suggestion)
	}
	if facts.OwnNil == "failed" {
		return cue("Avoid more bags", "Your Nil has already broken.", reason("S07.failed-nil", "S09.limit-bags"), "Consider "+label+" while limiting further bags.")
	}
	if facts.Partner != nil && facts.CurrentWinner != nil && *facts.CurrentWinner == *facts.Partner && d.Value(facts.PartnerNil) == "none" {
		focus, id, suggestion := "Partner is currently ahead", "P01.conserve-under-partner", "Consider "+label+" to leave partner ahead for now."
		if winsNow {
			focus = "Consider taking the lead"
			id = "P09.protect-partner"
			suggestion = "Consider " + label + " if taking the lead serves the team."
		}
		return cue(focus, "Your partner has the winning card so far.", reason(id, "S04.turn-order"), suggestion)
	}
	if has("P06.offer-ruff") {
		return cue("Offer partner a possible ruff", "Your partner has shown a void in this suit.", reason("P06.offer-ruff", "P06.partner-void"), "Consider leading "+label+"; a partner ruff is a possibility.")
	}
	if has("P11.route-to-ruff") {
		return cue("Plan the next lead", "You may gain the lead while your partner is publicly void in a side suit.", reason("P11.route-to-ruff", "S04.turn-order"), "Consider "+label+" to keep a possible partner-ruff route.")
	}
	if has("S12.leave-nil-winning") {
		return cue("Pressure the opposing Nil", "An opposing Nil is currently winning.", reason("S12.leave-nil-winning", "S04.turn-order"), "Consider "+label+" to leave that player ahead.")
	}
	if d.Value(facts.ContractNeeded) > 0 {
		need := *facts.ContractNeeded
		tactic := "S08.preserve-control"
		if lead {
			tactic = "S10.develop-suit"
			if has("S10.cash-control") {
				tactic = "S10.cash-control"
			}
		} else if winsNow {
			tactic = "S08.economical-winner"
		}
		focus := "Your team contract"
		if facts.Partner == nil {
			focus = "Your own contract"
		}
		plural := "tricks are"
		if need == 1 {
			plural = "trick is"
		}
		suggestion := "Consider " + label + " while preserving useful control."
		if winsNow && !lead {
			suggestion = "Consider " + label + " for the current lead."
		}
		return cue(focus, fmt.Sprintf("%d credited %s still needed.", need, plural), reason(tactic, "S04.turn-order"), suggestion)
	}
	id := "S09.limit-bags"
	if lead {
		id = "S09.low-lead"
	}
	return cue("Manage the bags", "The positive contract is met.", reason("S09.contract-met", id), "Consider "+label+" while weighing extra-trick risk.")
}
