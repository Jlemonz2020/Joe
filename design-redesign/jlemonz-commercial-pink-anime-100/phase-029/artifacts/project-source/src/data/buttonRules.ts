export const buttonFamilies = [
  {
    family: "tool",
    use: "Search, theme, contact, and utility actions.",
    guardrail: "Icon-only tool buttons need `aria-label` plus a tooltip."
  },
  {
    family: "swatch",
    use: "Theme selection and future color/state pickers.",
    guardrail: "Use `aria-pressed` for toggle state and do not rely on color alone."
  },
  {
    family: "sticker",
    use: "Playful navigation or primary diary actions.",
    guardrail: "Labels must stay short and wrap-safe."
  },
  {
    family: "status",
    use: "Small sync, trace, daily, comment, or reaction states.",
    guardrail: "Disabled and active states must remain visually distinct."
  }
];

export const buttonReviewChecklist = [
  "hover state is visible",
  "focus-visible ring is visible",
  "active or pressed state is distinct",
  "disabled state is not clickable-looking",
  "icon-only buttons have aria-label",
  "tooltip text is concise",
  "text cannot overflow its control"
];
