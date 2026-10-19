package main

import (
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/trix"
	"cardford/server/internal/sessions"
	"encoding/json"
	"fmt"
	"io"
	"os"
)

type trixFixture struct {
	ID    string     `json:"id"`
	Deals [][]string `json:"deals"`
}

// Only trusted local startup can select concealed fixtures. The creation API
// still accepts a selector, never a deck or fixture ID. The module persists the
// sequence privately so restart does not substitute new deals for this session.
func installTrixFixture(installed []sessions.Registration, path, mode string) error {
	if path == "" {
		return nil
	}
	if mode != "local" && mode != "test" {
		return fmt.Errorf("Trix fixtures require explicit local/test startup")
	}
	f, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("Trix fixture file unavailable")
	}
	defer f.Close()
	raw, err := io.ReadAll(io.LimitReader(f, 1<<20+1))
	if err != nil || len(raw) > 1<<20 {
		return fmt.Errorf("Trix fixture size limit")
	}
	var fixture trixFixture
	if err = gamekernel.DecodeSessionJSON(raw, &fixture); err != nil {
		return fmt.Errorf("invalid Trix fixture")
	}
	if !gamekernel.ValidIdentifier(fixture.ID) || len(fixture.Deals) != 20 {
		return fmt.Errorf("Trix fixture requires ID and twenty complete deals")
	}
	for _, deck := range fixture.Deals {
		if _, err = trix.New(trix.Config{ID: "fixture-validation", Variant: "basic-solo"}, deck); err != nil {
			return fmt.Errorf("invalid Trix fixture deck")
		}
	}
	for i := range installed {
		variant := installed[i].Pin.VariantID
		count := 20
		if variant == "complex-solo" || variant == "complex-partners" {
			count = 8
		}
		sequence := fixture.Deals[:count]
		bootstrap := installed[i].Bootstrap
		installed[i].Bootstrap = func(id string) (json.RawMessage, json.RawMessage, error) {
			original, _, err := bootstrap(id)
			if err != nil {
				return nil, nil, err
			}
			var selected trix.Config
			if err = gamekernel.DecodeSessionJSON(original, &selected); err != nil {
				return nil, nil, err
			}
			selected.FixtureID, selected.FixtureDeals = fixture.ID, sequence
			config, err := json.Marshal(selected)
			if err != nil {
				return nil, nil, err
			}
			material, err := json.Marshal(trix.Chance{Deck: sequence[0]})
			return config, material, err
		}
	}
	return nil
}
