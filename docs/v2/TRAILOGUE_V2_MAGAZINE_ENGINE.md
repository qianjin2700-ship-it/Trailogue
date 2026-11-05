# Trailogue 2.0 Magazine engine

## Architecture

`@trailogue/book` is the single visual authority:

`V1 Story/Photo DTOs -> DocumentSource -> MagazineDocument -> renderMagazineHtml()`

The same `MagazineDocument` is used by iOS WebView preview and expo-print. Railway's opt-in V2 share
page uses the same source adapter, planner and HTML renderer. Platform adapters may materialize signed
photo URLs as data URIs for printing, but they do not own layout rules.

## Deterministic planning

The planner has no random, clock, network or platform input. It uses stable photo order, dimensions,
chapter order and text. The page sequence is:

1. cover;
2. optional trip information;
3. deterministic chapter divider, lead, continuation and photo plate pages;
4. optional semantic quote pages;
5. closing page(s).

For the same normalized input, serialized documents and rendered HTML must be byte-identical.

## Layout and safety rules

- Portrait lead photos use image/text composition where appropriate; landscape leads may use hero or
  full-width treatment.
- Photos are grouped deterministically into one-, two- and three-image plates. Extreme aspect ratios
  may receive a dedicated plate rather than being forced into an incompatible crop.
- `figureFit` measures visible fraction. Ordinary editorial crops use `cover`; unsafe extreme crops
  use `contain` rather than removing most of the source image.
- Text capacity is estimated per fixed Letter content zone. Long prose is split on sentence/word
  boundaries with a character fallback; it is not hidden behind CSS overflow as the pagination
  mechanism.
- Chapter dividers are rule-based, capped, spaced and omitted for compact/single-chapter books.
- Missing/deleted photos are skipped without invalidating readable story content.

## Shared document, platform adapters

- iOS preview: `renderMagazineHtml(document, { preview: true })`.
- PDF: materialize only referenced photos, rebuild the same document with data-URI photos, then call
  `renderMagazineHtml(document)` and expo-print at Letter size.
- Railway V2 share: adapt `SharedStoryDTO`, build the same document and render in preview mode.
- Legacy iOS/PDF/share renderers remain present for 1.0 compatibility but receive no new 2.0 rules.

## Validation matrix

Automated scenarios cover 1, 2-3, 4, 8-12, 20+ and 30 photos; all portrait, all landscape, square,
panorama and mixed orientation; short/long text and titles; one, multiple and 12 chapters; missing
optional fields and missing cover selection. Structural, geometry, page-order, text-capacity and
repeat-render determinism invariants are checked independently.

