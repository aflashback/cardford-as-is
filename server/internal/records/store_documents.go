package records

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"github.com/jackc/pgx/v5"
)

type Loaded struct {
	Document    Document
	Snapshot    gamekernel.Snapshot
	Disposition ReadDisposition
	Events      []EventRecord
	WindowID    string
	// Byte accounting describes this read, not PostgreSQL's physical I/O.
	ReadBytes    int
	origin       []byte
	archiveBytes int
	commandBytes int64
	commandCount int64
}

type AcceptedTransition struct {
	Before        *Loaded
	Staged        *StagedTransition
	Command       CommandRecord
	Admission     AccessAdmission
	Decisions     []DecisionRecord
	ReceiptSchema string
	Receipt       []byte
	Charge        *AllowanceCharge
	NextWindowID  string
}

type AcceptedOutcome struct {
	GameID        string
	Revision      int64
	ReceiptSchema string
	Receipt       []byte
	Reconciled    bool
}

func metadataHash(meta SessionMetadata) (string, error) {
	raw, err := json.Marshal(meta)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:]), nil
}
func storageError(err error) error {
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return err
	}
	return fmt.Errorf("%w: %v", ErrStorage, err)
}

// Create persists the validated opening snapshot, actual chance anchor and
// opening journal atomically. The owner's access/control state is pre-existing.
func (s *Store) Create(ctx context.Context, doc Document, anchor ReplayAnchor, events []EventRecord, admission AccessAdmission, windowID string) error {
	snapshot, disposition, err := s.codec.Open(doc, events)
	if err != nil {
		return err
	}
	_ = snapshot
	if !disposition.Playable {
		return fmt.Errorf("unsupported execution pin: %s", disposition.Reason)
	}
	if err = s.codec.ValidateAnchor(doc.Metadata, anchor); err != nil {
		return err
	}
	if doc.Revision != 0 || anchor.GameID != doc.Metadata.GameID || admission.OwnerID != doc.Metadata.OwnerID {
		return fmt.Errorf("invalid opening binding")
	}
	canonicalWindow, err := s.codec.WindowID(doc)
	if err != nil {
		return err
	}
	if windowID != "" && windowID != canonicalWindow {
		return fmt.Errorf("opening window mismatch")
	}
	windowID = canonicalWindow
	unitID, err := s.codec.UnitID(doc)
	if err != nil {
		return err
	}
	if admission.UnitID != unitID {
		return ErrAccess
	}
	checkpointA, _ := json.Marshal(anchor.Initial)
	checkpointB, _ := json.Marshal(doc.Checkpoint)
	if !bytes.Equal(checkpointA, checkpointB) {
		return fmt.Errorf("opening checkpoint differs from anchor")
	}
	raw, err := json.Marshal(doc)
	if err != nil {
		return err
	}
	anchorRaw, err := json.Marshal(anchor)
	if err != nil {
		return err
	}
	metaHash, err := metadataHash(doc.Metadata)
	if err != nil {
		return err
	}
	eventBytes := make([][]byte, len(events))
	for i, event := range events {
		eventBytes[i], err = json.Marshal(event)
		if err != nil {
			return err
		}
	}
	return s.withTx(databaseStage(ctx, "create.publish"), func(ctx context.Context, tx pgx.Tx) error {
		create, acceptedCreate := ctx.Value(createAcceptedKey{}).(*createAcceptedState)
		if s.localService && !acceptedCreate {
			return ErrCommandDigest
		}
		if acceptedCreate {
			command, _, err := serviceCommandFrom(ctx)
			if err != nil {
				return err
			}
			original, err := s.reconcileServiceTx(ctx, tx, admission.OwnerID, command.ID, command.Digest)
			if err == nil {
				create.outcome = original
				return nil
			}
			if !errors.Is(err, ErrConflict) {
				return err
			}
		}
		var generation, control int64
		var play bool
		var active string
		if err := tx.QueryRow(ctx, `SELECT generation,control_generation,can_play,COALESCE(active_game_id,'') FROM m03_access WHERE owner_id=$1 FOR UPDATE`, admission.OwnerID).Scan(&generation, &control, &play, &active); err != nil {
			return err
		}
		if err := s.authorize(ctx, tx, admission.OwnerID); err != nil {
			return err
		}
		if acceptedCreate {
			if active != create.request.ExpectedActiveGameID {
				return ErrConflict
			}
			if active != "" {
				if create.request.ExpectedRevision == nil {
					return ErrConflict
				}
				var revision int64
				if err := tx.QueryRow(ctx, "SELECT revision FROM m03_games WHERE game_id=$1 AND owner_id=$2 FOR UPDATE", active, admission.OwnerID).Scan(&revision); err != nil {
					return err
				}
				if revision != *create.request.ExpectedRevision {
					return ErrConflict
				}
			} else if create.request.ExpectedRevision != nil {
				return ErrConflict
			}
			if active != "" {
				if err := s.authorizeControl(ctx, tx, admission.OwnerID); err != nil {
					return err
				}
			}
		} else if err := s.authorizeControl(ctx, tx, admission.OwnerID); err != nil {
			return err
		}
		if !play || generation != admission.Generation || control != admission.ControlRevision {
			return ErrAccess
		}
		if err := s.checkPlatformFixtureAccessTx(ctx, tx, admission, doc.Metadata.GameID, false); err != nil {
			return err
		}
		if acceptedCreate {
			if control >= maxRecordInteger {
				return ErrControl
			}
			p, err := principalFrom(ctx)
			if err != nil {
				return err
			}
			var expires time.Time
			if err = tx.QueryRow(ctx, "SELECT clock_timestamp()+$1*interval '1 millisecond'", ControlLifetime.Milliseconds()).Scan(&expires); err != nil {
				return err
			}
			if err = s.installControlTx(ctx, tx, p, create.request.TabID, create.request.NewControlToken, expires); err != nil {
				return err
			}
			if _, err = tx.Exec(ctx, "UPDATE m03_access SET control_generation=control_generation+1 WHERE owner_id=$1", admission.OwnerID); err != nil {
				return err
			}
		}
		grant, now, err := s.checkGrant(ctx, tx, admission, doc.Metadata.GameID, doc.Metadata.Pin.GameID, doc.Metadata.Pin.VariantID, false)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO m03_games(game_id,owner_id,revision,window_id,metadata_digest,document) VALUES($1,$2,$3,$4,$5,$6)`, doc.Metadata.GameID, doc.Metadata.OwnerID, doc.Revision, windowID, metaHash, raw); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO m03_anchors(game_id,record) VALUES($1,$2)`, doc.Metadata.GameID, anchorRaw); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO m03_unit_admissions(owner_id,game_id,unit_id,grant_id,access_generation,admitted_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)`, admission.OwnerID, doc.Metadata.GameID, unitID, grant.ID, admission.Generation+1, now, grant.ValidUntil); err != nil {
			return err
		}
		for i, event := range events {
			if _, err := tx.Exec(ctx, `INSERT INTO m03_events(game_id,sequence,revision,record) VALUES($1,$2,$3,$4)`, event.GameID, event.Sequence, event.Revision, eventBytes[i]); err != nil {
				return err
			}
		}
		tag, err := tx.Exec(ctx, `UPDATE m03_access SET active_game_id=$1,generation=generation+1 WHERE owner_id=$2 AND generation<9007199254740991`, doc.Metadata.GameID, doc.Metadata.OwnerID)
		if err == nil && tag.RowsAffected() != 1 {
			return ErrAccess
		}
		if err != nil {
			return err
		}
		if acceptedCreate {
			return s.saveServiceTx(ctx, tx, admission.OwnerID, create.outcome)
		}
		return nil
	})
}

// Load reads one committed document and archive in a short repeatable-read
// transaction. Strict game decoding happens after the connection is released.
// Frozen V1 observations include every historical event, so this read remains
// explicitly bounded linear work; compact hot writes do not imply constant reads.
func (s *Store) Load(ctx context.Context, ownerID, gameID string) (*Loaded, error) {
	bounded, cancel := s.bounded(ctx)
	defer cancel()
	tx, err := s.pool.BeginTx(bounded, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, stageError("load.begin", err)
	}
	defer func() { rollback, cancel := s.bounded(context.Background()); defer cancel(); _ = tx.Rollback(rollback) }()
	if err = s.authorize(bounded, tx, ownerID); err != nil {
		return nil, err
	}
	var raw []byte
	var revision int64
	var windowID, storedHash string
	err = tx.QueryRow(bounded, `SELECT CASE WHEN octet_length(g.document)<=$3 THEN g.document ELSE NULL END,g.revision,g.window_id,g.metadata_digest FROM m03_games g JOIN m03_access a ON a.owner_id=g.owner_id WHERE g.game_id=$1 AND g.owner_id=$2 AND a.can_read`, gameID, ownerID, MaxHotBytes+(64<<10)).Scan(&raw, &revision, &windowID, &storedHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrReadDenied
	}
	if err != nil {
		return nil, stageError("load.document", err)
	}
	if len(raw) > MaxHotBytes+(64<<10) {
		return nil, storageError(fmt.Errorf("document byte limit"))
	}
	rows, err := tx.Query(bounded, `SELECT sequence,revision,CASE WHEN octet_length(record)<=$3 THEN record ELSE NULL END FROM m03_events WHERE game_id=$1 ORDER BY sequence LIMIT $2`, gameID, MaxEventCount+1, MaxHotBytes+(4<<10))
	if err != nil {
		return nil, stageError("load.events", err)
	}
	type rawEvent struct {
		sequence, revision int64
		raw                []byte
	}
	var archived []rawEvent
	archiveBytes := 0
	for rows.Next() {
		var event rawEvent
		if err = rows.Scan(&event.sequence, &event.revision, &event.raw); err != nil {
			rows.Close()
			return nil, err
		}
		archiveBytes += len(event.raw)
		if len(archived) >= MaxEventCount || archiveBytes > MaxArchiveBytes {
			rows.Close()
			return nil, storageError(fmt.Errorf("archive byte/event limit"))
		}
		archived = append(archived, event)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return nil, stageError("load.event-stream", err)
	}
	var commandBytes, commandCount int64
	if err = tx.QueryRow(bounded, `SELECT COALESCE(sum(octet_length(command)),0)::bigint,count(*) FROM m03_commands WHERE game_id=$1`, gameID).Scan(&commandBytes, &commandCount); err != nil {
		return nil, stageError("load.command-summary", err)
	}
	if commandBytes > MaxArchiveBytes || commandCount > MaxEventCount || commandCount != revision {
		return nil, storageError(fmt.Errorf("command archive size/sequence limit"))
	}
	if err = tx.Commit(bounded); err != nil {
		return nil, stageError("load.commit", err)
	}
	doc, err := s.codec.DecodeDocument(raw)
	if err != nil {
		return nil, storageError(err)
	}
	hash, err := metadataHash(doc.Metadata)
	if err != nil {
		return nil, storageError(err)
	}
	if doc.Metadata.OwnerID != ownerID || doc.Metadata.GameID != gameID || doc.Revision != revision || hash != storedHash {
		return nil, storageError(fmt.Errorf("indexed document binding mismatch"))
	}
	events := make([]EventRecord, len(archived))
	for i, event := range archived {
		events[i], err = DecodeEvent(event.raw)
		if err != nil {
			return nil, storageError(err)
		}
		if events[i].Sequence != event.sequence || events[i].Revision != event.revision || events[i].GameID != gameID {
			return nil, storageError(fmt.Errorf("indexed event binding mismatch"))
		}
	}
	snapshot, disposition, err := s.codec.Open(doc, events)
	if err != nil {
		return nil, storageError(err)
	}
	canonicalWindow, err := s.codec.WindowID(doc)
	if err != nil && disposition.Playable {
		return nil, storageError(err)
	}
	if err == nil && windowID != canonicalWindow {
		return nil, storageError(fmt.Errorf("stored window does not match game phase"))
	}
	if err = s.currentRead(ctx, ownerID); err != nil {
		return nil, err
	}
	return &Loaded{Document: doc, Snapshot: snapshot, Disposition: disposition, Events: events, WindowID: windowID, ReadBytes: len(raw) + archiveBytes, origin: bytes.Clone(raw), archiveBytes: archiveBytes, commandBytes: commandBytes, commandCount: commandCount}, nil
}

func (s *Store) reconcileTx(ctx context.Context, tx pgx.Tx, ownerID, commandID, digest string) (AcceptedOutcome, error) {
	var canRead bool
	err := tx.QueryRow(ctx, `SELECT can_read FROM m03_access WHERE owner_id=$1 FOR UPDATE`, ownerID).Scan(&canRead)
	if errors.Is(err, pgx.ErrNoRows) || err == nil && !canRead {
		return AcceptedOutcome{}, ErrReadDenied
	}
	if err != nil {
		return AcceptedOutcome{}, err
	}
	if err = s.authorize(ctx, tx, ownerID); err != nil {
		return AcceptedOutcome{}, err
	}
	var outcome AcceptedOutcome
	var storedDigest string
	err = tx.QueryRow(ctx, `SELECT game_id,revision,digest,receipt_schema,CASE WHEN octet_length(receipt)<=$3 THEN receipt ELSE NULL END FROM m03_commands WHERE owner_id=$1 AND command_id=$2`, ownerID, commandID, MaxRecordBytes).Scan(&outcome.GameID, &outcome.Revision, &storedDigest, &outcome.ReceiptSchema, &outcome.Receipt)
	if errors.Is(err, pgx.ErrNoRows) {
		return AcceptedOutcome{}, ErrConflict
	}
	if err != nil {
		return AcceptedOutcome{}, err
	}
	if storedDigest != digest {
		return AcceptedOutcome{}, ErrCommandDigest
	}
	outcome.Reconciled = true
	return outcome, nil
}

func validateOutcome(outcome AcceptedOutcome) error {
	if outcome.GameID == "" || outcome.Revision < 0 || outcome.Revision > maxRecordInteger || len(outcome.Receipt) > MaxRecordBytes {
		return fmt.Errorf("invalid accepted outcome")
	}
	return contracts.Validate(outcome.ReceiptSchema, outcome.Receipt)
}

// Reconcile never rechecks admission for new work. Current owner/read permission
// applies, even after active game, revision, grant or access generation changes.
func (s *Store) Reconcile(ctx context.Context, ownerID, commandID, digest string) (AcceptedOutcome, error) {
	var outcome AcceptedOutcome
	err := s.withTx(databaseStage(ctx, "command.reconcile"), func(ctx context.Context, tx pgx.Tx) error {
		var err error
		outcome, err = s.reconcileTx(ctx, tx, ownerID, commandID, digest)
		return err
	})
	if err != nil {
		return AcceptedOutcome{}, err
	}
	if err = validateOutcome(outcome); err != nil {
		return AcceptedOutcome{}, storageError(err)
	}
	return outcome, nil
}

// Commit derives exactly one immutable typed transition without a connection.
// The short SQL publication then fences revision/access and atomically records
// snapshot, append-only events/decisions, original response and allowance charge.
func (s *Store) Commit(ctx context.Context, request AcceptedTransition) (AcceptedOutcome, error) {
	publicCommand, hasPublicCommand, publicErr := serviceCommandFrom(ctx)
	if publicErr != nil {
		return AcceptedOutcome{}, publicErr
	}
	if hasPublicCommand && publicCommand.ID != request.Command.CommandID {
		return AcceptedOutcome{}, ErrCommandDigest
	}
	if s.localService && !hasPublicCommand {
		return AcceptedOutcome{}, ErrCommandDigest
	}
	if hasPublicCommand {
		original, err := s.ReconcileService(ctx, publicCommand.ID, publicCommand.Digest)
		if err == nil {
			return original, nil
		}
		if !errors.Is(err, ErrConflict) {
			return AcceptedOutcome{}, err
		}
	}
	if err := ValidateCommand(request.Command); err != nil {
		return AcceptedOutcome{}, err
	}
	original, err := s.Reconcile(ctx, request.Admission.OwnerID, request.Command.CommandID, request.Command.Digest)
	if err == nil {
		return original, nil
	}
	if !errors.Is(err, ErrConflict) {
		return AcceptedOutcome{}, err
	}
	if request.Before == nil || request.Before.Snapshot == nil || !request.Before.Disposition.Playable {
		return AcceptedOutcome{}, fmt.Errorf("missing playable validated origin")
	}
	if len(request.Decisions) > 16 {
		return AcceptedOutcome{}, fmt.Errorf("too many decision records for one transition")
	}
	before := request.Before.Document
	supplied, err := json.Marshal(before)
	if err != nil {
		return AcceptedOutcome{}, err
	}
	if len(request.Before.origin) == 0 || !bytes.Equal(supplied, request.Before.origin) {
		return AcceptedOutcome{}, fmt.Errorf("loaded document origin changed")
	}
	currentUnit, err := s.codec.CurrentUnitID(before, request.Before.Snapshot)
	if err != nil {
		return AcceptedOutcome{}, err
	}
	if request.Admission.UnitID != currentUnit {
		return AcceptedOutcome{}, ErrAccess
	}
	if request.Command.RecordVersion != RecordVersion || request.Command.GameID != before.Metadata.GameID || request.Command.Revision != before.Revision+1 || request.Command.CommandID == "" || request.Command.Digest == "" || request.Admission.OwnerID != before.Metadata.OwnerID {
		return AcceptedOutcome{}, fmt.Errorf("invalid transition binding")
	}
	var next Document
	var events []EventRecord
	if request.Staged != nil {
		next, events, err = s.codec.AcceptStaged(before, request.Before.Snapshot, request.Command.Command, request.Staged)
	} else {
		next, events, err = s.codec.Advance(before, request.Before.Snapshot, request.Command.Command)
	}
	if err != nil {
		return AcceptedOutcome{}, err
	}
	canonicalWindow, err := s.codec.WindowID(next)
	if err != nil {
		return AcceptedOutcome{}, err
	}
	if request.NextWindowID != "" && request.NextWindowID != canonicalWindow {
		return AcceptedOutcome{}, fmt.Errorf("next window mismatch")
	}
	request.NextWindowID = canonicalWindow
	nextUnit, err := s.codec.UnitID(next)
	if err != nil {
		return AcceptedOutcome{}, err
	}
	// Freeze all externally supplied byte slices before publication.
	raw, err := json.Marshal(next)
	if err != nil {
		return AcceptedOutcome{}, err
	}
	commandRaw, err := json.Marshal(request.Command)
	if err != nil {
		return AcceptedOutcome{}, err
	}
	metaHash, err := metadataHash(before.Metadata)
	if err != nil {
		return AcceptedOutcome{}, err
	}
	eventBytes := make([][]byte, len(events))
	for i, event := range events {
		eventBytes[i], err = json.Marshal(event)
		if err != nil {
			return AcceptedOutcome{}, err
		}
	}
	archiveBytes := request.Before.archiveBytes
	for _, event := range eventBytes {
		archiveBytes += len(event)
	}
	if len(raw) > MaxHotBytes+(64<<10) || archiveBytes > MaxArchiveBytes || request.Before.commandBytes+int64(len(commandRaw)) > MaxArchiveBytes || request.Before.commandCount >= MaxEventCount {
		return AcceptedOutcome{}, fmt.Errorf("transition exceeds readable archive limits")
	}
	decisions := make([][]byte, len(request.Decisions))
	for i, decision := range request.Decisions {
		if decision.Access != request.Admission && !(decision.Purpose == "coach-advice" && sameAdmissionBoundary(decision.Access, request.Admission)) {
			return AcceptedOutcome{}, ErrAccess
		}
		if err = s.codec.ValidateDecision(before, request.Before.Snapshot, decision); err != nil {
			return AcceptedOutcome{}, err
		}
		if err = s.codec.ValidateDecisionCommand(decision, request.Command.Command); err != nil {
			return AcceptedOutcome{}, err
		}
		decisions[i], err = json.Marshal(decision)
		if err != nil {
			return AcceptedOutcome{}, err
		}
	}
	accepted := AcceptedOutcome{GameID: next.Metadata.GameID, Revision: next.Revision, ReceiptSchema: request.ReceiptSchema, Receipt: bytes.Clone(request.Receipt)}
	checkpointRaw, err := json.Marshal(next.Checkpoint)
	if err != nil {
		return AcceptedOutcome{}, err
	}
	checkpointDigest := contracts.SHA256(checkpointRaw)
	if err = validateOutcome(accepted); err != nil {
		return AcceptedOutcome{}, err
	}
	err = s.withTx(databaseStage(ctx, "commit.publish"), func(ctx context.Context, tx pgx.Tx) error {
		if hasPublicCommand {
			original, err := s.reconcileServiceTx(ctx, tx, request.Admission.OwnerID, publicCommand.ID, publicCommand.Digest)
			if err == nil {
				accepted = original
				return nil
			}
			if !errors.Is(err, ErrConflict) {
				return err
			}
		}
		reconciled, err := s.reconcileTx(ctx, tx, request.Admission.OwnerID, request.Command.CommandID, request.Command.Digest)
		if err == nil {
			accepted = reconciled
			return nil
		}
		if !errors.Is(err, ErrConflict) {
			return err
		}
		if err = s.checkCommitAccess(ctx, tx, request.Admission, before.Metadata.GameID, request.Charge != nil); err != nil {
			return err
		}
		if _, _, err = s.checkGrant(ctx, tx, request.Admission, before.Metadata.GameID, before.Metadata.Pin.GameID, before.Metadata.Pin.VariantID, request.Charge != nil); err != nil {
			return err
		}
		if nextUnit != currentUnit {
			nextAdmission := request.Admission
			nextAdmission.UnitID = nextUnit
			grant, now, err := s.checkGrant(ctx, tx, nextAdmission, before.Metadata.GameID, before.Metadata.Pin.GameID, before.Metadata.Pin.VariantID, false)
			if err != nil {
				return err
			}
			if _, err = tx.Exec(ctx, `INSERT INTO m03_unit_admissions(owner_id,game_id,unit_id,grant_id,access_generation,admitted_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`, nextAdmission.OwnerID, before.Metadata.GameID, nextUnit, grant.ID, nextAdmission.Generation, now, grant.ValidUntil); err != nil {
				return err
			}
		}
		var revision int64
		var window, hash string
		var currentRaw []byte
		err = tx.QueryRow(ctx, `SELECT revision,window_id,metadata_digest,CASE WHEN octet_length(document)<=$3 THEN document ELSE NULL END FROM m03_games WHERE game_id=$1 AND owner_id=$2 FOR UPDATE`, before.Metadata.GameID, before.Metadata.OwnerID, MaxHotBytes+(64<<10)).Scan(&revision, &window, &hash, &currentRaw)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrConflict
		}
		if err != nil {
			return err
		}
		if revision != before.Revision || window != request.Before.WindowID || hash != metaHash || !bytes.Equal(currentRaw, request.Before.origin) {
			return ErrConflict
		}
		if request.Charge != nil {
			if request.Charge.Admission != request.Admission {
				return ErrAccess
			}
			if err = s.chargeAllowance(ctx, tx, before.Metadata.OwnerID, request.Command.CommandID, before.Metadata.GameID, before.Metadata.Pin.GameID, before.Metadata.Pin.VariantID, *request.Charge); err != nil {
				return err
			}
		}
		if _, err = tx.Exec(ctx, `UPDATE m03_games SET revision=$1,window_id=$2,document=$3,updated_at=now() WHERE game_id=$4`, next.Revision, request.NextWindowID, raw, before.Metadata.GameID); err != nil {
			return err
		}
		for i, event := range events {
			if _, err = tx.Exec(ctx, `INSERT INTO m03_events(game_id,sequence,revision,record) VALUES($1,$2,$3,$4)`, event.GameID, event.Sequence, event.Revision, eventBytes[i]); err != nil {
				return err
			}
		}
		for i, decision := range request.Decisions {
			if decision.Purpose == "coach-advice" {
				if err = s.checkCommitAccess(ctx, tx, decision.Access, before.Metadata.GameID, true); err != nil {
					return err
				}
				g, _, err := s.checkGrant(ctx, tx, decision.Access, before.Metadata.GameID, before.Metadata.Pin.GameID, before.Metadata.Pin.VariantID, true)
				if err != nil {
					return err
				}
				if !grantHasTool(g, "advice") {
					return ErrAccess
				}
				if err = s.checkConfiguredUnlock(ctx, tx, decision.Access, before.Metadata.GameID, "advice"); err != nil {
					return err
				}
			}
			if err = s.checkPreparedDecisionCommit(ctx, tx, decision); err != nil {
				return err
			}
			var original []byte
			err = tx.QueryRow(ctx, `SELECT record FROM m03_decisions WHERE id=$1`, decision.ID).Scan(&original)
			if err == nil {
				if !bytes.Equal(original, decisions[i]) {
					return ErrConflict
				}
				continue
			}
			if !errors.Is(err, pgx.ErrNoRows) {
				return err
			}
			if _, err = tx.Exec(ctx, `INSERT INTO m03_decisions(id,owner_id,game_id,revision,record) VALUES($1,$2,$3,$4,$5)`, decision.ID, decision.OwnerID, decision.GameID, decision.Revision, decisions[i]); err != nil {
				return err
			}
		}
		if _, err = tx.Exec(ctx, `INSERT INTO m03_commands(owner_id,command_id,digest,game_id,revision,command,receipt_schema,receipt,checkpoint_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, before.Metadata.OwnerID, request.Command.CommandID, request.Command.Digest, before.Metadata.GameID, next.Revision, commandRaw, accepted.ReceiptSchema, accepted.Receipt, checkpointDigest); err != nil {
			return err
		}
		for _, decision := range request.Decisions {
			if _, err = tx.Exec(ctx, `INSERT INTO m03_command_decisions(owner_id,command_id,decision_id) VALUES($1,$2,$3)`, before.Metadata.OwnerID, request.Command.CommandID, decision.ID); err != nil {
				return err
			}
		}
		return s.saveServiceTx(ctx, tx, before.Metadata.OwnerID, accepted)
	})
	if err != nil {
		return AcceptedOutcome{}, err
	}
	if err = validateOutcome(accepted); err != nil {
		return AcceptedOutcome{}, storageError(err)
	}
	return accepted, nil
}
