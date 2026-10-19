package records

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/sessions"
	"github.com/jackc/pgx/v5"
)

const MaxRealtimeProjectionBytes = 2 << 20

// RealtimeProjection is a derived seat-zero read model. It deliberately cannot
// carry private state, chance material, the event archive or policy analysis.
// Access, control and statistics remain service-owned current projections.
type RealtimeProjection struct {
	Version      string                 `json:"version"`
	GameID       string                 `json:"gameId"`
	Revision     int64                  `json:"revision"`
	Pin          ModulePin              `json:"pin"`
	Policy       PolicyPin              `json:"policy"`
	Competition  Competition            `json:"competition"`
	Controllers  []Controller           `json:"controllers"`
	Disposition  ReadDisposition        `json:"disposition"`
	UnitID       string                 `json:"unitId"`
	AccessUnit   *gamekernel.AccessUnit `json:"accessUnit"`
	Node         gamekernel.Node        `json:"node"`
	View         json.RawMessage        `json:"view"`
	Presentation json.RawMessage        `json:"presentation"`
	Actor        json.RawMessage        `json:"actor"`
}

func (s *Store) buildRealtimeProjection(doc Document, snapshot gamekernel.Snapshot) ([]byte, error) {
	bound, err := s.codec.bound(doc, snapshot)
	if err != nil {
		return nil, err
	}
	// The preserved V1 record seam has no V2 public session adapter. Its writes
	// and historical readers retain their existing behavior.
	if _, ok := bound.inner.(*sessions.DurableSnapshot); !ok {
		return nil, nil
	}
	b, err := s.codec.Session(doc, snapshot)
	if err != nil {
		return nil, err
	}
	r, err := s.codec.registration(doc.Metadata)
	if err != nil {
		return nil, err
	}
	p := RealtimeProjection{Version: "1.0.0", GameID: doc.Metadata.GameID, Revision: doc.Revision, Pin: doc.Metadata.Pin, Policy: doc.Metadata.Policy, Competition: doc.Metadata.Competition, Controllers: doc.Metadata.Controllers, Disposition: s.codec.disposition(doc.Metadata, r)}
	if p.UnitID, err = s.codec.CurrentUnitID(doc, snapshot); err != nil {
		return nil, err
	}
	if p.AccessUnit, err = b.AccessUnit(); err != nil {
		return nil, err
	}
	if p.Node, err = b.Node(); err != nil {
		return nil, err
	}
	// A chance request is an engine instruction, not part of the player view.
	p.Node.Request = nil
	if p.View, err = b.View(0); err != nil {
		return nil, err
	}
	if p.Presentation, err = b.Presentation(0); err != nil {
		return nil, err
	}
	human := p.Node.Kind == "actor" && p.Node.Seat != nil && *p.Node.Seat == 0
	if p.Node.Kind == "sealed" {
		for _, seat := range p.Node.Actors {
			human = human || seat == 0
		}
	}
	if human {
		if p.Actor, err = b.Packet(0); err != nil {
			return nil, err
		}
	}
	raw, err := json.Marshal(p)
	if err != nil {
		return nil, err
	}
	if len(raw) > MaxRealtimeProjectionBytes {
		return nil, fmt.Errorf("realtime projection byte limit")
	}
	return raw, nil
}

func (s *Store) saveRealtimeProjectionTx(ctx context.Context, tx pgx.Tx, owner, game string, revision int64, raw []byte) error {
	if len(raw) == 0 {
		return nil
	}
	_, err := tx.Exec(ctx, `INSERT INTO m05_realtime_projections(owner_id,game_id,revision,projection) VALUES($1,$2,$3,$4) ON CONFLICT(game_id) DO UPDATE SET revision=EXCLUDED.revision,projection=EXCLUDED.projection WHERE m05_realtime_projections.revision<=EXCLUDED.revision`, owner, game, revision, raw)
	if err != nil {
		return err
	}
	var terminal struct {
		Node struct {
			Kind string `json:"kind"`
		} `json:"node"`
	}
	if err = json.Unmarshal(raw, &terminal); err != nil {
		return err
	}
	if terminal.Node.Kind == "session-complete" {
		_, err = tx.Exec(ctx, `UPDATE m05_playback SET phase='completed',running=false,generation=generation+1,foreground_lease_until=NULL,paused_at=NULL,expires_at=NULL,pause_reason=NULL WHERE owner_id=$1 AND game_id=$2 AND phase NOT IN ('expired','completed')`, owner, game)
		if err != nil {
			return err
		}
		return s.cancelLifecycleWorkTx(ctx, tx, owner, game, true)
	}
	return err
}

func decodeRealtimeProjection(raw []byte, game string, revision int64) (RealtimeProjection, error) {
	var p RealtimeProjection
	if len(raw) == 0 || len(raw) > MaxRealtimeProjectionBytes {
		return p, ErrStorage
	}
	value, err := contracts.ParseJSON(raw)
	if err != nil {
		return p, ErrStorage
	}
	object, ok := value.(map[string]any)
	if !ok || len(object) != 13 && len(object) != 14 {
		return p, ErrStorage
	}
	for _, key := range []string{"version", "gameId", "revision", "pin", "competition", "controllers", "disposition", "unitId", "accessUnit", "node", "view", "presentation", "actor"} {
		if _, ok := object[key]; !ok {
			return p, ErrStorage
		}
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&p) != nil || p.Version != "1.0.0" || p.GameID != game || p.Revision != revision || revision < 0 || revision > maxRecordInteger || p.Node.Request != nil {
		return p, ErrStorage
	}
	if _, present := object["policy"]; present && ValidatePolicy(p.Policy) != nil {
		return p, ErrStorage
	}
	if contracts.Validate("RegisteredSessionView", p.View) != nil || !json.Valid(p.Presentation) || len(p.Actor) > 0 && string(p.Actor) != "null" && contracts.Validate("RegisteredActorPacket", p.Actor) != nil {
		return p, ErrStorage
	}
	return p, nil
}

// RefreshRealtimeProjection checks exact saved pins against this process's
// installed readers and policies. Compatibility is not a durable game fact:
// a cached playable view can become historical-only after an upgrade. The
// captured revision and player view remain unchanged.
func (s *Store) RefreshRealtimeProjection(ctx context.Context, owner string, p RealtimeProjection) (RealtimeProjection, error) {
	if p.Policy.ID == "" {
		// Pre-policy caches are rebuilt once by the normal strict lazy reader.
		// The policy is immutable across every revision of this same game.
		current, err := s.ReadRealtimeProjection(ctx, owner, p.GameID)
		if err != nil {
			return p, err
		}
		p.Policy = current.Policy
	}
	m := SessionMetadata{RecordVersion: RecordVersion, GameID: p.GameID, OwnerID: owner, Pin: p.Pin, Policy: p.Policy, Competition: p.Competition, Controllers: p.Controllers}
	r, err := s.codec.registration(m)
	if err != nil {
		return p, err
	}
	p.Disposition = s.codec.disposition(m, r)
	return p, nil
}

// ReadRealtimeProjection reads a small current cache without replaying history.
// Old games lazily derive it after the normal authorized strict Load, then only
// install it if that revision is still current. Concurrent mutations retry.
func (s *Store) ReadRealtimeProjection(ctx context.Context, owner, game string) (RealtimeProjection, error) {
	for attempt := 0; attempt < 3; attempt++ {
		p, missing, err := s.readRealtimeProjection(ctx, owner, game)
		if err != nil || !missing {
			return p, err
		}
		loaded, err := s.Load(ctx, owner, game)
		if err != nil {
			return p, err
		}
		raw, err := s.buildRealtimeProjection(loaded.Document, loaded.Snapshot)
		if err != nil {
			return p, err
		}
		if len(raw) == 0 {
			return p, fmt.Errorf("saved-module-reader-unavailable")
		}
		err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
			var readable bool
			if e := tx.QueryRow(ctx, `SELECT can_read FROM m03_access WHERE owner_id=$1 FOR UPDATE`, owner).Scan(&readable); e != nil {
				return e
			}
			if !readable {
				return ErrReadDenied
			}
			if e := s.authorize(ctx, tx, owner); e != nil {
				return e
			}
			var revision int64
			if e := tx.QueryRow(ctx, `SELECT revision FROM m03_games WHERE owner_id=$1 AND game_id=$2 FOR UPDATE`, owner, game).Scan(&revision); e != nil {
				return e
			}
			if revision != loaded.Document.Revision {
				return ErrConflict
			}
			return s.saveRealtimeProjectionTx(ctx, tx, owner, game, revision, raw)
		})
		if err != nil && !errors.Is(err, ErrConflict) {
			return p, err
		}
	}
	return RealtimeProjection{}, ErrConflict
}

func (s *Store) readRealtimeProjection(ctx context.Context, owner, game string) (RealtimeProjection, bool, error) {
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	if err := s.currentRead(ctx, owner); err != nil {
		return RealtimeProjection{}, false, err
	}
	var raw []byte
	var revision int64
	err := s.pool.QueryRow(ctx, `SELECT p.projection,g.revision FROM m03_games g JOIN m03_access a ON a.owner_id=g.owner_id LEFT JOIN m05_realtime_projections p ON p.game_id=g.game_id AND p.owner_id=g.owner_id AND p.revision=g.revision WHERE g.owner_id=$1 AND g.game_id=$2 AND a.can_read`, owner, game).Scan(&raw, &revision)
	if errors.Is(err, pgx.ErrNoRows) {
		return RealtimeProjection{}, false, ErrReadDenied
	}
	if err != nil {
		return RealtimeProjection{}, false, err
	}
	if raw == nil {
		return RealtimeProjection{}, true, nil
	}
	p, err := decodeRealtimeProjection(raw, game, revision)
	if err == nil && p.Policy.ID == "" {
		return p, true, nil
	}
	if err == nil {
		p, err = s.RefreshRealtimeProjection(ctx, owner, p)
	}
	if err == nil {
		err = s.currentRead(ctx, owner)
	}
	return p, false, err
}
