ALTER TABLE "trips" ADD COLUMN "creative_requirements" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "generation_language_mode" varchar(24) DEFAULT 'auto' NOT NULL;
--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "actual_language" varchar(24) DEFAULT 'en' NOT NULL;
--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "version_type" varchar(24) DEFAULT 'generated' NOT NULL;
--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "creative_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "book_style" varchar(24) DEFAULT 'travel_magazine' NOT NULL;
--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "layout" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
UPDATE "trips" SET "creative_requirements" = jsonb_build_object(
  'mainPerson', NULL,
  'companions', "people_notes",
  'relationship', NULL,
  'focusPerson', NULL,
  'writingStyle', CASE "writing_style"
    WHEN 'concise' THEN 'travel_guide'
    WHEN 'literary' THEN 'literary'
    WHEN 'playful' THEN 'playful'
    WHEN 'custom' THEN 'custom'
    ELSE 'warm_documentary'
  END,
  'customWritingStyle', "custom_writing_style",
  'contentLength', CASE "content_length" WHEN 'medium' THEN 'standard' WHEN 'long' THEN 'detailed' ELSE "content_length" END,
  'customWordCount', NULL,
  'focuses', jsonb_build_array('journey', 'people'),
  'specialMemories', "story_background",
  'emphasis', "highlights",
  'avoidExpressions', "avoid_expressions",
  'otherRequirements', NULL,
  'generationLanguage', 'auto',
  'bookStyle', 'travel_magazine'
);
--> statement-breakpoint
UPDATE "stories" SET "actual_language" = CASE
  WHEN "content"::text ~ '[぀-ヿ]' THEN 'ja'
  WHEN "content"::text ~ '[가-힯]' THEN 'ko'
  WHEN "content"::text ~ '[㐀-鿿]' THEN 'zh-Hans'
  ELSE 'en'
END;
--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_generation_language_mode_valid" CHECK ("generation_language_mode" IN ('auto', 'zh-Hans', 'zh-Hant', 'en', 'ja', 'ko'));
--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_actual_language_valid" CHECK ("actual_language" IN ('zh-Hans', 'zh-Hant', 'en', 'ja', 'ko'));
--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_version_type_valid" CHECK ("version_type" IN ('generated', 'regenerated', 'edited', 'restored'));
--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_style_valid" CHECK ("book_style" IN ('travel_magazine', 'warm_memoir', 'minimalist'));
