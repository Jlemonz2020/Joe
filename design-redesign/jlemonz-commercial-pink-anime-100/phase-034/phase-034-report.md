# Phase 034 Report - Home Hero Motion

## Status

`approved`

## Scope

Phase 034 added restrained Hero motion and a reduced-motion override. The global background remains static, and Hero copy/layout remain unchanged.

## Files Changed In Project Snapshot

- `src/styles/home-hero.css`

## Design Decision

The motion uses short panel and copy entrance animations, small sticker pop-in, slow HUD breathing, and a pulsing status dot. It avoids parallax, large shifts, or constant heavy motion.

## Verification Evidence

- `artifacts/typecheck-output.txt`
- `artifacts/build-output.txt`
- `artifacts/npm-audit.txt`
- `artifacts/static-scan.txt`
- `artifacts/home-motion-source-scan.txt`
- `artifacts/home-motion-built-scan.txt`
- `artifacts/static-route-matrix.txt`
- `artifacts/home-hero-motion-check-output.txt`
- `artifacts/home-hero-motion-summary.txt`
- `artifacts/screenshot-file-check.txt`
- `artifacts/project-source-exclusion-check.txt`

## Screenshots

- `screens/home-motion-390.png`
- `screens/home-motion-1280.png`
- `screens/home-motion-1920.png`
- `screens/home-motion-reduce-390.png`

## Audit Result

Approved. Hero motion is present in normal mode, disabled in reduced-motion mode, and verified without horizontal overflow.

## GitHub Push Verification

Pending first push.
