package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"cardford/server/internal/access"
	"cardford/server/internal/contracts"
	"cardford/server/internal/demo"
	"cardford/server/internal/gamekernel"
	transport "cardford/server/internal/http"
	"cardford/server/internal/records"
	"cardford/server/internal/sessions"
)

type Service struct {
	store      *records.Store
	codec      *records.DocumentCodec
	jobs       *scheduler
	reviewJobs *scheduler
	policy     *access.Policy
	resolver   *access.Resolver
}

func New(store *records.Store, codec *records.DocumentCodec) (*Service, error) {
	if store == nil || codec == nil {
		return nil, fmt.Errorf("missing local service dependencies")
	}
	return &Service{store: store, codec: codec, jobs: newScheduler(2, 16, 20*time.Second), reviewJobs: newScheduler(1, 4, 20*time.Second)}, nil
}
func (s *Service) Close() { s.jobs.close(); s.reviewJobs.close() }

// Only these routes accept user input. The public schema is validated again
// here so trusted transport composition cannot accidentally bypass the boundary.
var requests = map[string]string{
	"platform-reconcile": "PlatformReconcileRequest", "platform-delete-account": "AccountDeleteRequest",
	"platform-preferences": "PlatformPreferencesRequest", "platform-billing-preview": "BillingPreviewRequest", "platform-billing-change": "BillingConfirmRequest", "platform-family-command": "PlatformFamilyCommand",
	"platform-advice": "PlatformAdviceRequest", "platform-notes": "PlatformNotesRequest", "platform-exposures": "PlatformReviewExposureRequest", "platform-review-trial": "PlatformReviewTrialRequest",
	"demo-frame":     "DemoFrameRequest",
	"access-resolve": "LocalServiceAccessRequest", "activate-trial": "LocalServiceTrialRequest", "unlock-coaching": "LocalServiceUnlockRequest",
	"local-session": "LocalServiceEmptyRequest", "logout": "LocalServiceEmptyRequest", "delete-account": "LocalServiceEmptyRequest",
	"new-session": "LocalServiceNewSessionRequest", "control": "LocalServiceControlRequest", "action": "LocalServiceActionRequest",
	"prepare": "LocalServicePrepareRequest", "advance": "LocalServiceAdvanceRequest", "next-hand": "LocalServiceNextHandRequest",
	"work-retry": "LocalServiceWorkRetryRequest", "reconcile": "LocalServiceReconcileRequest",
}

func fail(status int, code string) error {
	public := "SERVICE_UNAVAILABLE"
	switch status {
	case 400, 422:
		public = "INVALID_COMMAND"
	case 401:
		public = "UNAUTHENTICATED"
	case 403:
		public = "FORBIDDEN"
	case 404:
		public = "NOT_FOUND"
	case 409:
		public = "STALE_REVISION"
	}
	if code == "command-input-mismatch" {
		public = "IDEMPOTENCY_CONFLICT"
	}
	if code == "control-lease-changed" {
		public = "LEASE_LOST"
	}
	return &transport.LocalError{Status: status, Code: public}
}
func result(schema string, v any) (transport.Response, error) {
	raw, err := json.Marshal(v)
	if err != nil {
		return transport.Response{}, err
	}
	if err = contracts.Validate(schema, raw); err != nil {
		return transport.Response{}, fmt.Errorf("invalid service projection: %w", err)
	}
	return transport.Response{Status: 200, Body: raw}, nil
}
func accepted(out records.AcceptedOutcome) (transport.Response, error) {
	return transport.Response{Status: 200, Body: append(json.RawMessage(nil), out.Receipt...)}, nil
}

func (s *Service) Call(ctx context.Context, r transport.Request) (out transport.Response, err error) {
	defer func() {
		if err == nil {
			return
		}
		var httpErr *transport.LocalError
		err = platformAccountError(err)
		if errors.As(err, &httpErr) {
			return
		}
		switch {
		case errors.Is(err, records.ErrUnauthenticated):
			err = fail(401, "invalid-session")
		case errors.Is(err, records.ErrControl):
			err = fail(409, "control-lease-changed")
		case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
			err = fail(408, "interrupted-reconcile-before-retry")
		case errors.Is(err, ErrBusy), errors.Is(err, records.ErrWorkBusy):
			err = fail(429, "work-capacity-busy")
		case errors.Is(err, records.ErrReadDenied), errors.Is(err, records.ErrAccess):
			err = fail(403, "access-denied")
		case errors.Is(err, records.ErrAllowance):
			err = &transport.LocalError{Status: 403, Code: "QUOTA_EXHAUSTED"}
		case errors.Is(err, records.ErrCommandDigest):
			err = fail(409, "command-input-mismatch")
		case errors.Is(err, records.ErrConflict), errors.Is(err, records.ErrWorkStale):
			err = fail(409, "state-or-preparation-changed")
		case errors.Is(err, records.ErrStorage):
			err = fail(422, "saved-record-unavailable")
		default:
			err = fail(500, "local-service-failed")
		}
	}()
	if schema, ok := requests[r.Operation]; ok {
		if contracts.Validate(schema, r.Body) != nil {
			return out, fail(400, "invalid-request")
		}
	}
	if r.Operation == "health" {
		return result("LocalServiceHealthView", map[string]any{"status": "ready", "mode": "local", "identity": "local-test", "provider": "off", "payments": "fixture"})
	}
	if r.Operation == "demo-frame" {
		frame, e := demo.GetFrameJSON(r.Body)
		if e != nil {
			return out, fail(400, "invalid-demo-request")
		}
		return result("DemoFrame", frame)
	}
	if r.Operation == "local-session" {
		// Repeated initialization with a valid cookie preserves the same owner.
		if r.Token != "" {
			p, e := s.store.Authenticate(ctx, r.Token)
			if e == nil {
				if e = s.identityMode(ctx, p); e != nil {
					return out, e
				}
				return result("IdentityView", map[string]any{"playerId": p.OwnerID})
			}
			return out, fail(401, "invalid-session")
		}
		var identity records.Identity
		var e error
		if s.policy == nil {
			identity, e = s.store.NewLocalIdentity(ctx)
		} else {
			var templates []records.Grant
			templates, e = offerTemplates(s.policy.Offers, "free", time.Now())
			if e == nil {
				identity, e = s.store.NewConfiguredIdentity(ctx, templates)
			}
		}
		if e != nil {
			return out, e
		}
		out, e = result("IdentityView", map[string]any{"playerId": identity.Principal.OwnerID})
		out.SetToken = identity.Token
		return out, e
	}
	p, e := s.store.Authenticate(ctx, r.Token)
	if e != nil {
		return out, fail(401, "invalid-session")
	}
	ctx = records.WithPrincipal(ctx, p)
	if r.Operation != "logout" && r.Operation != "delete-account" && r.Operation != "platform-delete-account" {
		if e = s.identityMode(ctx, p); e != nil {
			return out, e
		}
	}
	if s.policy != nil && (r.Operation == "access-offers" || r.Operation == "access-resolve" || r.Operation == "platform-session") {
		templates, e := offerTemplates(s.policy.Offers, "free", time.Now())
		if e != nil {
			return out, e
		}
		if e = s.store.EnsureConfiguredFreeGrants(ctx, templates); e != nil {
			return out, e
		}
	}
	switch r.Operation {
	case "platform-session":
		return s.platformSession(ctx, p.OwnerID, r.Tab)
	case "platform-account":
		return s.platformAccount(ctx, p.OwnerID)
	case "platform-preferences", "platform-get-preferences":
		return s.platformPreferences(ctx, p.OwnerID, r)
	case "platform-billing-preview":
		return s.platformBillingPreview(ctx, p.OwnerID, r)
	case "platform-billing-change":
		return s.platformBillingChange(ctx, p.OwnerID, r)
	case "platform-family":
		return s.platformFamily(ctx, p.OwnerID)
	case "platform-family-command":
		return s.platformFamilyCommand(ctx, p.OwnerID, r)
	case "platform-export":
		return s.platformExport(ctx, p.OwnerID)
	case "platform-saved-advice":
		return s.platformSavedAdvice(ctx, p.OwnerID, r.CommandID)
	case "platform-advice", "platform-notes", "platform-exposures", "platform-reviews", "platform-review", "platform-review-access", "platform-review-trial", "platform-review-status":
		return s.platformReview(ctx, p.OwnerID, r)
	case "access-offers", "access-resolve":
		return s.accessRequest(ctx, p.OwnerID, r)
	case "activate-trial":
		return s.activateTrial(ctx, p.OwnerID, r)
	case "unlock-coaching":
		return s.unlock(ctx, p.OwnerID, r)
	case "identity":
		return result("IdentityView", map[string]any{"playerId": p.OwnerID})
	case "session", "saved-session":
		return s.view(ctx, p.OwnerID, r.Tab, r.CommandID)
	case "new-session":
		return s.create(ctx, p.OwnerID, r)
	case "control":
		return s.control(ctx, r)
	case "action", "advance", "next-hand":
		return s.mutate(ctx, p.OwnerID, r)
	case "prepare":
		return s.prepare(ctx, p.OwnerID, r)
	case "work", "work-retry":
		return s.work(ctx, p.OwnerID, r)
	case "decision":
		return s.decision(ctx, p.OwnerID, r.CommandID)
	case "reconcile", "platform-reconcile":
		var q struct {
			CommandID string          `json:"commandId"`
			Operation string          `json:"operation"`
			Request   json.RawMessage `json:"request"`
		}
		_ = json.Unmarshal(r.Body, &q)
		var id struct {
			CommandID string `json:"commandId"`
		}
		_ = json.Unmarshal(q.Request, &id)
		if id.CommandID != q.CommandID {
			return out, fail(400, "command-input-mismatch")
		}
		digest, e := intentDigest(q.Operation, r.Tab, q.Request)
		if e != nil {
			return out, e
		}
		v, e := s.store.ReconcileService(ctx, q.CommandID, digest)
		if r.Operation == "platform-reconcile" {
			if q.Operation == "platform-review-trial" {
				job, readErr := s.store.ReadPlatformTrial(ctx, p.OwnerID, q.CommandID)
				if errors.Is(readErr, records.ErrConflict) {
					return result("PlatformReconcileView", map[string]any{"status": "unknown"})
				}
				if readErr != nil {
					return out, readErr
				}
				if job.Digest != digest {
					return out, records.ErrCommandDigest
				}
				response, readErr := platformTrialView(job)
				if readErr != nil {
					return out, readErr
				}
				return result("PlatformReconcileView", map[string]any{"status": "accepted", "receipt": response.Body})
			}
			if errors.Is(e, records.ErrConflict) {
				return result("PlatformReconcileView", map[string]any{"status": "unknown"})
			}
			if e != nil {
				return out, e
			}
			if e = s.platformReceiptReadable(ctx, p.OwnerID, q.Operation, q.Request); e != nil {
				return out, e
			}
			return result("PlatformReconcileView", map[string]any{"status": "accepted", "receipt": json.RawMessage(v.Receipt)})
		}
		if e != nil {
			return out, e
		}
		return accepted(v)
	case "logout":
		if e = s.store.RevokeSession(ctx); e != nil {
			return out, e
		}
		out, e = result("AcceptedView", map[string]any{"accepted": true})
		out.ClearToken = true
		return out, e
	case "delete-account", "platform-delete-account":
		if e = s.store.EraseOwner(ctx); e != nil {
			return out, e
		}
		out, e = result("AccountDeleteView", map[string]any{"deleted": true, "mode": "local-test", "message": "Local Go practice data and sessions deleted."})
		out.ClearToken = true
		return out, e
	default:
		return out, fail(404, "unknown-route")
	}
}

func intentDigest(operation, tab string, body json.RawMessage) (string, error) {
	raw, err := json.Marshal(struct {
		Version   string          `json:"version"`
		Operation string          `json:"operation"`
		Tab       string          `json:"tab"`
		Request   json.RawMessage `json:"request"`
	}{"local-command-1.0.0", operation, tab, body})
	if err != nil {
		return "", err
	}
	return records.JSONDigest(raw)
}
func (s *Service) command(ctx context.Context, r transport.Request, id string) (context.Context, *records.AcceptedOutcome, error) {
	digest, err := intentDigest(r.Operation, r.Tab, r.Body)
	if err != nil {
		return ctx, nil, err
	}
	out, err := s.store.ReconcileService(ctx, id, digest)
	if err == nil {
		return ctx, &out, nil
	}
	if !errors.Is(err, records.ErrConflict) {
		return ctx, nil, err
	}
	return records.WithServiceCommand(ctx, records.ServiceCommand{ID: id, Digest: digest, Kind: r.Operation}), nil, nil
}

func (s *Service) view(ctx context.Context, owner, tab, id string) (transport.Response, error) {
	a, err := s.store.ReadAccess(ctx, owner)
	if err != nil {
		return transport.Response{}, err
	}
	var active any
	if a.ActiveGameID != "" {
		active = a.ActiveGameID
	}
	out := map[string]any{"serviceSchemaVersion": "1.0.0", "activeGameId": active, "session": nil}
	if id == "" {
		id = a.ActiveGameID
	}
	if id == "" {
		return result("LocalServiceSessionView", out)
	}
	l, err := s.store.Load(ctx, owner, id)
	if err != nil {
		return transport.Response{}, err
	}
	b, err := s.codec.Session(l.Document, l.Snapshot)
	if err != nil {
		return transport.Response{}, fail(422, "saved-module-reader-unavailable")
	}
	v, err := b.View(0)
	if err != nil {
		return transport.Response{}, err
	}
	n, err := b.Node()
	if err != nil {
		return transport.Response{}, err
	}
	owned, generation, err := s.store.ControlStatus(ctx, tab)
	if err != nil {
		return transport.Response{}, err
	}
	if id != a.ActiveGameID {
		owned = false
	}
	var blocked any
	if !l.Disposition.Playable {
		blocked = l.Disposition.Reason
	}
	node := map[string]any{"kind": n.Kind, "phase": n.Phase}
	if n.Seat != nil {
		node["actor"] = *n.Seat
	}
	if n.WindowID != "" {
		node["windowId"] = n.WindowID
	}
	if n.TransitionID != "" {
		node["transitionId"] = n.TransitionID
	}
	if n.RequestID != "" {
		node["requestId"] = n.RequestID
	}
	out["session"] = map[string]any{"gameId": id, "revision": l.Document.Revision, "playable": l.Disposition.Playable, "blockedReason": blocked, "view": v, "node": node, "control": map[string]any{"owned": owned, "leaseToken": nil, "controlGeneration": generation}}
	return result("LocalServiceSessionView", out)
}

type commandRequest struct {
	CommandID          string   `json:"commandId"`
	GameID             string   `json:"gameId"`
	ExpectedRevision   int64    `json:"expectedRevision"`
	ControlLeaseToken  string   `json:"controlLeaseToken"`
	CandidateID        string   `json:"candidateId"`
	PreparedDecisionID string   `json:"preparedDecisionId"`
	PreparedWorkIDs    []string `json:"preparedWorkIds"`
	Kind               string   `json:"kind"`
	TransitionID       string   `json:"transitionId"`
	Purpose            string   `json:"purpose"`
}

func (s *Service) loadCommand(ctx context.Context, owner string, q commandRequest) (*records.Loaded, gamekernel.BoundSession, records.AccessAdmission, error) {
	return s.loadOwnedCommand(ctx, owner, q, true)
}
func (s *Service) loadOwnedCommand(ctx context.Context, owner string, q commandRequest, requirePlay bool) (*records.Loaded, gamekernel.BoundSession, records.AccessAdmission, error) {
	a, err := s.store.ReadAccess(ctx, owner)
	if err != nil {
		return nil, nil, records.AccessAdmission{}, err
	}
	if a.ActiveGameID != q.GameID || requirePlay && !a.CanPlay {
		return nil, nil, records.AccessAdmission{}, records.ErrAccess
	}
	l, err := s.store.Load(ctx, owner, q.GameID)
	if err != nil {
		return nil, nil, records.AccessAdmission{}, err
	}
	if l.Document.Revision != q.ExpectedRevision {
		return nil, nil, records.AccessAdmission{}, records.ErrConflict
	}
	if !l.Disposition.Playable {
		return nil, nil, records.AccessAdmission{}, fail(422, "policy-read-only")
	}
	b, err := s.codec.Session(l.Document, l.Snapshot)
	if err != nil {
		return nil, nil, records.AccessAdmission{}, err
	}
	unit, err := s.codec.CurrentUnitID(l.Document, l.Snapshot)
	if err != nil {
		return nil, nil, records.AccessAdmission{}, err
	}
	admission := records.AccessAdmission{OwnerID: owner, Generation: a.Generation, ControlRevision: a.ControlGeneration, GrantID: records.LocalGrantID(owner, l.Document.Metadata.Pin.GameID, l.Document.Metadata.Pin.VariantID), UnitID: unit}
	if s.policy != nil && requirePlay {
		admission, _, err = s.chooseAccess(ctx, owner, b, q.GameID, unit, "play", "continue", "")
		if err != nil {
			return nil, nil, records.AccessAdmission{}, err
		}
	}
	return l, b, admission, nil
}

func (s *Service) create(ctx context.Context, owner string, r transport.Request) (transport.Response, error) {
	var q struct {
		CommandID            string            `json:"commandId"`
		Selector             sessions.Selector `json:"selector"`
		ExpectedActiveGameID *string           `json:"expectedActiveGameId"`
		ExpectedRevision     *int64            `json:"expectedRevision"`
		ControlLeaseToken    *string           `json:"controlLeaseToken"`
	}
	_ = json.Unmarshal(r.Body, &q)
	ctx, previous, err := s.command(ctx, r, q.CommandID)
	if err != nil {
		return transport.Response{}, err
	}
	if previous != nil {
		return accepted(*previous)
	}
	if s.policy != nil {
		templates, e := offerTemplates(s.policy.Offers, "free", time.Now())
		if e != nil {
			return transport.Response{}, e
		}
		if e = s.store.EnsureConfiguredFreeGrants(ctx, templates); e != nil {
			return transport.Response{}, e
		}
	}
	a, err := s.store.ReadAccess(ctx, owner)
	if err != nil {
		return transport.Response{}, err
	}
	expected := ""
	if q.ExpectedActiveGameID == nil {
		if q.ExpectedRevision != nil || q.ControlLeaseToken != nil || a.ActiveGameID != "" {
			return transport.Response{}, records.ErrConflict
		}
	} else {
		if q.ExpectedRevision == nil || q.ControlLeaseToken == nil {
			return transport.Response{}, fail(400, "replacement-binding-required")
		}
		expected = *q.ExpectedActiveGameID
		ctx = records.WithControl(ctx, r.Tab, *q.ControlLeaseToken)
		l, e := s.store.Load(ctx, owner, expected)
		if e != nil {
			return transport.Response{}, e
		}
		if a.ActiveGameID != expected || l.Document.Revision != *q.ExpectedRevision {
			return transport.Response{}, records.ErrConflict
		}
	}
	id, err := randomID()
	if err != nil {
		return transport.Response{}, err
	}
	token, err := randomID()
	if err != nil {
		return transport.Response{}, err
	}
	meta, err := records.ServiceMetadata(q.Selector, id, owner)
	if err != nil {
		return transport.Response{}, fail(422, "unsupported-selector")
	}
	deck, err := freshDeck()
	if err != nil {
		return transport.Response{}, err
	}
	config, _ := json.Marshal(map[string]any{"id": id, "dealer": 0})
	doc, anchor, events, err := s.codec.Start(meta, config, deck)
	if err != nil {
		return transport.Response{}, err
	}
	unit, err := s.codec.UnitID(doc)
	if err != nil {
		return transport.Response{}, err
	}
	admission := records.AccessAdmission{OwnerID: owner, Generation: a.Generation, ControlRevision: a.ControlGeneration, GrantID: records.LocalGrantID(owner, meta.Pin.GameID, meta.Pin.VariantID), UnitID: unit}
	if s.policy != nil {
		c, e := s.store.ReadAccessContext(ctx, owner, "", "")
		if e != nil {
			return transport.Response{}, e
		}
		target := access.Target{GameID: meta.Pin.GameID, VariantID: meta.Pin.VariantID}
		op := access.Operation{Kind: "play", Intent: "start", SessionID: id, UnitID: unit, UnitKind: access.SupportedUnit(target), AtAdmissionBoundary: true}
		d, e := s.resolver.Resolve(policyInput(c, target, op))
		if e != nil {
			return transport.Response{}, e
		}
		admission, e = chosenAdmission(c, d, unit)
		if e != nil {
			return transport.Response{}, e
		}
		a = c.Access
	}
	receipt, _ := json.Marshal(map[string]any{"commandId": q.CommandID, "gameId": id, "revision": 0, "controlLeaseToken": token, "controlGeneration": a.ControlGeneration + 1})
	out, err := s.store.CreateAccepted(ctx, records.CreateTransition{Document: doc, Anchor: anchor, Events: events, Admission: admission, ExpectedActiveGameID: expected, ExpectedRevision: q.ExpectedRevision, ReceiptSchema: "LocalServiceCommandReceipt", Receipt: receipt, NewControlToken: token, TabID: r.Tab})
	if err != nil {
		return transport.Response{}, err
	}
	return accepted(out)
}
func (s *Service) control(ctx context.Context, r transport.Request) (transport.Response, error) {
	var q struct {
		CommandID                 string `json:"commandId"`
		GameID                    string `json:"gameId"`
		ExpectedRevision          int64  `json:"expectedRevision"`
		ExpectedControlGeneration int64  `json:"expectedControlGeneration"`
	}
	_ = json.Unmarshal(r.Body, &q)
	ctx, previous, err := s.command(ctx, r, q.CommandID)
	if err != nil {
		return transport.Response{}, err
	}
	if previous != nil {
		return accepted(*previous)
	}
	v, err := s.store.AcquireControl(ctx, records.ControlRequest{ExpectedGameID: q.GameID, ExpectedRevision: q.ExpectedRevision, ExpectedControlGeneration: q.ExpectedControlGeneration, TabID: r.Tab})
	if err != nil {
		return transport.Response{}, err
	}
	return result("LocalControlView", v)
}
