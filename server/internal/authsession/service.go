// Package authsession owns the application login lifecycle. Provider calls never
// hold SQL transactions; durable operation fencing owns refresh serialization.
package authsession

import (
	"cardford/server/internal/authn"
	"cardford/server/internal/records"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"time"
)

type Provider interface {
	Refresh(context.Context, authn.Identity, authn.TokenBundle) (authn.TokenBundle, error)
	VerifyLogout(context.Context, string) (authn.LogoutEvent, error)
}
type Records interface {
	LoginRenewable(context.Context, records.RenewableLogin) (records.Identity, error)
	RememberedSession(context.Context, string) (records.SessionFamily, error)
	ClaimRefresh(context.Context, string, string) (records.SessionFamily, bool, error)
	CompleteRefresh(context.Context, records.SessionFamily, string, []byte, time.Time, time.Time) error
	MarkRefreshUncertain(context.Context, records.SessionFamily) error
	RevokeRemembered(context.Context, string) (records.Principal, error)
	RevokeProviderSession(context.Context, string, string, string) ([]records.Principal, error)
}
type Service struct {
	store    Records
	provider Provider
	vault    cipher.AEAD
	keyID    string
	changed  func(records.Principal)
}

func New(store Records, provider Provider, key, keyID string) (*Service, error) {
	raw, err := base64.RawURLEncoding.DecodeString(key)
	if err != nil || len(raw) != 32 || keyID == "" || len(keyID) > 100 {
		return nil, errors.New("server token encryption key unavailable")
	}
	block, err := aes.NewCipher(raw)
	if err != nil {
		return nil, err
	}
	vault, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Service{store: store, provider: provider, vault: vault, keyID: keyID}, nil
}
func (s *Service) SetSessionChanged(fn func(records.Principal)) { s.changed = fn }
func (s *Service) notify(p records.Principal) {
	if s.changed != nil && p.OwnerID != "" {
		s.changed(p)
	}
}
func (s *Service) seal(family string, b authn.TokenBundle) ([]byte, error) {
	raw, err := json.Marshal(b)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, s.vault.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return nil, err
	}
	return s.vault.Seal(nonce, nonce, raw, []byte(s.keyID+":"+family)), nil
}
func (s *Service) open(f records.SessionFamily) (authn.TokenBundle, error) {
	var b authn.TokenBundle
	n := s.vault.NonceSize()
	if f.KeyID != s.keyID || len(f.Ciphertext) < n {
		return b, records.ErrUnauthenticated
	}
	raw, err := s.vault.Open(nil, f.Ciphertext[:n], f.Ciphertext[n:], []byte(f.KeyID+":"+f.ID))
	if err != nil {
		return b, records.ErrUnauthenticated
	}
	if json.Unmarshal(raw, &b) != nil || b.RefreshToken == "" {
		return b, records.ErrUnauthenticated
	}
	return b, nil
}
func (s *Service) Login(ctx context.Context, id authn.Identity) (records.Identity, error) {
	if id.Tokens.RefreshToken == "" || id.SID == "" {
		return records.Identity{}, records.ErrUnauthenticated
	}
	token := authn.Random()
	ciphertext, err := s.seal(records.SessionID(token), id.Tokens)
	if err != nil {
		return records.Identity{}, err
	}
	result, err := s.store.LoginRenewable(ctx, records.RenewableLogin{Token: token, Issuer: id.Issuer, Subject: id.Subject, Name: id.Name, ProviderSID: id.SID, KeyID: s.keyID, Ciphertext: ciphertext, AccessExpiresAt: id.Tokens.AccessExpiresAt, ProviderExpiresAt: id.Tokens.RefreshExpiresAt})
	if err == nil {
		s.notify(result.Principal)
	}
	return result, err
}
func (s *Service) Status(ctx context.Context, token string) (records.SessionFamily, string, error) {
	f, err := s.store.RememberedSession(ctx, token)
	if errors.Is(err, records.ErrUnauthenticated) {
		state := "reauthentication-required"
		if token == "" {
			state = "signed-out"
		}
		return f, state, nil
	}
	if err != nil {
		return f, "", err
	}
	if f.KeyID != s.keyID || f.Uncertain || (f.Operation != "" && f.LeaseUntil != nil && !f.LeaseUntil.After(f.ServerTime)) {
		return f, "reauthentication-required", nil
	}
	if !f.AccessExpiresAt.After(f.ServerTime) {
		return f, "renewal-required", nil
	}
	return f, "authenticated", nil
}
func (s *Service) Refresh(ctx context.Context, token string) error {
	// Bound overlap waiting; never redeem the same credential twice.
	deadline := time.NewTimer(12 * time.Second)
	defer deadline.Stop()
	for {
		f, claimed, err := s.store.ClaimRefresh(ctx, token, authn.Random())
		if errors.Is(err, records.ErrRefreshBusy) {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-deadline.C:
				return records.ErrRefreshBusy
			case <-time.After(50 * time.Millisecond):
				continue
			}
		}
		if err != nil {
			return err
		}
		if !claimed {
			return nil
		}
		bundle, err := s.open(f)
		if err != nil {
			_, _ = s.Logout(context.WithoutCancel(ctx), token)
			return err
		}
		next, err := s.provider.Refresh(ctx, authn.Identity{Issuer: f.Issuer, Subject: f.Subject, SID: f.ProviderSID}, bundle)
		if err != nil {
			cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 3*time.Second)
			defer cancel()
			if errors.Is(err, authn.ErrRefreshRejected) {
				_, _ = s.Logout(cleanup, token)
			} else {
				_ = s.store.MarkRefreshUncertain(cleanup, f)
			}
			return err
		}
		encrypted, err := s.seal(f.ID, next)
		if err != nil {
			return err
		}
		// A disconnected browser does not discard a successfully rotated credential.
		commit, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		err = s.store.CompleteRefresh(commit, f, s.keyID, encrypted, next.AccessExpiresAt, next.RefreshExpiresAt)
		if err == nil {
			s.notify(f.Principal)
		} else {
			_ = s.store.MarkRefreshUncertain(commit, f)
		}
		return err
	}
}
func (s *Service) Logout(ctx context.Context, token string) (records.Principal, error) {
	p, err := s.store.RevokeRemembered(ctx, token)
	if err == nil {
		s.notify(p)
	}
	return p, err
}
func (s *Service) Backchannel(ctx context.Context, token string) error {
	event, err := s.provider.VerifyLogout(ctx, token)
	if err != nil {
		return err
	}
	principals, err := s.store.RevokeProviderSession(ctx, event.Issuer, event.SID, event.ID)
	if err == nil {
		for _, p := range principals {
			s.notify(p)
		}
	}
	return err
}

// RunCleanup uses one bounded process worker. Revocation remains transactional;
// this only removes no-longer-usable secret material and expired event metadata.
func (s *Service) RunCleanup(ctx context.Context) {
	cleaner, ok := s.store.(interface{ CleanupAuthSecrets(context.Context) error })
	if !ok {
		return
	}
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		_ = cleaner.CleanupAuthSecrets(ctx)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
