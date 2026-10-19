package main

import (
	"cardford/server/internal/records"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"time"
)

func runGrant(ctx context.Context, path, account, reason string, duration time.Duration) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return errors.New("operator config unavailable")
	}
	var cfg config
	if json.Unmarshal(raw, &cfg) != nil {
		return errors.New("operator config invalid")
	}
	codec, err := records.NewServiceCodec()
	if err != nil {
		return errors.New("operator codec unavailable")
	}
	store, err := records.OpenAuthLocalStore(ctx, cfg.DatabaseURL, codec)
	if err != nil {
		return errors.New("operator isolated database unavailable")
	}
	defer store.Close()
	id, err := store.GrantOperatorPaid(ctx, account, reason, duration)
	if err != nil {
		return errors.New("operator grant rejected; require existing account, nonempty reason and duration 1m..168h")
	}
	fmt.Printf("Synthetic local Paid grant %s installed; this is not payment evidence.\n", id)
	return nil
}
