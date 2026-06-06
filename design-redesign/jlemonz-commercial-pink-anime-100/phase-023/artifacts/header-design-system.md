# Phase 023 Header Design System

## Purpose

Phase 023 upgrades the ordinary header into a pink anime HUD top bar. The goal is to make the first persistent component feel like part of the Sailei diary world, while keeping navigation semantic and usable.

## Component Parts

### Brand Plaque

- Keeps the real link to `/index.html`.
- Uses a circular pink mark and compact nameplate.
- Adds a small `SYNC` status badge on larger screens.

### Whisper Bubble

- Adds the line `赛蕾：今日也把线索贴好。`
- Uses a dashed pink speech-bubble surface.
- Wraps on mobile without forcing horizontal scroll.

### Sticker Navigation

- Keeps every nav item as an anchor.
- Adds decorative numeric labels and active spark.
- Active route still uses `aria-current="page"`.
- Desktop keeps all nav items on a single row at 1280.

### HUD Tool Buttons

- Search and theme controls remain native `button` elements.
- Icon glyphs are decorative and use `aria-hidden="true"`.
- Buttons keep `aria-label`.

## Files

- `src/components/Header.astro`
- `src/styles/header.css`
- `src/data/headerRules.ts`
- `src/styles/global.css`
- `src/layouts/BaseLayout.astro`

## Design Notes

- Header styles were moved out of `global.css` to reduce future conflicts.
- Phase 024 can now focus only on mobile navigation behavior.
- No site body component was redesigned in this phase.

