# Phase 002 Baseline Summary

## Current Online State

- Public site is reachable at `https://192.168.31.248:8086/`.
- Main legacy URLs return `200`.
- Core APIs return `200`, including search, comments, and reactions.
- Posts are empty.
- Projects are empty.
- Moments has one item.
- GitHub contributions API returns data.

## Visual Baseline

Ten screenshots were captured:

- seven main legacy page states at 1280 width
- index duplicate route at 1280 width
- homepage mobile baseline at 390 width
- homepage wide baseline at 1920 width

## Risks For Future Phases

- Empty posts/projects must be treated as first-class design states.
- Project detail page has a browser baseline issue: `networkidle` timeout plus one 404 resource error.
- Existing large PNG assets should be optimized or replaced during asset and performance phases.
- Current design baseline remains useful as a comparison point but is not a constraint; the new Astro frontend may discard the existing UI.

## Next Phase

Phase 003 should confirm that Astro can preserve:

- static `.html` route compatibility
- API access through existing Nginx proxy
- static asset references
- no backend/database/admin changes
