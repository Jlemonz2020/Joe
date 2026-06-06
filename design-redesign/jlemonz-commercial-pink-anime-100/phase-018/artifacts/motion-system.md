# Motion system

## Goal

Phase 018 defines a light motion system for the pink Sailei diary site. Motion should add soft feedback without distracting from reading or overloading the Pi5.

## CSS artifact

`src/styles/motion.css` defines:

- `--motion-fast`
- `--motion-base`
- `--motion-slow`
- `--motion-idle`
- `--ease-diary`
- `--ease-sticker`
- `--hover-lift`

## Motion patterns

- Page entrance: opacity plus `translateY`
- Sticker hover: small upward lift
- Idle accent: small scale pulse on tiny decorative pins
- Transition properties: transform, box-shadow, background-color, border-color

## Reduced motion

`prefers-reduced-motion: reduce` sets:

- `animation-duration: 1ms`
- `animation-iteration-count: 1`
- `transition-duration: 1ms`
- `scroll-behavior: auto`

## Performance rules

- Animate transform and opacity first.
- Avoid layout properties such as width, height, left, top, margin, and padding.
- Do not introduce heavy animation libraries.
- Do not animate body copy or long reading content.
- Keep idle motion on small decorative elements only.
