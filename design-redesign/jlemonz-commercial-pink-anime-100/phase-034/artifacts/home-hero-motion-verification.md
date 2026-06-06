# Phase 034 Verification Notes

## Commands

- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- static scan for debug, sensitive, hard black, and technical markers
- source scan for Hero motion keyframes and media rules
- built output scan for Hero motion keyframes and media rules
- static route matrix with `python3 -m http.server`
- Playwright Hero motion inspection with system Microsoft Edge
- reduced-motion Playwright inspection
- screenshot file existence check
- project-source and dist-snapshot checksum generation

## Results

- Typecheck passed.
- Astro build passed and generated 8 static pages.
- Audit reported 0 vulnerabilities.
- Static scan found 0 matches.
- Source scan confirmed keyframes and reduced-motion rules.
- Build scan confirmed keyframes in built CSS.
- Route matrix returned 200 for legacy routes and `/status-lab.html`.
- Browser inspection passed at 390, 1280, and 1920 widths.
- Browser inspection found no horizontal overflow.
- Browser inspection confirmed Hero animations in no-preference mode.
- Browser inspection confirmed Hero animations are `none` in reduced-motion mode.
- Browser inspection confirmed body background position does not change after scroll.
- Screenshot files exist for 390, 1280, 1920, and reduced-motion 390.
- Snapshot exclusion check found 0 forbidden copied paths.

## Browser Summary

```text
home-motion-390: mode=no-preference dialog=home-hero-panel-in choice=home-hero-choice-in hud=home-hero-hud-breathe reduceDot=home-hero-status-dot overflow=false
home-motion-1280: mode=no-preference dialog=home-hero-panel-in choice=home-hero-choice-in hud=home-hero-hud-breathe reduceDot=home-hero-status-dot overflow=false
home-motion-1920: mode=no-preference dialog=home-hero-panel-in choice=home-hero-choice-in hud=home-hero-hud-breathe reduceDot=home-hero-status-dot overflow=false
home-motion-reduce-390: mode=reduce dialog=none choice=none hud=none reduceDot=none overflow=false
```

## Screenshots

- `screens/home-motion-390.png`
- `screens/home-motion-1280.png`
- `screens/home-motion-1920.png`
- `screens/home-motion-reduce-390.png`

## Remaining Risk

The motion has not been measured on the Pi5 GPU yet because the Astro build is still local and not deployed. The CSS intentionally avoids heavy layout animation to reduce that risk.
