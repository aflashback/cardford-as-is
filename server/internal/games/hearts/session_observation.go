package hearts

import (
	"cardford/server/internal/gamekernel"
	d "cardford/server/internal/legacydecision"
	"context"
	"fmt"
)

type sessionObservation struct {
	ModuleVersion            string         `json:"moduleVersion"`
	ObservationSchemaVersion string         `json:"observationSchemaVersion"`
	RuleProfileID            string         `json:"ruleProfileId"`
	FeatureVersion           string         `json:"featureVersion"`
	Seat                     int            `json:"seat"`
	Phase                    string         `json:"phase"`
	Hand                     []string       `json:"hand"`
	HandCounts               [4]int         `json:"handCounts"`
	Tricks                   [4]int         `json:"tricks"`
	Scores                   [4]int         `json:"scores"`
	Trick                    []Play         `json:"trick"`
	History                  []Trick        `json:"history"`
	Turn                     *int           `json:"turn"`
	Dealer                   int            `json:"dealer"`
	HandNumber               int            `json:"handNumber"`
	HeartsBroken             bool           `json:"heartsBroken"`
	Events                   []event        `json:"events"`
	HandResult               *sessionResult `json:"handResult,omitempty"`
	PassDirection            string         `json:"passDirection"`
	Pass                     pass           `json:"pass"`
	UnitID                   string         `json:"unitId"`
}

func observeSession(v *sessionState, seat int) sessionObservation {
	s := v.original
	o := sessionObservation{ModuleVersion: "2.0.0", ObservationSchemaVersion: "2.0.0", RuleProfileID: s.RuleProfileID, FeatureVersion: "1.0.0", Seat: seat, Phase: sessionPhase(v), Hand: s.Hands[seat], HandCounts: handSizes(s), Tricks: s.Tricks, Scores: s.Scores, Trick: s.Trick, History: s.History, Turn: s.Turn, Dealer: s.Dealer, HandNumber: s.HandNumber, HeartsBroken: s.HeartsBroken, Events: s.Events, PassDirection: s.PassDirection, Pass: s.Passes[seat], UnitID: fmt.Sprintf("hand:%d", s.HandNumber)}
	if s.HandResult != nil {
		o.HandResult = &sessionResult{s.HandResult.Points, s.HandResult.Winner}
	}
	return o
}
func observationActions(o sessionObservation) []action {
	probe := &state{Phase: o.Phase, Turn: o.Turn, Trick: o.Trick, History: o.History, HeartsBroken: o.HeartsBroken}
	probe.Hands[o.Seat] = sorted(o.Hand)
	return actions(probe, o.Seat)
}
func publicSessionObservation(o sessionObservation) map[string]any {
	return map[string]any{"hand": o.Hand, "handCounts": o.HandCounts, "scores": o.Scores, "turn": o.Turn, "dealer": o.Dealer, "roundNumber": o.HandNumber, "trick": o.Trick, "history": o.History, "heartsBroken": o.HeartsBroken, "passDirection": o.PassDirection, "pass": o.Pass}
}
func observationUnit(o sessionObservation) *gamekernel.AccessUnit {
	return &gamekernel.AccessUnit{ID: o.UnitID, Kind: "hand", AtAdmissionBoundary: len(o.History) == 0 && len(o.Trick) == 0 && (o.PassDirection == "hold" || o.Pass.To == nil)}
}
func legacySessionObservation(o sessionObservation) (d.Observation, error) {
	return legacySessionObservationContext(context.Background(), o)
}
func legacySessionObservationContext(ctx context.Context, o sessionObservation) (d.Observation, error) {
	if err := ctx.Err(); err != nil {
		return d.Observation{}, err
	}
	// The original policy receives a detached actor-only typed projection.
	// Analyze validates this boundary without serializing/reimporting history.
	phase := o.Phase
	if phase == "awaiting-deal" {
		phase = "hand-end"
	}
	result := d.Observation{
		Mode: "hearts", Seat: o.Seat, ModuleVersion: "1.0.0", RuleProfileID: o.RuleProfileID,
		ObservationSchemaVersion: "1.0.0", FeatureVersion: "1.0.0", Phase: phase,
		Hand: append([]string{}, o.Hand...), HandSizes: append([]int{}, o.HandCounts[:]...),
		Bids: make([]*int, 4), Tricks: append([]int{}, o.Tricks[:]...),
		Scores: append([]int{}, o.Scores[:]...), Bags: make([]int, 4),
		Trick: []d.Play{}, History: []d.Trick{}, Turn: cloneSessionPointer(o.Turn),
		Dealer: o.Dealer, HandNumber: o.HandNumber, HeartsBroken: o.HeartsBroken,
		Events: []d.Event{}, PassDirection: o.PassDirection,
		Pass:         d.PassMemory{Outgoing: append([]string{}, o.Pass.Outgoing...), Incoming: append([]string{}, o.Pass.Incoming...), To: cloneSessionPointer(o.Pass.To), From: cloneSessionPointer(o.Pass.From)},
		LegalActions: []d.Action{}, KnownHoldings: []d.Play{},
	}
	seen := map[string]bool{}
	copyPlays := func(plays []Play) []d.Play {
		out := make([]d.Play, len(plays))
		for i, play := range plays {
			out[i] = d.Play{Seat: play.Seat, Card: play.Card}
			seen[play.Card] = true
			result.SpadesBroken = result.SpadesBroken || play.Card[0] == 'S'
		}
		return out
	}
	result.Trick = copyPlays(o.Trick)
	for _, trick := range o.History {
		result.History = append(result.History, d.Trick{Plays: copyPlays(trick.Plays), Winner: trick.Winner})
	}
	for i, event := range o.Events {
		if i%256 == 0 {
			if err := ctx.Err(); err != nil {
				return d.Observation{}, err
			}
		}
		copy := d.Event{ID: event.ID, Type: event.Type, Message: event.Message, Seat: cloneSessionPointer(event.Seat)}
		if event.Card != nil {
			copy.Card = *event.Card
		}
		result.Events = append(result.Events, copy)
	}
	for _, action := range observationActions(o) {
		result.LegalActions = append(result.LegalActions, d.Action{Kind: action.Kind, Seat: action.Seat, Card: action.Card, Cards: append([]string(nil), action.Cards...)})
	}
	result.Memory = d.GetMemory(result)
	if o.Pass.To != nil {
		for _, card := range o.Pass.Outgoing {
			if !seen[card] {
				result.KnownHoldings = append(result.KnownHoldings, d.Play{Seat: *o.Pass.To, Card: card})
			}
		}
	}
	if o.HandResult != nil {
		result.HandResult = &d.HandResult{Points: append([]int{}, o.HandResult.Points[:]...), Bags: make([]int, 4), Winner: cloneSessionPointer(o.HandResult.Winner)}
	}
	return result, nil
}

func cloneSessionPointer[T any](value *T) *T {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}
