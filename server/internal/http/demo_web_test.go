package http

import (
	"bytes"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

var coachPosePaths = []string{"rally/regular-waiting-v2.png", "rally/regular-whistle-v3.png",
	"rally/regular-thinking-v2.png", "rally/regular-explaining-v2.png", "rally/regular-reading-v8.png"}

func TestDemoWebDeliversOnlyApprovedCoachPNGs(t *testing.T) {
	dist := demoWebFixture(t)
	if err := os.MkdirAll(filepath.Join(dist, "rally"), 0700); err != nil {
		t.Fatal(err)
	}
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, image.NewNRGBA(image.Rect(0, 0, 1, 1))); err != nil {
		t.Fatal(err)
	}
	for _, name := range coachPosePaths {
		if err := os.WriteFile(filepath.Join(dist, filepath.FromSlash(name)), encoded.Bytes(), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, name := range []string{"README.md", "unapproved.png", "regular-waiting-v2.png.map", ".private.png"} {
		if err := os.WriteFile(filepath.Join(dist, "rally", name), []byte("SECRET"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	h, err := NewDemoWeb(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Fatal("asset request reached API") }), dist, "http://127.0.0.1:4190")
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range coachPosePaths {
		for _, method := range []string{"GET", "HEAD"} {
			w := httptest.NewRecorder()
			h.ServeHTTP(w, localRequest(method, "/"+name, ""))
			if w.Code != 200 || w.Header().Get("Content-Type") != "image/png" || w.Header().Get("Content-Length") == "" || w.Header().Get("X-Content-Type-Options") != "nosniff" {
				t.Fatalf("%s %s: %d %v", method, name, w.Code, w.Header())
			}
			if method == "GET" && !bytes.Equal(w.Body.Bytes(), encoded.Bytes()) {
				t.Fatalf("PNG bytes changed: %s", name)
			}
			if method == "HEAD" && w.Body.Len() != 0 {
				t.Fatalf("HEAD returned image body: %s", name)
			}
			if !strings.Contains(w.Header().Get("Content-Security-Policy"), "img-src 'self' data:") {
				t.Fatal("same-origin images blocked")
			}
		}
	}
	for _, name := range []string{"/rally/", "/rally/README.md", "/rally/unapproved.png", "/rally/regular-waiting-v2.png.map", "/rally/.private.png", "/rally/%2e%2e/index.html", "/rally/regular-waiting-v2.png?secret=1"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, localRequest("GET", name, ""))
		if w.Code != 404 || strings.Contains(w.Body.String(), "SECRET") {
			t.Fatalf("unapproved path served: %s: %d", name, w.Code)
		}
	}
	if err := os.WriteFile(filepath.Join(dist, filepath.FromSlash(coachPosePaths[0])), []byte("CHANGED"), 0600); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, localRequest("GET", "/"+coachPosePaths[0], ""))
	if !bytes.Equal(w.Body.Bytes(), encoded.Bytes()) {
		t.Fatal("Coach asset changed after startup")
	}
}

func demoWebFixture(t *testing.T) string {
	t.Helper()
	dist := t.TempDir()
	for name, body := range map[string]string{
		"index.html":    `<html><script src="/assets/app.js"></script></html>`,
		"assets/app.js": "window.example=true;", "assets/app.css": "body{color:black}",
		"assets/font.woff2": "font", "brand/cardford-symbol.svg": "<svg></svg>",
		"favicon.svg": "<svg></svg>", "licenses/react.txt": "license",
		".env": "SECRET", "assets/hidden.map": "SECRET", "private/readme.txt": "SECRET",
	} {
		path := filepath.Join(dist, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(body), 0600); err != nil {
			t.Fatal(err)
		}
	}
	return dist
}

func TestDemoWebServesOnlyInstalledAssetsAndDelegatesAPI(t *testing.T) {
	dist := demoWebFixture(t)
	apiCalls := 0
	api := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		apiCalls++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(418)
		_, _ = w.Write([]byte(`{"code":"API_ONLY"}`))
	})
	h, err := NewDemoWeb(api, dist, "http://127.0.0.1:4190")
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/", "/index.html", "/assets/app.js", "/assets/app.css", "/assets/font.woff2", "/brand/cardford-symbol.svg", "/favicon.svg", "/licenses/react.txt"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, localRequest("GET", path, ""))
		if w.Code != 200 || w.Body.Len() == 0 || w.Header().Get("Cache-Control") != "no-store" || w.Header().Get("X-Content-Type-Options") != "nosniff" {
			t.Fatalf("asset %s: %d %v %s", path, w.Code, w.Header(), w.Body.String())
		}
		if !strings.Contains(w.Header().Get("Content-Security-Policy"), "connect-src 'self'") {
			t.Fatal("missing same-origin CSP")
		}
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, localRequest("HEAD", "/assets/app.js", ""))
	if w.Code != 200 || w.Body.Len() != 0 || w.Header().Get("Content-Length") == "" {
		t.Fatalf("HEAD: %d %s", w.Code, w.Body.String())
	}
	for _, path := range []string{"/api/demo/frame", "/api/unknown"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, localRequest("POST", path, `{}`))
		if w.Code != 418 || w.Body.String() != `{"code":"API_ONLY"}` {
			t.Fatalf("API fell through to HTML: %d %s", w.Code, w.Body.String())
		}
	}
	if apiCalls != 2 {
		t.Fatalf("unexpected API calls %d", apiCalls)
	}
}

func TestDemoWebRejectsEscapeBrowseCrossOriginAndUnsupportedPaths(t *testing.T) {
	h, err := NewDemoWeb(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Fatal("invalid path reached API") }), demoWebFixture(t), "http://127.0.0.1:4190")
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/assets/", "/licenses/", "/missing", "/.env", "/assets/hidden.map", "/private/readme.txt", "/assets/../index.html", "/assets/%2e%2e/index.html", "/%2e%2e/secret", "/assets%2fapp.js", "/assets/app.js?secret=1", "/assets/app.js?", "/assets/app.js/", "//assets/app.js", "/assets/app%5c.js"} {
		t.Run(path, func(t *testing.T) {
			w := httptest.NewRecorder()
			h.ServeHTTP(w, localRequest("GET", path, ""))
			if w.Code != 404 || strings.Contains(w.Body.String(), "SECRET") {
				t.Fatalf("path exposed data: %d %s", w.Code, w.Body.String())
			}
		})
	}
	for _, change := range []func(*http.Request){
		func(r *http.Request) { r.Host = "evil.example" },
		func(r *http.Request) { r.Header.Set("Origin", "http://evil.example") },
		func(r *http.Request) { r.Header.Set("Origin", "null") },
		func(r *http.Request) { r.Header.Add("Origin", "http://127.0.0.1:4190") },
	} {
		r := localRequest("GET", "/", "")
		change(r)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != 403 {
			t.Fatalf("cross-origin static request accepted: %d", w.Code)
		}
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, localRequest("POST", "/index.html", `{}`))
	if w.Code != 405 {
		t.Fatalf("static mutation accepted: %d", w.Code)
	}
}

func TestDemoWebRequiresTrustedBuildAndFreezesItAtStartup(t *testing.T) {
	api := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})
	dist := demoWebFixture(t)
	for _, origin := range []string{"https://example.com", "http://127.0.0.1:4190/", "http://127.0.0.1:4190?x=1", "http://user@127.0.0.1:4190", "http://127.0.0.1:4190#x"} {
		if _, err := NewDemoWeb(api, dist, origin); err == nil {
			t.Fatalf("invalid origin accepted: %s", origin)
		}
	}
	if _, err := NewDemoWeb(nil, dist, "http://127.0.0.1:4190"); err == nil {
		t.Fatal("missing API accepted")
	}
	if _, err := NewDemoWeb(api, t.TempDir(), "http://127.0.0.1:4190"); err == nil {
		t.Fatal("missing index accepted")
	}
	h, err := NewDemoWeb(api, dist, "http://127.0.0.1:4190")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dist, "assets", "app.js"), []byte("CHANGED"), 0600); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, localRequest("GET", "/assets/app.js", ""))
	if w.Body.String() != "window.example=true;" {
		t.Fatalf("build changed after startup: %s", w.Body.String())
	}
}

func TestDemoWebRejectsSymlinkedBuildAsset(t *testing.T) {
	dist := demoWebFixture(t)
	secret := filepath.Join(t.TempDir(), "secret.js")
	if err := os.WriteFile(secret, []byte("SECRET"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(secret, filepath.Join(dist, "assets", "linked.js")); err != nil {
		t.Skipf("native symlink unavailable: %v", err)
	}
	if _, err := NewDemoWeb(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}), dist, "http://127.0.0.1:4190"); err == nil {
		t.Fatal("symlinked build accepted")
	}
}
