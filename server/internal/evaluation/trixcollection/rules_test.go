package trixcollection

import (
	"encoding/json"
	"strings"
	"testing"

	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/trix"
)

func TestComplexAllDoublesLiteralGlobalTotals(t *testing.T) {
	for _, variant := range []string{"complex-solo", "complex-partners"} {
		b := start(t, variant, "complex", trix.Deck())
		for i := 0; i < 4; i++ {
			n, _ := b.Node()
			raw, err := CurrentPacket(b)
			if err != nil {
				t.Fatal(err)
			}
			var p struct {
				Candidates []gamekernel.PublicCandidate `json:"candidates"`
			}
			if err = json.Unmarshal(raw, &p); err != nil {
				t.Fatal(err)
			}
			b = commit(t, b, *n.Seat, p.Candidates[len(p.Candidates)-1].ID)
		}
		b, _ = complete(t, b)
		out, err := FinishRequest(b)
		if err != nil {
			t.Fatal(err)
		}
		debits, bonuses := 0, 0
		for _, entry := range out.Ledger {
			if entry.Component == "queen" {
				if entry.Delta != -50 {
					t.Fatal("queen did not double")
				}
				debits++
			}
			if entry.Component == "king" {
				if entry.Delta != -150 {
					t.Fatal("king did not double")
				}
				debits++
			}
			if entry.Component == "double-bonus" {
				bonuses++
			}
		}
		if debits != 5 || bonuses+len(out.WithheldBonuses) != 5 {
			t.Fatal("each doubled card must have one debit and bonus disposition")
		}
		withheld := 0
		for _, bonus := range out.WithheldBonuses {
			withheld += bonus.BonusValue
		}
		if totalSum(out) != -500-withheld {
			t.Fatal("literal doubled Complex total disagrees", totalSum(out), withheld)
		}
		if variant == "complex-partners" && (withheld != 0 || totalSum(out) != -500) {
			t.Fatal("Partners bonuses withheld or counted twice")
		}
	}
}

func TestLiteralDoubledScoringAndRouting(t *testing.T) {
	tests := []struct {
		name, variant, request          string
		hands                           [4][]string
		doubles                         map[int]string
		plays                           []trix.Play
		debitCard, component            string
		winner, debit, bonus, bonusSeat int
		bonusTeam, source               string
		withheld                        bool
	}{
		{"solo-withheld-king", "basic-solo", "king", [4][]string{{"H7", "HK"}, {"H4"}, {"H3"}, {"H2"}}, map[int]string{0: "HK"}, []trix.Play{{0, "HK"}, {3, "H2"}, {2, "H3"}, {1, "H4"}}, "HK", "king", 0, -150, 75, 0, "", "", true},
		{"solo-announcer-different-from-capturer", "basic-solo", "queens", [4][]string{{"H7", "C2"}, {"C4"}, {"CA"}, {"CQ"}}, map[int]string{3: "CQ"}, []trix.Play{{0, "C2"}, {3, "CQ"}, {2, "CA"}, {1, "C4"}}, "CQ", "queen", 2, -50, 25, 3, "", "", false},
		{"solo-current-external-leader", "basic-solo", "queens", [4][]string{{"H7", "C2"}, {"C4"}, {"C3"}, {"CQ"}}, map[int]string{3: "CQ"}, []trix.Play{{0, "C2"}, {3, "CQ"}, {2, "C3"}, {1, "C4"}}, "CQ", "queen", 3, -50, 25, 0, "", "deal:1:trick:1", false},
		{"solo-prior-external-leader", "basic-solo", "king", [4][]string{{"H7", "C2", "H2"}, {"C4", "H4"}, {"C3", "H3"}, {"CK", "HK"}}, map[int]string{3: "HK"}, []trix.Play{{0, "C2"}, {3, "CK"}, {2, "C3"}, {1, "C4"}, {3, "HK"}, {2, "H3"}, {1, "H4"}, {0, "H2"}}, "HK", "king", 3, -150, 75, 0, "", "deal:1:trick:1", false},
		{"partners-announcer-captures", "basic-partners", "queens", [4][]string{{"H7", "CQ"}, {"C4"}, {"C3"}, {"C2"}}, map[int]string{0: "CQ"}, []trix.Play{{0, "CQ"}, {3, "C2"}, {2, "C3"}, {1, "C4"}}, "CQ", "queen", 0, -50, 25, 0, "EW", "", false},
		{"partners-teammate-captures", "basic-partners", "queens", [4][]string{{"H7", "CQ"}, {"C4"}, {"CA"}, {"C2"}}, map[int]string{0: "CQ"}, []trix.Play{{0, "CQ"}, {3, "C2"}, {2, "CA"}, {1, "C4"}}, "CQ", "queen", 2, -50, 25, 0, "EW", "", false},
		{"partners-doubled-king-own-team", "basic-partners", "king", [4][]string{{"H7", "HK"}, {"H4"}, {"H3"}, {"H2"}}, map[int]string{0: "HK"}, []trix.Play{{0, "HK"}, {3, "H2"}, {2, "H3"}, {1, "H4"}}, "HK", "king", 0, -150, 75, 0, "EW", "", false},
		{"complex-doubled-diamond-queen", "complex-partners", "complex", [4][]string{{"D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "DJ", "DQ", "DK", "DA"}, {"CA"}, {"C3"}, {"H7", "C2"}}, map[int]string{0: "DQ"}, []trix.Play{{3, "C2"}, {2, "C3"}, {1, "CA"}, {0, "DQ"}}, "DQ", "queen", 1, -50, 25, 0, "NS", "", false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			b := declarations(t, start(t, test.variant, test.request, fixtureDeck(t, test.hands)), test.doubles)
			for _, play := range test.plays {
				b = commit(t, b, play.Seat, "play:"+play.Card)
			}
			o, err := publicObservation(b)
			if err != nil {
				t.Fatal(err)
			}
			if o.Phase != "playing" {
				t.Fatal("penalty capture ended before thirteen tricks")
			}
			debits, bonuses := 0, 0
			for _, entry := range o.Ledger {
				if entry.Card != test.debitCard {
					continue
				}
				if entry.Component == test.component {
					debits++
					if entry.Delta != test.debit || entry.Recipient.Seat == nil || *entry.Recipient.Seat != test.winner {
						t.Fatalf("wrong literal doubled debit: %+v", entry)
					}
				}
				if entry.Component == "double-bonus" {
					bonuses++
					if entry.Delta != test.bonus || entry.LeadSourceRef != test.source {
						t.Fatalf("wrong bonus/provenance: %+v", entry)
					}
					if test.bonusTeam != "" {
						if entry.Recipient.Kind != "competitor" || entry.Recipient.Competitor != test.bonusTeam {
							t.Fatal("wrong direct team bonus", entry)
						}
					} else if entry.Recipient.Kind != "seat" || entry.Recipient.Seat == nil || *entry.Recipient.Seat != test.bonusSeat {
						t.Fatal("wrong Solo bonus recipient", entry)
					}
				}
			}
			if debits != 1 || bonuses != 1 && !test.withheld || test.withheld && bonuses != 0 {
				t.Fatal("debit/bonus must occur once", debits, bonuses)
			}
			if test.withheld && (len(o.WithheldBonuses) != 1 || o.WithheldBonuses[0].BonusValue != 75 || o.WithheldBonuses[0].Reason != "no_previous_external_leader") {
				t.Fatal("Solo withheld bonus missing")
			}
			if test.name == "complex-doubled-diamond-queen" {
				debit := 0
				bonus := 0
				for _, entry := range o.Ledger {
					if entry.Recipient.Kind == "seat" && entry.Recipient.Seat != nil && *entry.Recipient.Seat == test.winner {
						debit += entry.Delta
					}
					if entry.Component == "double-bonus" {
						bonus += entry.Delta
					}
				}
				// DQ is the sole penalty card: −10 diamond, −15 trick, −50 queen.
				if debit != -75 || bonus != 25 {
					t.Fatal("Complex components omitted or double counted", debit, bonus)
				}
				dq := 0
				for _, entry := range o.Ledger {
					if entry.Card == "DQ" || entry.Component == "trick" {
						if entry.Delta < 0 {
							dq += entry.Delta
						}
					}
				}
				if dq != -75 {
					t.Fatal("doubled DQ did not debit −75 with its trick", dq)
				}
			}
			b, _ = complete(t, b)
			out, err := FinishRequest(b)
			if err != nil {
				t.Fatal(err)
			}
			want := map[string]int{"king": -75, "queens": -100, "complex": -500}[test.request]
			if test.withheld {
				want -= 75
			}
			if totalSum(out) != want {
				t.Fatal("literal request global total", totalSum(out), want)
			}
			for _, score := range out.ScoreTotals {
				sum := 0
				for _, value := range out.ComponentTotals[score.ID] {
					sum += value
				}
				if sum != score.Total {
					t.Fatal("bonus counted more than once in components")
				}
			}
		})
	}
}

func TestRulesExactPinObjectivesAndLiteralSemantics(t *testing.T) {
	for _, variant := range trix.Variants {
		request := "queens"
		if strings.HasPrefix(variant, "complex") {
			request = "complex"
		}
		r, err := RulesDescriptor(trix.Pin(variant), request)
		if err != nil {
			t.Fatal(err)
		}
		want := "own-request-points"
		if strings.HasSuffix(variant, "partners") {
			want = "combined-team-request-points"
		}
		if r.Objective != want || !strings.Contains(r.Text, "0=South, 1=West, 2=North, 3=East") || !strings.Contains(r.Text, "−50") || !strings.Contains(r.Text, "+25") || !strings.Contains(r.Text, "thirteen complete tricks") {
			t.Fatal("rules not source-backed")
		}
		if _, err = RulesDescriptor(trix.LegacyPin(variant), request); err == nil {
			t.Fatal("historical rules admitted")
		}
	}
	if proof := Proof(); proof.Verified || proof.Reason == "" {
		t.Fatal("unsupported proof fabricated")
	}
}
