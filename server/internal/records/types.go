package records

import "encoding/json"

// These private records are separate from the closed 2.0.0 module document.
// Byte slices preserve original analysis/advice bytes through JSON storage.
const RecordVersion = "1.0.0"
const CompactCodecVersion = "events-separated-1.0.0"
const MaxRecordBytes = 16 << 20
const MaxHotBytes = 256 << 10
const MaxEventCount = 100000
const MaxArchiveBytes = 16 << 20
const maxRecordInteger int64 = 9007199254740991

type ModulePin struct {
	GameID                   string `json:"gameId"`
	VariantID                string `json:"variantId"`
	ModuleVersion            string `json:"moduleVersion"`
	RuleProfileID            string `json:"ruleProfileId"`
	StateSchemaVersion       string `json:"stateSchemaVersion"`
	ObservationSchemaVersion string `json:"observationSchemaVersion"`
	PublicSchemaVersion      string `json:"publicSchemaVersion"`
	EventSchemaVersion       string `json:"eventSchemaVersion"`
}
type ComponentVersion struct {
	ID      string `json:"id"`
	Version string `json:"version"`
}
type PolicyPin struct {
	ID            string             `json:"id"`
	Version       string             `json:"version"`
	BudgetVersion string             `json:"budgetVersion"`
	Components    []ComponentVersion `json:"components"`
}
type Competitor struct {
	ID    string `json:"id"`
	Seats []int  `json:"seats"`
}
type Competition struct {
	Mode        string       `json:"mode"`
	Competitors []Competitor `json:"competitors"`
}
type Controller struct {
	Seat int    `json:"seat"`
	Kind string `json:"kind"`
}
type SessionMetadata struct {
	RecordVersion string       `json:"recordVersion"`
	GameID        string       `json:"gameId"`
	OwnerID       string       `json:"ownerId"`
	Pin           ModulePin    `json:"pin"`
	Policy        PolicyPin    `json:"policy"`
	Competition   Competition  `json:"competition"`
	Controllers   []Controller `json:"controllers"`
}
type Checkpoint struct {
	CodecVersion string          `json:"codecVersion"`
	State        json.RawMessage `json:"state"`
	EventCount   int64           `json:"eventCount"`
	EventDigest  string          `json:"eventDigest"`
	EventBytes   int64           `json:"eventBytes"`
}
type Document struct {
	RecordVersion string          `json:"recordVersion"`
	Metadata      SessionMetadata `json:"metadata"`
	Revision      int64           `json:"revision"`
	Checkpoint    Checkpoint      `json:"checkpoint"`
}
type ReplayAnchor struct {
	RecordVersion  string          `json:"recordVersion"`
	GameID         string          `json:"gameId"`
	MetadataDigest string          `json:"metadataDigest"`
	Config         json.RawMessage `json:"config"`
	OpeningChance  []string        `json:"openingChance"`
	Initial        Checkpoint      `json:"initial"`
}
type EventRecord struct {
	RecordVersion string          `json:"recordVersion"`
	GameID        string          `json:"gameId"`
	Sequence      int64           `json:"sequence"`
	Revision      int64           `json:"revision"`
	Payload       json.RawMessage `json:"payload"`
}
type CommandRecord struct {
	RecordVersion string `json:"recordVersion"`
	GameID        string `json:"gameId"`
	Revision      int64  `json:"revision"`
	CommandID     string `json:"commandId"`
	Digest        string `json:"digest"`
	Command       []byte `json:"command"`
}
type AccessAdmission struct {
	OwnerID         string `json:"ownerId"`
	Generation      int64  `json:"generation"`
	ControlRevision int64  `json:"controlRevision"`
	GrantID         string `json:"grantId"`
	UnitID          string `json:"unitId"`
}
type DecisionRecord struct {
	RecordVersion       string          `json:"recordVersion"`
	ID                  string          `json:"id"`
	OwnerID             string          `json:"ownerId"`
	GameID              string          `json:"gameId"`
	Revision            int64           `json:"revision"`
	Actor               int             `json:"actor"`
	WindowID            string          `json:"windowId"`
	Purpose             string          `json:"purpose"`
	PacketVersion       string          `json:"packetVersion"`
	InputDigest         string          `json:"inputDigest"`
	Policy              PolicyPin       `json:"policy"`
	SelectedCandidateID string          `json:"selectedCandidateId"`
	AnalysisSchema      string          `json:"analysisSchema"`
	Analysis            []byte          `json:"analysis"`
	AdviceSchema        string          `json:"adviceSchema"`
	Advice              []byte          `json:"advice"`
	Access              AccessAdmission `json:"access"`
	ReceiptID           string          `json:"receiptId"`
	AttemptID           string          `json:"attemptId"`
	AttemptFence        int64           `json:"attemptFence"`
}
type ExposureRecord struct {
	RecordVersion string `json:"recordVersion"`
	ID            string `json:"id"`
	DecisionID    string `json:"decisionId"`
	OwnerID       string `json:"ownerId"`
	GameID        string `json:"gameId"`
	ReceiptID     string `json:"receiptId"`
	ExposedAt     string `json:"exposedAt"`
	ContentDigest string `json:"contentDigest"`
}
type ReadDisposition struct {
	Playable bool
	Reason   string
}
