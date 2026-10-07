package records

import (
	"bytes"
	"container/list"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"sync"

	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
)

type statsDecision struct {
	actor    int
	revision int64
	unforced bool
}

func decodeStatsDecision(raw []byte) (statsDecision, error) {
	record, err := DecodeDecision(raw)
	if err != nil {
		return statsDecision{}, err
	}
	value := statsDecision{actor: record.Actor, revision: record.Revision}
	if record.Actor == 0 {
		if record.AnalysisSchema == "RegisteredAnalysis" {
			if err = contracts.Validate("RegisteredAnalysis", record.Analysis); err != nil {
				return statsDecision{}, err
			}
			var registered struct {
				Origin string `json:"origin"`
			}
			if err = json.Unmarshal(record.Analysis, &registered); err != nil {
				return statsDecision{}, err
			}
			value.unforced = registered.Origin != "forced"
			return value, nil
		}
		if record.AnalysisSchema != OriginalAnalysisSchema {
			return statsDecision{}, fmt.Errorf("unsupported stats analysis schema")
		}
		var original OriginalAnalysisEnvelope
		if err = gamekernel.DecodeSessionJSON(record.Analysis, &original); err != nil {
			return statsDecision{}, err
		}
		value.unforced = len(original.Original.Candidates) > 1
	}
	return value, nil
}

type statsCacheEntry struct {
	digest [32]byte
	raw    []byte
	value  statsDecision
}

// This cache only memoizes immutable scalar extraction from exact copied bytes.
// Every read still fetches the current authorized database rows. It never caches
// permissions, source/replay validation, advice, errors, or mutable decoded data.
// The byte and entry ceilings bound retained memory per Store, including a
// workload that presents a different record on every request.
type statsDecisionCache struct {
	mu                          sync.Mutex
	entries                     map[[32]byte]*list.Element
	lru                         list.List
	bytes, maxBytes, maxEntries int
}

func (c *statsDecisionCache) decode(raw []byte) (statsDecision, error) {
	digest := sha256.Sum256(raw)
	c.mu.Lock()
	if entry := c.entries[digest]; entry != nil && bytes.Equal(entry.Value.(statsCacheEntry).raw, raw) {
		c.lru.MoveToFront(entry)
		value := entry.Value.(statsCacheEntry).value
		c.mu.Unlock()
		return value, nil
	}
	c.mu.Unlock()
	value, err := decodeStatsDecision(raw)
	if err != nil {
		return statsDecision{}, err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.maxBytes == 0 {
		c.maxBytes = 16 << 20
	}
	if c.maxEntries == 0 {
		c.maxEntries = 1024
	}
	if len(raw) > c.maxBytes {
		return value, nil
	}
	if c.entries == nil {
		c.entries = make(map[[32]byte]*list.Element)
	}
	if old := c.entries[digest]; old != nil {
		c.bytes -= len(old.Value.(statsCacheEntry).raw)
		c.lru.Remove(old)
		delete(c.entries, digest)
	}
	for c.bytes+len(raw) > c.maxBytes || len(c.entries) >= c.maxEntries {
		last := c.lru.Back()
		e := last.Value.(statsCacheEntry)
		c.bytes -= len(e.raw)
		delete(c.entries, e.digest)
		c.lru.Remove(last)
	}
	c.entries[digest] = c.lru.PushFront(statsCacheEntry{digest, bytes.Clone(raw), value})
	c.bytes += len(raw)
	return value, nil
}
