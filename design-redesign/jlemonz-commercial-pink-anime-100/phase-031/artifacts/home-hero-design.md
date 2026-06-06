# Phase 031 Home Hero Design

## Goal

Phase 031 rebuilds the home Hero structure so the first screen reads as a pink Sailei diary desk instead of a generic text panel over a background.

## Reference

Primary reference:

- `phase-006/screens/concept-01-diary-desk.png`

Blended reference:

- `phase-006/screens/concept-02-galgame-main.png`

The implementation follows the image-to-frontend handoff from Phase 007, but does not pause for new image selection because Phase 006 already selected the primary visual direction.

## Component

Primary component:

- `src/components/HomeHero.astro`

Supporting style:

- `src/styles/home-hero.css`

Page wiring:

- `src/pages/index.astro`
- `src/layouts/BaseLayout.astro`

## Structure

The Hero now has:

- large Sailei whisper dialogue panel
- `DIARY DESK` soft watermark
- three quick-choice sticker buttons
- Sailei companion profile card
- local Sailei portrait asset
- three compact status chips

The lower homepage FILE cards remain unchanged. They belong to later homepage phases.

## Visual Decisions

- Keep the whole Hero light, pink, and milk-white.
- Use the local Sailei image as a real companion card, not an external generated asset.
- Add a galgame-style nameplate and status chip.
- Use quick-choice buttons sparingly as navigation, not as a game menu replacement.
- Keep the first module row visible on desktop to hint at more content below.

## Boundary

This phase only changes the home Hero structure. Phase 032 will handle copy refinement. Phase 033 and Phase 034 will deepen Hero background layers and motion.
