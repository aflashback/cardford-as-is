package trix

import (
	"bytes"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/sessions"
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"testing"
)

func mustNew(t *testing.T, variant string) State {
	t.Helper()
	s, e := New(Config{ID: "trix-test", Variant: variant}, Deck())
	if e != nil {
		t.Fatal(e)
	}
	return s
}
func shuffledTestDeck(seed int) []string {
	d := Deck()
	x := uint32(seed)
	for i := 51; i > 0; i-- {
		x = x*1664525 + 1013904223
		j := int(x % uint32(i+1))
		d[i], d[j] = d[j], d[i]
	}
	return d
}
func mustApply(t *testing.T, s State, seat int, a Action) State {
	t.Helper()
	n, e := Apply(s, seat, a)
	if e != nil {
		t.Fatal(e)
	}
	return n
}
func TestTrixFullSessions(t *testing.T) {
	for _, v := range Variants {
		t.Run(v, func(t *testing.T) {
			s := mustNew(t, v)
			seen := map[int]map[string]bool{}
			owners := map[int]int{}
			moves := 0
			rounds := 0
			for s.Phase != "session-complete" {
				moves++
				if moves > 4000 {
					t.Fatal("session did not terminate")
				}
				if e := validateState(s); e != nil {
					t.Fatalf("deal %d phase %s: %v", s.DealNumber, s.Phase, e)
				}
				switch s.Phase {
				case "round-complete":
					rounds++
					if s.Request == "trix" {
						if len(s.FinishOrder) != 4 {
							t.Fatal("layout did not finish every seat")
						}
						total := 0
						for _, v := range scores(s, s.DealNumber, 0) {
							total += v.Total
						}
						if total != 500 {
							t.Fatalf("layout total %d", total)
						}
					} else if len(s.Tricks) != 13 {
						t.Fatal("penalty request stopped before 13 tricks")
					}
					var e error
					s, e = Continue(s)
					if e != nil {
						t.Fatal(e)
					}
				case "chance":
					var e error
					s, e = Supply(s, shuffledTestDeck(s.DealNumber*991))
					if e != nil {
						t.Fatal(e)
					}
					if len(s.Tricks) != 0 || s.LastExternalLeader != [4]*LeadSource{} {
						t.Fatal("deal clues not reset")
					}
				default:
					o := Observe(s, s.Turn)
					a, e := Decide(o)
					if e != nil {
						t.Fatal(e)
					}
					if a.Kind == "choose-request" {
						if seen[s.Kingdom] == nil {
							seen[s.Kingdom] = map[string]bool{}
							owners[s.Kingdom] = s.Owner
						}
						if seen[s.Kingdom][a.Request] {
							t.Fatal("request repeated")
						}
						seen[s.Kingdom][a.Request] = true
					}
					s = mustApply(t, s, s.Turn, a)
				}
			}
			want := 4 * len(requests(v))
			if rounds != want || s.DealNumber != want {
				t.Fatalf("got %d rounds/deal %d want %d", rounds, s.DealNumber, want)
			}
			for k := 1; k <= 4; k++ {
				if len(seen[k]) != len(requests(v)) {
					t.Fatal("incomplete kingdom")
				}
				if k > 1 && owners[k] != NextSeat(owners[k-1]) {
					t.Fatal("wrong owner direction")
				}
			}
			sum := 0
			for _, v := range scores(s, 0, 0) {
				sum += v.Total
			}
			withheld := 0
			for _, w := range s.WithheldBonuses {
				withheld += w.BonusValue
			}
			if partners(v) && sum != 0 || !partners(v) && sum != -withheld {
				t.Fatalf("score conservation sum=%d withheld=%d", sum, withheld)
			}
			if len(Observe(s, 0).Winners) == 0 {
				t.Fatal("missing winners")
			}
			t.Logf("%d requests, %d actions, totals %+v, withheld %d", rounds, moves, scores(s, 0, 0), withheld)
		})
	}
}
func TestTrixDoubleRecipientsExhaustive(t *testing.T) {
	for _, variant := range []string{"basic-solo", "basic-partners"} {
		for announcer := 0; announcer < 4; announcer++ {
			for taker := 0; taker < 4; taker++ {
				for leader := 0; leader < 4; leader++ {
					for _, card := range []string{"CQ", "HK"} {
						s := mustNew(t, variant)
						value, request := 25, "queens"
						if card == "HK" {
							value = 75
							request = "king"
						}
						s.Request = request
						s.Declarations = []Declaration{{Seat: announcer, Cards: []string{card}, Ref: "declaration-1"}}
						s.LastExternalLeader[taker] = &LeadSource{Seat: NextSeat(taker), Trick: 1}
						tr := Trick{Number: 2, Leader: leader, Winner: taker, Plays: []Play{{Seat: announcer, Card: card}}}
						if leader != taker {
							s.LastExternalLeader[taker] = &LeadSource{Seat: leader, Trick: 2}
						}
						scoreTrick(&s, tr)
						if len(s.Ledger) != 2 || s.Ledger[0].Delta != -2*value || s.Ledger[1].Delta != value {
							t.Fatalf("wrong double arithmetic %+v", s.Ledger)
						}
						bonus := s.Ledger[1].Recipient
						if partners(variant) {
							if bonus.Kind != "competitor" || bonus.Competitor != teamID(NextSeat(taker)) || bonus.Seat != nil {
								t.Fatal("partner bonus incorrectly assigned")
							}
						} else {
							want := announcer
							if announcer == taker {
								want = leader
								if leader == taker {
									want = NextSeat(taker)
								}
							}
							if bonus.Seat == nil || *bonus.Seat != want {
								t.Fatalf("announcer%d taker%d leader%d got%+v", announcer, taker, leader, bonus)
							}
						}
					}
				}
			}
		}
	}
}
func TestTrixComplexStacksAndWithholding(t *testing.T) {
	for _, v := range []string{"complex-solo", "complex-partners"} {
		s := mustNew(t, v)
		s.Request = "complex"
		s.Declarations = []Declaration{{Seat: 0, Cards: []string{"DQ"}, Ref: "q"}, {Seat: 3, Cards: []string{"HK"}, Ref: "k"}}
		tr := Trick{Number: 1, Leader: 0, Winner: 0, Plays: []Play{{0, "DQ"}, {3, "HK"}, {2, "C2"}, {1, "S2"}}}
		scoreTrick(&s, tr)
		total := scores(s, 0, 0)
		if partners(v) {
			if total[0].Total != -225 || total[1].Total != 100 {
				t.Fatal(total)
			}
		} else {
			if total[0].Total != -225 || total[3].Total != 75 || len(s.WithheldBonuses) != 1 || s.WithheldBonuses[0].BonusValue != 25 {
				t.Fatalf("%+v %+v", total, s.WithheldBonuses)
			}
		}
	}
	s := mustNew(t, "complex-solo")
	s.Request = "complex"
	s.Declarations = []Declaration{{Seat: 0, Cards: []string{"HK"}, Ref: "k"}}
	scoreTrick(&s, Trick{Number: 1, Leader: 0, Winner: 0, Plays: []Play{{0, "HK"}, {3, "H2"}, {2, "H3"}, {1, "H4"}}})
	if scores(s, 0, 0)[0].Total != -165 || s.WithheldBonuses[0].BonusValue != 75 {
		t.Fatal("king opening withholding incorrect")
	}
}
func TestTrixLegalityAndImmutability(t *testing.T) {
	s := mustNew(t, "basic-solo")
	before, _ := json.Marshal(s)
	if _, e := Apply(s, NextSeat(s.Owner), Action{Kind: "choose-request", Request: "trix"}); e == nil {
		t.Fatal("wrong actor accepted")
	}
	after, _ := json.Marshal(s)
	if !bytes.Equal(before, after) {
		t.Fatal("rejection mutated source")
	}
	_ = mustApply(t, s, s.Owner, Action{Kind: "choose-request", Request: "diamonds"})
	after, _ = json.Marshal(s)
	if !bytes.Equal(before, after) {
		t.Fatal("source mutated")
	}
	layout := mustNew(t, "basic-solo")
	layout = mustApply(t, layout, layout.Owner, Action{Kind: "choose-request", Request: "trix"})
	if _, e := Apply(layout, layout.Turn, Action{Kind: "layout-pass"}); e == nil {
		t.Fatal("pass despite held jack")
	}
	if _, e := Apply(layout, layout.Turn, Action{Kind: "layout-card", Card: "HA"}); e == nil {
		t.Fatal("nonadjacent layout accepted")
	}
}
func TestTrixAllThirtyTwoDoubleSubsets(t *testing.T) {
	s := mustNew(t, "complex-solo")
	s.Phase = "declare-doubles"
	s.Request = "complex"
	s.Turn = 0
	s.Hands[0] = []string{"CQ", "DQ", "HQ", "HK", "SQ"}
	a := Legal(Observe(s, 0))
	if len(a) != 32 {
		t.Fatalf("got %d subsets", len(a))
	}
	if _, e := Apply(s, 0, Action{Kind: "declare-doubles", Cards: []string{"CQ", "CQ"}}); e == nil {
		t.Fatal("duplicate accepted")
	}
	if _, e := Apply(s, 0, Action{Kind: "declare-doubles", Cards: []string{"CA"}}); e == nil {
		t.Fatal("noneligible accepted")
	}
	if _, e := Apply(s, 0, Action{Kind: "declare-doubles", Cards: []string{"SQ", "CQ"}}); e == nil {
		t.Fatal("noncanonical declaration accepted")
	}
}
func TestTrixHiddenWorldInvariance(t *testing.T) {
	s := mustNew(t, "complex-partners")
	s.Turn = 0
	other := clone(s)
	other.Hands[1], other.Hands[3] = other.Hands[3], other.Hands[1]
	o, p := Observe(s, 0), Observe(other, 0)
	if !reflect.DeepEqual(o, p) {
		t.Fatal("hidden hands changed observation")
	}
	a, x, e := analyze(o, PolicyID)
	if e != nil {
		t.Fatal(e)
	}
	b, y, e := analyze(p, PolicyID)
	if e != nil || a != b || !bytes.Equal(x, y) {
		t.Fatal("hidden hands changed analysis")
	}
	o.Hand[0] = "XX"
	if s.Hands[0][0] == "XX" {
		t.Fatal("observation aliased state")
	}
	if len(o.Tricks) > 0 {
		o.Tricks[0].Plays[0].Card = "XX"
	}
}
func TestTrixSavedLeadAndReplay(t *testing.T) {
	r := Installations()[2]
	config, _ := json.Marshal(Config{ID: "saved-lead", Variant: "complex-solo"})
	chance, _ := json.Marshal(Chance{Deck: shuffledTestDeck(912)})
	session, e := r.Start(config, chance)
	if e != nil {
		t.Fatal(e)
	}
	for steps := 0; steps < 65; steps++ {
		n, _ := session.Node()
		if n.Kind != "actor" {
			break
		}
		var packet struct {
			Observation Observation `json:"observation"`
		}
		raw, e := session.Packet(*n.Seat)
		if e != nil {
			t.Fatal(e)
		}
		_ = json.Unmarshal(raw, &packet)
		a, _ := Decide(packet.Observation)
		if packet.Observation.Phase == "choose-request" {
			a = Action{Kind: "choose-request", Request: "complex"}
		}
		if packet.Observation.Phase == "declare-doubles" {
			legal := Legal(packet.Observation)
			a = legal[len(legal)-1]
		}
		next, e := session.Commit(*n.Seat, ActionID(a))
		if e != nil {
			t.Fatal(e)
		}
		session = next.Next
		if steps == 13 || steps == 29 || steps == 56 {
			hot, events, e := session.Persist(0)
			if e != nil {
				t.Fatal(e)
			}
			restored, e := r.OpenStored(hot, events)
			if e != nil {
				t.Fatal(e)
			}
			before, _ := session.View(0)
			after, _ := restored.View(0)
			if !bytes.Equal(before, after) {
				t.Fatal("resume changed public provenance")
			}
			doc, _ := session.SerializePrivate()
			opened, e := r.Open(doc)
			if e != nil {
				t.Fatal(e)
			}
			again, _ := opened.View(0)
			if !bytes.Equal(before, again) {
				t.Fatal("document replay changed observation")
			}
			events[0] = append(json.RawMessage{}, events[0]...)
			events[0][0] = '['
			if _, e := r.OpenStored(hot, events); e == nil {
				t.Fatal("corrupt history accepted")
			}
			session = restored
		}
	}
}
func TestTrixBoundSessionsAndPreparation(t *testing.T) {
	registry, e := sessions.NewRegistryWithRegistrations(Handlers(sessions.DefaultHandlers()), Installations()...)
	if e != nil {
		t.Fatal(e)
	}
	_ = registry
	for _, r := range Installations() {
		t.Run(r.Mode, func(t *testing.T) {
			config, _ := json.Marshal(Config{ID: r.Mode, Variant: r.Pin.VariantID})
			material, _ := json.Marshal(Chance{Deck: shuffledTestDeck(102)})
			b, e := r.Start(config, material)
			if e != nil {
				t.Fatal(e)
			}
			rounds := 0
			prepared := map[string]bool{}
			for steps := 0; steps < 4000; steps++ {
				n, e := b.Node()
				if e != nil {
					t.Fatal(e)
				}
				if n.Kind == "session-complete" {
					break
				}
				var tr gamekernel.BoundTransition
				switch n.Kind {
				case "actor":
					raw, e := b.Packet(*n.Seat)
					if e != nil {
						t.Fatal(e)
					}
					var packet struct {
						Observation Observation `json:"observation"`
					}
					_ = json.Unmarshal(raw, &packet)
					a, e := Decide(packet.Observation)
					if e != nil {
						t.Fatal(e)
					}
					if !prepared[n.Phase] {
						prepared[n.Phase] = true
						complete, e := b.PrepareComplete(context.Background(), *n.Seat, PolicyID, fmt.Sprintf("decision-%d", steps))
						if e != nil {
							t.Fatal(e)
						}
						if complete.Prepared.CandidateID != ActionID(a) {
							t.Fatal("bot/preparation parity")
						}
						var advice Advice
						if e = json.Unmarshal(complete.Advice.Bytes, &advice); e != nil || advice.RecommendedCandidateID != ActionID(a) {
							t.Fatal("advice mismatch")
						}
					}
					tr, e = b.Commit(*n.Seat, ActionID(a))
				case "round-complete":
					rounds++
					tr, e = b.ContinueRound()
				case "chance":
					material, _ := json.Marshal(Chance{Deck: shuffledTestDeck(1000 + rounds)})
					tr, e = b.SupplyChance(n.RequestID, material)
				default:
					t.Fatal(n)
				}
				if e != nil {
					t.Fatal(e)
				}
				b = tr.Next
			}
			if rounds != 4*len(requests(r.Pin.VariantID)) {
				t.Fatalf("completed %d requests", rounds)
			}
			if _, e := b.Presentation(0); e != nil {
				t.Fatal(e)
			}
			hot, events, e := b.Persist(0)
			if e != nil {
				t.Fatal(e)
			}
			restored, e := r.OpenStored(hot, events)
			if e != nil {
				t.Fatal(e)
			}
			view, _ := b.View(0)
			other, _ := restored.View(0)
			if !bytes.Equal(view, other) {
				t.Fatal("full session replay diverged")
			}
			t.Logf("%d requests, %d events, %d checkpoint bytes", rounds, len(events), len(hot))
		})
	}
}

func TestTrixFixtureSequencePrivateAndRestartable(t *testing.T) {
	r := Installations()[2]
	deals := [][]string{}
	for i := 0; i < 8; i++ {
		deals = append(deals, shuffledTestDeck(i+10))
	}
	c := Config{ID: "fixture-private", Variant: "complex-solo", FixtureID: "private-fixture-name", FixtureDeals: deals}
	config, _ := json.Marshal(c)
	material, _ := json.Marshal(Chance{Deck: deals[0]})
	b, e := r.Start(config, material)
	if e != nil {
		t.Fatal(e)
	}
	for {
		n, _ := b.Node()
		if n.Kind == "round-complete" {
			tr, e := b.ContinueRound()
			if e != nil {
				t.Fatal(e)
			}
			b = tr.Next
			break
		}
		var p struct {
			Observation Observation `json:"observation"`
		}
		raw, e := b.Packet(*n.Seat)
		if e != nil {
			t.Fatal(e)
		}
		if bytes.Contains(raw, []byte(c.FixtureID)) || bytes.Contains(raw, []byte("fixtureDeals")) {
			t.Fatal("private fixture leaked")
		}
		_ = json.Unmarshal(raw, &p)
		a, _ := Decide(p.Observation)
		tr, e := b.Commit(*n.Seat, ActionID(a))
		if e != nil {
			t.Fatal(e)
		}
		b = tr.Next
	}
	hot, events, e := b.Persist(0)
	if e != nil {
		t.Fatal(e)
	}
	b, e = r.OpenStored(hot, events)
	if e != nil {
		t.Fatal(e)
	}
	n, _ := b.Node()
	m, e := r.NextChance(n)
	if e != nil {
		t.Fatal(e)
	}
	var chance Chance
	_ = json.Unmarshal(m, &chance)
	if !reflect.DeepEqual(chance.Deck, deals[1]) {
		t.Fatal("restart lost fixture sequence")
	}
	tr, e := b.SupplyChance(n.RequestID, m)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = tr.Next.Presentation(0); e != nil {
		t.Fatal(e)
	}
	wrong, _ := json.Marshal(Chance{Deck: deals[2]})
	if _, e = b.SupplyChance(n.RequestID, wrong); e == nil {
		t.Fatal("out-of-order fixture accepted")
	}
	c.FixtureDeals[2][0] = c.FixtureDeals[2][1]
	if _, e = New(c, deals[0]); e == nil {
		t.Fatal("invalid future fixture deck accepted")
	}
}

func TestTrixHotSemanticCorruption(t *testing.T) {
	s := mustNew(t, "basic-solo")
	cases := []func(*State){func(s *State) { s.Board[0].Suit = "X" }, func(s *State) { s.Phase = "layout" }, func(s *State) { s.RemainingRequests = append(s.RemainingRequests, "diamonds") }, func(s *State) { s.LastExternalLeader[0] = &LeadSource{Seat: 1, Trick: 1} }, func(s *State) { s.Tricks = []Trick{{Plays: []Play{{Card: ""}}}} }}
	for i, damage := range cases {
		bad := clone(s)
		damage(&bad)
		if e := validateState(bad); e == nil {
			t.Fatalf("corruption %d accepted", i)
		}
	}
}

func TestTrixEarlierGiverBonusSurvivesRestart(t *testing.T) {
	hands := [4][]string{{"H7", "C2", "D4"}, {"C4", "D3"}, {"C3", "D2"}, {"C10", "DQ"}}
	used := map[string]bool{}
	for _, h := range hands {
		for _, c := range h {
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
	deck := []string{}
	for _, h := range hands {
		deck = append(deck, h...)
	}
	r := Installations()[0]
	c, _ := json.Marshal(Config{ID: "giver-restart", Variant: "basic-solo"})
	m, _ := json.Marshal(Chance{Deck: deck})
	b, e := r.Start(c, m)
	if e != nil {
		t.Fatal(e)
	}
	commit := func(seat int, id string) {
		t.Helper()
		tr, err := b.Commit(seat, id)
		if err != nil {
			t.Fatalf("%s: %v", id, err)
		}
		b = tr.Next
	}
	commit(0, "choose:queens")
	commit(0, "doubles:")
	commit(3, "doubles:DQ")
	commit(2, "doubles:")
	commit(1, "doubles:")
	commit(0, "play:C2")
	commit(3, "play:C10")
	commit(2, "play:C3")
	commit(1, "play:C4")
	hot, events, e := b.Persist(0)
	if e != nil {
		t.Fatal(e)
	}
	b, e = r.OpenStored(hot, events)
	if e != nil {
		t.Fatal(e)
	}
	commit(3, "play:DQ")
	commit(2, "play:D2")
	commit(1, "play:D3")
	commit(0, "play:D4")
	raw, e := b.Presentation(0)
	if e != nil {
		t.Fatal(e)
	}
	var p struct {
		Observation Observation `json:"observation"`
	}
	_ = json.Unmarshal(raw, &p)
	if len(p.Observation.Ledger) != 2 {
		t.Fatalf("unexpected ledger %+v", p.Observation.Ledger)
	}
	debit, bonus := p.Observation.Ledger[0], p.Observation.Ledger[1]
	if debit.Delta != -50 || *debit.Recipient.Seat != 3 || bonus.Delta != 25 || *bonus.Recipient.Seat != 0 || bonus.LeadSourceRef != "deal:1:trick:1" {
		t.Fatalf("wrong saved giver routing %+v", p.Observation.Ledger)
	}
}

func TestTrixPublicDeclarationAndPassChronology(t *testing.T) {
	s := mustNew(t, "complex-solo")
	s = mustApply(t, s, s.Owner, Action{Kind: "choose-request", Request: "complex"})
	before := Observe(s, 0)
	frozen, _ := json.Marshal(before)
	legal := Legal(Observe(s, s.Turn))
	a := legal[len(legal)-1]
	n := mustApply(t, s, s.Turn, a)
	after := Observe(n, 0)
	if len(after.Declarations) != 1 || !reflect.DeepEqual(after.Declarations[0].Cards, a.Cards) {
		t.Fatal("declaration did not reveal exact selected subset")
	}
	again, _ := json.Marshal(before)
	if !bytes.Equal(frozen, again) {
		t.Fatal("later declaration mutated earlier observation")
	}
	layout := mustNew(t, "basic-solo")
	layout.Phase = "layout"
	layout.Request = "trix"
	layout.Turn = 0
	layout.Hands[0] = []string{"C2"}
	p := mustApply(t, layout, 0, Action{Kind: "layout-pass"})
	if len(p.Passes) != 1 || !reflect.DeepEqual(p.Passes[0].Board, layout.Board) {
		t.Fatal("pass missing exact time-specific frontier")
	}
	p.Board[0].Low = 11
	p.Board[0].High = 11
	if p.Passes[0].Board[0].Low != 0 {
		t.Fatal("pass history aliased later board")
	}
}

func TestTrixTiesAndRejectedMutation(t *testing.T) {
	for _, v := range []string{"basic-solo", "complex-partners"} {
		s := mustNew(t, v)
		s.Phase = "session-complete"
		s.Kingdom = 4
		s.RemainingRequests = []string{}
		if got := len(Observe(s, 0).Winners); got != len(scores(s, 0, 0)) {
			t.Fatalf("ties lost: %d", got)
		}
	}
	s := mustNew(t, "basic-solo")
	before, _ := json.Marshal(s)
	if _, e := Apply(s, s.Owner, Action{Kind: "choose-request", Request: "complex"}); e == nil {
		t.Fatal("foreign request accepted")
	}
	after, _ := json.Marshal(s)
	if !bytes.Equal(before, after) {
		t.Fatal("rejection mutated source")
	}
}

func TestTrixFinalTrickPolicyUsesExactDoubleCredits(t *testing.T) {
	s := mustNew(t, "complex-partners")
	s.Phase = "playing"
	s.Request = "complex"
	s.Turn = 0
	s.Trick = []Play{{3, "D2"}, {2, "DQ"}, {1, "D3"}}
	s.Declarations = []Declaration{{Seat: 2, Cards: []string{"DQ"}, Ref: "dq"}}
	s.Hands[0] = []string{"D4", "DA"}
	o := Observe(s, 0)
	lose := finalTrickValue(o, Action{Kind: "play-card", Card: "D4"})
	take := finalTrickValue(o, Action{Kind: "play-card", Card: "DA"})
	if lose >= 0 || take >= 0 {
		t.Fatalf("teammate double capture incorrectly seen as safe: %.1f %.1f", lose, take)
	}
	if _, e := Decide(o); e != nil {
		t.Fatal(e)
	}
}

func TestTrixPersistedDecoderPreservesStrictBoundary(t *testing.T) {
	for _, raw := range []string{`{"kind":"continue-round","seat":0}`, `{ "seat": 0.0, "kind": "continue-round" }`, `{"kind":"actor","seat":0,"action":{"kind":"declare-doubles"}}`} {
		var c command
		if e := decodePersisted([]byte(raw), &c); e != nil {
			t.Fatalf("valid persisted shape rejected %s: %v", raw, e)
		}
	}
	for _, raw := range []string{`{"kind":"continue-round","seat":0,"seat":1}`, `{"kind":"continue-round","seat":0,"secret":1}`, `{"kind":"continue-round"}`, `{"kind":"continue-round","seat":0,"action":null}`, `{"kind":"\ud800","seat":0}`, `{"kind":"continue-round","Seat":0}`, `{"kind":"actor","seat":0,"action":{"kind":"play-card","card":"CQ","unknown":true}}`} {
		var c command
		if e := decodePersisted([]byte(raw), &c); e == nil {
			t.Fatalf("invalid persisted shape accepted %s", raw)
		}
	}
}
