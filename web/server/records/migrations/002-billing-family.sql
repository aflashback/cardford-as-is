CREATE TABLE billing_previews (
  id uuid PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  request jsonb NOT NULL,
  view jsonb NOT NULL,
  profile_fingerprint text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE TABLE billing_operations (
  id uuid PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  command_id text NOT NULL,
  digest text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(player_id, command_id)
);
CREATE TABLE billing_purchases (
  id uuid PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  request_id text NOT NULL,
  customer_id text NOT NULL,
  offer jsonb NOT NULL,
  environment text NOT NULL CHECK(environment IN ('test','live')),
  checkout_id text UNIQUE,
  subscription_id text UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','checkout','confirmed','blocked')),
  reconcile_fence integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(player_id, request_id)
);
CREATE TABLE billing_reconcile_jobs (
  event_id text PRIMARY KEY REFERENCES billing_events(id) ON DELETE CASCADE,
  purchase_id uuid REFERENCES billing_purchases(id) ON DELETE CASCADE,
  subscription_id text,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','done','unbound','failed')),
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE billing_coverage (
  purchase_id uuid PRIMARY KEY REFERENCES billing_purchases(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK(plan IN ('practice','unlimited','family')),
  paid_through timestamptz NOT NULL,
  canceled boolean NOT NULL DEFAULT false,
  revoked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE family_groups (
  id uuid PRIMARY KEY,
  payer_id uuid NOT NULL UNIQUE REFERENCES players(id) ON DELETE CASCADE,
  policy_version text NOT NULL DEFAULT 'fixture-family-1',
  period_end timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE family_assignments (
  id uuid PRIMARY KEY,
  family_id uuid NOT NULL REFERENCES family_groups(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  seat_class text NOT NULL CHECK(seat_class IN ('unlimited','limited')),
  status text NOT NULL CHECK(status IN ('active','held')),
  period_end timestamptz NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_family ON family_assignments(player_id) WHERE status='active';
CREATE INDEX family_capacity ON family_assignments(family_id,period_end,status);
CREATE TABLE family_invitations (
  id uuid PRIMARY KEY,
  family_id uuid NOT NULL REFERENCES family_groups(id) ON DELETE CASCADE,
  invitee_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  seat_class text NOT NULL CHECK(seat_class IN ('unlimited','limited')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_pending_family_invite ON family_invitations(family_id,invitee_id) WHERE status='pending';
CREATE TABLE family_commands (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  command_id text NOT NULL,
  digest text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(player_id,command_id)
);
