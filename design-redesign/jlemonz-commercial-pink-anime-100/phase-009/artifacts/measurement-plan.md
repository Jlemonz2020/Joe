# Phase 009 measurement plan

## Local file checks

Use:

```bash
du -ah dist | sort -h | tail -40
find dist -type f -printf "%s %p\n" | sort -nr | head -40
```

Check:

- Largest images
- CSS size
- JavaScript size
- HTML size
- Unexpected source maps
- Unused generated files

## Route checks

Use:

```bash
curl -k -I https://127.0.0.1:8086/
curl -k -I https://127.0.0.1:8086/assets/style.css
curl -k https://127.0.0.1:8086/api/health
```

For local previews, replace host and port with the preview server.

## Browser checks

Use Playwright in later phases to capture:

- 390 px
- 768 px
- 1280 px
- 1920 px
- 2560 px
- 3840 px

Inspect:

- Console errors
- Network failures
- Horizontal scroll
- Long tasks if available
- Image loading failures
- Text overlap

## Budget report template

Each implementation phase should record:

| Metric | Result | Budget | Pass |
|---|---:|---:|---|
| CSS raw size | TBD | 220 KB target | TBD |
| JS raw size | TBD | 90 KB target | TBD |
| Above-fold image bytes | TBD | 900 KB target | TBD |
| First-view total | TBD | 1.4 MB target | TBD |
| Console errors | TBD | 0 | TBD |
| Horizontal scroll | TBD | 0 | TBD |

## Performance acceptance

The redesign can be visually rich if:

- No huge raw image is required for first paint
- Mobile stacks before overlap
- Animation stays compositor-friendly
- Empty/error states render without blocking
- API failures do not leave broken UI
