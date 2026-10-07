package service

import (
	"cardford/server/internal/conformance"
	"cardford/server/internal/gamekernel"
	transport "cardford/server/internal/http"
	"cardford/server/internal/records"
	"context"
	"crypto/subtle"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// Only the test binary contains this constructor. Normal startup has no token
// module or fixture routes. It owns the private schema created by the existing
// test helper and exits gracefully so its registered cleanup always runs.
func TestM06TokenBrowserFixtureHost(t *testing.T) {
	if os.Getenv("M06_TOKEN_BROWSER_FIXTURE") != "1" {
		t.Skip("opt-in token browser fixture")
		return
	}
	ready, assets, nonce := os.Getenv("M06_READY_FILE"), os.Getenv("M06_WEB_ROOT"), os.Getenv("M06_FIXTURE_NONCE")
	if ready == "" || assets == "" || len(nonce) < 32 {
		t.Fatal("explicit test fixture paths/nonce required")
	}
	if _, e := os.Stat(filepath.Join(assets, "index.html")); e != nil {
		t.Fatal(e)
	}
	registry, e := conformance.TokenRegistry()
	if e != nil {
		t.Fatal(e)
	}
	codec, e := records.NewServiceCodecWithRegistry(registry)
	if e != nil {
		t.Fatal(e)
	}
	a, _, _ := serviceStoresWithCodec(t, codec)
	app, e := New(a, codec)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(app.Close)
	host := httptest.NewUnstartedServer(nil)
	origin := "http://" + host.Listener.Addr().String()
	local, e := transport.NewLocal(app, transport.LocalOptions{Origin: origin})
	if e != nil {
		t.Fatal(e)
	}
	done := make(chan struct{})
	var stopped sync.Once
	mux := http.NewServeMux()
	mux.Handle("/api/", local)
	trusted := func(w http.ResponseWriter, r *http.Request) bool {
		if r.Method != "POST" || r.Header.Get("Origin") != origin || subtle.ConstantTimeCompare([]byte(r.Header.Get("X-M06-Fixture")), []byte(nonce)) != 1 {
			http.Error(w, "test fixture authorization denied", http.StatusForbidden)
			return false
		}
		return true
	}
	mux.HandleFunc("/__m06/grants", func(w http.ResponseWriter, r *http.Request) {
		if !trusted(w, r) {
			return
		}
		cookie, e := r.Cookie(transport.LocalCookieName)
		if e != nil {
			http.Error(w, "identity required", 401)
			return
		}
		principal, e := a.Authenticate(r.Context(), cookie.Value)
		if e != nil {
			http.Error(w, "identity invalid", 401)
			return
		}
		var q struct {
			Variant string `json:"variant"`
		}
		raw, e := io.ReadAll(io.LimitReader(r.Body, 1025))
		if e != nil || len(raw) > 1024 {
			http.Error(w, "body budget", 400)
			return
		}
		if e = gamekernel.DecodeSessionJSON(raw, &q); e != nil {
			http.Error(w, "invalid fixture grant", 400)
			return
		}
		if _, e = conformance.TokenPin(q.Variant); e != nil {
			http.Error(w, "unsupported fixture variant", 400)
			return
		}
		grant := records.Grant{ID: records.LocalGrantID(principal.OwnerID, conformance.TokenGameID, q.Variant), OwnerID: principal.OwnerID, OfferID: "token-test-fixture", OfferVersion: "1.0.0", SourceKind: "free", SourceID: "test-only-browser-host", ValidFrom: time.Now().Add(-time.Minute), Terms: records.GrantTerms{Version: "1.0.0", Game: conformance.TokenGameID, Variant: q.Variant, CanPlay: true, CanCoach: true, Tools: []string{"advice"}, BucketID: "token-fixture-unlimited", Period: "lifetime", Timezone: "UTC", Unlimited: true, ExpiryRule: "finish-admitted-unit"}}
		if e = a.PutGrant(context.Background(), grant); e != nil {
			http.Error(w, e.Error(), 500)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"granted":true}`))
	})
	mux.HandleFunc("/__m06/stop", func(w http.ResponseWriter, r *http.Request) {
		if !trusted(w, r) {
			return
		}
		stopped.Do(func() { close(done) })
		w.WriteHeader(http.StatusNoContent)
	})
	files := http.FileServer(http.Dir(assets))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/__m06/") {
			http.NotFound(w, r)
			return
		}
		files.ServeHTTP(w, r)
	})
	host.Config.Handler = mux
	host.Start()
	t.Cleanup(host.Close)
	data, _ := json.Marshal(map[string]string{"origin": origin, "mode": "test-only-real-service", "provider": "off"})
	if e = os.WriteFile(ready, data, 0600); e != nil {
		t.Fatal(e)
	}
	select {
	case <-done:
	case <-time.After(140 * time.Second):
		t.Fatal("browser fixture deadline; acceptance pending/unverified")
	}
}
