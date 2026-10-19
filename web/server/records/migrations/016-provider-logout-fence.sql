-- AUTH-SESSION-005: serialize pending login admission with signed provider logout.
ALTER TABLE auth_logout_events ADD COLUMN provider_sid text NOT NULL DEFAULT '';
CREATE INDEX auth_logout_sid_fence ON auth_logout_events(issuer,provider_sid,received_at);
