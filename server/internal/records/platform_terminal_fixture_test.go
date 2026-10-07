package records

// This fixture importer exists only in the Go test binary. It authors legal
// lifecycle history, not policy play, coaching results, or training statistics.
import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"testing"
	"time"

	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/sessions"
	"github.com/jackc/pgx/v5"
)

type terminalFixture struct {
	Version           string                `json:"version"`
	Mode              string                `json:"mode"`
	Opening           Document              `json:"opening"`
	Anchor            ReplayAnchor          `json:"anchor"`
	Document          Document              `json:"document"`
	Events            []EventRecord         `json:"events"`
	Commands          []CommandRecord       `json:"commands"`
	CheckpointDigests []string              `json:"checkpointDigests"`
	FinalOperation    json.RawMessage       `json:"finalOperation"`
	Expected          terminalFixturePublic `json:"expected"`
}

// Only this allowlist may be printed by the installation helper.
type terminalFixturePublic struct {
	Mode             string          `json:"mode"`
	HandNumber       int             `json:"handNumber"`
	Revision         int64           `json:"revision"`
	TerminalRevision int64           `json:"terminalRevision"`
	Scores           []int           `json:"scores"`
	HandResult       json.RawMessage `json:"handResult"`
	TransitionID     string          `json:"transitionId"`
	ArchivePath      string          `json:"archivePath,omitempty"`
	ArchiveSHA256    string          `json:"archiveSHA256,omitempty"`
	Scope            string          `json:"scope"`
}

func terminalFixtureCandidate(c *DocumentCodec, doc Document, snapshot gamekernel.Snapshot, seat int, mode string) (string, error) {
	input, err := c.PreparationInput(doc, snapshot, seat)
	if err != nil || len(input.CandidateIDs) == 0 {
		return "", fmt.Errorf("fixture actor candidates unavailable: %w", err)
	}
	wanted := "bid:0"
	if mode != "hearts" && seat == 0 {
		b, e := c.Session(doc, snapshot)
		if e != nil {
			return "", e
		}
		raw, e := b.Presentation(0)
		if e != nil {
			return "", e
		}
		var view struct {
			HandNumber int `json:"handNumber"`
		}
		if e = json.Unmarshal(raw, &view); e != nil {
			return "", e
		}
		if view.HandNumber > 1 {
			wanted = "bid:13"
		}
	}
	for _, id := range input.CandidateIDs {
		if id == wanted {
			return id, nil
		}
	}
	return input.CandidateIDs[0], nil
}

func terminalFixtureOperation(c *DocumentCodec, doc Document, snapshot gamekernel.Snapshot, mode string) (sessions.Operation, error) {
	b, err := c.Session(doc, snapshot)
	if err != nil {
		return nil, err
	}
	n, err := b.Node()
	if err != nil {
		return nil, err
	}
	switch n.Kind {
	case "actor":
		if n.Seat == nil {
			return nil, fmt.Errorf("fixture actor missing")
		}
		id, e := terminalFixtureCandidate(c, doc, snapshot, *n.Seat, mode)
		return sessions.ActorOperation{Kind: "actor", Seat: *n.Seat, CandidateID: id}, e
	case "sealed":
		choices := []gamekernel.SeatChoice{}
		for _, seat := range n.Actors {
			id, e := terminalFixtureCandidate(c, doc, snapshot, seat, mode)
			if e != nil {
				return nil, e
			}
			choices = append(choices, gamekernel.SeatChoice{Seat: seat, CandidateID: id})
		}
		return sessions.SealedOperation{Kind: "sealed", WindowID: n.WindowID, Choices: choices}, nil
	case "automatic":
		return sessions.AutomaticOperation{Kind: "automatic", TransitionID: n.TransitionID}, nil
	case "round-complete":
		return sessions.ContinueOperation{Kind: "continue-round"}, nil
	case "chance":
		raw, e := b.Presentation(0)
		if e != nil {
			return nil, e
		}
		var view struct {
			Dealer int `json:"dealer"`
		}
		if e = json.Unmarshal(raw, &view); e != nil {
			return nil, e
		}
		deck := codecDeck()
		if mode != "hearts" {
			// The next dealer advances once. Deal seat 0 all spades using the
			// normal round-robin dealer-relative assignment; every card is unique.
			deck = nil
			first := (view.Dealer + 2) % 4
			suits := []string{"S", "C", "D", "H"}
			for _, rank := range []string{"2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"} {
				for offset := 0; offset < 4; offset++ {
					deck = append(deck, suits[(first+offset)%4]+rank)
				}
			}
		}
		material, e := json.Marshal(map[string]any{"kind": "deal", "deck": deck})
		return sessions.ChanceOperation{Kind: "chance", RequestID: n.RequestID, Material: material}, e
	}
	return nil, fmt.Errorf("unexpected fixture node %s", n.Kind)
}

func buildTerminalFixture(ctx context.Context, c *DocumentCodec, opening Document, anchor ReplayAnchor, initial []EventRecord, mode string) (terminalFixture, error) {
	f := terminalFixture{Version: "m04e-terminal-fixture-1", Mode: mode, Opening: cloneDocument(opening), Anchor: anchor, Document: cloneDocument(opening), Events: cloneEvents(initial), Commands: []CommandRecord{}, CheckpointDigests: []string{}}
	if opening.Revision != 0 || (mode != "hearts" && mode != "spades-solo" && mode != "spades-partners") {
		return f, fmt.Errorf("fixture requires supported revision-zero opening")
	}
	snapshot, disposition, err := c.Open(opening, initial)
	if err != nil || !disposition.Playable {
		return f, fmt.Errorf("fixture opening not playable: %w", err)
	}
	for step := 0; step < 5000; step++ {
		if err = ctx.Err(); err != nil {
			return f, err
		}
		b, e := c.Session(f.Document, snapshot)
		if e != nil {
			return f, e
		}
		presentation, e := b.Presentation(0)
		if e != nil {
			return f, e
		}
		var view struct {
			HandNumber int `json:"handNumber"`
		}
		if e = json.Unmarshal(presentation, &view); e != nil {
			return f, e
		}
		if view.HandNumber > 100 {
			return f, fmt.Errorf("fixture hand limit")
		}
		op, e := terminalFixtureOperation(c, f.Document, snapshot, mode)
		if e != nil {
			return f, e
		}
		raw, e := sessions.EncodeOperation(op)
		if e != nil {
			return f, e
		}
		next, nextSnapshot, delta, e := c.AdvanceBound(f.Document, snapshot, raw)
		if e != nil {
			return f, e
		}
		nextBound, e := c.Session(next, nextSnapshot)
		if e != nil {
			return f, e
		}
		node, e := nextBound.Node()
		if e != nil {
			return f, e
		}
		if node.Kind == "session-complete" {
			automatic, ok := op.(sessions.AutomaticOperation)
			if !ok {
				return f, fmt.Errorf("terminal fixture did not end on collection")
			}
			public, e := nextBound.Presentation(0)
			if e != nil {
				return f, e
			}
			if e = json.Unmarshal(public, &f.Expected); e != nil {
				return f, e
			}
			f.Expected.Mode = mode
			f.Expected.Revision = f.Document.Revision
			f.Expected.TerminalRevision = next.Revision
			f.Expected.TransitionID = automatic.TransitionID
			f.Expected.Scope = "Terminal lifecycle only: deterministic legal continuation from recorded opening; no imported policy decisions, coaching results or training-statistics claim."
			f.FinalOperation = raw
			return f, verifyTerminalFixture(ctx, c, f)
		}
		id := fmt.Sprintf("m04e-fixture:%s:%06d", opening.Metadata.GameID, next.Revision)
		digest, e := CommandDigest(opening.Metadata.GameID, next.Revision, raw)
		if e != nil {
			return f, e
		}
		command := CommandRecord{RecordVersion: RecordVersion, GameID: opening.Metadata.GameID, Revision: next.Revision, CommandID: id, Digest: digest, Command: raw}
		checkpoint, e := json.Marshal(next.Checkpoint)
		if e != nil {
			return f, e
		}
		f.Commands = append(f.Commands, command)
		f.CheckpointDigests = append(f.CheckpointDigests, contracts.SHA256(checkpoint))
		f.Events = append(f.Events, delta...)
		f.Document = next
		snapshot = nextSnapshot
	}
	return f, fmt.Errorf("fixture command limit")
}

func verifyTerminalFixture(ctx context.Context, c *DocumentCodec, f terminalFixture) error {
	if len(f.Commands) != len(f.CheckpointDigests) || int64(len(f.Commands)) != f.Document.Revision {
		return fmt.Errorf("fixture archive length")
	}
	doc, snapshot, events, err := c.ReplayVisit(f.Opening.Metadata, f.Anchor, f.Commands, func(d Document, _ gamekernel.Snapshot) error {
		if e := ctx.Err(); e != nil {
			return e
		}
		raw, e := json.Marshal(d.Checkpoint)
		if e != nil {
			return e
		}
		if contracts.SHA256(raw) != f.CheckpointDigests[d.Revision-1] {
			return fmt.Errorf("fixture checkpoint mismatch")
		}
		return nil
	})
	if err != nil {
		return err
	}
	left, _ := json.Marshal(doc)
	right, _ := json.Marshal(f.Document)
	if !bytes.Equal(left, right) {
		return fmt.Errorf("fixture document replay mismatch")
	}
	left, _ = json.Marshal(events)
	right, _ = json.Marshal(f.Events)
	if !bytes.Equal(left, right) {
		return fmt.Errorf("fixture event replay mismatch")
	}
	final, finalSnapshot, _, err := c.AdvanceBound(doc, snapshot, f.FinalOperation)
	if err != nil {
		return err
	}
	b, err := c.Session(final, finalSnapshot)
	if err != nil {
		return err
	}
	n, err := b.Node()
	if err != nil || n.Kind != "session-complete" {
		return fmt.Errorf("fixture withheld collection is not terminal")
	}
	public, err := b.Presentation(0)
	if err != nil {
		return err
	}
	var actual terminalFixturePublic
	if err = json.Unmarshal(public, &actual); err != nil {
		return err
	}
	left, _ = json.Marshal(actual.Scores)
	right, _ = json.Marshal(f.Expected.Scores)
	if !bytes.Equal(left, right) || actual.HandNumber != f.Expected.HandNumber || !bytes.Equal(actual.HandResult, f.Expected.HandResult) || final.Revision != f.Expected.TerminalRevision {
		return fmt.Errorf("fixture terminal public result mismatch")
	}
	return nil
}

func TestM04ETerminalFixtureBuilder(t *testing.T) {
	expected := map[string]struct {
		hand     int
		revision int64
		scores   string
	}{
		"hearts":          {15, 1015, "[104,98,91,97]"},
		"spades-solo":     {6, 424, "[550,400,400,400]"},
		"spades-partners": {5, 353, "[620,600,620,600]"},
	}
	for _, mode := range []string{"hearts", "spades-solo", "spades-partners"} {
		t.Run(mode, func(t *testing.T) {
			c, doc, anchor, events, _ := serviceStart(t, mode)
			f, err := buildTerminalFixture(context.Background(), c, doc, anchor, events, mode)
			if err != nil {
				t.Fatal(err)
			}
			want := expected[mode]
			scores, _ := json.Marshal(f.Expected.Scores)
			if f.Expected.HandNumber != want.hand || f.Expected.TerminalRevision != want.revision || string(scores) != want.scores || f.Document.Revision+1 != f.Expected.TerminalRevision {
				t.Fatalf("fixed opening terminal outcome changed: hand=%d revision=%d scores=%s", f.Expected.HandNumber, f.Expected.TerminalRevision, scores)
			}
			t.Logf("legal fixture terminal: mode=%s hand=%d revision=%d scores=%v", mode, f.Expected.HandNumber, f.Expected.TerminalRevision, f.Expected.Scores)
			broken := f
			broken.CheckpointDigests = append([]string{}, f.CheckpointDigests...)
			broken.CheckpointDigests[0] = contracts.SHA256([]byte("corrupt"))
			if verifyTerminalFixture(context.Background(), c, broken) == nil {
				t.Fatal("corrupted checkpoint accepted")
			}
		})
	}
}

func TestM04ETerminalFixtureInstall(t *testing.T) {
	game, owner, mode := os.Getenv("M04E_FIXTURE_GAME"), os.Getenv("M04E_FIXTURE_OWNER"), os.Getenv("M04E_FIXTURE_MODE")
	if game == "" && owner == "" && mode == "" {
		t.Skip("explicit M04E_FIXTURE_GAME/OWNER/MODE required; test-only native archive installer")
	}
	idPattern := regexp.MustCompile(`^[a-f0-9]{48}$`)
	if !idPattern.MatchString(game) || !idPattern.MatchString(owner) || (mode != "hearts" && mode != "spades-solo" && mode != "spades-partners") {
		t.Fatal("invalid explicit fixture identity/mode")
	}
	url := os.Getenv("TEST_DATABASE_URL")
	cfg, err := pgx.ParseConfig(url)
	if err != nil || url == "" || cfg.Database != "cardford_windows_test" || cfg.Host != "127.0.0.1" || cfg.Port != 54331 {
		t.Fatal("fixture requires exact native loopback cardford_windows_test database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	c, err := NewServiceCodec()
	if err != nil {
		t.Fatal(err)
	}
	s, err := OpenStore(ctx, url, StoreOptions{LocalService: true, Schema: "cardford_go_local", Codec: c, QueryTimeout: 10 * time.Second})
	if err != nil {
		t.Fatal("fixture database unavailable")
	}
	defer s.Close()
	var database string
	var exists bool
	if err = s.pool.QueryRow(ctx, "SELECT current_database(),to_regnamespace('cardford_go_local') IS NOT NULL").Scan(&database, &exists); err != nil || database != "cardford_windows_test" || !exists {
		t.Fatal("existing isolated fixture schema required")
	}
	var p Principal
	p.OwnerID = owner
	if err = s.pool.QueryRow(ctx, "SELECT token_hash FROM m04_sessions WHERE owner_id=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp() ORDER BY expires_at DESC LIMIT 1", owner).Scan(&p.sessionHash); err != nil {
		t.Fatal("fixture owner lacks existing live session")
	}
	ctx = WithPrincipal(ctx, p)
	h, err := s.loadHistory(ctx, owner, game)
	if err != nil {
		t.Fatal(err)
	}
	if h.loaded.Document.Revision != 0 || len(h.commands) != 0 {
		t.Fatal("fixture only installs into untouched revision-zero game")
	}
	if h.loaded.Document.Metadata.Pin.GameID != serviceSelector(mode).GameID || h.loaded.Document.Metadata.Pin.VariantID != serviceSelector(mode).VariantID {
		t.Fatal("fixture mode differs from owned opening")
	}
	f, err := buildTerminalFixture(ctx, c, h.loaded.Document, h.anchor, h.loaded.Events, mode)
	if err != nil {
		t.Fatal(err)
	}
	private, err := json.MarshalIndent(f, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	private = append(private, '\n')
	root := os.Getenv("M04E_FIXTURE_ROOT")
	if root == "" {
		root = "."
	}
	root, err = filepath.Abs(root)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = os.Stat(filepath.Join(root, "go.mod")); err != nil {
		t.Fatal("M04E_FIXTURE_ROOT must identify repository root containing go.mod")
	}
	archivePath := filepath.Join(root, ".local", "m04e-terminal-fixture-"+mode+".json")
	if err = os.MkdirAll(filepath.Dir(archivePath), 0700); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(archivePath, private, 0600); err != nil {
		t.Fatal(err)
	}
	if err = installTerminalFixture(ctx, s, h, f); err != nil {
		t.Fatal(err)
	}
	verified, err := s.Replay(ctx, owner, game)
	if err != nil || verified.Document.Revision != f.Document.Revision {
		t.Fatalf("installed fixture replay failed: %v", err)
	}
	f.Expected.ArchivePath = archivePath
	f.Expected.ArchiveSHA256 = contracts.SHA256(private)
	public, err := json.Marshal(map[string]any{"mode": mode, "gameId": game, "handNumber": f.Expected.HandNumber, "revision": f.Expected.Revision, "transitionId": f.Expected.TransitionID, "terminalRevision": f.Expected.TerminalRevision, "terminalScores": f.Expected.Scores, "archiveSHA256": f.Expected.ArchiveSHA256, "privateArchivePath": archivePath, "kind": "reachable-terminal-fixture", "analysisRecordsImported": false})
	if err != nil {
		t.Fatal(err)
	}
	fmt.Printf("M04E_TERMINAL_FIXTURE %s\n", public)
}

func installTerminalFixture(ctx context.Context, s *Store, opening historyBundle, f terminalFixture) error {
	raw, err := json.Marshal(f.Document)
	if err != nil {
		return err
	}
	window, err := s.codec.WindowID(f.Document)
	if err != nil {
		return err
	}
	return s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		var active string
		var canRead, canPlay bool
		if err := tx.QueryRow(ctx, "SELECT COALESCE(active_game_id,''),can_read,can_play FROM m03_access WHERE owner_id=$1 FOR UPDATE", f.Opening.Metadata.OwnerID).Scan(&active, &canRead, &canPlay); err != nil {
			return err
		}
		if active != f.Opening.Metadata.GameID || !canRead || !canPlay {
			return ErrAccess
		}
		if err := s.authorize(ctx, tx, f.Opening.Metadata.OwnerID); err != nil {
			return err
		}
		var current, anchor []byte
		var revision int64
		if err := tx.QueryRow(ctx, "SELECT document,revision FROM m03_games WHERE owner_id=$1 AND game_id=$2 FOR UPDATE", f.Opening.Metadata.OwnerID, f.Opening.Metadata.GameID).Scan(&current, &revision); err != nil {
			return err
		}
		if revision != 0 || !bytes.Equal(current, opening.loaded.origin) {
			return ErrConflict
		}
		if err := tx.QueryRow(ctx, "SELECT record FROM m03_anchors WHERE game_id=$1", f.Opening.Metadata.GameID).Scan(&anchor); err != nil {
			return err
		}
		expectedAnchor, _ := json.Marshal(opening.anchor)
		if !bytes.Equal(anchor, expectedAnchor) {
			return ErrStorage
		}
		var commands, work, decisions, help int64
		if err := tx.QueryRow(ctx, "SELECT (SELECT count(*) FROM m03_commands WHERE game_id=$1),(SELECT count(*) FROM m03_work WHERE game_id=$1),(SELECT count(*) FROM m03_decisions WHERE game_id=$1),(SELECT count(*) FROM m04_help_deliveries WHERE game_id=$1)", f.Opening.Metadata.GameID).Scan(&commands, &work, &decisions, &help); err != nil {
			return err
		}
		if commands != 0 || work != 0 || decisions != 0 || help != 0 {
			return ErrConflict
		}
		rows, err := tx.Query(ctx, "SELECT record FROM m03_events WHERE game_id=$1 ORDER BY sequence", f.Opening.Metadata.GameID)
		if err != nil {
			return err
		}
		index := 0
		for rows.Next() {
			var event []byte
			if err = rows.Scan(&event); err != nil {
				rows.Close()
				return err
			}
			if index >= len(opening.loaded.Events) {
				rows.Close()
				return ErrStorage
			}
			expected, _ := json.Marshal(opening.loaded.Events[index])
			if !bytes.Equal(event, expected) {
				rows.Close()
				return ErrStorage
			}
			index++
		}
		rows.Close()
		if err = rows.Err(); err != nil {
			return err
		}
		if index != len(opening.loaded.Events) {
			return ErrStorage
		}
		batch := &pgx.Batch{}
		for _, event := range f.Events[len(opening.loaded.Events):] {
			encoded, e := json.Marshal(event)
			if e != nil {
				return e
			}
			batch.Queue("INSERT INTO m03_events(game_id,sequence,revision,record) VALUES($1,$2,$3,$4)", event.GameID, event.Sequence, event.Revision, encoded)
		}
		for i, command := range f.Commands {
			encoded, e := json.Marshal(command)
			if e != nil {
				return e
			}
			receipt, e := json.Marshal(map[string]any{"commandId": command.CommandID, "gameId": command.GameID, "revision": command.Revision})
			if e != nil {
				return e
			}
			if e = contracts.Validate("LocalServiceCommandReceipt", receipt); e != nil {
				return e
			}
			batch.Queue("INSERT INTO m03_commands(owner_id,command_id,digest,game_id,revision,command,receipt_schema,receipt,checkpoint_digest) VALUES($1,$2,$3,$4,$5,$6,'LocalServiceCommandReceipt',$7,$8)", f.Opening.Metadata.OwnerID, command.CommandID, command.Digest, command.GameID, command.Revision, encoded, receipt, f.CheckpointDigests[i])
		}
		if err = tx.SendBatch(ctx, batch).Close(); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, "UPDATE m03_games SET revision=$1,window_id=$2,document=$3,updated_at=clock_timestamp() WHERE game_id=$4 AND owner_id=$5 AND revision=0", f.Document.Revision, window, raw, f.Document.Metadata.GameID, f.Document.Metadata.OwnerID)
		return err
	})
}
