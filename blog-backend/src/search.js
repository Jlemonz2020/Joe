import { config } from "./config.js";
import { query } from "./db.js";
import { stripMarkdown } from "./markdown.js";

async function meili(path, options = {}) {
  if (!config.meili.masterKey) return null;
  const response = await fetch(`${config.meili.host}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.meili.masterKey}`,
      ...(options.headers || {})
    }
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

export async function syncSearchIndex() {
  await meili("/indexes/posts", { method: "PATCH", body: JSON.stringify({ primaryKey: "id" }) });
  const posts = await query(`
    SELECT p.id, p.title, p.slug, p.summary, p.content_md, p.published_at, c.name AS category
    FROM posts p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.status = 'published'
    ORDER BY p.published_at DESC
  `);
  const docs = posts.map((post) => ({
    id: post.id,
    type: "post",
    title: post.title,
    slug: post.slug,
    summary: post.summary || "",
    body: stripMarkdown(post.content_md),
    category: post.category || "",
    published_at: post.published_at,
    url: "/archive.html"
  }));
  await meili("/indexes/posts/documents", { method: "POST", body: JSON.stringify(docs) });
  return docs.length;
}

export async function searchPosts(q) {
  if (!q) return [];
  const result = await meili("/indexes/posts/search", {
    method: "POST",
    body: JSON.stringify({ q, limit: 12, attributesToHighlight: ["title", "summary"] })
  });
  return result?.hits || [];
}

async function onlyPublishedPosts(rows) {
  const ids = [...new Set(rows.map((row) => Number(row.id)).filter(Number.isFinite))];
  if (!ids.length) return [];
  const params = Object.fromEntries(ids.map((id, index) => [`id${index}`, id]));
  const placeholders = ids.map((_, index) => `:id${index}`).join(",");
  const published = await query(`SELECT id FROM posts WHERE status='published' AND id IN (${placeholders})`, params);
  const allowed = new Set(published.map((row) => Number(row.id)));
  return rows.filter((row) => allowed.has(Number(row.id)));
}

function normalizePost(row) {
  const slug = row.slug || "";
  return {
    id: row.id,
    type: "post",
    title: row.title || "未命名札记",
    summary: row.summary || row.body || row.category || "札记",
    category: row.category || "",
    published_at: row.published_at || null,
    url: slug ? `/post.html?slug=${encodeURIComponent(slug)}` : "/archive.html"
  };
}

function normalizeProject(row) {
  const key = row.slug || row.id;
  return {
    id: row.id,
    type: "project",
    title: row.name || "未命名项目",
    summary: row.summary || row.status_text || "项目记录",
    updated_at: row.updated_at || null,
    url: `/project.html?${row.slug ? "slug" : "id"}=${encodeURIComponent(key)}`
  };
}

function normalizeMoment(row) {
  const tags = Array.isArray(row.tags) ? row.tags : [];
  return {
    id: row.id,
    type: "moment",
    title: row.content ? String(row.content).slice(0, 34) : "瞬间",
    summary: tags.length ? tags.map((tag) => `#${tag}`).join(" ") : row.kind || "瞬间",
    kind: row.kind || "life",
    created_at: row.created_at || null,
    url: `/moments.html${row.kind ? `?kind=${encodeURIComponent(row.kind)}` : ""}`
  };
}

function parseTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(value).split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);
  }
}

function score(item, q) {
  const keyword = q.toLowerCase();
  const title = String(item.title || "").toLowerCase();
  const summary = String(item.summary || "").toLowerCase();
  if (title === keyword) return 100;
  if (title.includes(keyword)) return 80;
  if (summary.includes(keyword)) return 50;
  return 10;
}

export async function searchContent(q) {
  const keyword = String(q || "").trim().slice(0, 80);
  if (!keyword) return [];
  const like = `%${keyword}%`;
  const items = [];

  const meiliHits = await searchPosts(keyword).catch(() => []);
  items.push(...(await onlyPublishedPosts(meiliHits)).map(normalizePost));

  const posts = await query(`
    SELECT p.id, p.title, p.slug, p.summary, p.content_md AS body, p.published_at, c.name AS category
    FROM posts p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.status='published'
      AND (p.title LIKE :like OR p.summary LIKE :like OR p.content_md LIKE :like OR c.name LIKE :like)
    ORDER BY p.published_at DESC, p.id DESC
    LIMIT 8
  `, { like });
  items.push(...posts.map(normalizePost));

  const projects = await query(`
    SELECT id, name, slug, summary, status_text, updated_at
    FROM projects
    WHERE status='active'
      AND (name LIKE :like OR summary LIKE :like OR status_text LIKE :like OR content_md LIKE :like)
    ORDER BY sort_order ASC, id ASC
    LIMIT 8
  `, { like });
  items.push(...projects.map(normalizeProject));

  const moments = await query(`
    SELECT id, content, kind, tags, created_at
    FROM moments
    WHERE status='published'
      AND (content LIKE :like OR kind LIKE :like OR CAST(tags AS CHAR) LIKE :like)
    ORDER BY created_at DESC, id DESC
    LIMIT 8
  `, { like });
  items.push(...moments.map((row) => normalizeMoment({ ...row, tags: parseTags(row.tags) })));

  const unique = new Map();
  for (const item of items) {
    const key = `${item.type}:${item.id}`;
    if (!unique.has(key)) unique.set(key, item);
  }

  return [...unique.values()]
    .sort((a, b) => score(b, keyword) - score(a, keyword))
    .slice(0, 12);
}
