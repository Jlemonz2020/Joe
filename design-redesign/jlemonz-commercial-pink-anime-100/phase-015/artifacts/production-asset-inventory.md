# Production Asset Inventory

Source baseline: `phase-002/artifacts/asset-inventory.txt`

## Brand Assets

| Key | Path | Size | Use |
|---|---|---:|---|
| `brand.logo` | `/assets/brand/jlemonz-logo.png` | 23,622 bytes | Production logo |
| `brand.favicon32` | `/assets/brand/favicon-32.png` | 1,127 bytes | Browser favicon |
| `brand.favicon192` | `/assets/brand/favicon-192.png` | 9,158 bytes | Manifest/PWA candidate |
| `brand.appleTouchIcon` | `/assets/brand/apple-touch-icon.png` | 9,684 bytes | Apple touch icon |

## Sailei Assets Ready For Production Use

| Key | Path | Size | Suggested role |
|---|---|---:|---|
| `sailei.main` | `/assets/sailei/sailei-main.jpg` | 860,962 bytes | Primary fixed background candidate |
| `sailei.avatar` | `/assets/sailei/avatar.jpg` | 77,317 bytes | Profile and character card |
| `sailei.hero1600` | `/assets/sailei/hero-1600.jpg` | 109,050 bytes | Hero or section background |
| `sailei.hero1100` | `/assets/sailei/hero-1100.jpg` | 61,922 bytes | Mobile hero fallback |
| `sailei.note1` | `/assets/sailei/note-1.jpg` | 105,580 bytes | Polaroid and sticky-note modules |
| `sailei.note2` | `/assets/sailei/note-2.jpg` | 68,187 bytes | Empty states and dividers |
| `sailei.sideIllustration` | `/assets/sailei/side-illustration.jpg` | 52,913 bytes | Secondary decorative panel |
| `sailei.sidePhoto` | `/assets/sailei/side-photo.jpg` | 107,070 bytes | About/profile insert |
| `sailei.aquaHero` | `/assets/sailei/aqua-hero-1600.jpg` | 157,380 bytes | Cool accent variant |
| `sailei.violetHero` | `/assets/sailei/violet-hero-1600.jpg` | 287,418 bytes | Violet accent variant |
| `sailei.lightHero` | `/assets/sailei/light-1400.jpg` | 162,670 bytes | Paper-milk theme candidate |
| `sailei.amberHero` | `/assets/sailei/amber-hero.jpg` | 86,128 bytes | Warm accent candidate |

## Optimization Queue

| Key | Path | Size | Rule |
|---|---|---:|---|
| `sailei.image1` | `/assets/sailei/image1.png` | 3,339,452 bytes | Do not use above the fold until compressed or converted |
| `sailei.image2` | `/assets/sailei/image2.png` | 6,329,711 bytes | Do not use above the fold until compressed or converted |

## Public Availability Check

All listed public assets returned `HTTP/1.1 200 OK` in `public-asset-heads.txt`.
