# Phase 032 Cleanup

## Removed Or Avoided

- Removed old Hero wording from `HomeHero` and home metadata.
- No temporary server process left on ports 4415 or 4416.
- No copied `node_modules`.
- No copied `.astro`.
- No copied working `dist` inside the source snapshot.
- No debug statements or sensitive strings found by the static scan.

## Snapshot Policy

The phase archive keeps:

- project source snapshot excluding heavy generated directories
- built `dist` snapshot
- 390, 1280, and 1920 screenshots
- copy verification output
- route matrix
- checksums and file lists

## Next Phase Entry

Phase 033 can add Hero background layers and decoration while preserving the Phase 032 copy.
