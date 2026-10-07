package records

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"testing"
)

func TestM04EPlatformTrialDurableRetryAndExpiryRead(t *testing.T) {
	s, other, source, grant, a := workFixture(t, 0, true)
	ctx := localCommand(context.Background(), "review-command")
	request := json.RawMessage(`{"commandId":"review-command","gameId":"game","expectedRevision":0,"controlLeaseToken":"fixture","decisionId":"game:decision:0","trialId":"trial","alternativeCandidateId":"play:C2"}`)
	help := PlatformHelpRequest{Source: source, ExpectedLiveRevision: 0, Admission: a, DecisionID: "trial", Kind: "trial", Tool: "review-alternative", Level: 3, Unlock: true}
	first, claimed, err := s.ClaimPlatformTrial(ctx, help, request, 23)
	if err != nil || !claimed {
		t.Fatal("initial claim", err)
	}
	duplicate, claimed, err := other.ClaimPlatformTrial(ctx, help, request, 99)
	if err != nil || claimed || duplicate.Seed != 23 || duplicate.Attempt != first.Attempt {
		t.Fatal("duplicate changed original work", err)
	}
	if err = s.FailPlatformTrial(ctx, first); err != nil {
		t.Fatal(err)
	}
	retry, claimed, err := other.ClaimPlatformTrial(ctx, help, request, 99)
	if err != nil || !claimed || retry.Seed != 23 || retry.Attempt != first.Attempt+1 || !bytes.Equal(retry.Request, request) {
		t.Fatal("retry replaced original seed/request", err)
	}
	if _, err = s.pool.Exec(ctx, "UPDATE "+s.table("m04_review_jobs")+" SET expires_at=clock_timestamp()-interval '1 second' WHERE owner_id=$1 AND command_id=$2", a.OwnerID, retry.CommandID); err != nil {
		t.Fatal(err)
	}
	expired, err := s.ReadPlatformTrial(ctx, a.OwnerID, retry.CommandID)
	if err != nil || expired.Status != "expired" {
		t.Fatal("abandoned work not recoverable", err)
	}
	resumed, claimed, err := s.ClaimPlatformTrial(ctx, help, request, 101)
	if err != nil || !claimed || resumed.Attempt != retry.Attempt+1 || resumed.Seed != 23 {
		t.Fatal("restart changed seed", err)
	}
	result := json.RawMessage(`{"trialId":"trial","decisionId":"game:decision:0","label":"Possible continuation","liveRevision":0,"frames":[]}`)
	receipt := json.RawMessage(`{"commandId":"review-command","status":"completed","result":{"trialId":"trial","decisionId":"game:decision:0","label":"Possible continuation","liveRevision":0,"frames":[]}}`)
	if err = s.FinishPlatformTrial(ctx, retry, help, result, receipt); !errors.Is(err, ErrWorkStale) {
		t.Fatal("old worker crossed retry fence", err)
	}
	canceled, cancel := context.WithCancel(ctx)
	cancel()
	if err = s.FinishPlatformTrial(canceled, resumed, help, result, receipt); err == nil {
		t.Fatal("canceled worker published")
	}
	if err = other.FinishPlatformTrial(ctx, resumed, help, result, receipt); err != nil {
		t.Fatal("original output publication", err)
	}
	// Advance only this isolated fixture to expiry; the production immutable
	// grant trigger is restored before testing the retained original output.
	if err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if _, e := tx.Exec(ctx, "ALTER TABLE m03_grants DISABLE TRIGGER USER"); e != nil {
			return e
		}
		if _, e := tx.Exec(ctx, "UPDATE m03_grants SET valid_until=clock_timestamp()-interval '1 second' WHERE grant_id=$1", grant.ID); e != nil {
			return e
		}
		_, e := tx.Exec(ctx, "ALTER TABLE m03_grants ENABLE TRIGGER USER")
		return e
	}); err != nil {
		t.Fatal(err)
	}
	saved, err := other.ReadPlatformTrial(ctx, a.OwnerID, resumed.CommandID)
	if err != nil || saved.Status != "completed" || !bytes.Equal(saved.Result, result) {
		t.Fatal("natural expiry erased original result", err)
	}
	if _, err = other.ReadPlatformHelp(ctx, a.OwnerID, "game", "trial", "trial", 3); err != nil {
		t.Fatal("natural expiry erased delivered help", err)
	}
	if err = s.RevokeGrant(ctx, a.OwnerID, grant.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = other.ReadPlatformTrial(ctx, a.OwnerID, resumed.CommandID); !errors.Is(err, ErrAccess) {
		t.Fatal("revocation retained trial read", err)
	}
	if _, err = other.ReadPlatformHelp(ctx, a.OwnerID, "game", "trial", "trial", 3); !errors.Is(err, ErrAccess) {
		t.Fatal("revocation retained help read", err)
	}
}
