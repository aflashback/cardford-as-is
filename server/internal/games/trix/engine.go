package trix

import (
	"fmt"
	"reflect"
	"sort"
	"strconv"
	"strings"
)

const PolicyID = "trix-deterministic-1.0.0"

var Variants = []string{"basic-solo", "basic-partners", "complex-solo", "complex-partners"}

type Config struct {
	ID                   string `json:"id"`
	Variant              string `json:"variant"`
	ProfileVersion       string `json:"profileVersion,omitempty"`
	LayoutHistoryVersion string `json:"layoutHistoryVersion,omitempty"`
	// Fixture material is admitted only by the server's explicitly guarded local
	// fixture constructor. It is persisted privately for restart reproducibility.
	FixtureID    string     `json:"fixtureId,omitempty"`
	FixtureDeals [][]string `json:"fixtureDeals,omitempty"`
}
type Chance struct {
	Deck []string `json:"deck"`
}
type State struct {
	Config             Config           `json:"config"`
	Phase              string           `json:"phase"`
	Turn               int              `json:"turn"`
	Kingdom            int              `json:"kingdom"`
	DealNumber         int              `json:"dealNumber"`
	Owner              int              `json:"owner"`
	Request            string           `json:"request"`
	RemainingRequests  []string         `json:"remainingRequests"`
	Hands              [4][]string      `json:"hands"`
	Trick              []Play           `json:"trick"`
	Tricks             []Trick          `json:"tricks"`
	Declarations       []Declaration    `json:"declarations"`
	Board              []Row            `json:"board"`
	FinishOrder        []int            `json:"finishOrder"`
	Passes             []LayoutPass     `json:"passes"`
	Ledger             []LedgerEntry    `json:"ledger"`
	WithheldBonuses    []WithheldBonus  `json:"withheldBonuses"`
	LastExternalLeader [4]*LeadSource   `json:"lastExternalLeader"`
	TwoAnnouncement    *twoAnnouncement `json:"twoAnnouncement,omitempty"`
	LayoutHistory      *LayoutHistory   `json:"layoutHistory,omitempty"`
}

func NextSeat(seat int) int  { return (seat + 3) % 4 }
func partners(v string) bool { return strings.HasSuffix(v, "partners") }
func requests(v string) []string {
	if strings.HasPrefix(v, "complex") {
		return []string{"complex", "trix"}
	}
	return []string{"diamonds", "lutoosh", "queens", "king", "trix"}
}
func validVariant(v string) bool {
	for _, x := range Variants {
		if x == v {
			return true
		}
	}
	return false
}
func Deck() []string {
	d := []string{}
	for _, s := range []string{"C", "D", "H", "S"} {
		for _, r := range []string{"2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"} {
			d = append(d, s+r)
		}
	}
	return d
}
func rank(c string) int {
	if len(c) < 2 {
		return 0
	}
	switch c[1:] {
	case "J":
		return 11
	case "Q":
		return 12
	case "K":
		return 13
	case "A":
		return 14
	}
	n, _ := strconv.Atoi(c[1:])
	return n
}
func cardLess(a, b string) bool {
	if a[0] != b[0] {
		return a[0] < b[0]
	}
	return rank(a) < rank(b)
}
func contains(cards []string, c string) bool {
	for _, x := range cards {
		if x == c {
			return true
		}
	}
	return false
}
func validDeck(deck []string) error {
	if len(deck) != 52 {
		return fmt.Errorf("deal must contain 52 cards")
	}
	seen := map[string]bool{}
	for _, c := range Deck() {
		seen[c] = true
	}
	for _, c := range deck {
		if !seen[c] {
			return fmt.Errorf("invalid or duplicate card %q", c)
		}
		delete(seen, c)
	}
	return nil
}
func clone(s State) State {
	n := s
	n.LayoutHistory = cloneLayoutHistory(s.LayoutHistory)
	if s.TwoAnnouncement != nil {
		a := *s.TwoAnnouncement
		n.TwoAnnouncement = &a
	}
	n.Config.FixtureDeals = cloneDeals(s.Config.FixtureDeals)
	n.RemainingRequests = append([]string{}, s.RemainingRequests...)
	for i := range s.Hands {
		n.Hands[i] = append([]string{}, s.Hands[i]...)
	}
	n.Trick = append([]Play{}, s.Trick...)
	n.Tricks = make([]Trick, len(s.Tricks))
	for i, t := range s.Tricks {
		n.Tricks[i] = t
		n.Tricks[i].Plays = append([]Play{}, t.Plays...)
	}
	n.Declarations = make([]Declaration, len(s.Declarations))
	for i, d := range s.Declarations {
		n.Declarations[i] = d
		n.Declarations[i].Cards = append([]string{}, d.Cards...)
	}
	n.Board = append([]Row{}, s.Board...)
	n.FinishOrder = append([]int{}, s.FinishOrder...)
	n.Passes = make([]LayoutPass, len(s.Passes))
	for i, p := range s.Passes {
		n.Passes[i] = p
		n.Passes[i].Board = append([]Row{}, p.Board...)
	}
	n.Ledger = make([]LedgerEntry, len(s.Ledger))
	for i, e := range s.Ledger {
		n.Ledger[i] = e
		if e.Recipient.Seat != nil {
			v := *e.Recipient.Seat
			n.Ledger[i].Recipient.Seat = &v
		}
	}
	n.WithheldBonuses = append([]WithheldBonus{}, s.WithheldBonuses...)
	for i, source := range s.LastExternalLeader {
		if source != nil {
			v := *source
			n.LastExternalLeader[i] = &v
		}
	}
	return n
}
func New(c Config, deck []string) (State, error) {
	if c.ID == "" || !validVariant(c.Variant) {
		return State{}, fmt.Errorf("invalid Trix configuration")
	}
	if err := validateProfile(c); err != nil {
		return State{}, err
	}
	if err := validateFixtures(c); err != nil {
		return State{}, err
	}
	if len(c.FixtureDeals) > 0 && !reflect.DeepEqual(deck, c.FixtureDeals[0]) {
		return State{}, fmt.Errorf("initial fixture deal mismatch")
	}
	c.FixtureDeals = cloneDeals(c.FixtureDeals)
	s := State{Config: c, Kingdom: 1, DealNumber: 1, RemainingRequests: requests(c.Variant), Ledger: []LedgerEntry{}, WithheldBonuses: []WithheldBonus{}}
	if err := deal(&s, deck, true); err != nil {
		return State{}, err
	}
	return s, nil
}
func deal(s *State, deck []string, first bool) error {
	if err := validDeck(deck); err != nil {
		return err
	}
	s.Hands = [4][]string{}
	for seat := 0; seat < 4; seat++ {
		s.Hands[seat] = append([]string{}, deck[seat*13:(seat+1)*13]...)
		sort.Slice(s.Hands[seat], func(i, j int) bool { return cardLess(s.Hands[seat][i], s.Hands[seat][j]) })
		if first && contains(s.Hands[seat], "H7") {
			s.Owner = seat
		}
	}
	s.Phase = "choose-request"
	s.Turn = s.Owner
	s.Request = ""
	s.Trick = []Play{}
	s.Tricks = []Trick{}
	s.Declarations = []Declaration{}
	s.Board = []Row{{Suit: "C"}, {Suit: "D"}, {Suit: "H"}, {Suit: "S"}}
	s.FinishOrder = []int{}
	s.Passes = []LayoutPass{}
	s.LastExternalLeader = [4]*LeadSource{}
	s.TwoAnnouncement = nil
	s.LayoutHistory = nil
	if s.Config.LayoutHistoryVersion == layoutHistoryVersion {
		s.LayoutHistory = &LayoutHistory{Version: layoutHistoryVersion, Status: "available", Turns: []LayoutTurn{}}
	}
	return nil
}
func eligibleDouble(request, c string) bool {
	return ((request == "queens" || request == "complex") && rank(c) == 12) || ((request == "king" || request == "complex") && c == "HK")
}
func placeable(board []Row, c string) bool {
	for _, r := range board {
		if r.Suit == c[:1] {
			v := rank(c)
			return (r.Low == 0 && v == 11) || (r.Low > 0 && (v == r.Low-1 || v == r.High+1))
		}
	}
	return false
}
func ActionID(a Action) string {
	switch a.Kind {
	case "choose-request":
		return "choose:" + a.Request
	case "declare-doubles":
		return "doubles:" + strings.Join(a.Cards, ",")
	case "play-card":
		return "play:" + a.Card
	case "layout-card":
		return "layout:" + a.Card
	case "layout-pass":
		return "layout-pass"
	}
	return ""
}
func Legal(o Observation) []Action {
	out := []Action{}
	if o.Turn == nil || *o.Turn != o.Seat {
		return out
	}
	switch o.Phase {
	case "choose-request":
		for _, r := range o.RemainingRequests {
			out = append(out, Action{Kind: "choose-request", Request: r})
		}
	case "declare-doubles":
		held := []string{}
		for _, c := range o.Hand {
			if o.Request != nil && eligibleDouble(*o.Request, c) {
				held = append(held, c)
			}
		}
		for mask := 0; mask < (1 << len(held)); mask++ {
			cards := []string{}
			for i, c := range held {
				if mask&(1<<i) != 0 {
					cards = append(cards, c)
				}
			}
			out = append(out, Action{Kind: "declare-doubles", Cards: cards})
		}
	case "playing":
		follow := false
		if len(o.Trick) > 0 {
			for _, c := range o.Hand {
				if c[0] == o.Trick[0].Card[0] {
					follow = true
				}
			}
		}
		for _, c := range o.Hand {
			if !follow || c[0] == o.Trick[0].Card[0] {
				out = append(out, Action{Kind: "play-card", Card: c})
			}
		}
	case "layout":
		for _, c := range o.Hand {
			if placeable(o.Board, c) {
				out = append(out, Action{Kind: "layout-card", Card: c})
			}
		}
		if len(out) == 0 {
			out = append(out, Action{Kind: "layout-pass"})
		}
	}
	return out
}
func Apply(s State, seat int, a Action) (State, error) {
	return applyOwned(clone(s), seat, a)
}

// legalityObservation is a read-only internal projection. Enumerating rules
// needs no score ledger, past requests, fixture sequence or historical copies.
func legalityObservation(s State, seat int) Observation {
	o := Observation{Seat: seat, Phase: s.Phase, RemainingRequests: s.RemainingRequests, Trick: s.Trick, Board: s.Board}
	if seat >= 0 && seat < 4 {
		o.Hand = s.Hands[seat]
	}
	if s.Phase == "choose-request" || s.Phase == "declare-doubles" || s.Phase == "playing" || s.Phase == "layout" {
		turn := s.Turn
		o.Turn = &turn
	}
	if s.Request != "" {
		request := s.Request
		o.Request = &request
	}
	return o
}

// applyOwned receives exclusive ownership. Only replay and immutable wrappers
// may call it; every legality check completes before the first mutation.
func applyOwned(s State, seat int, a Action) (State, error) {
	if seat < 0 || seat > 3 {
		return State{}, fmt.Errorf("invalid seat")
	}
	legal := false
	for _, x := range Legal(legalityObservation(s, seat)) {
		if ActionID(x) == ActionID(a) && actionsEqual(x, a) {
			legal = true
			break
		}
	}
	if !legal {
		return State{}, fmt.Errorf("illegal Trix action")
	}
	n := s
	if (a.Kind == "layout-card" || a.Kind == "layout-pass") && n.LayoutHistory != nil {
		counts := [4]int{}
		for seat := range n.Hands {
			counts[seat] = len(n.Hands[seat])
		}
		n.LayoutHistory.Turns = append(n.LayoutHistory.Turns, LayoutTurn{Ordinal: len(n.LayoutHistory.Turns) + 1, Seat: seat, Kind: a.Kind, Card: a.Card, BoardBefore: append([]Row{}, n.Board...), HandCountsBefore: counts, TwoAnnouncementsBefore: publicTwos(n)})
	}
	switch a.Kind {
	case "choose-request":
		n.Request = a.Request
		pool := []string{}
		for _, r := range n.RemainingRequests {
			if r != a.Request {
				pool = append(pool, r)
			}
		}
		n.RemainingRequests = pool
		if a.Request == "trix" {
			n.Phase = "layout"
			n.TwoAnnouncement = openingTwos(n)
		} else if a.Request == "queens" || a.Request == "king" || a.Request == "complex" {
			n.Phase = "declare-doubles"
		} else {
			n.Phase = "playing"
		}
	case "declare-doubles":
		n.Declarations = append(n.Declarations, Declaration{Seat: seat, Cards: append([]string{}, a.Cards...), Ref: fmt.Sprintf("deal:%d:declaration:%d", n.DealNumber, len(n.Declarations)+1)})
		n.Turn = NextSeat(seat)
		if len(n.Declarations) == 4 {
			n.Phase = "playing"
			n.Turn = n.Owner
		}
	case "play-card":
		removeCard(&n, seat, a.Card)
		n.Trick = append(n.Trick, Play{seat, a.Card})
		n.Turn = NextSeat(seat)
		if len(n.Trick) == 4 {
			t := Trick{Number: len(n.Tricks) + 1, Leader: n.Trick[0].Seat, Winner: winner(n.Trick), Plays: n.Trick}
			if t.Leader != t.Winner {
				n.LastExternalLeader[t.Winner] = &LeadSource{Seat: t.Leader, Trick: t.Number}
			}
			scoreTrick(&n, t)
			n.Tricks = append(n.Tricks, t)
			n.Trick = []Play{}
			n.Turn = t.Winner
			if len(n.Tricks) == 13 {
				n.Phase = "round-complete"
			}
		}
	case "layout-pass":
		n.Passes = append(n.Passes, LayoutPass{Seat: seat, Board: append([]Row{}, n.Board...), Ref: fmt.Sprintf("deal:%d:pass:%d", n.DealNumber, len(n.Passes)+1)})
		n.Turn = nextActive(n, seat)
	case "layout-card":
		removeCard(&n, seat, a.Card)
		for i, r := range n.Board {
			if r.Suit == a.Card[:1] {
				v := rank(a.Card)
				if r.Low == 0 {
					n.Board[i].Low = v
					n.Board[i].High = v
				} else if v < r.Low {
					n.Board[i].Low = v
				} else {
					n.Board[i].High = v
				}
			}
		}
		if len(n.Hands[seat]) == 0 {
			n.FinishOrder = append(n.FinishOrder, seat)
			addScore(&n, seatRecipient(seat), "layout-finish", a.Card, 250-50*len(n.FinishOrder), 0, len(n.FinishOrder), "", "")
		}
		if len(n.FinishOrder) == 4 {
			n.Phase = "round-complete"
		} else {
			n.Turn = nextActive(n, seat)
		}
	}
	if (a.Kind == "layout-card" || a.Kind == "layout-pass") && n.TwoAnnouncement != nil && n.TwoAnnouncement.Turns < 4 {
		n.TwoAnnouncement.Turns++
	}
	return n, nil
}
func actionsEqual(a, b Action) bool {
	a.Cards = append([]string{}, a.Cards...)
	b.Cards = append([]string{}, b.Cards...)
	return reflect.DeepEqual(a, b)
}
func removeCard(s *State, seat int, c string) {
	out := []string{}
	for _, v := range s.Hands[seat] {
		if v != c {
			out = append(out, v)
		}
	}
	s.Hands[seat] = out
}
func nextActive(s State, seat int) int {
	for i := 0; i < 4; i++ {
		seat = NextSeat(seat)
		if len(s.Hands[seat]) > 0 {
			return seat
		}
	}
	return seat
}
func winner(p []Play) int {
	best := p[0]
	for _, x := range p[1:] {
		if x.Card[0] == best.Card[0] && rank(x.Card) > rank(best.Card) {
			best = x
		}
	}
	return best.Seat
}
func Continue(s State) (State, error) {
	return continueOwned(clone(s))
}
func continueOwned(s State) (State, error) {
	if s.Phase != "round-complete" {
		return State{}, fmt.Errorf("request not complete")
	}
	n := s
	if len(n.RemainingRequests) == 0 {
		if n.Kingdom == 4 {
			n.Phase = "session-complete"
			return n, nil
		}
		n.Kingdom++
		n.Owner = NextSeat(n.Owner)
		n.RemainingRequests = requests(n.Config.Variant)
	}
	n.DealNumber++
	n.Phase = "chance"
	return n, nil
}
func Supply(s State, deck []string) (State, error) {
	return supplyOwned(clone(s), deck)
}
func supplyOwned(s State, deck []string) (State, error) {
	if s.Phase != "chance" {
		return State{}, fmt.Errorf("no pending Trix deal")
	}
	if len(s.Config.FixtureDeals) > 0 && !reflect.DeepEqual(deck, s.Config.FixtureDeals[s.DealNumber-1]) {
		return State{}, fmt.Errorf("fixture sequence mismatch")
	}
	n := s
	if e := deal(&n, deck, false); e != nil {
		return State{}, e
	}
	return n, nil
}

func cloneDeals(deals [][]string) [][]string {
	if deals == nil {
		return nil
	}
	out := make([][]string, len(deals))
	for i, d := range deals {
		out[i] = append([]string{}, d...)
	}
	return out
}
func validateFixtures(c Config) error {
	if c.FixtureID == "" && len(c.FixtureDeals) == 0 {
		return nil
	}
	if c.FixtureID == "" || len(c.FixtureDeals) != 4*len(requests(c.Variant)) {
		return fmt.Errorf("fixture must identify a complete request sequence")
	}
	for _, d := range c.FixtureDeals {
		if err := validDeck(d); err != nil {
			return err
		}
	}
	return nil
}
