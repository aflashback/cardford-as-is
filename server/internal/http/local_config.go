package http

import (
	"fmt"
	"net"
	"net/url"
	"strconv"
)

// LocalConfig is an explicit fixture-only launch configuration. It never loads
// or rewrites .env.local and must never be used for a hosted deployment.
type LocalConfig struct {
	Mode, Address, Origin, DatabaseURL, MigrationsDirectory string
}

func ReadLocalConfig(getenv func(string) string) (LocalConfig, error) {
	var c LocalConfig
	if getenv == nil {
		return c, fmt.Errorf("missing environment reader")
	}
	c.Mode = getenv("APP_ENV")
	if (c.Mode != "local" && c.Mode != "test") || getenv("IDENTITY_MODE") != "local-test" || getenv("BILLING_MODE") != "fixture" || getenv("JEV_MODE") != "off" {
		return c, fmt.Errorf("Go service requires explicit local/test, local-test identity, fixture billing, and Jev off")
	}
	host := getenv("HOST")
	if host == "" {
		host = "127.0.0.1"
	}
	if host != "127.0.0.1" && host != "::1" && host != "localhost" {
		return c, fmt.Errorf("local service must bind loopback")
	}
	port := getenv("PORT")
	if port == "" {
		port = "4174"
	}
	p, err := strconv.Atoi(port)
	if err != nil || p < 1024 || p > 65535 {
		return c, fmt.Errorf("invalid local service port")
	}
	c.Address = net.JoinHostPort(host, strconv.Itoa(p))
	c.Origin = getenv("APP_ORIGIN")
	if c.Origin == "" {
		c.Origin = "http://" + c.Address
	}
	u, err := url.Parse(c.Origin)
	if err != nil || u.Scheme != "http" || u.User != nil || u.Host != c.Address || u.Path != "" || u.RawPath != "" || u.RawQuery != "" || u.Fragment != "" || c.Origin != "http://"+c.Address {
		return c, fmt.Errorf("APP_ORIGIN must exactly match the local listener origin")
	}
	c.DatabaseURL = getenv("DATABASE_URL")
	if c.DatabaseURL == "" {
		return c, fmt.Errorf("DATABASE_URL is required")
	}
	// pgx performs the authoritative database parse and loopback check. Keep
	// errors here generic so startup never prints a credential-bearing URL.
	c.MigrationsDirectory = getenv("CARDFORD_MIGRATIONS_DIR")
	if c.MigrationsDirectory == "" {
		return c, fmt.Errorf("CARDFORD_MIGRATIONS_DIR must name the canonical migration directory")
	}
	return c, nil
}
