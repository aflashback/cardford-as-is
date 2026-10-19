-- AUTH-LOCAL-001: immutable provider identity and bounded one-use login state.
CREATE TABLE auth_external_identities (
 issuer text NOT NULL,
 subject text NOT NULL,
 owner_id text NOT NULL UNIQUE REFERENCES m03_access(owner_id) ON DELETE CASCADE,
 display_name text NOT NULL DEFAULT 'Player',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(issuer,subject)
);
CREATE TABLE auth_login_attempts (
 state_hash text PRIMARY KEY,
 binding_hash text NOT NULL,
 verifier text NOT NULL,
 nonce text NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE INDEX auth_login_expiry ON auth_login_attempts(expires_at);
CREATE TABLE auth_operator_grants (
 id text PRIMARY KEY,
 owner_id text NOT NULL REFERENCES m03_access(owner_id) ON DELETE CASCADE,
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 500),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL
);
