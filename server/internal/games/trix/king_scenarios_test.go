package trix

// Authored complete deals are private test fixtures. Policies receive only
// Observe(s, s.Turn); witness labels and outside hands never enter selectors.
import (
	"bytes"
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"reflect"
	"strings"
	"testing"
)

const kingScenarioFixtureVersion = "trix-king-scenarios-1.0.0"

type kingScenarioWitness struct {
	ID                 string   `json:"id"`
	Plays              []string `json:"plays"`
	ExpectedKingCaptor int      `json:"expectedKingCaptor"`
}
type kingScenarioFixture struct {
	ID        string                `json:"id"`
	PatternID string                `json:"patternId"`
	Hands     [][]string            `json:"hands"`
	Witnesses []kingScenarioWitness `json:"witnesses"`
}
type kingScenarioCorpus struct {
	SchemaVersion string                `json:"schemaVersion"`
	Fixtures      []kingScenarioFixture `json:"fixtures"`
}

func decodeKingScenarioCorpus(raw []byte) (kingScenarioCorpus, error) {
	var corpus kingScenarioCorpus
	if len(raw) > 1<<20 {
		return corpus, fmt.Errorf("king fixture input exceeds one MiB")
	}
	d := json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	if err := d.Decode(&corpus); err != nil {
		return corpus, err
	}
	var trailing any
	if err := d.Decode(&trailing); err != io.EOF {
		return corpus, fmt.Errorf("trailing king fixture JSON")
	}
	if corpus.SchemaVersion != kingScenarioFixtureVersion || len(corpus.Fixtures) < 6 || len(corpus.Fixtures) > 8 {
		return corpus, fmt.Errorf("invalid king corpus identity or size")
	}
	seen := map[string]bool{}
	for _, f := range corpus.Fixtures {
		if f.ID == "" || len(f.ID) > 120 || seen[f.ID] || f.PatternID == "" || len(f.PatternID) > 120 {
			return corpus, fmt.Errorf("invalid king fixture identity")
		}
		seen[f.ID] = true
		if len(f.Hands) != 4 {
			return corpus, fmt.Errorf("king fixture must contain exactly four hands")
		}
		deck := []string{}
		for _, hand := range f.Hands {
			if len(hand) != 13 {
				return corpus, fmt.Errorf("king fixture must have four complete hands")
			}
			deck = append(deck, hand...)
		}
		if err := validDeck(deck); err != nil {
			return corpus, err
		}
		if !contains(f.Hands[0], "HK") {
			return corpus, fmt.Errorf("king fixture actor zero must hold HK")
		}
		hearts := 0
		for _, card := range f.Hands[0] {
			if card[0] == 'H' {
				hearts++
			}
		}
		if hearts != 6 {
			return corpus, fmt.Errorf("king fixture actor zero must hold HK and exactly five other hearts")
		}
		if len(f.Witnesses) < 1 || len(f.Witnesses) > 3 {
			return corpus, fmt.Errorf("one to three fixed witnesses required")
		}
		wseen := map[string]bool{}
		for _, w := range f.Witnesses {
			if w.ID == "" || len(w.ID) > 120 || wseen[w.ID] || len(w.Plays) < 4 || len(w.Plays) > 52 || len(w.Plays)%4 != 0 || w.ExpectedKingCaptor < 0 || w.ExpectedKingCaptor > 3 {
				return corpus, fmt.Errorf("invalid king witness")
			}
			wseen[w.ID] = true
			cards := map[string]bool{}
			for _, card := range w.Plays {
				if !contains(Deck(), card) || cards[card] {
					return corpus, fmt.Errorf("invalid witness card")
				}
				cards[card] = true
			}
			if !cards["HK"] {
				return corpus, fmt.Errorf("king witness must include completed HK trick")
			}
		}
	}
	return corpus, nil
}

func kingScenarioFixtures(t *testing.T) (kingScenarioCorpus, string) {
	t.Helper()
	raw, err := os.ReadFile("testdata/king-scenarios.json")
	if err != nil {
		t.Fatal(err)
	}
	corpus, err := decodeKingScenarioCorpus(raw)
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(raw)
	return corpus, hex.EncodeToString(digest[:])
}

func kingScenarioNew(f kingScenarioFixture, variant string) (State, error) {
	deck := []string{}
	for _, hand := range f.Hands {
		deck = append(deck, hand...)
	}
	c := Config{ID: "king-scenario", Variant: variant, LayoutHistoryVersion: "1.0.0"}
	if partners(variant) {
		c.ProfileVersion = "1.1.0"
	}
	return New(c, deck)
}

type kingScenarioFeatures struct {
	Version             string         `json:"version"`
	HoldsKing           bool           `json:"holdsKing"`
	HeartCount          int            `json:"heartCount"`
	LowerHeartCount     int            `json:"lowerHeartCount"`
	OwnHigherHearts     []string       `json:"ownHigherHearts"`
	OutsideHigherHearts []string       `json:"outsideHigherHearts"`
	SuitLengths         map[string]int `json:"suitLengths"`
	KnownVoids          [4][]string    `json:"knownVoids"`
	Owner               bool           `json:"owner"`
	CompletedTricks     int            `json:"completedTricks"`
	OwnsAce             bool           `json:"ownsAce"`
	AceKnowledge        string         `json:"aceKnowledge"`
	DeclaredKingOwner   *int           `json:"declaredKingOwner,omitempty"`
	OtherSuitVoids      []string       `json:"otherSuitVoids"`
	OtherSuitSingletons []string       `json:"otherSuitSingletons"`
}

func kingScenarioActorFeatures(o Observation) kingScenarioFeatures {
	f := kingScenarioFeatures{Version: "trix-king-actor-features-1.0.0", HoldsKing: contains(o.Hand, "HK"), OwnHigherHearts: []string{}, OutsideHigherHearts: remainingHigher(o, "HK"), SuitLengths: map[string]int{"C": 0, "D": 0, "H": 0, "S": 0}, Owner: o.Owner == o.Seat, CompletedTricks: len(o.Tricks)}
	for _, card := range o.Hand {
		f.SuitLengths[card[:1]]++
		if card[0] == 'H' {
			f.HeartCount++
			if rank(card) < 13 {
				f.LowerHeartCount++
			}
			if rank(card) > 13 {
				f.OwnHigherHearts = append(f.OwnHigherHearts, card)
			}
		}
	}
	for seat := 0; seat < 4; seat++ {
		f.KnownVoids[seat] = []string{}
		for _, suit := range []string{"C", "D", "H", "S"} {
			for _, trick := range append(append([]Trick{}, o.Tricks...), Trick{Plays: o.Trick}) {
				if len(trick.Plays) > 0 && trick.Plays[0].Card[:1] == suit {
					for _, p := range trick.Plays {
						if p.Seat == seat && p.Card[:1] != suit && !contains(f.KnownVoids[seat], suit) {
							f.KnownVoids[seat] = append(f.KnownVoids[seat], suit)
						}
					}
				}
			}
		}
	}
	f.OwnsAce = contains(o.Hand, "HA")
	f.AceKnowledge = "outside-holder-unknown"
	if f.OwnsAce {
		f.AceKnowledge = "own-hand"
	}
	for _, tr := range o.Tricks {
		for _, p := range tr.Plays {
			if p.Card == "HA" {
				f.AceKnowledge = fmt.Sprintf("publicly-played-by-seat-%d", p.Seat)
			}
		}
	}
	for _, p := range o.Trick {
		if p.Card == "HA" {
			f.AceKnowledge = fmt.Sprintf("publicly-played-by-seat-%d", p.Seat)
		}
	}
	for _, d := range o.Declarations {
		if contains(d.Cards, "HK") {
			seat := d.Seat
			f.DeclaredKingOwner = &seat
		}
	}
	f.OtherSuitVoids = []string{}
	f.OtherSuitSingletons = []string{}
	for _, suit := range []string{"C", "D", "S"} {
		if f.SuitLengths[suit] == 0 {
			f.OtherSuitVoids = append(f.OtherSuitVoids, suit)
		}
		if f.SuitLengths[suit] == 1 {
			f.OtherSuitSingletons = append(f.OtherSuitSingletons, suit)
		}
	}
	return f
}

type kingScenarioActorRecord struct {
	Ordinal                    int                  `json:"ordinal"`
	Seat                       int                  `json:"seat"`
	Observation                Observation          `json:"observation"`
	Features                   kingScenarioFeatures `json:"features"`
	Trace                      *DecisionTrace       `json:"trace,omitempty"`
	ExecutedCandidateID        string               `json:"executedCandidateId"`
	PolicySuggestedCandidateID string               `json:"policySuggestedCandidateId"`
}
type kingScenarioTurn struct {
	Ordinal                    int                      `json:"ordinal"`
	Seat                       int                      `json:"seat"`
	Action                     Action                   `json:"action"`
	LegalCount                 int                      `json:"legalCount"`
	ObservationDigest          string                   `json:"observationDigest"`
	Cue                        string                   `json:"cue"`
	Facts                      []contracts.CoachSupport `json:"facts"`
	SelectionSource            string                   `json:"selectionSource"`
	PolicySuggestedCandidateID string                   `json:"policySuggestedCandidateId"`
	PolicyCue                  string                   `json:"policyCue"`
	LegalForced                bool                     `json:"legalForced"`
	ExperimentalOverride       bool                     `json:"experimentalOverride"`
}
type kingScenarioCapture struct {
	Seat           int        `json:"seat"`
	Trick          int        `json:"trick"`
	Leader         int        `json:"leader"`
	Doubled        bool       `json:"doubled"`
	BonusRecipient *Recipient `json:"bonusRecipient,omitempty"`
	LeadSourceRef  string     `json:"leadSourceRef,omitempty"`
	Withheld       bool       `json:"withheld"`
}
type kingScenarioRun struct {
	ID                  string                    `json:"id"`
	Variant             string                    `json:"variant"`
	Pin                 gamekernel.Pin            `json:"pin"`
	ProfileID           string                    `json:"profileId"`
	Arm                 string                    `json:"arm"`
	WitnessID           string                    `json:"witnessId,omitempty"`
	Status              string                    `json:"status"`
	Objective           string                    `json:"objective"`
	ObjectivePoints     int                       `json:"objectivePoints"`
	KingComponentPoints int                       `json:"kingComponentPoints"`
	CompletedTricks     int                       `json:"completedTricks"`
	Tricks              []Trick                   `json:"tricks"`
	RequestTotals       []Score                   `json:"requestTotals"`
	ComponentTotals     map[string]map[string]int `json:"componentTotals"`
	KingCapture         kingScenarioCapture       `json:"kingCapture"`
	Ledger              []LedgerEntry             `json:"ledger"`
	WithheldBonuses     []WithheldBonus           `json:"withheldBonuses"`
	Timeline            []kingScenarioTurn        `json:"timeline"`
	ActorRecords        []kingScenarioActorRecord `json:"actorRecords"`
}
type kingScenarioWork struct {
	Steps int `json:"steps"`
	Runs  int `json:"runs"`
}

func kingScenarioDecision(o Observation, policy string) (Action, *DecisionTrace, error) {
	if policy == PolicyID {
		a, err := DecideWithPolicy(o, policy)
		return a, nil, err
	}
	trace, err := BuildDecisionTrace(o, policy)
	if err != nil {
		return Action{}, nil, err
	}
	if err := ValidateDecisionTraceWithPin(o, trace, tracePin(o)); err != nil {
		return Action{}, nil, err
	}
	return trace.Action, &trace, nil
}

func kingScenarioRunDeal(ctx context.Context, f kingScenarioFixture, variant, policy, arm string, witness *kingScenarioWitness, work *kingScenarioWork) (kingScenarioRun, error) {
	out := kingScenarioRun{ID: f.ID + "/" + variant + "/" + policy + "/" + arm, Variant: variant, Pin: Pin(variant), ProfileID: policy, Arm: arm, Status: "incomplete", Timeline: []kingScenarioTurn{}, ActorRecords: []kingScenarioActorRecord{}}
	if !validVariant(variant) || (policy != PolicyID && policy != OwnershipComparisonPolicyID) || (arm != "natural-all-declarations" && arm != "controlled-HK-double" && arm != "controlled-decline") || ctx == nil || work == nil {
		return out, fmt.Errorf("unsupported king scenario run")
	}
	if witness != nil {
		out.WitnessID = witness.ID
		out.ID += "/witness/" + witness.ID
	}
	s, err := kingScenarioNew(f, variant)
	if err != nil {
		return out, err
	}
	witnessOffset := 0
	for s.Phase != "round-complete" {
		if err := ctx.Err(); err != nil {
			return out, err
		}
		if work.Steps >= 20000 {
			return out, fmt.Errorf("king scenario step cap exhausted")
		}
		o := Observe(s, s.Turn)
		legal := Legal(o)
		if len(legal) == 0 {
			return out, fmt.Errorf("no native legal action")
		}
		a, trace, err := kingScenarioDecision(o, policy)
		if err != nil {
			return out, err
		}
		source := "policy"
		suggested := ActionID(a)
		policyCue, _ := teaching(o, a)
		if trace != nil {
			policyCue = trace.Cue
		}
		switch s.Phase {
		case "choose-request":
			request := "king"
			if strings.HasPrefix(variant, "complex") {
				request = "complex"
			}
			a = Action{Kind: "choose-request", Request: request}
			source = "fixed-request"
		case "declare-doubles":
			if arm != "natural-all-declarations" {
				a = Action{Kind: "declare-doubles", Cards: []string{}}
				if arm == "controlled-HK-double" && contains(o.Hand, "HK") {
					a.Cards = []string{"HK"}
				}
				source = "controlled-declaration"
			}
		case "playing":
			if witness != nil && witnessOffset < len(witness.Plays) {
				a = Action{Kind: "play-card", Card: witness.Plays[witnessOffset]}
				witnessOffset++
				source = "authored-witness"
			}
		default:
			return out, fmt.Errorf("unexpected scenario phase")
		}
		cue, _ := teaching(o, a)
		facts := []contracts.CoachSupport{}
		if trace != nil {
			cue = trace.Cue
			facts = trace.FactCatalog
		}
		if source != "policy" {
			cue = "Experimental action: " + source
			facts = []contracts.CoachSupport{}
		}
		focal := o.Seat == 0 || partners(variant) && o.Seat == 2
		if !focal {
			cue = ""
			policyCue = ""
			facts = []contracts.CoachSupport{}
		}
		ordinal := len(out.Timeline) + 1
		publicSuggestion := suggested
		if !focal && o.Phase != "choose-request" {
			publicSuggestion = ""
		}
		out.Timeline = append(out.Timeline, kingScenarioTurn{Ordinal: ordinal, Seat: o.Seat, Action: a, LegalCount: len(legal), ObservationDigest: observationDigest(o), Cue: cue, Facts: facts, SelectionSource: source, PolicySuggestedCandidateID: publicSuggestion, PolicyCue: policyCue, LegalForced: len(legal) == 1, ExperimentalOverride: ActionID(a) != suggested})
		if o.Seat == 0 || partners(variant) && o.Seat == 2 {
			out.ActorRecords = append(out.ActorRecords, kingScenarioActorRecord{Ordinal: ordinal, Seat: o.Seat, Observation: o, Features: kingScenarioActorFeatures(o), Trace: trace, ExecutedCandidateID: ActionID(a), PolicySuggestedCandidateID: suggested})
		}
		s, err = Apply(s, o.Seat, a)
		if err != nil {
			return out, fmt.Errorf("%s step %d: %w", out.ID, ordinal, err)
		}
		work.Steps++
		if witness != nil && witnessOffset == len(witness.Plays) && s.Phase == "playing" {
			found := false
			for _, tr := range s.Tricks {
				for _, p := range tr.Plays {
					if p.Card == "HK" {
						found = true
						if tr.Winner != witness.ExpectedKingCaptor {
							return out, fmt.Errorf("independent witness captor changed")
						}
					}
				}
			}
			if !found {
				return out, fmt.Errorf("witness prefix did not complete HK capture")
			}
		}
	}
	if witness != nil && witnessOffset != len(witness.Plays) {
		return out, fmt.Errorf("unfinished witness prefix")
	}
	if err := kingScenarioFinish(&out, s); err != nil {
		return out, err
	}
	if witness != nil && out.KingCapture.Seat != witness.ExpectedKingCaptor {
		return out, fmt.Errorf("independent witness final captor changed")
	}
	out.Status = "completed"
	work.Runs++
	return out, nil
}

func kingScenarioFinish(out *kingScenarioRun, s State) error {
	if s.Phase != "round-complete" || len(s.Tricks) != 13 {
		return fmt.Errorf("king run requires all thirteen tricks")
	}
	out.CompletedTricks = len(s.Tricks)
	out.Tricks = append([]Trick{}, s.Tricks...)
	out.RequestTotals = scores(s, s.DealNumber, 0)
	out.Ledger = append([]LedgerEntry{}, s.Ledger...)
	out.WithheldBonuses = append([]WithheldBonus{}, s.WithheldBonuses...)
	out.ComponentTotals = map[string]map[string]int{}
	for _, total := range out.RequestTotals {
		out.ComponentTotals[total.ID] = map[string]int{}
	}
	for _, e := range out.Ledger {
		for _, total := range out.RequestTotals {
			matches := e.Recipient.Kind == "competitor" && e.Recipient.Competitor == total.ID
			if e.Recipient.Kind == "seat" && e.Recipient.Seat != nil {
				for _, seat := range total.Seats {
					if seat == *e.Recipient.Seat {
						matches = true
					}
				}
			}
			if matches {
				out.ComponentTotals[total.ID][e.Component] += e.Delta
			}
		}
	}
	mine := "seat-0"
	out.Objective = "own-request-points"
	if partners(s.Config.Variant) {
		mine = "NS"
		out.Objective = "combined-team-request-points"
	}
	for _, total := range out.RequestTotals {
		sum := 0
		for _, n := range out.ComponentTotals[total.ID] {
			sum += n
		}
		if sum != total.Total {
			return fmt.Errorf("component sum changed")
		}
		if total.ID == mine {
			out.ObjectivePoints = total.Total
		}
	}
	out.KingComponentPoints = out.ComponentTotals[mine]["king"]
	found := false
	for _, tr := range s.Tricks {
		for _, p := range tr.Plays {
			if p.Card == "HK" {
				out.KingCapture = kingScenarioCapture{Seat: tr.Winner, Trick: tr.Number, Leader: tr.Leader}
				found = true
			}
		}
	}
	if !found {
		return fmt.Errorf("completed deal omitted HK")
	}
	for _, d := range s.Declarations {
		if contains(d.Cards, "HK") {
			out.KingCapture.Doubled = true
		}
	}
	kingEntries := 0
	for _, e := range s.Ledger {
		if e.Card != "HK" {
			continue
		}
		if e.Component == "king" {
			kingEntries++
			want := -75
			if out.KingCapture.Doubled {
				want = -150
			}
			if e.Delta != want || e.Recipient.Seat == nil || *e.Recipient.Seat != out.KingCapture.Seat {
				return fmt.Errorf("literal king capture arithmetic changed")
			}
		}
		if e.Component == "double-bonus" {
			if e.Delta != 75 {
				return fmt.Errorf("literal king bonus arithmetic changed")
			}
			r := e.Recipient
			out.KingCapture.BonusRecipient = &r
			out.KingCapture.LeadSourceRef = e.LeadSourceRef
		}
	}
	for _, w := range s.WithheldBonuses {
		if w.Card == "HK" {
			if w.BonusValue != 75 {
				return fmt.Errorf("literal withheld king bonus changed")
			}
			out.KingCapture.Withheld = true
		}
	}
	if kingEntries != 1 || out.KingCapture.Doubled && (out.KingCapture.BonusRecipient == nil) == !out.KingCapture.Withheld {
		return fmt.Errorf("king bonus provenance incomplete")
	}
	if !out.KingCapture.Doubled {
		if out.KingCapture.BonusRecipient != nil || out.KingCapture.Withheld {
			return fmt.Errorf("undoubled king acquired bonus")
		}
		return nil
	}
	// Independent literal routing oracle. Scan only public tricks up to capture;
	// later external leaders must not rewrite this historical giver.
	var expected *Recipient
	ref := ""
	if partners(s.Config.Variant) {
		team := "NS"
		if out.KingCapture.Seat%2 == 0 {
			team = "EW"
		}
		expected = &Recipient{Kind: "competitor", Competitor: team}
	} else if out.KingCapture.Seat != 0 {
		seat := 0
		expected = &Recipient{Kind: "seat", Seat: &seat}
	} else {
		giver, trick := -1, 0
		for _, tr := range s.Tricks {
			if tr.Number > out.KingCapture.Trick {
				break
			}
			if tr.Winner == 0 && tr.Leader != 0 {
				giver, trick = tr.Leader, tr.Number
			}
		}
		if giver >= 0 {
			seat := giver
			expected = &Recipient{Kind: "seat", Seat: &seat}
			ref = fmt.Sprintf("deal:1:trick:%d", trick)
		}
	}
	if !reflect.DeepEqual(expected, out.KingCapture.BonusRecipient) || out.KingCapture.Withheld != (expected == nil) || out.KingCapture.LeadSourceRef != ref {
		return fmt.Errorf("independent literal king bonus recipient or giver changed")
	}
	return nil
}

func TestKingScenarioIllegalWitnessAndBudget(t *testing.T) {
	corpus, _ := kingScenarioFixtures(t)
	f := corpus.Fixtures[0]
	w := f.Witnesses[0]
	w.Plays = append([]string{}, w.Plays...)
	s, err := kingScenarioNew(f, "basic-solo")
	if err != nil {
		t.Fatal(err)
	}
	// Choose a valid card held outside the first native leader's hand.
	for _, card := range Deck() {
		if !contains(s.Hands[s.Owner], card) {
			w.Plays[0] = card
			break
		}
	}
	work := kingScenarioWork{}
	run, err := kingScenarioRunDeal(context.Background(), f, "basic-solo", PolicyID, "controlled-HK-double", &w, &work)
	if err == nil || run.Status == "completed" {
		t.Fatal("illegal authored prefix counted as complete")
	}
	work = kingScenarioWork{Steps: 20000}
	run, err = kingScenarioRunDeal(context.Background(), f, "basic-solo", PolicyID, "controlled-decline", nil, &work)
	if err == nil || run.Status == "completed" || work.Runs != 0 {
		t.Fatal("exhausted run acquired completed status")
	}
}

func TestKingScenarioCorpusBoundary(t *testing.T) {
	corpus, _ := kingScenarioFixtures(t)
	raw, _ := json.Marshal(corpus)
	for _, mutate := range []func(*kingScenarioCorpus){func(c *kingScenarioCorpus) { c.Fixtures[0].Hands[1][0] = c.Fixtures[0].Hands[0][0] }, func(c *kingScenarioCorpus) { c.SchemaVersion = "wrong" }, func(c *kingScenarioCorpus) { c.Fixtures = c.Fixtures[:5] }, func(c *kingScenarioCorpus) { c.Fixtures[0].Witnesses[0].ExpectedKingCaptor = 4 }} {
		var bad kingScenarioCorpus
		_ = json.Unmarshal(raw, &bad)
		mutate(&bad)
		encoded, _ := json.Marshal(bad)
		if _, err := decodeKingScenarioCorpus(encoded); err == nil {
			t.Fatal("invalid private fixture accepted")
		}
	}
	if _, err := decodeKingScenarioCorpus(append(raw, []byte(" {}")...)); err == nil {
		t.Fatal("trailing document accepted")
	}
	var fifthHand kingScenarioCorpus
	_ = json.Unmarshal(raw, &fifthHand)
	fifthHand.Fixtures[0].Hands = append(fifthHand.Fixtures[0].Hands, append([]string{}, fifthHand.Fixtures[0].Hands[0]...))
	fifthBytes, _ := json.Marshal(fifthHand)
	if _, err := decodeKingScenarioCorpus(fifthBytes); err == nil || !strings.Contains(err.Error(), "exactly four hands") {
		t.Fatal("fifth JSON hand silently accepted", err)
	}
	// Preserve a complete, unique deck and HK ownership while changing cover.
	var badCover kingScenarioCorpus
	_ = json.Unmarshal(raw, &badCover)
	heartIndex, outsideIndex := -1, -1
	for i, card := range badCover.Fixtures[0].Hands[0] {
		if card[0] == 'H' && card != "HK" {
			heartIndex = i
			break
		}
	}
	for i, card := range badCover.Fixtures[0].Hands[1] {
		if card[0] != 'H' {
			outsideIndex = i
			break
		}
	}
	if heartIndex < 0 || outsideIndex < 0 {
		t.Fatal("cover negative control cannot be constructed")
	}
	badCover.Fixtures[0].Hands[0][heartIndex], badCover.Fixtures[0].Hands[1][outsideIndex] = badCover.Fixtures[0].Hands[1][outsideIndex], badCover.Fixtures[0].Hands[0][heartIndex]
	badBytes, _ := json.Marshal(badCover)
	if _, err := decodeKingScenarioCorpus(badBytes); err == nil || !strings.Contains(err.Error(), "exactly five other hearts") {
		t.Fatal("complete deck with wrong protected-heart count admitted", err)
	}
}

func TestKingScenarioWitnesses(t *testing.T) {
	corpus, _ := kingScenarioFixtures(t)
	work := kingScenarioWork{}
	for _, f := range corpus.Fixtures {
		for _, variant := range Variants {
			for _, w := range f.Witnesses {
				for _, arm := range []string{"controlled-HK-double", "controlled-decline"} {
					run, err := kingScenarioRunDeal(context.Background(), f, variant, PolicyID, arm, &w, &work)
					if err != nil {
						t.Fatal(err)
					}
					if run.CompletedTricks != 13 || run.Status != "completed" {
						t.Fatal("unfinished full deal")
					}
					if partners(variant) && run.KingCapture.Doubled && (run.KingCapture.BonusRecipient == nil || run.KingCapture.BonusRecipient.Kind != "competitor") {
						t.Fatal("partner bonus must remain team recipient")
					}
					if !partners(variant) {
						for _, e := range run.Ledger {
							if e.Recipient.Kind == "competitor" {
								t.Fatal("Solo acquired team routing")
							}
						}
					}
				}
			}
		}
	}
}

func TestKingScenarioActorPrivacyAndHiddenHandInvariance(t *testing.T) {
	corpus, _ := kingScenarioFixtures(t)
	f := corpus.Fixtures[0]
	s, err := kingScenarioNew(f, "basic-solo")
	if err != nil {
		t.Fatal(err)
	}
	// Swap two cards outside actor zero without moving the public owner H7.
	other := clone(s)
	i, j := -1, -1
	for n, c := range other.Hands[1] {
		if c != "H7" {
			i = n
			break
		}
	}
	for n, c := range other.Hands[2] {
		if c != "H7" {
			j = n
			break
		}
	}
	other.Hands[1][i], other.Hands[2][j] = other.Hands[2][j], other.Hands[1][i]
	o, p := Observe(s, 0), Observe(other, 0)
	if !reflect.DeepEqual(o, p) || !reflect.DeepEqual(kingScenarioActorFeatures(o), kingScenarioActorFeatures(p)) {
		t.Fatal("actor evidence used hidden allocation")
	}
	raw, _ := json.Marshal(o)
	var fields map[string]any
	_ = json.Unmarshal(raw, &fields)
	for _, forbidden := range []string{"hands", "deck", "fixtureDeals", "witnesses", "patternId"} {
		if _, ok := fields[forbidden]; ok {
			t.Fatal("private material leaked into scoped observation")
		}
	}
	// Advance to actor zero's actual declaration, then compare identical scoped inputs.
	request := Action{Kind: "choose-request", Request: "king"}
	s, err = Apply(s, s.Turn, request)
	if err != nil {
		t.Fatal(err)
	}
	other, err = Apply(other, other.Turn, request)
	if err != nil {
		t.Fatal(err)
	}
	for s.Turn != 0 {
		a := Action{Kind: "declare-doubles", Cards: []string{}}
		s, err = Apply(s, s.Turn, a)
		if err != nil {
			t.Fatal(err)
		}
		other, err = Apply(other, other.Turn, a)
		if err != nil {
			t.Fatal(err)
		}
	}
	for _, policy := range []string{PolicyID, OwnershipComparisonPolicyID} {
		a, ta, err := kingScenarioDecision(Observe(s, 0), policy)
		if err != nil {
			t.Fatal(err)
		}
		b, tb, err := kingScenarioDecision(Observe(other, 0), policy)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(a, b) || !reflect.DeepEqual(ta, tb) {
			t.Fatal("hidden hands changed actor decision")
		}
	}
}
