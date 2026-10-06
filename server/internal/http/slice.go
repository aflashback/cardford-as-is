// Package http implements an httptest-only M02A transport seam. It is not wired
// to a listener and does not implement hosted authentication or command receipts.
package http

import (
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/records"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"
)

type Store interface {
	Load(context.Context, string, string) (records.Row, error)
	Publish(context.Context, records.Row, json.RawMessage) error
}

// Principal is supplied by the trusted harness, never decoded from a request.
type Principal struct {
	Owner, GameID string
	Seat          int
}
type Handler struct {
	store     Store
	registry  *gamekernel.Registry
	principal Principal
	slots     chan struct{}
}

func New(store Store, registry *gamekernel.Registry, p Principal) (*Handler, error) {
	if p.Owner == "" || p.GameID == "" || p.Seat < 0 || p.Seat > 3 {
		return nil, fmt.Errorf("invalid harness principal")
	}
	return &Handler{store, registry, p, make(chan struct{}, 2)}, nil
}
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" || r.URL.Path != "/action" {
		http.Error(w, "unsupported test route", 404)
		return
	}
	select {
	case h.slots <- struct{}{}:
		defer func() { <-h.slots }()
	default:
		http.Error(w, "busy", 429)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	stopRead := context.AfterFunc(ctx, func() { _ = r.Body.Close() })
	defer stopRead()
	// Effective on a real net/http transport; the harness also closes its body
	// at cancellation. CPU cancellation checkpoints follow each bounded call.
	_ = http.NewResponseController(w).SetReadDeadline(time.Now().Add(2 * time.Second))
	expected, e := strconv.ParseInt(r.Header.Get("If-Match"), 10, 64)
	if e != nil || expected < 0 || expected > 9007199254740991 {
		http.Error(w, "expected revision required", 400)
		return
	}
	body, e := io.ReadAll(http.MaxBytesReader(w, r.Body, 16<<10))
	if e != nil || contracts.Validate("GameAction", body) != nil {
		http.Error(w, "invalid action", 400)
		return
	}
	if ctx.Err() != nil {
		http.Error(w, "canceled", 408)
		return
	}
	row, e := h.store.Load(ctx, h.principal.GameID, h.principal.Owner)
	if e != nil || row.Revision != expected {
		http.Error(w, "missing or stale owned game", 409)
		return
	}
	m, e := h.registry.ResolveSnapshot(row.Mode)
	if e != nil || len(row.State) > 256<<10 {
		http.Error(w, "unsupported stored game", 422)
		return
	}
	if ctx.Err() != nil {
		http.Error(w, "canceled", 408)
		return
	}
	// Import untrusted stored bytes exactly once. The game-owned snapshot keeps
	// its validated private state immutable across projections and transitions.
	current, e := m.Open(row.State)
	if e != nil {
		http.Error(w, "unsupported stored game", 422)
		return
	}
	if ctx.Err() != nil {
		http.Error(w, "canceled", 408)
		return
	}
	before, e := current.Project(h.principal.Seat)
	if e != nil || !boundView(before.View, row) {
		http.Error(w, "stored game identity mismatch", 422)
		return
	}
	// The actor is exclusively trusted server context. Strict public schema above
	// disallows an actor, private hands, hidden deals or sealed bot choices.
	var action map[string]any
	if e = json.Unmarshal(body, &action); e != nil {
		http.Error(w, "invalid action", 400)
		return
	}
	action["seat"] = h.principal.Seat
	command, e := json.Marshal(map[string]any{"type": "action", "action": action})
	if e != nil {
		http.Error(w, "invalid action", 400)
		return
	}
	if ctx.Err() != nil {
		http.Error(w, "canceled", 408)
		return
	}
	next, e := current.Apply(command)
	if e != nil {
		http.Error(w, "unsupported or illegal action", 422)
		return
	}
	if ctx.Err() != nil {
		http.Error(w, "canceled", 408)
		return
	}
	encoded, e := next.Export()
	if e != nil || len(encoded) > 256<<10 {
		http.Error(w, "invalid transition", 500)
		return
	}
	if ctx.Err() != nil {
		http.Error(w, "canceled", 408)
		return
	}
	projection, e := next.Project(h.principal.Seat)
	if e != nil || !boundView(projection.View, row) {
		http.Error(w, "invalid safe result", 500)
		return
	}
	if ctx.Err() != nil {
		http.Error(w, "canceled", 408)
		return
	}
	if e = h.store.Publish(ctx, row, encoded); e != nil {
		http.Error(w, "publication rejected", 409)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("ETag", strconv.FormatInt(row.Revision+1, 10))
	w.WriteHeader(200)
	_, _ = w.Write(projection.View)
}

func boundView(view json.RawMessage, row records.Row) bool {
	if len(view) > 512<<10 || contracts.Validate("GameView", view) != nil {
		return false
	}
	var identity struct {
		ID   string `json:"id"`
		Mode string `json:"mode"`
	}
	return json.Unmarshal(view, &identity) == nil && identity.ID == row.ID && identity.Mode == row.Mode
}
