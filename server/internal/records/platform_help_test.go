package records

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

func TestM04EHelpPriorReceiptCannotRaceSourceRevocation(t *testing.T) {
	s, other, source, grant, a := workFixture(t, 0, true)
	prepared := localCommand(context.Background(), "publish-help")
	decision := PlatformDecisionID("game", 0)
	// Request A observes a miss, then retains this prepared context while B
	// publishes and security revocation wins before A enters its transaction.
	if _, err := s.ReadPlatformHelp(prepared, a.OwnerID, "game", decision, "advice", 1); !errors.Is(err, ErrConflict) {
		t.Fatal("expected initial miss", err)
	}
	r := PlatformHelpRequest{Source: source, ExpectedLiveRevision: 0, Admission: a, DecisionID: decision, Kind: "advice", Tool: "advice", Level: 1, Unlock: true, Content: json.RawMessage(`{"accepted":true}`), ReceiptSchema: "AcceptedView", Receipt: json.RawMessage(`{"accepted":true}`)}
	if _, err := other.PublishPlatformHelp(prepared, r); err != nil {
		t.Fatal(err)
	}
	reissue := localCommand(context.Background(), "reissue-help")
	if _, err := other.ReissuePlatformHelp(reissue, a.OwnerID, "game", decision, "advice", 1, "AcceptedView", r.Receipt); err != nil {
		t.Fatal(err)
	}
	if err := s.RevokeGrant(context.Background(), a.OwnerID, grant.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.PublishPlatformHelp(prepared, r); !errors.Is(err, ErrAccess) {
		t.Fatal("publication prior receipt bypassed source revoke", err)
	}
	if _, err := s.ReissuePlatformHelp(reissue, a.OwnerID, "game", decision, "advice", 1, "AcceptedView", r.Receipt); !errors.Is(err, ErrAccess) {
		t.Fatal("reissue prior receipt bypassed source revoke", err)
	}
}
