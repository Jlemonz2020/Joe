# Phase 009 asset optimization rules

## Image rules

- Prefer WebP or AVIF derivatives for production imagery
- Keep JPEG for photographs when it is smaller and visually acceptable
- Do not use raw multi-megabyte PNG files above the fold
- Generate responsive image variants for hero/background assets
- Set explicit `width` and `height` on `<img>`
- Use `loading="lazy"` below the fold
- Use `fetchpriority="high"` only for the true critical hero image
- Keep decorative background images out of the semantic image tree

## Suggested image tiers

| Use | Target width | Target size |
|---|---:|---:|
| Mobile hero/background | 900 px | 180 KB to 320 KB |
| Desktop hero/background | 1600 px | 350 KB to 700 KB |
| Ultra-wide background | 2200 px | 700 KB to 1 MB |
| Avatar/profile | 320 px | 40 KB to 90 KB |
| Polaroid moment thumbnail | 640 px | 80 KB to 180 KB |
| Small sticker/empty-state art | 512 px | 40 KB to 140 KB |

## CSS rules

- Use shared tokens
- Avoid duplicate component experiments in production CSS
- Avoid large base64 assets in CSS
- Avoid `transition: all`
- Use cascade layers or clear file organization later
- Keep decorative CSS understandable enough to prune

## JavaScript rules

- Prefer Astro static HTML and small progressive scripts
- Do not ship a large runtime for simple interactions
- Keep search overlay, theme switch, comments, reactions, and GitHub grid modular
- Debounce search
- Avoid layout reads during render
- Batch DOM reads and writes when measurement is unavoidable

## Font rules

- Use system Chinese-friendly body stack unless a later phase justifies local font files
- Decorative display font is optional and must not carry body copy
- If local fonts are used, preload only critical fonts and use `font-display: swap`

## Generated image rules

- Phase 006 concept images are references, not production assets
- New imagegen assets must be saved locally with prompts
- Every production image needs source, purpose, dimensions, and compressed size recorded
