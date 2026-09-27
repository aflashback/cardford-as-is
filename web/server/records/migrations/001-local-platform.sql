CREATE TABLE players (
  id uuid PRIMARY KEY,
  profile jsonb NOT NULL,
  active_game_id uuid,
  access_generation integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE TABLE games (
  id uuid PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 0,
  document jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX games_player ON games(player_id);
CREATE TABLE commands (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  command_id text NOT NULL,
  digest text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(player_id, command_id)
);
CREATE TABLE game_events (
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  event jsonb NOT NULL,
  PRIMARY KEY(game_id, revision)
);
CREATE TABLE coached_hands (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  hand_number integer NOT NULL,
  period date NOT NULL,
  ready_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(player_id, game_id, hand_number)
);
CREATE INDEX coached_hands_period ON coached_hands(player_id,period);
CREATE TABLE jobs (
  id uuid PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  access_generation integer NOT NULL,
  status text NOT NULL CHECK(status IN ('ready','accepted','expired')),
  result jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  UNIQUE(game_id,revision)
);
CREATE TABLE billing_events (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE TABLE provider_attempts (
  id uuid PRIMARY KEY,
  experiment_id text NOT NULL,
  requested_model text NOT NULL,
  observed_model text,
  outcome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
