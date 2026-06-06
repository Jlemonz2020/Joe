# Data Model Contract

## Purpose

The pink Sailei diary frontend needs stable UI-facing models without changing the existing backend, database, or API payloads. The adapter layer converts real API shapes into these models.

## Shared Rules

- IDs are strings in the frontend, even if the API returns numbers.
- Dates remain strings and are typed as `ISODateString` for clarity.
- Legacy links are generated as `.html` URLs:
  - Posts: `/post.html?id=...`
  - Projects: `/project.html?id=...`
- Tags are always `string[]`.
- Optional image fields become `imageUrl`.
- Empty lists stay as `items: []`.
- Components should branch on adapter `status`, not on raw API structure.

## Shared Type Aliases

- `AdapterStatus`: `loading`, `ready`, `empty`, `error`
- `AdapterSource`: `api`, `fallback`
- `ISODateString`: string date boundary
- `LegacyHref`: compatibility URL
- `ContentKind`: moment/feed kind
- `ProjectStatus`: project workflow status
- `SearchItemType`: search result content kind
- `InteractionTarget`: comment/reaction target

## Domain Models

### Moment

Use for the short dynamic feed.

Required:

- `id`
- `content`
- `kind`
- `tags`

Optional:

- `imageUrl`
- `createdAt`

### Post

Use for long notes and article detail.

Required:

- `id`
- `title`
- `summary`
- `tags`
- `href`

Optional:

- `slug`
- `category`
- `coverUrl`
- `createdAt`
- `updatedAt`

### Project

Use for project boards and project detail.

Required:

- `id`
- `title`
- `summary`
- `tags`
- `href`

Optional:

- `slug`
- `status`
- `progress`
- `coverUrl`
- `createdAt`
- `updatedAt`

### CommentItem

Use inside comment panels.

Required:

- `id`
- `content`

Optional:

- `author`
- `createdAt`

### ReactionsResponse

Use for likes and lightweight reactions.

Required:

- `target`
- `likes`

### GithubContributionDay

Use for the future pink hand-account heatmap.

Required:

- `date`
- `count`
- `level`

Optional:

- `color`

### SearchItem

Use inside the future search panel.

Required:

- `id`
- `title`
- `href`

Optional:

- `type`
- `summary`

## Design Constraint

These models support anime presentation but do not encode visual style. Visual phases must build components on top of the models instead of adding presentation-only fields to API contracts.
