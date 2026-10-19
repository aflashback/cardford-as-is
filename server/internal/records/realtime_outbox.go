package records

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

var ErrRealtimeGap = errors.New("realtime cursor requires a fresh snapshot")

const MaxRealtimeBatch = 64
const MaxRealtimeLease = 30 * time.Second

type RealtimeEvent struct {
	OwnerID           string          `json:"-"`
	Sequence          int64           `json:"sequence"`
	Kind              string          `json:"kind"`
	GameID            string          `json:"gameId"`
	Revision          int64           `json:"revision"`
	WorkID            string          `json:"workId"`
	Status            string          `json:"status"`
	AccessGeneration  int64           `json:"accessGeneration"`
	ControlGeneration int64           `json:"controlGeneration"`
	Projection        json.RawMessage `json:"projection,omitempty"`
}

type RealtimeDelivery struct {
	RealtimeEvent
	Token   string
	Attempt int64
}

type realtimeQuietKey struct{}

// RealtimeWake is a coalescing local wake signal, never a delivery queue. Every
// committed SQL outbox row remains durable if the signal was already pending.
func (s *Store) RealtimeWake() <-chan struct{} { return s.realtimeWake }
func (s *Store) signalRealtime() {
	select {
	case s.realtimeWake <- struct{}{}:
	default:
	}
}

func (s *Store) RealtimeCursor(ctx context.Context, owner string) (int64, error) {
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	if err := s.authorize(ctx, s.pool, owner); err != nil {
		return 0, err
	}
	var cursor int64
	err := s.pool.QueryRow(ctx, `SELECT COALESCE(r.sequence,0) FROM m03_access a LEFT JOIN m05_realtime_streams r ON r.owner_id=a.owner_id WHERE a.owner_id=$1 AND a.can_read`, owner).Scan(&cursor)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrReadDenied
	}
	return cursor, err
}

const realtimeColumns = `o.owner_id,o.sequence,o.kind,o.game_id,o.revision,o.work_id,o.status,o.access_generation,o.control_generation,o.projection`

func scanRealtimeEvent(row interface{ Scan(...any) error }, e *RealtimeEvent) error {
	return row.Scan(&e.OwnerID, &e.Sequence, &e.Kind, &e.GameID, &e.Revision, &e.WorkID, &e.Status, &e.AccessGeneration, &e.ControlGeneration, &e.Projection)
}

// ReadRealtimeEvents replays a bounded retained prefix for an authenticated
// owner. A purged or future cursor always requires snapshot recovery.
func (s *Store) ReadRealtimeEvents(ctx context.Context, owner string, after int64, limit int) ([]RealtimeEvent, error) {
	if after < 0 || limit < 1 || limit > MaxRealtimeBatch {
		return nil, ErrRealtimeGap
	}
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())
	if err = s.authorize(ctx, tx, owner); err != nil {
		return nil, err
	}
	var head, floor int64
	err = tx.QueryRow(ctx, `SELECT COALESCE(r.sequence,0),COALESCE(r.purged_through,0) FROM m03_access a LEFT JOIN m05_realtime_streams r ON r.owner_id=a.owner_id WHERE a.owner_id=$1 AND a.can_read`, owner).Scan(&head, &floor)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrReadDenied
	}
	if err != nil {
		return nil, err
	}
	if after < floor || after > head {
		return nil, ErrRealtimeGap
	}
	rows, err := tx.Query(ctx, `SELECT `+realtimeColumns+` FROM m05_realtime_outbox o WHERE o.owner_id=$1 AND o.sequence>$2 ORDER BY o.sequence LIMIT $3`, owner, after, limit)
	if err != nil {
		return nil, err
	}
	result := []RealtimeEvent{}
	for rows.Next() {
		var e RealtimeEvent
		if err = scanRealtimeEvent(rows, &e); err != nil {
			rows.Close()
			return nil, err
		}
		result = append(result, e)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	if err = s.currentRead(ctx, owner); err != nil {
		return nil, err
	}
	return result, nil
}

// ClaimRealtimeEvents leases at most the first undelivered row per owner. A
// second publisher cannot overtake an in-flight row for that owner. The caller
// owns all network work only after this transaction and connection are closed.
func (s *Store) ClaimRealtimeEvents(ctx context.Context, limit int, lease time.Duration) ([]RealtimeDelivery, error) {
	if limit < 1 || limit > MaxRealtimeBatch || lease < time.Millisecond || lease > MaxRealtimeLease {
		return nil, ErrStorage
	}
	token, err := freshID()
	if err != nil {
		return nil, err
	}
	result := []RealtimeDelivery{}
	err = s.withTx(context.WithValue(ctx, realtimeQuietKey{}, true), func(ctx context.Context, tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `WITH selected AS (
		 SELECT o.owner_id,o.sequence FROM m05_realtime_outbox o
		 WHERE o.delivered_at IS NULL AND o.available_at<=clock_timestamp() AND (o.lease_until IS NULL OR o.lease_until<=clock_timestamp())
		 AND NOT EXISTS(SELECT 1 FROM m05_realtime_outbox earlier WHERE earlier.owner_id=o.owner_id AND earlier.sequence<o.sequence AND earlier.delivered_at IS NULL)
		 ORDER BY o.created_at,o.owner_id,o.sequence LIMIT $1 FOR UPDATE OF o SKIP LOCKED
		) UPDATE m05_realtime_outbox o SET lease_token=$2,lease_until=clock_timestamp()+$3*interval '1 millisecond',attempt=o.attempt+1 FROM selected s WHERE o.owner_id=s.owner_id AND o.sequence=s.sequence RETURNING `+realtimeColumns+`,o.attempt`, limit, token, lease.Milliseconds())
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var d RealtimeDelivery
			e := &d.RealtimeEvent
			if err = rows.Scan(&e.OwnerID, &e.Sequence, &e.Kind, &e.GameID, &e.Revision, &e.WorkID, &e.Status, &e.AccessGeneration, &e.ControlGeneration, &e.Projection, &d.Attempt); err != nil {
				return err
			}
			d.Token = token
			result = append(result, d)
		}
		return rows.Err()
	})
	return result, err
}

func (s *Store) AckRealtimeEvent(ctx context.Context, d RealtimeDelivery) error {
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	tag, err := s.pool.Exec(ctx, `UPDATE m05_realtime_outbox SET delivered_at=clock_timestamp(),lease_token=NULL,lease_until=NULL WHERE owner_id=$1 AND sequence=$2 AND lease_token=$3 AND attempt=$4 AND lease_until>clock_timestamp() AND delivered_at IS NULL`, d.OwnerID, d.Sequence, d.Token, d.Attempt)
	if err == nil && tag.RowsAffected() != 1 {
		return ErrConflict
	}
	return err
}

func (s *Store) RetryRealtimeEvent(ctx context.Context, d RealtimeDelivery, delay time.Duration) error {
	if delay < 0 || delay > time.Minute {
		return ErrStorage
	}
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	tag, err := s.pool.Exec(ctx, `UPDATE m05_realtime_outbox SET available_at=clock_timestamp()+$5*interval '1 millisecond',lease_token=NULL,lease_until=NULL WHERE owner_id=$1 AND sequence=$2 AND lease_token=$3 AND attempt=$4 AND lease_until>clock_timestamp() AND delivered_at IS NULL`, d.OwnerID, d.Sequence, d.Token, d.Attempt, delay.Milliseconds())
	if err == nil && tag.RowsAffected() != 1 {
		return ErrConflict
	}
	return err
}

// PurgeRealtimeEvents is bounded maintenance. It expires old delivered and
// undelivered rows alike; reconnects behind the retained boundary must snapshot.
func (s *Store) PurgeRealtimeEvents(ctx context.Context, retain time.Duration, limit int) (int64, error) {
	if retain < time.Minute || retain > 7*24*time.Hour || limit < 1 || limit > 4096 {
		return 0, ErrStorage
	}
	var count int64
	err := s.withTx(context.WithValue(ctx, realtimeQuietKey{}, true), func(ctx context.Context, tx pgx.Tx) error {
		// Lock streams before their outbox rows, matching append's order.
		rows, err := tx.Query(ctx, `SELECT owner_id FROM m05_realtime_streams WHERE owner_id IN (SELECT owner_id FROM m05_realtime_outbox WHERE created_at<clock_timestamp()-$1*interval '1 millisecond' ORDER BY created_at LIMIT $2) ORDER BY owner_id FOR UPDATE SKIP LOCKED`, retain.Milliseconds(), limit)
		if err != nil {
			return err
		}
		var owners []string
		for rows.Next() {
			var owner string
			if err = rows.Scan(&owner); err != nil {
				rows.Close()
				return err
			}
			owners = append(owners, owner)
		}
		rows.Close()
		if err = rows.Err(); err != nil {
			return err
		}
		for _, owner := range owners {
			var removed, through int64
			err = tx.QueryRow(ctx, `WITH selected AS (SELECT sequence FROM m05_realtime_outbox WHERE owner_id=$1 AND created_at<clock_timestamp()-$2*interval '1 millisecond' ORDER BY sequence LIMIT $3), deleted AS (DELETE FROM m05_realtime_outbox WHERE owner_id=$1 AND sequence IN (SELECT sequence FROM selected) RETURNING sequence) SELECT count(*),COALESCE(max(sequence),0) FROM deleted`, owner, retain.Milliseconds(), int64(limit)-count).Scan(&removed, &through)
			if err != nil {
				return err
			}
			count += removed
			if _, err = tx.Exec(ctx, `UPDATE m05_realtime_streams SET purged_through=GREATEST(purged_through,$2) WHERE owner_id=$1`, owner, through); err != nil {
				return err
			}
			if count >= int64(limit) {
				break
			}
		}
		return nil
	})
	return count, err
}
