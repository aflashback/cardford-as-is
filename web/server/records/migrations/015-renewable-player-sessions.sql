-- AUTH-SESSION-001..005. Provider secrets are authenticated ciphertext only.
ALTER TABLE m03_access ADD COLUMN auth_generation bigint NOT NULL DEFAULT 0;
ALTER TABLE m03_access ADD COLUMN active_auth_family text;
CREATE TABLE auth_session_families (
 token_hash text PRIMARY KEY REFERENCES m04_sessions(token_hash) ON DELETE CASCADE,
 owner_id text NOT NULL REFERENCES m03_access(owner_id),
 generation bigint NOT NULL,
 issuer text NOT NULL, subject text NOT NULL, provider_sid text NOT NULL,
 authenticated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 idle_expires_at timestamptz NOT NULL, absolute_expires_at timestamptz NOT NULL,
 provider_expires_at timestamptz NOT NULL,
 token_key_id text NOT NULL, token_ciphertext bytea NOT NULL,
 refresh_operation text, refresh_lease_until timestamptz,
 refresh_uncertain boolean NOT NULL DEFAULT false,
 CHECK (idle_expires_at <= absolute_expires_at)
);
CREATE INDEX auth_family_idle ON auth_session_families(idle_expires_at);
CREATE INDEX auth_family_expiry ON auth_session_families((LEAST(idle_expires_at,absolute_expires_at,provider_expires_at))) WHERE octet_length(token_ciphertext)>0;
CREATE INDEX auth_family_provider_sid ON auth_session_families(issuer,provider_sid);
CREATE TABLE auth_session_events (
 id bigserial PRIMARY KEY, owner_id text NOT NULL, token_hash text NOT NULL,
 kind text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX auth_session_events_created ON auth_session_events(created_at);
CREATE TABLE auth_logout_events (issuer text NOT NULL, event_id text NOT NULL,
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(issuer,event_id));
CREATE INDEX auth_logout_event_received ON auth_logout_events(received_at);
-- Legacy real-auth sessions have no refresh proof. Fixture owners are excluded.
UPDATE m04_sessions SET revoked_at=clock_timestamp() WHERE revoked_at IS NULL
 AND owner_id IN (SELECT owner_id FROM auth_external_identities);
