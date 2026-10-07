package records

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
)

type PlatformExportUnit struct {
	GameID     string           `json:"gameId"`
	UnitID     string           `json:"unitId"`
	UnlockedAt string           `json:"unlockedAt"`
	Offer      ComponentVersion `json:"offer"`
}
type PlatformExportInventory struct {
	GameIDs, DecisionIDs []string
	CoachedUnits         []PlatformExportUnit
	Billing              []json.RawMessage
}

// Inventory returns only identifiers and public receipts, never private deals,
// command digests, account credentials, leases, or raw decision/aggregate bytes.
// Consumers must reopen each identifier through its exact safe reader.
func (s *Store) PlatformExportInventory(ctx context.Context, owner string) (PlatformExportInventory, error) {
	out := PlatformExportInventory{GameIDs: []string{}, DecisionIDs: []string{}, CoachedUnits: []PlatformExportUnit{}, Billing: []json.RawMessage{}}
	err := s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if err := s.authorize(ctx, tx, owner); err != nil {
			return err
		}
		var canRead bool
		if err := tx.QueryRow(ctx, "SELECT can_read FROM "+s.table("m03_access")+" WHERE owner_id=$1 FOR UPDATE", owner).Scan(&canRead); err != nil {
			return err
		}
		if !canRead {
			return ErrReadDenied
		}
		rows, err := tx.Query(ctx, "SELECT game_id FROM "+s.table("m03_games")+" WHERE owner_id=$1 ORDER BY updated_at,game_id LIMIT 1001", owner)
		if err != nil {
			return err
		}
		for rows.Next() {
			var id string
			if err = rows.Scan(&id); err != nil {
				rows.Close()
				return err
			}
			out.GameIDs = append(out.GameIDs, id)
		}
		rows.Close()
		if err = rows.Err(); err != nil {
			return err
		}
		if len(out.GameIDs) > 1000 {
			return ErrStorage
		}
		rows, err = tx.Query(ctx, "SELECT d.id FROM "+s.table("m03_decisions")+" d WHERE d.owner_id=$1 AND (EXISTS(SELECT 1 FROM "+s.table("m03_exposures")+" e WHERE e.owner_id=d.owner_id AND e.decision_id=d.id) OR EXISTS(SELECT 1 FROM "+s.table("m04_help_deliveries")+" h JOIN "+s.table("m03_grants")+" g ON g.owner_id=h.owner_id AND g.grant_id=h.grant_id WHERE h.owner_id=d.owner_id AND h.game_id=d.game_id AND h.source_revision=d.revision AND h.kind='advice' AND NOT g.revoked)) ORDER BY d.game_id,d.revision,d.id LIMIT 10001", owner)
		if err != nil {
			return err
		}
		for rows.Next() {
			var id string
			if err = rows.Scan(&id); err != nil {
				rows.Close()
				return err
			}
			out.DecisionIDs = append(out.DecisionIDs, id)
		}
		rows.Close()
		if err = rows.Err(); err != nil {
			return err
		}
		if len(out.DecisionIDs) > 10000 {
			return ErrStorage
		}
		rows, err = tx.Query(ctx, "SELECT game_id,unit_id,unlocked_at,offer_id,offer_version FROM "+s.table("m04_coaching_unlocks")+" WHERE owner_id=$1 ORDER BY unlocked_at,game_id,unit_id LIMIT 10001", owner)
		if err != nil {
			return err
		}
		for rows.Next() {
			var u PlatformExportUnit
			var at time.Time
			if err = rows.Scan(&u.GameID, &u.UnitID, &at, &u.Offer.ID, &u.Offer.Version); err != nil {
				rows.Close()
				return err
			}
			u.UnlockedAt = at.UTC().Format(time.RFC3339Nano)
			out.CoachedUnits = append(out.CoachedUnits, u)
		}
		rows.Close()
		if err = rows.Err(); err != nil {
			return err
		}
		if len(out.CoachedUnits) > 10000 {
			return ErrStorage
		}
		rows, err = tx.Query(ctx, "SELECT CASE WHEN octet_length(receipt)<=65536 THEN receipt ELSE NULL END FROM "+s.table("m04_service_commands")+" WHERE owner_id=$1 AND receipt_schema='BillingOperation' ORDER BY command_id LIMIT 10001", owner)
		if err != nil {
			return err
		}
		for rows.Next() {
			var r []byte
			if err = rows.Scan(&r); err != nil {
				rows.Close()
				return err
			}
			if r == nil {
				rows.Close()
				return ErrStorage
			}
			out.Billing = append(out.Billing, json.RawMessage(r))
		}
		rows.Close()
		if err = rows.Err(); err != nil {
			return err
		}
		if len(out.Billing) > 10000 {
			return ErrStorage
		}
		return nil
	})
	return out, err
}
func (s *Store) PlatformTrialUsed(ctx context.Context, owner string) (bool, error) {
	if err := s.currentRead(ctx, owner); err != nil {
		return false, err
	}
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	var used bool
	err := s.pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM "+s.table("m03_access_trials")+" WHERE owner_id=$1 AND trial_key='access-trial')", owner).Scan(&used)
	return used, err
}
