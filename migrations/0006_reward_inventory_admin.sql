BEGIN;

ALTER TABLE reward_redemptions DROP CONSTRAINT reward_redemptions_delivery_status_check;
ALTER TABLE reward_redemptions ADD CONSTRAINT reward_redemptions_delivery_status_check
  CHECK (delivery_status IN ('reserved','sending','accepted','sent','rejected','provider_unknown'));

CREATE TABLE admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX admin_sessions_expiry_idx ON admin_sessions(expires_at) WHERE revoked_at IS NULL;

CREATE TABLE reward_inventory_slots (
  reward_type text NOT NULL CHECK (reward_type IN ('robux','freefire','vbucks','pubg','cod')),
  slot_number smallint NOT NULL CHECK (slot_number BETWEEN 1 AND 20),
  reward_code_id uuid UNIQUE REFERENCES reward_codes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reward_type, slot_number)
);

INSERT INTO reward_inventory_slots(reward_type,slot_number)
SELECT rt.reward_type,s.slot_number::smallint
FROM unnest(ARRAY['robux','freefire','vbucks','pubg','cod']::text[]) AS rt(reward_type)
CROSS JOIN generate_series(1,20) AS s(slot_number)
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT reward_type FROM reward_codes GROUP BY reward_type HAVING count(*) > 20
  ) THEN
    RAISE EXCEPTION 'Reward inventory exceeds 20-slot capacity; map inventory before migrating';
  END IF;
END $$;

WITH ranked AS (
  SELECT id,reward_type,row_number() OVER (PARTITION BY reward_type ORDER BY created_at,id)::smallint AS slot_number
  FROM reward_codes
)
UPDATE reward_inventory_slots s
SET reward_code_id=r.id,updated_at=now()
FROM ranked r
WHERE s.reward_type=r.reward_type AND s.slot_number=r.slot_number;

ALTER TABLE reward_redemptions
  ADD COLUMN inventory_slot_number smallint CHECK (inventory_slot_number BETWEEN 1 AND 20),
  ADD COLUMN delivery_attempt integer NOT NULL DEFAULT 1 CHECK (delivery_attempt > 0);

UPDATE reward_redemptions r
SET inventory_slot_number=s.slot_number
FROM reward_inventory_slots s
WHERE s.reward_type=r.reward_type AND s.reward_code_id=r.reward_code_id;

INSERT INTO schema_migrations(version) VALUES ('0006_reward_inventory_admin')
ON CONFLICT DO NOTHING;

COMMIT;
