## Handoff Checkpoint

**Updated**: 2026-10-28 +08:00
**Objective**: Ship the centralized creative-experience optimization as one Railway deployment and one EAS Preview build.
**Branch**: `feature/ios-app`

### Implemented

- Timezone-safe dates on trip cards and details, including cover and destination.
- Explicit, autosaved creative requirements flow; AI generation cannot start without a user button press and `confirmed: true`.
- Persistent language mode/actual language/version source metadata, history compare, and non-destructive restore.
- Shared preview/PDF layout document with eight content layouts, three book styles, designed cover, chapter openers and Unicode-safe PDF naming.
- DeepSeek prompt separates visual facts from narration, enforces target length/language, avoids invented exact times and mechanical visual lists.
- Additive migration `0004_creative_book_experience.sql`, OpenAPI updates, centralized trial guide and a rendered 13-page reference PDF.

### Verified before release

- Lint and typecheck pass.
- Full tests pass: config 4, database 7, API 41, worker 3, iOS 45.
- Root production build, Expo Doctor 21/21 and iOS bundle export pass.
- PDF has 13 pages, 18 embedded images and no empty text page; representative pages were visually reviewed.

### Release continuation

1. Review `git diff`, migration safety and secret scan; commit and push normally.
2. Wait for Railway automatic deployment and require `/health` + `/ready` 200 and new restore/generation routes to return 401 without auth.
3. Only after the new API is confirmed, run one iOS EAS Preview build and report the build ID/install URL.
4. Do not manually edit Neon migration journal, Railway secrets, R2, or Apple configuration.
