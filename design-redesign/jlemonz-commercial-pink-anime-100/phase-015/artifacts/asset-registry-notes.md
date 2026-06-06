# Asset Registry Notes

## Code Artifact

Phase 015 adds:

- `src/data/assetRegistry.ts`

The registry defines:

- `AssetFamily`
- `AssetUse`
- `SiteAsset`
- `siteAssets`
- `productionAssets`
- `optimizationQueue`

## Why This Exists

Later visual phases should import from a single known registry instead of scattering string paths across components. This keeps asset decisions reviewable and prevents accidental use of oversized or unclear-source files.

## Initial Buckets

### Production

Small and moderate existing brand/Sailei images that can be used directly.

### Needs Optimization

Large legacy PNG files:

- `/assets/sailei/image1.png`
- `/assets/sailei/image2.png`

### Reference Only

Generated concept images from Phase 006. They are not part of `siteAssets` because they are archive references, not live site assets.

## Next Use

Phase 016 can use `productionAssets` when creating theme tokens and choosing default background/character roles.
