# Phase 010 screenshot standard

## Required widths

Every visual implementation checkpoint must use:

- 390 px
- 768 px
- 1280 px
- 1920 px
- 2560 px
- 3840 px

## Height rules

Use these viewport heights unless the phase needs a specific page section:

| Width | Height |
|---:|---:|
| 390 | 844 |
| 768 | 1024 |
| 1280 | 900 |
| 1920 | 1080 |
| 2560 | 1440 |
| 3840 | 2160 |

## Screenshot naming

Use:

```text
phase-XXX/screens/{page}-{width}.png
phase-XXX/screens/{page}-{width}-after-fix.png
```

Examples:

```text
phase-040/screens/home-390.png
phase-040/screens/home-1920.png
phase-050/screens/moments-1280-after-fix.png
```

## What to inspect

For each screenshot, inspect:

- Header fits
- No horizontal scroll
- Text does not overlap
- Buttons and chips do not wrap awkwardly
- Images do not hide important text
- Cards do not overflow
- Background is stable
- Large screens have intentional composition
- Mobile screens show one clear path

## Full-page versus viewport

Use viewport screenshots for first-screen and layout checks.

Use full-page screenshots when checking:

- Footer
- Long articles
- Long moments feed
- Search overlay after scroll
- Comments

## Visual failure severity

| Severity | Meaning | Action |
|---|---|---|
| P0 | Broken route, blank page, unreadable main content | Fix before continuing |
| P1 | Layout overlap, horizontal scroll, blocked interaction | Fix before continuing |
| P2 | Visual mismatch, weak anime feeling, awkward spacing | Fix in phase unless documented |
| P3 | Minor polish issue | May defer with note |

## Concept comparison

When comparing to Phase 006 images:

- Match structure and feeling
- Replace generated text with real copy
- Do not copy generated character art
- Do not chase exact pixels if it hurts responsive usability
