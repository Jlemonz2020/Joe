# Phase 031 Verification Notes

## Commands

- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- static scan for debug, sensitive, hard black, and raw technical markers
- source scan for Hero wiring
- built output scan for rendered Hero structure
- static route matrix with `python3 -m http.server`
- Playwright home Hero inspection with system Microsoft Edge
- screenshot file existence check
- project-source and dist-snapshot checksum generation

## Results

- Typecheck passed.
- Astro build passed and generated 8 static pages.
- Audit reported 0 vulnerabilities.
- Static scan found 0 matches.
- Source scan confirmed `HomeHero`, home page wiring, CSS import, and Hero selectors.
- Build scan confirmed rendered Hero classes, watermark, companion card, and Sailei line.
- Route matrix returned 200 for legacy routes and `/status-lab.html`.
- Browser inspection passed at 390, 1280, and 1920 widths.
- Browser inspection found no horizontal overflow.
- Screenshots exist for 390, 1280, and 1920 widths.
- Snapshot exclusion check found 0 forbidden copied paths.

## Browser Summary

```text
home-hero-390: title=Jlemonz choices=3 companion=true portrait=true overflow=false heroHeight=1188 firstModuleTop=1513
home-hero-1280: title=Jlemonz choices=3 companion=true portrait=true overflow=false heroHeight=672 firstModuleTop=891
home-hero-1920: title=Jlemonz choices=3 companion=true portrait=true overflow=false heroHeight=672 firstModuleTop=907
```

## Screenshots

- `screens/home-hero-390.png`
- `screens/home-hero-1280.png`
- `screens/home-hero-1920.png`

## Remaining Risk

The Hero structure is in place, but copy and deeper decorative layering are intentionally left to later phases. The current version should be treated as a strong structural pass, not final homepage polish.
