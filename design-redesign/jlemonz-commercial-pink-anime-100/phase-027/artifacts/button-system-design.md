# Phase 027 Button System Design

## Stage Goal

Create a reusable pink diary button and icon system so later phases do not invent separate button styles for search, theme, comments, reactions, and project actions.

## Button Families

- `ui-button--tool`: search, contact, utility actions.
- `ui-button--swatch`: theme selection and future color/state pickers.
- `ui-button--sticker`: playful navigation or primary diary actions.
- `ui-button--status`: sync, trace, daily, comment, or reaction states.
- `ui-button--icon`: icon-sized control with target sizing and tooltip support.

## Design Direction

The system keeps a soft pink anime diary language:

- milk-glass backgrounds;
- pink borders;
- cyan focus accents;
- restrained glow;
- icon-first controls;
- concise tooltips on hover/focus for desktop;
- no mobile tooltip overlays.

## Integration

Current integrations:

- `SearchEntry.astro` submit button uses `ui-button ui-button--icon ui-button--tool`.
- Header theme swatches use `ui-button ui-button--icon ui-button--swatch`.
- Old unused `header-tool` styling was removed.

## Future Use

Later phases should reuse these classes before adding new button CSS. If a future button needs a new variant, it should be added to `buttonRules.ts` first.

