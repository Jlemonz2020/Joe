# Foundation Decision Ledger

## Product Decisions

1. The redesign is a full rebuild, not a CSS touch-up.
2. The site should feel like a pink anime technical diary.
3. Sailei is the identity anchor.
4. Empty states are core UX, not fallback afterthoughts.
5. Moments and notes must not use the same visual structure.

## Engineering Decisions

1. Astro is the frontend rebuild target.
2. The current backend remains unchanged.
3. Static output is kept for Nginx hosting.
4. Legacy URLs remain valid.
5. API data is normalized through adapter functions before UI consumption.

## Design System Decisions

1. Default theme is `sailei-pink-diary`.
2. Use light pink, milk, paper, rose, lavender, aqua, and soft gold.
3. Avoid whole-site black terminal styling.
4. Use rem-based typography and breakpoint tokens, not viewport-scaled text.
5. Motion stays lightweight, CSS-only, and reduced-motion aware.
6. Interaction components stay semantic and keyboard-friendly.

## Process Decisions

1. Every phase archives reports, artifacts, and verification output.
2. Every phase commits and pushes to `Jlemonz2020/Joe`.
3. Every phase writes push verification evidence.
4. User approval is continuous unless the user interrupts.
5. Live deployment waits for later deployment phases.

