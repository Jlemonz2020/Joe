export const searchEntryRules = [
  {
    rule: "Entry only",
    detail: "Phase 026 creates the search entrance, not the full result modal or API workflow."
  },
  {
    rule: "Desktop has a light HUD input",
    detail: "Wide screens show a small `DATA` label, search field, and icon submit button."
  },
  {
    rule: "Mobile stays compact",
    detail: "Narrow screens collapse to an icon-sized entry so Header navigation and theme swatches do not overlap."
  },
  {
    rule: "Accessible form semantics",
    detail: "Use `role=\"search\"`, a real label, a meaningful `name`, and an icon button with an accessible label."
  }
];
