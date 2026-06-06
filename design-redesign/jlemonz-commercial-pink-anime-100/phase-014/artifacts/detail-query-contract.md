# Detail Query Contract

## Accepted Query Keys

- `id`
- `slug`

If both exist, `id` wins. This matches the current old-link habit while leaving a clean slug path for future content.

## Empty Query Behavior

When neither `id` nor `slug` exists:

- The page stays on the static detail route.
- The detail mount displays a soft empty state.
- No backend, database, or Nginx change is required.

## Future Rendering Hook

Later phases can attach the detail API adapter to the mount by reading:

- `data-detail-kind`
- `data-detail-id`
- `data-api-path`

This avoids scattering query parsing across multiple visual components.
