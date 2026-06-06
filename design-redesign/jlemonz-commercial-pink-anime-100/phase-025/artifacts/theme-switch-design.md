# Phase 025 Theme Switch Design

## Stage Goal

Implement a stable theme switching system for the Astro rebuild while keeping the default experience firmly in the pink Sailei diary direction.

## Theme Set

The switcher exposes three light/pink themes:

- `sailei-pink-diary`: default, strongest Sailei diary identity.
- `sakura-light`: softer sakura paper mood.
- `paper-milk`: warmer milk-paper reading mood.

The existing `pink-neon-lite` token remains available in the token registry for future module-specific accents, but it is not exposed in the Phase 025 switcher because the manual asks for default pink plus two lightweight alternates.

## Interaction Pattern

The chosen UI is a direct swatch strip in the Header:

- No dark terminal option.
- No popover or overlay that can cover content.
- Each swatch is a real button.
- Each swatch has a visible color dot and a screen-reader label.
- `aria-pressed` marks the active theme.
- The theme persists with localStorage key `jlemonz:theme:v1`.

This pattern keeps the theme feature immediately discoverable while staying compatible with Phase 024 mobile navigation.

## Boot Strategy

`BaseLayout.astro` now includes a small head script that reads the saved theme before page interaction and applies it to `document.documentElement.dataset.theme`. This reduces theme flash.

The footer script then:

- sets the final HTML and body `data-theme`;
- updates `meta[name="theme-color"]`;
- updates every swatch button's `aria-pressed`;
- saves valid choices to localStorage;
- ignores invalid saved theme ids and falls back to `sailei-pink-diary`.

## Files Changed

- `src/components/Header.astro`
- `src/data/themeTokens.ts`
- `src/layouts/BaseLayout.astro`
- `src/styles/header.css`
- `src/styles/motion.css`
- `package.json`
- `package-lock.json`

## Tooling Note

`playwright-core` was added as a devDependency so later phases can run repeatable browser checks against the installed system Microsoft Edge without downloading a bundled browser.

