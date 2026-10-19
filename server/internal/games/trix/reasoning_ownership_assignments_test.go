package trix

import (
	"reflect"
	"testing"
)

// Exhaust every possible placement of the four twos at a reachable opening.
// Removing a legal owner, confusing remaining and original counts, or treating
// suppression as an identified team must fail independently of the candidate's
// own enumeration logic. Other cards impose no additional owner constraints on
// an empty board, so hidden-count cardinalities are simple multinomials.
func TestOwnershipAllOpeningAllocationsRetainTrueOwners(t *testing.T) {
	factorial := [...]int{1, 1, 2, 6, 24}
	for code := 0; code < 256; code++ {
		hands := [4][]string{{"H7"}, {}, {}, {}}
		owners, counts := [4]int{}, [4]int{}
		for i, card := range []string{"C2", "D2", "H2", "S2"} {
			seat := (code >> (2 * i)) & 3
			owners[i] = seat
			counts[seat]++
			hands[seat] = append(hands[seat], card)
		}
		s, err := New(Config{ID: "ownership-all-openings", Variant: "basic-partners", ProfileVersion: "1.1.0", LayoutHistoryVersion: "1.0.0"}, reasoningNativeDeck(hands))
		if err != nil {
			t.Fatal(err)
		}
		s, err = Apply(s, s.Turn, Action{Kind: "choose-request", Request: "trix"})
		if err != nil {
			t.Fatal(err)
		}
		for actor := 0; actor < 4; actor++ {
			o := Observe(s, actor)
			e, err := fourTwosOwnership(o)
			if err != nil || !e.Eligible || len(e.Twos) != 4 {
				t.Fatalf("allocation %d actor %d: missing supported evidence %+v, %v", code, actor, e, err)
			}
			want := factorial[4-counts[actor]]
			for seat := 0; seat < 4; seat++ {
				if seat != actor {
					want /= factorial[counts[seat]]
				}
			}
			if o.TwoAnnouncements == nil {
				want = 1
				if counts[actor] == 0 {
					// Partner owns all four, or each two is assigned to either
					// opponent: 1 + 2^4. The actual team is still hidden.
					want = 17
				}
			} else if e.OriginalCountMin != counts || e.OriginalCountMax != counts || e.RemainingCountMin != counts || e.RemainingCountMax != counts {
				t.Fatalf("allocation %d actor %d lost public original counts: %+v", code, actor, e)
			}
			if e.Assignments != want {
				t.Fatalf("allocation %d actor %d: got %d compatible assignments, want %d", code, actor, e.Assignments, want)
			}
			for i, two := range e.Twos {
				originalFound, remainingFound := false, false
				for _, seat := range two.OriginalOwners {
					originalFound = originalFound || seat == owners[i]
				}
				for _, seat := range two.PossibleHolders {
					remainingFound = remainingFound || seat == owners[i]
				}
				if two.Played || !originalFound || !remainingFound || !reflect.DeepEqual(two.OriginalOwners, two.PossibleHolders) {
					t.Fatalf("allocation %d actor %d excluded an actual opening owner or marked a card played: %+v", code, actor, two)
				}
			}
		}
	}
}
