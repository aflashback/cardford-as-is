// Package trix implements the four owner-selected Trix rule profiles. The
// authoritative state is deliberately separate from the actor-only DTOs.
package trix

type Action struct {
	Kind    string   `json:"kind"`
	Request string   `json:"request,omitempty"`
	Cards   []string `json:"cards,omitempty"`
	Card    string   `json:"card,omitempty"`
}
type Play struct {
	Seat int    `json:"seat"`
	Card string `json:"card"`
}

// TwoAnnouncements contains only the information public at this point in the
// opening circuit. Hidden announcements never carry the private suit mapping.
type TwoAnnouncements struct {
	Status string  `json:"status"`
	Counts *[4]int `json:"counts,omitempty"`
	Cards  []Play  `json:"cards,omitempty"`
}
type Trick struct {
	Number int    `json:"number"`
	Leader int    `json:"leader"`
	Winner int    `json:"winner"`
	Plays  []Play `json:"plays"`
}
type Declaration struct {
	Seat  int      `json:"seat"`
	Cards []string `json:"cards"`
	Ref   string   `json:"ref"`
}
type Row struct {
	Suit string `json:"suit"`
	Low  int    `json:"low"`
	High int    `json:"high"`
}
type LayoutPass struct {
	Seat  int    `json:"seat"`
	Board []Row  `json:"board"`
	Ref   string `json:"ref"`
}

// LayoutHistory records only public information available before each accepted
// layout action. It never contains another hand or that seat's legal choices.
type LayoutHistory struct {
	Version string       `json:"version"`
	Status  string       `json:"status"`
	Turns   []LayoutTurn `json:"turns"`
}

type LayoutTurn struct {
	Ordinal                int               `json:"ordinal"`
	Seat                   int               `json:"seat"`
	Kind                   string            `json:"kind"`
	Card                   string            `json:"card,omitempty"`
	BoardBefore            []Row             `json:"boardBefore"`
	HandCountsBefore       [4]int            `json:"handCountsBefore"`
	TwoAnnouncementsBefore *TwoAnnouncements `json:"twoAnnouncementsBefore"`
}
type LeadSource struct {
	Seat  int `json:"seat"`
	Trick int `json:"trick"`
}
type Recipient struct {
	Kind       string `json:"kind"`
	Seat       *int   `json:"seat,omitempty"`
	Competitor string `json:"competitor,omitempty"`
}
type LedgerEntry struct {
	DealNumber     int       `json:"dealNumber"`
	Kingdom        int       `json:"kingdom"`
	Request        string    `json:"request"`
	Trick          int       `json:"trick"`
	Finish         int       `json:"finish"`
	Recipient      Recipient `json:"recipient"`
	Component      string    `json:"component"`
	Card           string    `json:"card,omitempty"`
	Delta          int       `json:"delta"`
	DeclarationRef string    `json:"declarationRef,omitempty"`
	LeadSourceRef  string    `json:"leadSourceRef,omitempty"`
}
type WithheldBonus struct {
	DealNumber     int    `json:"dealNumber"`
	Trick          int    `json:"trick"`
	Card           string `json:"card"`
	BonusValue     int    `json:"bonusValue"`
	Reason         string `json:"reason"`
	DeclarationRef string `json:"declarationRef"`
}
type Score struct {
	ID    string `json:"id"`
	Seats []int  `json:"seats"`
	Total int    `json:"total"`
}
type Observation struct {
	publicSchemaVersion string
	ID                  string            `json:"id"`
	GameID              string            `json:"gameId"`
	VariantID           string            `json:"variantId"`
	Seat                int               `json:"seat"`
	Phase               string            `json:"phase"`
	Turn                *int              `json:"turn"`
	Kingdom             int               `json:"kingdom"`
	DealNumber          int               `json:"dealNumber"`
	Owner               int               `json:"owner"`
	Request             *string           `json:"request"`
	RemainingRequests   []string          `json:"remainingRequests"`
	Hand                []string          `json:"hand"`
	HandCounts          [4]int            `json:"handCounts"`
	Trick               []Play            `json:"trick"`
	Tricks              []Trick           `json:"tricks"`
	Declarations        []Declaration     `json:"declarations"`
	Board               []Row             `json:"board"`
	FinishOrder         []int             `json:"finishOrder"`
	Passes              []LayoutPass      `json:"passes"`
	Ledger              []LedgerEntry     `json:"ledger"`
	WithheldBonuses     []WithheldBonus   `json:"withheldBonuses"`
	LastExternalLeader  [4]*LeadSource    `json:"lastExternalLeader"`
	Totals              []Score           `json:"totals"`
	RequestTotals       []Score           `json:"requestTotals"`
	KingdomTotals       []Score           `json:"kingdomTotals"`
	Winners             []string          `json:"winners"`
	TwoAnnouncements    *TwoAnnouncements `json:"twoAnnouncements,omitempty"`
	LayoutHistory       *LayoutHistory    `json:"layoutHistory,omitempty"`
}
type Advice struct {
	GameID                 string   `json:"gameId"`
	VariantID              string   `json:"variantId"`
	DecisionID             string   `json:"decisionId"`
	Level                  int      `json:"level"`
	Origin                 string   `json:"origin"`
	Title                  string   `json:"title"`
	Text                   string   `json:"text"`
	PolicyVersion          string   `json:"policyVersion"`
	RecommendedCandidateID string   `json:"recommendedCandidateId,omitempty"`
	Alternatives           []string `json:"alternatives,omitempty"`
	EvidenceRefs           []string `json:"evidenceRefs"`
}
