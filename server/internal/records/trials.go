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

// ReviewAlternativeRequest identifies a saved illustrative result. It is
// separate from a commercial access trial and never mutates the live game.
// Source is reconstructed from the original anchor/commands by trusted code.
type ReviewAlternativeRequest struct {
	RecordVersion          string          `json:"recordVersion"`
	TrialID                string          `json:"trialId"`
	OwnerID                string          `json:"ownerId"`
	ParentGameID           string          `json:"parentGameId"`
	ParentDecisionID       string          `json:"parentDecisionId"`
	ParentRevision         int64           `json:"parentRevision"`
	ParentReceiptID        string          `json:"parentReceiptId"`
	SourceInputDigest      string          `json:"sourceInputDigest"`
	AlternativeCandidateID string          `json:"alternativeCandidateId"`
	ExpectedLiveRevision   int64           `json:"expectedLiveRevision"`
	ExpectedWindowID       string          `json:"expectedWindowId"`
	Admission              AccessAdmission `json:"admission"`
}
type ReviewAlternative struct {
	Request       ReviewAlternativeRequest
	FutureExposed bool
	Result        []byte
}

func validateAlternativeRequest(r ReviewAlternativeRequest) error {
	if r.RecordVersion != RecordVersion || !recordID(r.TrialID) || !recordID(r.OwnerID) || !recordID(r.ParentGameID) || !recordID(r.ParentDecisionID) || !recordID(r.ParentReceiptID) || !recordID(r.AlternativeCandidateID) || !recordID(r.ExpectedWindowID) || !validDigest(r.SourceInputDigest) || !validCounter(r.ParentRevision) || !validCounter(r.ExpectedLiveRevision) || r.ExpectedLiveRevision < r.ParentRevision || r.Admission.OwnerID != r.OwnerID {
		return ErrStorage
	}
	return nil
}
func validateAlternativeResult(r ReviewAlternativeRequest, raw []byte) error {
	if len(raw) > MaxHotBytes {
		return ErrStorage
	}
	if err := contracts.Validate("ReviewTrial", raw); err != nil {
		return err
	}
	var header struct {
		TrialID      string `json:"trialId"`
		DecisionID   string `json:"decisionId"`
		LiveRevision int64  `json:"liveRevision"`
	}
	if err := json.Unmarshal(raw, &header); err != nil {
		return err
	}
	if header.TrialID != r.TrialID || header.DecisionID != r.ParentDecisionID || header.LiveRevision != r.ExpectedLiveRevision {
		return ErrStorage
	}
	return nil
}

func (s *Store) reviewSource(ctx context.Context, owner, game string, revision int64) (*Loaded, error) {
	h, err := s.loadHistory(ctx, owner, game)
	if err != nil {
		return nil, err
	}
	var source *Loaded
	capture := func(d Document, snapshot gamekernel.Snapshot) error {
		if d.Revision == revision {
			source = &Loaded{Document: d, Snapshot: snapshot, Disposition: h.loaded.Disposition}
		}
		return nil
	}
	if revision == 0 {
		doc, snapshot, _, err := s.codec.Replay(h.loaded.Document.Metadata, h.anchor, nil)
		if err != nil {
			return nil, err
		}
		_ = capture(doc, snapshot)
	}
	if _, err = s.replayHistory(ctx, h, capture); err != nil {
		return nil, err
	}
	if source == nil {
		return nil, ErrStorage
	}
	return source, nil
}

// SaveReviewAlternative records already-computed safe output. This milestone
// supplies persistence, not a continuation simulator or a provider call.
func (s *Store) SaveReviewAlternative(ctx context.Context, r ReviewAlternativeRequest, result []byte) (ReviewAlternative, error) {
	var empty ReviewAlternative
	if err := validateAlternativeRequest(r); err != nil {
		return empty, err
	}
	original, err := s.ReadReviewAlternative(ctx, r.OwnerID, r.TrialID)
	if err == nil {
		a, _ := json.Marshal(original.Request)
		b, _ := json.Marshal(r)
		if !bytes.Equal(a, b) {
			return empty, ErrCommandDigest
		}
		return original, nil
	}
	if !errors.Is(err, ErrReadDenied) {
		return empty, err
	}
	parent, err := s.ReadDecision(ctx, r.OwnerID, r.ParentDecisionID)
	if err != nil {
		return empty, err
	}
	if parent.GameID != r.ParentGameID || parent.Revision != r.ParentRevision || parent.ReceiptID != r.ParentReceiptID || parent.InputDigest != r.SourceInputDigest {
		return empty, ErrStorage
	}
	if err = s.checkAcceptedParent(ctx, r.OwnerID, parent.ID); err != nil {
		return empty, err
	}
	source, err := s.reviewSource(ctx, r.OwnerID, r.ParentGameID, r.ParentRevision)
	if err != nil {
		return empty, err
	}
	if !source.Disposition.Playable {
		return empty, ErrWorkStale
	}
	live, err := s.Load(ctx, r.OwnerID, r.ParentGameID)
	if err != nil {
		return empty, err
	}
	unit, err := s.codec.CurrentUnitID(live.Document, live.Snapshot)
	if err != nil {
		return empty, err
	}
	if unit != r.Admission.UnitID || live.Document.Revision != r.ExpectedLiveRevision || live.WindowID != r.ExpectedWindowID {
		return empty, ErrWorkStale
	}
	if err = s.codec.ValidateDecision(source.Document, source.Snapshot, parent); err != nil {
		return empty, err
	}
	projection, err := source.Snapshot.Project(parent.Actor)
	if err != nil {
		return empty, err
	}
	eligible := false
	for _, id := range projection.CandidateIDs {
		if id == r.AlternativeCandidateID {
			eligible = true
		}
	}
	if !eligible {
		return empty, fmt.Errorf("alternative was not eligible at original decision")
	}
	if err = validateAlternativeResult(r, result); err != nil {
		return empty, err
	}
	frozen := bytes.Clone(result)
	request, _ := json.Marshal(r)
	futureExposed := r.ExpectedLiveRevision > r.ParentRevision
	err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if err := s.checkCommitAccess(ctx, tx, r.Admission, r.ParentGameID, true); err != nil {
			return err
		}
		var revision int64
		var window string
		if err := tx.QueryRow(ctx, "SELECT revision,window_id FROM "+s.table("m03_games")+" WHERE game_id=$1 AND owner_id=$2 FOR UPDATE", r.ParentGameID, r.OwnerID).Scan(&revision, &window); err != nil {
			return err
		}
		if revision != r.ExpectedLiveRevision || window != r.ExpectedWindowID {
			return ErrWorkStale
		}
		g, _, err := s.checkGrant(ctx, tx, r.Admission, r.ParentGameID, source.Document.Metadata.Pin.GameID, source.Document.Metadata.Pin.VariantID, true)
		if err != nil {
			return err
		}
		tool := false
		for _, id := range g.Terms.Tools {
			if id == "review-alternative" {
				tool = true
			}
		}
		if !tool {
			return ErrAccess
		}
		var existing []byte
		err = tx.QueryRow(ctx, "SELECT request FROM "+s.table("m03_review_trials")+" WHERE trial_id=$1", r.TrialID).Scan(&existing)
		if err == nil {
			if !bytes.Equal(existing, request) {
				return ErrCommandDigest
			}
			return nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		_, err = tx.Exec(ctx, "INSERT INTO "+s.table("m03_review_trials")+" (trial_id,owner_id,parent_game_id,parent_decision_id,parent_revision,future_exposed,request,result,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'completed')", r.TrialID, r.OwnerID, r.ParentGameID, r.ParentDecisionID, r.ParentRevision, futureExposed, request, frozen)
		return err
	})
	if err != nil {
		return empty, err
	}
	return s.ReadReviewAlternative(ctx, r.OwnerID, r.TrialID)
}

func (s *Store) checkAcceptedParent(ctx context.Context, owner, id string) error {
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	var accepted bool
	err := s.pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM "+s.table("m03_command_decisions")+" WHERE owner_id=$1 AND decision_id=$2)", owner, id).Scan(&accepted)
	if err != nil {
		return err
	}
	if !accepted {
		return ErrWorkStale
	}
	return nil
}

func (s *Store) ReadReviewAlternative(ctx context.Context, owner, id string) (ReviewAlternative, error) {
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	var out ReviewAlternative
	var request, parentRaw []byte
	var game, decision string
	var revision int64
	err := s.pool.QueryRow(ctx, "SELECT t.request,t.result,t.future_exposed,t.parent_game_id,t.parent_decision_id,t.parent_revision,d.record FROM "+s.table("m03_review_trials")+" t JOIN "+s.table("m03_access")+" a ON a.owner_id=t.owner_id JOIN "+s.table("m03_decisions")+" d ON d.id=t.parent_decision_id AND d.owner_id=t.owner_id WHERE t.trial_id=$1 AND t.owner_id=$2 AND t.status='completed' AND a.can_read", id, owner).Scan(&request, &out.Result, &out.FutureExposed, &game, &decision, &revision, &parentRaw)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, ErrReadDenied
	}
	if err != nil {
		return out, err
	}
	if err = strictRecord(request, &out.Request); err != nil {
		return out, storageError(err)
	}
	r := out.Request
	if validateAlternativeRequest(r) != nil || r.OwnerID != owner || r.TrialID != id || r.ParentGameID != game || r.ParentDecisionID != decision || r.ParentRevision != revision || out.FutureExposed != (r.ExpectedLiveRevision > r.ParentRevision) {
		return out, ErrStorage
	}
	parent, err := DecodeDecision(parentRaw)
	if err != nil {
		return out, storageError(err)
	}
	if err = ValidateHistoricalDecision(parent); err != nil {
		return out, err
	}
	if parent.ID != r.ParentDecisionID || parent.GameID != r.ParentGameID || parent.OwnerID != owner || parent.Revision != r.ParentRevision || parent.ReceiptID != r.ParentReceiptID || parent.InputDigest != r.SourceInputDigest {
		return out, ErrStorage
	}
	verified, err := s.ReadDecision(ctx, owner, parent.ID)
	if err != nil {
		return out, err
	}
	if !SamePreparedBytes(parent, verified) {
		return out, ErrStorage
	}
	if err = validateAlternativeResult(r, out.Result); err != nil {
		return out, storageError(err)
	}
	return out, nil
}
