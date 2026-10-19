package records

import (
	"bytes"
	"cardford/server/internal/contracts"
	d "cardford/server/internal/legacydecision"
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"time"
)

type PlatformTrialJob struct {
	SamplerVersion                             string
	CommandID, OwnerID, GameID, Digest, Status string
	SourceRevision, LiveRevision, Attempt      int64
	Seed                                       uint32
	Request                                    json.RawMessage
	Admission                                  AccessAdmission
	Result                                     json.RawMessage
	ExpiresAt                                  time.Time
}

func validatePlatformTrialBinding(j PlatformTrialJob) error {
	if len(j.Request) > MaxRecordBytes || len(j.Result) > MaxRecordBytes || contracts.Validate("PlatformReviewTrialRequest", j.Request) != nil {
		return ErrStorage
	}
	var request struct {
		CommandID        string `json:"commandId"`
		GameID           string `json:"gameId"`
		DecisionID       string `json:"decisionId"`
		TrialID          string `json:"trialId"`
		ExpectedRevision int64  `json:"expectedRevision"`
	}
	if json.Unmarshal(j.Request, &request) != nil || request.CommandID != j.CommandID || request.GameID != j.GameID || request.DecisionID != PlatformDecisionID(j.GameID, j.SourceRevision) || request.ExpectedRevision != j.LiveRevision {
		return ErrStorage
	}
	if j.Status != "completed" {
		if len(j.Result) != 0 {
			return ErrStorage
		}
		return nil
	}
	if contracts.Validate("ReviewTrial", j.Result) != nil {
		return ErrStorage
	}
	var result struct {
		TrialID      string `json:"trialId"`
		DecisionID   string `json:"decisionId"`
		LiveRevision int64  `json:"liveRevision"`
		Frames       []struct {
			DecisionID string `json:"decisionId"`
			Game       struct {
				ID string `json:"id"`
			} `json:"game"`
		} `json:"frames"`
	}
	if json.Unmarshal(j.Result, &result) != nil || result.TrialID != request.TrialID || result.DecisionID != request.DecisionID || result.LiveRevision != j.LiveRevision {
		return ErrStorage
	}
	for _, frame := range result.Frames {
		if frame.DecisionID != request.DecisionID || frame.Game.ID != j.GameID {
			return ErrStorage
		}
	}
	return nil
}

func (s *Store) ReadPlatformTrial(ctx context.Context, owner, id string) (PlatformTrialJob, error) {
	var j PlatformTrialJob
	if err := s.currentRead(ctx, owner); err != nil {
		return j, err
	}
	bounded, cancel := s.bounded(ctx)
	defer cancel()
	var admission []byte
	var seed int64
	err := s.pool.QueryRow(bounded, "SELECT command_id,owner_id,game_id,digest,status,source_revision,live_revision,attempt,seed,request,admission,result,expires_at,sampler_version FROM "+s.table("m04_review_jobs")+" WHERE owner_id=$1 AND command_id=$2", owner, id).Scan(&j.CommandID, &j.OwnerID, &j.GameID, &j.Digest, &j.Status, &j.SourceRevision, &j.LiveRevision, &j.Attempt, &seed, &j.Request, &admission, &j.Result, &j.ExpiresAt, &j.SamplerVersion)
	if errors.Is(err, pgx.ErrNoRows) {
		return j, ErrConflict
	}
	if err != nil {
		return j, err
	}
	if seed < 0 || seed > 4294967295 {
		return j, ErrStorage
	}
	j.Seed = uint32(seed)
	if err = strictRecord(admission, &j.Admission); err != nil {
		return j, err
	}
	if j.Admission.OwnerID != owner {
		return j, ErrStorage
	}
	if err = s.checkSavedGrant(ctx, owner, j.Admission.GrantID); err != nil {
		return j, err
	}
	if err = validatePlatformTrialBinding(j); err != nil {
		return j, err
	}
	if j.Status == "running" && !time.Now().Before(j.ExpiresAt) {
		j.Status = "expired"
	}
	return j, s.currentRead(ctx, owner)
}

// ClaimPlatformTrial preserves the first seed and exact request across retry.
// It authorizes source-hand tools separately from the live revision fence.
func (s *Store) ClaimPlatformTrial(ctx context.Context, r PlatformHelpRequest, request json.RawMessage, seed uint32) (PlatformTrialJob, bool, error) {
	var j PlatformTrialJob
	claimed := false
	c, ok, err := serviceCommandFrom(ctx)
	if err != nil || !ok {
		return j, false, ErrCommandDigest
	}
	owner := r.Admission.OwnerID
	if r.Source == nil {
		return j, false, ErrStorage
	}
	check := PlatformTrialJob{CommandID: c.ID, GameID: r.Source.Document.Metadata.GameID, SourceRevision: r.Source.Document.Revision, LiveRevision: r.ExpectedLiveRevision, Request: request, Status: "running"}
	if err = validatePlatformTrialBinding(check); err != nil {
		return j, false, err
	}
	admission, _ := json.Marshal(r.Admission)
	err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if _, e := s.platformHelpFence(ctx, tx, r); e != nil {
			return e
		}
		var digest, status, sampler string
		var expires time.Time
		e := tx.QueryRow(ctx, "SELECT digest,status,expires_at,sampler_version FROM "+s.table("m04_review_jobs")+" WHERE owner_id=$1 AND command_id=$2 FOR UPDATE", owner, c.ID).Scan(&digest, &status, &expires, &sampler)
		if e == nil {
			if digest != c.Digest {
				return ErrCommandDigest
			}
			if status != "completed" && sampler != d.SamplerVersion {
				return ErrWorkStale
			}
			if status == "completed" || status == "running" && time.Now().Before(expires) {
				return nil
			}
			_, e = tx.Exec(ctx, "UPDATE "+s.table("m04_review_jobs")+" SET status='running',attempt=attempt+1,expires_at=clock_timestamp()+interval '25 seconds' WHERE owner_id=$1 AND command_id=$2", owner, c.ID)
			claimed = e == nil
			return e
		}
		if !errors.Is(e, pgx.ErrNoRows) {
			return e
		}
		var busy bool
		if e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM "+s.table("m04_review_jobs")+" WHERE owner_id=$1 AND status='running' AND expires_at>clock_timestamp())", owner).Scan(&busy); e != nil {
			return e
		}
		if busy {
			return ErrWorkBusy
		}
		_, e = tx.Exec(ctx, "INSERT INTO "+s.table("m04_review_jobs")+"(owner_id,command_id,digest,game_id,source_revision,live_revision,request,admission,seed,status,expires_at,sampler_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'running',clock_timestamp()+interval '25 seconds',$10)", owner, c.ID, c.Digest, r.Source.Document.Metadata.GameID, r.Source.Document.Revision, r.ExpectedLiveRevision, []byte(request), admission, int64(seed), d.SamplerVersion)
		claimed = e == nil
		return e
	})
	if err != nil {
		return j, false, err
	}
	j, err = s.ReadPlatformTrial(ctx, owner, c.ID)
	return j, claimed, err
}

func (s *Store) FinishPlatformTrial(ctx context.Context, j PlatformTrialJob, r PlatformHelpRequest, result json.RawMessage, receipt json.RawMessage) error {
	c, ok, err := serviceCommandFrom(ctx)
	if err != nil || !ok || c.ID != j.CommandID || c.Digest != j.Digest {
		return ErrCommandDigest
	}
	if r.Source == nil || j.OwnerID != r.Admission.OwnerID || j.GameID != r.Source.Document.Metadata.GameID || j.SourceRevision != r.Source.Document.Revision || j.LiveRevision != r.ExpectedLiveRevision {
		return ErrStorage
	}
	completed := j
	completed.Status = "completed"
	completed.Result = result
	if err := validatePlatformTrialBinding(completed); err != nil {
		return err
	}
	if err := contracts.Validate("PlatformReviewStatus", receipt); err != nil {
		return err
	}
	var status struct {
		CommandID string          `json:"commandId"`
		Status    string          `json:"status"`
		Result    json.RawMessage `json:"result"`
	}
	if json.Unmarshal(receipt, &status) != nil || status.CommandID != j.CommandID || status.Status != "completed" || !bytes.Equal(status.Result, result) {
		return ErrStorage
	}
	return s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		grant, err := s.platformHelpFence(ctx, tx, r)
		if err != nil {
			return err
		}
		var attempt int64
		var status string
		var valid bool
		if err = tx.QueryRow(ctx, "SELECT attempt,status,expires_at>clock_timestamp() FROM "+s.table("m04_review_jobs")+" WHERE owner_id=$1 AND command_id=$2 FOR UPDATE", j.OwnerID, j.CommandID).Scan(&attempt, &status, &valid); err != nil {
			return err
		}
		if attempt != j.Attempt || status != "running" || !valid {
			return ErrWorkStale
		}
		if _, err = tx.Exec(ctx, "INSERT INTO "+s.table("m04_help_deliveries")+"(owner_id,game_id,decision_id,source_revision,live_revision,kind,level,grant_id,content) VALUES($1,$2,$3,$4,$5,'trial',3,$6,$7) ON CONFLICT DO NOTHING", j.OwnerID, j.GameID, r.DecisionID, j.SourceRevision, j.LiveRevision, grant.ID, []byte(result)); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, "UPDATE "+s.table("m04_review_jobs")+" SET status='completed',result=$3 WHERE owner_id=$1 AND command_id=$2", j.OwnerID, j.CommandID, []byte(result)); err != nil {
			return err
		}
		return s.saveServiceTx(ctx, tx, j.OwnerID, AcceptedOutcome{GameID: j.GameID, Revision: j.LiveRevision, ReceiptSchema: "PlatformReviewStatus", Receipt: receipt})
	})
}
func (s *Store) FailPlatformTrial(ctx context.Context, j PlatformTrialJob) error {
	if err := s.currentRead(ctx, j.OwnerID); err != nil {
		return err
	}
	return s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "SELECT 1 FROM "+s.table("m03_access")+" WHERE owner_id=$1 FOR UPDATE", j.OwnerID); err != nil {
			return err
		}
		if err := s.authorize(ctx, tx, j.OwnerID); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, "UPDATE "+s.table("m04_review_jobs")+" SET status='unavailable' WHERE owner_id=$1 AND command_id=$2 AND attempt=$3 AND status='running'", j.OwnerID, j.CommandID, j.Attempt)
		return err
	})
}
