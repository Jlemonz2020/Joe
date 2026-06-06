export interface BackgroundRule {
  layer: string;
  purpose: string;
  guardrail: string;
}

export const backgroundRules: BackgroundRule[] = [
  {
    layer: "Fixed Sailei character",
    purpose: "Anchor the pink diary identity without moving during scroll.",
    guardrail: "Use `position: fixed`; never attach the character image to a scrolling section."
  },
  {
    layer: "Pink readability wash",
    purpose: "Keep text and glass panels readable over the illustration.",
    guardrail: "If the character competes with content, lower opacity before darkening the page."
  },
  {
    layer: "Paper grid texture",
    purpose: "Add diary-paper atmosphere without large bitmap textures.",
    guardrail: "Texture must stay CSS-only and subtle."
  },
  {
    layer: "Responsive focal point",
    purpose: "Keep the character visible on desktop while softening it on mobile.",
    guardrail: "Avoid horizontal scroll, layout shifts, and animated background perspective."
  }
];

