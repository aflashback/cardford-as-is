-- Rally Coach experience sessions are separate from historical hand/request unlocks.
CREATE TABLE coach_ui_daily_usage (
 owner_id text NOT NULL REFERENCES m03_access(owner_id),
 bucket_id text NOT NULL CHECK(bucket_id='coach-ui-sessions'),
 quota_day date NOT NULL,
 used integer NOT NULL CHECK(used BETWEEN 0 AND 2),
 PRIMARY KEY(owner_id,bucket_id,quota_day)
);
CREATE TABLE coach_ui_sessions (
 session_id text PRIMARY KEY,
 owner_id text NOT NULL REFERENCES m03_access(owner_id),
 game_id text NOT NULL REFERENCES m03_games(game_id),
 decision_id text NOT NULL,
 source_revision bigint NOT NULL CHECK(source_revision>=0),
 source_unit_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('cue','review','rating')),
 grant_id text REFERENCES m03_grants(grant_id),
 quota_day date NOT NULL,
 charged boolean NOT NULL,
 content bytea NOT NULL CHECK(octet_length(content)<=262144),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(owner_id,session_id)
);
CREATE INDEX coach_ui_sessions_recent ON coach_ui_sessions(owner_id,created_at DESC,session_id);
CREATE TRIGGER coach_ui_sessions_immutable BEFORE UPDATE OR DELETE ON coach_ui_sessions FOR EACH ROW EXECUTE FUNCTION m03_reject_history_change();
CREATE TABLE coach_ui_items (
 item_id text PRIMARY KEY,
 owner_id text NOT NULL,
 session_id text NOT NULL,
 source_revision bigint NOT NULL CHECK(source_revision>=0),
 kind text NOT NULL,
 content bytea NOT NULL CHECK(octet_length(content)<=262144),
 replay bytea NOT NULL CHECK(octet_length(replay)<=1048576),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(owner_id,session_id) REFERENCES coach_ui_sessions(owner_id,session_id),
 UNIQUE(owner_id,item_id)
);
CREATE INDEX coach_ui_items_session ON coach_ui_items(owner_id,session_id,created_at,item_id);
CREATE TRIGGER coach_ui_items_immutable BEFORE UPDATE OR DELETE ON coach_ui_items FOR EACH ROW EXECUTE FUNCTION m03_reject_history_change();
CREATE TABLE coach_ui_feedback (
 owner_id text NOT NULL,
 item_id text NOT NULL,
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 content bytea NOT NULL CHECK(octet_length(content)<=16384),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,item_id,revision),
 FOREIGN KEY(owner_id,item_id) REFERENCES coach_ui_items(owner_id,item_id)
);
CREATE TRIGGER coach_ui_feedback_immutable BEFORE UPDATE OR DELETE ON coach_ui_feedback FOR EACH ROW EXECUTE FUNCTION m03_reject_history_change();
