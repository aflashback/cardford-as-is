package http

import (
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
)

// NewDemoWeb adds the explicitly selected trusted frontend build to a local
// API listener for MG-15 acceptance. Only fixed public asset paths are served;
// arbitrary paths and unknown API routes never fall back to index.html.
// The bounded build is captured at startup, avoiding request-time filesystem
// traversal and retaining the same bytes throughout a browser acceptance run.
func NewDemoWeb(api http.Handler, dist, origin string) (http.Handler, error) {
	u, err := url.Parse(origin)
	if api == nil || err != nil || u.Scheme != "http" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" || u.RawPath != "" || (u.Hostname() != "127.0.0.1" && u.Hostname() != "localhost" && u.Hostname() != "::1") || u.Host == "" || origin != "http://"+u.Host {
		return nil, fmt.Errorf("demo web requires an API and exact loopback HTTP origin")
	}
	root, err := filepath.Abs(dist)
	if err != nil || dist == "" {
		return nil, fmt.Errorf("missing trusted demo web build")
	}
	info, err := os.Lstat(root)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return nil, fmt.Errorf("demo web build must be a real directory")
	}
	build, err := os.OpenRoot(root)
	if err != nil {
		return nil, fmt.Errorf("open trusted demo web build: %w", err)
	}
	defer build.Close()
	assets := make(map[string]demoWebAsset)
	total := 0
	err = filepath.WalkDir(root, func(file string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if file == root {
			return nil
		}
		rel, err := filepath.Rel(root, file)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		if entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("symlink is not a trusted built asset")
		}
		if entry.IsDir() {
			top := strings.Split(rel, "/")[0]
			if top != "assets" && top != "brand" && top != "licenses" {
				return filepath.SkipDir
			}
			return nil
		}
		contentType := demoWebContentType(rel)
		if contentType == "" {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() || info.Size() > 16<<20 || info.Size() < 0 || int64(total)+info.Size() > 64<<20 {
			return fmt.Errorf("demo web build exceeds finite asset limits")
		}
		// OpenRoot keeps even concurrently replaced symlinks within the trusted
		// root; bounded reading also avoids allocation growth after the stat.
		asset, err := build.Open(rel)
		if err != nil {
			return err
		}
		body, err := io.ReadAll(io.LimitReader(asset, (16<<20)+1))
		closeErr := asset.Close()
		if err != nil {
			return err
		}
		if closeErr != nil {
			return closeErr
		}
		if len(body) > 16<<20 || total+len(body) > 64<<20 {
			return fmt.Errorf("demo web build exceeds finite asset limits")
		}
		total += len(body)
		assets["/"+rel] = demoWebAsset{body: body, contentType: contentType}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("load trusted demo web build: %w", err)
	}
	index, exists := assets["/index.html"]
	if !exists || len(index.body) == 0 {
		return nil, fmt.Errorf("demo web build lacks index.html")
	}
	assets["/"] = index
	return &demoWebHandler{api: api, origin: origin, authority: u.Host, assets: assets}, nil
}

type demoWebAsset struct {
	body        []byte
	contentType string
}
type demoWebHandler struct {
	api               http.Handler
	origin, authority string
	assets            map[string]demoWebAsset
}

func (h *demoWebHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "same-origin")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'")
	if r.Host != h.authority || len(r.Header.Values("Origin")) > 1 || (r.Header.Get("Origin") != "" && r.Header.Get("Origin") != h.origin) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	if r.URL.Path == "/api" || strings.HasPrefix(r.URL.Path, "/api/") {
		h.api.ServeHTTP(w, r)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if r.URL.RawQuery != "" || r.URL.ForceQuery || r.URL.EscapedPath() != r.URL.Path || path.Clean(r.URL.Path) != r.URL.Path || strings.Contains(r.URL.Path, "\\") {
		http.NotFound(w, r)
		return
	}
	asset, exists := h.assets[r.URL.Path]
	if !exists {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", asset.contentType)
	w.Header().Set("Content-Length", strconv.Itoa(len(asset.body)))
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		_, _ = w.Write(asset.body)
	}
}

func demoWebContentType(file string) string {
	if file == "index.html" {
		return "text/html; charset=utf-8"
	}
	if file == "favicon.svg" {
		return "image/svg+xml"
	}
	parts := strings.Split(file, "/")
	for _, part := range parts {
		if part == "" || strings.HasPrefix(part, ".") {
			return ""
		}
	}
	ext := path.Ext(file)
	if strings.HasPrefix(file, "licenses/") && ext == ".txt" {
		return "text/plain; charset=utf-8"
	}
	if strings.HasPrefix(file, "brand/") && ext == ".svg" {
		return "image/svg+xml"
	}
	if !strings.HasPrefix(file, "assets/") {
		return ""
	}
	switch ext {
	case ".js":
		return "text/javascript; charset=utf-8"
	case ".css":
		return "text/css; charset=utf-8"
	case ".woff":
		return "font/woff"
	case ".woff2":
		return "font/woff2"
	case ".ttf":
		return "font/ttf"
	case ".svg":
		return "image/svg+xml"
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".webp":
		return "image/webp"
	default:
		return ""
	}
}
