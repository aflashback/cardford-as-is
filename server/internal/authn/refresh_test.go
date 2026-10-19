package authn

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"errors"
	"github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestOIDCRefreshBindingAndBackchannel(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	signer, _ := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: key}, (&jose.SignerOptions{}).WithHeader("kid", "key"))
	var issuer, refreshID string
	rejected := false
	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{"issuer": issuer, "authorization_endpoint": issuer + "/authorize", "token_endpoint": issuer + "/token", "jwks_uri": issuer + "/keys", "id_token_signing_alg_values_supported": []string{"RS256"}})
	})
	mux.HandleFunc("/keys", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &key.PublicKey, KeyID: "key", Algorithm: "RS256", Use: "sig"}}})
	})
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		if r.PostForm.Get("grant_type") != "refresh_token" || r.PostForm.Get("refresh_token") != "before" {
			t.Error("wrong refresh request")
		}
		w.Header().Set("Content-Type", "application/json")
		if rejected {
			w.WriteHeader(400)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid_grant"})
			return
		}
		json.NewEncoder(w).Encode(map[string]any{"access_token": "access", "refresh_token": "rotated", "expires_in": 900, "refresh_expires_in": 7776000, "id_token": refreshID})
	})
	server := httptest.NewTLSServer(mux)
	defer server.Close()
	issuer = server.URL
	client, err := New(context.Background(), issuer, "app", "secret", "https://app.example", server.Client())
	if err != nil {
		t.Fatal(err)
	}
	oldAuth := time.Now().Add(-24 * time.Hour).Unix()
	for _, subject := range []string{"subject", "different"} {
		refreshID, _ = jwt.Signed(signer).Claims(map[string]any{"iss": issuer, "sub": subject, "aud": "app", "exp": time.Now().Add(time.Minute).Unix(), "iat": time.Now().Unix(), "auth_time": oldAuth, "nonce": "original", "sid": "sid"}).Serialize()
		out, err := client.Refresh(context.Background(), Identity{Issuer: issuer, Subject: "subject", SID: "sid"}, TokenBundle{RefreshToken: "before", Nonce: "original", AuthTime: oldAuth})
		if subject == "subject" {
			if err != nil || out.RefreshToken != "rotated" {
				t.Fatal("ordinary refresh required fresh login", err)
			}
		} else if !errors.Is(err, ErrRefreshRejected) {
			t.Fatal("changed subject accepted", err)
		}
	}
	rejected = true
	if _, err := client.Refresh(context.Background(), Identity{}, TokenBundle{RefreshToken: "before"}); !errors.Is(err, ErrRefreshRejected) {
		t.Fatal("invalid grant not terminal", err)
	}
	for _, mode := range []string{"valid", "wrong-audience", "nonce", "stale", "missing-sid", "wrong-event", "expired"} {
		t.Run(mode, func(t *testing.T) {
			claims := map[string]any{"iss": issuer, "aud": "app", "iat": time.Now().Unix(), "jti": "event", "sid": "sid", "events": map[string]any{"http://schemas.openid.net/event/backchannel-logout": map[string]any{}}}
			switch mode {
			case "expired":
				claims["exp"] = time.Now().Add(-time.Minute).Unix()
			case "wrong-audience":
				claims["aud"] = "other"
			case "nonce":
				claims["nonce"] = "forbidden"
			case "stale":
				claims["iat"] = time.Now().Add(-10 * time.Minute).Unix()
			case "missing-sid":
				delete(claims, "sid")
			case "wrong-event":
				claims["events"] = map[string]any{"wrong": map[string]any{}}
			}
			raw, _ := jwt.Signed(signer).Claims(claims).Serialize()
			_, err := client.VerifyLogout(context.Background(), raw)
			if (err == nil) != (mode == "valid") {
				t.Fatal("logout validation", err)
			}
		})
	}
}
