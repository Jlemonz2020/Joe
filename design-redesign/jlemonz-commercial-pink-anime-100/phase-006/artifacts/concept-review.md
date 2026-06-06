# Phase 006 concept review

## Review criteria

| Criterion | Meaning |
|---|---|
| Pink direction | Does the image avoid black-terminal drift? |
| Anime component language | Does anime feeling come from UI components, not only a character? |
| Homepage suitability | Can this become the main visual system? |
| Moments/notes separation | Does it help separate short feed from archive? |
| Implementation realism | Can Astro, CSS, and light JavaScript reproduce the idea later? |

## Scores

| Concept | Pink direction | Anime component language | Homepage suitability | Moments/notes separation | Implementation realism | Role |
|---|---:|---:|---:|---:|---:|---|
| 01 diary desk homepage | 5 | 5 | 5 | 4 | 4 | Primary system |
| 02 galgame main screen | 5 | 5 | 4 | 3 | 3 | Hero/dialogue reference |
| 03 sticky feed | 5 | 5 | 3 | 5 | 4 | Moments reference |
| 04 pink HUD board | 5 | 4 | 3 | 4 | 4 | Projects reference |

Scale: 1 is weak, 5 is strong.

## Concept 01 notes

Strengths:

- Best all-site balance
- Strong pink Sailei diary feeling
- Homepage already includes hero, status cards, projects, moments, category entry, and footer mood
- Avoids black terminal mood
- Cards feel like diary stickers instead of generic cards

Risks:

- Contains many small modules. Later implementation must reduce density on mobile.
- Generated text is decorative and should not be copied.

## Concept 02 notes

Strengths:

- Strongest galgame mood
- Character presence is clear
- Dialogue box and choice navigation can inspire the hero

Risks:

- Too scene-heavy for every page
- Could make content feel secondary if copied too directly
- Music panel and game controls should stay optional or decorative

## Concept 03 notes

Strengths:

- Best `瞬间` direction
- Timeline rail, sticky notes, polaroids, tags, and channel sidebar solve the moments/notes conflict
- Side hint panel supports Sailei companion role

Risks:

- Too many feed items at once for mobile
- Some generated labels and images are placeholders only

## Concept 04 notes

Strengths:

- Best project page direction
- Mission board, file cards, energy bars, roadmap, current task, comments, and status panels all map well to Jlemonz projects
- Light HUD avoids black terminal

Risks:

- Has a dashboard density that later phases must soften with diary texture
- Some icons and avatar clusters should be simplified for performance

## Decision

Use Concept 01 as the primary visual system.

Blend in:

- Concept 02 for `GalgameDialog`, hero companion, and choice-like navigation
- Concept 03 for `MomentFeedRail`, `StickyMomentCard`, and `PolaroidMoment`
- Concept 04 for `ProjectMissionBoard`, `ProjectFileCard`, `EnergyProgressBar`, and `RouteNodeTimeline`

This decision follows the continuous execution policy. It does not require a manual pause because the user already locked the direction as pink anime Sailei diary and asked Codex to continue unless interrupted.
