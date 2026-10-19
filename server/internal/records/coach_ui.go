package records

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"cardford/server/internal/coachui"
	"cardford/server/internal/contracts"
	"github.com/jackc/pgx/v5"
)

// Coach UI sessions use a separate stable UTC-day bucket. They never unlock or
// consume the historical hand/request coaching allowance.
const coachUIBucket = "coach-ui-sessions"

type CoachUIAccess struct {
	CanRequest bool   `json:"canRequest"`
	Remaining  *int   `json:"remaining"`
	Unlimited  bool   `json:"unlimited"`
	ResetAt    string `json:"resetAt"`
	Timezone   string `json:"timezone"`
	Mode       string `json:"mode"`
}
type CoachUISummary struct {
	SessionID      string           `json:"sessionId"`
	GameID         string           `json:"gameId"`
	GameType       string           `json:"gameType"`
	VariantID      string           `json:"variantId"`
	SourceUnitID   string           `json:"sourceUnitId"`
	DecisionID     string           `json:"decisionId"`
	SourceRevision int64            `json:"sourceRevision"`
	CreatedAt      string           `json:"createdAt"`
	Kind           string           `json:"kind"`
	Provider       coachui.Metadata `json:"provider"`
}
type CoachUISession struct {
	CoachUISummary
	Items []CoachUIItem `json:"items"`
}
type CoachUIItem struct {
	ItemID           string                 `json:"itemId"`
	SessionID        string                 `json:"sessionId"`
	Kind             string                 `json:"kind"`
	Title            string                 `json:"title"`
	Body             string                 `json:"body"`
	Explanation      string                 `json:"explanation"`
	CreatedAt        string                 `json:"createdAt"`
	SourceRevision   int64                  `json:"sourceRevision"`
	DecisionID       string                 `json:"decisionId"`
	Provider         coachui.Metadata       `json:"provider"`
	ReplayAvailable  bool                   `json:"replayAvailable"`
	FeedbackRevision int64                  `json:"feedbackRevision"`
	Feedback         *CoachUIFeedback       `json:"feedback,omitempty"`
	Rating           *coachui.RatingPreview `json:"rating,omitempty"`
}
type CoachUIFeedback struct {
	FeedbackID string `json:"feedbackId"`
	Value      string `json:"value"`
	Reason     string `json:"reason"`
	Text       string `json:"text"`
	CreatedAt  string `json:"createdAt"`
}
type CoachUIFeedbackView struct {
	ItemID           string          `json:"itemId"`
	FeedbackRevision int64           `json:"feedbackRevision"`
	Feedback         CoachUIFeedback `json:"feedback"`
}
type CoachUIReplay struct {
	ItemID         string            `json:"itemId"`
	SourceRevision int64             `json:"sourceRevision"`
	DecisionID     string            `json:"decisionId"`
	Label          string            `json:"label"`
	Provider       coachui.Metadata  `json:"provider"`
	Frames         []json.RawMessage `json:"frames"`
	Explanation    string            `json:"explanation"`
}
type CoachUIStoredItem struct {
	Item   CoachUIItem
	Frames []json.RawMessage
}
type CoachUISessionView struct {
	Session CoachUISession `json:"session"`
	Access  CoachUIAccess  `json:"access"`
}

func (s *Store) coachUIAccessTx(ctx context.Context, tx pgx.Tx, owner, game, variant string) (CoachUIAccess, time.Time, error) {
	out := CoachUIAccess{Timezone: "UTC", Mode: "free"}
	var now time.Time
	var read, play, coach bool
	if err := tx.QueryRow(ctx, "SELECT can_read,can_play,can_coach,clock_timestamp() FROM "+s.table("m03_access")+" WHERE owner_id=$1 FOR UPDATE", owner).Scan(&read, &play, &coach, &now); err != nil {
		return out, now, err
	}
	if err := s.authorize(ctx, tx, owner); err != nil {
		return out, now, err
	}
	if !read {
		return out, now, ErrReadDenied
	}
	day := time.Date(now.UTC().Year(), now.UTC().Month(), now.UTC().Day(), 0, 0, 0, 0, time.UTC)
	out.ResetAt = day.AddDate(0, 0, 1).Format(time.RFC3339Nano)
	p, err := s.platformProfileTx(ctx, tx, owner, true)
	if err != nil {
		return out, now, err
	}
	if !p.Configured {
		out.Mode = "local-fixture"
		fixture, e := s.fixturePlatformAccessTx(ctx, tx, p, "", "")
		if e != nil {
			return out, now, e
		}
		out.Unlimited = fixture.Covered && (fixture.Plan == "unlimited" || fixture.Plan == "family")
		play = play && fixture.Covered
	} else {
		rows, e := tx.Query(ctx, "SELECT terms FROM "+s.table("m03_grants")+" WHERE owner_id=$1 AND source_kind IN ('purchase','family','operator-test') AND NOT revoked AND valid_from<=$2 AND (valid_until IS NULL OR valid_until>$2)", owner, now)
		if e != nil {
			return out, now, e
		}
		for rows.Next() {
			var raw []byte
			if e = rows.Scan(&raw); e != nil {
				rows.Close()
				return out, now, e
			}
			terms, e := decodeTerms(raw)
			if e != nil {
				rows.Close()
				return out, now, ErrStorage
			}
			if terms.CanCoach && terms.Unlimited && terms.Game == game && terms.Variant == variant {
				out.Unlimited = true
			}
		}
		rows.Close()
		if e = rows.Err(); e != nil {
			return out, now, e
		}
		if out.Unlimited {
			out.Mode = "paid"
		}
	}
	used := 0
	if err = tx.QueryRow(ctx, "SELECT COALESCE((SELECT used FROM "+s.table("coach_ui_daily_usage")+" WHERE owner_id=$1 AND bucket_id=$2 AND quota_day=$3),0)", owner, coachUIBucket, day).Scan(&used); err != nil {
		return out, now, err
	}
	if !out.Unlimited {
		remaining := 2 - used
		if remaining < 0 {
			remaining = 0
		}
		out.Remaining = &remaining
	}
	out.CanRequest = play && coach && (out.Unlimited || *out.Remaining > 0)
	return out, now, nil
}
func (s *Store) CoachUIAccess(ctx context.Context, owner, game, variant string) (CoachUIAccess, time.Time, error) {
	var a CoachUIAccess
	var now time.Time
	err := s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		var e error
		a, now, e = s.coachUIAccessTx(ctx, tx, owner, game, variant)
		return e
	})
	return a, now, err
}

func coachUIJSON(schema string, value any) ([]byte, error) {
	raw, e := json.Marshal(value)
	if e != nil {
		return nil, e
	}
	if contracts.Validate(schema, raw) != nil {
		return nil, ErrStorage
	}
	return raw, nil
}
func (s *Store) coachUIReadSessionTx(ctx context.Context, tx pgx.Tx, owner, id string) (CoachUISession, error) {
	var out CoachUISession
	var raw []byte
	if e := tx.QueryRow(ctx, "SELECT content FROM "+s.table("coach_ui_sessions")+" WHERE owner_id=$1 AND session_id=$2", owner, id).Scan(&raw); e != nil {
		if errors.Is(e, pgx.ErrNoRows) {
			return out, ErrReadDenied
		}
		return out, e
	}
	if json.Unmarshal(raw, &out.CoachUISummary) != nil {
		return out, ErrStorage
	}
	out.Items = []CoachUIItem{}
	rows, e := tx.Query(ctx, "SELECT i.content,f.content FROM "+s.table("coach_ui_items")+" i LEFT JOIN LATERAL (SELECT content FROM "+s.table("coach_ui_feedback")+" f WHERE f.owner_id=i.owner_id AND f.item_id=i.item_id ORDER BY revision DESC LIMIT 1) f ON true WHERE i.owner_id=$1 AND i.session_id=$2 ORDER BY i.created_at,i.item_id LIMIT 101", owner, id)
	if e != nil {
		return out, e
	}
	for rows.Next() {
		var item CoachUIItem
		var content, feedback []byte
		if e = rows.Scan(&content, &feedback); e != nil {
			rows.Close()
			return out, e
		}
		if json.Unmarshal(content, &item) != nil {
			rows.Close()
			return out, ErrStorage
		}
		if len(feedback) > 0 {
			var f CoachUIFeedbackView
			if json.Unmarshal(feedback, &f) != nil {
				rows.Close()
				return out, ErrStorage
			}
			item.FeedbackRevision = f.FeedbackRevision
			item.Feedback = &f.Feedback
		}
		out.Items = append(out.Items, item)
	}
	rows.Close()
	if e = rows.Err(); e != nil {
		return out, e
	}
	_, e = coachUIJSON("CoachUISession", out)
	return out, e
}
func (s *Store) ReadCoachUISession(ctx context.Context, owner, id string) (CoachUISessionView, error) {
	var out CoachUISessionView
	err := s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if e := s.authorize(ctx, tx, owner); e != nil {
			return e
		}
		var e error
		out.Session, e = s.coachUIReadSessionTx(ctx, tx, owner, id)
		if e != nil {
			return e
		}
		out.Access, _, e = s.coachUIAccessTx(ctx, tx, owner, out.Session.GameType, out.Session.VariantID)
		return e
	})
	return out, err
}
func (s *Store) RecentCoachUISessions(ctx context.Context, owner string, limit int) ([]CoachUISummary, error) {
	out := []CoachUISummary{}
	if err := s.currentRead(ctx, owner); err != nil {
		return out, err
	}
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	rows, e := s.pool.Query(ctx, "SELECT content FROM "+s.table("coach_ui_sessions")+" WHERE owner_id=$1 ORDER BY created_at DESC,session_id LIMIT $2", owner, limit)
	if e != nil {
		return out, e
	}
	for rows.Next() {
		var raw []byte
		var summary CoachUISummary
		if e = rows.Scan(&raw); e != nil {
			rows.Close()
			return out, e
		}
		if json.Unmarshal(raw, &summary) != nil {
			rows.Close()
			return out, ErrStorage
		}
		out = append(out, summary)
	}
	rows.Close()
	if e = rows.Err(); e != nil {
		return out, e
	}
	return out, s.currentRead(ctx, owner)
}
func (s *Store) ReadCoachUIReplay(ctx context.Context, owner, id string) (CoachUIReplay, error) {
	var out CoachUIReplay
	if e := s.currentRead(ctx, owner); e != nil {
		return out, e
	}
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	var raw []byte
	e := s.pool.QueryRow(ctx, "SELECT replay FROM "+s.table("coach_ui_items")+" WHERE owner_id=$1 AND item_id=$2", owner, id).Scan(&raw)
	if errors.Is(e, pgx.ErrNoRows) {
		return out, ErrReadDenied
	}
	if e != nil {
		return out, e
	}
	if contracts.Validate("CoachUIReplayView", raw) != nil || json.Unmarshal(raw, &out) != nil {
		return out, ErrStorage
	}
	return out, s.currentRead(ctx, owner)
}

func (s *Store) writeCoachUIItemsTx(ctx context.Context, tx pgx.Tx, owner string, items []CoachUIStoredItem, at string) error {
	for _, stored := range items {
		item := stored.Item
		item.CreatedAt = at
		item.Feedback = nil
		item.FeedbackRevision = 0
		raw, e := coachUIJSON("CoachUIItem", item)
		if e != nil {
			return e
		}
		replay := CoachUIReplay{ItemID: item.ItemID, SourceRevision: item.SourceRevision, DecisionID: item.DecisionID, Label: "Saved actor view", Provider: item.Provider, Frames: stored.Frames, Explanation: item.Explanation}
		frames, e := coachUIJSON("CoachUIReplayView", replay)
		if e != nil {
			return e
		}
		if len(frames) > 1048576 {
			return ErrStorage
		}
		if _, e = tx.Exec(ctx, "INSERT INTO "+s.table("coach_ui_items")+"(item_id,owner_id,session_id,source_revision,kind,content,replay) VALUES($1,$2,$3,$4,$5,$6,$7)", item.ItemID, owner, item.SessionID, item.SourceRevision, item.Kind, raw, frames); e != nil {
			return e
		}
	}
	return nil
}

// Publication fences the exact live revision and control lease under the same
// owner lock as quota, immutable items, and the command receipt.
func (s *Store) SaveCoachUISession(ctx context.Context, a AccessAdmission, expected int64, session CoachUISummary, items []CoachUIStoredItem, create bool) (AcceptedOutcome, error) {
	var out AcceptedOutcome
	c, ok, e := serviceCommandFrom(ctx)
	if e != nil || !ok {
		return out, ErrCommandDigest
	}
	err := s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		prior, e := s.reconcileServiceTx(ctx, tx, a.OwnerID, c.ID, c.Digest)
		if e == nil {
			out = prior
			return nil
		}
		if !errors.Is(e, ErrConflict) {
			return e
		}
		if e = s.checkCommitAccess(ctx, tx, a, session.GameID, false); e != nil {
			return e
		}
		if e = s.checkLifecycleTx(ctx, tx, a.OwnerID, session.GameID, true); e != nil {
			return e
		}
		var canCoach bool
		if e = tx.QueryRow(ctx, "SELECT can_coach FROM "+s.table("m03_access")+" WHERE owner_id=$1", a.OwnerID).Scan(&canCoach); e != nil {
			return e
		}
		if !canCoach {
			return ErrAccess
		}
		if _, _, e = s.checkGrant(ctx, tx, a, session.GameID, session.GameType, session.VariantID, false); e != nil {
			return e
		}
		var revision int64
		if e = tx.QueryRow(ctx, "SELECT revision FROM "+s.table("m03_games")+" WHERE owner_id=$1 AND game_id=$2 FOR UPDATE", a.OwnerID, session.GameID).Scan(&revision); e != nil {
			return e
		}
		if revision != expected {
			return ErrConflict
		}
		access, now, e := s.coachUIAccessTx(ctx, tx, a.OwnerID, session.GameType, session.VariantID)
		if e != nil {
			return e
		}
		at := now.UTC().Format(time.RFC3339Nano)
		if create {
			if !access.CanRequest {
				if access.Remaining != nil && *access.Remaining == 0 {
					return ErrAllowance
				}
				return ErrAccess
			}
			if session.SourceRevision != expected || len(items) < 1 || len(items) > 2 {
				return ErrConflict
			}
			session.CreatedAt = at
			raw, e := coachUIJSON("CoachUISessionSummary", session)
			if e != nil {
				return e
			}
			day := now.UTC().Format("2006-01-02")
			if !access.Unlimited {
				_, e = tx.Exec(ctx, "INSERT INTO "+s.table("coach_ui_daily_usage")+"(owner_id,bucket_id,quota_day,used) VALUES($1,$2,$3,1) ON CONFLICT(owner_id,bucket_id,quota_day) DO UPDATE SET used="+s.table("coach_ui_daily_usage")+".used+1", a.OwnerID, coachUIBucket, day)
				if e != nil {
					return e
				}
			}
			if _, e = tx.Exec(ctx, "INSERT INTO "+s.table("coach_ui_sessions")+"(session_id,owner_id,game_id,decision_id,source_revision,source_unit_id,kind,grant_id,quota_day,charged,content) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", session.SessionID, a.OwnerID, session.GameID, session.DecisionID, session.SourceRevision, session.SourceUnitID, session.Kind, a.GrantID, day, !access.Unlimited, raw); e != nil {
				return e
			}
		} else {
			saved, e := s.coachUIReadSessionTx(ctx, tx, a.OwnerID, session.SessionID)
			if e != nil {
				return e
			}
			if saved.DecisionID != session.DecisionID || saved.GameID != session.GameID || len(saved.Items)+len(items) > 100 {
				return ErrConflict
			}
		}
		for _, item := range items {
			if item.Item.SessionID != session.SessionID || item.Item.DecisionID != session.DecisionID || item.Item.SourceRevision != session.SourceRevision {
				return ErrStorage
			}
		}
		if e = s.writeCoachUIItemsTx(ctx, tx, a.OwnerID, items, at); e != nil {
			return e
		}
		saved, e := s.coachUIReadSessionTx(ctx, tx, a.OwnerID, session.SessionID)
		if e != nil {
			return e
		}
		access, _, e = s.coachUIAccessTx(ctx, tx, a.OwnerID, session.GameType, session.VariantID)
		if e != nil {
			return e
		}
		receipt, e := coachUIJSON("CoachUISessionView", CoachUISessionView{saved, access})
		if e != nil {
			return e
		}
		out = AcceptedOutcome{GameID: session.GameID, Revision: expected, ReceiptSchema: "CoachUISessionView", Receipt: receipt}
		return s.saveServiceTx(ctx, tx, a.OwnerID, out)
	})
	return out, err
}
func (s *Store) SaveCoachUIFeedback(ctx context.Context, owner, itemID string, expected int64, value, reason, text string) (AcceptedOutcome, error) {
	var out AcceptedOutcome
	c, ok, e := serviceCommandFrom(ctx)
	if e != nil || !ok {
		return out, ErrCommandDigest
	}
	id, e := freshID()
	if e != nil {
		return out, e
	}
	err := s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		prior, e := s.reconcileServiceTx(ctx, tx, owner, c.ID, c.Digest)
		if e == nil {
			out = prior
			return nil
		}
		if !errors.Is(e, ErrConflict) {
			return e
		}
		var exists bool
		var revision int64
		var now time.Time
		if e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM "+s.table("coach_ui_items")+" WHERE owner_id=$1 AND item_id=$2),COALESCE((SELECT max(revision) FROM "+s.table("coach_ui_feedback")+" WHERE owner_id=$1 AND item_id=$2),0),clock_timestamp()", owner, itemID).Scan(&exists, &revision, &now); e != nil {
			return e
		}
		if !exists {
			return ErrReadDenied
		}
		if revision != expected || revision >= maxRecordInteger {
			return ErrConflict
		}
		feedback := CoachUIFeedbackView{itemID, revision + 1, CoachUIFeedback{id, value, reason, text, now.UTC().Format(time.RFC3339Nano)}}
		raw, e := coachUIJSON("CoachUIFeedbackView", feedback)
		if e != nil {
			return e
		}
		if _, e = tx.Exec(ctx, "INSERT INTO "+s.table("coach_ui_feedback")+"(owner_id,item_id,revision,content) VALUES($1,$2,$3,$4)", owner, itemID, revision+1, raw); e != nil {
			return e
		}
		out = AcceptedOutcome{ReceiptSchema: "CoachUIFeedbackView", Receipt: raw}
		return s.saveServiceTx(ctx, tx, owner, out)
	})
	return out, err
}
func (s *Store) ExportCoachUI(ctx context.Context, owner string) ([]CoachUISession, []CoachUIFeedbackView, error) {
	sessions := []CoachUISession{}
	feedback := []CoachUIFeedbackView{}
	summaries, e := s.RecentCoachUISessions(ctx, owner, 10001)
	if e != nil {
		return nil, nil, e
	}
	if len(summaries) > 10000 {
		return nil, nil, ErrStorage
	}
	for _, summary := range summaries {
		v, e := s.ReadCoachUISession(ctx, owner, summary.SessionID)
		if e != nil {
			return nil, nil, e
		}
		sessions = append(sessions, v.Session)
	}
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	rows, e := s.pool.Query(ctx, "SELECT content FROM "+s.table("coach_ui_feedback")+" WHERE owner_id=$1 ORDER BY created_at,item_id,revision LIMIT 10001", owner)
	if e != nil {
		return nil, nil, e
	}
	for rows.Next() {
		var raw []byte
		var f CoachUIFeedbackView
		if e = rows.Scan(&raw); e != nil {
			rows.Close()
			return nil, nil, e
		}
		if contracts.Validate("CoachUIFeedbackView", raw) != nil || json.Unmarshal(raw, &f) != nil {
			rows.Close()
			return nil, nil, ErrStorage
		}
		feedback = append(feedback, f)
	}
	rows.Close()
	if e = rows.Err(); e != nil {
		return nil, nil, e
	}
	if len(feedback) > 10000 {
		return nil, nil, ErrStorage
	}
	return sessions, feedback, s.currentRead(ctx, owner)
}
