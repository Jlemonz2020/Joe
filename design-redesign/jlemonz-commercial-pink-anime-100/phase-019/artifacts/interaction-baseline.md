# Phase 019 Interaction Baseline

## Purpose

Phase 019 defines the first accessibility and interaction baseline for the Astro rebuild. The pink anime diary components must remain real website controls: links navigate, buttons act, decorative marks stay decorative, and keyboard users can find the active surface.

## Source Files

- `src/styles/interaction.css`
- `src/data/interactionRules.ts`
- `src/components/Header.astro`
- `src/layouts/BaseLayout.astro`

## Rules Added

### Navigation

- Main navigation stays as real anchor elements.
- Current page is marked with `aria-current="page"`.
- Brand link keeps an explicit `aria-label`.
- The skip link remains available before the header.

### Icon Buttons

- Header action controls use `button type="button"`.
- Icon-only controls require meaningful `aria-label` text.
- Decorative icon glyphs are wrapped with `aria-hidden="true"`.

### Focus

- Global focus remains visible through the existing `:focus-visible` rule.
- Phase 019 adds shared focus token sizing for future components.
- No `outline: none` or `outline-none` pattern is allowed.

### Touch Targets

- Buttons and navigation links use at least `2.75rem`.
- Coarse pointer devices use at least `3rem`.
- Global `touch-action: manipulation` remains present from the base CSS.

### Future Panels

- Future modal, drawer, and search panel shells get `overscroll-behavior: contain`.
- Phase 019 does not implement the search panel yet; it only reserves the baseline class behavior.

### Custom Controls

- Prefer native `button`, `a`, `input`, and `dialog` elements.
- `role="button"` is not a default styling target.
- Decorative anime layers must not replace semantic controls.

## Out of Scope

- No full component redesign.
- No search modal implementation.
- No live deployment.
- No backend, database, admin, or Nginx changes.

