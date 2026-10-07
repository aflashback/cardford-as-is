package spades

import (
	"bytes"
	"cardford/server/internal/gamekernel"
	"encoding/json"
	"fmt"
	"reflect"
	"sync"
	"testing"
)

func sessionBytes(t *testing.T, s gamekernel.BoundSession) json.RawMessage {
	t.Helper()
	raw, err := s.SerializePrivate()
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func TestSpadesSessionTransitionImmutableBranches(t *testing.T) {
	source := historyReducerFixture(t, 1)
	bound, err := bindSpadesSession(source)
	if err != nil {
		t.Fatal(err)
	}
	original := sessionBytes(t, bound)
	seat := *source.original.Turn
	// The trust-boundary clone must still detach caller-owned event pointers.
	source.original.Events[1].Message = "caller mutation"
	*source.original.Events[1].Seat = (seat + 1) % 4
	*source.original.Events[1].Bid = 0
	if !bytes.Equal(original, sessionBytes(t, bound)) {
		t.Fatal("binding retained caller-owned history")
	}

	const branches = 14
	results := make([]gamekernel.BoundSession, branches)
	errors := make([]error, branches)
	var workers sync.WaitGroup
	for bid := 0; bid < branches; bid++ {
		workers.Add(1)
		go func(bid int) {
			defer workers.Done()
			transition, e := bound.Commit(seat, fmt.Sprintf("bid:%d", bid))
			results[bid], errors[bid] = transition.Next, e
		}(bid)
	}
	workers.Wait()
	for bid, branch := range results {
		if errors[bid] != nil {
			t.Fatal(errors[bid])
		}
		before := sessionBytes(t, branch)
		var document sessionDocument
		if err = json.Unmarshal(before, &document); err != nil {
			t.Fatal(err)
		}
		last := document.Events[len(document.Events)-1]
		if document.Bids[seat] == nil || *document.Bids[seat] != bid || last.Bid == nil || *last.Bid != bid || len(document.Events) != len(source.original.Events)+1 {
			t.Fatalf("branch %d inherited another branch's event", bid)
		}
		// Advancing a retained branch may not alter its parent or siblings.
		if _, err = branch.Commit(*document.Turn, "bid:13"); err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(before, sessionBytes(t, branch)) {
			t.Fatal("advancing branch changed retained snapshot")
		}
	}
	if !bytes.Equal(original, sessionBytes(t, bound)) {
		t.Fatal("parallel branches changed the source snapshot")
	}
}

func TestSpadesSessionTransitionOutputsDetached(t *testing.T) {
	source := historyReducerFixture(t, 1)
	bound, err := bindSpadesSession(source)
	if err != nil {
		t.Fatal(err)
	}
	transition, err := bound.Commit(*source.original.Turn, "bid:3")
	if err != nil {
		t.Fatal(err)
	}
	bound = transition.Next
	original := sessionBytes(t, bound)
	node, err := bound.Node()
	if err != nil {
		t.Fatal(err)
	}
	seat := *node.Seat
	*node.Seat = (seat + 1) % 4
	encoded := sessionBytes(t, bound)
	encoded[0] = '['
	transition.PrivateEvents[0][0] = '['
	for _, read := range []func(int) (json.RawMessage, error){bound.Packet, bound.View, bound.LegacyObservation} {
		raw, e := read(seat)
		if e != nil {
			t.Fatal(e)
		}
		raw[0] = '['
	}
	hot, events, err := bound.Persist(0)
	if err != nil {
		t.Fatal(err)
	}
	hot[0] = '['
	for _, event := range events {
		event[0] = '['
	}
	if !bytes.Equal(original, sessionBytes(t, bound)) {
		t.Fatal("exported bytes or node alias private transition history")
	}
}

func TestSpadesSessionRejectedTransitionPreservesHistory(t *testing.T) {
	source := historyReducerFixture(t, 1)
	seat := *source.original.Turn
	before := cloneSession(source)
	for _, op := range []gamekernel.Operation[Action]{
		{Kind: "actor", Seat: (seat + 1) % 4, Action: Action{Kind: "bid", Seat: (seat + 1) % 4, Bid: ptr(2)}},
		{Kind: "actor", Seat: seat, Action: Action{Kind: "bid", Seat: seat, Bid: ptr(99)}},
		{Kind: "automatic", TransitionID: "wrong"},
		{Kind: "chance", RequestID: "wrong", Material: json.RawMessage(`{"kind":"deal","deck":[]}`)},
	} {
		if _, _, err := reduceSession(source, op); err == nil {
			t.Fatal("invalid transition accepted")
		}
		if !reflect.DeepEqual(before, source) {
			t.Fatal("rejected operation changed source")
		}
	}
	// Isolate rejection after an event was appended to the proposed next state.
	// This synthetic capacity fixture does not claim to pass untrusted import.
	full := cloneSession(source)
	full.original.Events = make([]Event, 100000, 100004)
	copy(full.original.Events, source.original.Events)
	before = cloneSession(full)
	op := gamekernel.Operation[Action]{Kind: "actor", Seat: seat, Action: Action{Kind: "bid", Seat: seat, Bid: ptr(3)}}
	if _, _, err := reduceSession(full, op); err == nil {
		t.Fatal("event capacity overflow accepted")
	}
	if !reflect.DeepEqual(before, full) {
		t.Fatal("rejected append changed source state or history")
	}
	if !reflect.DeepEqual(full.original.Events[len(full.original.Events):cap(full.original.Events)], make([]Event, 4)) {
		t.Fatal("rejected append wrote through the source slice capacity")
	}
}
