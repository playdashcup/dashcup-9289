BEGIN;

-- Apply the revised quest catalog to existing, unclaimed quest rows. Previously
-- claimed rewards remain immutable; progress is clamped to the new target.
UPDATE quests q
SET target = CASE q.quest_type
      WHEN 'play_1' THEN 10
      WHEN 'play_5' THEN 80
      WHEN 'play_20' THEN 200
      WHEN 'score_1000' THEN 100
      WHEN 'ref_2' THEN 2
      ELSE q.target
    END,
    reward = CASE q.quest_type
      WHEN 'play_1' THEN 1000
      WHEN 'play_5' THEN 8000
      WHEN 'play_20' THEN 25000
      WHEN 'ref_2' THEN 10000
      ELSE q.reward
    END,
    progress = LEAST(q.progress, CASE q.quest_type
      WHEN 'play_1' THEN 10
      WHEN 'play_5' THEN 80
      WHEN 'play_20' THEN 200
      WHEN 'score_1000' THEN 100
      WHEN 'ref_2' THEN 2
      ELSE q.target
    END),
    completed = LEAST(q.progress, CASE q.quest_type
      WHEN 'play_1' THEN 10
      WHEN 'play_5' THEN 80
      WHEN 'play_20' THEN 200
      WHEN 'score_1000' THEN 100
      WHEN 'ref_2' THEN 2
      ELSE q.target
    END) >= CASE q.quest_type
      WHEN 'play_1' THEN 10
      WHEN 'play_5' THEN 80
      WHEN 'play_20' THEN 200
      WHEN 'score_1000' THEN 100
      WHEN 'ref_2' THEN 2
      ELSE q.target
    END,
    updated_at = now()
WHERE NOT q.claimed
  AND q.quest_type IN ('play_1', 'play_5', 'play_20', 'score_1000', 'ref_2');

INSERT INTO schema_migrations(version) VALUES ('0005_quest_rewards_and_score_100')
ON CONFLICT DO NOTHING;

COMMIT;
