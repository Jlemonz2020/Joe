# Phase 032 Verification Notes

## Commands

- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- static scan for debug, sensitive, hard black, and technical markers
- old Hero copy scan scoped to `HomeHero` and home metadata
- source scan for new copy
- built output scan for new copy
- static route matrix with `python3 -m http.server`
- Playwright copy inspection with system Microsoft Edge
- screenshot file existence check
- project-source and dist-snapshot checksum generation

## Results

- Typecheck passed.
- Astro build passed and generated 8 static pages.
- Audit reported 0 vulnerabilities.
- Static scan found 0 matches.
- Old Hero copy scan found 0 matches.
- Source scan confirmed new copy in source.
- Build scan confirmed new copy in rendered output.
- Route matrix returned 200 for legacy routes and `/status-lab.html`.
- Browser inspection passed at 390, 1280, and 1920 widths.
- Browser inspection found no horizontal overflow.
- Button text was not clipped at tested widths.
- Screenshot files exist for 390, 1280, and 1920 widths.
- Snapshot exclusion check found 0 forbidden copied paths.

## Browser Summary

```text
home-copy-390: overflow=false heroTextLength=219 buttons=NOTE 翻笔记 | MOMENT 看瞬间 | TASK 看项目
home-copy-1280: overflow=false heroTextLength=219 buttons=NOTE 翻笔记 | MOMENT 看瞬间 | TASK 看项目
home-copy-1920: overflow=false heroTextLength=219 buttons=NOTE 翻笔记 | MOMENT 看瞬间 | TASK 看项目
```

## Screenshots

- `screens/home-copy-390.png`
- `screens/home-copy-1280.png`
- `screens/home-copy-1920.png`

## Remaining Risk

The lower homepage cards still carry Phase 017-028 placeholder-level structure. They are intentionally left for later homepage phases.
