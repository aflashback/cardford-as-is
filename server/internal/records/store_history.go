package records

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"github.com/jackc/pgx/v5"
)

type historyBundle struct {
	loaded            *Loaded
	anchor            ReplayAnchor
	commands          []CommandRecord
	checkpointDigests []string
}

func (s *Store) loadHistory(ctx context.Context, ownerID, gameID string) (historyBundle, error) {
	loaded, err := s.Load(ctx, ownerID, gameID)
	if err != nil {
		return historyBundle{}, err
	}
	bounded, cancel := s.bounded(ctx)
	defer cancel()
	var anchorRaw []byte
	err = s.pool.QueryRow(bounded, `SELECT CASE WHEN octet_length(h.record)<=$3 THEN h.record ELSE NULL END FROM m03_anchors h JOIN m03_games g ON g.game_id=h.game_id JOIN m03_access a ON a.owner_id=g.owner_id WHERE h.game_id=$1 AND g.owner_id=$2 AND a.can_read`, gameID, ownerID, MaxHotBytes*2).Scan(&anchorRaw)
	if errors.Is(err, pgx.ErrNoRows) {
		return historyBundle{}, ErrReadDenied
	}
	if err != nil {
		return historyBundle{}, err
	}
	if len(anchorRaw) > MaxHotBytes*2 {
		return historyBundle{}, storageError(fmt.Errorf("anchor byte limit"))
	}
	rows, err := s.pool.Query(bounded, `SELECT c.command_id,c.digest,c.revision,CASE WHEN octet_length(c.command)<=$5 THEN c.command ELSE NULL END,c.checkpoint_digest FROM m03_commands c JOIN m03_access a ON a.owner_id=c.owner_id WHERE c.game_id=$1 AND c.owner_id=$2 AND c.revision<=$3 AND a.can_read ORDER BY c.revision LIMIT $4`, gameID, ownerID, loaded.Document.Revision, MaxEventCount+1, MaxRecordBytes)
	if err != nil {
		return historyBundle{}, err
	}
	type row struct {
		id, digest, checkpoint string
		revision               int64
		raw                    []byte
	}
	var data []row
	total := 0
	for rows.Next() {
		var item row
		if err = rows.Scan(&item.id, &item.digest, &item.revision, &item.raw, &item.checkpoint); err != nil {
			rows.Close()
			return historyBundle{}, err
		}
		total += len(item.raw)
		if len(data) >= MaxEventCount || total > MaxArchiveBytes {
			rows.Close()
			return historyBundle{}, storageError(fmt.Errorf("command archive limit"))
		}
		data = append(data, item)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return historyBundle{}, err
	}
	// All bytes have left the pool before decoding or replay begins.
	anchor, err := DecodeAnchor(anchorRaw)
	if err != nil {
		return historyBundle{}, storageError(err)
	}
	h := historyBundle{loaded: loaded, anchor: anchor, commands: make([]CommandRecord, len(data)), checkpointDigests: make([]string, len(data))}
	if int64(len(data)) != loaded.Document.Revision {
		return historyBundle{}, storageError(fmt.Errorf("missing accepted command history"))
	}
	for i, item := range data {
		command, err := DecodeCommand(item.raw)
		if err != nil {
			return historyBundle{}, storageError(err)
		}
		if command.CommandID != item.id || command.Digest != item.digest || command.Revision != item.revision || command.GameID != gameID || !validDigest(item.checkpoint) {
			return historyBundle{}, storageError(fmt.Errorf("indexed command binding mismatch"))
		}
		h.commands[i] = command
		h.checkpointDigests[i] = item.checkpoint
	}
	h.loaded.ReadBytes += len(anchorRaw) + total
	return h, nil
}

func (s *Store) replayHistory(ctx context.Context, h historyBundle, visit func(Document, gamekernel.Snapshot) error) (*Loaded, error) {
	doc, snapshot, events, err := s.codec.ReplayVisit(h.loaded.Document.Metadata, h.anchor, h.commands, func(doc Document, snapshot gamekernel.Snapshot) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		encoded, err := json.Marshal(doc.Checkpoint)
		if err != nil {
			return err
		}
		if doc.Revision < 1 || doc.Revision > int64(len(h.checkpointDigests)) || contracts.SHA256(encoded) != h.checkpointDigests[doc.Revision-1] {
			return fmt.Errorf("replay checkpoint mismatch at revision %d", doc.Revision)
		}
		if visit != nil {
			return visit(doc, snapshot)
		}
		return nil
	})
	if err != nil {
		return nil, storageError(err)
	}
	if doc.Revision != h.loaded.Document.Revision || !equalCheckpoint(doc.Checkpoint, h.loaded.Document.Checkpoint) {
		return nil, storageError(fmt.Errorf("replay differs from persisted current checkpoint"))
	}
	actual, _ := json.Marshal(events)
	expected, _ := json.Marshal(h.loaded.Events)
	if !bytes.Equal(actual, expected) {
		return nil, storageError(fmt.Errorf("replay differs from persisted event archive"))
	}
	h.loaded.Snapshot = snapshot
	return h.loaded, nil
}

// Replay verifies every accepted checkpoint against actual recorded opening
// chance and later draw commands, including collection boundaries. The result
// is private; consumers still obtain only game-owned player projections.
func (s *Store) Replay(ctx context.Context, ownerID, gameID string) (*Loaded, error) {
	h, err := s.loadHistory(ctx, ownerID, gameID)
	if err != nil {
		return nil, err
	}
	return s.replayHistory(ctx, h, nil)
}

// ReadDecision returns the original bytes only after current read authorization,
// strict stored-output validation and rebinding to its original source position.
func (s *Store) ReadDecision(ctx context.Context, ownerID, id string) (DecisionRecord, error) {
	bounded, cancel := s.bounded(ctx)
	defer cancel()
	var raw []byte
	var gameID string
	var revision int64
	err := s.pool.QueryRow(bounded, `SELECT d.game_id,d.revision,CASE WHEN octet_length(d.record)<=$3 THEN d.record ELSE NULL END FROM m03_decisions d JOIN m03_access a ON a.owner_id=d.owner_id WHERE d.id=$1 AND d.owner_id=$2 AND a.can_read`, id, ownerID, MaxRecordBytes).Scan(&gameID, &revision, &raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return DecisionRecord{}, ErrReadDenied
	}
	if err != nil {
		return DecisionRecord{}, err
	}
	decision, err := DecodeDecision(raw)
	if err != nil {
		return DecisionRecord{}, storageError(err)
	}
	if decision.ID != id || decision.OwnerID != ownerID || decision.GameID != gameID || decision.Revision != revision {
		return DecisionRecord{}, storageError(fmt.Errorf("indexed decision binding mismatch"))
	}
	h, err := s.loadHistory(ctx, ownerID, gameID)
	if err != nil {
		return DecisionRecord{}, err
	}
	if revision > h.loaded.Document.Revision {
		return DecisionRecord{}, storageError(fmt.Errorf("decision revision exceeds game"))
	}
	validated := false
	validate := func(doc Document, snapshot gamekernel.Snapshot) error {
		if doc.Revision != revision {
			return nil
		}
		validated = true
		return s.codec.ValidateHistoricalDecisionAt(doc, snapshot, decision)
	}
	if revision == 0 {
		initial, snapshot, _, err := s.codec.Replay(h.loaded.Document.Metadata, h.anchor, nil)
		if err != nil {
			return DecisionRecord{}, storageError(err)
		}
		if err = validate(initial, snapshot); err != nil {
			return DecisionRecord{}, storageError(err)
		}
	}
	if _, err = s.replayHistory(ctx, h, validate); err != nil {
		return DecisionRecord{}, err
	}
	if !validated {
		return DecisionRecord{}, storageError(fmt.Errorf("decision origin unavailable"))
	}
	return decision, nil
}

func (s *Store) AppendExposure(ctx context.Context, exposure ExposureRecord) error {
	decision, err := s.ReadDecision(ctx, exposure.OwnerID, exposure.DecisionID)
	if err != nil {
		return err
	}
	if err = ValidateExposure(exposure, decision); err != nil {
		return err
	}
	raw, err := json.Marshal(exposure)
	if err != nil {
		return err
	}
	return s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		var canRead bool
		if err := tx.QueryRow(ctx, `SELECT can_read FROM m03_access WHERE owner_id=$1 FOR UPDATE`, exposure.OwnerID).Scan(&canRead); err != nil {
			return err
		}
		if !canRead {
			return ErrReadDenied
		}
		var original []byte
		err := tx.QueryRow(ctx, `SELECT record FROM m03_exposures WHERE id=$1`, exposure.ID).Scan(&original)
		if err == nil {
			if !bytes.Equal(original, raw) {
				return ErrCommandDigest
			}
			return nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		_, err = tx.Exec(ctx, `INSERT INTO m03_exposures(id,decision_id,owner_id,game_id,record) VALUES($1,$2,$3,$4,$5)`, exposure.ID, exposure.DecisionID, exposure.OwnerID, exposure.GameID, raw)
		return err
	})
}
