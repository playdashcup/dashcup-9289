BEGIN;

WITH current_cycles AS (
  SELECT
    to_char(timezone('UTC', now())::date, 'YYYY-MM-DD') AS daily_id,
    to_char(date_trunc('week', timezone('UTC', now()))::date, 'YYYY-MM-DD') AS weekly_id
)
UPDATE quests q
SET target = CASE q.quest_type
      WHEN 'play_5' THEN 80
      WHEN 'play_20' THEN 200
      ELSE q.target
    END,
    reward = CASE q.quest_type
      WHEN 'sponsor_app' THEN 40000
      WHEN 'ppi_3' THEN 150000
      WHEN 'cpa_1' THEN 120000
      ELSE q.reward
    END,
    progress = LEAST(q.progress, CASE q.quest_type
      WHEN 'play_5' THEN 80
      WHEN 'play_20' THEN 200
      ELSE q.target
    END),
    completed = q.claimed OR LEAST(q.progress, CASE q.quest_type
      WHEN 'play_5' THEN 80
      WHEN 'play_20' THEN 200
      ELSE q.target
    END) >= CASE q.quest_type
      WHEN 'play_5' THEN 80
      WHEN 'play_20' THEN 200
      ELSE q.target
    END,
    updated_at = now()
FROM current_cycles c
WHERE NOT q.claimed
  AND (
    (q.cycle_type = 'daily' AND q.cycle_id = c.daily_id AND q.quest_type IN ('play_5', 'sponsor_app'))
    OR (q.cycle_type = 'weekly' AND q.cycle_id = c.weekly_id AND q.quest_type IN ('play_20', 'ppi_3', 'cpa_1'))
  );

INSERT INTO schema_migrations(version) VALUES ('0004_quest_targets_and_rewards')
ON CONFLICT DO NOTHING;

COMMIT;
