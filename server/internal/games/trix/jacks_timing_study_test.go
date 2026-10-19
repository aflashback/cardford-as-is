package trix

// The opt-in file operator stays test-only. It accepts only an actor packet and
// exact pin; it cannot read a private game journal or accept a fixture answer.
import (
	"bytes"
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"reflect"
	"testing"
	"time"
)

type jacksTimingStudyInput struct {
	SchemaVersion string                      `json:"schemaVersion"`
	Cases         []jacksTimingStudyInputCase `json:"cases"`
}

type jacksTimingStudyInputCase struct {
	ID            string            `json:"id"`
	Pin           gamekernel.Pin    `json:"pin"`
	ActorPacket   json.RawMessage   `json:"actorPacket"`
	Configuration JacksTimingConfig `json:"configuration"`
}

type jacksTimingStudyPacket struct {
	PublicSchemaVersion string                       `json:"publicSchemaVersion"`
	GameID              string                       `json:"gameId"`
	VariantID           string                       `json:"variantId"`
	Seat                int                          `json:"seat"`
	Phase               string                       `json:"phase"`
	Observation         Observation                  `json:"observation"`
	Candidates          []gamekernel.PublicCandidate `json:"candidates"`
}

type jacksTimingStudyOutput struct {
	SchemaVersion string                       `json:"schemaVersion"`
	Status        string                       `json:"status"`
	Cases         []jacksTimingStudyOutputCase `json:"cases"`
}

type jacksTimingStudyOutputCase struct {
	ID               string            `json:"id"`
	ActorObservation Observation       `json:"actorObservation"`
	Pin              gamekernel.Pin    `json:"pin"`
	Evaluation       JacksTimingResult `json:"evaluation"`
	Error            string            `json:"error,omitempty"`
}

func timingStudyStrict(raw []byte, v any) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(v); err != nil {
		return err
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return fmt.Errorf("unexpected trailing study JSON")
	}
	return nil
}

func decodeJacksTimingStudy(raw []byte) (jacksTimingStudyInput, []jacksTimingStudyPacket, error) {
	var input jacksTimingStudyInput
	if len(raw) > 16<<20 {
		return input, nil, fmt.Errorf("oversized timing study input")
	}
	if err := timingStudyStrict(raw, &input); err != nil {
		return input, nil, err
	}
	if input.SchemaVersion != "trix-jacks-timing-study-input-1.0.0" || len(input.Cases) < 1 || len(input.Cases) > 16 {
		return input, nil, fmt.Errorf("invalid timing study identity or case count")
	}
	packets := make([]jacksTimingStudyPacket, 0, len(input.Cases))
	seen := map[string]bool{}
	for _, c := range input.Cases {
		if c.ID == "" || len(c.ID) > 200 || seen[c.ID] {
			return input, nil, fmt.Errorf("invalid or repeated timing case identity")
		}
		seen[c.ID] = true
		if err := c.Configuration.Validate(); err != nil {
			return input, nil, err
		}
		if err := contracts.Validate("RegisteredActorPacket", c.ActorPacket); err != nil {
			return input, nil, err
		}
		var p jacksTimingStudyPacket
		if err := timingStudyStrict(c.ActorPacket, &p); err != nil {
			return input, nil, err
		}
		p.Observation.publicSchemaVersion = p.PublicSchemaVersion
		if p.GameID != "trix" || p.Observation.GameID != "trix" || p.PublicSchemaVersion != "1.2.0" || p.VariantID != p.Observation.VariantID || p.Seat != p.Observation.Seat || p.Phase != "layout" || p.Observation.Phase != "layout" || p.Observation.LayoutHistory == nil || p.Observation.LayoutHistory.Status != "available" {
			return input, nil, fmt.Errorf("timing actor packet requires current active Jacks chronology")
		}
		if _, err := evaluationProfile(c.Pin, p.Observation); err != nil {
			return input, nil, err
		}
		if err := ValidateLayoutHistoryObservation(p.Observation); err != nil {
			return input, nil, err
		}
		legal := Legal(p.Observation)
		if len(legal) == 0 || len(legal) != len(p.Candidates) {
			return input, nil, fmt.Errorf("incomplete timing packet legal alternatives")
		}
		for i, action := range legal {
			var recorded Action
			if err := timingStudyStrict(p.Candidates[i].Public, &recorded); err != nil || !reflect.DeepEqual(recorded, action) || p.Candidates[i].ID != ActionID(action) {
				return input, nil, fmt.Errorf("changed timing packet legal action")
			}
		}
		packets = append(packets, p)
	}
	return input, packets, nil
}

func TestJacksTimingStudy(t *testing.T) {
	inputPath, outputPath := os.Getenv("TRIX_JACKS_TIMING_STUDY_INPUT"), os.Getenv("TRIX_JACKS_TIMING_STUDY_OUTPUT")
	if inputPath == "" && outputPath == "" {
		t.Skip("opt-in sampled timing study")
	}
	if inputPath == "" || outputPath == "" {
		t.Fatal("both timing study paths are required")
	}
	file, err := os.Open(inputPath)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := io.ReadAll(io.LimitReader(file, (16<<20)+1))
	closeErr := file.Close()
	if err != nil || closeErr != nil {
		t.Fatal("read timing input", err, closeErr)
	}
	input, packets, err := decodeJacksTimingStudy(raw)
	if err != nil {
		t.Fatal(err)
	}
	output, err := os.OpenFile(outputPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		t.Fatal("refusing unavailable or existing output", err)
	}
	result := jacksTimingStudyOutput{SchemaVersion: "trix-jacks-timing-study-1.0.0", Status: "incomplete", Cases: []jacksTimingStudyOutputCase{}}
	defer func() {
		encoder := json.NewEncoder(output)
		encoder.SetIndent("", "  ")
		if err := encoder.Encode(result); err != nil {
			t.Error(err)
		}
		if err := output.Close(); err != nil {
			t.Error(err)
		}
	}()
	ctx := context.Background()
	if deadline, ok := t.Deadline(); ok {
		var cancel context.CancelFunc
		ctx, cancel = context.WithDeadline(ctx, deadline.Add(-time.Second))
		defer cancel()
	}
	for i, c := range input.Cases {
		o := packets[i].Observation
		evaluation, err := EvaluateJacksTiming(ctx, o, c.Pin, c.Configuration)
		entry := jacksTimingStudyOutputCase{ID: c.ID, ActorObservation: o, Pin: c.Pin, Evaluation: evaluation}
		if err != nil {
			entry.Error = err.Error()
		}
		result.Cases = append(result.Cases, entry)
		t.Logf("%s: %s sampled-worlds=%d unique-allocations=%d sampler-operations=%d native-steps=%d", c.ID, evaluation.Status, evaluation.Work.Worlds, evaluation.UniqueAllocations, evaluation.Work.SamplerOperations, evaluation.Work.Steps)
		if err != nil || evaluation.Status != "completed" || !evaluation.SamplingComplete {
			t.Fatal("timing comparison incomplete", c.ID, err)
		}
	}
	result.Status = "completed"
}

// Catches accepting substituted legal payloads, missing alternatives, a
// mismatched actor/profile, hidden packet extras or trailing JSON documents.
func TestJacksTimingStudyInputBoundary(t *testing.T) {
	s := jacksTimingFixture(t, "forced-five-card-release", "complex-partners")
	o := Observe(s, 0)
	packet := jacksTimingStudyPacket{PublicSchemaVersion: "1.2.0", GameID: "trix", VariantID: o.VariantID, Seat: 0, Phase: "layout", Observation: o, Candidates: []gamekernel.PublicCandidate{}}
	for _, action := range Legal(o) {
		encoded, _ := json.Marshal(action)
		packet.Candidates = append(packet.Candidates, gamekernel.PublicCandidate{ID: ActionID(action), Public: encoded})
	}
	packetBytes, _ := json.Marshal(packet)
	c := DefaultJacksTimingConfig()
	c.WorldsPerStream = 1
	input := jacksTimingStudyInput{SchemaVersion: "trix-jacks-timing-study-input-1.0.0", Cases: []jacksTimingStudyInputCase{{ID: "forced", Pin: Pin(o.VariantID), ActorPacket: packetBytes, Configuration: c}}}
	raw, _ := json.Marshal(input)
	decoded, packets, err := decodeJacksTimingStudy(raw)
	if err != nil || len(packets) != 1 || len(decoded.Cases) != 1 || packets[0].Observation.publicSchemaVersion != "1.2.0" {
		t.Fatal("valid native actor packet rejected", err)
	}
	for _, mutate := range []func(*jacksTimingStudyPacket){
		func(p *jacksTimingStudyPacket) { p.Seat = 1 },
		func(p *jacksTimingStudyPacket) { p.PublicSchemaVersion = "1.1.0" },
		func(p *jacksTimingStudyPacket) { p.Candidates = p.Candidates[:1] },
		func(p *jacksTimingStudyPacket) {
			p.Candidates[0].Public = json.RawMessage(`{"kind":"layout-card","card":"CK"}`)
		},
	} {
		var badPacket jacksTimingStudyPacket
		if err := json.Unmarshal(packetBytes, &badPacket); err != nil {
			t.Fatal(err)
		}
		mutate(&badPacket)
		badBytes, _ := json.Marshal(badPacket)
		bad := input
		bad.Cases = append([]jacksTimingStudyInputCase{}, input.Cases...)
		bad.Cases[0].ActorPacket = badBytes
		encoded, _ := json.Marshal(bad)
		if _, _, err := decodeJacksTimingStudy(encoded); err == nil {
			t.Fatal("accepted substituted actor packet")
		}
	}
	var extra map[string]any
	_ = json.Unmarshal(packetBytes, &extra)
	extra["privateHands"] = [4][]string{}
	extraBytes, _ := json.Marshal(extra)
	input.Cases[0].ActorPacket = extraBytes
	encoded, _ := json.Marshal(input)
	if _, _, err := decodeJacksTimingStudy(encoded); err == nil {
		t.Fatal("accepted private packet field")
	}
	if _, _, err := decodeJacksTimingStudy(append(raw, []byte(" {}")...)); err == nil {
		t.Fatal("accepted trailing study JSON")
	}
}
