# Phase 024 Mobile Header Navigation

## Stage Goal

Phase 024 solves the mobile header crowding problem before the redesign moves into theme switching and global controls. The target is not to invent a new information architecture; it is to keep the five primary routes visible, touchable, and visually consistent with the pink Sailei diary direction at narrow widths.

## Decision

The chosen pattern is an in-flow sticker rail inside the header:

- The brand and action tools stay in the first row.
- The Sailei whisper becomes its own full-width diary bubble.
- The five primary nav links become a compact one-row sticker rail.
- Each nav item keeps its index, label, and active spark.
- The rail remains in normal document flow so it cannot cover the hero or content below it.

An earlier bottom-fixed rail idea was rejected during this phase because fixed navigation risks covering page content and can behave unpredictably when ancestors use transforms, blur, or layered effects. The in-flow rail better matches this site's soft diary layout and is safer for later pages.

## Implementation Scope

Changed source files:

- `src/styles/header.css`
- `src/data/headerRules.ts`

No API, data adapter, backend, route, or deployment file was changed.

## Mobile Layout Rules

- Mobile breakpoint: `max-width: 767px`, consistent with the current Astro project breakpoints.
- Header grid areas:
  - `brand actions`
  - `whisper whisper`
  - `nav nav`
- Navigation rail:
  - `display: grid`
  - `grid-template-columns: repeat(5, minmax(0, 1fr))`
  - no horizontal scroll
  - no fixed overlay
  - minimum tap height above the mobile target baseline
- Labels remain short and stable: `首页`、`瞬间`、`笔记`、`项目`、`关于`.

## Skills Used

- `frontend-responsive-ui`: mobile-first grid, touch target sizing, no horizontal overflow.
- `webapp-testing`: Edge headless screenshots at mobile/tablet/desktop widths.
- `verification-before-completion`: typecheck, build, audit, route matrix, static scans, artifact verification.

## Reviewer Notes

The final visual result meets the Phase 024 reviewer criteria:

- 390 px width: no title squeeze, no overlap, no horizontal navigation spill.
- 430 px width: nav remains contained and touchable.
- 768 px width: desktop/tablet header wraps cleanly without collision.
- 1280 px width: desktop HUD layout is preserved.

The 430 px screenshot shows more first-screen vertical air than the 390 px screenshot. Source review confirms this comes from existing page shell rhythm and screenshot height, not from the mobile nav covering content. No Phase 024 rollback is required.

