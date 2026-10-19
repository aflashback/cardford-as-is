package trixcollection

import (
	"bytes"
	"encoding/json"
	"testing"

	"cardford/server/internal/games/trix"
)

func TestActorOnlyPacketUnchangedUnderHiddenAllocations(t *testing.T) {
	deck := fixtureDeck(t, [4][]string{{"H7"}, {}, {}, {}})
	twin := append([]string{}, deck...)
	// Swap entire West/East hands, preserving actor, counts and public owner.
	copy(twin[13:26], deck[39:52])
	copy(twin[39:52], deck[13:26])
	for _, variant := range trix.Variants {
		request := "diamonds"
		if variant == "complex-solo" || variant == "complex-partners" {
			request = "complex"
		}
		left := start(t, variant, request, deck)
		right := start(t, variant, request, twin)
		if request == "complex" {
			left = declarations(t, left, map[int]string{})
			right = declarations(t, right, map[int]string{})
		}
		p, err := CurrentPacket(left)
		if err != nil {
			t.Fatal(err)
		}
		q, err := CurrentPacket(right)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(p, q) {
			t.Fatal("actor packet depends on hidden allocation", variant)
		}
		n, _ := left.Node()
		native, err := left.Packet(*n.Seat)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(p, native) {
			t.Fatal("native actor packet altered")
		}
		var packet struct {
			Observation trix.Observation `json:"observation"`
		}
		if err = json.Unmarshal(p, &packet); err != nil {
			t.Fatal(err)
		}
		if packet.Observation.Seat != 0 || packet.Observation.Owner != 0 || len(packet.Observation.Hand) != 13 {
			t.Fatal("wrong actor projection")
		}
		for _, key := range []string{`"hands"`, `"deck"`, `"events"`, `"seed"`, `"fixtureDeals"`} {
			if bytes.Contains(p, []byte(key)) {
				t.Fatal("private data in actor packet", key)
			}
		}
		rules1, _ := RulesDescriptor(left.Pin(), request)
		rules2, _ := RulesDescriptor(right.Pin(), request)
		if rules1 != rules2 {
			t.Fatal("rules contain hidden allocation")
		}
		for seat := 0; seat < 4; seat++ {
			public, err := left.View(seat)
			if err != nil {
				t.Fatal(err)
			}
			if bytes.Contains(public, []byte(`"hands"`)) {
				t.Fatal("public view contains all hands")
			}
		}
	}
}
