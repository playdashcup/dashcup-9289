BEGIN;

UPDATE quests
SET target = 10,
    completed = claimed OR progress >= 10,
    updated_at = now()
WHERE cycle_type = 'daily' AND quest_type = 'play_1';

UPDATE quests
SET target = 50,
    completed = claimed OR progress >= 50,
    updated_at = now()
WHERE cycle_type = 'daily' AND quest_type = 'play_5';

UPDATE quests q
SET id = regexp_replace(q.id, ':pb_3_days$', ':score_1000'),
    quest_type = 'score_1000',
    target = 1000,
    progress = LEAST(1000, u.personal_best),
    completed = q.claimed OR u.personal_best >= 1000,
    updated_at = now()
FROM users u
WHERE q.user_id = u.id AND q.cycle_type = 'weekly' AND q.quest_type = 'pb_3_days';

WITH adjectives AS (
  SELECT ARRAY['Agile','Amber','Bright','Cosmic','Daring','Golden','Jolly','Lucky','Merry','Mighty','Nimble','Rapid','Silver','Snappy','Sunny','Swift','Turbo','Velvet','Witty','Zesty']::text[] AS items
), nouns AS (
  SELECT ARRAY['Badger','Bunny','Comet','Falcon','Fox','Gecko','Hawk','Koala','Otter','Panda','Penguin','Phoenix','Pigeon','Puma','Robin','Sparrow','Tiger','Turtle','Walrus','Wombat']::text[] AS items
), waiting AS (
  SELECT id, row_number() OVER (ORDER BY random()) - 1 AS position
  FROM users
  WHERE display_name = 'Runner'
), names AS (
  SELECT waiting.id,
    adjectives.items[1 + mod(waiting.position, 20)::integer] || ' ' ||
    nouns.items[(1 + mod(waiting.position / 20, 20))::integer] AS display_name
  FROM waiting CROSS JOIN adjectives CROSS JOIN nouns
)
UPDATE users u
SET display_name = names.display_name,
    updated_at = now()
FROM names
WHERE u.id = names.id;

INSERT INTO schema_migrations(version) VALUES ('0003_targeted_progression_and_names')
ON CONFLICT DO NOTHING;

COMMIT;
