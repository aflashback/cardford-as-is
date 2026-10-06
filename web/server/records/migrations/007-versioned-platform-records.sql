-- M03 is an additive private adapter. It does not repin or rewrite V1 rows.
-- Original packet/analysis/advice/receipt bytes use bytea, never jsonb coercion.
CREATE TABLE m03_access (
  owner_id text PRIMARY KEY,
  generation bigint NOT NULL CHECK (generation > 0),
  active_game_id text,
  can_read boolean NOT NULL,
  can_play boolean NOT NULL,
  can_coach boolean NOT NULL,
  control_generation bigint NOT NULL CHECK (control_generation > 0)
);
CREATE TABLE m03_games (
  game_id text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES m03_access(owner_id),
  revision bigint NOT NULL CHECK (revision >= 0),
  window_id text NOT NULL,
  metadata_digest text NOT NULL,
  document bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, owner_id)
);
CREATE INDEX m03_games_owner ON m03_games(owner_id);
CREATE TABLE m03_anchors (
  game_id text PRIMARY KEY REFERENCES m03_games(game_id),
  record bytea NOT NULL
);
CREATE TABLE m03_events (
  game_id text NOT NULL REFERENCES m03_games(game_id),
  sequence bigint NOT NULL CHECK (sequence >= 0),
  revision bigint NOT NULL CHECK (revision >= 0),
  record bytea NOT NULL,
  PRIMARY KEY (game_id, sequence)
);
CREATE TABLE m03_commands (
  owner_id text NOT NULL,
  command_id text NOT NULL,
  digest text NOT NULL,
  game_id text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  command bytea NOT NULL,
  checkpoint_digest text NOT NULL,
  receipt bytea NOT NULL,
  receipt_schema text NOT NULL,
  PRIMARY KEY (owner_id, command_id),
  FOREIGN KEY (game_id, owner_id) REFERENCES m03_games(game_id, owner_id),
  UNIQUE (game_id, revision)
);
CREATE TABLE m03_decisions (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  game_id text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  record bytea NOT NULL,
  FOREIGN KEY (game_id, owner_id) REFERENCES m03_games(game_id, owner_id)
);
CREATE INDEX m03_decisions_game ON m03_decisions(game_id, revision);
CREATE TABLE m03_command_decisions (
  owner_id text NOT NULL,
  command_id text NOT NULL,
  decision_id text NOT NULL REFERENCES m03_decisions(id),
  PRIMARY KEY (owner_id, command_id, decision_id),
  FOREIGN KEY (owner_id, command_id) REFERENCES m03_commands(owner_id, command_id)
);
CREATE TABLE m03_exposures (
  id text PRIMARY KEY,
  decision_id text NOT NULL REFERENCES m03_decisions(id),
  owner_id text NOT NULL,
  game_id text NOT NULL,
  record bytea NOT NULL,
  FOREIGN KEY (game_id, owner_id) REFERENCES m03_games(game_id, owner_id)
);
CREATE TABLE m03_work (
  work_id text PRIMARY KEY,
  predecessor_work_id text REFERENCES m03_work(work_id),
  logical_key text NOT NULL UNIQUE,
  owner_id text NOT NULL,
  game_id text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  actor integer NOT NULL CHECK (actor BETWEEN 0 AND 3),
  window_id text NOT NULL,
  purpose text NOT NULL,
  policy_version text NOT NULL,
  input_digest text NOT NULL,
  access_generation bigint NOT NULL CHECK (access_generation > 0),
  control_generation bigint NOT NULL CHECK (control_generation > 0),
  grant_id text NOT NULL,
  unit_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','running','completed','rejected','canceled')),
  attempt bigint NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  lease_token text,
  lease_until timestamptz,
  expires_at timestamptz NOT NULL,
  receipt_id text UNIQUE,
  decision_id text REFERENCES m03_decisions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (game_id, owner_id) REFERENCES m03_games(game_id, owner_id),
  CHECK (status <> 'completed' OR (receipt_id IS NOT NULL AND decision_id IS NOT NULL))
);
CREATE TABLE m03_work_attempts (
  work_id text NOT NULL REFERENCES m03_work(work_id),
  fence bigint NOT NULL CHECK (fence > 0),
  lease_token text NOT NULL,
  lease_until timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('running','completed','rejected','canceled')),
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  PRIMARY KEY (work_id, fence)
);
CREATE TABLE m03_grants (
  grant_id text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES m03_access(owner_id),
  offer_id text NOT NULL,
  offer_version text NOT NULL,
  game text NOT NULL,
  variant text NOT NULL,
  bucket_id text NOT NULL,
  source_kind text NOT NULL,
  source_id text NOT NULL,
  terms bytea NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  revoked boolean NOT NULL DEFAULT false,
  CHECK (valid_until > valid_from)
);
CREATE INDEX m03_grants_owner ON m03_grants(owner_id);
CREATE TABLE m03_access_trials (
  owner_id text NOT NULL REFERENCES m03_access(owner_id),
  trial_key text NOT NULL,
  grant_id text NOT NULL UNIQUE REFERENCES m03_grants(grant_id),
  activated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (owner_id, trial_key)
);
CREATE TABLE m03_allowance (
  owner_id text NOT NULL REFERENCES m03_access(owner_id),
  bucket_id text NOT NULL,
  period_key text NOT NULL,
  used bigint NOT NULL DEFAULT 0 CHECK (used >= 0),
  PRIMARY KEY (owner_id, bucket_id, period_key)
);
CREATE TABLE m03_allowance_charges (
  owner_id text NOT NULL REFERENCES m03_access(owner_id),
  command_id text NOT NULL,
  bucket_id text NOT NULL,
  period_key text NOT NULL,
  grant_id text NOT NULL REFERENCES m03_grants(grant_id),
  offer_id text NOT NULL,
  offer_version text NOT NULL,
  units bigint NOT NULL CHECK (units > 0),
  game_id text NOT NULL,
  unit_id text NOT NULL,
  PRIMARY KEY (owner_id, command_id),
  UNIQUE (owner_id, bucket_id, game_id, unit_id)
);
CREATE TABLE m03_unit_admissions (
  owner_id text NOT NULL REFERENCES m03_access(owner_id),
  game_id text NOT NULL REFERENCES m03_games(game_id),
  unit_id text NOT NULL,
  grant_id text NOT NULL REFERENCES m03_grants(grant_id),
  access_generation bigint NOT NULL CHECK (access_generation > 0),
  admitted_at timestamptz NOT NULL,
  expires_at timestamptz,
  PRIMARY KEY (owner_id, game_id, unit_id, grant_id, access_generation)
);
CREATE TABLE m03_review_trials (
  trial_id text PRIMARY KEY,
  owner_id text NOT NULL,
  parent_game_id text NOT NULL,
  parent_decision_id text NOT NULL REFERENCES m03_decisions(id),
  parent_revision bigint NOT NULL CHECK (parent_revision >= 0),
  future_exposed boolean NOT NULL,
  request bytea NOT NULL,
  result bytea,
  status text NOT NULL CHECK (status IN ('queued','running','completed','rejected','canceled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (parent_game_id, owner_id) REFERENCES m03_games(game_id, owner_id)
);
-- Defense in depth: accepted history is immutable through every adapter.
CREATE FUNCTION m03_reject_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'accepted M03 history is immutable'; END;
$$;
CREATE TRIGGER m03_anchor_immutable BEFORE UPDATE OR DELETE ON m03_anchors FOR EACH ROW EXECUTE FUNCTION m03_reject_history_change();
CREATE TRIGGER m03_events_immutable BEFORE UPDATE OR DELETE ON m03_events FOR EACH ROW EXECUTE FUNCTION m03_reject_history_change();
CREATE TRIGGER m03_commands_immutable BEFORE UPDATE OR DELETE ON m03_commands FOR EACH ROW EXECUTE FUNCTION m03_reject_history_change();
CREATE TRIGGER m03_decisions_immutable BEFORE UPDATE OR DELETE ON m03_decisions FOR EACH ROW EXECUTE FUNCTION m03_reject_history_change();
CREATE TRIGGER m03_exposures_immutable BEFORE UPDATE OR DELETE ON m03_exposures FOR EACH ROW EXECUTE FUNCTION m03_reject_history_change();
CREATE TRIGGER m03_charges_immutable BEFORE UPDATE OR DELETE ON m03_allowance_charges FOR EACH ROW EXECUTE FUNCTION m03_reject_history_change();
CREATE TRIGGER m03_command_decisions_immutable BEFORE UPDATE OR DELETE ON m03_command_decisions FOR EACH ROW EXECUTE FUNCTION m03_reject_history_change();
CREATE TRIGGER m03_trials_immutable BEFORE UPDATE OR DELETE ON m03_access_trials FOR EACH ROW EXECUTE FUNCTION m03_reject_history_change();
CREATE TRIGGER m03_unit_admissions_immutable BEFORE UPDATE OR DELETE ON m03_unit_admissions FOR EACH ROW EXECUTE FUNCTION m03_reject_history_change();
CREATE FUNCTION m03_protect_completed_work() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'completed' THEN RAISE EXCEPTION 'issued M03 receipt is immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER m03_work_immutable BEFORE UPDATE OR DELETE ON m03_work FOR EACH ROW EXECUTE FUNCTION m03_protect_completed_work();
CREATE TRIGGER m03_review_trial_immutable BEFORE UPDATE OR DELETE ON m03_review_trials FOR EACH ROW EXECUTE FUNCTION m03_protect_completed_work();
CREATE FUNCTION m03_protect_grant_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (to_jsonb(NEW) - 'revoked') IS DISTINCT FROM (to_jsonb(OLD) - 'revoked') OR OLD.revoked OR NOT NEW.revoked THEN
    RAISE EXCEPTION 'M03 grant terms are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER m03_grant_terms_immutable BEFORE UPDATE OR DELETE ON m03_grants FOR EACH ROW EXECUTE FUNCTION m03_protect_grant_terms();
