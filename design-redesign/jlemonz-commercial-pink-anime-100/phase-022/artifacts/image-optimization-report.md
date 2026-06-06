# Phase 022 Image Optimization Report

## Tooling

- Used: Python Pillow.
- No new npm dependency was added.
- No system package was installed.

## Results

| Asset | Size | Purpose |
|---|---:|---|
| `sailei-bg-1280.webp` | 109,492 bytes | Mobile/small background |
| `sailei-bg-1280.jpg` | 152,082 bytes | Mobile/small fallback |
| `sailei-bg-1920.webp` | 212,810 bytes | Desktop background |
| `sailei-bg-1920.jpg` | 312,252 bytes | Desktop fallback |
| `sailei-bg-2560.webp` | 305,212 bytes | Wide background |
| `sailei-bg-2560.jpg` | 492,327 bytes | Wide fallback |
| `sailei-main.jpg` | 860,962 bytes | Original source material |

## Impact

The default runtime background can now use a 109 KB WebP on small screens instead of the 861 KB original. Desktop can use the 213 KB WebP, and wide screens can use the 305 KB WebP.

## Notes

- The 3840 screenshot uses the 2560 candidate with constrained sizing rather than forcing a huge full-cover upscale.
- The original file is preserved because future Phase 094 performance work may choose a different codec or art direction.

