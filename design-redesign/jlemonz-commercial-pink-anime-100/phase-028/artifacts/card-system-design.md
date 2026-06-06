# Phase 028 Card System Design

## Stage Goal

Create the first reusable card family for the pink Sailei diary redesign.

## Card Families

- `diary-card--glass`: Sailei hints, empty states, companion panels.
- `diary-card--ticket`: task cards, file cards, project rows.
- `diary-card--tape`: moments, diary notes, timeline fragments.
- `diary-card--polaroid`: future photo moments and image memories.
- `diary-card--paper`: hero copy, reading areas, archives, long-form content.

## Current Integration

- Hero dialog uses `diary-card--paper`.
- Empty Sailei states use `diary-card--glass`.
- Home and project preview cards use `diary-card--ticket`.
- Moments channel cards use `diary-card--tape`.
- Archive and About cards use `diary-card--paper`.

`diary-card--polaroid` is implemented and documented but not yet attached to live content because photo moments are scheduled for later phases.

## Visual Rules

- Decorations must not cover text.
- Card variants should create real anime diary material language rather than only changing shadows.
- Existing reading hierarchy remains intact.
- Mobile cards must stay within the viewport.

## Cleanup

The old shared white-card shell was removed from `global.css` and replaced by `cards.css`.

