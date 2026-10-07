-- M04E preserved client account, help and bounded review records.
-- Account portion for root assembly into forward migration 010.
CREATE TABLE m04_profiles (
 owner_id text PRIMARY KEY REFERENCES m03_access(owner_id) ON DELETE CASCADE,
 profile_version text NOT NULL DEFAULT '1.0.0',
 preferences_revision bigint NOT NULL DEFAULT 0 CHECK (preferences_revision BETWEEN 0 AND 9007199254740991),
 preferences jsonb NOT NULL DEFAULT '{"coachMode":"asked","gameSpeed":1}',
 display_name text NOT NULL DEFAULT 'Local player',
 plan text CHECK (plan IN ('practice','unlimited','family')),
 current_period_end timestamptz,
 cancel_at_period_end boolean NOT NULL DEFAULT false,
 scheduled_plan text CHECK (scheduled_plan IN ('practice','unlimited','family'))
);
CREATE TABLE m04_billing_previews (
 preview_id text PRIMARY KEY,
 owner_id text NOT NULL REFERENCES m03_access(owner_id) ON DELETE CASCADE,
 view bytea NOT NULL,
 profile_fingerprint text NOT NULL,
 expires_at timestamptz NOT NULL,
 used_at timestamptz
);
CREATE INDEX m04_billing_previews_owner ON m04_billing_previews(owner_id);
CREATE TABLE m04_family_groups (
 family_id text PRIMARY KEY,
 payer_id text UNIQUE NOT NULL REFERENCES m03_access(owner_id) ON DELETE CASCADE,
 period_end timestamptz NOT NULL
);
CREATE TABLE m04_family_assignments (
 assignment_id text PRIMARY KEY,
 family_id text NOT NULL REFERENCES m04_family_groups(family_id) ON DELETE CASCADE,
 owner_id text REFERENCES m03_access(owner_id) ON DELETE SET NULL,
 seat_class text NOT NULL CHECK (seat_class IN ('unlimited','limited')),
 status text NOT NULL CHECK (status IN ('active','held')),
 period_end timestamptz NOT NULL,
 accepted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX m04_family_assignments_active_owner ON m04_family_assignments(owner_id) WHERE status='active' AND owner_id IS NOT NULL;
CREATE INDEX m04_family_assignments_group ON m04_family_assignments(family_id);
CREATE TABLE m04_family_invitations (
 invitation_id text PRIMARY KEY,
 family_id text NOT NULL REFERENCES m04_family_groups(family_id) ON DELETE CASCADE,
 invitee_id text NOT NULL REFERENCES m03_access(owner_id) ON DELETE CASCADE,
 seat_class text NOT NULL CHECK (seat_class IN ('unlimited','limited')),
 token_hash text UNIQUE NOT NULL,
 expires_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX m04_family_invitations_group ON m04_family_invitations(family_id);

-- Append inside migration 010; canonical migrations remain root-owned.
CREATE TABLE m04_help_deliveries (
 owner_id text NOT NULL REFERENCES m03_access(owner_id),
 game_id text NOT NULL REFERENCES m03_games(game_id),
 decision_id text NOT NULL,
 source_revision bigint NOT NULL CHECK(source_revision>=0),
 live_revision bigint NOT NULL CHECK(live_revision>=source_revision),
 kind text NOT NULL CHECK(kind IN ('advice','notes','trial')),
 level integer NOT NULL CHECK(level BETWEEN 1 AND 3),
 grant_id text NOT NULL REFERENCES m03_grants(grant_id),
 content bytea NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,game_id,decision_id,kind,level)
);
CREATE TRIGGER m04_help_immutable BEFORE UPDATE OR DELETE ON m04_help_deliveries FOR EACH ROW EXECUTE FUNCTION m03_reject_history_change();
CREATE TABLE m04_review_jobs (
 owner_id text NOT NULL REFERENCES m03_access(owner_id),
 command_id text NOT NULL,
 digest text NOT NULL,
 game_id text NOT NULL REFERENCES m03_games(game_id),
 source_revision bigint NOT NULL CHECK(source_revision>=0),
 live_revision bigint NOT NULL CHECK(live_revision>=source_revision),
 request bytea NOT NULL,
 admission bytea NOT NULL,
 seed bigint NOT NULL CHECK(seed BETWEEN 0 AND 4294967295),
 sampler_version text NOT NULL DEFAULT 'uniform-constraint-counting-1.0.0',
 attempt bigint NOT NULL DEFAULT 1 CHECK(attempt>0),
 status text NOT NULL CHECK(status IN ('running','completed','expired','unavailable')),
 expires_at timestamptz NOT NULL,
 result bytea,
 PRIMARY KEY(owner_id,command_id),
 CHECK((status='completed')=(result IS NOT NULL))
);
CREATE TRIGGER m04_review_completed_immutable BEFORE UPDATE OR DELETE ON m04_review_jobs FOR EACH ROW EXECUTE FUNCTION m03_protect_completed_work();
