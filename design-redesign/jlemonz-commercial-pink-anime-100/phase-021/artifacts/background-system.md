# Phase 021 Background System

## Purpose

Phase 021 implements the first real visual layer of the pink Sailei diary redesign: a fixed character background with a soft pink readability wash and subtle paper texture.

## Files

- `public/assets/sailei/sailei-main.jpg`
- `src/styles/background.css`
- `src/data/backgroundRules.ts`
- `src/layouts/BaseLayout.astro`

## Layer Model

### Layer 1: Fixed Character

- Implemented with `body::before`.
- Uses `/assets/sailei/sailei-main.jpg`.
- Uses `position: fixed` and `inset: 0`.
- Does not attach to a scrolling section.
- Uses low opacity so it reads as atmosphere, not wallpaper noise.

### Layer 2: Pink Readability Wash

- Implemented with `body::after`.
- Uses pink and milk gradients to protect text readability.
- Keeps the site bright and diary-like.
- Avoids black terminal mood.

### Layer 3: CSS Paper Texture

- Implemented with CSS grid lines, not bitmap texture.
- Gives the page a diary paper surface.
- Kept subtle so it does not fight text.

### Layer 4: Content Plane

- `skip-link`, `site-header`, and `page-shell` are explicitly above the fixed layers.
- Pointer events are disabled on the background layers.

## Responsive Rules

- Mobile lowers character opacity and uses a stronger vertical wash.
- Desktop shows more of the Sailei identity.
- Wide desktop shifts the focal point right so the composition does not feel empty.
- Phase 022 will perform the full 390/768/1280/1920/2560/3840 image optimization matrix.

## Guardrails

- Background must not move with scroll.
- Background must not create horizontal scroll.
- Background must not hide text.
- Background must not darken the site into a terminal theme.
- Later decorative layers must preserve `pointer-events: none`.

