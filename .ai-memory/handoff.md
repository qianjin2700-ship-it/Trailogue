## Handoff Checkpoint

**Updated**: 2026-10-29 +08:00
**Objective**: Ship Trailogue Book Design V3 photo-adaptive layout as one Railway deployment and one EAS Preview build.
**Branch**: `feature/ios-app`

### Implemented

- Version 3 Book Layout Document with per-photo fit, focus, source/container aspect, crop retention and safety metadata.
- Deterministic layout scoring prioritizing crop safety, aspect fit, display area, style and rhythm.
- Conservative contain fallback for portrait/tall images without reliable subject data; no unsupported subject-recognition claim.
- Shared React Native/PDF fit and focus math, manual fit/focus controls, and V2 layout migration.
- Warm Memoir and Minimalist regrouping; same 17-photo Guishan sample is 9 pages instead of V2 Minimalist's 17.
- Real JPEG dimensions in sample generator, repeatable JSON layout audit, PDF contact-sheet generator.
- Three V3 Guishan PDFs and contact sheets generated and visually inspected after two repair iterations.

### Current verification

- Book layout tests: 8 passed.
- iOS typecheck passes.
- Final JSON audit reports zero issues for all three styles and minimum auto-crop retention above 86%.
- Final PDFs: Travel Magazine 10 pages, Warm Memoir 9, Minimalist 9.

### Remaining release work

1. Run full lint, typecheck, tests, root build, Expo Doctor and iOS export.
2. Review diff/secret scan, commit and push normally.
3. Verify Railway health/ready and owner-protected layout route after deployment.
4. Run one new EAS Preview build and wait for FINISHED.
5. Do not modify Neon data, R2 resources, Railway variables or Apple configuration.
