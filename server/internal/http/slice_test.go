package http_test

import (
	"bytes"
	"cardford/server/internal/compatibility"
	"cardford/server/internal/contracts"
	slice "cardford/server/internal/http"
	"cardford/server/internal/records"
	"context"
	"encoding/json"
	"io"
	"net/http/httptest"
	"os"
	"strconv"
	"sync"
	"testing"
	"time"
)

func fixture(t *testing.T) (records.Row, json.RawMessage) {
	t.Helper()
	b, e := os.ReadFile("../../../web/server/tests/fixtures/legacy-module-document.json")
	if e != nil {
		t.Fatal(e)
	}
	var corpus struct {
		Cases []struct {
			Config   json.RawMessage
			Deal     []string
			Commands []json.RawMessage
		}
	}
	json.Unmarshal(b, &corpus)
	saved := corpus.Cases[2]
	m, _ := compatibility.Registry().Resolve("spades-partners")
	state, e := m.Create(saved.Config, saved.Deal)
	if e != nil {
		t.Fatal(e)
	}
	var config struct{ ID string }
	json.Unmarshal(saved.Config, &config)
	return records.Row{ID: config.ID, Owner: "fixture-owner", Mode: "spades-partners", State: state}, saved.Commands[0]
}

type memoryStore struct {
	mu      sync.Mutex
	row     records.Row
	writes  int
	entered chan struct{}
	release chan struct{}
}

func (s *memoryStore) Load(ctx context.Context, id, owner string) (records.Row, error) {
	if s.entered != nil {
		s.entered <- struct{}{}
		select {
		case <-s.release:
		case <-ctx.Done():
			return records.Row{}, ctx.Err()
		}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.row.ID != id || s.row.Owner != owner {
		return records.Row{}, records.ErrConflict
	}
	return s.row, nil
}
func (s *memoryStore) Publish(ctx context.Context, r records.Row, b json.RawMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if r.Revision != s.row.Revision || r.Owner != s.row.Owner {
		return records.ErrConflict
	}
	s.row.State = bytes.Clone(b)
	s.row.Revision++
	s.writes++
	return nil
}
func request(h *slice.Handler, body []byte, revision int64, ctx context.Context) *httptest.ResponseRecorder {
	r := httptest.NewRequest("POST", "/action", bytes.NewReader(body)).WithContext(ctx)
	r.Header.Set("If-Match", strconv.FormatInt(revision, 10))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}
func action(t *testing.T, command json.RawMessage) ([]byte, int) {
	t.Helper()
	var c struct{ Action map[string]any }
	json.Unmarshal(command, &c)
	seat := int(c.Action["seat"].(float64))
	delete(c.Action, "seat")
	b, _ := json.Marshal(c.Action)
	return b, seat
}
func TestStrictRequestAndCancellation(t *testing.T) {
	row, cmd := fixture(t)
	body, seat := action(t, cmd)
	store := &memoryStore{row: row}
	h, _ := slice.New(store, compatibility.Registry(), slice.Principal{Owner: row.Owner, GameID: row.ID, Seat: seat})
	for _, bad := range [][]byte{[]byte(`{"kind":"bid","bid":1,"hands":[]}`), []byte(`{"kind":"bid","bid":1,"bid":2}`), []byte(`{"kind":"bid","bid":null}`), bytes.Repeat([]byte(" "), 16385)} {
		if w := request(h, bad, 0, context.Background()); w.Code != 400 {
			t.Fatalf("bad action status %d", w.Code)
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if w := request(h, body, 0, ctx); w.Code != 408 {
		t.Fatal(w.Code)
	}
	if store.writes != 0 {
		t.Fatal("invalid request mutated state")
	}
	if w := request(h, body, 0, context.Background()); w.Code != 200 || contracts.Validate("GameView", w.Body.Bytes()) != nil {
		t.Fatalf("valid action: %d %s", w.Code, w.Body.String())
	}
	if w := request(h, body, 0, context.Background()); w.Code != 409 {
		t.Fatal("stale revision accepted")
	}
	if store.writes != 1 {
		t.Fatal("wrong write count")
	}
	denied, _ := slice.New(store, compatibility.Registry(), slice.Principal{Owner: "someone-else", GameID: row.ID, Seat: seat})
	if w := request(denied, body, 1, context.Background()); w.Code != 409 {
		t.Fatal("owner boundary")
	}
}
func TestAdmissionNoQueue(t *testing.T) {
	row, cmd := fixture(t)
	body, seat := action(t, cmd)
	store := &memoryStore{row: row, entered: make(chan struct{}, 2), release: make(chan struct{})}
	h, _ := slice.New(store, compatibility.Registry(), slice.Principal{Owner: row.Owner, GameID: row.ID, Seat: seat})
	done := make(chan int, 2)
	for i := 0; i < 2; i++ {
		go func() { done <- request(h, body, 0, context.Background()).Code }()
	}
	<-store.entered
	<-store.entered
	if w := request(h, body, 0, context.Background()); w.Code != 429 {
		t.Fatal("third request queued")
	}
	close(store.release)
	a, b := <-done, <-done
	if !((a == 200 && b == 409) || (a == 409 && b == 200)) {
		t.Fatalf("parallel publication %d/%d", a, b)
	}
}
func TestPostgresSaveReloadAndRevisionFence(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("requires isolated TEST_DATABASE_URL ending _test")
	}
	ctx := context.Background()
	store, e := records.NewTestStore(ctx, url)
	if e != nil {
		t.Fatal("isolated PostgreSQL unavailable:", e)
	}
	defer func() {
		if e := store.Close(ctx); e != nil {
			t.Error(e)
		}
	}()
	row, cmd := fixture(t)
	if e = store.Insert(ctx, row); e != nil {
		t.Fatal(e)
	}
	loaded, e := store.Load(ctx, row.ID, row.Owner)
	if e != nil || !bytes.Equal(loaded.State, row.State) {
		t.Fatal("saved bytes changed")
	}
	body, seat := action(t, cmd)
	registry := compatibility.Registry()
	h, _ := slice.New(store, registry, slice.Principal{Owner: row.Owner, GameID: row.ID, Seat: seat})
	if w := request(h, body, 0, ctx); w.Code != 200 {
		t.Fatalf("HTTP/PG seam: %d %s", w.Code, w.Body.String())
	}
	loaded, e = store.Load(ctx, row.ID, row.Owner)
	if e != nil || loaded.Revision != 1 {
		t.Fatal("lost accepted revision")
	}
	m, _ := registry.Resolve(row.Mode)
	expected, e := m.Apply(row.State, cmd)
	if e != nil || !bytes.Equal(expected, loaded.State) {
		t.Fatal("saved transition mismatch")
	}
	if e = store.Publish(ctx, row, expected); e != records.ErrConflict {
		t.Fatalf("stale save: %v", e)
	}
	if _, e = store.Load(ctx, row.ID, "stranger"); e != records.ErrConflict {
		t.Fatal("unowned read")
	}
	// Independent competing publishers read the same revision; precisely one wins.
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); results <- store.Publish(ctx, loaded, loaded.State) }()
	}
	wg.Wait()
	close(results)
	accepted, rejected := 0, 0
	for e := range results {
		if e == nil {
			accepted++
		} else if e == records.ErrConflict {
			rejected++
		} else {
			t.Fatal(e)
		}
	}
	if accepted != 1 || rejected != 1 {
		t.Fatal("revision fence failed")
	}
	canceled, cancel := context.WithCancel(ctx)
	cancel()
	if e = store.Publish(canceled, loaded, loaded.State); e == nil {
		t.Fatal("canceled save accepted")
	}
	t.Log("isolated _test DB: exact bytes, strict HTTP transition, owner gate, revision race, cancellation; random schema removed")
}
func TestRejectLiveDatabase(t *testing.T) {
	if _, e := records.NewTestStore(context.Background(), "postgres://localhost/cardford"); e == nil {
		t.Fatal("live database accepted")
	}
}

func TestStoredIdentityBinding(t *testing.T) {
	for _, field := range []string{"id", "mode"} {
		t.Run(field, func(t *testing.T) {
			row, cmd := fixture(t)
			body, seat := action(t, cmd)
			if field == "id" {
				row.ID = "swapped-row"
			} else {
				row.Mode = "spades-solo"
			}
			store := &memoryStore{row: row}
			h, _ := slice.New(store, compatibility.Registry(), slice.Principal{Owner: row.Owner, GameID: row.ID, Seat: seat})
			if w := request(h, body, 0, context.Background()); w.Code != 422 {
				t.Fatalf("identity mismatch accepted: %d", w.Code)
			}
			if store.writes != 0 {
				t.Fatal("mismatched game mutated")
			}
		})
	}
}

func TestCanceledStalledBodyReleasesAdmission(t *testing.T) {
	row, cmd := fixture(t)
	body, seat := action(t, cmd)
	store := &memoryStore{row: row}
	h, _ := slice.New(store, compatibility.Registry(), slice.Principal{Owner: row.Owner, GameID: row.ID, Seat: seat})
	reader, writer := io.Pipe()
	defer reader.Close()
	defer writer.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	r := httptest.NewRequest("POST", "/action", reader).WithContext(ctx)
	r.Header.Set("If-Match", "0")
	done := make(chan int, 1)
	go func() { w := httptest.NewRecorder(); h.ServeHTTP(w, r); done <- w.Code }()
	cancel()
	select {
	case code := <-done:
		if code != 400 && code != 408 {
			t.Fatal(code)
		}
	case <-time.After(time.Second):
		t.Fatal("stalled request did not cancel")
	}
	if store.writes != 0 {
		t.Fatal("canceled body mutated game")
	}
	if w := request(h, body, 0, context.Background()); w.Code != 200 {
		t.Fatal("admission not released")
	}
}

func TestPostgresCompletePartnersHand(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("requires isolated TEST_DATABASE_URL ending _test")
	}
	ctx := context.Background()
	store, err := records.NewTestStore(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := store.Close(ctx); err != nil {
			t.Error(err)
		}
	}()
	b, err := os.ReadFile("../../../web/server/tests/fixtures/legacy-module-document.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Cases []struct {
			Commands []json.RawMessage
			Rounds   []struct {
				StateSHA256 string `json:"stateSha256"`
			}
		}
	}
	if err = json.Unmarshal(b, &corpus); err != nil {
		t.Fatal(err)
	}
	row, _ := fixture(t)
	if err = store.Insert(ctx, row); err != nil {
		t.Fatal(err)
	}
	registry := compatibility.Registry()
	m, _ := registry.Resolve(row.Mode)
	start := time.Now()
	transitions, stateBytes, responseBytes := 0, 0, 0
	for _, command := range corpus.Cases[2].Commands {
		var c struct{ Type string }
		json.Unmarshal(command, &c)
		if c.Type == "next-hand" {
			break
		}
		prior, err := store.Load(ctx, row.ID, row.Owner)
		if err != nil {
			t.Fatal(err)
		}
		expected, err := m.Apply(prior.State, command)
		if err != nil {
			t.Fatal(err)
		}
		if c.Type == "action" {
			body, seat := action(t, command)
			h, _ := slice.New(store, registry, slice.Principal{Owner: row.Owner, GameID: row.ID, Seat: seat})
			w := request(h, body, prior.Revision, ctx)
			if w.Code != 200 {
				t.Fatalf("transition %d: %d %s", transitions, w.Code, w.Body.String())
			}
			responseBytes += w.Body.Len()
		} else { // Collection is an internal automatic transition, never a forged player action.
			if err = store.Publish(ctx, prior, expected); err != nil {
				t.Fatal(err)
			}
		}
		next, err := store.Load(ctx, row.ID, row.Owner)
		if err != nil || next.Revision != prior.Revision+1 || !bytes.Equal(next.State, expected) {
			t.Fatal("persisted checkpoint/revision mismatch")
		}
		stateBytes += len(next.State)
		transitions++
	}
	final, err := store.Load(ctx, row.ID, row.Owner)
	if err != nil {
		t.Fatal(err)
	}
	canonical, err := contracts.UTF16Canonical(final.State)
	if err != nil {
		t.Fatal(err)
	}
	if contracts.SHA256(canonical) != corpus.Cases[2].Rounds[0].StateSHA256 || transitions != 69 {
		t.Fatal("original first-hand golden/revisions mismatch")
	}
	t.Logf("full Partners hand: transitions=%d persistedBytes=%d playerResponseBytes=%d wallMs=%.3f", transitions, stateBytes, responseBytes, float64(time.Since(start).Microseconds())/1000)
}
