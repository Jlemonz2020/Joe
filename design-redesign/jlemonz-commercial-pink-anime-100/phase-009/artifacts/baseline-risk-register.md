# Phase 009 baseline risk register

## Current baseline evidence

Phase 002 recorded current live asset sizes:

| Asset | Size |
|---|---:|
| `/assets/style.css` | 193,858 bytes |
| `/assets/app.js` | 59,104 bytes |
| `/assets/sailei/sailei-main.jpg` | 860,962 bytes |
| `/assets/sailei/image1.png` | 3,339,452 bytes |
| `/assets/sailei/image2.png` | 6,329,711 bytes |
| `/assets/sailei/violet-hero-1600.jpg` | 287,418 bytes |
| `/assets/sailei/light-1400.jpg` | 162,670 bytes |
| `/assets/sailei/aqua-hero-1600.jpg` | 157,380 bytes |

## Risks

| Risk | Impact | Budget response |
|---|---|---|
| Large PNG assets | Slow first view and high memory use | Do not place multi-megabyte PNGs in critical path without resizing or converting |
| Rich component system | CSS can grow beyond control | Use tokenized component CSS and prune dead experiments |
| Generated concept density | Implementation may over-render on mobile | Mobile-first stacking and side-panel removal |
| Background image | Can hurt readability and LCP | Use optimized hero/background variants and overlays |
| Animation | Can jank on Pi5 | CSS-only transform/opacity, reduced motion, no heavy animation library |
| Search/comments/API widgets | Can create long network idle waits | Progressive enhancement and empty/error states |

## Baseline conclusion

The visual direction is feasible if production implementation avoids using the largest current PNGs as above-the-fold assets. The redesign should use optimized local derivatives of existing Sailei images, not raw large images.
