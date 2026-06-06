export const githubSyncRules = [
  "Render only data returned by `/api/github/contributions`.",
  "Use `total`, `username`, and recent `days` from the API payload.",
  "Show a warm fallback when the request fails.",
  "Keep grid overflow inside the component, not on the page.",
  "Do not copy the default GitHub heatmap visual one-to-one."
] as const;
