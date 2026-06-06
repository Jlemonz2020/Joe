import type {
  ContentKind,
  ISODateString,
  LegacyHref,
  ProjectStatus,
  SearchItemType
} from "./types";

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const asText = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value.trim() : fallback;

export const asOptionalText = (value: unknown): string | undefined => {
  const output = asText(value);
  return output || undefined;
};

export const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim() && Number.isFinite(Number(value))
      ? Number(value)
      : fallback;

export const asId = (value: unknown): string => String(value ?? "").trim();

export const asTags = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : typeof value === "string"
      ? value.split(/[,，]/).map((item) => item.trim()).filter(Boolean)
      : [];

export const asProgress = (value: unknown): number => {
  const progress = asNumber(value, 0);
  if (progress < 0) return 0;
  if (progress > 100) return 100;
  return progress;
};

export const asDateTime = (value: unknown): ISODateString | undefined =>
  asOptionalText(value);

export const asImageUrl = (value: unknown): string | undefined =>
  asOptionalText(value);

export const asMomentKind = (value: unknown): ContentKind => {
  const kind = asText(value, "fragment");
  return kind || "fragment";
};

export const asProjectStatus = (value: unknown): ProjectStatus | undefined =>
  asOptionalText(value);

export const asSearchType = (value: unknown): SearchItemType | undefined =>
  asOptionalText(value);

export const legacyPostHref = (idOrSlug: string): LegacyHref =>
  idOrSlug ? `/post.html?id=${encodeURIComponent(idOrSlug)}` : "/archive.html";

export const legacyProjectHref = (idOrSlug: string): LegacyHref =>
  idOrSlug ? `/project.html?id=${encodeURIComponent(idOrSlug)}` : "/projects.html";
