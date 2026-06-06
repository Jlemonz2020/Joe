# Phase 033 Verification Notes

## Commands

- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- static scan for debug, sensitive, hard black, and technical markers
- source scan for decorative layer selectors
- built output scan for rendered decorative markup
- static route matrix with `python3 -m http.server`
- Playwright Hero decoration inspection with system Microsoft Edge
- screenshot file existence check
- project-source and dist-snapshot checksum generation

## Results

- Typecheck passed.
- Astro build passed and generated 8 static pages.
- Audit reported 0 vulnerabilities.
- Static scan found 0 matches.
- Source scan confirmed Hero decorative selectors and markup.
- Build scan confirmed rendered decorative markup.
- Route matrix returned 200 for legacy routes and `/status-lab.html`.
- Browser inspection passed at 390, 1280, and 1920 widths.
- Browser inspection found no horizontal overflow.
- Browser inspection confirmed desktop stickers visible and mobile stickers hidden.
- Browser inspection confirmed Hero glow, dialogue texture, and portrait texture are present.
- Screenshot files exist for 390, 1280, and 1920 widths.
- Snapshot exclusion check found 0 forbidden copied paths.

## Browser Summary

```text
home-decor-390: decor=true hudLines=2 stickers=none,none fixedBodyPosition=64% 48% overflow=false
home-decor-1280: decor=true hudLines=2 stickers=flex,flex fixedBodyPosition=78% 48% overflow=false
home-decor-1920: decor=true hudLines=2 stickers=flex,flex fixedBodyPosition=82% 48% overflow=false
```

## Screenshots

- `screens/home-decor-390.png`
- `screens/home-decor-1280.png`
- `screens/home-decor-1920.png`

## Fix During Phase

The first pass used negative pseudo-element insets for glow. It caused horizontal overflow at 1280 width. The glow was moved inside the Hero bounds, then the browser check passed.

The first diagonal HUD line was also too visible. It was reduced so text and cards stay primary.
