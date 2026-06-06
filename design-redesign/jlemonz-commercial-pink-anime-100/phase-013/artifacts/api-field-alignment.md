# API Field Alignment

Phase 013 aligns the frontend model with the real API samples captured in `phase-002/artifacts/api/`.

## Site Texts

Source sample: `site-texts.json`

- `texts`: string dictionary used for page copy and UI labels.
- `rules`: array, currently kept as `unknown[]` because the frontend only needs to preserve it.
- `footerSections`: footer link groups.
- `layout`: object for layout-level config.
- `ui`: object for UI-level config.

Frontend model: `SiteTexts`

## Overview

Source sample: `site-overview.json`

- `stats.posts`: number
- `stats.moments`: number
- `stats.projects`: number
- `stats.categories`: number
- `latestMoments`: array of moment records

Frontend model: `SiteOverview`

## Moments

Source sample: `moments.json`

- `id`: number in API, normalized to string.
- `content`: string.
- `kind`: string such as `life`, normalized to `ContentKind`.
- `tags`: string array; string fallback is also accepted.
- `image_url`: optional upload path, normalized to `imageUrl`.
- `created_at`: optional date string, normalized to `createdAt`.

Frontend model: `Moment`

## Posts

Source sample: `posts.json`

- Current baseline can be empty: `{ "items": [] }`.
- Expected model keeps `id`, `slug`, `title`, `summary`, `category`, `tags`, `coverUrl`, `createdAt`, `updatedAt`, and legacy `href`.
- Empty state must be rendered by components, not by API debug text.

Frontend model: `Post`

## Projects

Source sample: `projects.json`

- Current baseline can be empty: `{ "items": [] }`.
- Expected model keeps `id`, `slug`, `title`, `summary`, `status`, `progress`, `tags`, `coverUrl`, `createdAt`, `updatedAt`, and legacy `href`.
- `progress` is clamped to `0..100`.

Frontend model: `Project`

## Comments

Source sample: `comments.json`

- `target`: string.
- `items`: comment array; baseline can be empty.
- Comment item fields: `id`, `author` or `nickname`, `content`, `created_at`.

Frontend models: `CommentsResponse`, `CommentItem`

## Reactions

Source sample: `reactions.json`

- `target`: string.
- `likes`: number or numeric string.

Frontend model: `ReactionsResponse`

## GitHub Contributions

Source sample: `github-contributions.json`

- `username`: string.
- `total`: number.
- `days`: array of contribution cells.
- Day fields: `date`, `count`, `level`, optional `color`.
- `fetchedAt`, `range`, and `source` are not used by the UI contract yet.

Frontend models: `GithubContributions`, `GithubContributionDay`

## Search

Source sample: `search-linux.json`

- Current baseline can be empty: `{ "items": [] }`.
- Result model keeps `id`, `title`, `type`, `summary`, and legacy `href`.

Frontend model: `SearchItem`
