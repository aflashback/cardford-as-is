package trix

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"testing"
)

func completeHands(t *testing.T, hands [4][]string) []string {
	t.Helper()
	used := map[string]bool{}
	for _, h := range hands {
		for _, c := range h {
			if used[c] {
				t.Fatal("duplicate required card", c)
			}
			used[c] = true
		}
	}
	rest := []string{}
	for _, c := range Deck() {
		if !used[c] {
			rest = append(rest, c)
		}
	}
	for seat := 0; seat < 4; seat++ {
		for len(hands[seat]) < 13 {
			hands[seat] = append(hands[seat], rest[0])
			rest = rest[1:]
		}
	}
	out := []string{}
	for _, h := range hands {
		out = append(out, h...)
	}
	return out
}
func twosDeck(t *testing.T, owners [4]int, owner int) []string {
	t.Helper()
	h := [4][]string{}
	for i, c := range twoCards {
		h[owners[i]] = append(h[owners[i]], c)
	}
	h[owner] = append(h[owner], "H7")
	return completeHands(t, h)
}
func modernState(t *testing.T, variant string, deck []string) State {
	t.Helper()
	s, e := New(Config{ID: "two-circuit", Variant: variant, ProfileVersion: announcedTwosProfile}, deck)
	if e != nil {
		t.Fatal(e)
	}
	return s
}

func TestTrixTwosAllHolderAssignmentsAndOpeningOwners(t *testing.T) {
	for _, variant := range []string{"basic-partners", "complex-partners"} {
		for mask := 0; mask < 256; mask++ {
			owners := [4]int{}
			teams := [2]bool{}
			counts := [4]int{}
			for i := range owners {
				owners[i] = (mask >> (i * 2)) & 3
				teams[owners[i]%2] = true
				counts[owners[i]]++
			}
			for owner := 0; owner < 4; owner++ {
				s := modernState(t, variant, twosDeck(t, owners, owner))
				if Observe(s, 0).TwoAnnouncements != nil {
					t.Fatal("announcement before selection")
				}
				s = mustApply(t, s, owner, Action{Kind: "choose-request", Request: "trix"})
				want := teams[0] && teams[1]
				var hidden json.RawMessage
				for turn := 0; turn <= 4; turn++ {
					o := Observe(s, 0)
					a := o.TwoAnnouncements
					if !want {
						if a != nil || s.TwoAnnouncement != nil {
							t.Fatal("single team announced")
						}
					} else if turn < 4 {
						if a == nil || a.Status != "hidden" || a.Counts == nil || *a.Counts != counts || a.Cards != nil {
							t.Fatalf("bad hidden announcement %+v", a)
						}
						raw, _ := json.Marshal(a)
						if bytes.Contains(raw, []byte("cards")) || bytes.Contains(raw, []byte("C2")) {
							t.Fatal("hidden suits leaked")
						}
						if turn == 0 {
							hidden = raw
						}
					} else {
						if a == nil || a.Status != "revealed" || a.Counts != nil || len(a.Cards) != 4 {
							t.Fatal("missing fourth-turn reveal")
						}
						for i, p := range a.Cards {
							if p.Card != twoCards[i] || p.Seat != owners[i] {
								t.Fatal("reveal differs from original holders")
							}
						}
						if s.Turn != owner {
							t.Fatal("reveal did not precede owner second turn")
						}
					}
					if e := validateState(s); e != nil {
						t.Fatal(e)
					}
					if turn < 4 {
						s = mustApply(t, s, s.Turn, Legal(Observe(s, s.Turn))[0])
					}
				}
				if want && bytes.Contains(hidden, []byte("revealed")) {
					t.Fatal("past hidden packet changed")
				}
			}
		}
	}
}

func TestTrixTwosCircuitIncludesPassesAndNormalExtensions(t *testing.T) {
	h := [4][]string{{"H7", "C2"}, {"CJ", "DJ", "HJ", "SJ", "D2"}, {"H2"}, {"S2"}}
	s := modernState(t, "basic-partners", completeHands(t, h))
	s = mustApply(t, s, s.Owner, Action{Kind: "choose-request", Request: "trix"})
	for i := 0; i < 3; i++ {
		legal := Legal(Observe(s, s.Turn))
		if len(legal) != 1 || legal[0].Kind != "layout-pass" {
			t.Fatalf("expected first circuit pass: %+v", legal)
		}
		s = mustApply(t, s, s.Turn, legal[0])
		if Observe(s, 0).TwoAnnouncements.Status != "hidden" {
			t.Fatal("revealed before fourth turn")
		}
	}
	s = mustApply(t, s, 1, Action{Kind: "layout-card", Card: "CJ"})
	if Observe(s, 0).TwoAnnouncements.Status != "revealed" || s.Turn != 0 {
		t.Fatal("passes were not counted")
	}
	h = [4][]string{{"H7", "CJ", "DJ", "HJ", "SJ", "C2"}, {"D2"}, {"CQ", "H2"}, {"C10", "S2"}}
	s = modernState(t, "complex-partners", completeHands(t, h))
	s = mustApply(t, s, 0, Action{Kind: "choose-request", Request: "trix"})
	s = mustApply(t, s, 0, Action{Kind: "layout-card", Card: "CJ"})
	if _, e := Apply(s, 3, Action{Kind: "layout-pass"}); e == nil {
		t.Fatal("pass allowed with legal10")
	}
	s = mustApply(t, s, 3, Action{Kind: "layout-card", Card: "C10"})
	s = mustApply(t, s, 2, Action{Kind: "layout-card", Card: "CQ"})
	if Observe(s, 0).TwoAnnouncements.Status != "hidden" {
		t.Fatal("adjacent cards revealed too early")
	}
}

func TestTrixTwosRevealPersistsAndResets(t *testing.T) {
	s := modernState(t, "basic-partners", twosDeck(t, [4]int{0, 1, 2, 3}, 0))
	s = mustApply(t, s, 0, Action{Kind: "choose-request", Request: "trix"})
	for steps := 0; s.Phase != "round-complete" && steps < 300; steps++ {
		s = mustApply(t, s, s.Turn, Legal(Observe(s, s.Turn))[0])
	}
	if s.Phase != "round-complete" {
		t.Fatal("layout not completed")
	}
	a := Observe(s, 0).TwoAnnouncements
	if a == nil || len(a.Cards) != 4 {
		t.Fatal("played twos lost public original ownership")
	}
	for _, hand := range s.Hands {
		if len(hand) != 0 {
			t.Fatal("twos not played normally")
		}
	}
	sum := 0
	for _, p := range scores(s, s.DealNumber, 0) {
		sum += p.Total
	}
	if sum != 500 {
		t.Fatal("announcement changed score")
	}
	var e error
	s, e = Continue(s)
	if e != nil {
		t.Fatal(e)
	}
	s, e = Supply(s, Deck())
	if e != nil {
		t.Fatal(e)
	}
	if s.TwoAnnouncement != nil || Observe(s, 0).TwoAnnouncements != nil {
		t.Fatal("announcement survived new deal")
	}
	for _, variant := range Variants {
		legacy, e := New(Config{ID: "legacy", Variant: variant}, Deck())
		if e != nil {
			t.Fatal(e)
		}
		legacy = mustApply(t, legacy, legacy.Owner, Action{Kind: "choose-request", Request: "trix"})
		if legacy.TwoAnnouncement != nil {
			t.Fatal("old or solo rules announced")
		}
	}
	for _, request := range []string{"diamonds", "lutoosh", "queens", "king"} {
		n := modernState(t, "basic-partners", Deck())
		n = mustApply(t, n, n.Owner, Action{Kind: "choose-request", Request: request})
		if n.TwoAnnouncement != nil {
			t.Fatal("nonlayout announced")
		}
	}
}

func TestTrixTwosHiddenSuitInvariance(t *testing.T) {
	first := modernState(t, "basic-partners", twosDeck(t, [4]int{1, 3, 2, 2}, 0))
	first = mustApply(t, first, 0, Action{Kind: "choose-request", Request: "trix"})
	second := clone(first)
	// Swap two unseen suits between opponent hands without changing public counts.
	for seat := range second.Hands {
		for i, c := range second.Hands[seat] {
			if c == "C2" {
				second.Hands[seat][i] = "D2"
			} else if c == "D2" {
				second.Hands[seat][i] = "C2"
			}
		}
	}
	second.TwoAnnouncement.Owners[0], second.TwoAnnouncement.Owners[1] = second.TwoAnnouncement.Owners[1], second.TwoAnnouncement.Owners[0]
	if !reflect.DeepEqual(Observe(first, 0), Observe(second, 0)) {
		t.Fatal("unrevealed suit ownership leaked")
	}
}

func TestTrixTwosBoundReloadAndCorruption(t *testing.T) {
	for _, index := range []int{1, 3} {
		r := Installations()[index]
		config, _ := json.Marshal(Config{ID: "bound-twos", Variant: r.Pin.VariantID})
		material, _ := json.Marshal(Chance{Deck: twosDeck(t, [4]int{0, 1, 2, 3}, 0)})
		b, e := r.Start(config, material)
		if e != nil {
			t.Fatal(e)
		}
		tr, e := b.Commit(0, "choose:trix")
		if e != nil {
			t.Fatal(e)
		}
		b = tr.Next
		for turn := 0; turn <= 4; turn++ {
			before, e := b.Presentation(0)
			if e != nil {
				t.Fatal(e)
			}
			raw, events, e := b.Persist(0)
			if e != nil {
				t.Fatal(e)
			}
			b, e = r.OpenStored(raw, events)
			if e != nil {
				t.Fatal(e)
			}
			after, e := b.Presentation(0)
			if e != nil || !bytes.Equal(before, after) {
				t.Fatal("reload changed announcement")
			}
			var h hot
			_ = json.Unmarshal(raw, &h)
			h.State.TwoAnnouncement.Turns = (turn + 1) % 5
			bad, _ := json.Marshal(h)
			if _, e = r.OpenStored(bad, events); e == nil {
				t.Fatal("corrupt reveal boundary accepted")
			}
			h.State.TwoAnnouncement.Turns = turn
			h.State.TwoAnnouncement.Owners[0] = NextSeat(h.State.TwoAnnouncement.Owners[0])
			bad, _ = json.Marshal(h)
			if _, e = r.OpenStored(bad, events); e == nil {
				t.Fatal("corrupt holder accepted")
			}
			doc, _ := b.SerializePrivate()
			b, e = r.Open(doc)
			if e != nil {
				t.Fatal(e)
			}
			if turn < 4 {
				n, _ := b.Node()
				decision, e := b.Prepare(*n.Seat, PolicyID)
				if e != nil {
					t.Fatal(e)
				}
				tr, e = b.Commit(*n.Seat, decision.CandidateID)
				if e != nil {
					t.Fatal(e)
				}
				b = tr.Next
			}
		}
	}
}

func TestTrixLegacyPartnersGoldenBytesAndPinIsolation(t *testing.T) {
	for i, variant := range []string{"basic-partners", "complex-partners"} {
		raw, e := os.ReadFile("testdata/legacy-" + variant + ".json")
		if e != nil {
			t.Fatal(e)
		}
		var golden struct {
			Document     json.RawMessage   `json:"document"`
			Hot          json.RawMessage   `json:"hot"`
			Events       []json.RawMessage `json:"events"`
			View         json.RawMessage   `json:"view"`
			Presentation json.RawMessage   `json:"presentation"`
			Packet       json.RawMessage   `json:"packet"`
			Analysis     json.RawMessage   `json:"analysis"`
		}
		if e = json.Unmarshal(raw, &golden); e != nil {
			t.Fatal(e)
		}
		legacy := Installations()[4+i]
		modern := Installations()[1+i*2]
		b, e := legacy.OpenStored(golden.Hot, golden.Events)
		if e != nil {
			t.Fatal(e)
		}
		checks := map[string]json.RawMessage{}
		checks["document"], _ = b.SerializePrivate()
		checks["hot"], _, _ = b.Persist(0)
		checks["view"], _ = b.View(0)
		checks["presentation"], _ = b.Presentation(0)
		n, _ := b.Node()
		checks["packet"], _ = b.Packet(*n.Seat)
		decision, e := b.Prepare(*n.Seat, PolicyID)
		if e != nil {
			t.Fatal(e)
		}
		checks["analysis"] = decision.Analysis
		want := map[string]json.RawMessage{"document": golden.Document, "hot": golden.Hot, "view": golden.View, "presentation": golden.Presentation, "packet": golden.Packet, "analysis": golden.Analysis}
		for k, got := range checks {
			if !bytes.Equal(got, want[k]) {
				t.Fatalf("legacy%s %s bytes changed", variant, k)
			}
		}
		if b.Pin() != LegacyPin(variant) || !legacy.Historical || modern.Historical {
			t.Fatal("legacy pin routing changed")
		}
		if _, e = modern.OpenStored(golden.Hot, golden.Events); e == nil {
			t.Fatal("current reader accepted legacy profile")
		}
		if _, e = modern.Open(golden.Document); e == nil {
			t.Fatal("current reader accepted old document")
		}
		c, m, e := modern.Bootstrap("new-profile")
		if e != nil {
			t.Fatal(e)
		}
		current, e := modern.Start(c, m)
		if e != nil || current.Pin() != Pin(variant) {
			t.Fatalf("current profile pin mismatch %v", e)
		}
		newdoc, _ := current.SerializePrivate()
		if _, e = legacy.Open(newdoc); e == nil {
			t.Fatal("old reader accepted new document")
		}
		t.Log(fmt.Sprintf("%s retains exact original document/checkpoint/view/presentation/packet/analysis bytes", variant))
	}
}
