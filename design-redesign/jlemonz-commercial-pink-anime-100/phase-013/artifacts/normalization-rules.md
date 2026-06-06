# Normalization Rules

## Field Conversion

- `id` and `slug` become safe frontend string identifiers.
- `created_at` and `createdAt` both become `createdAt`.
- `updated_at` and `updatedAt` both become `updatedAt`.
- `image_url`, `cover_url`, `imageUrl`, and `coverUrl` become camelCase media fields.
- `summary`, `excerpt`, and `description` are accepted where relevant.
- `author` and `nickname` are accepted for comment author display.

## Lists

The list normalizer accepts these shapes:

- raw array
- `{ items: [] }`
- `{ results: [] }`
- `{ rows: [] }`
- `{ data: [] }`

## Tags

- API arrays are filtered to non-empty strings.
- Comma-separated strings are split by English or Chinese commas.
- Unknown values become an empty array.

## Progress

- Numeric strings are accepted.
- Values below `0` become `0`.
- Values above `100` become `100`.

## Links

- Missing post IDs fall back to `/archive.html`.
- Missing project IDs fall back to `/projects.html`.
- Search items prefer API-provided `href`; otherwise they fall back to the post legacy URL.

## Empty State

- Empty API lists remain empty lists.
- Adapter status marks them as `empty`.
- UI phases must render designed Sailei empty states instead of debug copy.

## Error State

- Failed fetches use fallback data.
- Adapter status marks them as `error`.
- Adapter source becomes `fallback`.
- UI phases must keep the message human and themed, not technical.
