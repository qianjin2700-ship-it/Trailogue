# Trailogue 2.0 AI pipeline

## Boundary

AI decides content semantics. `@trailogue/book` decides visual layout. The model may never return CSS,
font sizes, margins, coordinates, pixel dimensions, arbitrary HTML or page composition.

## Pipeline

1. **Photo analysis**: conservative visible facts per stable photo ID; no inferred relationships,
   dialogue, motives or exact time/place without evidence.
2. **Chronology**: order by trusted capture time when present, otherwise retain user photo order and
   use broad time labels.
3. **Semantic grouping**: group related photo IDs without duplicating or omitting IDs.
4. **Story structure**: chapter IDs/titles, date/location context, relevant photo IDs, captions,
   highlight/quote candidates and factual uncertainty.
5. **Writing**: prose constrained by trip metadata, user notes, language and length requirements.
6. **Layout semantics**: pass stable semantic blocks to `StoryDocument`/`MagazineDocument`; the
   deterministic renderer selects pages and geometry.

## Current compatibility adapter

Phase C consumes the validated 1.0 `StoryContentDTO` as the semantic source. Existing DeepSeek calls,
version history and `/v1` generation behavior are not replaced. `sourceFromStory` maps the DTO to a
platform-neutral `DocumentSource`, preserving chapter and photo IDs. Optional Story 2.0 semantics can
be added later without making them required for old rows.

### StoryDocument review

The current render model is sufficient for Phase C: `header`, `paragraph`, `section`, `figure`,
`quote` and `closing` cover the required reading flow, while figure blocks carry stable photo IDs and
deterministic one/two/three-image grouping. It deliberately does not duplicate generation metadata or
editable chapter state; those remain in `StoryContentDTO`/story versions.

Future AI semantics such as explicit chronology confidence, named photo groups or highlight provenance
should be added as optional source/build hints. Existing block discriminants and `version: 1` remain
readable; a required structural change would increment the document version instead of redefining an
existing field.

## Validation and stability

- Vision output must cover each supplied photo exactly once and use only supplied IDs.
- Story output must be a JSON object with non-empty chapters, unique IDs and every supplied photo
  exactly once. Invalid output is retried with a correction prompt.
- The model response is never rendered directly. Only the validated semantic object reaches the
  document builders.
- Regeneration may change wording, but stable inputs, ordering instructions and schema constraints
  limit structural drift. Locked/user-edited chapters remain an API concern, not a renderer concern.
- Provider errors preserve the previous persisted version; no partial AI response overwrites it.

## Deterministic fallback

Fallback is intentionally factual, not a fake AI success. If AI output cannot pass validation after
bounded retries, the server keeps the last valid story and returns a diagnosable AI error. The 2.0
renderer can still deterministically rebuild Story/Magazine from that valid version. For a trip that
has never had a valid story, the UI retains the photo timeline and generation retry action; it must
not invent prose locally or persist mock content.

This behavior is deterministic, preserves user data, and keeps the existing 1.0 generation contract
unchanged. A future `/v2` generation endpoint may add a clearly marked metadata-only draft, but that
requires a separate product decision and additive contract.
