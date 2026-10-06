package records

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
)

// EraseOwner is the explicit local account-erasure exception to immutable
// history. It derives the target from authentication, locks that owner, and
// removes only its records in one transaction. No trigger is disabled.
func (s *Store) EraseOwner(ctx context.Context) error {
	p, err := principalFrom(ctx)
	if err != nil {
		return err
	}
	return s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		var owner string
		if err := tx.QueryRow(ctx, "SELECT owner_id FROM "+s.table("m03_access")+" WHERE owner_id=$1 FOR UPDATE", p.OwnerID).Scan(&owner); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrUnauthenticated
			}
			return err
		}
		if err := s.authorize(ctx, tx, owner); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, "SELECT set_config('cardford.erasing_owner',$1,true)", owner); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, "DELETE FROM "+s.table("m03_work_attempts")+" WHERE work_id IN (SELECT work_id FROM "+s.table("m03_work")+" WHERE owner_id=$1)", owner); err != nil {
			return err
		}
		for _, table := range []string{"m03_work", "m03_review_trials", "m03_exposures", "m03_command_decisions", "m03_decisions", "m03_commands"} {
			if _, err := tx.Exec(ctx, "DELETE FROM "+s.table(table)+" WHERE owner_id=$1", owner); err != nil {
				return err
			}
		}
		for _, table := range []string{"m03_events", "m03_anchors"} {
			if _, err := tx.Exec(ctx, "DELETE FROM "+s.table(table)+" WHERE game_id IN (SELECT game_id FROM "+s.table("m03_games")+" WHERE owner_id=$1)", owner); err != nil {
				return err
			}
		}
		for _, table := range []string{"m03_unit_admissions", "m03_allowance_charges", "m03_access_trials", "m03_grants", "m03_allowance", "m03_games", "m04_controls", "m04_sessions", "m04_service_commands", "m03_access"} {
			if _, err := tx.Exec(ctx, "DELETE FROM "+s.table(table)+" WHERE owner_id=$1", owner); err != nil {
				return err
			}
		}
		return nil
	})
}
