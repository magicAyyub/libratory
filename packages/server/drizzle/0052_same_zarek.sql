ALTER TABLE "books" ALTER COLUMN "voice" SET DEFAULT 'pocket:fr:estelle';
--> statement-breakpoint
-- Kokoro is gone, so a book still set to one of its voices moves to the matching Pocket TTS narrator.
UPDATE "books" SET "voice" = CASE
  WHEN "voice" LIKE 'kokoro:f%' OR "voice" LIKE 'f_\_%' THEN 'pocket:fr:estelle'
  ELSE 'pocket:alba'
END
WHERE "voice" LIKE 'kokoro:%' OR "voice" ~ '^[a-z]{2}_[a-z]+$';
