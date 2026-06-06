# Phase 034 Home Hero Motion

## Goal

Phase 034 adds restrained Hero motion that feels like a diary page opening, not an advertising landing page.

## Motion Added

- Hero panels enter with a small vertical lift.
- Hero copy fades in with a short stagger.
- Quick-choice sticker buttons lightly pop in.
- HUD lines breathe softly.
- The online status dot pulses.
- The portrait frame glow breathes slowly.

## Reduced Motion

When `prefers-reduced-motion: reduce` is active, all Hero-local animations are disabled through a scoped rule:

```css
.home-hero,
.home-hero *,
.home-hero *::before,
.home-hero *::after
```

This keeps the rest of the page available while honoring reduced-motion preferences.

## Performance Boundary

The animation uses opacity, transform, and lightweight opacity changes. The global Sailei background is not animated and does not move on scroll.

## Boundary

This phase only changes Hero motion CSS. It does not change Hero text, layout, static routes, or lower homepage modules.
