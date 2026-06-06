# Asset Usage Policy

## Allowed Production Sources

- Existing `/assets/brand/*` files.
- Existing `/assets/sailei/*` files.
- New assets generated locally by `imagegen`, only after a later asset review phase accepts them.
- New locally created CSS/SVG/code-native decorative elements that do not copy external art.

## Disallowed Sources

- Hotlinked external images.
- Unclear copyright images from social platforms, blogs, wallpaper sites, or random repositories.
- Generated Phase 006 concept images as direct production character replacements.
- Any asset that requires hidden credentials or private URLs to render.

## Generated Concept Images

Phase 006 concept images are allowed as visual references only:

- `concept-01-diary-desk.png`
- `concept-02-galgame-main.png`
- `concept-03-sticky-feed.png`
- `concept-04-pink-hud-board.png`

They can guide composition, component language, and color mood. They should not be copied into the production website as final art without a later review.

## Naming Rules For Future Assets

Future generated or optimized assets should use:

```text
/assets/generated/sailei-diary-{purpose}-{width}.{ext}
/assets/generated/sticker-{name}-{width}.{ext}
/assets/generated/empty-{state}-{width}.{ext}
```

Examples:

- `/assets/generated/sailei-diary-hero-1600.webp`
- `/assets/generated/sticker-linux-320.webp`
- `/assets/generated/empty-projects-640.webp`

## Performance Rules

- Above-fold image target: under 900 KB.
- Above-fold image hard limit: 1.4 MB.
- First-view transfer target: under 1.4 MB.
- First-view transfer hard limit: 2.2 MB.
- Avoid using `image1.png` and `image2.png` in first-view production layouts until optimized.

## Design Rules

- Existing Sailei assets are the identity anchor.
- The anime feeling should come from component language, not only one large background image.
- Pink diary composition should prefer milk-white glass, sticker layers, polaroid frames, tape, ticket edges, and soft HUD lines.
- Optional aqua/violet/amber assets can be accents but must not overpower the default pink direction.
