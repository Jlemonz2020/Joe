# Phase 005 source register

## Purpose

This register records public references used for visual and interaction research. The goal is to extract patterns for Jlemonz, not to copy code, images, names, or brand-specific assets.

## Primary references

| Source | Type | Useful signals | Risk | Jlemonz translation |
|---|---|---|---|---|
| [Shineii86/Portfolio](https://github.com/Shineii86/Portfolio) | Anime-themed developer portfolio | Anime hero, dynamic animations, responsive layout, glowing buttons, animated cards, skill badges, anime showcase, quote area | Uses a dark/neon base and external emoji/image assets | Borrow the idea of anime-specific sections and badge/card energy. Convert it into pink diary cards and Sailei dialogue, not black neon |
| [Hexo theme Sakura](https://skr-king.github.io/theme-sakura/) | Anime blog theme | Large homepage media, random covers, lazy images, comments, fancybox album, PJAX, music continuity, multi-level navigation | Some old dependencies and external media patterns do not fit Pi5 performance or copyright boundaries | Borrow the blog atmosphere: cover, album, soft navigation, content rituals. Avoid heavy PJAX/music unless later approved |
| [mirai-mamori/Sakurairo](https://github.com/mirai-mamori/Sakurairo) | Feature-rich anime WordPress theme | Colorful friendly theme, AI-assisted reading, multilingual support, rich settings, Sakura lineage, large community signal | WordPress implementation does not transfer directly to static Astro | Borrow “feature-rich but soft” direction: reading assistant panel, rich theme settings, friendly color system |
| [Hexo theme directory](https://hexo.io/themes/) | Theme ecosystem index | Shows repeated patterns: responsive themes, card UI, book-like themes, galleries, search, one-column and multi-column layouts | Many themes are generic and not anime enough | Use it as a warning: responsive/card/search are table stakes, not the final identity |
| [Manga-themed interactive portfolio prompt](https://blink.new/p/manga-portfolio-website-gyo9u4u8) | Manga portfolio concept | Comic panel layout, speech-bubble UI, panel transitions, “Manga Mode”, project-as-chapter structure | It is a generated concept page, not a mature open-source implementation | Borrow manga panel logic and speech bubble direction for Hero and project detail, with calmer pink diary treatment |
| [s-shemmee/TikTok-UI-Clone](https://github.com/s-shemmee/TikTok-UI-Clone) | Vertical feed UI clone | Smooth browsing, infinite feed, like/comment/share actions, familiar feed rhythm | GPL-3.0 license and TikTok brand cloning are not a fit | Borrow only the feed rhythm: strong cards, quick interactions, channel switching. Do not copy code or visual identity |
| [reinaldosimoes/react-vertical-feed](https://github.com/reinaldosimoes/react-vertical-feed) | Vertical feed component | Intersection Observer, auto play/pause based on visibility, keyboard navigation, accessibility | Video feed behavior is heavier than Jlemonz needs | Borrow the performance idea: only animate or load visible feed items |
| [Skillstore coding category](https://skillstore.io/zh-hans/skills?category=coding&tools=codex) | Skill marketplace | Lists relevant coding, review, testing, performance, and artifact-building skills with risk labels | Marketplace quality varies | Keep current installed skills. Consider performance/review skills later if a phase needs them |
| [SkillsMP search](https://skillsmp.com/zh/search) | Skill search index | Large skill index, useful for discovering review, GitHub, and E2E workflows | Results are broad and not filtered for this exact project | Use only as discovery, not as authority |
| [skills.sh](https://www.skills.sh/) | Agent skills directory | Explains skills as reusable procedural capabilities and supports Codex among multiple agents | Directory is broad | Use it to justify keeping procedural skills in the workflow |

## Source notes

- Research was performed on 2026-06-06.
- Web sources were used for current project descriptions and feature lists.
- The `read-github` skill was used for repository documentation where available.
- No external images, CSS, JavaScript, or copyrighted assets were imported.
- No dependency was installed in Phase 005.

## Why these sources matter

The sources show a useful split:

- Anime portfolios focus on personal identity, badges, showcase sections, and visual impact.
- Sakura-style blogs focus on atmosphere, covers, albums, comments, navigation, and continuity.
- Manga or galgame concepts focus on story panels and speech bubbles.
- TikTok-style feeds focus on quick browsing, channel rhythm, and lightweight interaction.
- Skill directories confirm that design, testing, review, and verification should remain separate capabilities.

Jlemonz needs all of these as patterns, but none of them as a direct template.
