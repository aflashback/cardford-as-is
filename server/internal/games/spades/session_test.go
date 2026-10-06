package spades

import (
	"bytes"
	d "cardford/server/internal/legacydecision"
	"encoding/json"
	"strings"
	"testing"
)

func TestSpadesNativeUnicodeImportAndFrozenV1Length(t *testing.T) {
	s, err := createState(json.RawMessage(`{"id":"unicode","mode":"spades-solo","dealer":0}`), d.FullDeck())
	if err != nil {
		t.Fatal(err)
	}
	s.ID = strings.Repeat("😀", 200)
	s.Events[0].Message = strings.Repeat("😀", 1500)
	legacy, err := json.Marshal(s)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = DecodeState(legacy); err == nil {
		t.Fatal("frozen V1 UTF16 import changed")
	}
	raw, err := json.Marshal(sessionPayload(&sessionState{original: s}))
	if err != nil {
		t.Fatal(err)
	}
	native, err := OpenSession("solo", raw)
	if err != nil {
		t.Fatal("native schema counts Unicode codepoints", err)
	}
	exported, err := native.SerializePrivate()
	if err != nil || !bytes.Equal(raw, exported) {
		t.Fatal("native import changed Unicode values")
	}
	config, _ := json.Marshal(sessionConfig{ID: s.ID, Dealer: 0})
	material, _ := json.Marshal(sessionDeal{Kind: "deal", Deck: d.FullDeck()})
	if _, err = StartSession("solo", config, material); err == nil {
		t.Fatal("configuration must retain kernel UTF16 identifier rule")
	}
}

func TestSpadesSessionTypedObservationDetachesPolicyData(t *testing.T) {
	s, err := createState(json.RawMessage(`{"id":"typed","mode":"spades-partners","dealer":0}`), d.FullDeck())
	if err != nil {
		t.Fatal(err)
	}
	if err = applyAction(s, Action{Kind: "bid", Seat: 1, Bid: ptr(3)}); err != nil {
		t.Fatal(err)
	}
	o := observeSession(&sessionState{original: s}, 2)
	before, _ := json.Marshal(o)
	legacy, err := legacySessionObservation(o)
	if err != nil {
		t.Fatal(err)
	}
	if err = d.ValidateObservation(legacy); err != nil {
		t.Fatal(err)
	}
	legacy.Hand[0] = "SQ"
	*legacy.Bids[1] = 13
	legacy.Scores[0] = 900
	legacy.Events[0].Message = "mutated"
	*legacy.Events[1].Bid = 12
	*legacy.Turn = 0
	after, _ := json.Marshal(o)
	if !bytes.Equal(before, after) {
		t.Fatal("policy input aliases bound actor observation")
	}
}
