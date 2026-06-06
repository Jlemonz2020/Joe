# Typography system

## Goal

Phase 017 defines the reading rhythm for the pink Sailei diary site. The typography should feel like a technical diary with anime presentation, not a poster or an enterprise dashboard.

## CSS artifact

`src/styles/typography.css` defines:

- `--font-body`
- `--font-heading`
- `--text-hero`
- `--text-page-title`
- `--text-section-title`
- `--text-card-title`
- `--text-body`
- `--text-lead`
- `--text-meta`
- `--line-tight`
- `--line-heading`
- `--line-body`
- `--line-caption`
- `--measure-lead`
- `--measure-body`
- `--measure-card`

## Rules

- Body copy uses readable Chinese sans-serif fonts.
- Body copy uses `1rem` with `1.72` line height.
- Hero title uses rem-based breakpoints, not viewport-scaled font size.
- Lead copy is limited to `46ch`.
- Card copy is limited to `58ch`.
- Body copy is limited to `68ch`.
- Long text uses `overflow-wrap: anywhere`.
- Headings use `text-wrap: balance`.
- Paragraphs use `text-wrap: pretty`.
- Numbers and timestamps use tabular numbers.
- Letter spacing remains `0`.

## Breakpoints

- Mobile default: `--text-hero: 2.75rem`
- `768px`: `--text-hero: 4.5rem`
- `1280px`: `--text-hero: 5.25rem`

These breakpoints avoid continuous viewport font scaling.

## Design note

Typography should support the pink diary component language. Decoration belongs in panels, stickers, tape, ticket edges, and image treatment, not in hard-to-read body fonts.
