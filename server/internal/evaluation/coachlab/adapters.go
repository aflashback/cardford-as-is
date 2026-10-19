package coachlab

import (
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/hearts"
	"cardford/server/internal/games/spades"
	"cardford/server/internal/games/trix"
	d "cardford/server/internal/legacydecision"
	"cardford/server/internal/sessions"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"fmt"
)

type LabVariantAdapter struct{ Selector sessions.Selector }

func trixInstallation(selector sessions.Selector) (sessions.Registration, error) {
	for _, installed := range trix.Installations() {
		pin := installed.Pin
		if selector == (sessions.Selector{GameID: pin.GameID, VariantID: pin.VariantID, ModuleVersion: pin.ModuleVersion, RuleProfileID: pin.RuleProfileID}) {
			return installed, nil
		}
	}
	return sessions.Registration{}, fmt.Errorf("uninstalled Trix module/profile")
}

func NewAdapter(s sessions.Selector) (LabVariantAdapter, error) {
	a := LabVariantAdapter{s}
	var p gamekernel.Pin
	if s.GameID == "hearts" && s.VariantID == "solo" {
		p = hearts.SessionPin()
	} else if s.GameID == "spades" {
		var err error
		p, err = spades.SessionPin(s.VariantID)
		if err != nil {
			return a, err
		}
	} else if s.GameID == "trix" && contains(trix.Variants, s.VariantID) {
		installed, err := trixInstallation(s)
		if err != nil {
			return a, err
		}
		p = installed.Pin
	} else {
		return a, fmt.Errorf("lab variant adapter not installed")
	}
	if p.ModuleVersion != s.ModuleVersion || p.RuleProfileID != s.RuleProfileID {
		return a, fmt.Errorf("uninstalled module/profile")
	}
	return a, nil
}
func (a LabVariantAdapter) Start(config, material json.RawMessage) (gamekernel.BoundSession, error) {
	if a.Selector.GameID == "hearts" {
		return hearts.StartSession(config, material)
	}
	if a.Selector.GameID == "trix" {
		r, err := trixInstallation(a.Selector)
		if err != nil {
			return nil, err
		}
		return r.Start(config, material)
	}
	return spades.StartSession(a.Selector.VariantID, config, material)
}
func (a LabVariantAdapter) Open(raw json.RawMessage) (gamekernel.BoundSession, error) {
	if a.Selector.GameID == "hearts" {
		return hearts.OpenSession(raw)
	}
	if a.Selector.GameID == "trix" {
		r, err := trixInstallation(a.Selector)
		if err != nil {
			return nil, err
		}
		return r.Open(raw)
	}
	return spades.OpenSession(a.Selector.VariantID, raw)
}
func (a LabVariantAdapter) Material(seed string, round, rotation int) json.RawMessage {
	raw := DealMaterial(seed, round)
	if a.Selector.GameID != "trix" {
		return raw
	}
	var value struct {
		Deck []string `json:"deck"`
	}
	_ = json.Unmarshal(raw, &value)
	deck := make([]string, 52)
	for seat := 0; seat < 4; seat++ {
		copy(deck[((seat+rotation)%4)*13:], value.Deck[seat*13:(seat+1)*13])
	}
	out, _ := json.Marshal(trix.Chance{Deck: deck})
	return out
}

// DealMaterial is a private reproducible stream independent of policy work.
// Counter-mode SHA256 rejection draws avoid modulo-biased Fisher-Yates indices.
func DealMaterial(seed string, round int) json.RawMessage {
	deck := d.FullDeck()
	counter := uint64(0)
	for i := len(deck) - 1; i > 0; i-- {
		n := uint64(i + 1)
		limit := ^uint64(0) - (^uint64(0) % n)
		var x uint64
		for {
			h := sha256.Sum256([]byte(fmt.Sprintf("coachlab-deal-v1\x00%s\x00%d\x00%d", seed, round, counter)))
			counter++
			x = binary.BigEndian.Uint64(h[:8])
			if x < limit {
				break
			}
		}
		j := int(x % n)
		deck[i], deck[j] = deck[j], deck[i]
	}
	raw, _ := json.Marshal(struct {
		Kind string   `json:"kind"`
		Deck []string `json:"deck"`
	}{"deal", deck})
	return raw
}

type TerminalOutcome struct {
	Scores      []int    `json:"scores"`
	Winner      *int     `json:"winner"`
	WinnerSeats []int    `json:"winnerSeats"`
	WinnerIDs   []string `json:"winnerIds"`
	Rounds      int      `json:"rounds"`
}

func (a LabVariantAdapter) ReadTerminalOutcome(b gamekernel.BoundSession) (TerminalOutcome, error) {
	n, err := b.Node()
	if err != nil {
		return TerminalOutcome{}, err
	}
	if n.Kind != "session-complete" {
		return TerminalOutcome{}, fmt.Errorf("not terminal")
	}
	if a.Selector.GameID == "trix" {
		view, err := b.View(0)
		if err != nil {
			return TerminalOutcome{}, err
		}
		var p struct {
			Table trix.Observation `json:"table"`
		}
		if err = json.Unmarshal(view, &p); err != nil {
			return TerminalOutcome{}, err
		}
		if len(p.Table.Winners) == 0 {
			return TerminalOutcome{}, fmt.Errorf("Trix module omitted terminal winners")
		}
		out := TerminalOutcome{Scores: []int{}, WinnerSeats: []int{}, WinnerIDs: append([]string{}, p.Table.Winners...), Rounds: p.Table.DealNumber}
		for _, score := range p.Table.Totals {
			out.Scores = append(out.Scores, score.Total)
			if contains(out.WinnerIDs, score.ID) {
				out.WinnerSeats = append(out.WinnerSeats, score.Seats...)
			}
		}
		return out, nil
	}
	raw, err := b.LegacyObservation(0)
	if err != nil {
		return TerminalOutcome{}, err
	}
	var o d.Observation
	if err = json.Unmarshal(raw, &o); err != nil {
		return TerminalOutcome{}, err
	}
	if o.HandResult == nil || o.HandResult.Winner == nil {
		return TerminalOutcome{}, fmt.Errorf("module omitted terminal winner")
	}
	w := *o.HandResult.Winner
	seats := []int{w}
	if a.Selector.GameID == "spades" && a.Selector.VariantID == "partners" {
		seats = []int{w, w + 2}
	}
	return TerminalOutcome{Scores: append([]int{}, o.Scores...), Winner: o.HandResult.Winner, WinnerSeats: seats, WinnerIDs: []string{fmt.Sprintf("competitor-%d", w)}, Rounds: o.HandNumber}, nil
}
