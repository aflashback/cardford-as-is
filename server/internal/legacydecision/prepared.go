package legacydecision

import (
	"cardford/server/internal/contracts"
	"encoding/json"
)

// These private envelopes preserve the complete frozen original policy output.
// Their public registered projection is intentionally smaller.
const PreparedAnalysisSchema = "OriginalPreparedAnalysis-1.0.0"
const PreparedAdviceSchema = "OriginalPreparedAdvice-1.0.0"

type PreparedAnalysisEnvelope struct {
	Version    string          `json:"version"`
	Registered json.RawMessage `json:"registered"`
	Original   Analysis        `json:"original"`
}
type PreparedAdviceEnvelope struct {
	Version  string                  `json:"version"`
	Original Advice                  `json:"original"`
	Levels   [3]contracts.AdviceView `json:"levels"`
}
