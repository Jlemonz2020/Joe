export const homeProjectPreviewRules = [
  "Fetch `/api/projects` on the client and render returned projects only.",
  "Render at most three projects on the homepage preview.",
  "Use a Sailei project empty state when the API returns an empty list.",
  "Do not ship test fixture project cards in production markup.",
  "Keep project preview separate from the full projects page."
] as const;
