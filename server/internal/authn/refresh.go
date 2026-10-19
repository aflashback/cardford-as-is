package authn

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type TokenBundle struct {
	AccessToken, RefreshToken, IDToken string
	AccessExpiresAt, RefreshExpiresAt  time.Time
	Nonce                              string
	AuthTime                           int64
}

var ErrRefreshRejected = errors.New("provider refresh rejected")
var ErrRefreshUncertain = errors.New("provider refresh outcome uncertain")

type LogoutEvent struct{ Issuer, SID, ID string }

func tokenBundle(token *oauth2.Token) TokenBundle {
	b := TokenBundle{AccessToken: token.AccessToken, RefreshToken: token.RefreshToken, AccessExpiresAt: token.Expiry}
	b.IDToken, _ = token.Extra("id_token").(string)
	switch n := token.Extra("refresh_expires_in").(type) {
	case float64:
		if n > 0 {
			b.RefreshExpiresAt = time.Now().Add(time.Duration(n) * time.Second)
		}
	case json.Number:
		if v, e := n.Int64(); e == nil && v > 0 {
			b.RefreshExpiresAt = time.Now().Add(time.Duration(v) * time.Second)
		}
	}
	return b
}
func (c *Client) Refresh(ctx context.Context, original Identity, b TokenBundle) (TokenBundle, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	form := url.Values{"grant_type": {"refresh_token"}, "refresh_token": {b.RefreshToken}, "client_id": {c.oauth.ClientID}, "client_secret": {c.oauth.ClientSecret}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.oauth.Endpoint.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return TokenBundle{}, ErrRefreshUncertain
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := c.http.Do(req)
	if err != nil {
		return TokenBundle{}, ErrRefreshUncertain
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return TokenBundle{}, ErrRefreshUncertain
	}
	var out struct {
		Access         string `json:"access_token"`
		Refresh        string `json:"refresh_token"`
		ID             string `json:"id_token"`
		Expires        int64  `json:"expires_in"`
		RefreshExpires int64  `json:"refresh_expires_in"`
		Error          string `json:"error"`
	}
	if json.Unmarshal(raw, &out) != nil {
		return TokenBundle{}, ErrRefreshUncertain
	}
	if resp.StatusCode != 200 {
		if out.Error == "invalid_grant" || out.Error == "invalid_client" {
			return TokenBundle{}, ErrRefreshRejected
		}
		return TokenBundle{}, ErrRefreshUncertain
	}
	if out.Access == "" || out.Refresh == "" || out.Expires <= 0 {
		return TokenBundle{}, ErrRefreshUncertain
	}
	if out.ID != "" {
		id, e := c.verifier.Verify(oidc.ClientContext(ctx, c.http), out.ID)
		if e != nil {
			return TokenBundle{}, ErrRefreshRejected
		}
		var claims struct {
			AuthorizedParty string `json:"azp"`
			SID             string `json:"sid"`
			AuthTime        int64  `json:"auth_time"`
		}
		if id.Claims(&claims) != nil || id.Issuer != original.Issuer || id.Subject != original.Subject || (claims.AuthorizedParty != "" && claims.AuthorizedParty != c.oauth.ClientID) || (claims.SID != "" && claims.SID != original.SID) {
			return TokenBundle{}, ErrRefreshRejected
		}
		if (id.Nonce != "" && id.Nonce != b.Nonce) || (claims.AuthTime != 0 && claims.AuthTime != b.AuthTime) {
			return TokenBundle{}, ErrRefreshRejected
		}
	}
	result := TokenBundle{AccessToken: out.Access, RefreshToken: out.Refresh, IDToken: out.ID, AccessExpiresAt: time.Now().Add(time.Duration(out.Expires) * time.Second)}
	result.Nonce = b.Nonce
	result.AuthTime = b.AuthTime
	if out.RefreshExpires > 0 {
		result.RefreshExpiresAt = time.Now().Add(time.Duration(out.RefreshExpires) * time.Second)
	}
	return result, nil
}
func (c *Client) VerifyLogout(ctx context.Context, raw string) (LogoutEvent, error) {
	id, err := c.logoutVerifier.Verify(oidc.ClientContext(ctx, c.http), raw)
	if err != nil {
		return LogoutEvent{}, errors.New("logout token rejected")
	}
	var claims struct {
		ID      string                     `json:"jti"`
		SID     string                     `json:"sid"`
		Issued  int64                      `json:"iat"`
		Expires *int64                     `json:"exp"`
		Nonce   *string                    `json:"nonce"`
		Events  map[string]json.RawMessage `json:"events"`
	}
	if id.Claims(&claims) != nil {
		return LogoutEvent{}, errors.New("logout claims rejected")
	}
	if claims.Expires != nil && *claims.Expires <= time.Now().Unix() {
		return LogoutEvent{}, errors.New("logout token expired")
	}
	event, ok := claims.Events["http://schemas.openid.net/event/backchannel-logout"]
	var marker map[string]any
	if !ok || json.Unmarshal(event, &marker) != nil || marker == nil || id.Issuer != c.issuer || claims.ID == "" || len(claims.ID) > 512 || claims.SID == "" || len(claims.SID) > 512 || claims.Nonce != nil || claims.Issued <= 0 || time.Since(time.Unix(claims.Issued, 0)) > 5*time.Minute || time.Unix(claims.Issued, 0).After(time.Now().Add(time.Minute)) {
		return LogoutEvent{}, errors.New("logout binding rejected")
	}
	return LogoutEvent{Issuer: id.Issuer, SID: claims.SID, ID: claims.ID}, nil
}
