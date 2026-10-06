package http

import "testing"

func TestLocalConfigurationRejectsHostedOrImplicitModes(t *testing.T) {
	base := map[string]string{"APP_ENV": "local", "IDENTITY_MODE": "local-test", "BILLING_MODE": "fixture", "JEV_MODE": "off", "DATABASE_URL": "postgres://private@127.0.0.1/local", "CARDFORD_MIGRATIONS_DIR": "web/server/records/migrations"}
	get := func(k string) string { return base[k] }
	c, err := ReadLocalConfig(get)
	if err != nil || c.Address != "127.0.0.1:4174" || c.Origin != "http://127.0.0.1:4174" {
		t.Fatalf("valid config: %+v %v", c, err)
	}
	for _, tc := range []struct{ key, value string }{{"APP_ENV", "production"}, {"IDENTITY_MODE", "managed"}, {"BILLING_MODE", "stripe-live"}, {"JEV_MODE", "recommend"}, {"JEV_MODE", ""}, {"HOST", "0.0.0.0"}, {"PORT", "0"}, {"APP_ORIGIN", "http://localhost:4174"}, {"APP_ORIGIN", "http://127.0.0.1:4174/path"}, {"CARDFORD_MIGRATIONS_DIR", ""}} {
		old, exists := base[tc.key]
		base[tc.key] = tc.value
		if _, err = ReadLocalConfig(get); err == nil {
			t.Errorf("accepted %s=%s", tc.key, tc.value)
		}
		if exists {
			base[tc.key] = old
		} else {
			delete(base, tc.key)
		}
	}
	if _, err = NewLocalServer("0.0.0.0:4174", &LocalHandler{}); err == nil {
		t.Fatal("public listener accepted")
	}
	s, err := NewLocalServer("127.0.0.1:4174", &LocalHandler{})
	if err != nil || s.ReadHeaderTimeout <= 0 || s.ReadTimeout <= 0 || s.WriteTimeout <= 0 || s.IdleTimeout <= 0 || s.MaxHeaderBytes != 16<<10 {
		t.Fatal("unbounded server")
	}
}
