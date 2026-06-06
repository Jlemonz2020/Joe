# Phase 029 Empty State Design

## Goal

Phase 029 turns blank data regions into reusable Sailei memo cards. The goal is not to hide empty data. The goal is to make every empty surface feel intentional, warm, and connected to the pink diary system.

## Component

Primary component:

- `src/components/EmptySaileiState.astro`

The component supports these tones:

- `hint`
- `notes`
- `moments`
- `projects`
- `search`
- `comments`
- `detail`

Each instance carries `data-empty-tone` so later API-driven lists, search panels, comments, and detail fallbacks can be tested without relying on visual guessing.

## Visual Language

The empty state uses:

- pink glass diary card surface
- small memo ribbon
- round sticker pin
- short companion copy
- optional sticker action button
- soft decorative Sailei cue in the corner

The component avoids cold template language. Copy should read like Sailei leaving a note beside the section, not like a system throwing a placeholder.

## Current Placements

- Home: `hint`
- Notes archive: `notes`
- Moments: `moments`
- Projects: `projects`
- Post detail fallback: `detail`

Search and comments tones are defined in the catalog for later phases. They are intentionally prepared now so those modules do not invent a different empty style later.

## Copy Rules

The catalog in `src/data/emptyStateCatalog.ts` documents four rules:

- do not show raw blank-data labels
- keep tone warm, concrete, and short
- use Sailei as a companion cue, not an interruption
- every empty state needs a `data-empty-tone`

## Boundary

This phase only adds reusable empty states and their copy. It does not implement real API list rendering, comments, search results, or deployment.
