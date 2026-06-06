# Phase 010 acceptance matrix

## Page matrix

| Page | URL | Required checks |
|---|---|---|
| Home | `/`, `/index.html` | Hero visible, dialogue readable, task cards visible, no horizontal scroll, API fallback works |
| Moments | `/moments.html` | Channel UI visible, moment feed distinct from notes, polaroid style works, empty state available |
| Notes | `/archive.html` | Search/filter UI visible, archive cards distinct from moments, GitHub density module stable, empty state available |
| Projects | `/projects.html` | Mission board visible, project empty state available, roadmap/rules visible, no private data |
| Project detail | `/project.html`, `/project.html?id=sample` | Loading, success, missing project, comments, reactions, public rule card |
| Post detail | `/post.html`, `/post.html?id=sample` | Loading, success, missing post, readable article body, comments, reactions |
| About | `/about.html` | Profile card, learning tags, current state, contact, comments |
| Search overlay | all pages | Opens, focuses input, calls `/api/search?q=`, shows results, empty state, Escape closes |

## API matrix

| API | Required checks |
|---|---|
| `GET /api/health` | Returns ok JSON |
| `GET /api/site/texts` | Site copy loads or static copy remains stable |
| `GET /api/site/overview` | Stats and latest moments render or degrade |
| `GET /api/moments` | Feed renders, empty state renders |
| `GET /api/posts` | Notes render, empty state renders |
| `GET /api/projects` | Projects render, empty state renders |
| `GET /api/projects/:idOrSlug` | Project detail success and missing state |
| `GET /api/search?q=` | Result and no-result states |
| `GET /api/comments` | Empty and populated comments |
| `POST /api/comments` | Form validation and success feedback |
| `GET /api/reactions` | Count renders |
| `POST /api/reactions` | Count updates or graceful failure |
| `GET /api/github/contributions` | Grid renders or shows fallback |

## Visual acceptance matrix

| Area | Must pass |
|---|---|
| Pink direction | No black terminal dominance |
| Anime language | Components use diary, sticker, dialogue, polaroid, HUD, or mission-file grammar |
| Responsiveness | No horizontal scroll at 390, 768, 1280, 1920, 2560, 3840 |
| Readability | Text does not overlap, crop, or sit on high-noise background |
| Empty states | Posts, projects, moments, search, comments all have designed states |
| Motion | Reduced motion supported, no parallax background |
| Accessibility | Labels, focus, semantic links/buttons, alt text |
| Performance | Phase 009 budgets tracked |

## Phase pass rule

A later implementation phase can pass only when:

- Its target page or component passes the relevant rows above
- Evidence paths are recorded in the phase report
- Failures are fixed in the same phase unless explicitly deferred with a reason
