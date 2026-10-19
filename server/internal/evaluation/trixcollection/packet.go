package trixcollection

import (
	"encoding/json"
	"fmt"

	"cardford/server/internal/gamekernel"
)

// CurrentPacket preserves the full native RegisteredActorPacket bytes. Private
// snapshots belong only to the local coordinator and must never reach a player.
func CurrentPacket(b gamekernel.BoundSession) (json.RawMessage, error) {
	if _, err := requestScope(b); err != nil {
		return nil, err
	}
	n, err := b.Node()
	if err != nil {
		return nil, err
	}
	if n.Kind != "actor" || n.Seat == nil {
		return nil, fmt.Errorf("no current actor packet")
	}
	return b.Packet(*n.Seat)
}
