# Phase 033 Home Hero Decoration

## Goal

Phase 033 adds Hero atmosphere without changing the Phase 031 structure or Phase 032 copy.

## Added Layers

- Hero-level soft glow field
- Hero-level HUD grid mask
- two decorative HUD lines
- two desktop-only sticker chips: `PI5` and `LINUX`
- richer dialogue paper texture
- faint dialogue diagonal HUD line
- portrait-frame grid and inner glow

## Responsive Rules

- Decorative stickers are hidden below 900px.
- Glow layers stay inside the Hero bounds to avoid horizontal overflow.
- Text and cards remain above decorative layers.
- The global Sailei background remains fixed through `body::before`.

## Design Decision

The decoration is deliberately soft. The goal is a pink diary desk with paper texture and HUD hints, not a dense dashboard or black terminal panel.

## Boundary

This phase only changes Hero decorative layers and background styling. Hero copy, layout, lower homepage modules, and page data are unchanged.
