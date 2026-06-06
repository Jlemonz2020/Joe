# Phase 030 Status State Design

## Goal

Phase 030 standardizes loading, error, offline, and timeout states for the pink Sailei diary redesign. These states should feel like soft diary sync cards, not terminal alerts.

## Component

Primary component:

- `src/components/StatusSaileiState.astro`

Supporting catalog:

- `src/data/statusStateCatalog.ts`

Supporting style:

- `src/styles/status-state.css`

Internal preview page:

- `src/pages/status-lab.astro`

The preview page is not linked in the global navigation. It exists so every status can be visually audited and screenshot-tested before the real data modules use it.

## State Types

- `loading`: pink sync orbit, polite live region
- `error`: memo-hold card with calm recovery copy
- `offline`: link-lost card that explains the local page is still available
- `timeout`: waiting card for slow sync

Each card renders `data-status-kind` so tests can verify state coverage.

## Visual Language

The design uses:

- pink glass card surface
- tiny ribbon label
- soft orbit indicator
- compact cue tag
- short companion copy
- restrained motion that respects reduced-motion settings

The mobile layout keeps cue tags in normal flow so they do not overlap text.

## Boundary

This phase creates the status component and its preview page. It does not wire real API failure branches yet. Later search, comments, detail, and list-fetching phases should reuse this component.
