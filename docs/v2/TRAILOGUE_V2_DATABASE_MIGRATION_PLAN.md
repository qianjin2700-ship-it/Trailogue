# Trailogue 2.0 database migration plan

Status: **no database migration is required for Phase C**.

## Why Phase C is migration-free

`stories.content` and `books.layout` are already JSONB, while photos already retain width, height,
caption, capture time, location and stable IDs. Phase C builds `StoryDocument` and
`MagazineDocument` deterministically at the application boundary from those existing records. It does
not rewrite historical stories or books and does not persist renderer CSS.

This is the safest compatibility choice: 1.0 keeps reading exactly the rows and columns it already
understands, and old data can be rendered by 2.0 through an adapter without a backfill.

## Future additive migrations (only if persistence becomes necessary)

Any future migration must first prove that the derived document cannot be rebuilt cheaply. Allowed
patterns are:

- a new nullable `document_version` or `semantic_document` column;
- a new table keyed by existing story/book IDs with nullable foreign keys and `ON DELETE CASCADE` or
  `SET NULL` chosen to match current ownership behavior;
- a new index created without changing existing constraints;
- server defaults that preserve existing inserts.

Forbidden patterns are `DROP TABLE`, `DROP COLUMN`, destructive type conversion, mandatory backfill,
renaming a 1.0 column, changing a current default relied on by 1.0, or rewriting existing story/book
JSON in place.

## Migration safety procedure

1. Produce SQL and a compatibility explanation before execution.
2. Test against a disposable local database containing both legacy and current rows.
3. Verify all `/v1` repository reads and writes before and after the migration.
4. Take a Neon branch/backup for any migration touching stored user content.
5. Apply once through the normal migration journal; never edit the journal or repeat a manually
   completed migration.
6. Deploy backward-compatible server code before a client begins writing new optional fields.

Phase C performs none of these operations and requires no Neon action.

