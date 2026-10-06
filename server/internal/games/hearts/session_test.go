package hearts

import (
	"bytes"
	d "cardford/server/internal/legacydecision"
	"encoding/json"
	"strings"
	"testing"
)

func TestNativeSessionImportRetainsTSV2SemanticsAndV1Reader(t *testing.T) {
	config := json.RawMessage(`{"id":"native","mode":"hearts","dealer":0}`)
	old, err := createState(config, d.FullDeck())
	if err != nil {
		t.Fatal(err)
	}
	v := &sessionState{original: old}
	native := sessionPayload(v)
	native.Hands[0] = append([]string{}, native.Hands[0]...)
	native.Hands[0][0], native.Hands[0][1] = native.Hands[0][1], native.Hands[0][0]
	native.Events = []event{}
	raw, err := json.Marshal(native)
	if err != nil {
		t.Fatal(err)
	}
	opened, err := OpenSession(raw)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := opened.SerializePrivate()
	if err != nil || !bytes.Equal(raw, encoded) {
		t.Fatal("V2 import sorted or invented historical data")
	}
	if _, err := read(encoded); err == nil {
		t.Fatal("V1 reader silently accepted/repinned V2")
	}
	legacy, err := json.Marshal(old)
	if err != nil {
		t.Fatal(err)
	}
	bound, err := OpenV1Session(legacy)
	if err != nil {
		t.Fatal(err)
	}
	if bound.Pin().ModuleVersion != "2.0.0" || old.ModuleVersion != "1.0.0" {
		t.Fatal("explicit bridge mutated original pin")
	}
	long := native
	long.ID = strings.Repeat("x", 256)
	longRaw, _ := json.Marshal(long)
	longSession, err := OpenSession(longRaw)
	if err != nil {
		t.Fatal("native codec must accept valid maximum identifier before node projection", err)
	}
	if _, err = longSession.Node(); err == nil {
		t.Fatal("derived window must retain original bounded identifier check")
	}
}

func TestHeartsSessionTypedObservationDetachesPolicyData(t *testing.T) {
	s, err := createState(json.RawMessage(`{"id":"typed","mode":"hearts","dealer":0}`), d.FullDeck())
	if err != nil {
		t.Fatal(err)
	}
	passes := [4][]string{}
	for seat := range passes {
		passes[seat] = append([]string{}, s.Hands[seat][:3]...)
	}
	if err = applyPass(s, passes); err != nil {
		t.Fatal(err)
	}
	o := observeSession(&sessionState{original: s}, 0)
	before, _ := json.Marshal(o)
	legacy, err := legacySessionObservation(o)
	if err != nil {
		t.Fatal(err)
	}
	if err = d.ValidateObservation(legacy); err != nil {
		t.Fatal(err)
	}
	legacy.Hand[0] = "SQ"
	legacy.Pass.Outgoing[0] = "H2"
	*legacy.Pass.To = 0
	legacy.Scores[0] = 900
	legacy.Events[0].Message = "mutated"
	*legacy.Turn = 3
	after, _ := json.Marshal(o)
	if !bytes.Equal(before, after) {
		t.Fatal("policy input aliases bound actor observation")
	}
}
