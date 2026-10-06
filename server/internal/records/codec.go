package records

import (
	"bytes"
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/hearts"
	"cardford/server/internal/games/spades"
	"encoding/json"
	"fmt"
	"reflect"
	"strconv"
)

type storedSnapshot interface {
	gamekernel.Snapshot
	Persist(int) (json.RawMessage, []json.RawMessage, error)
	EventCount() int
	StorageIdentity() (string, string)
	UnitID() string
}

// HistoricalReader is installed by trusted code for an exact immutable pin.
// RegisterHistoricalReader always makes it read-only. No unknown private data
// is projected through a newer reader or by reflecting fields into a response.
type HistoricalReader struct {
	Pin         ModulePin
	Open        func(json.RawMessage, []json.RawMessage) (gamekernel.Snapshot, error)
	ValidateHot func(json.RawMessage, string, string) error
	// ReplayStart reconstructs the original opening with this exact historical
	// implementation. It enables anchor/advice verification, never new play.
	ReplayStart func(json.RawMessage, []string) (gamekernel.Snapshot, error)
	Mode        string
	Window      func(json.RawMessage, int64) (string, error)
	Unit        func(json.RawMessage) (string, error)
}
type storageRegistration struct {
	HistoricalReader
	start    func(json.RawMessage, []string) (gamekernel.Snapshot, error)
	readOnly bool
}
type PolicyRegistration struct {
	Module                                      ModulePin
	Policy                                      PolicyPin
	PacketVersion, AnalysisSchema, AdviceSchema string
}
type DocumentCodec struct {
	readers  map[ModulePin]storageRegistration
	policies []PolicyRegistration
}

// NewDocumentCodec installs private compatible game readers. A policy becomes
// writable only through an explicit exact pin supplied by the caller; this is
// a storage eligibility declaration, not proof of a runtime policy port.
func NewDocumentCodec() *DocumentCodec {
	c := &DocumentCodec{readers: map[ModulePin]storageRegistration{}}
	for _, mode := range []string{"spades-solo", "spades-partners", "hearts"} {
		pin := OriginalPin(mode)
		r := storageRegistration{HistoricalReader: HistoricalReader{Pin: pin, Mode: mode}}
		if mode == "hearts" {
			r.start = hearts.Start
			r.Open = hearts.OpenStored
			r.ValidateHot = hearts.ValidateStoredShape
			r.Window = hearts.StoredWindow
			r.Unit = hearts.StoredUnitID
		} else {
			r.start = spades.Start
			r.Open = spades.OpenStored
			r.ValidateHot = spades.ValidateStoredShape
			r.Window = spades.StoredWindow
			r.Unit = spades.StoredUnitID
		}
		c.readers[pin] = r
	}
	return c
}
func (c *DocumentCodec) RegisterPolicy(p PolicyRegistration) error {
	if err := ValidatePolicy(p.Policy); err != nil {
		return err
	}
	r, ok := c.readers[p.Module]
	if !ok || r.readOnly {
		return fmt.Errorf("policy requires an installed writable module")
	}
	original := p.Module.ModuleVersion == "1.0.0" && p.AnalysisSchema == "RegisteredAnalysis" && p.AdviceSchema == "AdviceView"
	complete := p.Module.ModuleVersion == "2.0.0" && p.AnalysisSchema == OriginalAnalysisSchema && p.AdviceSchema == OriginalAdviceSchema
	if p.PacketVersion != p.Module.ObservationSchemaVersion || (!original && !complete) {
		return fmt.Errorf("unsupported policy input/output schema binding")
	}
	for _, old := range c.policies {
		if old.Module == p.Module && reflect.DeepEqual(old.Policy, p.Policy) {
			return fmt.Errorf("policy already registered for module")
		}
	}
	p.Policy.Components = append([]ComponentVersion{}, p.Policy.Components...)
	c.policies = append(c.policies, p)
	return nil
}
func OriginalPin(mode string) ModulePin {
	p := ModulePin{ModuleVersion: "1.0.0", StateSchemaVersion: "1.0.0", ObservationSchemaVersion: "1.0.0", PublicSchemaVersion: "1.0.0", EventSchemaVersion: "1.0.0"}
	switch mode {
	case "spades-solo":
		p.GameID = "spades"
		p.VariantID = "solo"
		p.RuleProfileID = "spades-solo-training-1.0.0"
	case "spades-partners":
		p.GameID = "spades"
		p.VariantID = "partners"
		p.RuleProfileID = "spades-training-1.0.0"
	case "hearts":
		p.GameID = "hearts"
		p.VariantID = "solo"
		p.RuleProfileID = "hearts-training-1.0.0"
	}
	return p
}
func PracticeMetadata(mode, id, owner string, policy PolicyPin) SessionMetadata {
	m := SessionMetadata{RecordVersion: RecordVersion, GameID: id, OwnerID: owner, Pin: OriginalPin(mode), Policy: policy, Competition: Competition{Mode: "individual", Competitors: []Competitor{}}, Controllers: []Controller{}}
	for seat := 0; seat < 4; seat++ {
		kind := "computer"
		if seat == 0 {
			kind = "human"
		}
		m.Controllers = append(m.Controllers, Controller{Seat: seat, Kind: kind})
		m.Competition.Competitors = append(m.Competition.Competitors, Competitor{ID: strconv.Itoa(seat), Seats: []int{seat}})
	}
	if mode == "spades-partners" {
		m.Competition = Competition{Mode: "partnership", Competitors: []Competitor{{ID: "NS", Seats: []int{0, 2}}, {ID: "EW", Seats: []int{1, 3}}}}
	}
	return m
}
func (c *DocumentCodec) RegisterHistoricalReader(r HistoricalReader) error {
	if c == nil || r.Open == nil || r.ValidateHot == nil || r.ReplayStart == nil || !validText(r.Mode) {
		return fmt.Errorf("incomplete trusted historical reader")
	}
	for _, v := range []string{r.Pin.GameID, r.Pin.VariantID, r.Pin.ModuleVersion, r.Pin.RuleProfileID, r.Pin.StateSchemaVersion, r.Pin.ObservationSchemaVersion, r.Pin.PublicSchemaVersion, r.Pin.EventSchemaVersion} {
		if !validText(v) {
			return fmt.Errorf("incomplete historical pin")
		}
	}
	if _, exists := c.readers[r.Pin]; exists {
		return fmt.Errorf("reader already registered")
	}
	c.readers[r.Pin] = storageRegistration{HistoricalReader: r, start: r.ReplayStart, readOnly: true}
	return nil
}
func (c *DocumentCodec) registration(m SessionMetadata) (storageRegistration, error) {
	if err := ValidateSession(m); err != nil {
		return storageRegistration{}, err
	}
	if c == nil {
		return storageRegistration{}, fmt.Errorf("missing document codec")
	}
	r, ok := c.readers[m.Pin]
	if !ok {
		return r, fmt.Errorf("unsupported module pin without a trusted reader")
	}
	if r.Pin.GameID == "spades" || r.Pin.GameID == "hearts" {
		expected := "individual"
		if r.Mode == "spades-partners" {
			expected = "partnership"
		}
		if m.Competition.Mode != expected {
			return r, fmt.Errorf("competition does not match immutable game variant")
		}
		if expected == "partnership" {
			for _, group := range m.Competition.Competitors {
				if len(group.Seats) != 2 || group.Seats[0]%2 != group.Seats[1]%2 {
					return r, fmt.Errorf("Spades requires opposite-seat partnership")
				}
			}
		}
	}
	return r, nil
}
func (c *DocumentCodec) disposition(m SessionMetadata, r storageRegistration) ReadDisposition {
	if r.readOnly {
		return ReadDisposition{Reason: "historical-reader-only"}
	}
	for _, p := range c.policies {
		if p.Module == m.Pin && reflect.DeepEqual(p.Policy, m.Policy) {
			return ReadDisposition{Playable: true}
		}
	}
	return ReadDisposition{Reason: "unsupported-policy-pin"}
}
func (c *DocumentCodec) ValidateDocument(d Document) error {
	r, err := c.validateEnvelope(d)
	if err != nil {
		return err
	}
	return r.ValidateHot(d.Checkpoint.State, d.Metadata.GameID, r.Mode)
}
func (c *DocumentCodec) validateEnvelope(d Document) (storageRegistration, error) {
	if d.RecordVersion != RecordVersion || !validCounter(d.Revision) {
		return storageRegistration{}, fmt.Errorf("invalid private document version or revision")
	}
	r, err := c.registration(d.Metadata)
	if err != nil {
		return r, err
	}
	if err = validateCheckpoint(d.Checkpoint); err != nil {
		return r, err
	}
	return r, nil
}
func (c *DocumentCodec) DecodeDocument(raw []byte) (Document, error) {
	var d Document
	err := strictRecord(raw, &d)
	if err == nil {
		err = c.ValidateDocument(d)
	}
	return d, err
}
func (c *DocumentCodec) EncodeDocument(d Document) ([]byte, error) {
	if err := c.ValidateDocument(d); err != nil {
		return nil, err
	}
	return json.Marshal(d)
}
func MetadataDigest(m SessionMetadata) (string, error) {
	if err := ValidateSession(m); err != nil {
		return "", err
	}
	b, err := json.Marshal(m)
	if err != nil {
		return "", err
	}
	return JSONDigest(b)
}
func JSONDigest(b []byte) (string, error) {
	canonical, err := contracts.UTF16Canonical(b)
	if err != nil {
		return "", err
	}
	return contracts.SHA256(canonical), nil
}
func appendEventDigest(previous string, event EventRecord) (string, error) {
	raw, err := json.Marshal(event)
	if err != nil {
		return "", err
	}
	canonical, err := contracts.UTF16Canonical(raw)
	if err != nil {
		return "", err
	}
	return contracts.SHA256(append(append([]byte(previous), '\n'), canonical...)), nil
}
func initialEventDigest() string { return contracts.SHA256([]byte("cardford-private-events-1.0.0")) }

// boundSnapshot connects the validated immutable snapshot to its document;
// callers cannot pass a different same-revision game to Advance/decision checks.
type boundSnapshot struct {
	inner                                    gamekernel.Snapshot
	metadataDigest, stateDigest, eventDigest string
	revision, eventCount, eventBytes         int64
}

func (s *boundSnapshot) Apply(json.RawMessage) (gamekernel.Snapshot, error) {
	return nil, fmt.Errorf("use document codec Advance for a bound snapshot")
}
func (s *boundSnapshot) Export() (json.RawMessage, error) { return s.inner.Export() }
func (s *boundSnapshot) Project(actor int) (gamekernel.Projection, error) {
	return s.inner.Project(actor)
}
func bindSnapshot(d Document, s gamekernel.Snapshot) (gamekernel.Snapshot, error) {
	md, err := MetadataDigest(d.Metadata)
	if err != nil {
		return nil, err
	}
	sd, err := JSONDigest(d.Checkpoint.State)
	if err != nil {
		return nil, err
	}
	return &boundSnapshot{inner: s, metadataDigest: md, stateDigest: sd, eventDigest: d.Checkpoint.EventDigest, revision: d.Revision, eventCount: d.Checkpoint.EventCount, eventBytes: d.Checkpoint.EventBytes}, nil
}
func (c *DocumentCodec) bound(d Document, s gamekernel.Snapshot) (*boundSnapshot, error) {
	if err := c.ValidateDocument(d); err != nil {
		return nil, err
	}
	b, ok := s.(*boundSnapshot)
	if !ok || b == nil {
		return nil, fmt.Errorf("unbound private snapshot")
	}
	md, err := MetadataDigest(d.Metadata)
	if err != nil {
		return nil, err
	}
	sd, err := JSONDigest(d.Checkpoint.State)
	if err != nil {
		return nil, err
	}
	if md != b.metadataDigest || sd != b.stateDigest || d.Checkpoint.EventDigest != b.eventDigest || d.Revision != b.revision || d.Checkpoint.EventCount != b.eventCount || d.Checkpoint.EventBytes != b.eventBytes {
		return nil, fmt.Errorf("snapshot/document binding mismatch")
	}
	return b, nil
}
func (c *DocumentCodec) Open(d Document, events []EventRecord) (gamekernel.Snapshot, ReadDisposition, error) {
	r, err := c.validateEnvelope(d)
	if err != nil {
		return nil, ReadDisposition{}, err
	}
	if int64(len(events)) != d.Checkpoint.EventCount {
		return nil, ReadDisposition{}, fmt.Errorf("incomplete event archive")
	}
	payloads := make([]json.RawMessage, 0, len(events))
	digest := initialEventDigest()
	total := 0
	var lastRevision int64
	for i, e := range events {
		if err := ValidateEvent(e); err != nil {
			return nil, ReadDisposition{}, err
		}
		if e.GameID != d.Metadata.GameID || e.Sequence != int64(i+1) || e.Revision < lastRevision || e.Revision > d.Revision || i == 0 && e.Revision != 0 {
			return nil, ReadDisposition{}, fmt.Errorf("event archive binding mismatch")
		}
		total += len(e.Payload)
		if total > MaxArchiveBytes {
			return nil, ReadDisposition{}, fmt.Errorf("event archive byte limit")
		}
		var err error
		digest, err = appendEventDigest(digest, e)
		if err != nil {
			return nil, ReadDisposition{}, err
		}
		lastRevision = e.Revision
		payloads = append(payloads, e.Payload)
	}
	if digest != d.Checkpoint.EventDigest || int64(total) != d.Checkpoint.EventBytes {
		return nil, ReadDisposition{}, fmt.Errorf("event archive digest/byte count mismatch")
	}
	s, err := r.Open(d.Checkpoint.State, payloads)
	if err != nil {
		return nil, ReadDisposition{}, err
	}
	// The module import already decoded/validated the payload. Check identity
	// against metadata without importing that private state a second time.
	p, ok := s.(storedSnapshot)
	if !ok {
		return nil, ReadDisposition{}, fmt.Errorf("reader lacks compact identity export")
	}
	id, mode := p.StorageIdentity()
	if id != d.Metadata.GameID || mode != r.Mode {
		return nil, ReadDisposition{}, fmt.Errorf("restored identity mismatch")
	}
	s, err = bindSnapshot(d, s)
	return s, c.disposition(d.Metadata, r), err
}
func checkpoint(s gamekernel.Snapshot, previous Checkpoint, gameID string, revision int64) (Checkpoint, []EventRecord, error) {
	p, ok := s.(storedSnapshot)
	if !ok {
		return Checkpoint{}, nil, fmt.Errorf("module does not implement compact persistence")
	}
	if p.EventCount() > MaxEventCount {
		return Checkpoint{}, nil, fmt.Errorf("event count limit")
	}
	raw, delta, err := p.Persist(int(previous.EventCount))
	if err != nil {
		return Checkpoint{}, nil, err
	}
	digest := previous.EventDigest
	if digest == "" {
		digest = initialEventDigest()
	}
	eventBytes := previous.EventBytes
	events := make([]EventRecord, 0, len(delta))
	for i, payload := range delta {
		eventBytes += int64(len(payload))
		if eventBytes > MaxArchiveBytes {
			return Checkpoint{}, nil, fmt.Errorf("event archive byte limit")
		}
		e := EventRecord{RecordVersion: RecordVersion, GameID: gameID, Sequence: previous.EventCount + int64(i) + 1, Revision: revision, Payload: payload}
		if err = ValidateEvent(e); err != nil {
			return Checkpoint{}, nil, err
		}
		digest, err = appendEventDigest(digest, e)
		if err != nil {
			return Checkpoint{}, nil, err
		}
		events = append(events, e)
	}
	cp := Checkpoint{CodecVersion: CompactCodecVersion, State: raw, EventCount: int64(p.EventCount()), EventDigest: digest, EventBytes: eventBytes}
	if err = validateCheckpoint(cp); err != nil {
		return Checkpoint{}, nil, err
	}
	return cp, events, nil
}
func (c *DocumentCodec) Start(m SessionMetadata, config json.RawMessage, chance []string) (Document, ReplayAnchor, []EventRecord, error) {
	r, err := c.registration(m)
	if err != nil {
		return Document{}, ReplayAnchor{}, nil, err
	}
	if !c.disposition(m, r).Playable || r.start == nil {
		return Document{}, ReplayAnchor{}, nil, fmt.Errorf("session pin is read-only")
	}
	s, err := r.start(config, chance)
	if err != nil {
		return Document{}, ReplayAnchor{}, nil, err
	}
	cp, events, err := checkpoint(s, Checkpoint{}, m.GameID, 0)
	if err != nil {
		return Document{}, ReplayAnchor{}, nil, err
	}
	d := Document{RecordVersion: RecordVersion, Metadata: m, Revision: 0, Checkpoint: cp}
	if err = c.ValidateDocument(d); err != nil {
		return Document{}, ReplayAnchor{}, nil, err
	}
	md, err := MetadataDigest(m)
	if err != nil {
		return Document{}, ReplayAnchor{}, nil, err
	}
	a := ReplayAnchor{RecordVersion: RecordVersion, GameID: m.GameID, MetadataDigest: md, Config: bytes.Clone(config), OpeningChance: append([]string{}, chance...), Initial: cp}
	// Separate ownership prevents a caller from changing its returned document
	// through the anchor's checkpoint slice (or vice versa).
	a.Initial.State = bytes.Clone(cp.State)
	return d, a, events, nil
}
func (c *DocumentCodec) Advance(d Document, s gamekernel.Snapshot, command json.RawMessage) (Document, []EventRecord, error) {
	next, _, events, err := c.AdvanceBound(d, s, command)
	return next, events, err
}
func (c *DocumentCodec) AdvanceBound(d Document, s gamekernel.Snapshot, command json.RawMessage) (Document, gamekernel.Snapshot, []EventRecord, error) {
	b, err := c.bound(d, s)
	if err != nil {
		return Document{}, nil, nil, err
	}
	r, _ := c.registration(d.Metadata)
	if !c.disposition(d.Metadata, r).Playable {
		return Document{}, nil, nil, fmt.Errorf("session pin is read-only")
	}
	if d.Revision == maxRecordInteger || len(command) == 0 || len(command) > MaxHotBytes {
		return Document{}, nil, nil, fmt.Errorf("transition bounds")
	}
	if _, err = contracts.ParseJSON(command); err != nil {
		return Document{}, nil, nil, err
	}
	next, err := b.inner.Apply(command)
	if err != nil {
		return Document{}, nil, nil, err
	}
	cp, events, err := checkpoint(next, d.Checkpoint, d.Metadata.GameID, d.Revision+1)
	if err != nil {
		return Document{}, nil, nil, err
	}
	d.Revision++
	d.Checkpoint = cp
	bound, err := bindSnapshot(d, next)
	if err != nil {
		return Document{}, nil, nil, err
	}
	return d, bound, events, nil
}
func (c *DocumentCodec) ValidateAnchor(m SessionMetadata, a ReplayAnchor) error {
	if a.RecordVersion != RecordVersion || a.GameID != m.GameID || len(a.Config) == 0 || len(a.Config) > MaxHotBytes || a.OpeningChance == nil {
		return fmt.Errorf("invalid replay anchor")
	}
	md, err := MetadataDigest(m)
	if err != nil {
		return err
	}
	if md != a.MetadataDigest {
		return fmt.Errorf("replay anchor metadata mismatch")
	}
	r, err := c.registration(m)
	if err != nil {
		return err
	}
	if r.start == nil {
		return fmt.Errorf("historical reader cannot verify opening anchor")
	}
	s, err := r.start(a.Config, a.OpeningChance)
	if err != nil {
		return err
	}
	cp, _, err := checkpoint(s, Checkpoint{}, m.GameID, 0)
	if err != nil {
		return err
	}
	if err = r.ValidateHot(cp.State, m.GameID, r.Mode); err != nil {
		return err
	}
	if !equalCheckpoint(cp, a.Initial) {
		return fmt.Errorf("opening configuration/chance/checkpoint mismatch")
	}
	return nil
}
func equalCheckpoint(a, b Checkpoint) bool {
	ad, e1 := JSONDigest(a.State)
	bd, e2 := JSONDigest(b.State)
	return e1 == nil && e2 == nil && ad == bd && a.CodecVersion == b.CodecVersion && a.EventCount == b.EventCount && a.EventDigest == b.EventDigest && a.EventBytes == b.EventBytes
}
func (c *DocumentCodec) WindowID(d Document) (string, error) {
	if err := c.ValidateDocument(d); err != nil {
		return "", err
	}
	r, _ := c.registration(d.Metadata)
	if r.Window == nil {
		return "", fmt.Errorf("historical reader has no command window")
	}
	return r.Window(d.Checkpoint.State, d.Revision)
}

// CurrentUnitID uses the validated immutable game snapshot; shared access code
// never infers a hand/round boundary from game-specific private JSON fields.
func (c *DocumentCodec) CurrentUnitID(d Document, s gamekernel.Snapshot) (string, error) {
	b, err := c.bound(d, s)
	if err != nil {
		return "", err
	}
	p, ok := b.inner.(storedSnapshot)
	if !ok {
		return "", fmt.Errorf("module lacks access unit capability")
	}
	id := p.UnitID()
	if !validText(id) {
		return "", fmt.Errorf("invalid game access unit")
	}
	return id, nil
}

// UnitID derives the next checkpoint's unit through its installed game adapter.
// It is used to fence crossings before publication, after Advance validated it.
func (c *DocumentCodec) UnitID(d Document) (string, error) {
	if err := c.ValidateDocument(d); err != nil {
		return "", err
	}
	r, _ := c.registration(d.Metadata)
	if r.Unit == nil {
		return "", fmt.Errorf("historical reader has no access unit")
	}
	return r.Unit(d.Checkpoint.State)
}

// Replay restores original opening chance and applies the original accepted
// command bytes, including each next-hand deal and separate collection boundary.
// It never consults a seed or rewrites old analysis/advice with a newer policy.
func (c *DocumentCodec) Replay(m SessionMetadata, a ReplayAnchor, commands []CommandRecord) (Document, gamekernel.Snapshot, []EventRecord, error) {
	return c.ReplayVisit(m, a, commands, nil)
}

// ReplayVisit calls visit after each accepted command, never at revision zero.
// The callback receives the immutable bound snapshot without JSON reimport.
func (c *DocumentCodec) ReplayVisit(m SessionMetadata, a ReplayAnchor, commands []CommandRecord, visit func(Document, gamekernel.Snapshot) error) (Document, gamekernel.Snapshot, []EventRecord, error) {
	if err := c.ValidateAnchor(m, a); err != nil {
		return Document{}, nil, nil, err
	}
	r, _ := c.registration(m)
	s, err := r.start(a.Config, a.OpeningChance)
	if err != nil {
		return Document{}, nil, nil, err
	}
	cp, events, err := checkpoint(s, Checkpoint{}, m.GameID, 0)
	if err != nil {
		return Document{}, nil, nil, err
	}
	d := Document{RecordVersion: RecordVersion, Metadata: m, Checkpoint: cp}
	ids := map[string]bool{}
	for i, command := range commands {
		if err = ValidateCommand(command); err != nil {
			return Document{}, nil, nil, err
		}
		if command.GameID != m.GameID || command.Revision != int64(i+1) || ids[command.CommandID] {
			return Document{}, nil, nil, fmt.Errorf("replay command identity/sequence mismatch")
		}
		ids[command.CommandID] = true
		s, err = s.Apply(command.Command)
		if err != nil {
			return Document{}, nil, nil, err
		}
		var delta []EventRecord
		cp, delta, err = checkpoint(s, d.Checkpoint, m.GameID, command.Revision)
		if err != nil {
			return Document{}, nil, nil, err
		}
		events = append(events, delta...)
		d.Revision = command.Revision
		d.Checkpoint = cp
		if visit != nil {
			bound, err := bindSnapshot(d, s)
			if err != nil {
				return Document{}, nil, nil, err
			}
			if err = visit(d, bound); err != nil {
				return Document{}, nil, nil, err
			}
		}
	}
	bound, _, err := c.Open(d, events)
	return d, bound, events, err
}
