// Package authn verifies provider credentials; storage sees only verified identity.
package authn

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
	"net/http"
	"net/url"
	"time"
)

type Client struct {
	issuer         string
	oauth          oauth2.Config
	verifier       *oidc.IDTokenVerifier
	logoutVerifier *oidc.IDTokenVerifier
	http           *http.Client
}
type Identity struct {
	Issuer, Subject, Name, SID string
	Tokens                     TokenBundle
}

func Random() string {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic("secure randomness unavailable")
	}
	return base64.RawURLEncoding.EncodeToString(b[:])
}
func New(ctx context.Context, issuer, clientID, secret, origin string, httpClient *http.Client) (*Client, error) {
	for _, raw := range []string{issuer, origin} {
		u, err := url.Parse(raw)
		if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
			return nil, errors.New("auth requires exact HTTPS URLs")
		}
	}
	ctx = oidc.ClientContext(ctx, httpClient)
	p, err := oidc.NewProvider(ctx, issuer)
	if err != nil {
		return nil, errors.New("OIDC discovery unavailable")
	}
	return &Client{issuer: issuer, http: httpClient, oauth: oauth2.Config{ClientID: clientID, ClientSecret: secret, Endpoint: p.Endpoint(), RedirectURL: origin + "/auth/callback", Scopes: []string{oidc.ScopeOpenID, "profile"}}, logoutVerifier: p.Verifier(&oidc.Config{ClientID: clientID, SupportedSigningAlgs: []string{"RS256"}, SkipExpiryCheck: true}), verifier: p.Verifier(&oidc.Config{ClientID: clientID, SupportedSigningAlgs: []string{"RS256"}})}, nil
}
func (c *Client) LoginURL(state, nonce, verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return c.oauth.AuthCodeURL(state, oidc.Nonce(nonce), oauth2.SetAuthURLParam("code_challenge", base64.RawURLEncoding.EncodeToString(sum[:])), oauth2.SetAuthURLParam("code_challenge_method", "S256"), oauth2.SetAuthURLParam("prompt", "login"), oauth2.SetAuthURLParam("max_age", "0"))
}
func (c *Client) Verify(ctx context.Context, code, verifier, nonce string) (Identity, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	ctx = oidc.ClientContext(ctx, c.http)
	token, err := c.oauth.Exchange(ctx, code, oauth2.SetAuthURLParam("code_verifier", verifier))
	if err != nil {
		return Identity{}, errors.New("code exchange rejected")
	}
	raw, ok := token.Extra("id_token").(string)
	if !ok {
		return Identity{}, errors.New("missing ID token")
	}
	id, err := c.verifier.Verify(ctx, raw)
	if err != nil {
		return Identity{}, errors.New("ID token rejected")
	}
	var claims struct {
		Name            string `json:"name"`
		SID             string `json:"sid"`
		AuthTime        int64  `json:"auth_time"`
		AuthorizedParty string `json:"azp"`
	}
	if id.Claims(&claims) != nil || id.Issuer != c.issuer || id.Subject == "" || subtle.ConstantTimeCompare([]byte(id.Nonce), []byte(nonce)) != 1 || (claims.AuthorizedParty != "" && claims.AuthorizedParty != c.oauth.ClientID) || claims.AuthTime <= 0 || time.Since(time.Unix(claims.AuthTime, 0)) > 5*time.Minute || time.Unix(claims.AuthTime, 0).After(time.Now().Add(time.Minute)) {
		return Identity{}, errors.New("identity binding rejected")
	}
	name := claims.Name
	if name == "" || len(name) > 200 {
		name = "Player"
	}
	bundle := tokenBundle(token)
	bundle.Nonce = id.Nonce
	bundle.AuthTime = claims.AuthTime
	return Identity{Issuer: id.Issuer, Subject: id.Subject, Name: name, SID: claims.SID, Tokens: bundle}, nil
}
