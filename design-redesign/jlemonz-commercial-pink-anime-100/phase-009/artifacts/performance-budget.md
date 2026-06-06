# Phase 009 performance budget

## Budget goal

Keep the pink anime diary rich while staying comfortable on the Pi5 and mobile browsers.

## Initial load budgets

| Category | Target | Hard limit |
|---|---:|---:|
| HTML per page | 80 KB | 150 KB |
| CSS shipped initially | 220 KB raw | 320 KB raw |
| JavaScript shipped initially | 90 KB raw | 160 KB raw |
| Above-fold image bytes | 900 KB | 1.4 MB |
| Total first-view transfer | 1.4 MB | 2.2 MB |
| Fonts | 1 display font max | 2 files max |
| API calls on first page | 4 | 7 |
| Third-party requests | 0 | 0 unless approved |

These are raw-file budgets for local inspection. Later browser audits can add gzip/Brotli and Lighthouse-style metrics.

## Runtime budgets

| Category | Rule |
|---|---|
| Animation | Only `transform` and `opacity` for routine transitions |
| Layout | No JavaScript measurement loops for layout |
| Lists | More than 50 visible items need pagination, lazy rendering, or `content-visibility` |
| Images | Below-fold images lazy-load |
| Background | Fixed but not parallax |
| Search | Debounce input and show loading/empty states |
| Theme switch | Token swap only, no layout re-render |

## Visual richness budget

Allowed richness:

- Paper grain through CSS or tiny optimized texture
- Tape corners through CSS/SVG
- Sticker borders and shadows
- Polaroid frames through CSS
- Soft HUD lines
- Small status lights
- Optimized local Sailei imagery

Disallowed richness:

- Heavy particle systems
- Large video background
- External animation library by default
- Remote fonts from CDN
- Hotlinked anime imagery
- Large raw PNGs in the first viewport

## Budget failure rules

If a later phase exceeds a hard limit:

1. Record the failure in that phase report
2. Optimize before moving on
3. If the phase cannot meet the budget, write a tradeoff note and pause only if the tradeoff changes visual direction or deployment risk
