BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL DEFAULT 'Runner' CHECK (length(display_name) <= 32),
  referral_code text NOT NULL UNIQUE,
  trophies bigint NOT NULL DEFAULT 0 CHECK (trophies >= 0),
  personal_best integer NOT NULL DEFAULT 0 CHECK (personal_best >= 0),
  reward_email text,
  reward_email_change_count smallint NOT NULL DEFAULT 0 CHECK (reward_email_change_count BETWEEN 0 AND 3),
  reward_email_window_started_at timestamptz,
  gift_choice text CHECK (gift_choice IS NULL OR gift_choice IN ('robux','freefire','vbucks','pubg','cod')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  csrf_hash text NOT NULL CHECK (length(csrf_hash) = 64),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > issued_at)
);
CREATE INDEX sessions_user_expiry_idx ON sessions(user_id, expires_at DESC) WHERE revoked_at IS NULL;

CREATE TABLE game_sessions (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seed bigint NOT NULL,
  run_token_hash text NOT NULL UNIQUE CHECK (length(run_token_hash) = 64),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  suspicion_flags text[] NOT NULL DEFAULT '{}',
  CHECK (expires_at > started_at)
);
CREATE INDEX game_sessions_user_started_idx ON game_sessions(user_id, started_at DESC);

CREATE TABLE game_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL UNIQUE REFERENCES game_sessions(run_id),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_score integer NOT NULL CHECK (client_score >= 0),
  verified_score integer NOT NULL CHECK (verified_score >= 0),
  duration_ms integer NOT NULL CHECK (duration_ms BETWEEN 1 AND 180000),
  evidence_hash bytea NOT NULL,
  result_state text NOT NULL CHECK (result_state IN ('verified','rejected','suspicious')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX game_runs_user_created_idx ON game_runs(user_id, created_at DESC);

CREATE TABLE cycle_scores (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle_id text NOT NULL,
  trophies bigint NOT NULL DEFAULT 0 CHECK (trophies >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, cycle_id)
);
CREATE INDEX cycle_scores_rank_idx ON cycle_scores(cycle_id, trophies DESC, user_id);

CREATE TABLE quests (
  id text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle_type text NOT NULL CHECK (cycle_type IN ('daily','weekly')),
  cycle_id text NOT NULL,
  quest_type text NOT NULL,
  target integer NOT NULL CHECK (target > 0),
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0),
  completed boolean NOT NULL DEFAULT false,
  claimed boolean NOT NULL DEFAULT false,
  reward integer NOT NULL CHECK (reward >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, cycle_type, cycle_id, quest_type),
  CHECK (NOT claimed OR completed)
);
CREATE INDEX quests_user_cycle_idx ON quests(user_id, cycle_type, cycle_id);

CREATE TABLE weekly_pb_days (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_id text NOT NULL,
  utc_day date NOT NULL,
  score integer NOT NULL CHECK (score > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week_id, utc_day)
);

CREATE TABLE referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referee_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  referral_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  qualified_at timestamptz,
  CHECK (referrer_id <> referee_id)
);
CREATE INDEX referrals_qualified_week_idx ON referrals(referrer_id, qualified_at);

CREATE TABLE mylead_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  click_id text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  provider_metadata jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE provider_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  transaction_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('cpi','ppi','cpa')),
  status text NOT NULL CHECK (status IN ('verified','rejected','reversed')),
  reward_metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, transaction_id)
);

CREATE TABLE reward_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_type text NOT NULL CHECK (reward_type IN ('robux','freefire','vbucks','pubg','cod')),
  encrypted_code bytea NOT NULL,
  iv bytea NOT NULL CHECK (octet_length(iv) = 12),
  authentication_tag bytea NOT NULL CHECK (octet_length(authentication_tag) = 16),
  fingerprint bytea NOT NULL UNIQUE CHECK (octet_length(fingerprint) = 32),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','delivered')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reserved_at timestamptz,
  delivered_at timestamptz
);
CREATE INDEX reward_codes_available_idx ON reward_codes(reward_type, created_at) WHERE status = 'available';

CREATE TABLE reward_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle_id text NOT NULL,
  reward_type text NOT NULL CHECK (reward_type IN ('robux','freefire','vbucks','pubg','cod')),
  reward_code_id uuid NOT NULL UNIQUE REFERENCES reward_codes(id),
  recipient_email text NOT NULL,
  status text NOT NULL CHECK (status IN ('reserved','sending','sent','failed','provider_unknown','cancelled')),
  idempotency_key text NOT NULL UNIQUE,
  provider_message_id text,
  failure_info text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, cycle_id)
);

CREATE TABLE reward_email_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_fingerprint bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reward_email_changes_window_idx ON reward_email_changes(user_id, created_at DESC);

CREATE FUNCTION record_reward_email_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.reward_email IS DISTINCT FROM NEW.reward_email AND NEW.reward_email IS NOT NULL THEN
    INSERT INTO reward_email_changes(user_id,email_fingerprint)
    VALUES(NEW.id,digest(upper(NEW.reward_email),'sha256'));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER users_reward_email_change_audit
AFTER UPDATE OF reward_email ON users
FOR EACH ROW EXECUTE FUNCTION record_reward_email_change();

CREATE TABLE suspicious_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reason_codes text[] NOT NULL,
  evidence_hash bytea,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX suspicious_runs_created_idx ON suspicious_runs(created_at DESC);

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs(created_at DESC);

CREATE TABLE schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations(version) VALUES ('0001_initial')
ON CONFLICT DO NOTHING;

COMMIT;
