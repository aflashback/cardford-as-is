package main

import (
	"cardford/server/internal/games/trix"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestTrixFixtureStartupIsolation(t *testing.T) {
	deals := [][]string{}
	for i := 0; i < 20; i++ {
		deals = append(deals, trix.Deck())
	}
	raw, _ := json.Marshal(trixFixture{ID: "native-fixture", Deals: deals})
	path := filepath.Join(t.TempDir(), "fixture.json")
	if err := os.WriteFile(path, raw, 0600); err != nil {
		t.Fatal(err)
	}
	installed := trix.Installations()
	if err := installTrixFixture(installed, path, "production"); err == nil {
		t.Fatal("hosted fixture accepted")
	}
	if err := installTrixFixture(installed, path, "test"); err != nil {
		t.Fatal(err)
	}
	for _, registration := range installed {
		config, material, err := registration.Bootstrap("fixture-session")
		if err != nil {
			t.Fatal(err)
		}
		bound, err := registration.Start(config, material)
		if err != nil {
			t.Fatal(err)
		}
		view, err := bound.Presentation(0)
		if err != nil {
			t.Fatal(err)
		}
		var public map[string]any
		if err = json.Unmarshal(view, &public); err != nil {
			t.Fatal(err)
		}
		observation := public["observation"].(map[string]any)
		if _, ok := observation["fixtureDeals"]; ok {
			t.Fatal("concealed fixture sequence exposed")
		}
		if _, ok := observation["fixtureId"]; ok {
			t.Fatal("fixture ID exposed")
		}
	}
	normal := trix.Installations()[0]
	config, _, err := normal.Bootstrap("normal-session")
	if err != nil {
		t.Fatal(err)
	}
	var private map[string]any
	json.Unmarshal(config, &private)
	if _, ok := private["fixtureDeals"]; ok {
		t.Fatal("fixture contaminated normal create")
	}
}
