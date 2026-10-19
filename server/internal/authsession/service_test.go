package authsession

import (
	"cardford/server/internal/authn"
	"cardford/server/internal/records"
	"context"
	"encoding/base64"
	"errors"
	"strings"
	"testing"
	"time"
)

type testRecords struct {
	Records
	family                                 records.SessionFamily
	saved                                  records.RenewableLogin
	claimed, uncertain, revoked, committed bool
	commitContextLive                      bool
}

func (r *testRecords) LoginRenewable(_ context.Context, v records.RenewableLogin) (records.Identity, error) {
	r.saved = v
	return records.Identity{Token: v.Token}, nil
}
func (r *testRecords) RememberedSession(context.Context, string) (records.SessionFamily, error) {
	if r.revoked {
		return records.SessionFamily{}, records.ErrUnauthenticated
	}
	return r.family, nil
}
func (r *testRecords) ClaimRefresh(_ context.Context, _ string, op string) (records.SessionFamily, bool, error) {
	r.family.Operation = op
	r.claimed = true
	return r.family, true, nil
}
func (r *testRecords) CompleteRefresh(ctx context.Context, f records.SessionFamily, key string, raw []byte, a, p time.Time) error {
	r.commitContextLive = ctx.Err() == nil
	if r.revoked {
		return records.ErrUnauthenticated
	}
	r.committed = true
	r.family.Ciphertext = raw
	return nil
}
func (r *testRecords) MarkRefreshUncertain(context.Context, records.SessionFamily) error {
	r.uncertain = true
	return nil
}
func (r *testRecords) RevokeRemembered(context.Context, string) (records.Principal, error) {
	r.revoked = true
	return records.Principal{}, nil
}

type testProvider struct {
	fn func(context.Context, authn.Identity, authn.TokenBundle) (authn.TokenBundle, error)
	Provider
}

func (p testProvider) Refresh(ctx context.Context, id authn.Identity, b authn.TokenBundle) (authn.TokenBundle, error) {
	return p.fn(ctx, id, b)
}
func TestAuthVaultBindingAndMissingKey(t *testing.T) {
	if _, err := New(nil, nil, "", "test"); err == nil {
		t.Fatal("missing vault accepted")
	}
	key := base64.RawURLEncoding.EncodeToString(make([]byte, 32))
	s, err := New(nil, nil, key, "test")
	if err != nil {
		t.Fatal(err)
	}
	secret := authn.TokenBundle{RefreshToken: "secret-provider-refresh", AccessToken: "secret-provider-access"}
	sealed, err := s.seal("family", secret)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(sealed), secret.RefreshToken) {
		t.Fatal("plaintext persisted")
	}
	f := records.SessionFamily{ID: "family", KeyID: "test", Ciphertext: sealed}
	if b, e := s.open(f); e != nil || b.RefreshToken != secret.RefreshToken {
		t.Fatal("cannot recover encrypted bundle", e)
	}
	f.ID = "different-family"
	if _, e := s.open(f); e == nil {
		t.Fatal("family binding bypass")
	}
	f.ID = "family"
	f.KeyID = "other-key"
	if _, e := s.open(f); e == nil {
		t.Fatal("key ID bypass")
	}
}
func TestAuthRefreshProviderFailureAndLostBrowserResponse(t *testing.T) {
	for _, mode := range []string{"success-after-browser-disconnect", "rejected", "ambiguous", "replacement"} {
		t.Run(mode, func(t *testing.T) {
			r := &testRecords{family: records.SessionFamily{ID: "stable-family", KeyID: "test", Issuer: "issuer", Subject: "subject", ProviderSID: "sid"}}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			p := testProvider{fn: func(ctx context.Context, id authn.Identity, b authn.TokenBundle) (authn.TokenBundle, error) {
				if id.Subject != "subject" || id.SID != "sid" || b.RefreshToken != "refresh-before" {
					t.Fatal("provider identity lost")
				}
				switch mode {
				case "rejected":
					return authn.TokenBundle{}, authn.ErrRefreshRejected
				case "ambiguous":
					return authn.TokenBundle{}, authn.ErrRefreshUncertain
				case "replacement":
					r.revoked = true
				case "success-after-browser-disconnect":
					cancel()
				}
				return authn.TokenBundle{RefreshToken: "rotated", AccessExpiresAt: time.Now().Add(time.Minute)}, nil
			}}
			s, err := New(r, p, base64.RawURLEncoding.EncodeToString(make([]byte, 32)), "test")
			if err != nil {
				t.Fatal(err)
			}
			r.family.Ciphertext, err = s.seal(r.family.ID, authn.TokenBundle{RefreshToken: "refresh-before"})
			if err != nil {
				t.Fatal(err)
			}
			err = s.Refresh(ctx, "stable-cookie")
			switch mode {
			case "success-after-browser-disconnect":
				if err != nil || !r.committed || !r.commitContextLive {
					t.Fatal("rotated token lost on disconnect", err)
				}
			case "rejected":
				if !r.revoked || !errors.Is(err, authn.ErrRefreshRejected) {
					t.Fatal("rejected token live", err)
				}
			case "ambiguous":
				if !r.uncertain || r.committed {
					t.Fatal("ambiguous token replayable", err)
				}
			case "replacement":
				if r.committed || !errors.Is(err, records.ErrUnauthenticated) {
					t.Fatal("replacement restored", err)
				}
			}
		})
	}
}
