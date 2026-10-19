package records

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestRealtimeProjectionRefreshesCurrentCompatibility(t *testing.T) {
	s, other, ctx, owner, game := realtimeFixture(t)
	original, err := s.ReadRealtimeProjection(ctx, owner, game)
	if err != nil || !original.Disposition.Playable {
		t.Fatal("opening projection unavailable", err)
	}
	codec, err := NewServiceCodec()
	if err != nil {
		t.Fatal(err)
	}
	other.codec = codec
	codec.policies = nil
	check := func(reason string) {
		t.Helper()
		cached, err := other.ReadRealtimeProjection(ctx, owner, game)
		if err != nil || cached.Disposition.Playable || cached.Disposition.Reason != reason {
			t.Fatalf("cached compatibility: %+v %v", cached.Disposition, err)
		}
		captured, err := other.RefreshRealtimeProjection(ctx, owner, original)
		if err != nil || captured.Disposition.Playable || captured.Disposition.Reason != reason {
			t.Fatalf("outbox compatibility: %+v %v", captured.Disposition, err)
		}
		if cached.Revision != original.Revision || captured.Revision != original.Revision || !bytes.Equal(cached.View, original.View) || !bytes.Equal(captured.View, original.View) {
			t.Fatal("compatibility refresh changed the captured game")
		}
	}
	check("unsupported-policy-pin")
	reader := codec.readers[original.Pin]
	reader.readOnly = true
	codec.readers[original.Pin] = reader
	check("historical-reader-only")
	delete(codec.readers, original.Pin)
	if _, err = other.ReadRealtimeProjection(ctx, owner, game); err == nil {
		t.Fatal("cache bypassed an unavailable exact reader")
	}
	if _, err = other.RefreshRealtimeProjection(ctx, owner, original); err == nil {
		t.Fatal("outbox bypassed an unavailable exact reader")
	}
}

func TestRealtimeProjectionLazilyUpgradesPolicyMetadata(t *testing.T) {
	s, _, ctx, owner, game := realtimeFixture(t)
	original, err := s.ReadRealtimeProjection(ctx, owner, game)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(original)
	if err != nil {
		t.Fatal(err)
	}
	var legacy map[string]json.RawMessage
	if err = json.Unmarshal(raw, &legacy); err != nil {
		t.Fatal(err)
	}
	delete(legacy, "policy")
	raw, err = json.Marshal(legacy)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.pool.Exec(ctx, `UPDATE m05_realtime_projections SET projection=$2 WHERE game_id=$1`, game, raw); err != nil {
		t.Fatal(err)
	}
	upgraded, err := s.ReadRealtimeProjection(ctx, owner, game)
	if err != nil || upgraded.Policy.ID == "" || upgraded.Revision != original.Revision {
		t.Fatal("legacy cache did not upgrade at the same revision", err)
	}
	if err = s.pool.QueryRow(ctx, `SELECT projection FROM m05_realtime_projections WHERE game_id=$1`, game).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	stored, err := decodeRealtimeProjection(raw, game, original.Revision)
	if err != nil || stored.Policy.ID == "" {
		t.Fatal("metadata upgrade was not durable", err)
	}
}
