// Package trixcollection is the offline TSC-01/03/06/09/11/12 request adapter.
// It never prepares deterministic advice or registers a production policy.
package trixcollection

import (
	"encoding/json"
	"fmt"
	"strings"

	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/trix"
	"cardford/server/internal/sessions"
)

const SchemaVersion = "trix-collection-native-1.0.0"

type StartInput struct {
	Variant string   `json:"variant"`
	Request string   `json:"request"`
	ID      string   `json:"id"`
	Deck    []string `json:"deck"`
}
type SnapshotInput struct {
	Pin      gamekernel.Pin  `json:"pin"`
	Snapshot json.RawMessage `json:"snapshot"`
}
type CommitInput struct {
	Pin              gamekernel.Pin  `json:"pin"`
	Snapshot         json.RawMessage `json:"snapshot"`
	ExpectedRevision int             `json:"expectedRevision"`
	Actor            int             `json:"actor"`
	CandidateID      string          `json:"candidateId"`
}
type Choice struct {
	Actor       int    `json:"actor"`
	CandidateID string `json:"candidateId"`
}
type Frame struct {
	SchemaVersion     string          `json:"schemaVersion"`
	Pin               gamekernel.Pin  `json:"pin"`
	Revision          int             `json:"revision"`
	Node              gamekernel.Node `json:"node"`
	Snapshot          json.RawMessage `json:"snapshot"`
	NativeActorPacket json.RawMessage `json:"nativeActorPacket"`
	Rules             Rules           `json:"rules"`
	Outcome           *Outcome        `json:"outcome"`
	ScheduledRequest  *Choice         `json:"scheduledRequest"`
}
type Outcome struct {
	Status              string                    `json:"status"`
	CompletedTricks     int                       `json:"completedTricks"`
	AcceptedPlays       int                       `json:"acceptedPlays"`
	NativeTerminalPhase string                    `json:"nativeTerminalPhase"`
	ScoreTotals         []trix.Score              `json:"scoreTotals"`
	ComponentTotals     map[string]map[string]int `json:"componentTotals"`
	Ledger              []trix.LedgerEntry        `json:"ledger"`
	WithheldBonuses     []trix.WithheldBonus      `json:"withheldBonuses"`
	Tricks              []trix.Trick              `json:"tricks"`
}

func registration(pin gamekernel.Pin) (sessions.Registration, error) {
	for _, r := range trix.Installations() {
		if !r.Historical && r.Pin == pin {
			return r, nil
		}
	}
	return sessions.Registration{}, fmt.Errorf("unsupported current Trix pin")
}
func validateRequest(pin gamekernel.Pin, request string) error {
	if _, err := registration(pin); err != nil {
		return err
	}
	allowed := []string{"diamonds", "king", "queens", "lutoosh"}
	if strings.HasPrefix(pin.VariantID, "complex-") {
		allowed = []string{"complex"}
	}
	for _, r := range allowed {
		if r == request {
			return nil
		}
	}
	return fmt.Errorf("request is outside collection scope for %s", pin.VariantID)
}

func StartRequest(variant, request, id string, deck []string) (gamekernel.BoundSession, error) {
	pin := trix.Pin(variant)
	if err := validateRequest(pin, request); err != nil {
		return nil, err
	}
	if !gamekernel.ValidIdentifier(id) {
		return nil, fmt.Errorf("invalid episode ID")
	}
	r, _ := registration(pin)
	config, err := json.Marshal(trix.Config{ID: id, Variant: variant})
	if err != nil {
		return nil, err
	}
	material, err := json.Marshal(trix.Chance{Deck: deck})
	if err != nil {
		return nil, err
	}
	b, err := r.Start(config, material)
	if err != nil {
		return nil, err
	}
	n, err := b.Node()
	if err != nil {
		return nil, err
	}
	if n.Kind != "actor" || n.Phase != "choose-request" || n.Seat == nil {
		return nil, fmt.Errorf("invalid native request admission")
	}
	next, err := b.Commit(*n.Seat, "choose:"+request)
	if err != nil {
		return nil, err
	}
	return next.Next, nil
}

// requestScope reads only document metadata/commands, never projects a private
// state to a player. Native Open remains responsible for full replay validation.
func requestScope(b gamekernel.BoundSession) (string, error) {
	if b == nil {
		return "", fmt.Errorf("missing native session")
	}
	if _, err := registration(b.Pin()); err != nil {
		return "", err
	}
	raw, err := b.SerializePrivate()
	if err != nil {
		return "", err
	}
	var d struct {
		Config trix.Config       `json:"config"`
		Events []json.RawMessage `json:"events"`
	}
	if err = json.Unmarshal(raw, &d); err != nil {
		return "", err
	}
	if d.Config.FixtureID != "" || len(d.Config.FixtureDeals) != 0 || len(d.Events) < 2 || len(d.Events) > 58 || len(d.Events) != b.EventCount() {
		return "", fmt.Errorf("not an isolated native request history")
	}
	request := ""
	for i, raw := range d.Events {
		var c struct {
			Kind   string       `json:"kind"`
			Action *trix.Action `json:"action"`
		}
		if err = json.Unmarshal(raw, &c); err != nil {
			return "", err
		}
		if i == 0 {
			if c.Kind != "start" {
				return "", fmt.Errorf("missing initial deal")
			}
			continue
		}
		if c.Kind != "actor" || c.Action == nil {
			return "", fmt.Errorf("request history advanced outside collection scope")
		}
		if i == 1 {
			if c.Action.Kind != "choose-request" {
				return "", fmt.Errorf("missing scheduled request")
			}
			request = c.Action.Request
		} else if c.Action.Kind != "declare-doubles" && c.Action.Kind != "play-card" {
			return "", fmt.Errorf("mixed or layout request history")
		}
	}
	if err = validateRequest(b.Pin(), request); err != nil {
		return "", err
	}
	n, err := b.Node()
	if err != nil {
		return "", err
	}
	if n.Phase != "declare-doubles" && n.Phase != "playing" && n.Phase != "round-complete" {
		return "", fmt.Errorf("outside request boundary")
	}
	return request, nil
}

func OpenRequest(pin gamekernel.Pin, snapshot json.RawMessage) (gamekernel.BoundSession, error) {
	r, err := registration(pin)
	if err != nil {
		return nil, err
	}
	b, err := r.Open(snapshot)
	if err != nil {
		return nil, err
	}
	if b.Pin() != pin {
		return nil, fmt.Errorf("snapshot pin mismatch")
	}
	if _, err = requestScope(b); err != nil {
		return nil, err
	}
	return b, nil
}

func CommitRequest(b gamekernel.BoundSession, expectedRevision, actor int, candidateID string) (gamekernel.BoundSession, error) {
	if _, err := requestScope(b); err != nil {
		return nil, err
	}
	if expectedRevision != b.EventCount() {
		return nil, fmt.Errorf("stale native revision")
	}
	n, err := b.Node()
	if err != nil {
		return nil, err
	}
	if n.Kind != "actor" || n.Seat == nil || *n.Seat != actor {
		return nil, fmt.Errorf("wrong actor or terminal request")
	}
	if n.Phase == "playing" && !strings.HasPrefix(candidateID, "play:") || n.Phase == "declare-doubles" && !strings.HasPrefix(candidateID, "doubles:") {
		return nil, fmt.Errorf("candidate outside current request phase")
	}
	transition, err := b.Commit(actor, candidateID)
	if err != nil {
		return nil, err
	}
	return transition.Next, nil
}

func SnapshotFrame(b gamekernel.BoundSession, scheduled *Choice) (Frame, error) {
	f := Frame{SchemaVersion: SchemaVersion, ScheduledRequest: scheduled}
	request, err := requestScope(b)
	if err != nil {
		return f, err
	}
	f.Pin, f.Revision = b.Pin(), b.EventCount()
	if f.Node, err = b.Node(); err != nil {
		return f, err
	}
	if f.Snapshot, err = b.SerializePrivate(); err != nil {
		return f, err
	}
	if f.Rules, err = RulesDescriptor(b.Pin(), request); err != nil {
		return f, err
	}
	if f.Node.Kind == "round-complete" {
		outcome, err := FinishRequest(b)
		if err != nil {
			return f, err
		}
		f.Outcome = &outcome
	} else if f.NativeActorPacket, err = CurrentPacket(b); err != nil {
		return f, err
	}
	return f, nil
}

func publicObservation(b gamekernel.BoundSession) (trix.Observation, error) {
	var view struct {
		Table trix.Observation `json:"table"`
	}
	raw, err := b.View(0)
	if err != nil {
		return view.Table, err
	}
	err = json.Unmarshal(raw, &view)
	return view.Table, err
}

func FinishRequest(b gamekernel.BoundSession) (Outcome, error) {
	var out Outcome
	request, err := requestScope(b)
	if err != nil {
		return out, err
	}
	n, err := b.Node()
	if err != nil {
		return out, err
	}
	if n.Kind != "round-complete" || n.Phase != "round-complete" {
		return out, fmt.Errorf("request is incomplete")
	}
	o, err := publicObservation(b)
	if err != nil {
		return out, err
	}
	if o.Request == nil || *o.Request != request || o.DealNumber != 1 || o.Kingdom != 1 || len(o.Tricks) != 13 || len(o.Trick) != 0 || o.HandCounts != [4]int{} {
		return out, fmt.Errorf("invalid isolated request completion")
	}
	plays := 0
	for _, trick := range o.Tricks {
		plays += len(trick.Plays)
	}
	if plays != 52 {
		return out, fmt.Errorf("request did not accept all 52 plays")
	}
	out = Outcome{Status: "completed", CompletedTricks: 13, AcceptedPlays: plays, NativeTerminalPhase: n.Phase, ScoreTotals: o.RequestTotals,
		ComponentTotals: map[string]map[string]int{}, Ledger: o.Ledger, WithheldBonuses: o.WithheldBonuses, Tricks: o.Tricks}
	for _, total := range out.ScoreTotals {
		components := map[string]int{"diamond": 0, "trick": 0, "queen": 0, "king": 0, "double-bonus": 0}
		for _, entry := range out.Ledger {
			matches := entry.Recipient.Kind == "competitor" && entry.Recipient.Competitor == total.ID
			if entry.Recipient.Kind == "seat" && entry.Recipient.Seat != nil {
				for _, seat := range total.Seats {
					if seat == *entry.Recipient.Seat {
						matches = true
					}
				}
			}
			if matches {
				components[entry.Component] += entry.Delta
			}
		}
		sum := 0
		for _, value := range components {
			sum += value
		}
		if sum != total.Total {
			return Outcome{}, fmt.Errorf("native component ledger disagrees with totals")
		}
		out.ComponentTotals[total.ID] = components
	}
	return out, nil
}
