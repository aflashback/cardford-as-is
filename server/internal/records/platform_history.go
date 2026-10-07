package records

import (
	"cardford/server/internal/gamekernel"
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

func PlatformDecisionID(game string, revision int64) string {
	return fmt.Sprintf("%s:decision:%d", game, revision)
}
func ParsePlatformDecisionID(game, id string) (int64, error) {
	prefix := game + ":decision:"
	if !strings.HasPrefix(id, prefix) {
		return 0, ErrReadDenied
	}
	r, e := strconv.ParseInt(strings.TrimPrefix(id, prefix), 10, 64)
	if e != nil || r < 0 || r > maxRecordInteger || PlatformDecisionID(game, r) != id {
		return 0, ErrReadDenied
	}
	return r, nil
}

// PlatformReplay validates the original private anchor and every checkpoint,
// releases all SQL resources before CPU work, and only passes data internally.
func (s *Store) PlatformReplay(ctx context.Context, owner, game string, visit func(Document, gamekernel.Snapshot, *CommandRecord) error) (*Loaded, error) {
	h, err := s.loadHistory(ctx, owner, game)
	if err != nil {
		return nil, err
	}
	initial, snapshot, _, err := s.codec.Replay(h.loaded.Document.Metadata, h.anchor, nil)
	if err != nil {
		return nil, err
	}
	if err = visit(initial, snapshot, nil); err != nil {
		return nil, err
	}
	l, err := s.replayHistory(ctx, h, func(doc Document, snap gamekernel.Snapshot) error {
		c := h.commands[doc.Revision-1]
		return visit(doc, snap, &c)
	})
	if err != nil {
		return nil, err
	}
	return l, s.currentRead(ctx, owner)
}
func (s *Store) PlatformSource(ctx context.Context, owner, game string, revision int64) (*Loaded, error) {
	l, e := s.reviewSource(ctx, owner, game, revision)
	if e != nil {
		return nil, e
	}
	return l, s.currentRead(ctx, owner)
}

// PlatformOriginal reads a frozen actor analysis. Uncommitted current work is
// allowed, but historical review requires the original accepted command link.
func (s *Store) PlatformOriginal(ctx context.Context, owner, game string, revision int64, accepted bool) (*DecisionRecord, error) {
	if err := s.currentRead(ctx, owner); err != nil {
		return nil, err
	}
	bounded, cancel := s.bounded(ctx)
	defer cancel()
	rows, err := s.pool.Query(bounded, "SELECT CASE WHEN octet_length(d.record)<=$5 THEN d.record ELSE NULL END FROM "+s.table("m03_decisions")+" d WHERE d.owner_id=$1 AND d.game_id=$2 AND d.revision=$3 AND (NOT $4 OR EXISTS(SELECT 1 FROM "+s.table("m03_command_decisions")+" c WHERE c.owner_id=d.owner_id AND c.decision_id=d.id)) ORDER BY d.id LIMIT 1025", owner, game, revision, accepted, MaxRecordBytes)
	if err != nil {
		return nil, err
	}
	data := [][]byte{}
	total := 0
	for rows.Next() {
		var raw []byte
		if err = rows.Scan(&raw); err != nil {
			rows.Close()
			return nil, err
		}
		total += len(raw)
		if raw == nil || total > MaxArchiveBytes || len(data) >= 1024 {
			rows.Close()
			return nil, ErrStorage
		}
		data = append(data, raw)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return nil, err
	}
	for _, raw := range data {
		decision, err := DecodeDecision(raw)
		if err != nil {
			return nil, err
		}
		if decision.Actor == 0 && (decision.Purpose == "human-analysis" || decision.Purpose == "coach-advice") {
			d, err := s.ReadDecision(ctx, owner, decision.ID)
			return &d, err
		}
	}
	return nil, nil
}

type PlatformStats struct {
	Decisions   int `json:"decisions"`
	Helped      int `json:"helped"`
	Suggestions int `json:"suggestions"`
}

func (s *Store) PlatformHelpLevels(ctx context.Context, owner, game string) (map[int64]int, error) {
	if err := s.currentRead(ctx, owner); err != nil {
		return nil, err
	}
	bounded, cancel := s.bounded(ctx)
	defer cancel()
	rows, err := s.pool.Query(bounded, "SELECT live_revision,max(level) FROM "+s.table("m04_help_deliveries")+" WHERE owner_id=$1 AND game_id=$2 GROUP BY live_revision ORDER BY live_revision LIMIT 100001", owner, game)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	levels := map[int64]int{}
	for rows.Next() {
		var r int64
		var level int
		if err = rows.Scan(&r, &level); err != nil {
			return nil, err
		}
		levels[r] = level
		if len(levels) > MaxEventCount {
			return nil, ErrStorage
		}
	}
	return levels, rows.Err()
}

// PlatformCommittedSources exposes only revision and actor-zero candidate ID.
func (s *Store) PlatformCommittedSources(ctx context.Context, owner, game string) (map[int64]string, error) {
	if err := s.currentRead(ctx, owner); err != nil {
		return nil, err
	}
	bounded, cancel := s.bounded(ctx)
	defer cancel()
	rows, err := s.pool.Query(bounded, "SELECT revision,command FROM "+s.table("m03_commands")+" WHERE owner_id=$1 AND game_id=$2 ORDER BY revision LIMIT 100001", owner, game)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64]string{}
	count := 0
	for rows.Next() {
		var rev int64
		var raw []byte
		if err = rows.Scan(&rev, &raw); err != nil {
			return nil, err
		}
		count++
		if count > MaxEventCount {
			return nil, ErrStorage
		}
		var op struct {
			Kind      string `json:"kind"`
			Seat      int    `json:"seat"`
			Candidate string `json:"candidateId"`
			Choices   []struct {
				Seat      int    `json:"seat"`
				Candidate string `json:"candidateId"`
			} `json:"choices"`
		}
		record, decodeErr := DecodeCommand(raw)
		if decodeErr != nil {
			return nil, decodeErr
		}
		if err = json.Unmarshal(record.Command, &op); err != nil {
			return nil, err
		}
		if op.Kind == "actor" && op.Seat == 0 {
			out[rev-1] = op.Candidate
		}
		if op.Kind == "sealed" {
			for _, c := range op.Choices {
				if c.Seat == 0 {
					out[rev-1] = c.Candidate
				}
			}
		}
	}
	return out, rows.Err()
}

func (s *Store) PlatformStats(ctx context.Context, owner, game string) (PlatformStats, error) {
	choices, err := s.PlatformCommittedSources(ctx, owner, game)
	if err != nil {
		return PlatformStats{}, err
	}
	levels, err := s.PlatformHelpLevels(ctx, owner, game)
	if err != nil {
		return PlatformStats{}, err
	}
	unforced, err := s.platformUnforcedSources(ctx, owner, game, choices)
	if err != nil {
		return PlatformStats{}, err
	}
	out := PlatformStats{}
	for revision, level := range PlatformAssistance(choices, levels) {
		if !unforced[revision] {
			continue
		}
		out.Decisions++
		if level > 0 {
			out.Helped++
		}
		if level >= 3 {
			out.Suggestions++
		}
	}
	return out, nil
}

// The original training counters exclude forced choices. Read the frozen
// accepted candidate list without replaying policy or fetching hidden state.
func (s *Store) platformUnforcedSources(ctx context.Context, owner, game string, choices map[int64]string) (map[int64]bool, error) {
	if len(choices) == 0 {
		return map[int64]bool{}, s.currentRead(ctx, owner)
	}
	revisions := make([]int64, 0, len(choices))
	for revision := range choices {
		revisions = append(revisions, revision)
	}
	sort.Slice(revisions, func(i, j int) bool { return revisions[i] < revisions[j] })
	bounded, cancel := s.bounded(ctx)
	defer cancel()
	rows, err := s.pool.Query(bounded, "SELECT CASE WHEN octet_length(d.record)<=$3 THEN d.record ELSE NULL END FROM "+s.table("m03_decisions")+" d WHERE d.owner_id=$1 AND d.game_id=$2 AND d.revision=ANY($4::bigint[]) AND EXISTS(SELECT 1 FROM "+s.table("m03_command_decisions")+" c WHERE c.owner_id=d.owner_id AND c.decision_id=d.id) ORDER BY d.revision,d.id LIMIT 100001", owner, game, MaxRecordBytes, revisions)
	if err != nil {
		return nil, err
	}
	data := [][]byte{}
	total := 0
	for rows.Next() {
		var raw []byte
		if err = rows.Scan(&raw); err != nil {
			rows.Close()
			return nil, err
		}
		total += len(raw)
		if raw == nil || total > MaxArchiveBytes || len(data) >= MaxEventCount {
			rows.Close()
			return nil, ErrStorage
		}
		data = append(data, raw)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return nil, err
	}
	out := map[int64]bool{}
	for _, raw := range data {
		if err = ctx.Err(); err != nil {
			return nil, err
		}
		record, e := s.statsDecisions.decode(raw)
		if e != nil {
			return nil, e
		}
		if record.actor != 0 {
			continue
		}
		out[record.revision] = record.unforced
	}
	return out, s.currentRead(ctx, owner)
}

// PlatformAssistance merges the actual sparse revisions once. Repeated table
// reads never scan the maximum event budget or multiply decision/help history.
func PlatformAssistance(choices map[int64]string, levels map[int64]int) map[int64]int {
	decisions := make([]int64, 0, len(choices))
	for r := range choices {
		decisions = append(decisions, r)
	}
	sort.Slice(decisions, func(i, j int) bool { return decisions[i] < decisions[j] })
	help := make([]int64, 0, len(levels))
	for r := range levels {
		help = append(help, r)
	}
	sort.Slice(help, func(i, j int) bool { return help[i] < help[j] })
	out := make(map[int64]int, len(choices))
	next := 0
	for _, r := range decisions {
		level := 0
		for next < len(help) && help[next] <= r {
			if levels[help[next]] > level {
				level = levels[help[next]]
			}
			next++
		}
		out[r] = level
	}
	return out
}
