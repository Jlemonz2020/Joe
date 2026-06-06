# Phase 026 Search Entry Design

## Stage Goal

Create a clear pink anime "data search" entrance without building the full search modal yet.

## Design Decision

The Header now uses a dedicated `SearchEntry.astro` component:

- 1440 px and wider: light HUD search input with `DATA` badge and icon submit.
- 1024-1339 px: compact `DATA + icon` entrance to avoid pushing nav links into a second row.
- 1023 px and below: icon-sized entry so mobile header controls stay touchable.

This keeps the entrance visible without making the Header feel like a backend toolbar.

## Behavior

- The form uses `role="search"`.
- The input uses `name="q"`.
- Submitting routes to `/archive.html?q=...`.
- The full search modal and `/api/search?q=` workflow remain reserved for later phases.

## Files Changed

- `src/components/Header.astro`
- `src/components/SearchEntry.astro`
- `src/data/searchEntryRules.ts`
- `src/layouts/BaseLayout.astro`
- `src/styles/search-entry.css`
- `src/styles/header.css`

## Review Note

An initial 1280 px version exposed a truncated input and caused the navigation to feel cramped. The final version uses a compact 1280 state and expands the input only at 1440 px and above.

