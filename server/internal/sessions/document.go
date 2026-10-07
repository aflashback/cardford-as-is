package sessions

import (
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"encoding/json"
	"fmt"
	"regexp"
)

type controller struct {
	Seat int    `json:"seat"`
	Kind string `json:"kind"`
}
type journalEntry struct {
	Revision  int             `json:"revision"`
	CommandID string          `json:"commandId"`
	Operation json.RawMessage `json:"operation"`
}
type journal struct {
	Version  string         `json:"version"`
	Revision int            `json:"revision"`
	Entries  []journalEntry `json:"entries"`
}
type analysisAudit struct {
	ID                       string          `json:"id"`
	PolicyID                 string          `json:"policyId"`
	InputDigest              string          `json:"inputDigest"`
	ObservationSchemaVersion string          `json:"observationSchemaVersion"`
	Analysis                 json.RawMessage `json:"analysis"`
}
type audits struct {
	Version string          `json:"version"`
	Entries []analysisAudit `json:"entries"`
}
type document struct {
	DocumentVersion string          `json:"documentVersion"`
	Pin             gamekernel.Pin  `json:"pin"`
	Competition     Competition     `json:"competition"`
	Controllers     []controller    `json:"controllers"`
	Payload         json.RawMessage `json:"payload"`
	Journal         journal         `json:"journal"`
	Audits          audits          `json:"audits"`
}

var digestPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

func parseDocument(raw json.RawMessage) (document, error) {
	var d document
	if err := strictDecode(raw, &d); err != nil {
		return d, err
	}
	if d.DocumentVersion != "2.0.0" || d.Journal.Version != "2.0.0" || d.Audits.Version != "2.0.0" {
		return d, fmt.Errorf("unsupported document version; original V1 needs its original reader")
	}
	if _, err := contracts.ParseJSON(d.Payload); err != nil {
		return d, err
	}
	groupSize := 1
	if d.Competition.Mode == "partnership" {
		groupSize = 2
	} else if d.Competition.Mode != "individual" {
		return d, fmt.Errorf("invalid competition mode")
	}
	seats := map[int]bool{}
	ids := map[string]bool{}
	for _, c := range d.Competition.Competitors {
		if !gamekernel.ValidIdentifier(c.ID) || ids[c.ID] || len(c.Seats) != groupSize {
			return d, fmt.Errorf("invalid competition")
		}
		ids[c.ID] = true
		for _, seat := range c.Seats {
			if !gamekernel.ValidSeat(seat) || seats[seat] {
				return d, fmt.Errorf("invalid competition seats")
			}
			seats[seat] = true
		}
	}
	if len(seats) != 4 {
		return d, fmt.Errorf("competition must cover all four seats")
	}
	seats = map[int]bool{}
	for _, c := range d.Controllers {
		expected := "computer"
		if c.Seat == 0 {
			expected = "human"
		}
		if !gamekernel.ValidSeat(c.Seat) || seats[c.Seat] || c.Kind != expected {
			return d, fmt.Errorf("only South-human practice is installed")
		}
		seats[c.Seat] = true
	}
	if len(d.Controllers) != 4 || len(seats) != 4 {
		return d, fmt.Errorf("invalid controllers")
	}
	if d.Journal.Entries == nil || d.Journal.Revision != len(d.Journal.Entries) {
		return d, fmt.Errorf("invalid journal revisions")
	}
	commands := map[string]bool{}
	for i, e := range d.Journal.Entries {
		if e.Revision != i+1 || !gamekernel.ValidIdentifier(e.CommandID) || commands[e.CommandID] {
			return d, fmt.Errorf("invalid journal identity")
		}
		commands[e.CommandID] = true
		if err := validateOperation(e.Operation); err != nil {
			return d, err
		}
	}
	if d.Audits.Entries == nil {
		return d, fmt.Errorf("invalid audit entries")
	}
	auditIDs := map[string]bool{}
	for _, a := range d.Audits.Entries {
		if !gamekernel.ValidIdentifier(a.ID) || auditIDs[a.ID] || !gamekernel.ValidIdentifier(a.PolicyID) || !digestPattern.MatchString(a.InputDigest) || a.ObservationSchemaVersion != d.Pin.ObservationSchemaVersion {
			return d, fmt.Errorf("invalid audit identity or pin")
		}
		auditIDs[a.ID] = true
		if _, err := gamekernel.ParseRegisteredAnalysis(a.Analysis, d.Pin, ""); err != nil {
			return d, err
		}
	}
	return d, nil
}
func validateOperation(raw json.RawMessage) error {
	_, err := decodeOperation(raw)
	return err
}

// The M02 facade preserves original journal/audit metadata. Durable append and
// command revisions belong to orchestration and are not silently performed here.
type documentSession struct {
	gamekernel.BoundSession
	document document
}

func (s *documentSession) SerializePrivate() (json.RawMessage, error) {
	payload, err := s.BoundSession.SerializePrivate()
	if err != nil {
		return nil, err
	}
	d := s.document
	d.Payload = payload
	return json.Marshal(d)
}
func (s *documentSession) wrap(t gamekernel.BoundTransition, err error) (gamekernel.BoundTransition, error) {
	if err != nil {
		return gamekernel.BoundTransition{}, err
	}
	t.Next = &documentSession{BoundSession: t.Next, document: s.document}
	return t, nil
}
func (s *documentSession) Commit(seat int, id string) (gamekernel.BoundTransition, error) {
	return s.wrap(s.BoundSession.Commit(seat, id))
}
func (s *documentSession) CommitSealed(id string, choices []gamekernel.SeatChoice) (gamekernel.BoundTransition, error) {
	return s.wrap(s.BoundSession.CommitSealed(id, choices))
}
func (s *documentSession) Advance(id string) (gamekernel.BoundTransition, error) {
	return s.wrap(s.BoundSession.Advance(id))
}
func (s *documentSession) SupplyChance(id string, material json.RawMessage) (gamekernel.BoundTransition, error) {
	return s.wrap(s.BoundSession.SupplyChance(id, material))
}
func (s *documentSession) ContinueRound() (gamekernel.BoundTransition, error) {
	return s.wrap(s.BoundSession.ContinueRound())
}
