package gamekernel

import (
	"cardford/server/internal/contracts"
	"context"
	"encoding/json"
	"fmt"
)

// Input digest retains the exact frozen M02 canonicalization. It is deliberately
// different from the original V1 observation-only record digest.
func (b *boundSession[S, O, A]) inputDigest(input sessionInput[O, A], seat int, policy string) (string, error) {
	ob, err := b.model.EncodeObservation(input.observation)
	if err != nil {
		return "", err
	}
	raw, err := json.Marshal(map[string]any{"pin": b.Pin(), "actor": seat, "policyId": policy, "observation": ob, "packet": input.packet})
	if err != nil {
		return "", err
	}
	if len(raw) > 16<<20 {
		return "", fmt.Errorf("preparation input exceeds archive budget")
	}
	canonical, err := contracts.LegacyKernelCanonical(raw)
	if err != nil {
		return "", err
	}
	return contracts.SHA256(canonical), nil
}
func (b *boundSession[S, O, A]) PreparationBinding(seat int, policy string) (PreparationBinding, error) {
	if !ValidIdentifier(policy) {
		return PreparationBinding{}, fmt.Errorf("invalid policy identifier")
	}
	input, err := b.inputFor(seat)
	if err != nil {
		return PreparationBinding{}, err
	}
	digest, err := b.inputDigest(input, seat, policy)
	if err != nil {
		return PreparationBinding{}, err
	}
	ids := make([]string, len(input.candidates))
	for i, c := range input.candidates {
		ids[i] = c.ID
	}
	return PreparationBinding{InputDigest: digest, Packet: input.packet, CandidateIDs: ids}, nil
}

// PrepareComplete invokes the installed game policy once and freezes its full
// analysis and original advice alongside the registered M02 projection.
func (b *boundSession[S, O, A]) PrepareComplete(ctx context.Context, seat int, policy, decisionID string) (CompletePreparation, error) {
	var out CompletePreparation
	if err := ctx.Err(); err != nil {
		return out, err
	}
	if !ValidIdentifier(policy) || !ValidIdentifier(decisionID) || b.model.AnalyzeComplete == nil {
		return out, fmt.Errorf("complete policy output unavailable")
	}
	input, err := b.inputFor(seat)
	if err != nil {
		return out, err
	}
	if err = ctx.Err(); err != nil {
		return out, err
	}
	digest, err := b.inputDigest(input, seat, policy)
	if err != nil {
		return out, err
	}
	if err = ctx.Err(); err != nil {
		return out, err
	}
	a, err := b.model.AnalyzeComplete(ctx, input.observation, policy, decisionID)
	if err != nil {
		return out, err
	}
	if err = ctx.Err(); err != nil {
		return out, err
	}
	if _, err = resolveCandidate(input.candidates, a.CandidateID); err != nil {
		return out, err
	}
	registered, err := ParseRegisteredAnalysis(a.Registered, b.Pin(), a.CandidateID)
	if err != nil {
		return out, err
	}
	for _, p := range []PrivateOutput{a.Detail, a.Advice} {
		if !ValidIdentifier(p.Schema) || len(p.Bytes) == 0 || len(p.Bytes) > 16<<20 {
			return out, fmt.Errorf("invalid bounded private policy output")
		}
		if _, err = contracts.ParseJSON(p.Bytes); err != nil {
			return out, err
		}
	}
	out.Prepared = PreparedDecision{Actor: seat, CandidateID: a.CandidateID, InputDigest: digest, PolicyID: policy, ObservationSchemaVersion: b.Pin().ObservationSchemaVersion, Analysis: registered}
	out.Detail = PrivateOutput{a.Detail.Schema, append(json.RawMessage(nil), a.Detail.Bytes...)}
	out.Advice = PrivateOutput{a.Advice.Schema, append(json.RawMessage(nil), a.Advice.Bytes...)}
	return out, ctx.Err()
}
func (b *boundSession[S, O, A]) Persist(after int) (json.RawMessage, []json.RawMessage, error) {
	if b.model.Persist == nil {
		return nil, nil, fmt.Errorf("session lacks compact persistence")
	}
	return b.model.Persist(b.state, after)
}
func (b *boundSession[S, O, A]) EventCount() int {
	if b.model.EventCount == nil {
		return -1
	}
	return b.model.EventCount(b.state)
}
func (b *boundSession[S, O, A]) StorageIdentity() (string, string) {
	if b.model.StorageIdentity == nil {
		return "", ""
	}
	return b.model.StorageIdentity(b.state)
}
func (b *boundSession[S, O, A]) UnitID() string {
	if b.model.StorageUnit == nil {
		return ""
	}
	return b.model.StorageUnit(b.state)
}
