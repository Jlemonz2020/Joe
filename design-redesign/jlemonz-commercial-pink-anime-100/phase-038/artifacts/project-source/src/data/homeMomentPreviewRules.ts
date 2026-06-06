export const homeMomentPreviewRules = [
  "Fetch `/api/moments` on the client and render returned moments only.",
  "Render at most three moments on the homepage preview.",
  "Use note cards for text-only moments and polaroid cards for image moments.",
  "Use `object-fit: contain` for moment images so photos are not cropped.",
  "Keep this preview visually separate from project task cards."
] as const;
