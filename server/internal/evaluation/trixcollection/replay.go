package trixcollection

import (
	"fmt"

	"cardford/server/internal/gamekernel"
)

type ReplayInput struct {
	Variant string   `json:"variant"`
	Request string   `json:"request"`
	ID      string   `json:"id"`
	Deck    []string `json:"deck"`
	Choices []Choice `json:"choices"`
}

// Replay uses accepted external selections verbatim; no policy fills gaps.
func Replay(in ReplayInput) (Frame, error) {
	b, err := StartRequest(in.Variant, in.Request, in.ID, in.Deck)
	if err != nil {
		return Frame{}, err
	}
	scheduled, err := ScheduledRequest(b)
	if err != nil {
		return Frame{}, err
	}
	for _, choice := range in.Choices {
		b, err = CommitRequest(b, b.EventCount(), choice.Actor, choice.CandidateID)
		if err != nil {
			return Frame{}, err
		}
	}
	if _, err = FinishRequest(b); err != nil {
		return Frame{}, fmt.Errorf("incomplete replay: %w", err)
	}
	return SnapshotFrame(b, &scheduled)
}

func ScheduledRequest(b gamekernel.BoundSession) (Choice, error) {
	request, err := requestScope(b)
	if err != nil {
		return Choice{}, err
	}
	o, err := publicObservation(b)
	if err != nil {
		return Choice{}, err
	}
	return Choice{Actor: o.Owner, CandidateID: "choose:" + request}, nil
}
