package trix

// Fixed complete deals and legal prefixes are native reachability witnesses.
// Their private hands never enter EvaluateJacksEnding or the study output.
import (
	"bytes"
	"cardford/server/internal/gamekernel"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"
)

type jacksEndingFixture struct {
	ID            string      `json:"id"`
	Deck          []string    `json:"deck"`
	Prefix        []Action    `json:"prefix"`
	ExpectedBoard []Row       `json:"expectedBoard"`
	ExpectedHands [4][]string `json:"expectedHands"`
}

func jacksEndingFixtures(t *testing.T) ([]jacksEndingFixture, string) {
	t.Helper()
	raw, err := os.ReadFile("testdata/jacks-ending-cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var packet struct {
		SchemaVersion string               `json:"schemaVersion"`
		Fixtures      []jacksEndingFixture `json:"fixtures"`
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err = decoder.Decode(&packet); err != nil {
		t.Fatal(err)
	}
	if packet.SchemaVersion != "trix-jacks-ending-native-fixtures-1.0.0" || len(packet.Fixtures) != 5 {
		t.Fatal("fixture identity changed")
	}
	digest := sha256.Sum256(raw)
	return packet.Fixtures, hex.EncodeToString(digest[:])
}

func jacksEndingReplayFixture(t *testing.T, f jacksEndingFixture, variant string) State {
	t.Helper()
	config := Config{ID: "jacks-ending-" + f.ID, Variant: variant, LayoutHistoryVersion: "1.0.0"}
	if partners(variant) {
		config.ProfileVersion = "1.1.0"
	}
	s, err := New(config, f.Deck)
	if err != nil {
		t.Fatal(err)
	}
	for ordinal, a := range f.Prefix {
		s, err = Apply(s, s.Turn, a)
		if err != nil {
			t.Fatalf("%s prefix %d: %v", f.ID, ordinal, err)
		}
	}
	if s.Phase != "layout" || s.Turn != 0 || !reflect.DeepEqual(s.Board, f.ExpectedBoard) || !reflect.DeepEqual(s.Hands, f.ExpectedHands) {
		t.Fatalf("changed ending %s", f.ID)
	}
	if err = ValidateLayoutHistoryObservation(Observe(s, 0)); err != nil {
		t.Fatal(err)
	}
	return s
}

// Paths were checked against rank adjacency, counterclockwise turns and
// compulsory placement. Literal awards independently check native scoring.
func TestJacksEndingCaseHandCheckedWitnesses(t *testing.T) {
	fixtures, _ := jacksEndingFixtures(t)
	cases := []struct {
		id, variant, path string
		order             []int
		points            [4]int
	}{
		{"two-lower-upper", "basic-partners", "0:C3 3:DK 2:C2 1:D3 0:CK 3:DA 2:D2 1:CA", []int{0, 3, 2, 1}, [4]int{200, 50, 100, 150}},
		{"two-lower-upper", "basic-partners", "0:CK 3:DK 2:pass 1:CA 0:C3 3:DA 2:C2 1:D3 2:D2", []int{0, 3, 1, 2}, [4]int{200, 100, 50, 150}},
		{"partner-all-twos", "complex-partners", "0:C3 3:DK 2:C2 1:pass 0:D3 3:DA 2:D2 1:pass 0:H3 2:H2 1:pass 0:S3 2:S2 1:pass 0:CK 1:CA", []int{3, 2, 0, 1}, [4]int{100, 50, 150, 200}},
		{"partner-all-twos", "complex-partners", "0:CK 3:DK 2:pass 1:CA 0:C3 3:DA 2:C2 0:D3 2:D2 0:H3 2:H2 0:S3 2:S2", []int{1, 3, 0, 2}, [4]int{100, 200, 50, 150}},
		{"partner-all-twos", "complex-partners", "0:C3 3:DK 2:C2 1:pass 0:CK 3:DA 2:pass 1:CA 0:D3 2:D2 0:H3 2:H2 0:S3 2:S2", []int{3, 1, 0, 2}, [4]int{100, 150, 50, 200}},
		{"partner-zero-twos-lower", "basic-partners", "0:C4 3:D3 2:C3 1:C2 0:CK 3:D2 1:CA", []int{2, 0, 3, 1}, [4]int{150, 50, 200, 100}},
		{"partner-zero-twos-lower", "basic-partners", "0:CK 3:D3 2:pass 1:CA 0:C4 3:D2 2:C3 1:C2", []int{0, 3, 2, 1}, [4]int{200, 50, 100, 150}},
		{"partner-zero-twos-ace", "basic-partners", "0:C4 3:D3 2:pass 1:C3 0:CK 3:D2 2:CA 1:C2", []int{0, 3, 2, 1}, [4]int{200, 50, 100, 150}},
		{"partner-zero-twos-ace", "basic-partners", "0:CK 3:D3 2:CA 1:pass 0:C4 3:D2 1:C3 1:C2", []int{2, 0, 3, 1}, [4]int{150, 50, 200, 100}},
		{"forced-five-card-release", "complex-partners", "0:C3 3:DA 2:C2 1:pass 0:CK 1:CA", []int{3, 2, 0, 1}, [4]int{100, 50, 150, 200}},
		{"forced-five-card-release", "complex-partners", "0:CK 3:DA 2:pass 1:CA 0:C3 2:C2", []int{3, 1, 0, 2}, [4]int{100, 150, 50, 200}},
	}
	for index, c := range cases {
		t.Run(c.id+"/"+string(rune('a'+index)), func(t *testing.T) {
			var f jacksEndingFixture
			for _, v := range fixtures {
				if v.ID == c.id {
					f = v
				}
			}
			s := jacksEndingReplayFixture(t, f, c.variant)
			for offset, token := range strings.Fields(c.path) {
				parts := strings.Split(token, ":")
				seat := int(parts[0][0] - '0')
				a := Action{Kind: "layout-card", Card: parts[1]}
				if parts[1] == "pass" {
					a = Action{Kind: "layout-pass"}
				}
				if s.Turn != seat {
					t.Fatalf("turn %d changed", offset)
				}
				if c.id == "forced-five-card-release" && offset > 0 && len(Legal(Observe(s, seat))) != 1 {
					t.Fatal("nonforced witness future")
				}
				var err error
				s, err = Apply(s, seat, a)
				if err != nil {
					t.Fatal(err)
				}
			}
			if s.Phase != "round-complete" || !reflect.DeepEqual(s.FinishOrder, c.order) {
				t.Fatal("literal finish changed", s.FinishOrder)
			}
			var actual [4]int
			for _, entry := range s.Ledger {
				if entry.Component == "layout-finish" && entry.Recipient.Seat != nil {
					actual[*entry.Recipient.Seat] += entry.Delta
				}
			}
			if actual != c.points {
				t.Fatalf("literal seat awards changed: %v", actual)
			}
		})
	}
}

func TestJacksEndingCaseExactForcedComparison(t *testing.T) {
	fixtures, _ := jacksEndingFixtures(t)
	var forced, allTwos jacksEndingFixture
	for _, f := range fixtures {
		switch f.ID {
		case "forced-five-card-release":
			forced = f
		case "partner-all-twos":
			allTwos = f
		case "partner-zero-twos-lower", "partner-zero-twos-ace":
			for _, card := range f.Deck[26:39] {
				if rank(card) == 2 {
					t.Fatal("zero-twos partner originally held a two")
				}
			}
		}
	}
	for _, variant := range []string{"basic-partners", "complex-partners"} {
		s := jacksEndingReplayFixture(t, forced, variant)
		o := Observe(s, 0)
		before, _ := json.Marshal(o)
		result, err := EvaluateJacksEnding(context.Background(), o, Pin(variant), DefaultJacksEndingConfig())
		if err != nil || result.Status != "completed" || !result.EnumerationComplete || len(result.Rows) != 1 {
			t.Fatalf("exact forced comparison: %+v %v", result.Work, err)
		}
		for _, profile := range result.Rows[0].Profiles {
			for _, root := range profile.Roots {
				want := 250
				order := []int{3, 2, 0, 1}
				if root.CandidateID == "layout:CK" {
					want = 150
					order = []int{3, 1, 0, 2}
				}
				if root.ObjectivePoints != want || root.OwnPoints != 100 || root.UnforcedFutureDecisions != 0 || !reflect.DeepEqual(root.FinishOrder, order) {
					t.Fatalf("exact literal comparison changed: %+v", root)
				}
			}
		}
		after, _ := json.Marshal(o)
		if !bytes.Equal(before, after) {
			t.Fatal("comparison changed frozen actor input")
		}
		limited := DefaultJacksEndingConfig()
		limited.MaxSteps = 1
		negative, err := EvaluateJacksEnding(context.Background(), o, Pin(variant), limited)
		if err != nil || negative.Status != "incomplete" || negative.EnumerationComplete {
			t.Fatal("bounded comparison overstated completion", err)
		}
	}
	s := jacksEndingReplayFixture(t, allTwos, "complex-partners")
	outside, err := EvaluateJacksEnding(context.Background(), Observe(s, 0), Pin("complex-partners"), DefaultJacksEndingConfig())
	if err != nil || outside.Status != "outside-scope" {
		t.Fatal("twelve-card witness must require explicit bound", err)
	}
	early, err := New(s.Config, allTwos.Deck)
	if err != nil {
		t.Fatal(err)
	}
	early, err = Apply(early, early.Turn, allTwos.Prefix[0])
	if err != nil {
		t.Fatal(err)
	}
	public := Observe(early, early.Turn)
	evidence, err := fourTwosOwnership(public)
	if err != nil || evidence.Assignments != 17 || public.TwoAnnouncements != nil {
		t.Fatal("suppressed zero-actor opening must retain both owning teams", err)
	}
}

type jacksEndingStudyCase struct {
	ID                   string            `json:"id"`
	Tags                 []string          `json:"tags"`
	Variant              string            `json:"variant"`
	Pin                  gamekernel.Pin    `json:"pin"`
	ActorObservation     Observation       `json:"actorObservation"`
	ReferenceCandidateID string            `json:"referenceCandidateId"`
	Selections           map[string]string `json:"selections"`
	Evaluation           JacksEndingResult `json:"evaluation"`
}
type jacksEndingStudyControl struct {
	ID               string            `json:"id"`
	ExpectedStatus   string            `json:"expectedStatus"`
	ActorObservation Observation       `json:"actorObservation"`
	Evaluation       JacksEndingResult `json:"evaluation"`
}

func TestJacksEndingStudy(t *testing.T) {
	outputPath := os.Getenv("TRIX_JACKS_ENDING_STUDY_OUTPUT")
	if outputPath == "" {
		t.Skip("opt-in bounded ending study")
	}
	fixtures, digest := jacksEndingFixtures(t)
	result := struct {
		SchemaVersion    string                    `json:"schemaVersion"`
		Status           string                    `json:"status"`
		FixtureDigest    string                    `json:"fixtureDigest"`
		Cases            []jacksEndingStudyCase    `json:"cases"`
		NegativeControls []jacksEndingStudyControl `json:"negativeControls"`
		Limitations      []string                  `json:"limitations"`
	}{SchemaVersion: "trix-jacks-ending-study-1.0.0", Status: "completed", FixtureDigest: digest, Cases: []jacksEndingStudyCase{}, NegativeControls: []jacksEndingStudyControl{}, Limitations: []string{
		"Native deals are test-only reachability/scoring witnesses. Each comparison receives only its actor observation and enumerates all compatible allocations, without the original hidden fixture deal.",
		"Development examples and counterexamples are not independent held-out origins or strength evidence; these diagnostics alone establish no general runtime rule or promotion.",
		"A forced native witness does not prove every feasible allocation forced. Each allocation/profile/root records future unforced decisions separately.",
	}}
	for _, f := range fixtures {
		variants := []string{"basic-partners"}
		if f.ID == "partner-all-twos" || f.ID == "forced-five-card-release" {
			variants = []string{"complex-partners"}
		}
		if f.ID == "partner-zero-twos-lower" {
			variants = append(variants, "basic-solo", "complex-solo")
		}
		for _, variant := range variants {
			s := jacksEndingReplayFixture(t, f, variant)
			o := Observe(s, 0)
			pin := Pin(variant)
			c := DefaultJacksEndingConfig()
			if f.ID == "partner-all-twos" {
				c.MaxRemainingCards = 12
			}
			c.Profiles = append(c.Profiles, JacksEndingProfile{ID: "ownership-one-seat", Policies: [4]string{OwnershipPolicyID, HistoryPolicyID, HistoryPolicyID, HistoryPolicyID}})
			if partners(variant) {
				c.Profiles = append(c.Profiles, JacksEndingProfile{ID: "ownership-both-teammates", Policies: [4]string{OwnershipPolicyID, HistoryPolicyID, OwnershipPolicyID, HistoryPolicyID}})
			}
			evaluation, err := EvaluateJacksEnding(context.Background(), o, pin, c)
			if err != nil {
				t.Fatal(err)
			}
			if evaluation.Status != "completed" || !evaluation.EnumerationComplete {
				result.Status = "incomplete"
			}
			selections := map[string]string{}
			for _, policy := range []string{PolicyID, HistoryPolicyID, OwnershipPolicyID} {
				a, err := DecideWithPolicy(o, policy)
				if err != nil {
					t.Fatal(err)
				}
				selections[policy] = ActionID(a)
			}
			tags := []string{"reachable", "opening-versus-delay"}
			switch f.ID {
			case "partner-all-twos":
				tags = append(tags, "partner-all-twos", "continuation-sensitive", "equal-team-points-distinct-finishes")
			case "partner-zero-twos-lower":
				tags = append(tags, "partner-no-twos", "individual-sacrifice")
			case "partner-zero-twos-ace":
				tags = append(tags, "partner-no-twos", "upper-release-counterexample")
			case "two-lower-upper":
				tags = append(tags, "partner-many-twos", "retain-opponent-ace-blocker")
			case "forced-five-card-release":
				tags = append(tags, "forced-native-witness")
			}
			if !partners(variant) {
				tags = []string{"reachable", "opening-versus-delay", "solo-counterpart", "individual-finish-tradeoff"}
			}
			result.Cases = append(result.Cases, jacksEndingStudyCase{f.ID + "-" + variant, tags, variant, pin, o, selections[HistoryPolicyID], selections, evaluation})
			t.Logf("%s %s: %s allocations=%d", f.ID, variant, evaluation.Status, len(evaluation.Rows))
			if f.ID == "partner-all-twos" {
				early, err := New(s.Config, f.Deck)
				if err != nil {
					t.Fatal(err)
				}
				early, err = Apply(early, early.Turn, f.Prefix[0])
				if err != nil {
					t.Fatal(err)
				}
				eo := Observe(early, early.Turn)
				evidence, err := fourTwosOwnership(eo)
				if err != nil || evidence.Assignments <= 1 || eo.TwoAnnouncements != nil {
					t.Fatal("early suppressed ownership must remain ambiguous", err)
				}
				negative, err := EvaluateJacksEnding(context.Background(), eo, pin, c)
				if err != nil {
					t.Fatal(err)
				}
				result.NegativeControls = append(result.NegativeControls, jacksEndingStudyControl{"early-suppressed-unknown-team", "outside-scope", eo, negative})
			}
			if f.ID == "forced-five-card-release" {
				limited := c
				limited.MaxSteps = 1
				negative, err := EvaluateJacksEnding(context.Background(), o, pin, limited)
				if err != nil {
					t.Fatal(err)
				}
				result.NegativeControls = append(result.NegativeControls, jacksEndingStudyControl{"continuation-budget-exhausted", "incomplete", o, negative})
			}
		}
	}
	for _, control := range result.NegativeControls {
		if control.Evaluation.Status != control.ExpectedStatus {
			t.Fatalf("negative control %s: %s", control.ID, control.Evaluation.Status)
		}
	}
	raw, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(outputPath, append(raw, '\n'), 0600); err != nil {
		t.Fatal(err)
	}
}
