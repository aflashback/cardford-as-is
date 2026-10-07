package legacydecision

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"testing"
)

func TestPlatformSamplerMatchesPreservedTypeScriptVectors(t *testing.T) {
	raw, err := os.ReadFile("testdata/platform-sampler.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Version string `json:"version"`
		Vectors []struct {
			Observation Observation `json:"observation"`
			Seed        uint32      `json:"seed"`
			Hands       [4][]string `json:"hands"`
		} `json:"vectors"`
	}
	if err = json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	if fixture.Version != SamplerVersion || len(fixture.Vectors) != 27 {
		t.Fatal("unexpected frozen oracle")
	}
	for i, v := range fixture.Vectors {
		got, err := SampleHands(context.Background(), v.Observation, v.Seed)
		if err != nil {
			t.Fatalf("vector %d: %v", i, err)
		}
		if !reflect.DeepEqual(got, v.Hands) {
			t.Fatalf("vector %d differs from original TypeScript sampler: %v vs %v", i, got, v.Hands)
		}
	}
}

func TestPlatformSamplerRespectsOriginalActorAndConservesCards(t *testing.T) {
	o := bidObservation()
	o.Phase = "play"
	o.Bids = []*int{Ptr(1), Ptr(1), Ptr(1), Ptr(1)}
	o.LegalActions = ActionsFor(o)
	before := append([]string{}, o.Hand...)
	hands, err := SampleHands(context.Background(), o, 1729)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(hands[0], o.Hand) || !reflect.DeepEqual(before, o.Hand) {
		t.Fatal("sampler changed actor information")
	}
	seen := map[string]bool{}
	for seat, hand := range hands {
		if len(hand) != o.HandSizes[seat] {
			t.Fatal("capacity mismatch")
		}
		for _, card := range hand {
			if seen[card] {
				t.Fatal("duplicate sampled card")
			}
			seen[card] = true
		}
	}
	if len(seen) != 52 {
		t.Fatal("lost cards")
	}
	second, err := SampleHands(context.Background(), o, 1729)
	if err != nil || !reflect.DeepEqual(hands, second) {
		t.Fatal("seed replay changed")
	}
	canceled, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err = SampleHands(canceled, o, 1729); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation ignored: %v", err)
	}
	o.HandSizes[1]--
	if _, err = SampleHands(context.Background(), o, 1729); err == nil {
		t.Fatal("inconsistent capacity accepted")
	}
}
