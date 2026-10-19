package authn

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"
)

func TestOIDCVerificationAndPKCE(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	bad, _ := rsa.GenerateKey(rand.Reader, 2048)
	var issuer, encoded string
	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{"issuer": issuer, "authorization_endpoint": issuer + "/authorize", "token_endpoint": issuer + "/token", "jwks_uri": issuer + "/keys", "id_token_signing_alg_values_supported": []string{"RS256"}})
	})
	mux.HandleFunc("/keys", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &key.PublicKey, KeyID: "key", Algorithm: "RS256", Use: "sig"}}})
	})
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"access_token": "server-only", "token_type": "Bearer", "id_token": encoded})
	})
	server := httptest.NewTLSServer(mux)
	defer server.Close()
	issuer = server.URL
	c, e := New(context.Background(), issuer, "app", "secret", "https://app.example", server.Client())
	if e != nil {
		t.Fatal(e)
	}
	u, _ := url.Parse(c.LoginURL("state", "nonce", "verifier"))
	if u.Query().Get("code_challenge_method") != "S256" || u.Query().Get("nonce") != "nonce" || u.Query().Get("max_age") != "0" {
		t.Fatal("missing PKCE/fresh login")
	}
	for _, tc := range []struct {
		name, iss, aud, nonce string
		key                   *rsa.PrivateKey
		pass                  bool
	}{{"valid", issuer, "app", "nonce", key, true}, {"issuer", "https://foreign.example", "app", "nonce", key, false}, {"audience", issuer, "other", "nonce", key, false}, {"signature", issuer, "app", "nonce", bad, false}, {"nonce", issuer, "app", "wrong", key, false}} {
		t.Run(tc.name, func(t *testing.T) {
			signer, _ := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: tc.key}, (&jose.SignerOptions{}).WithHeader("kid", "key"))
			encoded, _ = jwt.Signed(signer).Claims(map[string]any{"iss": tc.iss, "sub": "stable-subject", "aud": tc.aud, "exp": time.Now().Add(time.Minute).Unix(), "iat": time.Now().Unix(), "auth_time": time.Now().Unix(), "nonce": tc.nonce, "name": "Alice"}).Serialize()
			_, err := c.Verify(context.Background(), "code", "verifier", "nonce")
			if (err == nil) != tc.pass {
				t.Fatal("verification result", err)
			}
		})
	}
}
