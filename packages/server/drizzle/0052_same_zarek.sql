ALTER TABLE "books" ALTER COLUMN "voice" SET DEFAULT 'pocket:fr:estelle';
--> statement-breakpoint
-- Kokoro is gone. A voice moves to the Pocket TTS narrator of its text: a lane's own language, else
-- the book's (the old default was English whatever the book), else the one in the Kokoro voice id.
CREATE FUNCTION pg_temp.pocket_language(name text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN lower(name) IN ('fr', 'fra', 'fre', 'french', 'français', 'francais') THEN 'fr'
    WHEN lower(name) IN ('es', 'spa', 'spanish', 'español', 'espanol') THEN 'es'
    WHEN lower(name) IN ('it', 'ita', 'italian', 'italiano') THEN 'it'
    WHEN lower(name) IN ('pt', 'por', 'portuguese', 'português', 'portugues') THEN 'pt'
    WHEN lower(name) IN ('de', 'deu', 'ger', 'german', 'deutsch') THEN 'de'
    WHEN lower(name) IN ('en', 'eng', 'english') THEN 'en'
  END
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.pocket_voice_after_kokoro(old_voice text, lane text, book_language text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE COALESCE(
    pg_temp.pocket_language(lane),
    pg_temp.pocket_language(book_language),
    CASE substring(old_voice from '^(?:kokoro:)?([a-z])[a-z]_')
      WHEN 'f' THEN 'fr' WHEN 'e' THEN 'es' WHEN 'i' THEN 'it' WHEN 'p' THEN 'pt' ELSE 'en'
    END
  )
    WHEN 'fr' THEN 'pocket:fr:estelle'
    WHEN 'es' THEN 'pocket:es:lola'
    WHEN 'it' THEN 'pocket:it:giovanni'
    WHEN 'pt' THEN 'pocket:pt:rafael'
    WHEN 'de' THEN 'pocket:de:juergen'
    ELSE 'pocket:alba'
  END
$$;
--> statement-breakpoint
UPDATE "books"
SET "voice" = pg_temp.pocket_voice_after_kokoro("voice", NULL, "language")
WHERE "voice" LIKE 'kokoro:%' OR "voice" ~ '^[a-z]{2}_[a-z]+$';
--> statement-breakpoint
UPDATE "books"
SET "variant_voices" = (
  SELECT jsonb_object_agg(
    lane.key,
    CASE WHEN lane.value->>'voice' LIKE 'kokoro:%' OR lane.value->>'voice' ~ '^[a-z]{2}_[a-z]+$'
      THEN jsonb_set(lane.value, '{voice}', to_jsonb(pg_temp.pocket_voice_after_kokoro(lane.value->>'voice', lane.key, "language")))
      ELSE lane.value
    END
  )
  FROM jsonb_each("variant_voices") AS lane
)
WHERE jsonb_typeof("variant_voices") = 'object' AND "variant_voices" <> '{}'::jsonb;
--> statement-breakpoint
DROP FUNCTION pg_temp.pocket_voice_after_kokoro(text, text, text);
--> statement-breakpoint
DROP FUNCTION pg_temp.pocket_language(text);
