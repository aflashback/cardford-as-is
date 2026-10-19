package records

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
)

type ExpiredSession struct {
	OwnerID, GameID, Phase string
	Generation             int64
}

// SweepSessionLifecycle is one bounded indexed batch, shared across replicas.
// Candidate discovery holds no row locks. Each transaction claims the owner
// first with SKIP LOCKED, preserving the mutation lock order, then rechecks the
// actual lifecycle deadline. Concurrent sweepers report a transition once.
func (s *Store) SweepSessionLifecycle(ctx context.Context, limit int) ([]ExpiredSession, error) {
	if limit < 1 || limit > 256 {
		return nil, ErrStorage
	}
	bounded, cancel := s.bounded(ctx)
	defer cancel()
	rows, err := s.pool.Query(bounded, `SELECT owner_id,game_id FROM (
 (SELECT owner_id,game_id,foreground_lease_until AS deadline FROM m05_playback WHERE policy_version='pause-v1' AND phase IN ('running','held') AND foreground_lease_until<=clock_timestamp() ORDER BY foreground_lease_until LIMIT $1)
 UNION ALL
 (SELECT owner_id,game_id,expires_at AS deadline FROM m05_playback WHERE policy_version='pause-v1' AND phase='paused' AND expires_at<=clock_timestamp() ORDER BY expires_at LIMIT $1)
 ) due ORDER BY deadline LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	var candidates []ExpiredSession
	for rows.Next() {
		var c ExpiredSession
		if err = rows.Scan(&c.OwnerID, &c.GameID); err != nil {
			rows.Close()
			return nil, err
		}
		candidates = append(candidates, c)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return nil, err
	}
	out := []ExpiredSession{}
	for _, candidate := range candidates {
		var changed bool
		err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
			var owner string
			err := tx.QueryRow(ctx, `SELECT owner_id FROM m03_access WHERE owner_id=$1 FOR UPDATE SKIP LOCKED`, candidate.OwnerID).Scan(&owner)
			if errors.Is(err, pgx.ErrNoRows) {
				return nil
			}
			if err != nil {
				return err
			}
			r, err := s.readLifecycleTx(ctx, tx, owner, candidate.GameID)
			if errors.Is(err, pgx.ErrNoRows) {
				return nil
			}
			if err != nil {
				return err
			}
			changed, err = s.materializeLifecycleTx(ctx, tx, owner, candidate.GameID, &r)
			candidate.Phase = r.Phase
			candidate.Generation = r.Generation
			return err
		})
		if err != nil {
			return out, err
		}
		if changed {
			out = append(out, candidate)
		}
	}
	return out, nil
}

// LatestExpiredPlayback supplies a typed expired outcome when the active
// pointer has been cleared. It returns no private historical game material.
func (s *Store) LatestExpiredPlayback(ctx context.Context, owner, instance string) (PlaybackState, error) {
	if err := s.authorize(ctx, s.pool, owner); err != nil {
		return PlaybackState{}, err
	}
	bounded, cancel := s.bounded(ctx)
	defer cancel()
	var game string
	err := s.pool.QueryRow(bounded, `SELECT game_id FROM m05_playback WHERE owner_id=$1 AND phase='expired' ORDER BY expires_at DESC LIMIT 1`, owner).Scan(&game)
	if errors.Is(err, pgx.ErrNoRows) {
		return PlaybackState{}, nil
	}
	if err != nil {
		return PlaybackState{}, err
	}
	return s.ReadPlayback(ctx, owner, game, instance)
}
