package service

import (
	transport "cardford/server/internal/http"
	d "cardford/server/internal/legacydecision"
	"cardford/server/internal/records"
	"cardford/server/internal/sessions"
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"errors"
	"time"
)

func platformTrialView(j records.PlatformTrialJob) (transport.Response, error) {
	var v any
	if j.Status == "completed" {
		if len(j.Result) == 0 {
			return transport.Response{}, records.ErrStorage
		}
		v = j.Result
	} else if len(j.Result) != 0 {
		return transport.Response{}, records.ErrStorage
	}
	return result("PlatformReviewStatus", map[string]any{"commandId": j.CommandID, "status": j.Status, "result": v})
}
func (s *Service) platformTrialStatus(ctx context.Context, owner, id string) (transport.Response, error) {
	j, err := s.store.ReadPlatformTrial(ctx, owner, id)
	if err != nil {
		if errors.Is(err, records.ErrConflict) {
			return transport.Response{}, fail(404, "review-trial-not-found")
		}
		return transport.Response{}, err
	}
	return platformTrialView(j)
}

func (s *Service) platformTrial(ctx context.Context, owner string, r transport.Request) (transport.Response, error) {
	var q platformHelpCommand
	if err := json.Unmarshal(r.Body, &q); err != nil {
		return transport.Response{}, err
	}
	if r.CommandID != "" && q.DecisionID != r.CommandID {
		return transport.Response{}, fail(400, "review-decision-mismatch")
	}
	digest, err := intentDigest(r.Operation, r.Tab, r.Body)
	if err != nil {
		return transport.Response{}, err
	}
	// Read accepted output under source security before requiring a live lease.
	existing, e := s.store.ReadPlatformTrial(ctx, owner, q.CommandID)
	if e == nil {
		if existing.Digest != digest {
			return transport.Response{}, records.ErrCommandDigest
		}
		if existing.Status == "completed" {
			return platformTrialView(existing)
		}
	} else if !errors.Is(e, records.ErrConflict) {
		return transport.Response{}, e
	}
	ctx = records.WithServiceCommand(records.WithControl(ctx, r.Tab, q.ControlLeaseToken), records.ServiceCommand{ID: q.CommandID, Digest: digest, Kind: r.Operation})
	live, err := s.platformCurrent(ctx, owner, q.GameID)
	if err != nil {
		return transport.Response{}, err
	}
	if live.Document.Revision != q.ExpectedRevision {
		return transport.Response{}, records.ErrConflict
	}
	source, b, obs, err := s.platformSource(ctx, owner, live, q.DecisionID)
	if err != nil {
		return transport.Response{}, err
	}
	if source.Document.Revision >= live.Document.Revision || obs.Phase != "play" {
		return transport.Response{}, fail(400, "recorded-play-required")
	}
	original, err := s.store.PlatformOriginal(ctx, owner, q.GameID, source.Document.Revision, true)
	if err != nil {
		return transport.Response{}, err
	}
	if original == nil || original.Policy.ID != source.Document.Metadata.Policy.ID {
		return transport.Response{}, fail(409, "original-policy-unavailable")
	}
	legal := false
	for _, a := range obs.LegalActions {
		legal = legal || (a.Kind == "play" && d.ActionID(a) == q.AlternativeCandidateID)
	}
	if !legal {
		return transport.Response{}, fail(400, "illegal-original-alternative")
	}
	admission, decision, unlocked, err := s.platformSourceAccess(ctx, owner, source, b, "review-alternative")
	if err != nil {
		return transport.Response{}, err
	}
	if !decision.Allowed {
		return transport.Response{}, denied(decision)
	}
	if !unlocked {
		return transport.Response{}, records.ErrAccess
	}
	reservation, err := s.reviewJobs.reserve(owner + ":" + q.CommandID)
	if err != nil {
		return transport.Response{}, err
	}
	if reservation == nil {
		job, e := s.store.ReadPlatformTrial(ctx, owner, q.CommandID)
		if e != nil {
			return transport.Response{}, e
		}
		return platformTrialView(job)
	}
	var seedBytes [4]byte
	if _, err = rand.Read(seedBytes[:]); err != nil {
		reservation.release()
		return transport.Response{}, err
	}
	help := records.PlatformHelpRequest{Source: source, ExpectedLiveRevision: q.ExpectedRevision, Admission: admission, DecisionID: q.TrialID, Kind: "trial", Tool: "review-alternative", Level: 3}
	job, claimed, err := s.store.ClaimPlatformTrial(ctx, help, r.Body, binary.LittleEndian.Uint32(seedBytes[:]))
	if err != nil {
		reservation.release()
		return transport.Response{}, err
	}
	if !claimed {
		reservation.release()
		return platformTrialView(job)
	}
	values := context.WithoutCancel(ctx)
	reservation.dispatch(func(work context.Context) {
		run, cancel := context.WithCancel(values)
		defer cancel()
		stop := context.AfterFunc(work, cancel)
		defer stop()
		if work.Err() != nil {
			return
		}
		frames, err := sessions.Illustrate(run, b.Pin(), obs, q.AlternativeCandidateID, job.Seed, original.Policy.ID)
		failJob := func() {
			cleanup, done := context.WithTimeout(values, time.Second)
			defer done()
			_ = s.store.FailPlatformTrial(cleanup, job)
		}
		if err != nil || run.Err() != nil {
			failJob()
			return
		}
		public := []any{}
		for index, o := range frames {
			presentation, e := d.Presentation(q.GameID, o)
			if e != nil {
				failJob()
				return
			}
			notes := []string{}
			if index == 0 {
				notes = []string{"One uniformly sampled feasible deal; this is not the original hidden deal or a quality grade.", "The named local policy is uncalibrated. This illustration stops after one trick.", "Other seats’ private pass memories are unavailable and are not reconstructed; the current baseline does not use those memories."}
			}
			var action any
			if index == 1 {
				for _, a := range obs.LegalActions {
					if d.ActionID(a) == q.AlternativeCandidateID {
						action = d.PublicAction(a)
					}
				}
			}
			public = append(public, map[string]any{"game": presentation, "action": action, "decisionId": q.DecisionID, "notes": notes})
		}
		output, err := json.Marshal(map[string]any{"trialId": q.TrialID, "decisionId": q.DecisionID, "label": "Possible continuation", "liveRevision": q.ExpectedRevision, "frames": public})
		if err != nil {
			failJob()
			return
		}
		receipt, _ := json.Marshal(map[string]any{"commandId": q.CommandID, "status": "completed", "result": json.RawMessage(output)})
		if err = s.store.FinishPlatformTrial(run, job, help, output, receipt); err != nil {
			failJob()
		}
	})
	return platformTrialView(job)
}
