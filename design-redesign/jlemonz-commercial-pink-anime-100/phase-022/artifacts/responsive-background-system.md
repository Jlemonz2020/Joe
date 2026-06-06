# Phase 022 Responsive Background System

## Purpose

Phase 022 refines the fixed Sailei background so it remains stable from mobile to ultra-wide desktop and no longer depends on the 841 KB original JPEG as the default runtime asset.

## Image Variants

Generated from the existing `sailei-main.jpg` using Python Pillow:

- `sailei-bg-1280.webp`
- `sailei-bg-1280.jpg`
- `sailei-bg-1920.webp`
- `sailei-bg-1920.jpg`
- `sailei-bg-2560.webp`
- `sailei-bg-2560.jpg`

The original `sailei-main.jpg` remains in the project as source material and compatibility fallback, but the CSS background uses optimized variants through `image-set()`.

## CSS Strategy

- Default: 1280 WebP/JPEG pair.
- `min-width: 1024px`: 1920 WebP/JPEG pair.
- `min-width: 2560px`: 2560 WebP/JPEG pair.
- `max-width: 767px`: lower opacity and stronger vertical wash.
- `min-width: 1600px`: show more character identity without covering content.
- `min-width: 2560px`: avoid full-cover overstretch by constraining the background width.

## Guardrails

- Background remains `position: fixed`.
- Background remains `pointer-events: none`.
- Background does not create horizontal scroll.
- Character art stays behind the content plane.
- Page remains pink and bright, not black-terminal styled.

