package main

import (
	"cardford/server/internal/access"
	"cardford/server/internal/authn"
	"cardford/server/internal/authsession"
	"cardford/server/internal/games/trix"
	transport "cardford/server/internal/http"
	"cardford/server/internal/records"
	"cardford/server/internal/service"
	"cardford/server/internal/sessions"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"time"
)

type config struct {
	Address             string `json:"address"`
	Origin              string `json:"origin"`
	Issuer              string `json:"issuer"`
	ClientID            string `json:"clientId"`
	ClientSecret        string `json:"clientSecret"`
	DatabaseURL         string `json:"databaseUrl"`
	MigrationsDirectory string `json:"migrationsDirectory"`
	CAFile              string `json:"caFile"`
}

func main() {
	path := flag.String("config", ".local/auth/config.json", "private local auth configuration")
	grantAccount := flag.String("grant-account", "", "operator-only account ID for synthetic local Paid grant")
	grantDuration := flag.Duration("grant-duration", time.Hour, "synthetic grant duration, maximum 168h")
	grantReason := flag.String("grant-reason", "", "required operator audit reason")
	flag.Parse()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	var err error
	if *grantAccount != "" {
		err = runGrant(ctx, *path, *grantAccount, *grantReason, *grantDuration)
	} else {
		err = run(ctx, *path)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run(ctx context.Context, path string) error {
	raw, err := os.ReadFile(path)
	if err != nil || len(raw) > 1<<20 {
		return errors.New("auth config unavailable")
	}
	var cfg config
	if json.Unmarshal(raw, &cfg) != nil {
		return errors.New("auth config invalid")
	}
	host, _, err := net.SplitHostPort(cfg.Address)
	if err != nil || host != "127.0.0.1" {
		return errors.New("auth listener must bind IPv4 loopback")
	}
	roots, err := x509.SystemCertPool()
	if err != nil {
		roots = x509.NewCertPool()
	}
	if cfg.CAFile != "" {
		pem, e := os.ReadFile(cfg.CAFile)
		if e != nil || !roots.AppendCertsFromPEM(pem) {
			return errors.New("local CA unavailable")
		}
	}
	client := &http.Client{Timeout: 10 * time.Second, Transport: &http.Transport{TLSClientConfig: &tls.Config{RootCAs: roots, MinVersion: tls.VersionTLS12}, MaxIdleConns: 8, IdleConnTimeout: 30 * time.Second}, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
	startup, cancel := context.WithTimeout(ctx, 20*time.Second)
	provider, err := authn.New(startup, cfg.Issuer, cfg.ClientID, cfg.ClientSecret, cfg.Origin, client)
	cancel()
	if err != nil {
		return errors.New("auth OIDC discovery failed")
	}
	handlers := sessions.DefaultHandlers()
	handlers.UI = append(handlers.UI, "trix-table")
	installations := trix.Installations()
	for _, i := range installations {
		handlers.Schemas = append(handlers.Schemas, i.Descriptor.Schemas.State, i.Descriptor.Schemas.Observation, i.Descriptor.Schemas.Public, i.Descriptor.Schemas.Event)
	}
	registry, err := sessions.NewRegistryWithRegistrations(handlers, installations...)
	if err != nil {
		return errors.New("auth game registration failed")
	}
	codec, err := records.NewServiceCodecWithRegistry(registry)
	if err != nil {
		return errors.New("auth codec failed")
	}
	store, err := records.OpenAuthLocalStore(ctx, cfg.DatabaseURL, codec)
	if err != nil {
		return errors.New("auth isolated database unavailable")
	}
	defer store.Close()
	if err = store.ApplyMigrations(ctx, cfg.MigrationsDirectory); err != nil {
		return errors.New("auth canonical migration failed")
	}
	policy := freePolicy()
	backend, err := service.NewConfigured(store, codec, policy)
	if err != nil {
		return errors.New("auth service policy initialization failed")
	}
	defer backend.Close()
	keyID := os.Getenv("CARDFORD_AUTH_TOKEN_KEY_ID")
	if keyID == "" {
		keyID = "local-v1"
	}
	sessionService, err := authsession.New(store, provider, os.Getenv("CARDFORD_AUTH_TOKEN_KEY"), keyID)
	if err != nil {
		return err
	}
	sessionService.SetSessionChanged(backend.NotifySessionChanged)
	go sessionService.RunCleanup(ctx)
	handler, err := transport.NewAuthLocal(backend, store, provider, cfg.Origin, cfg.Issuer, sessionService)
	if err != nil {
		return err
	}
	server := &http.Server{Addr: cfg.Address, Handler: handler, ReadHeaderTimeout: 3 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 20 * time.Second, IdleTimeout: 30 * time.Second, MaxHeaderBytes: 16 << 10}
	listener, err := net.Listen("tcp", cfg.Address)
	if err != nil {
		return errors.New("auth listener unavailable")
	}
	done := make(chan error, 1)
	go func() { done <- server.Serve(listener) }()
	fmt.Println("CardFord auth local ready (identity=keycloak, payments=disabled, provider=off)")
	select {
	case err := <-done:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return errors.New("auth listener stopped")
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return server.Shutdown(shutdown)
	}
}

// A server-owned local Free offer. Three coached units each UTC day; practice
// itself remains available. No client/provider claim can grant paid authority.
func freePolicy() access.Policy {
	p := access.Policy{ID: "auth-local-free", Version: "1.0.0", AccessGeneration: 1, Precedence: []string{}, Offers: []access.Offer{}}
	for _, game := range []struct {
		id      string
		targets []access.Target
		unit    string
	}{{"hands", []access.Target{{GameID: "hearts", VariantID: "solo"}, {GameID: "spades", VariantID: "solo"}, {GameID: "spades", VariantID: "partners"}}, "hand"}, {"trix", []access.Target{{GameID: "trix", VariantID: "basic-solo"}, {GameID: "trix", VariantID: "basic-partners"}, {GameID: "trix", VariantID: "complex-solo"}, {GameID: "trix", VariantID: "complex-partners"}}, "trix-request"}} {
		limit := int64(3)
		id := "auth-local-free-" + game.id
		p.Precedence = append(p.Precedence, id)
		p.Offers = append(p.Offers, access.Offer{ID: id, Version: "1.0.0", Enabled: true, Kind: "free", Targets: game.targets, Play: true, Coach: access.Coach{Tools: []string{"advice", "review-alternative"}, Allowance: access.Allowance{Kind: "limited", Limit: &limit, Unit: game.unit, Period: "day", Timezone: "UTC", BucketID: id}}, Continuation: "pause-at-expiry", Activation: "automatic"})
	}
	// Reserve precedence for already-issued synthetic operator grants. This
	// offer is disabled for issuance and cannot appear as a purchasable offer.
	var operatorTargets []access.Target
	for _, offer := range p.Offers {
		operatorTargets = append(operatorTargets, offer.Targets...)
	}
	operator := access.Offer{ID: "operator-local-paid", Version: "1.0.0", Enabled: false, Kind: "paid", Targets: operatorTargets, Play: true, Coach: access.Coach{Tools: []string{"advice", "review-alternative"}, Allowance: access.Allowance{Kind: "unlimited"}}, Continuation: "pause-at-expiry", Activation: "verified-purchase"}
	p.Offers = append([]access.Offer{operator}, p.Offers...)
	p.Precedence = append([]string{operator.ID}, p.Precedence...)
	return p
}
