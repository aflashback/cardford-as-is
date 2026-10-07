package records

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type PlatformFamilyMember struct {
	AssignmentID string `json:"assignmentId"`
	PlayerID     string `json:"playerId"`
	DisplayName  string `json:"displayName"`
	SeatClass    string `json:"seatClass"`
	Status       string `json:"status"`
	PeriodEnd    string `json:"periodEnd"`
}
type PlatformFamilyInvitation struct {
	InvitationID string `json:"invitationId"`
	InviteeID    string `json:"inviteeId"`
	SeatClass    string `json:"seatClass"`
	ExpiresAt    string `json:"expiresAt"`
	Token        string `json:"token,omitempty"`
}
type PlatformFamilyPayer struct {
	PlayerID    string `json:"playerId"`
	DisplayName string `json:"displayName"`
}
type PlatformFamilyView struct {
	FamilyID    *string                    `json:"familyId"`
	Role        string                     `json:"role"`
	Payer       *PlatformFamilyPayer       `json:"payer"`
	Members     []PlatformFamilyMember     `json:"members"`
	Invitations []PlatformFamilyInvitation `json:"invitations"`
	PeriodEnd   *string                    `json:"periodEnd"`
	LocalMock   bool                       `json:"localMock"`
}
type PlatformFamilyCommand struct {
	CommandID                     string `json:"commandId"`
	Action                        string `json:"action"`
	InviteeID                     string `json:"inviteeId,omitempty"`
	SeatClass                     string `json:"seatClass,omitempty"`
	Token                         string `json:"token,omitempty"`
	AcknowledgeIndividualCoverage bool   `json:"acknowledgeIndividualCoverage,omitempty"`
	InvitationID                  string `json:"invitationId,omitempty"`
	AssignmentID                  string `json:"assignmentId,omitempty"`
}
type platformFamilyGroup struct {
	ID, Payer string
	End       time.Time
}

func platformNoFamily() PlatformFamilyView {
	return PlatformFamilyView{Role: "none", Members: []PlatformFamilyMember{}, Invitations: []PlatformFamilyInvitation{}, LocalMock: true}
}

// One bounded transaction advisory lock serializes local fixture membership and
// owner erasure before owner locks. It is not a hosted capacity design.
func (s *Store) LockPlatformFamilyErasureTx(ctx context.Context, tx pgx.Tx, _ string) error {
	_, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtext('cardford-m04-fixture-family'))")
	return err
}
func (s *Store) platformFamilyViewTx(ctx context.Context, tx pgx.Tx, owner string) (PlatformFamilyView, error) {
	out := platformNoFamily()
	var g platformFamilyGroup
	err := tx.QueryRow(ctx, "SELECT g.family_id,g.payer_id,g.period_end FROM "+s.table("m04_family_groups")+" g WHERE g.payer_id=$1 OR EXISTS(SELECT 1 FROM "+s.table("m04_family_assignments")+" a WHERE a.family_id=g.family_id AND a.owner_id=$1 AND a.status='active' AND a.period_end>clock_timestamp()) ORDER BY (g.payer_id=$1) DESC LIMIT 1", owner).Scan(&g.ID, &g.Payer, &g.End)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, nil
	}
	if err != nil {
		return out, err
	}
	payer := g.Payer == owner
	name := "Family payer"
	if err = tx.QueryRow(ctx, "SELECT display_name FROM "+s.table("m04_profiles")+" WHERE owner_id=$1", g.Payer).Scan(&name); err != nil {
		return out, err
	}
	out.FamilyID = &g.ID
	out.Role = "member"
	if payer {
		out.Role = "payer"
	}
	out.Payer = &PlatformFamilyPayer{g.Payer, name}
	end := g.End.UTC().Format(time.RFC3339Nano)
	out.PeriodEnd = &end
	rows, err := tx.Query(ctx, "SELECT a.assignment_id,COALESCE(a.owner_id,'deleted-account'),COALESCE(p.display_name,'Deleted local account'),a.seat_class,a.status,a.period_end FROM "+s.table("m04_family_assignments")+" a LEFT JOIN "+s.table("m04_profiles")+" p ON p.owner_id=a.owner_id WHERE a.family_id=$1 AND a.period_end>clock_timestamp() AND ($2 OR a.owner_id=$3) ORDER BY a.accepted_at,a.assignment_id LIMIT 6", g.ID, payer, owner)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var m PlatformFamilyMember
		var until time.Time
		if err = rows.Scan(&m.AssignmentID, &m.PlayerID, &m.DisplayName, &m.SeatClass, &m.Status, &until); err != nil {
			rows.Close()
			return out, err
		}
		m.PeriodEnd = until.UTC().Format(time.RFC3339Nano)
		out.Members = append(out.Members, m)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return out, err
	}
	if len(out.Members) > 5 {
		return out, ErrStorage
	}
	if payer {
		rows, err = tx.Query(ctx, "SELECT invitation_id,invitee_id,seat_class,expires_at FROM "+s.table("m04_family_invitations")+" WHERE family_id=$1 AND status='pending' AND expires_at>clock_timestamp() ORDER BY created_at,invitation_id LIMIT 5", g.ID)
		if err != nil {
			return out, err
		}
		for rows.Next() {
			var i PlatformFamilyInvitation
			var until time.Time
			if err = rows.Scan(&i.InvitationID, &i.InviteeID, &i.SeatClass, &until); err != nil {
				rows.Close()
				return out, err
			}
			i.ExpiresAt = until.UTC().Format(time.RFC3339Nano)
			out.Invitations = append(out.Invitations, i)
		}
		rows.Close()
		if err = rows.Err(); err != nil {
			return out, err
		}
		if len(out.Invitations) > 4 {
			return out, ErrStorage
		}
	}
	return out, nil
}
func (s *Store) GetPlatformFamily(ctx context.Context) (PlatformFamilyView, error) {
	out := platformNoFamily()
	p, err := principalFrom(ctx)
	if err != nil {
		return out, err
	}
	err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if e := s.LockPlatformFamilyErasureTx(ctx, tx, p.OwnerID); e != nil {
			return e
		}
		profile, e := s.platformProfileTx(ctx, tx, p.OwnerID, true)
		if e != nil {
			return e
		}
		if e = requirePlatformFixture(profile); e != nil {
			return e
		}
		out, e = s.platformFamilyViewTx(ctx, tx, p.OwnerID)
		return e
	})
	return out, err
}
func (s *Store) platformFamilyCapacity(ctx context.Context, tx pgx.Tx, group, class string) error {
	if class != "limited" && class != "unlimited" {
		return ErrStorage
	}
	var used int64
	err := tx.QueryRow(ctx, "SELECT (SELECT count(*) FROM "+s.table("m04_family_assignments")+" WHERE family_id=$1 AND seat_class=$2 AND period_end>clock_timestamp())+(SELECT count(*) FROM "+s.table("m04_family_invitations")+" WHERE family_id=$1 AND seat_class=$2 AND status='pending' AND expires_at>clock_timestamp())", group, class).Scan(&used)
	if err != nil {
		return err
	}
	capacity := int64(3)
	if class == "limited" {
		capacity = 2
	}
	if used >= capacity {
		return accountFailure(409, "INVALID_COMMAND", "No seat of this class is available. Removed seats remain held until renewal.")
	}
	return nil
}
func (s *Store) MutatePlatformFamily(ctx context.Context, q PlatformFamilyCommand) (AcceptedOutcome, error) {
	var out AcceptedOutcome
	p, err := principalFrom(ctx)
	if err != nil {
		return out, err
	}
	c, ok, err := serviceCommandFrom(ctx)
	if err != nil || !ok || c.ID != q.CommandID {
		return out, ErrCommandDigest
	}
	err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if e := s.LockPlatformFamilyErasureTx(ctx, tx, p.OwnerID); e != nil {
			return e
		}
		prior, e := s.reconcileServiceTx(ctx, tx, p.OwnerID, c.ID, c.Digest)
		if e == nil {
			out = prior
			return nil
		}
		if !errors.Is(e, ErrConflict) {
			return e
		}
		profile, e := s.platformProfileTx(ctx, tx, p.OwnerID, true)
		if e != nil {
			return e
		}
		if e = requirePlatformFixture(profile); e != nil {
			return e
		}
		var now time.Time
		if e = tx.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&now); e != nil {
			return e
		}
		var group platformFamilyGroup
		var inviteID, inviteStatus, inviteClass, invitee string
		var inviteExpiry time.Time
		if q.Action == "accept" {
			e = tx.QueryRow(ctx, "SELECT i.invitation_id,i.invitee_id,i.status,i.seat_class,i.expires_at,g.family_id,g.payer_id,g.period_end FROM "+s.table("m04_family_invitations")+" i JOIN "+s.table("m04_family_groups")+" g ON g.family_id=i.family_id WHERE i.token_hash=$1 FOR UPDATE OF g,i", tokenHash(q.Token)).Scan(&inviteID, &invitee, &inviteStatus, &inviteClass, &inviteExpiry, &group.ID, &group.Payer, &group.End)
			if errors.Is(e, pgx.ErrNoRows) || e == nil && invitee != p.OwnerID {
				return accountFailure(403, "FORBIDDEN", "This invitation belongs to another verified local account or is invalid.")
			}
			if e != nil {
				return e
			}
		} else if q.Action != "create" {
			e = tx.QueryRow(ctx, "SELECT g.family_id,g.payer_id,g.period_end FROM "+s.table("m04_family_groups")+" g WHERE g.payer_id=$1 OR ($2='leave' AND EXISTS(SELECT 1 FROM "+s.table("m04_family_assignments")+" a WHERE a.family_id=g.family_id AND a.owner_id=$1 AND a.status='active')) FOR UPDATE", p.OwnerID, q.Action).Scan(&group.ID, &group.Payer, &group.End)
			if errors.Is(e, pgx.ErrNoRows) {
				return accountFailure(404, "NOT_FOUND", "Family membership not found.")
			}
			if e != nil {
				return e
			}
		}
		var issued *PlatformFamilyInvitation
		if q.Action == "create" {
			if *profile.Plan != "family" || !now.Before(*profile.CurrentPeriodEnd) {
				return accountFailure(403, "FORBIDDEN", "An active local family plan is required.")
			}
			var exists bool
			if e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM "+s.table("m04_family_assignments")+" WHERE owner_id=$1 AND status='active') OR EXISTS(SELECT 1 FROM "+s.table("m04_family_groups")+" WHERE payer_id=$1)", p.OwnerID).Scan(&exists); e != nil {
				return e
			}
			if exists {
				return accountFailure(409, "INVALID_COMMAND", "This account already belongs to or manages a family.")
			}
			id, e := freshID()
			if e != nil {
				return e
			}
			assignment, e := freshID()
			if e != nil {
				return e
			}
			if _, e = tx.Exec(ctx, "INSERT INTO "+s.table("m04_family_groups")+"(family_id,payer_id,period_end) VALUES($1,$2,$3)", id, p.OwnerID, *profile.CurrentPeriodEnd); e != nil {
				return e
			}
			if _, e = tx.Exec(ctx, "INSERT INTO "+s.table("m04_family_assignments")+"(assignment_id,family_id,owner_id,seat_class,status,period_end) VALUES($1,$2,$3,'unlimited','active',$4)", assignment, id, p.OwnerID, *profile.CurrentPeriodEnd); e != nil {
				return e
			}
		} else {
			if q.Action != "accept" && q.Action != "leave" && group.Payer != p.OwnerID {
				return accountFailure(403, "FORBIDDEN", "Only the family payer may manage seats.")
			}
			if q.Action == "invite" || q.Action == "accept" {
				var valid bool
				if e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM "+s.table("m04_profiles")+" WHERE owner_id=$1 AND plan='family' AND current_period_end>$2)", group.Payer, now).Scan(&valid); e != nil {
					return e
				}
				if !valid || !now.Before(group.End) {
					return accountFailure(403, "FORBIDDEN", "The family plan has expired.")
				}
			}
			switch q.Action {
			case "invite":
				if q.InviteeID == p.OwnerID {
					return accountFailure(400, "INVALID_COMMAND", "The payer already occupies a seat.")
				}
				var exists bool
				if e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM "+s.table("m03_access")+" WHERE owner_id=$1 AND NOT configured_offers)", q.InviteeID).Scan(&exists); e != nil {
					return e
				}
				if !exists {
					return accountFailure(404, "NOT_FOUND", "The invited local fixture account does not exist.")
				}
				if _, e = tx.Exec(ctx, "UPDATE "+s.table("m04_family_invitations")+" SET status='revoked' WHERE family_id=$1 AND status='pending' AND expires_at<=$2", group.ID, now); e != nil {
					return e
				}
				if e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM "+s.table("m04_family_assignments")+" WHERE owner_id=$1 AND status='active') OR EXISTS(SELECT 1 FROM "+s.table("m04_family_invitations")+" WHERE family_id=$2 AND invitee_id=$1 AND status='pending')", q.InviteeID, group.ID).Scan(&exists); e != nil {
					return e
				}
				if exists {
					return accountFailure(409, "INVALID_COMMAND", "That account already belongs to a family or has a pending invitation.")
				}
				if e = s.platformFamilyCapacity(ctx, tx, group.ID, q.SeatClass); e != nil {
					return e
				}
				token, e := freshID()
				if e != nil {
					return e
				}
				id, e := freshID()
				if e != nil {
					return e
				}
				until := now.Add(7 * 24 * time.Hour)
				if group.End.Before(until) {
					until = group.End
				}
				issued = &PlatformFamilyInvitation{id, q.InviteeID, q.SeatClass, until.UTC().Format(time.RFC3339Nano), token}
				if _, e = tx.Exec(ctx, "INSERT INTO "+s.table("m04_family_invitations")+"(invitation_id,family_id,invitee_id,seat_class,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6)", id, group.ID, q.InviteeID, q.SeatClass, tokenHash(token), until); e != nil {
					return e
				}
			case "accept":
				if inviteStatus != "pending" || !now.Before(inviteExpiry) {
					return accountFailure(409, "INVALID_COMMAND", "This invitation expired or was already used.")
				}
				if now.Before(*profile.CurrentPeriodEnd) && !q.AcknowledgeIndividualCoverage {
					return accountFailure(409, "INVALID_COMMAND", "Confirm that your existing individual coverage remains separate. It will not be canceled automatically.")
				}
				var exists bool
				if e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM "+s.table("m04_family_assignments")+" WHERE owner_id=$1 AND status='active')", p.OwnerID).Scan(&exists); e != nil {
					return e
				}
				if exists {
					return accountFailure(409, "INVALID_COMMAND", "This account already belongs to a family.")
				}
				id, e := freshID()
				if e != nil {
					return e
				}
				if _, e = tx.Exec(ctx, "UPDATE "+s.table("m04_family_invitations")+" SET status='accepted' WHERE invitation_id=$1", inviteID); e != nil {
					return e
				}
				if _, e = tx.Exec(ctx, "INSERT INTO "+s.table("m04_family_assignments")+"(assignment_id,family_id,owner_id,seat_class,status,period_end) VALUES($1,$2,$3,$4,'active',$5)", id, group.ID, p.OwnerID, inviteClass, group.End); e != nil {
					return e
				}
				if e = s.bumpAccess(ctx, tx, p.OwnerID); e != nil {
					return e
				}
			case "revoke-invite":
				tag, e := tx.Exec(ctx, "UPDATE "+s.table("m04_family_invitations")+" SET status='revoked' WHERE invitation_id=$1 AND family_id=$2 AND status='pending'", q.InvitationID, group.ID)
				if e != nil {
					return e
				}
				if tag.RowsAffected() == 0 {
					return accountFailure(404, "NOT_FOUND", "Pending invitation not found.")
				}
			case "remove", "leave":
				target := p.OwnerID
				if q.Action == "remove" {
					e = tx.QueryRow(ctx, "SELECT COALESCE(owner_id,'') FROM "+s.table("m04_family_assignments")+" WHERE assignment_id=$1 AND family_id=$2", q.AssignmentID, group.ID).Scan(&target)
					if errors.Is(e, pgx.ErrNoRows) {
						return accountFailure(404, "NOT_FOUND", "Family assignment not found.")
					}
					if e != nil {
						return e
					}
				}
				if target == "" || target == group.Payer {
					return accountFailure(403, "FORBIDDEN", "The payer seat cannot be removed.")
				}
				if _, e = tx.Exec(ctx, "SELECT 1 FROM "+s.table("m03_access")+" WHERE owner_id=$1 FOR UPDATE", target); e != nil {
					return e
				}
				if _, e = tx.Exec(ctx, "UPDATE "+s.table("m04_family_assignments")+" SET status='held' WHERE family_id=$1 AND owner_id=$2 AND status='active'", group.ID, target); e != nil {
					return e
				}
				if e = s.bumpAccess(ctx, tx, target); e != nil {
					return e
				}
			default:
				return ErrStorage
			}
		}
		view, e := s.platformFamilyViewTx(ctx, tx, p.OwnerID)
		if e != nil {
			return e
		}
		if issued != nil {
			for i := range view.Invitations {
				if view.Invitations[i].InvitationID == issued.InvitationID {
					view.Invitations[i] = *issued
				}
			}
		}
		receipt, e := json.Marshal(view)
		if e != nil {
			return e
		}
		out = AcceptedOutcome{ReceiptSchema: "FamilyView", Receipt: receipt}
		return s.saveServiceTx(ctx, tx, p.OwnerID, out)
	})
	return out, err
}

// The caller holds the family advisory lock, then locks/authenticates its owner.
// No mutation is allowed before authorization, including affected-member fences.
func (s *Store) ErasePlatformFamilyTx(ctx context.Context, tx pgx.Tx, owner string) error {
	if err := s.authorize(ctx, tx, owner); err != nil {
		return err
	}
	if err := s.platformFamilyFenceMembersTx(ctx, tx, owner); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, "UPDATE "+s.table("m04_family_assignments")+" SET status='held' WHERE owner_id=$1 AND family_id NOT IN(SELECT family_id FROM "+s.table("m04_family_groups")+" WHERE payer_id=$1)", owner)
	return err
}

// The family lock and authenticated payer lock precede these member fences.
func (s *Store) platformFamilyFenceMembersTx(ctx context.Context, tx pgx.Tx, owner string) error {
	rows, err := tx.Query(ctx, "SELECT DISTINCT a.owner_id FROM "+s.table("m04_family_assignments")+" a JOIN "+s.table("m04_family_groups")+" g ON g.family_id=a.family_id WHERE g.payer_id=$1 AND a.owner_id IS NOT NULL AND a.owner_id<>$1 ORDER BY a.owner_id", owner)
	if err != nil {
		return err
	}
	affected := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		affected = append(affected, id)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return err
	}
	for _, id := range affected {
		if _, err = tx.Exec(ctx, "SELECT 1 FROM "+s.table("m03_access")+" WHERE owner_id=$1 FOR UPDATE", id); err != nil {
			return err
		}
		if err = s.bumpAccess(ctx, tx, id); err != nil {
			return err
		}
	}
	return nil
}
