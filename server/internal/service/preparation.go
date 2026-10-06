package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	transport "cardford/server/internal/http"
	"cardford/server/internal/records"
)

func (s *Service) prepare(ctx context.Context, owner string, r transport.Request) (transport.Response, error) {
	var q commandRequest
	_ = json.Unmarshal(r.Body, &q)
	ctx = records.WithControl(ctx, r.Tab, q.ControlLeaseToken)
	independentCoach := s.policy != nil && q.Purpose == "coach-advice"
	l, b, a, err := s.loadOwnedCommand(ctx, owner, q, !independentCoach)
	if err != nil {
		return transport.Response{}, err
	}
	n, err := b.Node()
	if err != nil {
		return transport.Response{}, err
	}
	actors := []int{}
	if n.Kind == "actor" && n.Seat != nil {
		actors = append(actors, *n.Seat)
	} else if n.Kind == "sealed" {
		actors = append(actors, n.Actors...)
	} else {
		return transport.Response{}, fail(409, "no-decision")
	}
	if len(actors) == 1 && actors[0] != 0 {
		if q.Purpose != "bot-action" {
			return transport.Response{}, fail(400, "bot-purpose-required")
		}
	} else if q.Purpose == "bot-action" {
		return transport.Response{}, fail(400, "human-purpose-required")
	}
	works := make([]records.PreparedWork, 0, len(actors))
	coachAdmission := a
	if s.policy != nil && q.Purpose == "coach-advice" {
		coachAdmission, _, err = s.chooseAccess(ctx, owner, b, q.GameID, a.UnitID, "coach", "", "advice")
		if err != nil {
			return transport.Response{}, err
		}
		play, _, e := s.chooseAccess(ctx, owner, b, q.GameID, a.UnitID, "play", "continue", "")
		if e == nil {
			a = play
		} else if errors.Is(e, records.ErrAccess) {
			// Advice is independent of permission to advance this owned unit.
			// Sealed bot work waits for play access; the human analysis is complete.
			actors = []int{0}
			a = coachAdmission
		} else {
			return transport.Response{}, e
		}
	}
	for _, actor := range actors {
		purpose := q.Purpose
		if actor != 0 {
			purpose = "bot-action"
		}
		input, e := s.codec.PreparationInput(l.Document, l.Snapshot, actor)
		if e != nil {
			return transport.Response{}, e
		}
		admission := a
		if actor == 0 && purpose == "coach-advice" {
			admission = coachAdmission
		}
		request := records.WorkRequest{GameID: q.GameID, Revision: q.ExpectedRevision, Actor: actor, WindowID: input.WindowID, Purpose: purpose, InputDigest: input.InputDigest, Policy: l.Document.Metadata.Policy, Admission: admission, Lifetime: 5 * time.Minute}
		key := fmt.Sprintf("%s:%s:%d:%d:%s:%d:%d", owner, q.GameID, q.ExpectedRevision, actor, purpose, a.Generation, a.ControlRevision)
		reservation, e := s.jobs.reserve(key)
		if e != nil {
			return transport.Response{}, e
		}
		work, e := s.store.QueueWork(ctx, request)
		if e != nil {
			reservation.release()
			return transport.Response{}, e
		}
		if work.Status == "queued" || work.Status == "running" {
			s.dispatch(ctx, owner, work, reservation)
		} else {
			reservation.release()
		}
		works = append(works, work)
	}
	return preparationView(works)
}
func (s *Service) dispatch(admitted context.Context, owner string, w records.PreparedWork, r *reservation) {
	if r == nil {
		return
	}
	// Preserve trusted principal/control values but detach the HTTP deadline.
	// The finite scheduler deadline and durable attempt lease govern the job.
	values := context.WithoutCancel(admitted)
	r.dispatch(func(job context.Context) {
		ctx, cancel := context.WithCancel(values)
		defer cancel()
		stop := context.AfterFunc(job, cancel)
		defer stop()
		if job.Err() != nil {
			return
		}
		lease, err := s.store.ClaimWork(ctx, owner, w.ID, 25*time.Second)
		if err != nil {
			return
		}
		finish := func(status string) {
			cleanup, done := context.WithTimeout(values, time.Second)
			defer done()
			_ = s.store.FinishWork(cleanup, owner, lease, status)
		}
		l, err := s.store.Load(ctx, owner, w.Request.GameID)
		if err != nil {
			finish("rejected")
			return
		}
		id, err := randomID()
		if err != nil {
			finish("rejected")
			return
		}
		receipt, err := randomID()
		if err != nil {
			finish("rejected")
			return
		}
		executed, err := s.codec.PrepareDecision(ctx, l.Document, l.Snapshot, w.Request.Actor, id)
		if err != nil {
			if ctx.Err() != nil {
				finish("canceled")
			} else {
				finish("rejected")
			}
			return
		}
		if err = ctx.Err(); err != nil {
			finish("canceled")
			return
		}
		d := records.DecisionRecord{RecordVersion: records.RecordVersion, ID: id, OwnerID: owner, GameID: w.Request.GameID, Revision: w.Request.Revision, Actor: w.Request.Actor, WindowID: w.Request.WindowID, Purpose: w.Request.Purpose, PacketVersion: executed.Prepared.ObservationSchemaVersion, InputDigest: executed.Prepared.InputDigest, Policy: w.Request.Policy, SelectedCandidateID: executed.Prepared.CandidateID, AnalysisSchema: executed.AnalysisSchema, Analysis: executed.Analysis, AdviceSchema: executed.AdviceSchema, Advice: executed.Advice, Access: w.Request.Admission, ReceiptID: receipt, AttemptID: lease.WorkID, AttemptFence: lease.Fence}
		if _, err = s.store.PublishWork(ctx, owner, lease, d); err != nil {
			if ctx.Err() != nil {
				finish("canceled")
			} else {
				finish("rejected")
			}
		}
	})
}
func preparationView(works []records.PreparedWork) (transport.Response, error) {
	if len(works) == 0 {
		return transport.Response{}, fail(409, "preparation-unavailable")
	}
	main := works[0]
	ids := make([]string, 0, len(works))
	status := "completed"
	for _, w := range works {
		ids = append(ids, w.ID)
		if w.Request.Actor == 0 {
			main = w
		}
		switch w.Status {
		case "rejected", "canceled":
			status = w.Status
		case "queued", "running":
			if status == "completed" {
				status = w.Status
			}
		}
	}
	out := map[string]any{"workId": main.ID, "workIds": ids, "status": status, "gameId": main.Request.GameID, "revision": main.Request.Revision, "purpose": main.Request.Purpose, "preparedDecisionId": main.ID}
	if main.Status == "completed" && main.Request.Actor == 0 {
		out["decisionId"] = main.DecisionID
	}
	r, err := result("LocalServicePrepareView", out)
	if status == "queued" || status == "running" {
		r.Status = 202
	}
	return r, err
}
func (s *Service) work(ctx context.Context, owner string, r transport.Request) (transport.Response, error) {
	w, err := s.store.ReadWork(ctx, owner, r.CommandID)
	if err != nil {
		return transport.Response{}, err
	}
	if r.Operation == "work-retry" {
		var q struct {
			ControlLeaseToken string `json:"controlLeaseToken"`
		}
		_ = json.Unmarshal(r.Body, &q)
		ctx = records.WithControl(ctx, r.Tab, q.ControlLeaseToken)
		if w.Status == "completed" && time.Now().Before(w.ExpiresAt) {
			return preparationView([]records.PreparedWork{w})
		}
		reservation, e := s.jobs.reserve(owner + ":retry:" + w.ID)
		if e != nil {
			return transport.Response{}, e
		}
		if w.Status == "completed" {
			w, e = s.store.RetryExpiredResult(ctx, owner, w.ID, 5*time.Minute)
		} else {
			w, e = s.store.RequeueWork(ctx, owner, w.ID, 5*time.Minute)
		}
		if e != nil {
			reservation.release()
			return transport.Response{}, e
		}
		s.dispatch(ctx, owner, w, reservation)
	}
	return preparationView([]records.PreparedWork{w})
}
func (s *Service) decision(ctx context.Context, owner, id string) (transport.Response, error) {
	d, err := s.store.ReadDecisionForDelivery(ctx, owner, id)
	if err != nil {
		return transport.Response{}, err
	}
	if d.Actor != 0 || d.Purpose != "coach-advice" {
		return transport.Response{}, records.ErrReadDenied
	}
	_, advice, err := records.OriginalDecision(d)
	if err != nil {
		return transport.Response{}, err
	}
	return result("LocalServiceDecisionView", map[string]any{"decisionId": d.ID, "gameId": d.GameID, "revision": d.Revision, "advice": advice.Levels[2]})
}
