package records

import (
	"bytes"
	"context"
	"encoding/json"
	"sync"
	"testing"

	"cardford/server/internal/gamekernel"
)

func statsFixture(t testing.TB) []byte {
	t.Helper()
	c, err := NewServiceCodec()
	if err != nil {
		t.Fatal(err)
	}
	metadata, err := ServiceMetadata(serviceSelector("spades-partners"), "stats-game", "stats-owner")
	if err != nil {
		t.Fatal(err)
	}
	doc, _, events, err := c.Start(metadata, []byte(`{"id":"stats-game","dealer":0}`), codecDeck())
	if err != nil {
		t.Fatal(err)
	}
	snap, _, err := c.Open(doc, events)
	if err != nil {
		t.Fatal(err)
	}
	prepared, err := c.PrepareDecision(context.Background(), doc, snap, 1, "stats-decision")
	if err != nil {
		t.Fatal(err)
	}
	binding, err := c.PreparationInput(doc, snap, 1)
	if err != nil {
		t.Fatal(err)
	}
	d := DecisionRecord{RecordVersion: RecordVersion, ID: "stats-decision", OwnerID: metadata.OwnerID, GameID: metadata.GameID, Revision: doc.Revision, Actor: 1, WindowID: binding.WindowID, Purpose: "human-analysis", PacketVersion: binding.PacketVersion, InputDigest: binding.InputDigest, Policy: metadata.Policy, SelectedCandidateID: prepared.Prepared.CandidateID, AnalysisSchema: prepared.AnalysisSchema, Analysis: prepared.Analysis, AdviceSchema: prepared.AdviceSchema, Advice: prepared.Advice, Access: AccessAdmission{OwnerID: metadata.OwnerID, Generation: 1, ControlRevision: 1, GrantID: "stats-grant", UnitID: "hand-1"}, ReceiptID: "stats-receipt", AttemptID: "stats-attempt", AttemptFence: 1}
	// Only the stats extraction is tested here; original authority/source checks
	// stay in the store. Reuse a complete real frozen original analysis.
	d.Actor = 0
	raw, err := json.Marshal(d)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func TestStatsCacheExactBytesErrorsOwnershipAndEviction(t *testing.T) {
	raw := statsFixture(t)
	c := statsDecisionCache{maxBytes: len(raw) * 2, maxEntries: 2}
	first, err := c.decode(raw)
	if err != nil || first.actor != 0 || !first.unforced {
		t.Fatal(first, err)
	}
	saved := bytes.Clone(raw)
	raw[0] = '!'
	if _, err = c.decode(raw); err == nil {
		t.Fatal("changed malformed bytes reused cached validation")
	}
	if actual, err := c.decode(saved); err != nil || actual != first {
		t.Fatal("caller mutation changed cache", actual, err)
	}
	d, _ := DecodeDecision(saved)
	var original OriginalAnalysisEnvelope
	if err = gamekernel.DecodeSessionJSON(d.Analysis, &original); err != nil {
		t.Fatal(err)
	}
	original.Original.Candidates = original.Original.Candidates[:1]
	d.Analysis, _ = json.Marshal(original)
	changed, _ := json.Marshal(d)
	second, err := c.decode(changed)
	if err != nil || second.unforced {
		t.Fatal("same identity changed bytes reused old candidate count", second, err)
	}
	for i := 0; i < 10; i++ {
		d.Revision = int64(i + 1)
		item, _ := json.Marshal(d)
		if _, err = c.decode(item); err != nil {
			t.Fatal(err)
		}
		if c.bytes > c.maxBytes || len(c.entries) > c.maxEntries {
			t.Fatal("cache exceeded bounds")
		}
	}
	tooSmall := statsDecisionCache{maxBytes: 1, maxEntries: 1}
	if _, err = tooSmall.decode(saved); err != nil || len(tooSmall.entries) != 0 {
		t.Fatal("oversize record retained", err)
	}
}

func TestStatsCacheConcurrentReaders(t *testing.T) {
	raw := statsFixture(t)
	c := statsDecisionCache{}
	var workers sync.WaitGroup
	for i := 0; i < 12; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for n := 0; n < 20; n++ {
				if got, err := c.decode(raw); err != nil || !got.unforced {
					t.Errorf("decode %v %v", got, err)
					return
				}
			}
		}()
	}
	workers.Wait()
}

func BenchmarkStatsDecisionExtraction(b *testing.B) {
	raw := statsFixture(b)
	b.Run("decode-each-read", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			if _, err := decodeStatsDecision(raw); err != nil {
				b.Fatal(err)
			}
		}
	})
	b.Run("bounded-exact-byte-cache", func(b *testing.B) {
		var c statsDecisionCache
		if _, err := c.decode(raw); err != nil {
			b.Fatal(err)
		}
		b.ReportAllocs()
		b.ResetTimer()
		for i := 0; i < b.N; i++ {
			if _, err := c.decode(raw); err != nil {
				b.Fatal(err)
			}
		}
	})
}
