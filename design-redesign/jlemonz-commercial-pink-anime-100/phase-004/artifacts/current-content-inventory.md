# Phase 004 current content inventory

## Purpose

This inventory records the current site structure before the information architecture changes. Phase 004 does not edit the website. It only records what exists, what conflicts, and what later phases must resolve.

## Sources inspected

- Canonical manual: `/home/jlemonz/Documents/Jlemonz/Jlemonz.md`
- Phase 002 API samples: `phase-002/artifacts/api/*.json`
- Current archived site snapshot: `design-redesign/jlemonz-pink-diary/site-snapshot/`
- Live API sampled from `https://192.168.31.248:8086/api/...`
- User feedback in this thread: the site needs a stronger pink anime direction, the black terminal direction is wrong, the current component language is not anime enough, big screens feel strange, and `瞬间` conflicts with `笔记`

## Current data state

| Surface | Current state | IA impact |
|---|---|---|
| `/api/health` | Returns `{"ok":true}` | API is available and should stay untouched |
| `/api/site/texts` | Provides nav labels, hero copy, section titles, footer links, category entries, and about tags | Future Astro build must keep dynamic text overrides or a compatible adapter |
| `/api/site/overview` | `posts: 0`, `moments: 1`, `projects: 0`, `categories: 4` | Empty states are first-class UI, not rare fallbacks |
| `/api/moments` | One life moment with image and tag `维护` | Moments can use short feed and polaroid treatment |
| `/api/posts` | Empty list | Notes need a designed empty archive state |
| `/api/projects` | Empty list | Projects need a designed empty task-board state |
| `/api/search?q=linux` | Empty list | Search needs an anime-styled no-result state |
| `/api/comments` | Empty list for `site-home` | Comment panels need calm empty copy |
| `/api/reactions` | `site-home` has `5` likes | Reaction UI can be preserved |
| `/api/github/contributions` | Returns contribution days and total count | GitHub grid can become a diary-density module |

## Current navigation

The live navigation already uses:

- 首页
- 瞬间
- 笔记
- 项目
- 关于

This naming is acceptable, but the experience behind each label is not distinct enough yet. The next design phases must keep the labels but separate the page jobs.

## Current page roles

| Page | Current role | Conflict or gap |
|---|---|---|
| 首页 | General entry, status cards, project preview, recent moments, category entry | It mixes many modules without a strong anime story layer |
| 瞬间 | Short updates with channels `碎片 / 项目 / 生活` | It can look like another archive if cards are too list-like |
| 笔记 | Long records with chips `长文 / 调试 / 学习`, search, and GitHub density | It needs to become a real knowledge index, not a timeline clone |
| 项目 | Project progress and rules | Current projects are empty, so the empty board must feel intentional |
| 关于 | Personal statement, current state, stack, comments, contact | It should become a character-profile style page |
| 详情页 | Project or note detail, comments, reactions, public rules | It must preserve readability and API compatibility |

## Current copy signals

Existing copy is warmer than an engineering placeholder, but it still reads like a cleaned-up static site. Future copy needs more page-specific texture:

- 首页 should feel like the entrance to a pink Sailei desk, not a dashboard
- 瞬间 should use diary-time words, short breaths, and feed language
- 笔记 should use archive, index, reference, debugging, and study language
- 项目 should use task-file, progress, next step, and public recap language
- 关于 should use profile-card, current status, long-term learning, and contact language

## Non-negotiable IA constraints

- Keep existing API names and paths
- Keep existing public URLs
- Do not change backend, database, admin, Nginx proxy rules, comments, reactions, or GitHub API behavior
- Do not add a website check-in feature
- Do not return to a black terminal theme
- Do not let `瞬间` and `笔记` share the same list language
- Treat empty content as a designed state
- Keep the anime feeling in components, not only in the background
