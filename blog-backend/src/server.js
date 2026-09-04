import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.js";
import { getOne, pool, query } from "./db.js";
import { cacheDel, cacheGet, cacheSet } from "./redis.js";
import { currentUser, hashPassword, signSession, verifyPassword, verifySession } from "./auth.js";
import { markdownToHtml, stripMarkdown } from "./markdown.js";
import { searchContent, syncSearchIndex } from "./search.js";

let databaseAvailable = true;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, X-Client-Key, X-Interview-Token"
};

const json = (res, data, status = 200, headers = {}) => {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...corsHeaders,
    ...headers
  });
  res.end(body);
};

const githubFetchTimeoutMs = 20000;
const weatherFetchTimeoutMs = 8000;
const publicRouteMemoryCache = new Map();

function publicRouteCacheGet(key = "") {
  const entry = publicRouteMemoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    publicRouteMemoryCache.delete(key);
    return null;
  }
  return entry.value;
}

function publicRouteCacheSet(key = "", value, ttlSeconds = 60) {
  const ttlMs = Math.max(1, Number(ttlSeconds) || 60) * 1000;
  publicRouteMemoryCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  if (publicRouteMemoryCache.size > 400) {
    const now = Date.now();
    for (const [cacheKey, entry] of publicRouteMemoryCache.entries()) {
      if (entry.expiresAt <= now || publicRouteMemoryCache.size > 320) publicRouteMemoryCache.delete(cacheKey);
    }
  }
  return value;
}

async function publicRouteCached(key = "", ttlSeconds = 60, loader) {
  const memory = publicRouteCacheGet(key);
  if (memory) return memory;
  const redisKey = `public:route:${key}`;
  const cached = await cacheGet(redisKey).catch(() => null);
  if (cached) {
    publicRouteCacheSet(key, cached, Math.min(ttlSeconds, 30));
    return cached;
  }
  const payload = await loader();
  publicRouteCacheSet(key, payload, ttlSeconds);
  cacheSet(redisKey, payload, ttlSeconds).catch(() => {});
  return payload;
}

const adminPermissionCatalog = [
  { code: "content:read", group: "内容中心", label: "查看内容", description: "查看文章、瞬间、项目、面试和留言列表。" },
  { code: "content:write", group: "内容中心", label: "编辑内容", description: "新建和修改文章、瞬间、项目、面试与留言状态。" },
  { code: "content:publish", group: "内容中心", label: "发布内容", description: "发布、下架、恢复和回滚前台内容。" },
  { code: "content:delete", group: "内容中心", label: "删除内容", description: "将内容移入回收站或清理危险内容。" },
  { code: "cms:read", group: "页面装修", label: "查看 CMS 配置", description: "查看页面区块、主题、导航和配置版本。" },
  { code: "cms:write", group: "页面装修", label: "编辑 CMS 配置", description: "修改页面区块、主题、导航和前台文案。" },
  { code: "cms:publish", group: "页面装修", label: "发布与回滚配置", description: "发布前台编辑器配置或恢复历史版本。" },
  { code: "media:read", group: "媒体资源", label: "查看媒体", description: "查看媒体台账、引用关系和孤儿资源。" },
  { code: "media:write", group: "媒体资源", label: "上传媒体", description: "上传图片并重扫附件引用。" },
  { code: "media:delete", group: "媒体资源", label: "清理媒体", description: "下架或清理未引用媒体。" },
  { code: "search:write", group: "搜索系统", label: "同步搜索", description: "触发 Meilisearch 全站索引重建。" },
  { code: "audit:read", group: "系统后台", label: "查看审计", description: "查看后台操作流水与资源变更记录。" },
  { code: "backup:write", group: "系统后台", label: "创建备份", description: "创建后台 JSON 备份快照，或登记计划备份任务。" },
  { code: "settings:write", group: "系统后台", label: "修改系统设置", description: "修改 GitHub 账号等全局系统设置。" },
  { code: "system:read", group: "系统后台", label: "查看系统状态", description: "查看数据库、上传、构建、搜索和运行时巡检。" },
  { code: "system:write", group: "系统后台", label: "系统管理", description: "管理角色、权限和后续系统级能力。" },
];
const adminPermissionCodes = adminPermissionCatalog.map((item) => item.code);
const rolePermissionPresets = {
  owner: adminPermissionCodes,
  editor: ["content:read", "content:write", "content:publish", "cms:read", "cms:write", "cms:publish", "media:read", "media:write", "search:write", "audit:read", "system:read"],
  viewer: ["content:read", "cms:read", "media:read", "audit:read", "system:read"]
};

const html = (res, body, status = 200) => {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
};

const xml = (res, body, status = 200) => {
  res.writeHead(status, {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=300"
  });
  res.end(body);
};

const redirect = (res, location) => {
  res.writeHead(302, { Location: location });
  res.end();
};

const adminStaticRoot = path.resolve(process.cwd(), "public", "admin");
const adminIndexFile = path.join(adminStaticRoot, "index.html");
const publicFrontendRoot = path.resolve(process.cwd(), "..", "blog-redesign");
const staticMimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8"
};

function serveStaticFile(req, res, file, cacheControl = "public, max-age=604800, immutable") {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    "Content-Type": staticMimeTypes[ext] || "application/octet-stream",
    "Cache-Control": cacheControl
  });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file).pipe(res);
  return true;
}

function safeJoin(root, relativePath) {
  const resolvedRoot = path.resolve(root);
  const file = path.resolve(resolvedRoot, relativePath.replace(/^[/\\]+/, ""));
  if (file !== resolvedRoot && !file.startsWith(`${resolvedRoot}${path.sep}`)) return "";
  return file;
}

const parseCookies = (header = "") => Object.fromEntries(
  header.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  })
);

async function readRawBuffer(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function decodeTextBuffer(buffer) {
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || "");
  const stripBom = (value = "") => String(value || "").replace(/^\uFEFF/, "");
  if (data.length >= 2 && data[0] === 0xff && data[1] === 0xfe) return stripBom(data.toString("utf16le"));
  if (data.length >= 2 && data[0] === 0xfe && data[1] === 0xff) {
    const swapped = Buffer.alloc(Math.max(0, data.length - 2));
    for (let index = 2; index + 1 < data.length; index += 2) {
      swapped[index - 2] = data[index + 1];
      swapped[index - 1] = data[index];
    }
    return stripBom(swapped.toString("utf16le"));
  }
  for (const encoding of ["utf-8", "gb18030"]) {
    try {
      return stripBom(new TextDecoder(encoding, { fatal: true }).decode(data));
    } catch {
      // Try the next likely Markdown text encoding.
    }
  }
  return stripBom(data.toString("utf8"));
}

async function readBody(req) {
  const raw = decodeTextBuffer(await readRawBuffer(req));
  const type = req.headers["content-type"] || "";
  if (type.includes("application/json")) return JSON.parse(raw || "{}");
  if (type.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  return raw;
}

async function readMultipart(req) {
  const type = req.headers["content-type"] || "";
  const boundaryMatch = type.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) return {};
  const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
  const raw = (await readRawBuffer(req)).toString("latin1");
  const fields = {};
  const files = {};
  for (const part of raw.split(boundary)) {
    if (!part || part === "--\r\n" || part === "--") continue;
    const clean = part.replace(/^\r\n/, "").replace(/\r\n--$/, "").replace(/\r\n$/, "");
    const splitAt = clean.indexOf("\r\n\r\n");
    if (splitAt === -1) continue;
    const headerText = clean.slice(0, splitAt);
    const bodyText = clean.slice(splitAt + 4);
    const disposition = headerText.match(/content-disposition:\s*form-data;\s*([^\r\n]+)/i)?.[1] || "";
    const name = disposition.match(/name="([^"]+)"/)?.[1];
    if (!name) continue;
    const filename = disposition.match(/filename="([^"]*)"/)?.[1] || "";
    const contentType = headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1] || "application/octet-stream";
    const buffer = Buffer.from(bodyText, "latin1");
    if (filename) {
      files[name] = {
        filename: path.basename(filename),
        contentType,
        buffer,
        text: decodeTextBuffer(buffer)
      };
    } else {
      fields[name] = decodeTextBuffer(buffer);
    }
  }
  return { ...fields, files };
}

async function readForm(req) {
  const type = req.headers["content-type"] || "";
  return type.includes("multipart/form-data") ? readMultipart(req) : readBody(req);
}

function configuredAdminCredentials() {
  return {
    username: String(config.admin.username || "").trim(),
    password: String(config.admin.password ?? "")
  };
}

function localPreviewAdminCredentials() {
  const credentials = configuredAdminCredentials();
  return {
    username: credentials.username || "yifang",
    password: credentials.password || "change-me"
  };
}

function localPreviewHost(req) {
  const hostHeader = String(req.headers.host || "");
  if (hostHeader.startsWith("[")) return hostHeader.slice(1, hostHeader.indexOf("]"));
  return hostHeader.split(":")[0];
}

function isLocalPreviewRequest(req) {
  return !databaseAvailable && ["127.0.0.1", "localhost", "::1"].includes(localPreviewHost(req));
}

function localPreviewAdminFromSession(req) {
  if (!isLocalPreviewRequest(req)) return null;
  const id = verifySession(req.cookies.session);
  if (id !== -1) return null;
  return { id: -1, username: localPreviewAdminCredentials().username, preview: true };
}

function matchesLocalPreviewAdmin(req, username, password) {
  if (!isLocalPreviewRequest(req)) return false;
  const credentials = localPreviewAdminCredentials();
  return username === credentials.username && password === credentials.password;
}

async function currentAdminUser(req) {
  try {
    return await adminIdentity(await currentUser(req));
  } catch (error) {
    markDatabaseUnavailable(error, "admin session database");
    return await adminIdentity(localPreviewAdminFromSession(req));
  }
}

function passwordMatches(password, storedHash) {
  try {
    return verifyPassword(password, storedHash);
  } catch {
    return false;
  }
}

async function syncConfiguredAdminUser() {
  const { username, password } = configuredAdminCredentials();
  if (!username || !password) return;
  const user = await getOne("SELECT id,password_hash FROM users WHERE username=:username", { username });
  const nextHash = hashPassword(password);
  if (!user) {
    const result = await query("INSERT INTO users(username,password_hash,created_at) VALUES(:username,:hash,NOW())", { username, hash: nextHash });
    await assignOwnerRoleToUser(result.insertId);
    return;
  }
  await assignOwnerRoleToUser(user.id);
  if (!passwordMatches(password, user.password_hash)) {
    await query("UPDATE users SET password_hash=:hash WHERE id=:id", { id: user.id, hash: nextHash });
  }
}

function page(title, content) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - Jlemonz 后台</title>
  <style>
    :root{
      color-scheme:dark;
      --bg:#171a22;
      --panel:rgba(35,38,50,.78);
      --panel-solid:#252936;
      --field:rgba(255,255,255,.065);
      --text:#f7f2f7;
      --muted:rgba(247,242,247,.68);
      --soft:rgba(247,242,247,.44);
      --line:rgba(255,255,255,.12);
      --line-strong:rgba(255,255,255,.22);
      --accent:#ff65c8;
      --cyan:#4fd6c9;
      --purple:#9b7cff;
      --orange:#ffb86b;
      --shadow:0 20px 58px rgba(0,0,0,.34);
      --glow:0 0 32px rgba(255,101,200,.22);
      --serif:Georgia,"Times New Roman","Noto Serif SC","Songti SC",SimSun,serif;
      --sans:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC","Microsoft YaHei",sans-serif;
    }
    *{box-sizing:border-box}
    html,body{max-width:100%;overflow-x:hidden}
    body{
      margin:0;
      min-height:100svh;
      color:var(--text);
      background:
        linear-gradient(180deg,rgba(23,26,34,.84),rgba(23,26,34,.96)),
        radial-gradient(circle at 84% 8%,rgba(79,214,201,.14),transparent 28rem),
        radial-gradient(circle at 16% 20%,rgba(255,101,200,.12),transparent 28rem),
        linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),
        linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px),
        var(--bg);
      background-size:auto,auto,auto,80px 80px,80px 80px,auto;
      font-family:var(--sans);
      letter-spacing:0;
    }
    body::before{
      content:"";
      position:fixed;
      inset:0;
      z-index:-2;
      background:url("/admin/assets/sailei/hero-anime-v2.webp") center / cover no-repeat;
      opacity:.22;
      filter:saturate(.9);
    }
    body::after{
      content:"";
      position:fixed;
      inset:0;
      z-index:-1;
      pointer-events:none;
      opacity:.28;
      background-image:radial-gradient(rgba(255,255,255,.15) 1px,transparent 1px);
      background-size:4px 4px;
      mix-blend-mode:soft-light;
    }
    a{color:inherit;text-decoration:none}
    button,input,textarea,select{font:inherit}
    .layout{
      display:grid;
      grid-template-columns:250px minmax(0,1fr);
      min-height:100svh;
    }
    .side{
      position:sticky;
      top:0;
      height:100svh;
      padding:22px 18px;
      border-right:1px solid var(--line);
      background:rgba(18,20,28,.74);
      backdrop-filter:blur(18px);
    }
    .brand{
      display:flex;
      align-items:center;
      gap:12px;
      margin-bottom:26px;
    }
    .brand-mark{
      display:grid;
      place-items:center;
      width:42px;
      height:42px;
      border:1px solid rgba(255,101,200,.42);
      border-radius:14px;
      color:#241825;
      background:linear-gradient(135deg,var(--accent),var(--cyan));
      box-shadow:var(--glow);
      font-weight:900;
    }
    .brand strong{
      display:block;
      font-family:var(--serif);
      font-size:21px;
      line-height:1;
    }
    .brand small{
      display:block;
      margin-top:4px;
      color:var(--soft);
      font-size:12px;
    }
    nav{
      display:grid;
      gap:8px;
    }
    nav a{
      display:flex;
      align-items:center;
      min-height:42px;
      padding:0 13px;
      border:1px solid transparent;
      border-radius:14px;
      color:var(--muted);
      font-weight:800;
      transition:background .18s ease,border-color .18s ease,color .18s ease,transform .18s ease;
    }
    nav a:hover{
      color:var(--text);
      background:rgba(255,255,255,.065);
      border-color:rgba(255,101,200,.28);
      transform:translateY(-1px);
    }
    .main{
      min-width:0;
      padding:24px clamp(16px,3vw,38px) 68px;
    }
    .topbar{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:18px;
      margin-bottom:22px;
      padding:16px 18px;
      border:1px solid var(--line);
      border-radius:18px;
      background:rgba(35,38,50,.68);
      box-shadow:0 14px 42px rgba(0,0,0,.24);
      backdrop-filter:blur(16px);
    }
    h1,h2,h3,p{margin-top:0}
    h1{
      margin:0;
      font-family:var(--serif);
      font-size:clamp(26px,3vw,38px);
      letter-spacing:0;
    }
    h2{
      margin-bottom:12px;
      font-family:var(--serif);
      font-size:24px;
    }
    .admin-note{
      margin:4px 0 0;
      color:var(--muted);
      font-size:13px;
    }
    .status-pill{
      flex:0 0 auto;
      display:inline-flex;
      align-items:center;
      gap:8px;
      min-height:36px;
      padding:0 13px;
      border:1px solid rgba(84,239,154,.22);
      border-radius:999px;
      color:rgba(247,242,247,.82);
      background:rgba(84,239,154,.08);
      font-size:13px;
      font-weight:800;
    }
    .status-pill::before{
      content:"";
      width:8px;
      height:8px;
      border-radius:999px;
      background:#54ef9a;
      box-shadow:0 0 0 6px rgba(84,239,154,.12);
    }
    .card{
      position:relative;
      overflow:hidden;
      margin-bottom:18px;
      padding:clamp(18px,2.4vw,26px);
      border:1px solid var(--line);
      border-radius:18px;
      background:linear-gradient(135deg,rgba(255,255,255,.055),transparent 34%),var(--panel);
      box-shadow:var(--shadow);
      backdrop-filter:blur(16px);
    }
    .card:has(table){padding:0}
    label{
      display:block;
      margin:0 0 7px;
      color:var(--muted);
      font-size:13px;
      font-weight:850;
    }
    input,textarea,select{
      width:100%;
      min-width:0;
      box-sizing:border-box;
      margin:0 0 16px;
      border:1px solid var(--line-strong);
      border-radius:15px;
      color:var(--text);
      background:linear-gradient(135deg,rgba(255,101,200,.08),transparent 42%),var(--field);
      outline:none;
      transition:border-color .18s ease,box-shadow .18s ease,background .18s ease;
    }
    input,select{height:48px;padding:0 14px}
    textarea{min-height:330px;padding:14px;line-height:1.68;resize:vertical}
    input:focus,textarea:focus,select:focus{
      border-color:rgba(255,101,200,.58);
      box-shadow:0 0 0 4px rgba(255,101,200,.1);
    }
    select option{background:#252936;color:#f7f2f7}
    .grid{
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:16px;
    }
    .btn{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      min-height:42px;
      padding:0 17px;
      border:1px solid transparent;
      border-radius:999px;
      color:#241825;
      background:linear-gradient(135deg,var(--accent),#ff8ed8);
      box-shadow:var(--glow);
      font-weight:900;
      cursor:pointer;
      transition:transform .18s ease,box-shadow .18s ease,filter .18s ease;
    }
    .btn:hover{transform:translateY(-1px);filter:saturate(1.05)}
    .muted{color:var(--muted);line-height:1.7}
    table{
      width:100%;
      border-collapse:collapse;
      overflow:hidden;
    }
    th,td{
      padding:14px 16px;
      border-bottom:1px solid var(--line);
      text-align:left;
      vertical-align:top;
    }
    th{
      color:var(--soft);
      background:rgba(255,255,255,.04);
      font-size:12px;
      letter-spacing:.12em;
      text-transform:uppercase;
    }
    td{color:rgba(247,242,247,.82)}
    tr:last-child td{border-bottom:0}
    td a{
      display:inline-flex;
      align-items:center;
      min-height:32px;
      padding:0 11px;
      border:1px solid rgba(255,101,200,.28);
      border-radius:999px;
      color:var(--accent);
      background:rgba(255,101,200,.07);
      font-weight:800;
    }
    .row-actions{
      display:flex;
      flex-wrap:wrap;
      gap:8px;
      align-items:center;
    }
    .row-actions form{
      margin:0;
    }
    .danger-btn{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      min-height:34px;
      padding:0 12px;
      border:1px solid rgba(158,77,100,.34);
      border-radius:999px;
      color:#7b2f47;
      background:rgba(158,77,100,.08);
      font-weight:850;
      cursor:pointer;
      transition:background .18s ease,transform .18s ease,border-color .18s ease;
    }
    .danger-btn:hover{
      transform:translateY(-1px);
      background:rgba(158,77,100,.14);
      border-color:rgba(158,77,100,.48);
    }
    .destroy-btn{
      color:#fff;
      background:#9e4d64;
      border-color:rgba(120,35,58,.32);
      box-shadow:none;
    }
    .destroy-btn:hover{
      background:#8c3f57;
      border-color:rgba(120,35,58,.48);
    }
    .danger{background:#6f2d44;color:#fff}
    .login-shell{
      min-height:calc(100svh - 48px);
      display:grid;
      place-items:center;
    }
    .login-shell .card{
      width:min(460px,100%);
    }
    @media(max-width:860px){
      .layout{grid-template-columns:1fr}
      .side{
        position:relative;
        height:auto;
        display:grid;
        gap:14px;
        border-right:0;
        border-bottom:1px solid var(--line);
      }
      nav{display:flex;overflow-x:auto;padding-bottom:2px}
      nav a{flex:0 0 auto}
      .main{padding-top:18px}
      .topbar{display:grid}
    }
    @media(max-width:640px){
      .grid{grid-template-columns:1fr}
      th,td{padding:12px}
      table{font-size:14px}
      .brand small{display:none}
      .row-actions{gap:6px}
      .row-actions a,
      .danger-btn{min-height:32px;padding:0 10px}
    }
    /* Frontend-aligned admin refresh. */
    :root{
      color-scheme:light;
      --bg:#fbfaf7;
      --panel:rgba(255,255,255,.84);
      --panel-solid:#fffdfb;
      --field:rgba(168,102,118,.065);
      --text:#302b27;
      --muted:rgba(48,43,39,.68);
      --soft:rgba(48,43,39,.48);
      --line:rgba(168,102,118,.16);
      --line-strong:rgba(168,102,118,.28);
      --accent:#ff75c4;
      --cyan:#9fc8be;
      --purple:#c79bad;
      --orange:#d8aa72;
      --shadow:0 18px 46px rgba(132,75,91,.11);
      --glow:0 0 30px rgba(255,117,196,.16);
    }
    body{
      background:
        linear-gradient(180deg,rgba(251,250,247,.82),rgba(251,250,247,.97)),
        url("/assets/sailei/sailei-main.jpg") right top / min(62vw,840px) auto no-repeat,
        radial-gradient(circle at 16% 8%,rgba(255,117,196,.09),transparent 30rem),
        radial-gradient(circle at 88% 18%,rgba(199,155,173,.12),transparent 34rem),
        var(--bg);
    }
    body::before{
      background:none;
      opacity:0;
    }
    body::after{
      opacity:.12;
      background-image:radial-gradient(rgba(80,60,70,.14) 1px,transparent 1px);
    }
    .side{
      background:linear-gradient(180deg,rgba(255,255,255,.86),rgba(255,239,246,.72));
      box-shadow:12px 0 34px rgba(132,75,91,.07);
    }
    .brand-mark{
      color:#302b27;
      background:linear-gradient(145deg,rgba(255,255,255,.96),rgba(255,117,196,.14));
      border-color:var(--line-strong);
      box-shadow:inset 0 1px 0 rgba(255,255,255,.78),var(--shadow);
    }
    nav a:hover,
    nav a.is-active{
      color:var(--text);
      background:rgba(255,117,196,.08);
      border-color:rgba(255,117,196,.22);
    }
    .topbar,
    .card{
      background:linear-gradient(135deg,rgba(255,117,196,.06),transparent 45%),rgba(255,255,255,.82);
      border-color:var(--line);
      box-shadow:var(--shadow);
    }
    .topbar{
      position:sticky;
      top:18px;
      z-index:5;
      backdrop-filter:blur(18px) saturate(1.04);
    }
    .status-pill{
      color:var(--text);
      background:rgba(255,117,196,.08);
      border-color:rgba(255,117,196,.22);
    }
    .status-pill::before{
      background:var(--accent);
      box-shadow:0 0 0 6px rgba(255,117,196,.12);
    }
    input,textarea,select{
      color:var(--text);
      background:linear-gradient(135deg,rgba(255,117,196,.08),transparent 42%),rgba(255,255,255,.72);
    }
    select option{background:#fffdfb;color:#302b27}
    th{background:rgba(255,117,196,.06)}
    td{color:var(--text)}
    td a,.link-pill{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      min-height:34px;
      padding:0 12px;
      border:1px solid rgba(255,117,196,.22);
      border-radius:999px;
      color:color-mix(in srgb,var(--accent) 72%,#4a343c);
      background:rgba(255,117,196,.07);
      font-weight:850;
    }
    .danger-btn{
      color:#8f3d55;
      background:rgba(158,77,100,.08);
      border-color:rgba(158,77,100,.24);
      box-shadow:none;
    }
    .danger-btn:hover{
      background:rgba(158,77,100,.13);
      border-color:rgba(158,77,100,.38);
    }
    .destroy-btn{
      color:#fff;
      background:#9e4d64;
      border-color:rgba(120,35,58,.3);
    }
    .destroy-btn:hover{
      background:#8c3f57;
      border-color:rgba(120,35,58,.46);
    }
    .btn{
      color:#302b27;
      background:linear-gradient(135deg,#ffd6ec,var(--accent));
      box-shadow:var(--glow);
    }
    .danger{
      background:#9e4d64;
      color:#fff;
    }
    .admin-grid{
      display:grid;
      grid-template-columns:repeat(3,minmax(0,1fr));
      gap:16px;
      margin-bottom:18px;
    }
    .stat-card strong{
      display:block;
      margin-bottom:8px;
      font-family:var(--serif);
      font-size:34px;
    }
    .toolbar{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:14px;
      margin-bottom:18px;
    }
    .toolbar-actions{
      display:flex;
      flex-wrap:wrap;
      gap:10px;
    }
    .editor-layout{
      display:grid;
      grid-template-columns:minmax(0,1fr) 340px;
      gap:18px;
      align-items:start;
    }
    .editor-card textarea{
      min-height:560px;
      font-family:"Cascadia Code","SFMono-Regular",Consolas,monospace;
      font-size:14px;
      line-height:1.72;
    }
    .meta-card{
      position:sticky;
      top:112px;
    }
    .hint-list{
      display:grid;
      gap:9px;
      margin:14px 0 0;
      padding:0;
      list-style:none;
      color:var(--muted);
      font-size:13px;
      line-height:1.6;
    }
    .project-title-cell strong{
      display:block;
      margin-bottom:5px;
      font-size:15px;
    }
    .project-title-cell small{
      color:var(--soft);
    }
    .project-progress{
      height:8px;
      border-radius:99px;
      background:rgba(255,117,196,.08);
      overflow:hidden;
    }
    .project-progress span{
      display:block;
      height:100%;
      border-radius:inherit;
      background:linear-gradient(90deg,var(--accent),#ffd1ec,var(--cyan));
    }
    .flash{
      margin-bottom:16px;
      padding:12px 14px;
      border:1px solid rgba(84,180,126,.22);
      border-radius:14px;
      color:#31553f;
      background:rgba(84,180,126,.08);
      font-weight:800;
    }
    .file-drop{
      padding:14px;
      border:1px dashed var(--line-strong);
      border-radius:15px;
      background:rgba(255,117,196,.04);
    }
    .file-drop input{
      height:auto;
      margin-bottom:0;
      padding:12px;
    }
    .text-editor textarea{
      min-height:84px;
    }
    .text-editor small{
      display:block;
      margin-top:4px;
      font-weight:650;
    }
    .footer-config{
      display:grid;
      gap:18px;
      margin:10px 0 24px;
    }
    .footer-config-section{
      padding:14px;
      border:1px solid var(--line);
      border-radius:16px;
      background:rgba(255,255,255,.035);
    }
    .footer-config-section h3{
      margin:0 0 12px;
      font-size:15px;
    }
    .footer-link-row{
      display:grid;
      grid-template-columns:minmax(110px,.7fr) minmax(160px,1.2fr) minmax(140px,1fr);
      gap:12px;
      align-items:start;
    }
    .gallery-link-row{
      display:grid;
      grid-template-columns:minmax(180px,1.4fr) 90px 90px;
      gap:12px;
      align-items:end;
    }
    .footer-link-row input{
      margin-bottom:12px;
    }
    .gallery-visible{
      display:flex;
      align-items:center;
      gap:8px;
      min-height:44px;
      color:var(--muted);
      font-weight:800;
    }
    .gallery-visible input{
      width:18px;
      height:18px;
      min-height:0;
      margin:0;
      accent-color:var(--accent);
    }
    @media(max-width:1040px){
      .admin-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      .editor-layout{grid-template-columns:1fr}
      .meta-card{position:relative;top:auto}
      .footer-link-row,.gallery-link-row{grid-template-columns:1fr}
    }
    @media(max-width:640px){
      .admin-grid{grid-template-columns:1fr}
      .toolbar{display:grid}
      .topbar{position:relative;top:auto}
    }
    /* Admin workspace v2: editor-first, dense and quiet. */
    :root{
      color-scheme:light;
      --bg:#f5f7fb;
      --panel:#ffffff;
      --panel-solid:#ffffff;
      --field:#f8fafc;
      --text:#1f2937;
      --muted:#667085;
      --soft:#98a2b3;
      --line:#e4e7ec;
      --line-strong:#cfd4dc;
      --accent:#2563eb;
      --cyan:#0891b2;
      --purple:#7c3aed;
      --orange:#d97706;
      --shadow:0 1px 2px rgba(16,24,40,.06),0 8px 24px rgba(16,24,40,.06);
      --glow:none;
      --sans:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC","Microsoft YaHei",sans-serif;
      --mono:"Cascadia Code","JetBrains Mono","SFMono-Regular",Consolas,monospace;
    }
    html,body{background:var(--bg)}
    body{
      color:var(--text);
      background:
        linear-gradient(180deg,#f8fafc 0,#f5f7fb 340px,#f5f7fb 100%);
      font-family:var(--sans);
    }
    body::before,body::after{display:none}
    .layout{
      grid-template-columns:236px minmax(0,1fr);
    }
    .side{
      padding:18px 14px;
      border-right:1px solid var(--line);
      background:rgba(255,255,255,.92);
      box-shadow:none;
      backdrop-filter:blur(12px);
    }
    .brand{
      min-height:46px;
      margin:0 4px 18px;
      padding:0 4px;
    }
    .brand-mark{
      width:36px;
      height:36px;
      border-radius:10px;
      color:#fff;
      border:0;
      background:#111827;
      box-shadow:none;
      font-size:13px;
    }
    .brand strong{
      font-family:var(--sans);
      font-size:16px;
      font-weight:760;
      letter-spacing:0;
    }
    .brand small{
      color:var(--soft);
      font-size:12px;
    }
    nav{gap:4px}
    nav a{
      min-height:38px;
      padding:0 10px;
      border-radius:9px;
      color:#475467;
      font-size:14px;
      font-weight:680;
    }
    nav a:hover,
    nav a.is-active{
      color:#175cd3;
      background:#eff6ff;
      border-color:#dbeafe;
      transform:none;
    }
    .main{
      padding:18px clamp(18px,2.6vw,34px) 48px;
    }
    .topbar{
      position:sticky;
      top:0;
      z-index:8;
      margin:-18px calc(clamp(18px,2.6vw,34px) * -1) 18px;
      padding:14px clamp(18px,2.6vw,34px);
      border:0;
      border-bottom:1px solid var(--line);
      border-radius:0;
      background:rgba(255,255,255,.88);
      box-shadow:none;
      backdrop-filter:blur(14px);
    }
    h1,h2,h3{font-family:var(--sans);letter-spacing:0}
    h1{font-size:22px;font-weight:760}
    h2{font-size:18px;font-weight:740}
    .admin-note{color:var(--muted);font-size:13px}
    .status-pill{
      min-height:30px;
      padding:0 10px;
      border-color:#bbf7d0;
      color:#166534;
      background:#f0fdf4;
      font-size:12px;
      font-weight:700;
    }
    .status-pill::before{
      width:7px;
      height:7px;
      background:#22c55e;
      box-shadow:none;
    }
    .card{
      margin-bottom:14px;
      padding:18px;
      border:1px solid var(--line);
      border-radius:12px;
      background:var(--panel);
      box-shadow:var(--shadow);
      backdrop-filter:none;
    }
    .card::before{display:none}
    label{
      color:#344054;
      font-size:12px;
      font-weight:700;
    }
    input,textarea,select{
      border:1px solid var(--line-strong);
      border-radius:9px;
      color:var(--text);
      background:var(--field);
      box-shadow:0 1px 2px rgba(16,24,40,.04);
    }
    input,select{height:40px;padding:0 11px}
    textarea{
      min-height:280px;
      padding:12px;
      line-height:1.72;
    }
    input:focus,textarea:focus,select:focus{
      border-color:#84adff;
      box-shadow:0 0 0 3px rgba(37,99,235,.12);
      background:#fff;
    }
    select option{background:#fff;color:var(--text)}
    .btn,
    .link-pill{
      min-height:36px;
      padding:0 13px;
      border-radius:8px;
      color:#fff;
      background:#2563eb;
      border:1px solid #2563eb;
      box-shadow:0 1px 2px rgba(16,24,40,.06);
      font-weight:720;
    }
    .btn:hover,.link-pill:hover{transform:none;filter:none;background:#1d4ed8}
    .link-pill{
      color:#344054;
      background:#fff;
      border-color:var(--line-strong);
    }
    .link-pill:hover{
      color:#175cd3;
      background:#eff6ff;
      border-color:#bfdbfe;
    }
    .danger-btn{
      min-height:32px;
      border-radius:8px;
      color:#b42318;
      background:#fff;
      border-color:#fecdca;
      font-weight:700;
    }
    .destroy-btn{
      color:#fff;
      background:#d92d20;
      border-color:#d92d20;
    }
    .danger-btn:hover{transform:none;background:#fff5f5}
    .destroy-btn:hover{background:#b42318}
    .toolbar{
      align-items:flex-start;
      gap:12px;
      margin-bottom:14px;
    }
    .toolbar h2{margin-bottom:4px}
    .toolbar-actions{gap:8px}
    .admin-grid{
      grid-template-columns:repeat(3,minmax(0,1fr));
      gap:12px;
    }
    .stat-card strong{
      font-family:var(--sans);
      font-size:28px;
      font-weight:780;
    }
    table{font-size:14px}
    th,td{
      padding:12px 14px;
      border-bottom:1px solid var(--line);
    }
    th{
      color:#667085;
      background:#f9fafb;
      font-size:11px;
      font-weight:780;
      letter-spacing:.08em;
    }
    td{color:var(--text)}
    td a{
      min-height:30px;
      padding:0 10px;
      border-radius:8px;
      color:#175cd3;
      background:#eff6ff;
      border-color:#bfdbfe;
      font-weight:700;
    }
    .row-actions{gap:6px}
    .editor-layout{
      grid-template-columns:minmax(0,1fr) 320px;
      gap:14px;
    }
    .editor-card{
      padding:0;
      overflow:hidden;
    }
    .editor-card .toolbar{
      margin:0;
      padding:14px 16px;
      border-bottom:1px solid var(--line);
      background:#fff;
    }
    .editor-card textarea,
    textarea.editor-textarea{
      min-height:calc(100svh - 252px);
      margin:0;
      border:0;
      border-radius:0;
      box-shadow:none;
      background:#fff;
      font-family:var(--mono);
      font-size:14px;
      line-height:1.78;
      tab-size:2;
    }
    .editor-card textarea:focus,
    textarea.editor-textarea:focus{
      box-shadow:inset 0 0 0 2px rgba(37,99,235,.12);
    }
    .editor-status{
      display:flex;
      justify-content:space-between;
      gap:10px;
      padding:9px 14px;
      border-top:1px solid var(--line);
      color:var(--muted);
      background:#f9fafb;
      font-size:12px;
    }
    .meta-card{
      top:72px;
      padding:16px;
    }
    .meta-card h2{
      margin:0 0 12px;
      font-size:16px;
    }
    .hint-list{font-size:12px}
    .text-editor textarea{min-height:88px}
    .footer-config-section{
      background:#f9fafb;
      border-radius:12px;
    }
    .footer-link-row{
      grid-template-columns:minmax(120px,.7fr) minmax(180px,1.2fr) minmax(160px,1fr);
    }
    .gallery-link-row{
      grid-template-columns:minmax(180px,1.4fr) 90px 90px;
    }
    .login-shell .card{box-shadow:var(--shadow)}
    @media(max-width:1040px){
      .editor-layout{grid-template-columns:1fr}
      .meta-card{position:relative;top:auto}
    }
    @media(max-width:860px){
      .layout{grid-template-columns:1fr}
      .side{
        position:relative;
        height:auto;
        border-right:0;
        border-bottom:1px solid var(--line);
      }
      .topbar{margin:0 0 16px;padding:14px;border:1px solid var(--line);border-radius:12px}
      nav{display:flex;overflow-x:auto}
    }
    @media(max-width:640px){
      .main{padding:14px}
      .admin-grid,.grid{grid-template-columns:1fr}
      .editor-card textarea,
      textarea.editor-textarea{min-height:58svh}
      .footer-link-row,.gallery-link-row{grid-template-columns:1fr}
    }

    /* Admin polish pass 13: pink character-file login, matching the public Sailei archive instead of a generic panel. */
    body:has(.login-shell){
      min-height:100svh;
      color:#2c1436;
      background:
        radial-gradient(circle at 18% 18%,rgba(255,85,178,.16),transparent 25rem),
        radial-gradient(circle at 78% 26%,rgba(133,102,236,.14),transparent 28rem),
        linear-gradient(180deg,rgba(255,246,252,.9),rgba(255,236,248,.96)),
        linear-gradient(rgba(255,85,178,.055) 1px,transparent 1px),
        linear-gradient(90deg,rgba(255,85,178,.055) 1px,transparent 1px);
      background-size:auto,auto,auto,36px 36px,36px 36px;
    }
    body:has(.login-shell)::before{
      display:block;
      content:"";
      position:fixed;
      right:max(22px,8vw);
      bottom:-8px;
      z-index:-1;
      width:min(520px,42vw);
      aspect-ratio:3/4;
      opacity:.18;
      background:url("/admin/assets/sailei/hero-anime-v2.webp") center bottom / contain no-repeat;
      filter:saturate(1.04) drop-shadow(0 28px 42px rgba(44,20,54,.18));
      mask-image:linear-gradient(180deg,transparent 0,#000 12%,#000 72%,transparent 100%);
    }
    body:has(.login-shell)::after{
      display:block;
      content:"";
      position:fixed;
      inset:0;
      z-index:-1;
      pointer-events:none;
      opacity:.42;
      background:
        radial-gradient(circle at 24px 24px,rgba(255,85,178,.16) 0 1.5px,transparent 2px) 0 0 / 28px 28px,
        repeating-linear-gradient(-12deg,transparent 0 18px,rgba(255,255,255,.5) 18px 20px);
      mix-blend-mode:normal;
    }
    body:has(.login-shell) .layout{display:block;min-height:100svh}
    body:has(.login-shell) .side,
    body:has(.login-shell) .topbar{display:none!important}
    body:has(.login-shell) .main{min-height:100svh;padding:0!important;display:grid;place-items:center}
    .login-shell{
      width:min(1060px,calc(100% - 36px));
      min-height:auto!important;
      display:grid!important;
      grid-template-columns:minmax(0,.95fr) minmax(390px,440px);
      gap:28px;
      align-items:center;
      position:relative;
    }
    .login-shell::before{
      content:"SAILEI ADMIN / SECURE FILE";
      align-self:stretch;
      min-height:420px;
      display:flex;
      align-items:flex-end;
      padding:28px;
      border:3px solid rgba(255,255,255,.88);
      outline:1px solid rgba(44,20,54,.13);
      border-radius:34px 46px 32px 46px;
      color:#fff;
      font-family:ui-monospace,SFMono-Regular,Consolas,monospace;
      font-size:.76rem;
      font-weight:1000;
      letter-spacing:.16em;
      background:
        linear-gradient(180deg,rgba(31,91,108,.08) 0 34%,rgba(42,14,58,.62) 100%),
        linear-gradient(90deg,rgba(255,255,255,.18) 1px,transparent 1px),
        linear-gradient(0deg,rgba(255,255,255,.18) 1px,transparent 1px),
        url("/admin/assets/sailei/hero-anime-v2.webp") center / cover no-repeat;
      background-size:auto,54px 54px,54px 54px,cover;
      box-shadow:10px 12px 0 rgba(44,20,54,.1),0 26px 60px rgba(44,20,54,.14);
      text-shadow:0 2px 0 rgba(44,20,54,.28);
      transform:rotate(-.8deg);
    }
    .login-shell::after{
      content:"ACCESS CARD";
      position:absolute;
      left:28px;
      top:26px;
      padding:7px 14px;
      border:2px solid #2c1436;
      border-radius:999px;
      color:#fff;
      font-family:ui-monospace,SFMono-Regular,Consolas,monospace;
      font-size:.62rem;
      font-weight:1000;
      letter-spacing:.14em;
      background:linear-gradient(135deg,#ef2f94,#8566ec);
      box-shadow:4px 5px 0 rgba(44,20,54,.16);
      transform:rotate(-2deg);
    }
    .login-shell .card{
      position:relative;
      width:100%!important;
      margin:0;
      padding:34px 34px 32px;
      border:3px solid rgba(255,255,255,.92);
      outline:1px solid rgba(44,20,54,.13);
      border-radius:30px 38px 28px 38px;
      color:#2c1436;
      background:
        radial-gradient(circle at 14px 14px,rgba(255,85,178,.18) 0 2px,transparent 3px),
        linear-gradient(180deg,rgba(255,255,255,.96),rgba(255,239,249,.9));
      background-size:24px 24px,auto;
      box-shadow:8px 10px 0 rgba(44,20,54,.1),0 24px 62px rgba(44,20,54,.13)!important;
      overflow:hidden;
    }
    .login-shell .card::before{
      display:block;
      content:"SAILEI ADMIN";
      position:absolute;
      right:20px;
      top:20px;
      z-index:1;
      padding:6px 12px;
      border:2px solid #2c1436;
      border-radius:999px;
      color:#fff;
      font-family:ui-monospace,SFMono-Regular,Consolas,monospace;
      font-size:.62rem;
      font-weight:1000;
      letter-spacing:.13em;
      background:linear-gradient(135deg,#ef2f94,#8566ec);
      box-shadow:3px 4px 0 rgba(44,20,54,.14);
    }
    .login-shell .card::after{
      content:"JL";
      position:absolute;
      right:-20px;
      bottom:-28px;
      color:rgba(255,85,178,.1);
      font-size:8rem;
      font-weight:1000;
      letter-spacing:-.12em;
      line-height:.8;
      transform:rotate(-9deg);
    }
    .login-shell h2{
      position:relative;
      z-index:2;
      margin:44px 0 8px;
      color:#2c1436;
      font-family:"Ink Free","Segoe Print","MV Boli","Arial Black",system-ui,sans-serif;
      font-size:clamp(2rem,4vw,3.2rem);
      font-style:italic;
      font-weight:1000;
      letter-spacing:-.08em;
      text-shadow:1px 1px 0 #fff,4px 4px 0 rgba(255,85,178,.18);
    }
    .login-shell .muted{
      position:relative;
      z-index:2;
      margin-bottom:24px;
      color:#6f4b6d;
      font-weight:780;
    }
    .login-shell label{
      position:relative;
      z-index:2;
      color:#6f3f66;
      font-size:.74rem;
      letter-spacing:.08em;
      text-transform:uppercase;
    }
    .login-shell input{
      position:relative;
      z-index:2;
      height:46px;
      border:2px solid rgba(44,20,54,.12);
      border-radius:999px;
      color:#2c1436;
      background:rgba(255,255,255,.78);
      box-shadow:inset 0 -2px 0 rgba(255,85,178,.08),3px 4px 0 rgba(44,20,54,.05);
    }
    .login-shell input:focus{
      border-color:rgba(255,85,178,.62);
      box-shadow:0 0 0 4px rgba(255,85,178,.14),3px 4px 0 rgba(44,20,54,.07);
    }
    .login-shell .btn{
      position:relative;
      z-index:2;
      width:100%;
      height:48px;
      margin-top:8px;
      border:2px solid #2c1436;
      border-radius:999px;
      color:#fff;
      background:linear-gradient(135deg,#ff55b2,#ef2f94 58%,#8566ec);
      box-shadow:5px 6px 0 rgba(44,20,54,.18),0 16px 34px rgba(255,85,178,.2);
    }
    @media(max-width:860px){
      .login-shell{grid-template-columns:1fr;width:min(460px,calc(100% - 24px));padding:18px 0}
      .login-shell::before,.login-shell::after{display:none}
      .login-shell .card{padding:28px 24px 26px;border-radius:26px}
      .login-shell h2{margin-top:40px;font-size:2.4rem}
    }

  </style>
</head>
<body>
  <div class="layout">
    <aside class="side">
      <a class="brand" href="/admin">
        <span class="brand-mark">JL</span>
        <span><strong>Jlemonz</strong><small>后台工作台</small></span>
      </a>
      <nav aria-label="后台导航">
        <a href="/admin">概览</a>
        <a href="/admin/posts">文章</a>
        <a href="/admin/moments">瞬间</a>
        <a href="/admin/projects">项目</a>
        <a href="/admin/texts">文案</a>
        <a href="/admin/content-cleanup">清理</a>
        <a href="/admin/settings">设置</a>
        <a href="/admin/logout">退出</a>
      </nav>
    </aside>
    <main class="main">
      <div class="topbar">
        <div>
          <h1>${title}</h1>
          <p class="admin-note">写作、记录和维护入口，仅建议在本地或内网使用。</p>
        </div>
        <span class="status-pill">online</span>
      </div>
      ${content}
    </main>
  </div>
  <script>
    (() => {
      const path = window.location.pathname;
      document.querySelectorAll('.side nav a').forEach((link) => {
        const href = link.getAttribute('href') || '';
        if (href === '/admin' ? path === '/admin' : path.startsWith(href)) link.classList.add('is-active');
      });
      document.querySelectorAll('textarea[name="content_md"]').forEach((textarea) => {
        textarea.classList.add('editor-textarea');
        const form = textarea.closest('form');
        const status = document.createElement('div');
        status.className = 'editor-status';
        textarea.insertAdjacentElement('afterend', status);
        const update = () => {
          const text = textarea.value || '';
          const lines = text ? text.split('\\n').length : 0;
          const chars = text.length;
          const words = (text.trim().match(/[\\w\\u4e00-\\u9fff]+/g) || []).length;
          status.innerHTML = '<span>' + lines + ' lines</span><span>' + chars + ' chars / ' + words + ' words</span>';
        };
        textarea.addEventListener('input', update);
        textarea.addEventListener('keydown', (event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            form?.requestSubmit();
          }
          if (event.key === 'Tab') {
            event.preventDefault();
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            textarea.setRangeText('  ', start, end, 'end');
            update();
          }
        });
        update();
      });
    })();
  </script>
</body></html>`;
}

const fallbackQuotes = [
  {
    "text": "把想说的话慢慢写下来。",
    "from": "Hz"
  },
  {
    "text": "把复杂的事情拆小，再一个一个收拾干净。",
    "from": "Hz"
  },
  {
    "text": "今天也先别着急变厉害，先把一个页面做得好看。",
    "from": "Hz"
  }
];

const frontendTextDefaults = [];

const footerSectionLimit = 4;
const footerLinkLimit = 6;
const aboutGalleryImageLimit = 1000;
const footerSettingKey = "footer_sections_v1";
const defaultFooterSections = [];
const frontendLayoutSettingKey = "frontend_layout_v1";
const defaultFrontendLayout = {
  home: {
    width: "balanced",
    density: "comfortable",
    projectPreviewLimit: 4,
    momentPreviewLimit: 2,
    showStatusStrip: true,
    showProjectPreview: true,
    showMomentPreview: true,
    showProfileCard: true,
    showStatsCard: true,
    showCategoryCard: true
  },
  archive: {
    defaultCategory: "",
    showSearchPanel: true,
    showGithubPanel: true
  },
  moments: {
    defaultKind: "all",
    showDraftPanel: true
  },
  projects: {
    cardStyle: "cover",
    showRoadmap: true,
    showMaintain: true
  },
  footer: {
    motion: "candles"
  }
};
const frontendUiSettingKey = "frontend_ui_v1";
const frontendEditorBackupKey = "frontend_editor_backup_v1";
const frontendEditorDraftKey = "frontend_editor_draft_v1";
const defaultFrontendUi = {};

const cleanFrontendTextDefaults = [
  { group: "全站导航", key: "shared.nav.home", label: "导航：首页", defaultValue: "首页" },
  { group: "全站导航", key: "shared.nav.moments", label: "导航：瞬间", defaultValue: "瞬间" },
  { group: "全站导航", key: "shared.nav.archive", label: "导航：小记", defaultValue: "小记" },
  { group: "全站导航", key: "shared.nav.interview", label: "导航：面试", defaultValue: "面试" },
  { group: "全站导航", key: "shared.nav.projects", label: "导航：项目", defaultValue: "项目" },
  { group: "全站导航", key: "shared.nav.about", label: "导航：关于", defaultValue: "关于" },
  { group: "全站搜索", key: "shared.search.tip", label: "顶部搜索提示", defaultValue: "搜索" },
  { group: "全站搜索", key: "shared.search.placeholder", label: "顶部搜索按钮文字", defaultValue: "搜索" },
  { group: "全站搜索", key: "shared.search.title", label: "搜索弹窗标题", defaultValue: "检索一条旧记录" },
  { group: "全站搜索", key: "shared.search.input", label: "搜索输入提示", defaultValue: "试试 Ubuntu、ROS、FOC、机器人项目..." },
  { group: "首页", key: "home.hero.kicker", label: "首页 Hero 小字", defaultValue: "Ubuntu / ROS / FOC" },
  { group: "首页", key: "home.hero.title", label: "首页标题", defaultValue: "Jlemonz" },
  { group: "首页", key: "home.hero.lead", label: "首页主说明", defaultValue: "沉没成本不参与重大决策" },
  { group: "首页", key: "home.status.build.title", label: "首页状态卡 1 标题", defaultValue: "复盘" },
  { group: "首页", key: "home.status.build.body", label: "首页状态卡 1 说明", defaultValue: "把复盘、踩坑和有价值的线索整理成档案。" },
  { group: "首页", key: "home.status.trace.title", label: "首页状态卡 2 标题", defaultValue: "拆解" },
  { group: "首页", key: "home.status.trace.body", label: "首页状态卡 2 说明", defaultValue: "把模糊问题拆成能验证的小步骤。" },
  { group: "首页", key: "home.status.mode.title", label: "首页状态卡 3 标题", defaultValue: "日常" },
  { group: "首页", key: "home.status.mode.body", label: "首页状态卡 3 说明", defaultValue: "服务器笔记、日常碎片和小支线慢慢归档。" },
  { group: "瞬间页", key: "moments.hero.kicker", label: "瞬间页小字", defaultValue: "瞬间碎片" },
  { group: "瞬间页", key: "moments.hero.title", label: "瞬间页标题", defaultValue: "Moments" },
  { group: "瞬间页", key: "moments.hero.lead", label: "瞬间页说明", defaultValue: "时间一点一点点的转\n                像一匹白马" },
  { group: "小记页", key: "archive.hero.kicker", label: "小记页小字", defaultValue: "小记档案" },
  { group: "小记页", key: "archive.hero.title", label: "小记页标题", defaultValue: "Notes" },
  { group: "小记页", key: "archive.hero.lead", label: "小记页说明", defaultValue: "灯火阑珊\n我的心借了你的光是明是暗" },
  { group: "小记页", key: "archive.search.kicker", label: "小记页筛选小字", defaultValue: "find back" },
  { group: "小记页", key: "archive.search.placeholder", label: "小记页筛选提示", defaultValue: "在小记里过滤标题..." },
  { group: "面试页", key: "interview.hero.kicker", label: "面试页小字", defaultValue: "面试作战室" },
  { group: "面试页", key: "interview.hero.title", label: "面试页标题", defaultValue: "Interview" },
  { group: "面试页", key: "interview.hero.lead", label: "面试页说明", defaultValue: "我以为能戒掉" },
  { group: "项目页", key: "projects.hero.kicker", label: "项目页小字", defaultValue: "项目档案" },
  { group: "项目页", key: "projects.hero.title", label: "项目页标题", defaultValue: "Projects" },
  { group: "项目页", key: "projects.hero.lead", label: "项目页说明", defaultValue: "我的故事只有你\n没有任何旁白" },
  { group: "关于页", key: "about.hero.kicker", label: "关于页小字", defaultValue: "关于我" },
  { group: "关于页", key: "about.hero.title", label: "关于页标题", defaultValue: "About" },
  { group: "关于页", key: "about.hero.lead", label: "关于页说明", defaultValue: "我好像做到了我想要的样子\n但却不能够再为你唱一首歌" },
  { group: "关于页", key: "about.current.title", label: "关于页当前状态标题", defaultValue: "当前状态" },
  { group: "关于页", key: "about.current.state", label: "关于页当前状态", defaultValue: "在线折腾" },
  { group: "关于页", key: "about.current.body", label: "关于页当前状态说明", defaultValue: "当前主线是 Ubuntu、ROS 和 FOC：把环境搭建、机器人通信、电机控制、项目复盘和面试训练串成一套长期可维护的公开档案。" },
  { group: "关于页", key: "about.comments.title", label: "关于页留言标题", defaultValue: "留言" },
  { group: "关于页", key: "about.contact.title", label: "关于页联系标题", defaultValue: "联系" },
  { group: "关于页", key: "about.contact.body", label: "关于页联系说明", defaultValue: "公开页面只放普通联系入口，不放私有服务、管理入口或内部地址。" },
  { group: "详情页", key: "detail.project.comments", label: "项目评论标题", defaultValue: "项目评论" },
  { group: "详情页", key: "detail.project.rule.title", label: "项目页总结标题", defaultValue: "ZJ" },
  { group: "详情页", key: "detail.project.rule.body", label: "项目页总结兜底", defaultValue: "总结生成中。" },
  { group: "详情页", key: "detail.post.comments", label: "小记评论标题", defaultValue: "小记评论" },
  { group: "详情页", key: "detail.post.public.title", label: "小记页公开说明标题", defaultValue: "公开札记" },
  { group: "详情页", key: "detail.post.public.body", label: "小记页公开说明", defaultValue: "这里只展示可以公开复盘的记录，不放后台入口、内网地址和敏感配置。" }
];

frontendTextDefaults.splice(0, frontendTextDefaults.length, ...cleanFrontendTextDefaults);
const legacyFrontendTextValues = new Map(Object.entries({
  "Pi5 / Linux / Notes": "Ubuntu / ROS / FOC",
  "Pi5 / Linux / 小记": "Ubuntu / ROS / FOC",
  "试试 Linux、服务器、博客、驱动学习...": "试试 Ubuntu、ROS、FOC、机器人项目...",
  REVIEW: "复盘",
  THINK: "拆解",
  PLAIN: "日常",
  moments: "瞬间碎片",
  Moments: "Moments",
  "Short logs, project traces and daily fragments.": "短记录、项目留痕和一点轻飘飘的日常。",
  notes: "小记档案",
  Notes: "Notes",
  "Articles, debug trails and long-form notes.": "灯火阑珊\n我的心借了你的光是明是暗",
  "Longer records, debug traces and reusable notes.": "灯火阑珊\n我的心借了你的光是明是暗",
  "interview room": "面试作战室",
  Interview: "Interview",
  projects: "项目档案",
  Projects: "Projects",
  "Project status, recent progress and next steps in one reviewable project board.": "我的故事只有你\n没有任何旁白",
  about: "关于我",
  About: "About",
  "Site status, messages and contact notes.": "我好像做到了我想要的样子\n但却不能够再为你唱一首歌"
}));
const localizeLegacyFrontendText = (value) => legacyFrontendTextValues.get(String(value || "").trim()) || value;
const frontendHeroTitleFallbacks = new Map([
  ["moments.hero.title", "Moments"],
  ["archive.hero.title", "Notes"],
  ["interview.hero.title", "Interview"],
  ["projects.hero.title", "Projects"],
  ["about.hero.title", "About"]
]);
const frontendHeroTitleAliases = new Map([
  ["瞬间", "Moments"],
  ["小记", "Notes"],
  ["札记", "Notes"],
  ["面试", "Interview"],
  ["项目", "Projects"],
  ["关于", "About"],
  ["Moments", "Moments"],
  ["Notes", "Notes"],
  ["Interview", "Interview"],
  ["Projects", "Projects"],
  ["About", "About"]
]);
function normalizeFrontendTextValue(key, value) {
  const text = localizeLegacyFrontendText(value);
  if (!frontendHeroTitleFallbacks.has(key)) return text;
  const trimmed = String(text || "").trim();
  return frontendHeroTitleAliases.get(trimmed) || frontendHeroTitleFallbacks.get(key);
}
defaultFooterSections.splice(0, defaultFooterSections.length,
  {
    title: "友链",
    links: [
      { label: "GitHub", href: "https://github.com/jlemonz", desc: "项目和学习记录" },
      { label: "交换友链", href: "/about#contact", desc: "公开联系方式" }
    ]
  },
  {
    title: "图库",
    links: [
      { label: "瞬间图文", href: "/moments.html", desc: "日常图文入口" },
      { label: "项目图片", href: "/projects.html", desc: "项目相关素材" },
      { label: "面试训练台", href: "/interview.html", desc: "机器人学习与今日题单" }
    ]
  }
);
Object.assign(defaultFrontendUi, {
  profile: { avatarUrl: "/assets/sailei/avatar.jpg" },
  archiveCategories: [
    { id: "ubuntu", label: "Ubuntu", slug: "ubuntu", description: "系统环境、命令行和服务部署记录", countText: "", href: "/archive.html?cat=ubuntu", visibleInHome: true, visibleInArchive: true, sortOrder: 10 },
    { id: "ros", label: "ROS", slug: "ros", description: "机器人通信、节点和工程实践", countText: "", href: "/archive.html?cat=ros", visibleInHome: true, visibleInArchive: true, sortOrder: 20 },
    { id: "foc", label: "FOC", slug: "foc", description: "电机控制、环路调试和驱动问题", countText: "", href: "/archive.html?cat=foc", visibleInHome: true, visibleInArchive: true, sortOrder: 30 },
    { id: "robot", label: "机器人项目", slug: "robot", description: "项目复盘、结构调试和阶段结论", countText: "", href: "/archive.html?cat=robot", visibleInHome: true, visibleInArchive: true, sortOrder: 40 }
  ],
  aboutStackItems: [
    { id: "database", label: "PostgreSQL / MySQL", visible: true, sortOrder: 10 },
    { id: "redis", label: "Redis", visible: true, sortOrder: 20 },
    { id: "meilisearch", label: "Meilisearch", visible: true, sortOrder: 30 },
    { id: "markdown", label: "Markdown", visible: true, sortOrder: 40 },
    { id: "nginx", label: "Nginx", visible: true, sortOrder: 50 },
    { id: "backup", label: "备份", visible: true, sortOrder: 60 }
  ],
  aboutGalleryImages: [],
  momentKinds: [
    { id: "all", label: "碎片", kind: "all", subLabel: "灵机一动", visible: true, sortOrder: 0 },
    { id: "project", label: "痕迹", kind: "project", subLabel: "合理摸鱼", visible: true, sortOrder: 10 },
    { id: "life", label: "日常", kind: "life", subLabel: "是这样的", visible: true, sortOrder: 20 }
  ],
  pageChips: {
    archive: [
      { id: "ubuntu", label: "Ubuntu", subLabel: "系统环境", visible: true, sortOrder: 10 },
      { id: "ros", label: "ROS", subLabel: "机器人", visible: true, sortOrder: 20 },
      { id: "foc", label: "FOC", subLabel: "电机控制", visible: true, sortOrder: 30 }
    ],
    projects: [
      { id: "public", label: "公开", subLabel: "只留可复盘内容", visible: true, sortOrder: 10 },
      { id: "progress", label: "进度", subLabel: "看得见", visible: true, sortOrder: 20 },
      { id: "next", label: "下一步", subLabel: "不丢线索", visible: true, sortOrder: 30 }
    ],
    interview: [
      { id: "study", label: "学习", subLabel: "知识卡", visible: true, sortOrder: 10 },
      { id: "daily50", label: "今日题单", subLabel: "50 题", visible: true, sortOrder: 20 },
      { id: "review", label: "复盘", subLabel: "见解保存", visible: true, sortOrder: 30 }
    ],
    about: [
      { id: "ubuntu", label: "Ubuntu", subLabel: "系统", visible: true, sortOrder: 10 },
      { id: "ros", label: "ROS", subLabel: "机器人", visible: true, sortOrder: 20 },
      { id: "foc", label: "FOC", subLabel: "电机控制", visible: true, sortOrder: 30 }
    ]
  },
  footer: {
    brandBody: "Ubuntu、ROS、FOC、项目和图文，慢慢归档。",
    tags: [
      { id: "ubuntu", label: "Ubuntu", visible: true, sortOrder: 10 },
      { id: "ros", label: "ROS", visible: true, sortOrder: 20 },
      { id: "foc", label: "FOC", visible: true, sortOrder: 30 }
    ]
  },
  searchSuggestions: [
    { id: "projects", label: "项目", href: "/projects.html", visible: true, sortOrder: 10 },
    { id: "notes", label: "小记", href: "/archive.html", visible: true, sortOrder: 20 },
    { id: "interview", label: "面试", href: "/interview.html", visible: true, sortOrder: 30 }
  ],
  sectionTitles: { homeProjects: "Projects", homeMoments: "Moments", homeCategory: "分类入口" }
});
const legacyUiTextValues = new Map(Object.entries({
  Project: "项目",
  Projects: "项目",
  Moment: "瞬间",
  Moments: "瞬间",
  Note: "小记",
  Notes: "小记",
  About: "关于",
  Blog: "FOC",
  博客: "FOC",
  Pi5: "ROS",
  PI5: "ROS",
  Linux: "Ubuntu",
  树莓派: "ROS",
  service: "服务",
  notes: "笔记",
  archive: "归档"
}));
const localizeLegacyUiText = (value) => legacyUiTextValues.get(String(value || "").trim()) || value;

function normalizeKnowledgeBrandBody(value) {
  const text = cleanText(value, 180);
  return text === "Linux、Pi5、项目和图文，慢慢归档。" ? defaultFrontendUi.footer.brandBody : text;
}

const localPreviewDate = "2026-07-18 09:00";
const fallbackCategories = [
  {
    "id": 1,
    "name": "Ubuntu",
    "slug": "ubuntu",
    "description": "系统环境、命令行和服务部署记录"
  },
  {
    "id": 2,
    "name": "ROS",
    "slug": "ros",
    "description": "机器人通信、节点和工程实践"
  },
  {
    "id": 3,
    "name": "FOC",
    "slug": "foc",
    "description": "电机控制、环路调试和驱动问题"
  },
  {
    "id": 4,
    "name": "机器人项目",
    "slug": "robot",
    "description": "项目复盘、结构调试和阶段结论"
  }
];

const fallbackProjects = [];

const fallbackMoments = [];

const fallbackPosts = [];

const fallbackInterviews = [];

const fallbackInterviewTopics = [];

const fallbackInterviewQuestions = [];

const fallbackInterviewReviews = [];

const fallbackReactions = new Map();
const fallbackComments = new Map();
const publicRateBuckets = new Map();

function cloneFallback(value) {
  return JSON.parse(JSON.stringify(value));
}

function isDatabaseConnectionError(error) {
  return ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "PROTOCOL_CONNECTION_LOST"].includes(error?.code)
    || /connect|ECONN|database|pool/i.test(String(error?.message || ""));
}

function markDatabaseUnavailable(error, label = "database") {
  if (isDatabaseConnectionError(error)) databaseAvailable = false;
  console.warn(`${label} unavailable, using local preview data:`, error?.message || error);
}

async function withPublicFallback(label, fallback, operation) {
  if (!databaseAvailable) return typeof fallback === "function" ? fallback() : cloneFallback(fallback);
  try {
    return await operation();
  } catch (error) {
    markDatabaseUnavailable(error, label);
    return typeof fallback === "function" ? fallback(error) : cloneFallback(fallback);
  }
}

function fallbackOverview() {
  return {
    stats: {
      posts: fallbackPosts.length,
      moments: fallbackMoments.length,
      projects: fallbackProjects.length,
      interviews: fallbackInterviews.length,
      categories: fallbackCategories.length
    },
    latestMoments: cloneFallback(fallbackMoments.slice(0, 3)),
    source: "local-preview"
  };
}

function fallbackAdminOverview() {
  const publishedPosts = fallbackPosts.filter((post) => post.status === "published").length;
  const activeProjects = fallbackProjects.filter((project) => project.status === "active").length;
  const publishedInterviews = fallbackInterviews.filter((item) => item.status === "published").length;
  return {
    stats: {
      posts: fallbackPosts.length,
      publishedPosts,
      draftPosts: fallbackPosts.length - publishedPosts,
      moments: fallbackMoments.length,
      projects: fallbackProjects.length,
      activeProjects,
      interviews: fallbackInterviews.length,
      publishedInterviews,
      interviewTopics: fallbackInterviewTopics.length,
      interviewQuestions: fallbackInterviewQuestions.length,
      interviewReviews: fallbackInterviewReviews.length,
      comments: Array.from(fallbackComments.values()).reduce((count, items) => count + items.length, 0),
      pendingComments: 0,
      users: 0,
      roles: 0,
      permissions: 0,
      auditLogs: 0,
      settingVersions: 0,
      contentVersions: 0,
      mediaAssets: 0,
      orphanMediaAssets: 0,
      searchJobs: 0,
      backupJobs: 0,
      trashItems: 0
    },
    recentPosts: cloneFallback(fallbackPosts.slice(0, 6).map(({ id, title, slug, status, published_at, created_at, updated_at }) => ({ id, title, slug, status, published_at, created_at, updated_at }))),
    recentProjects: cloneFallback(fallbackProjects.slice(0, 6).map(({ id, name, slug, progress, status, updated_at }) => ({ id, name, slug, progress, status, updated_at }))),
    recentMoments: cloneFallback(fallbackMoments.slice(0, 6).map(({ id, content, kind, status, created_at }) => ({ id, content, kind, status, created_at }))),
    source: "local-preview"
  };
}

function fallbackProjectItems() {
  return { items: fallbackProjects.map((project) => publicProject(cloneFallback(project))), source: "local-preview" };
}

function fallbackProjectDetail(key) {
  const item = fallbackProjects.find((project) => String(project.id) === String(key) || project.slug === key);
  if (!item) return null;
  const project = publicProject(cloneFallback(item));
  return { ...project, content_html: markdownToHtml(project.content_md || "") };
}

function fallbackInterviewItems(section = "") {
  const items = fallbackInterviews
    .filter((item) => !section || item.section === section)
    .map(({ content_md, ...item }) => publicInterview(cloneFallback(item)));
  return { items, source: "local-preview" };
}

function fallbackInterviewDetail(key) {
  const item = fallbackInterviews.find((entry) => String(entry.id) === String(key) || entry.slug === key);
  if (!item) return null;
  return publicInterview({ ...cloneFallback(item), content_html: markdownToHtml(item.content_md || "") });
}

function fallbackPostItems(cat = "") {
  const items = fallbackPosts
    .filter((post) => !cat || post.category_slug === cat || String(post.category || "").toLowerCase() === cat)
    .map(({ content_md, ...post }) => post);
  return { items: cloneFallback(items), source: "local-preview" };
}

function fallbackPostDetail(slug) {
  const post = fallbackPosts.find((item) => item.slug === slug);
  if (!post) return null;
  return { ...cloneFallback(post), content_html: markdownToHtml(post.content_md || "") };
}

function fallbackMomentItems(kind = "", keyword = "") {
  const q = String(keyword || "").trim().toLowerCase();
  const items = fallbackMoments
    .filter((moment) => {
      const tags = Array.isArray(moment.tags) ? moment.tags : parseTags(moment.tags);
      const text = `${moment.content || ""} ${moment.kind || ""} ${tags.join(" ")}`.toLowerCase();
      return (!kind || moment.kind === kind) && (!q || text.includes(q));
    })
    .map((moment) => ({ ...moment, tags: Array.isArray(moment.tags) ? moment.tags : parseTags(moment.tags) }));
  return { items: cloneFallback(items), source: "local-preview" };
}

function itemSummary(summary = "", markdown = "", fallback = "") {
  const text = cleanText(summary || stripMarkdown(markdown || "") || fallback, 220);
  return text || "Jlemonz 的公开内容档案。";
}

function contentDate(value, fallback = new Date()) {
  const date = value ? new Date(value) : new Date(fallback);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function contentTimestamp(item = {}) {
  return contentDate(item.updated_at || item.published_at || item.created_at).getTime();
}

function dedupeContentUrls(items = []) {
  const map = new Map();
  for (const item of items) {
    const current = map.get(item.path);
    if (!current || contentTimestamp(item) > contentTimestamp(current)) map.set(item.path, item);
  }
  return [...map.values()].sort((a, b) => contentTimestamp(b) - contentTimestamp(a));
}

function fallbackSyndicationItems() {
  const items = [
    ...fallbackPosts
      .filter((post) => post.status === "published")
      .map((post) => ({
        id: post.id,
        type: "post",
        title: post.title,
        summary: itemSummary(post.summary, post.content_md, post.title),
        category: post.category || "小记",
        path: `/post.html?slug=${encodeURIComponent(post.slug)}`,
        published_at: post.published_at,
        updated_at: post.updated_at || post.published_at
      })),
    ...fallbackProjects
      .filter((project) => project.status === "active")
      .map((project) => ({
        id: project.id,
        type: "project",
        title: project.name,
        summary: itemSummary(project.summary || project.status_text, project.content_md, project.name),
        category: "项目",
        path: `/project.html?id=${encodeURIComponent(project.id)}`,
        published_at: project.created_at,
        updated_at: project.updated_at || project.created_at
      })),
    ...fallbackInterviews
      .filter((item) => item.status === "published")
      .map((item) => ({
        id: item.id,
        type: "interview",
        title: item.title,
        summary: itemSummary(item.summary, item.content_md, item.title),
        category: interviewSectionLabel(item.section),
        path: `/interview.html?section=${encodeURIComponent(item.section)}`,
        published_at: item.created_at,
        updated_at: item.updated_at || item.created_at
      })),
    ...fallbackMoments
      .filter((moment) => moment.status === "published")
      .map((moment) => ({
        id: moment.id,
        type: "moment",
        title: `瞬间：${cleanText(moment.content, 34)}`,
        summary: itemSummary(moment.content, "", "瞬间"),
        category: moment.kind || "瞬间",
        path: `/moments.html?kind=${encodeURIComponent(moment.kind || "life")}`,
        published_at: moment.created_at,
        updated_at: moment.updated_at || moment.created_at
      }))
  ];
  return dedupeContentUrls(items);
}

async function publicSyndicationItems() {
  if (!databaseAvailable) return fallbackSyndicationItems();
  try {
    const [posts, projects, interviews, moments] = await Promise.all([
      query(`SELECT p.id, p.title, p.slug, p.summary, p.content_md, p.published_at, p.created_at, p.updated_at, c.name AS category
        FROM posts p LEFT JOIN categories c ON c.id=p.category_id
        WHERE p.status='published' AND p.deleted_at IS NULL
        ORDER BY p.published_at DESC, p.id DESC LIMIT 80`),
      query(`SELECT id, name, summary, status_text, content_md, created_at, updated_at
        FROM projects WHERE status='active' AND deleted_at IS NULL ORDER BY sort_order ASC, id ASC LIMIT 80`),
      query(`SELECT id, title, slug, section, summary, content_md, created_at, updated_at
        FROM interview_items WHERE status='published' AND deleted_at IS NULL ORDER BY sort_order ASC, updated_at DESC LIMIT 80`),
      query(`SELECT id, content, kind, created_at, updated_at
        FROM moments WHERE status='published' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 80`)
    ]);
    return dedupeContentUrls([
      ...posts.map((post) => ({
        id: post.id,
        type: "post",
        title: post.title,
        summary: itemSummary(post.summary, post.content_md, post.title),
        category: post.category || "小记",
        path: `/post.html?slug=${encodeURIComponent(post.slug)}`,
        published_at: post.published_at || post.created_at,
        updated_at: post.updated_at || post.published_at || post.created_at
      })),
      ...projects.map((project) => ({
        id: project.id,
        type: "project",
        title: project.name,
        summary: itemSummary(project.summary || project.status_text, project.content_md, project.name),
        category: "项目",
        path: `/project.html?id=${encodeURIComponent(project.id)}`,
        published_at: project.created_at,
        updated_at: project.updated_at || project.created_at
      })),
      ...interviews.map((item) => ({
        id: item.id,
        type: "interview",
        title: item.title,
        summary: itemSummary(item.summary, item.content_md, item.title),
        category: interviewSectionLabel(item.section),
        path: `/interview.html?section=${encodeURIComponent(item.section)}`,
        published_at: item.created_at,
        updated_at: item.updated_at || item.created_at
      })),
      ...moments.map((moment) => ({
        id: moment.id,
        type: "moment",
        title: `瞬间：${cleanText(moment.content, 34)}`,
        summary: itemSummary(moment.content, "", "瞬间"),
        category: moment.kind || "瞬间",
        path: `/moments.html?kind=${encodeURIComponent(moment.kind || "life")}`,
        published_at: moment.created_at,
        updated_at: moment.updated_at || moment.created_at
      }))
    ]);
  } catch (error) {
    markDatabaseUnavailable(error, "public syndication");
    return fallbackSyndicationItems();
  }
}

function fallbackSearchItems(keyword = "") {
  const q = String(keyword || "").trim().toLowerCase();
  if (!q) return { items: [], source: "local-preview" };
  const pool = [
    ...fallbackPosts.map((post) => ({ id: post.id, type: "post", title: post.title, summary: post.summary, category: post.category, url: `/post.html?slug=${encodeURIComponent(post.slug)}` })),
    ...fallbackProjects.map((project) => ({ id: project.id, type: "project", title: project.name, summary: project.summary || project.status_text, url: `/project.html?id=${encodeURIComponent(project.id)}` })),
    ...fallbackInterviews.map((item) => ({ id: item.id, type: "interview", title: item.title, summary: item.summary, category: interviewSectionLabel(item.section), url: `/interview.html?section=${encodeURIComponent(item.section)}` })),
    ...fallbackMoments.map((moment) => ({ id: moment.id, type: "moment", title: String(moment.content).slice(0, 34), summary: (moment.tags || []).map((tag) => `#${tag}`).join(" "), url: `/moments.html?kind=${encodeURIComponent(moment.kind)}` }))
  ];
  const items = pool.filter((item) => `${item.title} ${item.summary} ${item.category || ""}`.toLowerCase().includes(q)).slice(0, 12);
  return { items, source: "local-preview" };
}

function fallbackGithubContributions(username = "jlemonz") {
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let index = 364; index >= 0; index -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - index);
    days.push({
      date: day.toISOString().slice(0, 10),
      count: 0,
      level: 0
    });
  }
  return { username, total: 0, days, source: "github-unavailable" };
}
function fallbackMoyu() {
  return {
    date: new Date().toISOString().slice(0, 10),
    source: "local-preview",
    modules: [
      { kind: "status", label: "今日状态", title: "摸鱼力稳定上升", body: "先把页面细节打磨顺，再继续补内容。", percent: 72 },
      { kind: "dev", label: "开发", title: "正在整理前后端体验", body: "导航、后台和 GitHub 节奏保持一致。", percent: 66 },
      { kind: "note", label: "提示", title: "API 本地兜底已开启", body: "没有 MySQL 时也能预览主要页面。", percent: null }
    ]
  };
}

function fallbackSiteTextsPayload() {
  return {
    texts: {},
    rules: [],
    footerSections: undefined,
    layout: cloneFallback(defaultFrontendLayout),
    ui: cloneFallback(defaultFrontendUi),
    source: "local-preview"
  };
}

function fallbackReaction(target) {
  return { target, likes: fallbackReactions.get(target) || 0, reacted: false, source: "local-preview" };
}

function normalizeReactionTargets(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  const seen = new Set();
  return list.map((item) => cleanText(item, 160)).filter((target) => {
    if (!target || seen.has(target)) return false;
    seen.add(target);
    return true;
  }).slice(0, 1000);
}

function fallbackReactionBatch(targets) {
  return {
    items: normalizeReactionTargets(targets).map((target) => fallbackReaction(target)),
    source: "local-preview"
  };
}

function fallbackLike(target) {
  const likes = (fallbackReactions.get(target) || 0) + 1;
  fallbackReactions.set(target, likes);
  return { target, likes, counted: true, source: "local-preview" };
}

function fallbackCommentsForTarget(target) {
  return { target, items: cloneFallback(fallbackComments.get(target) || []), source: "local-preview" };
}

function fallbackAddComment(target, author_name, content, status = "published", moderation_reason = "") {
  const item = {
    id: Date.now(),
    target,
    author_name,
    content,
    status,
    moderation_reason,
    created_at: formatDateTime(new Date()),
    likes: 0
  };
  const items = status === "published"
    ? [item, ...(fallbackComments.get(target) || [])].slice(0, 80)
    : (fallbackComments.get(target) || []);
  fallbackComments.set(target, items);
  return {
    target,
    item,
    items: cloneFallback(items),
    pending: status !== "published",
    message: status === "published" ? "留言已发布" : "留言已进入审核队列",
    source: "local-preview"
  };
}

function reactionTargetParts(target = "") {
  const text = cleanText(target || "site-home", 160);
  const match = text.match(/^([a-z0-9_-]+):(.+)$/i);
  if (!match) return { target: text, target_type: "site", target_id: text };
  return {
    target: text,
    target_type: cleanKey(match[1], "site"),
    target_id: String(match[2] || "").slice(0, 120)
  };
}

function reactionActorHash(req, target, kind = "like") {
  return privacyHash([kind, target, clientFingerprint(req)].join(":"));
}

function clientFingerprint(req) {
  const raw = `${req.headers["x-forwarded-for"] || req.socket.remoteAddress || ""}|${req.headers["user-agent"] || ""}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

function privacyHash(value = "") {
  const salt = config.admin.sessionSecret || "joe-local";
  return crypto.createHash("sha256").update(`${salt}:${String(value || "")}`).digest("hex").slice(0, 64);
}

async function consumePublicRateLimit(req, action, maxCount, windowSeconds) {
  const key = `rate:${action}:${clientFingerprint(req)}`;
  const now = Date.now();
  const memory = publicRateBuckets.get(key);
  let state = memory && Number(memory.resetAt || 0) > now ? memory : await cacheGet(key);
  if (!state || Number(state.resetAt || 0) <= now) {
    state = { count: 0, resetAt: now + windowSeconds * 1000 };
  }
  state.count = Number(state.count || 0) + 1;
  publicRateBuckets.set(key, state);
  for (const [bucketKey, bucket] of publicRateBuckets) {
    if (Number(bucket.resetAt || 0) <= now) publicRateBuckets.delete(bucketKey);
  }
  await cacheSet(key, state, Math.max(1, Math.ceil((state.resetAt - now) / 1000)));
  return {
    allowed: state.count <= maxCount,
    remaining: Math.max(0, maxCount - state.count),
    retryAfter: Math.max(1, Math.ceil((state.resetAt - now) / 1000))
  };
}

function assessCommentModeration({ authorName = "", authorEmail = "", content = "" } = {}) {
  const reasons = [];
  const normalized = `${authorName} ${authorEmail} ${content}`.toLowerCase();
  const linkCount = (normalized.match(/https?:\/\/|www\./g) || []).length;
  const riskyWords = ["博彩", "澳门", "彩票", "代开", "加微信", "兼职刷单", "telegram", "whatsapp", "casino", "loan", "porn"];
  if (linkCount > 1) reasons.push("链接过多");
  if (riskyWords.some((word) => normalized.includes(word))) reasons.push("疑似广告词");
  if (/(.)\1{8,}/u.test(content)) reasons.push("重复字符过多");
  if (content.length > 260 && linkCount > 0) reasons.push("长文本带外链");
  if (authorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authorEmail)) reasons.push("邮箱格式异常");
  return {
    status: reasons.length ? "pending" : "published",
    reason: reasons.join("；")
  };
}

function cleanText(value, maxLength) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function cleanMultilineText(value, maxLength) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

function isLikelyMojibakeText(value) {
  const text = String(value || "");
  if (!text) return false;
  if (text.includes("\uFFFD") || /\?{2,}/.test(text)) return true;
  const hits = (text.match(/[\u93c2\u942c\u7035\u8270\u57c5\u68e3\u704f\u6924\u572d\u934f\u6fe0\u7ed4\u6b11\u5063\u93c8\u6769\u59dd\u4f7d\u5ae2\u9286]/g) || []).length;
  return hits >= 2 && hits / Math.max(text.length, 1) > 0.04;
}

function cleanKey(value, fallback = "") {
  const key = String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return key || fallback;
}

function cleanId(value) {
  const id = String(value || "").trim();
  return /^\d+$/.test(id) ? id : "";
}

function parseTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(value).split(/[,\uFF0C\u3001]/).map((item) => item.trim()).filter(Boolean);
  }
}

function parseInterviewFilterTags(value) {
  return [...new Set(parseTags(value)
    .map((tag) => cleanText(tag, 40))
    .filter(Boolean))]
    .slice(0, 12);
}

function parseJsonObject(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseJsonArray(value, fallback = []) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

const knownCmsPageKeys = ["home", "moments", "archive", "projects", "interview", "about"];

function publicCmsCacheKeys(...pageKeys) {
  const keys = new Set(["site:cms:all"]);
  for (const key of knownCmsPageKeys) keys.add(`site:cms:${key}`);
  for (const key of pageKeys) {
    const pageKey = cleanKey(key, "");
    if (pageKey) keys.add(`site:cms:${pageKey}`);
  }
  return Array.from(keys);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value = "") {
  return escapeHtml(value);
}

function clampNumber(value, min, max, fallback = 0) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeSlug(value = "", fallback = "project") {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
  return raw || `${fallback}-${Date.now().toString(36)}`;
}

function cleanDateValue(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (number) => String(number).padStart(2, "0");
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-");
}

function formatDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatPublicDateTime(value = new Date()) {
  if (!value) return "";
  if (typeof value === "string") {
    const text = value.trim();
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(text) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) {
      return text.replace("T", " ").slice(0, 16);
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function projectUpdateLabel(value = new Date()) {
  const formatted = formatDateTime(value);
  return formatted ? `最近更新：${formatted}` : "最近更新：刚刚";
}

function requestBaseUrl(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim()
    || (req.socket.encrypted ? "https" : "http");
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || `${config.host}:${config.port}`).split(",")[0].trim();
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function absolutePublicUrl(req, targetPath = "/") {
  if (/^https?:\/\//i.test(targetPath)) return targetPath;
  const pathName = String(targetPath || "/");
  return `${requestBaseUrl(req)}${pathName.startsWith("/") ? pathName : `/${pathName}`}`;
}

function xmlDate(value) {
  return contentDate(value).toISOString();
}

function rssDate(value) {
  return contentDate(value).toUTCString();
}

async function renderRss(req, res) {
  const items = (await publicSyndicationItems()).slice(0, 50);
  const siteUrl = requestBaseUrl(req);
  const latestDate = items[0]?.updated_at || new Date();
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml("Jlemonz 内容档案")}</title>
    <link>${escapeHtml(siteUrl)}</link>
    <atom:link href="${escapeHtml(absolutePublicUrl(req, "/rss.xml"))}" rel="self" type="application/rss+xml" />
    <description>${escapeHtml("Ubuntu、ROS、FOC、项目、面试、小记和瞬间的公开更新。")}</description>
    <language>zh-CN</language>
    <lastBuildDate>${rssDate(latestDate)}</lastBuildDate>
${items.map((item) => `    <item>
      <title>${escapeHtml(item.title)}</title>
      <link>${escapeHtml(absolutePublicUrl(req, item.path))}</link>
      <guid isPermaLink="false">${escapeHtml(`${item.type}:${item.id || item.path}`)}</guid>
      <pubDate>${rssDate(item.published_at || item.updated_at)}</pubDate>
      <category>${escapeHtml(item.category || item.type)}</category>
      <description>${escapeHtml(item.summary)}</description>
    </item>`).join("\n")}
  </channel>
</rss>`;
  return xml(res, body);
}

async function renderSitemap(req, res) {
  const now = new Date();
  const staticPages = [
    { path: "/", changefreq: "daily", priority: "1.0", updated_at: now },
    { path: "/archive", changefreq: "weekly", priority: "0.8", updated_at: now },
    { path: "/moments", changefreq: "daily", priority: "0.8", updated_at: now },
    { path: "/interview", changefreq: "weekly", priority: "0.8", updated_at: now },
    { path: "/projects", changefreq: "weekly", priority: "0.8", updated_at: now },
    { path: "/about", changefreq: "monthly", priority: "0.5", updated_at: now }
  ];
  const contentPages = (await publicSyndicationItems()).map((item) => ({
    path: item.path,
    changefreq: item.type === "moment" ? "daily" : "weekly",
    priority: item.type === "post" ? "0.7" : "0.6",
    updated_at: item.updated_at || item.published_at || now
  }));
  const pages = dedupeContentUrls([...staticPages, ...contentPages]);
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((item) => `  <url>
    <loc>${escapeHtml(absolutePublicUrl(req, item.path))}</loc>
    <lastmod>${xmlDate(item.updated_at).slice(0, 10)}</lastmod>
    <changefreq>${escapeHtml(item.changefreq || "weekly")}</changefreq>
    <priority>${escapeHtml(item.priority || "0.6")}</priority>
  </url>`).join("\n")}
</urlset>`;
  return xml(res, body);
}

function parseMarkdownDocument(markdown = "") {
  const source = String(markdown || "").replace(/^\uFEFF/, "");
  const result = { meta: {}, content: source };
  if (!source.startsWith("---\n") && !source.startsWith("---\r\n")) return result;
  const normalized = source.replace(/\r\n/g, "\n");
  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) return result;
  const metaBlock = normalized.slice(4, end).trim();
  const content = normalized.slice(end + 5).replace(/^\n+/, "");
  for (const line of metaBlock.split("\n")) {
    const match = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result.meta[key] = value;
  }
  result.content = content;
  return result;
}

function titleFromMarkdown(markdown = "") {
  const heading = String(markdown).match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : "";
}

function publicProject(row) {
  const updatedAt = row.updated_at || row.created_at || null;
  const computedUpdate = updatedAt ? projectUpdateLabel(updatedAt) : "";
  return {
    ...row,
    ai_summary: row.ai_summary || "",
    updated_at: updatedAt ? formatDateTime(updatedAt) : "",
    last_update: computedUpdate || row.last_update || projectUpdateLabel(new Date())
  };
}


const projectPublicColumns = "id, name, slug, summary, status_text, progress, last_update, sort_order, cover_url, content_md, ai_summary, created_at, updated_at";
const zzSummaryTitle = "ZJ";
const zzSummaryPending = "\u603b\u7ed3\u751f\u6210\u4e2d\u3002";

function projectAiSummarySource(project = {}) {
  return {
    name: String(project.name || ""),
    summary: String(project.summary || ""),
    status_text: String(project.status_text || ""),
    progress: Number(project.progress || 0),
    content_md: String(project.content_md || "")
  };
}

function projectAiSummaryHash(project = {}) {
  return crypto.createHash("sha256").update(JSON.stringify(projectAiSummarySource(project))).digest("hex");
}

function redactProjectSummarySource(value = "") {
  return String(value || "")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, "[redacted-address]")
    .replace(/\b(?:token|password|passwd|secret|api[_-]?key|authorization|bearer)\b\s*[:=]\s*[^\s,;??]+/gi, "[redacted-secret]")
    .replace(/https?:\/\/(?:localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)[^\s)?]+/gi, "[redacted-private-link]");
}

function projectAiSummaryFallback(project = {}) {
  const plain = redactProjectSummarySource(stripMarkdown([
    project.summary,
    project.status_text,
    project.content_md
  ].filter(Boolean).join("\n\n")));
  return cleanText(plain || `${project.name || "Project"} ${zzSummaryPending}`, 300);
}

function cleanProjectAiSummary(value = "", fallback = zzSummaryPending) {
  const text = cleanText(redactProjectSummarySource(stripMarkdown(String(value || "")))
    .replace(/^zz\s*(?:\u603b\u7ed3|summary)[:?\s]*/i, "")
    .replace(/^(?:\u603b\u7ed3|summary)[:?\s]*/i, "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, ""), 300);
  return text || fallback;
}

function projectAiSummaryPrompt(project = {}) {
  const content = redactProjectSummarySource(stripMarkdown(project.content_md || "")).slice(0, 6000);
  return [
    {
      role: "system",
      content: "You are a project review assistant. Return only valid JSON with the exact shape {\"summary\":\"...\"}. The summary must be concise Chinese, <=300 Chinese characters, no Markdown, no ports, tokens, secrets, private IPs, internal URLs, accounts, passwords, or sensitive configuration."
    },
    {
      role: "user",
      content: [
        "Generate a polished sidebar field named zz summary for this project.",
        "Focus on goal, current progress, key result, and next step. Be concrete and useful, not vague.",
        `name: ${project.name || ""}`,
        `summary: ${project.summary || ""}`,
        `status: ${project.status_text || ""}`,
        `progress: ${Number(project.progress || 0)}%`,
        `markdown: ${content || "empty"}`
      ].join("\n")
    }
  ];
}

async function generateProjectAiSummary(project = {}) {
  const fallback = projectAiSummaryFallback(project);
  try {
    const result = await callInterviewLlm(projectAiSummaryPrompt(project), process.env.PROJECT_SUMMARY_LLM_PROVIDER || "");
    const parsed = parseInterviewModelJson(result.content);
    return {
      ai_summary: cleanProjectAiSummary(parsed.summary || parsed.ai_summary || parsed.zzSummary || "", fallback),
      ai_summary_error: ""
    };
  } catch (error) {
    return {
      ai_summary: fallback,
      ai_summary_error: cleanText(error?.message || "AI summary generation failed", 500)
    };
  }
}

async function projectAiSummaryFields(project = {}, current = {}) {
  const hash = projectAiSummaryHash(project);
  const existing = cleanProjectAiSummary(current.ai_summary || "", "");
  if (current.ai_summary_source_hash === hash && existing && !isLikelyMojibakeText(existing)) {
    return {
      ai_summary: existing,
      ai_summary_source_hash: hash,
      ai_summary_error: current.ai_summary_error || ""
    };
  }
  const generated = await generateProjectAiSummary(project);
  return {
    ...generated,
    ai_summary_source_hash: hash
  };
}

function projectSummaryForDisplay(project = {}) {
  return cleanProjectAiSummary(project.ai_summary || "", projectAiSummaryFallback(project));
}

async function backfillProjectAiSummariesIfNeeded(limit = 200) {
  if (!databaseAvailable) return;
  const rows = await query(`SELECT * FROM projects
    WHERE status='active' AND deleted_at IS NULL
      AND (ai_summary IS NULL OR ai_summary='' OR ai_summary_source_hash IS NULL OR ai_summary_source_hash='')
    ORDER BY updated_at DESC, id DESC LIMIT :limit`, { limit });
  for (const row of rows) {
    try {
      const fields = await projectAiSummaryFields(row, {});
      await query(`UPDATE projects
        SET ai_summary=:ai_summary, ai_summary_source_hash=:ai_summary_source_hash,
          ai_summary_updated_at=NOW(), ai_summary_error=:ai_summary_error
        WHERE id=:id`, { ...fields, id: row.id });
    } catch (error) {
      console.warn("project ai summary backfill failed", row.id, error.message || error);
    }
  }
}

function projectDetailKeyFromUrl(url) {
  if (!url) return "";
  return cleanText(url.searchParams?.get("id") || url.searchParams?.get("slug") || "", 160);
}

function projectDetailKeyFromRequest(req, url) {
  const direct = projectDetailKeyFromUrl(url);
  if (direct) return direct;
  const referer = String(req.headers.referer || req.headers.referrer || "");
  if (!referer) return "";
  try {
    const refUrl = new URL(referer);
    if (refUrl.pathname.endsWith("/project.html")) return projectDetailKeyFromUrl(refUrl);
  } catch {}
  return "";
}

async function getPublicProjectDetail(key) {
  const cleanKeyValue = cleanText(key || "", 160);
  if (!cleanKeyValue) return null;
  const isId = /^\d+$/.test(cleanKeyValue);
  return getOne(`SELECT ${projectPublicColumns}
    FROM projects WHERE status='active' AND deleted_at IS NULL AND ${isId ? "id=:key" : "slug=:key"} LIMIT 1`, { key: cleanKeyValue });
}

function applyProjectAiSummaryTexts(texts = {}, project = null) {
  if (!project) return texts;
  return {
    ...texts,
    "detail.project.rule.title": zzSummaryTitle,
    "detail.project.rule.body": projectSummaryForDisplay(project)
  };
}

function zzSummaryArtTitleHtml() {
  const glyphs = [
    { text: "Z", fill: "#3b2d37", rotate: "-4deg", y: "2px", scale: "1.08" },
    { text: "J", fill: "#c56a9b", rotate: "3deg", y: "4px", scale: "1.04" }
  ];
  const spans = glyphs.map((glyph) => `<span style="display:inline-block;position:relative;color:${glyph.fill};-webkit-text-stroke:1.55px #46323e;text-shadow:0 .15em 0 #f4bad5,0 .18em .02em rgba(236,139,190,.5),0 10px 22px rgba(132,64,96,.2);transform:translateY(${glyph.y}) rotate(${glyph.rotate}) scale(${glyph.scale});">${escapeHtml(glyph.text)}</span>`).join("");
  return `<h2 class="zz-summary-art-title" aria-label="${escapeHtml(zzSummaryTitle)}" style="display:flex;align-items:flex-end;gap:1px;margin:0 0 13px;font-family:'Arial Black','Impact',var(--serif);font-size:clamp(31px,3.4vw,42px);font-weight:950;line-height:.92;letter-spacing:-.04em;font-style:normal;">${spans}</h2>`;
}

function projectAiSummaryCardHtml(project = null) {
  return `<section class="desk-card maintain-card zz-summary-card">
          ${zzSummaryArtTitleHtml()}
          <p data-text-key="detail.project.rule.body">${escapeHtml(project ? projectSummaryForDisplay(project) : zzSummaryPending)}</p>
        </section>`;
}

const footerEndingAssetVersion = "launch-20260824e";
const footerEndingInnerHtml = `    <div class="site-footer-inner footer-ending">
      <section class="footer-record-preview" aria-label="备案预览">
        <p class="footer-record-kicker">record preview</p>
        <h2>备案预留</h2>
        <p>这里先放一小段站点说明：Jlemonz 用来记录 Ubuntu、ROS、FOC、项目、小记和瞬间。后期备案号、主体信息和公网说明都可以放在这里。</p>
        <div class="footer-record-meta" aria-label="备案信息预留">
          <span>备案号待补</span>
          <span>Jlemonz &middot; 2026</span>
          <span>slowly written</span>
        </div>
      </section>
      <section class="footer-lyric-card" aria-label="页尾歌词">
        <p class="footer-lyric-kicker">lyrics</p>
        <blockquote data-footer-lyric>风从页面旁边经过<br><span>把今天翻到下一页</span></blockquote>
        <small data-footer-lyric-note>footer note &middot; rotating</small>
      </section>
    </div>`;

function applyFooterEndingHtml(body = "") {
  let next = String(body || "");
  const footerStart = next.indexOf('<footer class="site-footer"');
  const footerEnd = footerStart >= 0 ? next.indexOf("</footer>", footerStart) : -1;
  const innerStart = footerEnd >= 0 ? next.indexOf('<div class="site-footer-inner', footerStart) : -1;
  if (innerStart >= 0) {
    const pattern = /<\/?div\b[^>]*>/gi;
    pattern.lastIndex = innerStart;
    let depth = 0;
    let innerEnd = -1;
    let match;
    while ((match = pattern.exec(next)) && match.index < footerEnd) {
      if (match[0].startsWith("</")) {
        depth -= 1;
        if (depth === 0) {
          innerEnd = pattern.lastIndex;
          break;
        }
      } else {
        depth += 1;
      }
    }
    if (innerEnd > innerStart) {
      next = `${next.slice(0, innerStart)}${footerEndingInnerHtml}${next.slice(innerEnd)}`;
    }
  }
  return next
    .replace(/\/assets\/style\.css\?v=[^"']+/g, `/assets/style.css?v=${footerEndingAssetVersion}`)
    .replace(/\/assets\/app\.js\?v=[^"']+/g, `/assets/app.js?v=${footerEndingAssetVersion}`);
}

async function serveProjectDetailHtml(req, res, url) {
  if (!["GET", "HEAD"].includes(req.method)) return false;
  const candidates = [
    path.join(publicFrontendRoot, "project.html"),
    path.resolve(process.cwd(), "project.html"),
    path.resolve(process.cwd(), "src", "project.html"),
    path.resolve(process.cwd(), "public", "project.html")
  ];
  const file = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!file) return false;
  const key = projectDetailKeyFromRequest(req, url);
  const project = await withPublicFallback("project detail html", () => fallbackProjectDetail(key), () => getPublicProjectDetail(key));
  let body = await fs.promises.readFile(file, "utf8");
  body = body.replace(
    /<section\s+class=["']desk-card maintain-card["'][\s\S]*?<\/section>/i,
    projectAiSummaryCardHtml(project)
  );
  body = applyFooterEndingHtml(body);
  html(res, body);
  return true;
}

function interviewSectionLabel(section) {
  return ({
    bagu: "学习知识",
    experience: "复盘记录",
    daily50: "今日题单"
  })[section] || "面试";
}

function publicInterview(row = {}) {
  return {
    ...row,
    tags: parseTags(row.tags),
    section_label: interviewSectionLabel(row.section)
  };
}

function commentLikeTarget(id) {
  return `comment:${id}`;
}

async function publicCommentsForTarget(target) {
  return query(`SELECT c.id, c.target, c.author_name, c.content, c.created_at,
      COALESCE(r.count, 0) AS likes
    FROM comments c
    LEFT JOIN reactions r ON r.target=CONCAT('comment:', c.id) AND r.kind='like'
    WHERE c.target=:target AND c.status='published' AND c.deleted_at IS NULL
    ORDER BY c.created_at DESC, c.id DESC LIMIT 80`, { target });
}

async function deleteCommentsForTarget(target) {
  if (!target) return;
  await query("UPDATE comments SET status='hidden', deleted_at=COALESCE(deleted_at,NOW()) WHERE target=:target", { target });
}

async function ensureRbacSchema() {
  await query(`CREATE TABLE IF NOT EXISTS roles (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(80) NOT NULL UNIQUE,
    label VARCHAR(120) NOT NULL,
    description VARCHAR(255) DEFAULT '',
    is_system TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await query(`CREATE TABLE IF NOT EXISTS permissions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(120) NOT NULL UNIQUE,
    group_key VARCHAR(80) DEFAULT '',
    label VARCHAR(120) NOT NULL,
    description VARCHAR(255) DEFAULT '',
    created_at DATETIME NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await query(`CREATE TABLE IF NOT EXISTS role_permissions (
    role_id BIGINT NOT NULL,
    permission_id BIGINT NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    INDEX idx_role_permissions_permission (permission_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await query(`CREATE TABLE IF NOT EXISTS user_roles (
    user_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (user_id, role_id),
    INDEX idx_user_roles_role (role_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  for (const permission of adminPermissionCatalog) {
    await query(`INSERT INTO permissions(code, group_key, label, description, created_at)
      VALUES(:code, :group_key, :label, :description, NOW())
      ON DUPLICATE KEY UPDATE group_key=:group_key, label=:label, description=:description`, {
      code: permission.code,
      group_key: permission.group,
      label: permission.label,
      description: permission.description
    });
  }
  const roles = [
    { name: "owner", label: "Owner", description: "站点所有者，拥有全部后台权限。" },
    { name: "editor", label: "Editor", description: "内容编辑，可维护内容、页面装修、媒体和搜索。" },
    { name: "viewer", label: "Viewer", description: "只读观察者，可查看内容、审计和系统状态。" }
  ];
  for (const role of roles) {
    await query(`INSERT INTO roles(name, label, description, is_system, created_at)
      VALUES(:name, :label, :description, 1, NOW())
      ON DUPLICATE KEY UPDATE label=:label, description=:description, is_system=1`, role);
    await seedRolePermissions(role.name, rolePermissionPresets[role.name] || []);
  }
}

async function seedRolePermissions(roleName, permissionCodes) {
  const role = await getOne("SELECT id FROM roles WHERE name=:name", { name: roleName });
  if (!role) return;
  for (const code of permissionCodes) {
    const permission = await getOne("SELECT id FROM permissions WHERE code=:code", { code });
    if (!permission) continue;
    await query(`INSERT IGNORE INTO role_permissions(role_id, permission_id, created_at)
      VALUES(:role_id, :permission_id, NOW())`, { role_id: role.id, permission_id: permission.id });
  }
}

async function assignOwnerRoleToUser(userId) {
  if (!databaseAvailable || !(Number(userId) > 0)) return;
  try {
    await query(`INSERT IGNORE INTO user_roles(user_id, role_id, created_at)
      SELECT :user_id, id, NOW() FROM roles WHERE name='owner' LIMIT 1`, { user_id: userId });
  } catch (error) {
    console.warn("owner role assignment failed", error.message || error);
  }
}

async function adminIdentity(user) {
  if (!user) return null;
  const configuredAdmin = String(config.admin?.username || "").trim().toLowerCase();
  const currentUsername = String(user.username || "").trim().toLowerCase();
  if (configuredAdmin && currentUsername === configuredAdmin) {
    await assignOwnerRoleToUser(user.id);
    return { ...user, roles: ["owner"], permissions: adminPermissionCodes, isOwner: true, devMode: true };
  }
  if (user.preview || Number(user.id) === -1 || !databaseAvailable) {
    return { ...user, roles: ["owner"], permissions: adminPermissionCodes, isOwner: true, devMode: true };
  }
  const rows = await query(`SELECT r.name AS role, p.code AS permission
    FROM user_roles ur
    JOIN roles r ON r.id=ur.role_id
    LEFT JOIN role_permissions rp ON rp.role_id=r.id
    LEFT JOIN permissions p ON p.id=rp.permission_id
    WHERE ur.user_id=:user_id
    ORDER BY r.name ASC, p.code ASC`, { user_id: user.id });
  const roles = [...new Set(rows.map((row) => row.role).filter(Boolean))];
  const permissions = [...new Set(rows.map((row) => row.permission).filter(Boolean))];
  return { ...user, roles, permissions, isOwner: roles.includes("owner") || permissions.length === adminPermissionCodes.length };
}

function userCan(user, permission) {
  if (!permission) return true;
  if (user?.preview || user?.isOwner) return true;
  return Array.isArray(user?.permissions) && user.permissions.includes(permission);
}

function denyPermission(res, permission, user = null) {
  return json(res, {
    error: "forbidden",
    message: "缺少后台权限：" + permission + "。当前账号 " + (user?.username || "未识别") + "，角色 " + ((user?.roles || []).join(",") || "未分配") + "。开发阶段请重新登录，或检查 ADMIN_USERNAME 是否绑定 owner。",
    permission,
    user: user ? {
      username: user.username,
      roles: user.roles || [],
      isOwner: Boolean(user.isOwner),
      devMode: Boolean(user.devMode)
    } : null
  }, 403);
}

function adminPermissionForRequest(req, url) {
  if (url.pathname === "/admin/api/me") return "system:read";
  if (url.pathname === "/admin/api/overview") return "system:read";
  if (url.pathname === "/admin/api/system-status") return "system:read";
  if (url.pathname === "/admin/api/task-center") return "system:read";
  if (url.pathname === "/admin/api/interaction-insights") return "audit:read";
  if (url.pathname.startsWith("/admin/api/roles") || url.pathname.startsWith("/admin/api/users")) return req.method === "GET" ? "system:read" : "system:write";
  if (url.pathname === "/admin/api/audit-logs" || url.pathname === "/admin/api/audit-insights") return "audit:read";
  if (url.pathname === "/admin/api/sync-search") return "search:write";
  if (url.pathname === "/admin/api/uploads") return "media:write";
  const parts = url.pathname.split("/").filter(Boolean);
  const resource = parts[2] || "";
  const id = parts[3] || "";
  const action = parts[4] || "";
  const read = req.method === "GET";
  if (resource === "interview-daily") return read ? "content:read" : "content:publish";
  if (resource === "content-cleanup") return read ? "content:read" : "content:delete";
  if (["posts", "moments", "projects", "hz-quotes", "interviews", "interview-topics", "interview-questions", "interview-reviews", "interview-goals", "interview-goal-updates", "comments"].includes(resource)) {
    if (read) return "content:read";
    if (req.method === "DELETE") return "content:delete";
    if (["hide", "restore"].includes(action)) return "content:publish";
    return "content:write";
  }
  if (["page-blocks", "theme-settings", "navigation-items", "site-texts", "frontend-editor", "about-gallery", "setting-versions", "content-versions"].includes(resource)) {
    if (read) return "cms:read";
    if (resource === "content-versions" && action === "restore") return "content:publish";
    if (resource === "setting-versions" && action === "restore") return "cms:publish";
    if (resource === "frontend-editor" && ["publish", "restore"].includes(id || action)) return "cms:publish";
    if (req.method === "DELETE") return "cms:publish";
    return "cms:write";
  }
  if (resource === "media-assets") {
    if (read) return "media:read";
    if (req.method === "DELETE") return "media:delete";
    return "media:write";
  }
  if (resource === "integrations") return read ? "system:read" : "system:write";
  if (resource === "search-sync-jobs") return read ? "system:read" : "search:write";
  if (resource === "backup-jobs") return read ? "system:read" : "backup:write";
  if (resource === "settings") return read ? "system:read" : "settings:write";
  return "system:read";
}

async function listRolesAndPermissions() {
  if (!databaseAvailable) {
    return {
      roles: [{ id: -1, name: "owner", label: "Owner", description: "本地预览账号，拥有全部权限。", permissions: adminPermissionCodes }],
      permissions: adminPermissionCatalog
    };
  }
  const roles = await query("SELECT id, name, label, description, is_system, created_at FROM roles ORDER BY id ASC");
  const links = await query(`SELECT r.id AS role_id, p.code
    FROM roles r
    JOIN role_permissions rp ON rp.role_id=r.id
    JOIN permissions p ON p.id=rp.permission_id
    ORDER BY r.id ASC, p.code ASC`);
  const grouped = new Map();
  for (const link of links) {
    if (!grouped.has(link.role_id)) grouped.set(link.role_id, []);
    grouped.get(link.role_id).push(link.code);
  }
  return {
    roles: roles.map((role) => ({ ...role, permissions: grouped.get(role.id) || [] })),
    permissions: adminPermissionCatalog
  };
}

function normalizePermissionCodes(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/[,\s]+/);
  const codes = raw
    .map((item) => (item && typeof item === "object" ? item.code : item))
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return [...new Set(codes)].filter((code) => adminPermissionCodes.includes(code));
}

function normalizeRoleReferences(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/[,\s]+/);
  return [...new Set(raw.map((item) => {
    if (item && typeof item === "object") return String(item.id || item.name || "").trim();
    return String(item || "").trim();
  }).filter(Boolean))];
}

function rolePayloadFromBody(body = {}, current = {}) {
  const name = cleanKey(body.name || current.name || "", "");
  return {
    name,
    label: cleanText(body.label ?? current.label ?? name, 120) || name,
    description: cleanText(body.description ?? current.description ?? "", 255),
    is_system: Number(current.is_system || 0)
  };
}

async function setRolePermissions(role, permissionCodes) {
  const codes = role.name === "owner" ? adminPermissionCodes : normalizePermissionCodes(permissionCodes);
  await query("DELETE FROM role_permissions WHERE role_id=:role_id", { role_id: role.id });
  for (const code of codes) {
    const permission = await getOne("SELECT id FROM permissions WHERE code=:code", { code });
    if (!permission) continue;
    await query(`INSERT IGNORE INTO role_permissions(role_id, permission_id, created_at)
      VALUES(:role_id, :permission_id, NOW())`, { role_id: role.id, permission_id: permission.id });
  }
}

async function roleWithPermissions(roleId) {
  const role = await getOne("SELECT id, name, label, description, is_system, created_at FROM roles WHERE id=:id", { id: roleId });
  if (!role) return null;
  const rows = await query(`SELECT p.code FROM role_permissions rp
    JOIN permissions p ON p.id=rp.permission_id
    WHERE rp.role_id=:role_id ORDER BY p.code ASC`, { role_id: role.id });
  return { ...role, permissions: rows.map((row) => row.code) };
}

async function createAdminRole(req, user, body = {}) {
  if (!databaseAvailable) return { error: "database_unavailable", message: "数据库不可用，无法修改权限。", status: 503 };
  const payload = rolePayloadFromBody(body);
  if (!payload.name) return { error: "invalid_role", message: "角色名称不合法。", status: 400 };
  const result = await query(`INSERT INTO roles(name, label, description, is_system, created_at)
    VALUES(:name, :label, :description, 0, NOW())`, payload);
  const role = await getOne("SELECT * FROM roles WHERE id=:id", { id: result.insertId });
  await setRolePermissions(role, body.permissions || []);
  const next = await roleWithPermissions(role.id);
  await writeAuditLog(req, user, "create", "role", role.id, null, next);
  return { item: next, status: 201 };
}

async function updateAdminRole(req, user, roleId, body = {}) {
  if (!databaseAvailable) return { error: "database_unavailable", message: "数据库不可用，无法修改权限。", status: 503 };
  const current = await roleWithPermissions(roleId);
  if (!current) return { error: "not_found", message: "角色不存在。", status: 404 };
  const payload = rolePayloadFromBody(body, current);
  await query("UPDATE roles SET label=:label, description=:description WHERE id=:id", {
    id: roleId,
    label: payload.label,
    description: payload.description
  });
  if (body.permissions !== undefined) await setRolePermissions(current, body.permissions);
  const next = await roleWithPermissions(roleId);
  await writeAuditLog(req, user, "update", "role", roleId, current, next);
  return { item: next };
}

async function listAdminUsers() {
  if (!databaseAvailable) {
    return { items: [{ id: -1, username: localPreviewAdminCredentials().username, preview: true, roles: ["owner"], roleLabels: ["Owner"], permissions: adminPermissionCodes }], source: "local-preview" };
  }
  const rows = await query(`SELECT u.id, u.username, u.created_at,
      GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ",") AS role_names,
      GROUP_CONCAT(DISTINCT r.label ORDER BY r.name SEPARATOR ",") AS role_labels
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id=u.id
    LEFT JOIN roles r ON r.id=ur.role_id
    GROUP BY u.id, u.username, u.created_at
    ORDER BY u.id ASC`);
  return { items: rows.map((row) => ({
    id: row.id,
    username: row.username,
    created_at: row.created_at,
    roles: row.role_names ? String(row.role_names).split(",").filter(Boolean) : [],
    roleLabels: row.role_labels ? String(row.role_labels).split(",").filter(Boolean) : []
  })) };
}

async function resolveRoleIds(roleRefs) {
  const refs = normalizeRoleReferences(roleRefs);
  if (!refs.length) return [];
  const roles = await query("SELECT id, name FROM roles ORDER BY id ASC");
  const selected = roles.filter((role) => refs.includes(String(role.id)) || refs.includes(role.name));
  return [...new Set(selected.map((role) => Number(role.id)))];
}

async function updateAdminUserRoles(req, user, targetUserId, body = {}) {
  if (!databaseAvailable) return { error: "database_unavailable", message: "数据库不可用，无法修改权限。", status: 503 };
  const target = await getOne("SELECT id, username, created_at FROM users WHERE id=:id", { id: targetUserId });
  if (!target) return { error: "not_found", message: "用户不存在。", status: 404 };
  const before = (await listAdminUsers()).items.find((item) => String(item.id) === String(targetUserId));
  const nextRoleIds = await resolveRoleIds(body.roles || body.roleNames || body.roleIds);
  if (!nextRoleIds.length) return { error: "roles_required", message: "至少要保留一个角色。", status: 400 };
  const owner = await getOne("SELECT id FROM roles WHERE name='owner' LIMIT 1");
  if (owner && !nextRoleIds.includes(Number(owner.id))) {
    const row = await getOne("SELECT COUNT(*) AS count FROM user_roles WHERE role_id=:role_id AND user_id<>:user_id", { role_id: owner.id, user_id: targetUserId });
    if (Number(row?.count || 0) < 1) return { error: "owner_required", message: "至少要保留一个 Owner，避免后台被锁死。", status: 400 };
  }
  await query("DELETE FROM user_roles WHERE user_id=:user_id", { user_id: targetUserId });
  for (const roleId of nextRoleIds) {
    await query(`INSERT IGNORE INTO user_roles(user_id, role_id, created_at)
      VALUES(:user_id, :role_id, NOW())`, { user_id: targetUserId, role_id: roleId });
  }
  const after = (await listAdminUsers()).items.find((item) => String(item.id) === String(targetUserId));
  await writeAuditLog(req, user, "update", "user-role", targetUserId, before, after);
  return { item: after };
}

async function ensureContentLifecycleSchema() {
  await query(`CREATE TABLE IF NOT EXISTS reaction_events (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    target VARCHAR(160) NOT NULL,
    target_type VARCHAR(60) NOT NULL DEFAULT 'site',
    target_id VARCHAR(120) DEFAULT '',
    kind VARCHAR(40) NOT NULL DEFAULT 'like',
    actor_hash VARCHAR(80) NOT NULL,
    user_agent_hash VARCHAR(80) DEFAULT '',
    created_at DATETIME NOT NULL,
    UNIQUE KEY uq_reaction_events_actor (target, kind, actor_hash),
    INDEX idx_reaction_events_target (target, kind, created_at),
    INDEX idx_reaction_events_type (target_type, target_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const statements = [
    "ALTER TABLE posts ADD COLUMN deleted_at DATETIME NULL",
    "ALTER TABLE moments ADD COLUMN deleted_at DATETIME NULL",
    "ALTER TABLE projects ADD COLUMN deleted_at DATETIME NULL",
    "ALTER TABLE interview_items ADD COLUMN deleted_at DATETIME NULL",
    "ALTER TABLE comments ADD COLUMN deleted_at DATETIME NULL",
    "ALTER TABLE comments ADD COLUMN moderation_reason VARCHAR(255) DEFAULT ''",
    "ALTER TABLE comments ADD COLUMN ip_hash VARCHAR(80) DEFAULT ''",
    "ALTER TABLE comments ADD COLUMN user_agent_hash VARCHAR(80) DEFAULT ''",
    "ALTER TABLE comments ADD COLUMN reviewed_at DATETIME NULL",
    "ALTER TABLE comments ADD INDEX idx_comments_governance (status, deleted_at, created_at)"
  ];
  for (const statement of statements) {
    try {
      await query(statement);
    } catch (error) {
      if (![1060, 1061].includes(error.errno)) throw error;
    }
  }
}

async function ensureMediaGovernanceSchema() {
  const statements = [
    "ALTER TABLE media_assets ADD COLUMN sha256 VARCHAR(80) DEFAULT ''",
    "ALTER TABLE media_assets ADD COLUMN last_seen_at DATETIME NULL",
    "ALTER TABLE media_assets ADD COLUMN deleted_at DATETIME NULL",
    "ALTER TABLE attachment_refs ADD COLUMN media_url VARCHAR(500) DEFAULT ''",
    "ALTER TABLE attachment_refs ADD COLUMN updated_at DATETIME NULL",
    "ALTER TABLE attachment_refs ADD UNIQUE KEY uq_attachment_refs_unique (resource_type, resource_id, field_key, media_url(191))"
  ];
  for (const statement of statements) {
    try {
      await query(statement);
    } catch (error) {
      if (![1060, 1061].includes(error.errno)) throw error;
    }
  }
}

async function ensureContentVersionSchema() {
  await query(`CREATE TABLE IF NOT EXISTS content_versions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    resource_type VARCHAR(80) NOT NULL,
    resource_id VARCHAR(120) NOT NULL,
    version INT NOT NULL,
    title VARCHAR(220) DEFAULT '',
    slug VARCHAR(220) DEFAULT '',
    status VARCHAR(60) DEFAULT '',
    payload_json MEDIUMTEXT NOT NULL,
    reason VARCHAR(120) DEFAULT '',
    created_by BIGINT NULL,
    created_at DATETIME NOT NULL,
    UNIQUE KEY uq_content_versions_resource_version (resource_type, resource_id, version),
    INDEX idx_content_versions_resource (resource_type, resource_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

async function ensureApiDailySnapshotSchema() {
  await query(`CREATE TABLE IF NOT EXISTS api_daily_snapshots (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    snapshot_key VARCHAR(160) NOT NULL,
    day_key DATE NOT NULL,
    status ENUM('ready','failed') NOT NULL DEFAULT 'ready',
    payload_json MEDIUMTEXT NULL,
    source VARCHAR(120) DEFAULT '',
    error_message TEXT NULL,
    refreshed_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uq_api_daily_snapshots_key_day (snapshot_key, day_key),
    INDEX idx_api_daily_snapshots_key_status (snapshot_key, status, day_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

async function ensureProjectSchema() {
  const statements = [
    "ALTER TABLE projects ADD COLUMN slug VARCHAR(160) NULL",
    "ALTER TABLE projects ADD COLUMN summary VARCHAR(500) DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN content_md MEDIUMTEXT NULL",
    "ALTER TABLE projects ADD COLUMN cover_url VARCHAR(500) DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN ai_summary VARCHAR(300) DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN ai_summary_source_hash VARCHAR(80) DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN ai_summary_updated_at DATETIME NULL",
    "ALTER TABLE projects ADD COLUMN ai_summary_error TEXT NULL",
    "ALTER TABLE projects ADD COLUMN created_at DATETIME NULL",
    "ALTER TABLE projects ADD COLUMN updated_at DATETIME NULL",
    "ALTER TABLE projects ADD COLUMN deleted_at DATETIME NULL",
    "ALTER TABLE projects ADD UNIQUE KEY uq_projects_slug (slug)"
  ];
  for (const statement of statements) {
    try {
      await query(statement);
    } catch (error) {
      if (![1060, 1061].includes(error.errno)) throw error;
    }
  }
  await query("UPDATE projects SET created_at=NOW() WHERE created_at IS NULL");
  await query("UPDATE projects SET updated_at=NOW() WHERE updated_at IS NULL");
}

async function databaseTableExists(tableName) {
  const row = await getOne("SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=:tableName", { tableName });
  return Number(row?.count || 0) > 0;
}

async function databaseTableColumns(tableName) {
  if (!await databaseTableExists(tableName)) return [];
  const rows = await query("SHOW COLUMNS FROM " + tableName);
  return rows.map((row) => row.Field);
}

async function migrateLegacyDailyInterviewQuestionTable() {
  const columns = await databaseTableColumns("interview_questions");
  const isDailyQuestionTable = columns.includes("day_id") && columns.includes("answer_text") && !columns.includes("title");
  if (!isDailyQuestionTable) return;
  if (await databaseTableExists("interview_day_questions")) return;
  await query("RENAME TABLE interview_questions TO interview_day_questions");
}

async function ensureInterviewSchema() {
  await migrateLegacyDailyInterviewQuestionTable();
  await query(`CREATE TABLE IF NOT EXISTS interview_items (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(220) NOT NULL UNIQUE,
    section ENUM('bagu','experience','daily50') NOT NULL DEFAULT 'bagu',
    summary VARCHAR(500) DEFAULT '',
    content_md MEDIUMTEXT NOT NULL,
    difficulty VARCHAR(40) DEFAULT '',
    tags JSON NULL,
    question_count INT NOT NULL DEFAULT 0,
    finished_count INT NOT NULL DEFAULT 0,
    status ENUM('draft','published') NOT NULL DEFAULT 'draft',
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    FULLTEXT KEY ft_interview_items (title, summary, content_md)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await query(`CREATE TABLE IF NOT EXISTS interview_topics (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    slug VARCHAR(160) NOT NULL UNIQUE,
    title VARCHAR(200) NOT NULL,
    description VARCHAR(500) DEFAULT '',
    sort_order INT NOT NULL DEFAULT 0,
    visible TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    deleted_at DATETIME NULL,
    INDEX idx_interview_topics_visible (visible, sort_order)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await query(`CREATE TABLE IF NOT EXISTS interview_questions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    topic_id BIGINT NULL,
    slug VARCHAR(220) NOT NULL UNIQUE,
    title VARCHAR(200) NOT NULL,
    summary VARCHAR(500) DEFAULT '',
    answer_md MEDIUMTEXT NOT NULL,
    answer_html MEDIUMTEXT NULL,
    answer_points JSON NULL,
    example_case JSON NULL,
    example_case_source_hash VARCHAR(80) DEFAULT '',
    example_case_provider VARCHAR(40) DEFAULT '',
    example_case_model VARCHAR(120) DEFAULT '',
    example_case_updated_at DATETIME NULL,
    example_case_error TEXT NULL,
    difficulty VARCHAR(40) DEFAULT '',
    source VARCHAR(160) DEFAULT '',
    tags JSON NULL,
    star_rating TINYINT NOT NULL DEFAULT 0,
    is_difficult TINYINT(1) NOT NULL DEFAULT 0,
    is_common TINYINT(1) NOT NULL DEFAULT 0,
    in_collection TINYINT(1) NOT NULL DEFAULT 0,
    marker_note VARCHAR(500) DEFAULT '',
    status ENUM('draft','published') NOT NULL DEFAULT 'draft',
    sort_order INT NOT NULL DEFAULT 0,
    reviewed_at DATETIME NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    deleted_at DATETIME NULL,
    INDEX idx_interview_questions_topic (topic_id, status, sort_order),
    FULLTEXT KEY ft_interview_questions (title, summary, answer_md)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await query(`CREATE TABLE IF NOT EXISTS interview_reviews (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    company_alias VARCHAR(160) NOT NULL,
    position_name VARCHAR(160) DEFAULT '',
    interview_round VARCHAR(80) DEFAULT '',
    happened_at DATE NULL,
    result_status VARCHAR(80) DEFAULT '',
    summary_md MEDIUMTEXT NOT NULL,
    summary_html MEDIUMTEXT NULL,
    improvement_md MEDIUMTEXT NULL,
    improvement_html MEDIUMTEXT NULL,
    status ENUM('draft','published') NOT NULL DEFAULT 'draft',
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    deleted_at DATETIME NULL,
    INDEX idx_interview_reviews_status (status, happened_at, sort_order),
    FULLTEXT KEY ft_interview_reviews (company_alias, position_name, summary_md, improvement_md)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await query(`CREATE TABLE IF NOT EXISTS interview_daily_sets (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    day_date DATE NOT NULL UNIQUE,
    title VARCHAR(120) NOT NULL DEFAULT '每日 50 问',
    subtitle VARCHAR(240) DEFAULT '',
    status ENUM('draft','published') NOT NULL DEFAULT 'published',
    question_ids JSON NULL,
    sidebar_json JSON NULL,
    source_provider VARCHAR(40) DEFAULT 'admin',
    source_model VARCHAR(120) DEFAULT 'manual-question-bank',
    generated_at DATETIME NULL,
    generation_status VARCHAR(40) DEFAULT '',
    generation_error TEXT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    INDEX idx_interview_daily_sets_status (status, day_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await query(`CREATE TABLE IF NOT EXISTS interview_question_insights (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    day_date DATE NOT NULL,
    question_key VARCHAR(220) NOT NULL,
    client_hash VARCHAR(80) NOT NULL,
    content TEXT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uq_interview_question_insights (day_date, question_key, client_hash),
    INDEX idx_interview_question_insights_day (day_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await query(`CREATE TABLE IF NOT EXISTS interview_progress (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    day_date DATE NOT NULL,
    question_key VARCHAR(220) NOT NULL,
    client_hash VARCHAR(80) NOT NULL,
    completed TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uq_interview_progress (day_date, question_key, client_hash),
    INDEX idx_interview_progress_day_client (day_date, client_hash),
    INDEX idx_interview_progress_client_day (client_hash, day_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await query(`CREATE TABLE IF NOT EXISTS interview_goal_nodes (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    parent_id BIGINT NULL,
    slug VARCHAR(180) NOT NULL UNIQUE,
    title VARCHAR(200) NOT NULL,
    summary VARCHAR(500) DEFAULT '',
    status ENUM('planned','doing','review','mastered') NOT NULL DEFAULT 'planned',
    target_count INT NOT NULL DEFAULT 0,
    manual_progress TINYINT NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    visible TINYINT(1) NOT NULL DEFAULT 1,
    accent VARCHAR(40) DEFAULT '',
    icon VARCHAR(40) DEFAULT '',
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    deleted_at DATETIME NULL,
    INDEX idx_interview_goal_parent (parent_id, sort_order),
    INDEX idx_interview_goal_visible (visible, sort_order)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await query(`CREATE TABLE IF NOT EXISTS interview_goal_question_links (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    goal_id BIGINT NOT NULL,
    question_id BIGINT NOT NULL,
    is_primary TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    UNIQUE KEY uq_interview_goal_question (goal_id, question_id),
    INDEX idx_interview_goal_question_goal (goal_id, is_primary),
    INDEX idx_interview_goal_question_question (question_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await query(`CREATE TABLE IF NOT EXISTS interview_goal_updates (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    goal_id BIGINT NULL,
    type ENUM('progress','mistake','note') NOT NULL DEFAULT 'note',
    title VARCHAR(220) NOT NULL,
    body_md MEDIUMTEXT NULL,
    body_html MEDIUMTEXT NULL,
    related_question_id BIGINT NULL,
    status ENUM('draft','published') NOT NULL DEFAULT 'published',
    happened_at DATE NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    deleted_at DATETIME NULL,
    INDEX idx_interview_goal_updates_goal (goal_id, type, status),
    INDEX idx_interview_goal_updates_status (status, happened_at, sort_order)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await query(`CREATE TABLE IF NOT EXISTS interview_generation_batches (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    day_date DATE NOT NULL,
    goal_id BIGINT NULL,
    goal_slug VARCHAR(180) DEFAULT '',
    goal_title VARCHAR(200) DEFAULT '',
    status ENUM('draft','generating','reviewing','answers_generating','answered','published','failed') NOT NULL DEFAULT 'draft',
    target_count INT NOT NULL DEFAULT 50,
    approved_count INT NOT NULL DEFAULT 0,
    answered_count INT NOT NULL DEFAULT 0,
    published_set_id BIGINT NULL,
    source_provider VARCHAR(40) DEFAULT '',
    source_model VARCHAR(120) DEFAULT '',
    generation_error TEXT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    INDEX idx_interview_generation_batches_day (day_date, status),
    INDEX idx_interview_generation_batches_goal (goal_id, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await query(`CREATE TABLE IF NOT EXISTS interview_generation_candidates (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    batch_id BIGINT NOT NULL,
    position INT NOT NULL,
    question_key VARCHAR(40) NOT NULL,
    status ENUM('pending','approved','discarded','answered','published') NOT NULL DEFAULT 'pending',
    question VARCHAR(500) NOT NULL,
    original_question VARCHAR(500) DEFAULT '',
    category VARCHAR(80) DEFAULT '',
    goal_slug VARCHAR(180) DEFAULT '',
    knowledge_point VARCHAR(100) DEFAULT '',
    tags JSON NULL,
    difficulty VARCHAR(40) DEFAULT '基础',
    answer_md MEDIUMTEXT NULL,
    answer_points JSON NULL,
    question_id BIGINT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uq_interview_generation_candidate_key (batch_id, question_key),
    INDEX idx_interview_generation_candidates_batch (batch_id, status, position)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await query(`CREATE TABLE IF NOT EXISTS interview_bank_rebuild_jobs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    run_id VARCHAR(80) NOT NULL UNIQUE,
    status ENUM('draft','generating','audit_failed','ready','committing','committed','failed') NOT NULL DEFAULT 'draft',
    target_leaf_count INT NOT NULL DEFAULT 100,
    expected_total INT NOT NULL DEFAULT 0,
    generated_count INT NOT NULL DEFAULT 0,
    ready_count INT NOT NULL DEFAULT 0,
    failed_count INT NOT NULL DEFAULT 0,
    committed_count INT NOT NULL DEFAULT 0,
    current_goal_slug VARCHAR(180) DEFAULT '',
    source_provider VARCHAR(40) DEFAULT '',
    source_model VARCHAR(120) DEFAULT '',
    audit_json JSON NULL,
    generation_error TEXT NULL,
    started_at DATETIME NULL,
    finished_at DATETIME NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    INDEX idx_interview_bank_rebuild_jobs_status (status, updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await query(`CREATE TABLE IF NOT EXISTS interview_bank_rebuild_items (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    run_id VARCHAR(80) NOT NULL,
    goal_id BIGINT NULL,
    goal_slug VARCHAR(180) NOT NULL,
    goal_title VARCHAR(200) DEFAULT '',
    topic_title VARCHAR(120) DEFAULT '',
    position INT NOT NULL,
    question_type VARCHAR(80) DEFAULT '',
    scenario_key VARCHAR(120) DEFAULT '',
    normalized_title VARCHAR(240) NOT NULL,
    combo_key VARCHAR(240) NOT NULL,
    title VARCHAR(220) NOT NULL,
    summary VARCHAR(500) DEFAULT '',
    answer_md MEDIUMTEXT NOT NULL,
    answer_points JSON NOT NULL,
    example_case JSON NOT NULL,
    difficulty VARCHAR(40) DEFAULT '',
    tags JSON NOT NULL,
    source_provider VARCHAR(40) DEFAULT '',
    source_model VARCHAR(120) DEFAULT '',
    quality_status ENUM('ready','failed') NOT NULL DEFAULT 'ready',
    quality_error TEXT NULL,
    retry_count INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uq_interview_bank_rebuild_title (run_id, normalized_title),
    UNIQUE KEY uq_interview_bank_rebuild_combo (run_id, combo_key),
    INDEX idx_interview_bank_rebuild_run_goal (run_id, goal_slug, quality_status, position)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const statements = [
    "ALTER TABLE interview_items ADD COLUMN difficulty VARCHAR(40) DEFAULT ''",
    "ALTER TABLE interview_items ADD COLUMN tags JSON NULL",
    "ALTER TABLE interview_items ADD COLUMN question_count INT NOT NULL DEFAULT 0",
    "ALTER TABLE interview_items ADD COLUMN finished_count INT NOT NULL DEFAULT 0",
    "ALTER TABLE interview_items ADD COLUMN sort_order INT NOT NULL DEFAULT 0",
    "ALTER TABLE interview_items ADD COLUMN deleted_at DATETIME NULL",
    "ALTER TABLE interview_items ADD FULLTEXT KEY ft_interview_items (title, summary, content_md)",
    "ALTER TABLE interview_topics ADD COLUMN deleted_at DATETIME NULL",
    "ALTER TABLE interview_questions ADD COLUMN summary VARCHAR(500) DEFAULT ''",
    "ALTER TABLE interview_questions ADD COLUMN answer_html MEDIUMTEXT NULL",
    "ALTER TABLE interview_questions ADD COLUMN answer_points JSON NULL",
    "ALTER TABLE interview_questions ADD COLUMN example_case JSON NULL",
    "ALTER TABLE interview_questions ADD COLUMN example_case_source_hash VARCHAR(80) DEFAULT ''",
    "ALTER TABLE interview_questions ADD COLUMN example_case_provider VARCHAR(40) DEFAULT ''",
    "ALTER TABLE interview_questions ADD COLUMN example_case_model VARCHAR(120) DEFAULT ''",
    "ALTER TABLE interview_questions ADD COLUMN example_case_updated_at DATETIME NULL",
    "ALTER TABLE interview_questions ADD COLUMN example_case_error TEXT NULL",
    "ALTER TABLE interview_questions ADD COLUMN source VARCHAR(160) DEFAULT ''",
    "ALTER TABLE interview_questions ADD COLUMN tags JSON NULL",
    "ALTER TABLE interview_questions ADD COLUMN star_rating TINYINT NOT NULL DEFAULT 0",
    "ALTER TABLE interview_questions ADD COLUMN is_difficult TINYINT(1) NOT NULL DEFAULT 0",
    "ALTER TABLE interview_questions ADD COLUMN is_common TINYINT(1) NOT NULL DEFAULT 0",
    "ALTER TABLE interview_questions ADD COLUMN in_collection TINYINT(1) NOT NULL DEFAULT 0",
    "ALTER TABLE interview_questions ADD COLUMN marker_note VARCHAR(500) DEFAULT ''",
    "ALTER TABLE interview_questions ADD COLUMN reviewed_at DATETIME NULL",
    "ALTER TABLE interview_questions ADD COLUMN deleted_at DATETIME NULL",
    "ALTER TABLE interview_questions ADD INDEX idx_interview_questions_public (status, deleted_at, id)",
    "ALTER TABLE interview_questions ADD INDEX idx_interview_questions_public_sort (status, deleted_at, sort_order, updated_at, id)",
    "ALTER TABLE interview_questions ADD FULLTEXT KEY ft_interview_questions (title, summary, answer_md)",
    "ALTER TABLE interview_reviews ADD COLUMN summary_html MEDIUMTEXT NULL",
    "ALTER TABLE interview_reviews ADD COLUMN improvement_html MEDIUMTEXT NULL",
    "ALTER TABLE interview_reviews ADD COLUMN status ENUM('draft','published') NOT NULL DEFAULT 'draft'",
    "ALTER TABLE interview_reviews ADD COLUMN sort_order INT NOT NULL DEFAULT 0",
    "ALTER TABLE interview_reviews ADD COLUMN deleted_at DATETIME NULL",
    "ALTER TABLE interview_reviews ADD FULLTEXT KEY ft_interview_reviews (company_alias, position_name, summary_md, improvement_md)",
    "ALTER TABLE interview_daily_sets ADD COLUMN subtitle VARCHAR(240) DEFAULT ''",
    "ALTER TABLE interview_daily_sets ADD COLUMN source_provider VARCHAR(40) DEFAULT 'admin'",
    "ALTER TABLE interview_daily_sets ADD COLUMN source_model VARCHAR(120) DEFAULT 'manual-question-bank'",
    "ALTER TABLE interview_daily_sets ADD COLUMN generated_at DATETIME NULL",
    "ALTER TABLE interview_daily_sets ADD COLUMN generation_status VARCHAR(40) DEFAULT ''",
    "ALTER TABLE interview_daily_sets ADD COLUMN generation_error TEXT NULL",
    "ALTER TABLE interview_daily_sets ADD INDEX idx_interview_daily_sets_status (status, day_date)",
    "ALTER TABLE interview_goal_nodes ADD COLUMN parent_id BIGINT NULL",
    "ALTER TABLE interview_goal_nodes ADD COLUMN accent VARCHAR(40) DEFAULT ''",
    "ALTER TABLE interview_goal_nodes ADD COLUMN icon VARCHAR(40) DEFAULT ''",
    "ALTER TABLE interview_goal_nodes ADD COLUMN deleted_at DATETIME NULL",
    "ALTER TABLE interview_goal_updates ADD COLUMN body_html MEDIUMTEXT NULL",
    "ALTER TABLE interview_goal_updates ADD COLUMN related_question_id BIGINT NULL",
    "ALTER TABLE interview_goal_updates ADD COLUMN deleted_at DATETIME NULL",
    "ALTER TABLE interview_generation_batches ADD COLUMN published_set_id BIGINT NULL",
    "ALTER TABLE interview_generation_batches ADD COLUMN approved_count INT NOT NULL DEFAULT 0",
    "ALTER TABLE interview_generation_batches ADD COLUMN answered_count INT NOT NULL DEFAULT 0",
    "ALTER TABLE interview_generation_candidates ADD COLUMN original_question VARCHAR(500) DEFAULT ''",
    "ALTER TABLE interview_generation_candidates ADD COLUMN answer_points JSON NULL",
    "ALTER TABLE interview_generation_candidates ADD COLUMN question_id BIGINT NULL",
    "ALTER TABLE interview_bank_rebuild_jobs ADD COLUMN committed_count INT NOT NULL DEFAULT 0",
    "ALTER TABLE interview_bank_rebuild_items ADD COLUMN topic_title VARCHAR(120) DEFAULT ''"
  ];
  for (const statement of statements) {
    try {
      await query(statement);
    } catch (error) {
      if (![1060, 1061].includes(error.errno)) throw error;
    }
  }
  await seedInterviewGoalDefaults();
  await seedInterviewTopicDefaults();
  await backfillInterviewQuestionsFromLegacy();
  await backfillInterviewQuestionsFromDailyArchive();
}

async function ensureCmsSchema() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS site_settings (
      setting_key VARCHAR(80) PRIMARY KEY,
      setting_value MEDIUMTEXT NOT NULL,
      updated_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS page_blocks (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      page_key VARCHAR(80) NOT NULL,
      block_key VARCHAR(120) NOT NULL,
      title VARCHAR(160) DEFAULT '',
      payload_json MEDIUMTEXT NOT NULL,
      status ENUM('draft','published','hidden') NOT NULL DEFAULT 'published',
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      UNIQUE KEY uq_page_blocks_key (page_key, block_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS theme_settings (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      scope_key VARCHAR(120) NOT NULL UNIQUE,
      payload_json MEDIUMTEXT NOT NULL,
      status ENUM('draft','published') NOT NULL DEFAULT 'published',
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS navigation_items (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      label VARCHAR(80) NOT NULL,
      href VARCHAR(500) NOT NULL,
      icon VARCHAR(40) DEFAULT '',
      placement VARCHAR(60) NOT NULL DEFAULT 'main',
      visible TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      INDEX idx_navigation_items (placement, visible, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS hz_quotes (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      text TEXT NOT NULL,
      status ENUM('draft','published') NOT NULL DEFAULT 'published',
      visible TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      deleted_at DATETIME NULL,
      INDEX idx_hz_quotes_public (status, visible, deleted_at, sort_order, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS setting_versions (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      scope_key VARCHAR(120) NOT NULL,
      version INT NOT NULL,
      payload_json MEDIUMTEXT NOT NULL,
      reason VARCHAR(120) DEFAULT '',
      created_by BIGINT NULL,
      created_at DATETIME NOT NULL,
      UNIQUE KEY uq_setting_versions_scope_version (scope_key, version),
      INDEX idx_setting_versions_scope (scope_key, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS content_versions (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      resource_type VARCHAR(80) NOT NULL,
      resource_id VARCHAR(120) NOT NULL,
      version INT NOT NULL,
      title VARCHAR(220) DEFAULT '',
      slug VARCHAR(220) DEFAULT '',
      status VARCHAR(60) DEFAULT '',
      payload_json MEDIUMTEXT NOT NULL,
      reason VARCHAR(120) DEFAULT '',
      created_by BIGINT NULL,
      created_at DATETIME NOT NULL,
      UNIQUE KEY uq_content_versions_resource_version (resource_type, resource_id, version),
      INDEX idx_content_versions_resource (resource_type, resource_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT NULL,
      username VARCHAR(80) DEFAULT '',
      action VARCHAR(80) NOT NULL,
      resource_type VARCHAR(80) NOT NULL,
      resource_id VARCHAR(120) DEFAULT '',
      before_json MEDIUMTEXT NULL,
      after_json MEDIUMTEXT NULL,
      ip VARCHAR(80) DEFAULT '',
      user_agent VARCHAR(255) DEFAULT '',
      created_at DATETIME NOT NULL,
      INDEX idx_audit_logs_resource (resource_type, resource_id, created_at),
      INDEX idx_audit_logs_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS media_assets (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      storage_key VARCHAR(500) NOT NULL,
      url VARCHAR(500) NOT NULL,
      filename VARCHAR(255) NOT NULL,
      mime VARCHAR(120) NOT NULL,
      size BIGINT NOT NULL DEFAULT 0,
      sha256 VARCHAR(80) DEFAULT '',
      source VARCHAR(60) NOT NULL DEFAULT 'admin-upload',
      uploaded_by BIGINT NULL,
      last_seen_at DATETIME NULL,
      deleted_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      UNIQUE KEY uq_media_assets_url (url)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS attachment_refs (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      media_asset_id BIGINT NULL,
      media_url VARCHAR(500) DEFAULT '',
      resource_type VARCHAR(80) NOT NULL,
      resource_id VARCHAR(120) NOT NULL,
      field_key VARCHAR(120) NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NULL,
      UNIQUE KEY uq_attachment_refs_unique (resource_type, resource_id, field_key, media_url(191)),
      INDEX idx_attachment_refs_resource (resource_type, resource_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS view_events (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      target VARCHAR(160) NOT NULL,
      fingerprint VARCHAR(80) DEFAULT '',
      user_agent VARCHAR(255) DEFAULT '',
      created_at DATETIME NOT NULL,
      INDEX idx_view_events_target (target, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS search_sync_jobs (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      status ENUM('success','failed') NOT NULL,
      indexed_count INT NOT NULL DEFAULT 0,
      message VARCHAR(500) DEFAULT '',
      created_by BIGINT NULL,
      started_at DATETIME NOT NULL,
      finished_at DATETIME NOT NULL,
      INDEX idx_search_sync_jobs_finished (finished_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS github_repositories (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      github_id BIGINT NULL,
      owner VARCHAR(80) NOT NULL,
      name VARCHAR(160) NOT NULL,
      full_name VARCHAR(240) NOT NULL,
      description TEXT NULL,
      html_url VARCHAR(500) NOT NULL,
      language VARCHAR(80) DEFAULT '',
      stargazers_count INT NOT NULL DEFAULT 0,
      forks_count INT NOT NULL DEFAULT 0,
      open_issues_count INT NOT NULL DEFAULT 0,
      topics_json MEDIUMTEXT NULL,
      archived TINYINT(1) NOT NULL DEFAULT 0,
      fork TINYINT(1) NOT NULL DEFAULT 0,
      pushed_at DATETIME NULL,
      synced_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      UNIQUE KEY uq_github_repositories_full_name (full_name),
      INDEX idx_github_repositories_owner (owner, pushed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS github_sync_jobs (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      status ENUM('running','success','failed') NOT NULL DEFAULT 'running',
      username VARCHAR(80) NOT NULL,
      repo_count INT NOT NULL DEFAULT 0,
      message VARCHAR(500) DEFAULT '',
      created_by BIGINT NULL,
      started_at DATETIME NOT NULL,
      finished_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_github_sync_jobs_finished (finished_at),
      INDEX idx_github_sync_jobs_username (username, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS backup_jobs (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      status ENUM('planned','running','success','failed') NOT NULL DEFAULT 'planned',
      scope VARCHAR(80) NOT NULL DEFAULT 'database',
      artifact_path VARCHAR(500) DEFAULT '',
      message VARCHAR(500) DEFAULT '',
      created_by BIGINT NULL,
      started_at DATETIME NULL,
      finished_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_backup_jobs_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  ];
  for (const statement of statements) await query(statement);
  const migrations = [
    "ALTER TABLE site_settings MODIFY COLUMN setting_value MEDIUMTEXT NOT NULL",
    "ALTER TABLE hz_quotes MODIFY COLUMN text TEXT NOT NULL",
    "ALTER TABLE backup_jobs ADD COLUMN created_by BIGINT NULL"
  ];
  for (const statement of migrations) {
    try {
      await query(statement);
    } catch (error) {
      if (![1060, 1061].includes(error.errno)) throw error;
    }
  }
  const quoteCount = await getOne("SELECT COUNT(*) AS count FROM hz_quotes").catch(() => ({ count: 0 }));
  if (!Number(quoteCount?.count || 0)) {
    await query(`INSERT INTO hz_quotes(text,status,visible,sort_order,created_at,updated_at,deleted_at)
      VALUES(:text,'published',1,10,NOW(),NOW(),NULL)`, { text: "把想说的话慢慢写下来。" });
  }
}

async function seedInterviewDefaultsIfEmpty() {
  const row = await getOne("SELECT COUNT(*) AS count FROM interview_items");
  if (Number(row?.count) > 0) return;
  for (const item of fallbackInterviews) {
    await query(`INSERT INTO interview_items(title,slug,section,summary,content_md,difficulty,tags,question_count,finished_count,status,sort_order,created_at,updated_at)
      VALUES(:title,:slug,:section,:summary,:content_md,:difficulty,:tags,:question_count,:finished_count,'published',:sort_order,NOW(),NOW())`, {
      ...item,
      tags: JSON.stringify(item.tags || [])
    });
  }
}

function option(value, label, selectedValue) {
  return `<option value="${escapeAttr(value)}" ${String(value) === String(selectedValue) ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function projectEditor(project = {}, notice = "") {
  const isEdit = Boolean(project.id);
  const content = project.content_md || `# ${project.name || "未命名项目"}\n\n## 项目背景\n\n\n## 当前进度\n\n\n## 下一步\n\n- `;
  return `${notice ? `<div class="flash">${escapeHtml(notice)}</div>` : ""}
  <form method="post" action="/admin/projects/save" enctype="multipart/form-data" class="editor-layout">
    <input type="hidden" name="id" value="${escapeAttr(project.id || "")}">
    <section class="card editor-card">
      <div class="toolbar">
        <div>
          <h2>${isEdit ? "编辑项目 Markdown" : "新建项目"}</h2>
          <p class="muted">正文用 Markdown 维护。上传 .md 后会覆盖下面正文，并在保存时同步到前台项目详情。</p>
        </div>
        <div class="toolbar-actions">
          ${isEdit ? `<a class="link-pill" href="/project.html?id=${escapeAttr(project.id)}" target="_blank" rel="noreferrer">打开前台</a>` : ""}
          <button class="btn" type="submit">保存并更新前台</button>
        </div>
      </div>
      <label>Markdown 正文</label>
      <textarea name="content_md" spellcheck="false">${escapeHtml(content)}</textarea>
    </section>
    <aside class="card meta-card">
      <h2>项目信息</h2>
      <label>项目名称</label>
      <input name="name" value="${escapeAttr(project.name || "")}" placeholder="例如：机器人项目阶段记录；上传带 name 的 Markdown 时可留空">
      <label>Slug</label>
      <input name="slug" value="${escapeAttr(project.slug || "")}" placeholder="robot-project-log">
      <label>卡片状态文案</label>
      <input name="status_text" value="${escapeAttr(project.status_text || "")}" placeholder="例如：接口联调中、样式打磨中">
      <label>摘要</label>
      <input name="summary" value="${escapeAttr(project.summary || "")}" placeholder="一句话概括项目亮点，可从 Markdown 自动提取">
      <div class="grid">
        <div>
          <label>进度</label>
          <input name="progress" type="number" min="0" max="100" value="${escapeAttr(project.progress ?? 0)}">
        </div>
        <div>
          <label>排序</label>
          <input name="sort_order" type="number" value="${escapeAttr(project.sort_order ?? 0)}">
        </div>
      </div>
      <label>状态</label>
      <select name="status">
        ${option("active", "前台显示", project.status || "active")}
        ${option("archived", "暂不显示", project.status || "active")}
      </select>
      <label>封面 URL</label>
      <input name="cover_url" value="${escapeAttr(project.cover_url || "")}" placeholder="/uploads/project-cover.jpg">
      <div class="file-drop">
        <label>上传 Markdown 文件</label>
        <input name="content_file" type="file" accept=".md,.markdown,text/markdown,text/plain">
      </div>
      <ul class="hint-list">
        <li>支持文件头：name、slug、summary、status_text、progress、status、cover_url、sort_order。</li>
        <li>每次保存都会写入 updated_at，并把前台显示的最后更新时间刷新为当前时间。</li>
        <li>项目状态为“前台显示”时，/api/projects 会立即返回新内容。</li>
      </ul>
    </aside>
  </form>`;
}

function applyMarkdownMetaToProject(body) {
  const uploaded = body.files?.content_file;
  const uploadedText = uploaded?.text?.trim() ? uploaded.text : "";
  const originalMarkdown = uploadedText || body.content_md || "";
  const parsed = parseMarkdownDocument(originalMarkdown);
  const markdown = parsed.content || originalMarkdown;
  const meta = parsed.meta || {};
  const name = cleanText(body.name || meta.name || meta.title || titleFromMarkdown(markdown) || uploaded?.filename?.replace(/\.(md|markdown)$/i, "") || "未命名项目", 120);
  const statusText = cleanText(body.status_text || meta.status_text || meta.statusText || stripMarkdown(markdown).slice(0, 120), 255);
  const summary = cleanText(body.summary || meta.summary || stripMarkdown(markdown).slice(0, 220), 500);
  const slug = normalizeSlug(body.slug || meta.slug || name, "project");
  return {
    id: body.id || "",
    name,
    slug,
    status_text: statusText || name,
    summary,
    content_md: markdown,
    cover_url: cleanText(body.cover_url || meta.cover_url || meta.coverUrl || "", 500),
    progress: clampNumber(body.progress || meta.progress, 0, 100, 0),
    sort_order: clampNumber(body.sort_order || meta.sort_order || meta.sortOrder, 0, 9999, 0),
    status: ["active", "archived"].includes(body.status || meta.status) ? (body.status || meta.status) : "active",
    last_update: projectUpdateLabel(new Date())
  };
}

async function getSetting(key, fallback = "") {
  try {
    const row = await getOne("SELECT setting_value FROM site_settings WHERE setting_key=:key", { key });
    return row?.setting_value || fallback;
  } catch {
    return fallback;
  }
}

async function setSetting(key, value) {
  await query(`INSERT INTO site_settings(setting_key,setting_value,updated_at)
    VALUES(:key,:value,NOW())
    ON DUPLICATE KEY UPDATE setting_value=:value, updated_at=NOW()`, { key, value });
}

const adminSettingDefaults = {
  siteName: "Jlemonz",
  siteTagline: "Ubuntu / ROS / FOC",
  adminWelcome: "今天也把系统维护得更清楚一点。",
  defaultAuthor: "Jlemonz",
  contentFocus: "",
  publishPolicy: "",
  githubUsername: config.github.username || "Jlemonz",
  searchHint: "试试 Ubuntu、ROS、FOC、机器人项目...",
  reviewChecklist: "",
  maintenanceStatus: "normal",
  backupNote: ""
};

function normalizeAdminSettings(payload = {}) {
  const maintenanceStatus = ["normal", "watching", "paused"].includes(payload.maintenanceStatus || payload.maintenance_status)
    ? (payload.maintenanceStatus || payload.maintenance_status)
    : adminSettingDefaults.maintenanceStatus;
  return {
    siteName: cleanText(payload.siteName || payload.site_name || adminSettingDefaults.siteName, 80),
    siteTagline: cleanText(payload.siteTagline || payload.site_tagline || adminSettingDefaults.siteTagline, 120),
    adminWelcome: cleanMultilineText(payload.adminWelcome || payload.admin_welcome || adminSettingDefaults.adminWelcome, 500),
    defaultAuthor: cleanText(payload.defaultAuthor || payload.default_author || adminSettingDefaults.defaultAuthor, 80),
    contentFocus: cleanMultilineText(payload.contentFocus || payload.content_focus || adminSettingDefaults.contentFocus, 800),
    publishPolicy: cleanMultilineText(payload.publishPolicy || payload.publish_policy || adminSettingDefaults.publishPolicy, 1000),
    githubUsername: cleanText(payload.githubUsername || payload.github_username || adminSettingDefaults.githubUsername, 40).replace(/[^a-zA-Z0-9-]/g, "") || adminSettingDefaults.githubUsername,
    searchHint: cleanText(payload.searchHint || payload.search_hint || adminSettingDefaults.searchHint, 160),
    reviewChecklist: cleanMultilineText(payload.reviewChecklist || payload.review_checklist || adminSettingDefaults.reviewChecklist, 1000),
    maintenanceStatus,
    backupNote: cleanMultilineText(payload.backupNote || payload.backup_note || adminSettingDefaults.backupNote, 1000)
  };
}

async function adminSettingsPayload() {
  return {
    siteName: await getSetting("admin_site_name", adminSettingDefaults.siteName),
    siteTagline: await getSetting("admin_site_tagline", adminSettingDefaults.siteTagline),
    adminWelcome: await getSetting("admin_welcome", adminSettingDefaults.adminWelcome),
    defaultAuthor: await getSetting("admin_default_author", adminSettingDefaults.defaultAuthor),
    contentFocus: await getSetting("admin_content_focus", adminSettingDefaults.contentFocus),
    publishPolicy: await getSetting("admin_publish_policy", adminSettingDefaults.publishPolicy),
    githubUsername: await getSetting("github_username", adminSettingDefaults.githubUsername),
    searchHint: await getSetting("admin_search_hint", adminSettingDefaults.searchHint),
    reviewChecklist: await getSetting("admin_review_checklist", adminSettingDefaults.reviewChecklist),
    maintenanceStatus: await getSetting("admin_maintenance_status", adminSettingDefaults.maintenanceStatus),
    backupNote: await getSetting("admin_backup_note", adminSettingDefaults.backupNote)
  };
}

async function saveAdminSettings(payload = {}) {
  const settings = normalizeAdminSettings(payload);
  await Promise.all([
    setSetting("admin_site_name", settings.siteName),
    setSetting("admin_site_tagline", settings.siteTagline),
    setSetting("admin_welcome", settings.adminWelcome),
    setSetting("admin_default_author", settings.defaultAuthor),
    setSetting("admin_content_focus", settings.contentFocus),
    setSetting("admin_publish_policy", settings.publishPolicy),
    setSetting("github_username", settings.githubUsername),
    setSetting("admin_search_hint", settings.searchHint),
    setSetting("admin_review_checklist", settings.reviewChecklist),
    setSetting("admin_maintenance_status", settings.maintenanceStatus),
    setSetting("admin_backup_note", settings.backupNote)
  ]);
  return settings;
}

async function getFrontendTextMap() {
  const texts = Object.fromEntries(frontendTextDefaults.map((item) => [item.key, item.defaultValue]));
  const allowedKeys = new Set(frontendTextDefaults.map((item) => item.key));
  try {
    const rows = await query("SELECT setting_key, setting_value FROM site_settings WHERE setting_key LIKE 'site_text.%'");
    for (const row of rows) {
      const key = String(row.setting_key || "").replace(/^site_text\./, "");
      if (allowedKeys.has(key) && !isLikelyMojibakeText(row.setting_value)) texts[key] = normalizeFrontendTextValue(key, row.setting_value || "");
    }
  } catch {}
  return texts;
}

function parseFrontendTextRules(raw = "") {
  return String(raw || "").split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return null;
    const parts = trimmed.split("|").map((part) => part.trim());
    if (parts.length === 2) return { selector: parts[0], value: parts[1] };
    if (parts.length >= 3) return { selector: parts[0], attr: parts[1], value: parts.slice(2).join("|").trim() };
    return null;
  }).filter((item) => item?.selector && item.value !== undefined);
}

function cleanFooterHref(value) {
  const href = String(value || "").trim().slice(0, 500);
  if (/^(https?:\/\/|mailto:|\/(?!\/))/i.test(href)) return normalizeStaticHref(href);
  return "";
}

function normalizeStaticHref(href) {
  if (!href || /^mailto:/i.test(href) || /^https?:\/\//i.test(href)) return href;
  try {
    const url = new URL(href, "https://local.site");
    const routeMap = new Map([
      ["/archive", "/archive.html"],
      ["/moments", "/moments.html"],
      ["/projects", "/projects.html"],
      ["/project", "/project.html"],
      ["/post", "/post.html"],
      ["/interview", "/interview.html"],
      ["/about", "/about.html"]
    ]);
    const normalizedPath = routeMap.get(url.pathname.replace(/\/$/, "")) || url.pathname;
    return `${normalizedPath}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

function cleanUiHref(value, fallback = "") {
  const href = String(value || "").trim().slice(0, 500);
  if (/^(https?:\/\/|mailto:|\/(?!\/))/i.test(href)) return normalizeStaticHref(href);
  return fallback;
}

function cleanGalleryImageUrl(value) {
  const href = String(value || "").trim().slice(0, 2000);
  if (/^https:\/\//i.test(href)) return href;
  if (/^\/(?:assets|uploads)\//i.test(href)) return normalizeStaticHref(href);
  return "";
}

function normalizeFooterSections(value) {
  const sections = Array.isArray(value) ? value : [];
  const legacyMojibakeFooterTitles = new Set([
    "\u7ed4\u6b0f\u5534",
    "\u7ed4\u6b0f\u5534\u934f\u30e5\u5f5b"
  ]);
  return sections.slice(0, footerSectionLimit).map((section) => {
    const title = cleanText(section?.title, 30);
    if (legacyMojibakeFooterTitles.has(title)) return null;
    const links = (Array.isArray(section?.links) ? section.links : []).slice(0, footerLinkLimit).map((link) => ({
      label: cleanText(link?.label, 40),
      href: cleanFooterHref(link?.href),
      desc: cleanText(link?.desc, 80)
    })).filter((link) => link.label && link.href);
    return { title, links };
  }).filter((section) => section?.title && section.links.length);
}

async function getFooterSections() {
  const fallback = normalizeFooterSections(defaultFooterSections);
  const raw = await getSetting(footerSettingKey, "");
  if (!raw || isLikelyMojibakeText(raw)) return fallback;
  try {
    const parsed = JSON.parse(raw);
    const normalized = normalizeFooterSections(parsed);
    return normalized.length ? normalized : fallback;
  } catch {
    return fallback;
  }
}

function pickChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function pickBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function pickInteger(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeFrontendLayout(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const home = source.home && typeof source.home === "object" ? source.home : {};
  const archive = source.archive && typeof source.archive === "object" ? source.archive : {};
  const moments = source.moments && typeof source.moments === "object" ? source.moments : {};
  const projects = source.projects && typeof source.projects === "object" ? source.projects : {};
  const footer = source.footer && typeof source.footer === "object" ? source.footer : {};

  return {
    home: {
      width: pickChoice(home.width, ["narrow", "balanced", "wide"], defaultFrontendLayout.home.width),
      density: pickChoice(home.density, ["compact", "comfortable", "airy"], defaultFrontendLayout.home.density),
      projectPreviewLimit: pickInteger(home.projectPreviewLimit, 1, 8, defaultFrontendLayout.home.projectPreviewLimit),
      momentPreviewLimit: pickInteger(home.momentPreviewLimit, 1, 6, defaultFrontendLayout.home.momentPreviewLimit),
      showStatusStrip: pickBoolean(home.showStatusStrip, defaultFrontendLayout.home.showStatusStrip),
      showProjectPreview: pickBoolean(home.showProjectPreview, defaultFrontendLayout.home.showProjectPreview),
      showMomentPreview: pickBoolean(home.showMomentPreview, defaultFrontendLayout.home.showMomentPreview),
      showProfileCard: pickBoolean(home.showProfileCard, defaultFrontendLayout.home.showProfileCard),
      showStatsCard: pickBoolean(home.showStatsCard, defaultFrontendLayout.home.showStatsCard),
      showCategoryCard: pickBoolean(home.showCategoryCard, defaultFrontendLayout.home.showCategoryCard)
    },
    archive: {
      defaultCategory: cleanKey(archive.defaultCategory, defaultFrontendLayout.archive.defaultCategory),
      showSearchPanel: pickBoolean(archive.showSearchPanel, defaultFrontendLayout.archive.showSearchPanel),
      showGithubPanel: pickBoolean(archive.showGithubPanel, defaultFrontendLayout.archive.showGithubPanel)
    },
    moments: {
      defaultKind: cleanKey(moments.defaultKind, defaultFrontendLayout.moments.defaultKind),
      showDraftPanel: pickBoolean(moments.showDraftPanel, defaultFrontendLayout.moments.showDraftPanel)
    },
    projects: {
      cardStyle: pickChoice(projects.cardStyle, ["cover", "compact", "minimal"], defaultFrontendLayout.projects.cardStyle),
      showRoadmap: pickBoolean(projects.showRoadmap, defaultFrontendLayout.projects.showRoadmap),
      showMaintain: pickBoolean(projects.showMaintain, defaultFrontendLayout.projects.showMaintain)
    },
    footer: {
      motion: pickChoice(footer.motion, ["candles", "loader", "both", "none"], defaultFrontendLayout.footer.motion)
    }
  };
}

function normalizeSort(value, fallback = 0) {
  return pickInteger(value, 0, 9999, fallback);
}

function normalizeGallerySort(value, fallback = 0) {
  return pickInteger(value, 0, 999999, fallback);
}

function normalizeUiList(value, fallback, normalizer, limit = 24) {
  const list = Array.isArray(value) ? value : fallback;
  const normalized = list.slice(0, limit).map((item, index) => normalizer(item, fallback[index] || {}, index)).filter(Boolean);
  return normalized.length ? normalized.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)) : fallback;
}

function normalizeArchiveCategory(item = {}, fallback = {}, index = 0) {
  const slug = cleanKey(item.slug ?? fallback.slug ?? "", "");
  const id = cleanKey(item.id || slug || fallback.id, `cat-${index + 1}`);
  const fallbackHref = slug ? `/archive.html?cat=${slug}` : "/archive.html";
  const href = cleanUiHref(item.href || fallback.href || fallbackHref, fallbackHref);
  return {
    id,
    label: cleanText(localizeLegacyUiText(item.label ?? fallback.label ?? "分类"), 40),
    slug,
    description: cleanText(item.description ?? fallback.description ?? "", 120),
    countText: cleanText(item.countText ?? fallback.countText ?? "", 20),
    href,
    visibleInHome: pickBoolean(item.visibleInHome, fallback.visibleInHome ?? true),
    visibleInArchive: pickBoolean(item.visibleInArchive, fallback.visibleInArchive ?? true),
    sortOrder: normalizeSort(item.sortOrder, fallback.sortOrder ?? index * 10)
  };
}

function normalizeProfileUi(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    avatarUrl: cleanUiHref(source.avatarUrl || defaultFrontendUi.profile.avatarUrl, defaultFrontendUi.profile.avatarUrl)
  };
}

function normalizeAboutStackItem(item = {}, fallback = {}, index = 0) {
  return {
    id: cleanKey(item.id || fallback.id, `stack-${index + 1}`),
    label: cleanText(localizeLegacyUiText(item.label ?? fallback.label ?? "技术项"), 60),
    visible: pickBoolean(item.visible, fallback.visible ?? true),
    sortOrder: normalizeSort(item.sortOrder, fallback.sortOrder ?? index * 10)
  };
}

function normalizeAboutGalleryImages(value = []) {
  const list = Array.isArray(value) ? value : defaultFrontendUi.aboutGalleryImages;
  const seenUrls = new Set();
  const ordered = list
    .map((item = {}, index) => ({
      item,
      index,
      sortOrder: normalizeGallerySort(item.sortOrder, index + 1)
    }))
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.index - b.index);
  const images = [];
  for (const { item, index, sortOrder } of ordered) {
    const url = cleanGalleryImageUrl(item.url);
    const urlKey = url.trim();
    if (!url || seenUrls.has(urlKey)) continue;
    seenUrls.add(urlKey);
    images.push({
      id: cleanKey(item.id, `about-gallery-${images.length + 1}`),
      url,
      visible: pickBoolean(item.visible, true),
      sortOrder: sortOrder || index + 1
    });
    if (images.length >= aboutGalleryImageLimit) break;
  }
  return images.map((item, index) => ({ ...item, sortOrder: index + 1 }));
}

const preferredMomentKinds = {
  all: { id: "all", label: "碎片", kind: "all", subLabel: "灵机一动", visible: true, sortOrder: 0 },
  project: { id: "project", label: "痕迹", kind: "project", subLabel: "合理摸鱼", visible: true, sortOrder: 10 },
  life: { id: "life", label: "日常", kind: "life", subLabel: "是这样的", visible: true, sortOrder: 20 }
};
const preferredMomentKindOrder = ["all", "project", "life"];
const legacyMomentKindText = {
  all: { label: new Set(["", "全部", "碎片"]), subLabel: new Set(["", "随手记"]) },
  project: { label: new Set(["", "项目"]), subLabel: new Set(["", "进度留痕"]) },
  life: { label: new Set(["", "生活"]), subLabel: new Set(["", "轻一点"]) }
};

function normalizeMomentKind(item = {}, fallback = {}, index = 0) {
  const rawKind = item.kind ?? item.id ?? fallback.kind ?? fallback.id;
  const kind = cleanKey(rawKind, index === 0 ? "all" : `kind-${index + 1}`);
  const preferred = preferredMomentKinds[kind];
  if (!preferred) return null;
  const legacyText = legacyMomentKindText[kind];
  const rawLabel = cleanText(localizeLegacyUiText(item.label ?? fallback.label ?? preferred.label), 40);
  const rawSubLabel = cleanText(localizeLegacyUiText(item.subLabel ?? fallback.subLabel ?? preferred.subLabel), 60);
  return {
    id: preferred.id,
    label: legacyText.label.has(rawLabel.trim()) ? preferred.label : rawLabel,
    kind: preferred.kind,
    subLabel: legacyText.subLabel.has(rawSubLabel.trim()) ? preferred.subLabel : rawSubLabel,
    visible: pickBoolean(item.visible, fallback.visible ?? preferred.visible),
    sortOrder: preferred.sortOrder
  };
}

function normalizeMomentKindList(value) {
  const list = Array.isArray(value) ? value : defaultFrontendUi.momentKinds;
  const normalized = list.map((item, index) => {
    const key = item?.kind || item?.id;
    return normalizeMomentKind(item, preferredMomentKinds[key] || {}, index);
  }).filter(Boolean);
  const byKind = new Map(normalized.map((item) => [item.kind, item]));
  return preferredMomentKindOrder
    .map((kind, index) => byKind.get(kind) || normalizeMomentKind(preferredMomentKinds[kind], preferredMomentKinds[kind], index))
    .filter(Boolean);
}

function normalizePageChip(item = {}, fallback = {}, index = 0) {
  return {
    id: cleanKey(item.id || fallback.id, `chip-${index + 1}`),
    label: cleanText(localizeLegacyUiText(item.label ?? fallback.label ?? "标签"), 40),
    subLabel: cleanText(localizeLegacyUiText(item.subLabel ?? fallback.subLabel ?? ""), 80),
    visible: pickBoolean(item.visible, fallback.visible ?? true),
    sortOrder: normalizeSort(item.sortOrder, fallback.sortOrder ?? index * 10)
  };
}

function normalizeFooterTag(item = {}, fallback = {}, index = 0) {
  return {
    id: cleanKey(item.id || fallback.id, `footer-tag-${index + 1}`),
    label: cleanText(localizeLegacyUiText(item.label ?? fallback.label ?? "标签"), 40),
    visible: pickBoolean(item.visible, fallback.visible ?? true),
    sortOrder: normalizeSort(item.sortOrder, fallback.sortOrder ?? index * 10)
  };
}

function normalizeSearchSuggestion(item = {}, fallback = {}, index = 0) {
  return {
    id: cleanKey(item.id || fallback.id, `suggestion-${index + 1}`),
    label: cleanText(localizeLegacyUiText(item.label ?? fallback.label ?? "入口"), 60),
    href: cleanUiHref(item.href || fallback.href || "/", "/"),
    visible: pickBoolean(item.visible, fallback.visible ?? true),
    sortOrder: normalizeSort(item.sortOrder, fallback.sortOrder ?? index * 10)
  };
}

function normalizeHomeSectionTitleValue(value, fallback, aliases = []) {
  const text = cleanText(localizeLegacyUiText(value ?? fallback), 40);
  const key = String(text || "").trim().toLowerCase();
  const aliasSet = new Set(aliases.map((item) => String(item).trim().toLowerCase()));
  if (!key || aliasSet.has(key)) return fallback;
  return text;
}

function normalizeFrontendUi(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const pageChips = source.pageChips && typeof source.pageChips === "object" ? source.pageChips : {};
  const footer = source.footer && typeof source.footer === "object" ? source.footer : {};
  const sectionTitles = source.sectionTitles && typeof source.sectionTitles === "object" ? source.sectionTitles : {};
  return {
    profile: normalizeProfileUi(source.profile),
    archiveCategories: normalizeUiList(source.archiveCategories, defaultFrontendUi.archiveCategories, normalizeArchiveCategory, 32),
    aboutStackItems: normalizeUiList(source.aboutStackItems, defaultFrontendUi.aboutStackItems, normalizeAboutStackItem, 24),
    aboutGalleryImages: normalizeAboutGalleryImages(source.aboutGalleryImages),
    momentKinds: normalizeMomentKindList(source.momentKinds),
    pageChips: {
      archive: normalizeUiList(pageChips.archive, defaultFrontendUi.pageChips.archive, normalizePageChip, 12),
      projects: normalizeUiList(pageChips.projects, defaultFrontendUi.pageChips.projects, normalizePageChip, 12),
      interview: normalizeUiList(pageChips.interview, defaultFrontendUi.pageChips.interview, normalizePageChip, 12),
      about: normalizeUiList(pageChips.about, defaultFrontendUi.pageChips.about, normalizePageChip, 12)
    },
    footer: {
      brandBody: normalizeKnowledgeBrandBody(footer.brandBody ?? defaultFrontendUi.footer.brandBody),
      tags: normalizeUiList(footer.tags, defaultFrontendUi.footer.tags, normalizeFooterTag, 12)
    },
    searchSuggestions: normalizeUiList(source.searchSuggestions, defaultFrontendUi.searchSuggestions, normalizeSearchSuggestion, 12),
    sectionTitles: {
      homeProjects: normalizeHomeSectionTitleValue(sectionTitles.homeProjects, "Projects", ["\u9879\u76ee", "project", "projects"]),
      homeMoments: normalizeHomeSectionTitleValue(sectionTitles.homeMoments, "Moments", ["\u77ac\u95f4", "moment", "moments"]),
      homeCategory: cleanText(localizeLegacyUiText(sectionTitles.homeCategory ?? defaultFrontendUi.sectionTitles.homeCategory), 40)
    }
  };
}

async function getFrontendLayout() {
  const raw = await getSetting(frontendLayoutSettingKey, "");
  if (!raw) return normalizeFrontendLayout(defaultFrontendLayout);
  try {
    return normalizeFrontendLayout(JSON.parse(raw));
  } catch {
    return normalizeFrontendLayout(defaultFrontendLayout);
  }
}

async function getFrontendUi() {
  const raw = await getSetting(frontendUiSettingKey, "");
  if (!raw || isLikelyMojibakeText(raw)) return normalizeFrontendUi(defaultFrontendUi);
  try {
    return normalizeFrontendUi(JSON.parse(raw));
  } catch {
    return normalizeFrontendUi(defaultFrontendUi);
  }
}

async function getFrontendEditorBackup() {
  const raw = await getSetting(frontendEditorBackupKey, "");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function getFrontendEditorDraft() {
  const raw = await getSetting(frontendEditorDraftKey, "");
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw);
    if (!draft || typeof draft !== "object" || !draft.payload) return null;
    return draft;
  } catch {
    return null;
  }
}

async function setFrontendEditorDraft(payload) {
  const draft = {
    savedAt: new Date().toISOString(),
    payload: normalizeFrontendEditorPayload(payload)
  };
  await setSetting(frontendEditorDraftKey, JSON.stringify(draft));
  return draft;
}

async function clearFrontendEditorDraft() {
  await query("DELETE FROM site_settings WHERE setting_key=:key", { key: frontendEditorDraftKey });
}

async function snapshotFrontendEditor(reason = "save") {
  const snapshot = {
    savedAt: new Date().toISOString(),
    reason,
    texts: await getFrontendTextMap(),
    rules: await getSetting("site_text_rules", ""),
    footerSections: await getFooterSections(),
    layout: await getFrontendLayout(),
    ui: await getFrontendUi()
  };
  await setSetting(frontendEditorBackupKey, JSON.stringify(snapshot));
  return snapshot;
}

function normalizeFrontendEditorPayload(body = {}) {
  const source = body && typeof body === "object" ? body : {};
  const incomingTexts = source.texts && typeof source.texts === "object" ? source.texts : {};
  const texts = {};
  for (const item of frontendTextDefaults) {
    texts[item.key] = String(normalizeFrontendTextValue(item.key, incomingTexts[item.key] ?? item.defaultValue)).slice(0, 1200);
  }
  return {
    texts,
    rules: String(source.rules || "").slice(0, 10000),
    footerSections: normalizeFooterSections(source.footerSections),
    layout: normalizeFrontendLayout(source.layout),
    ui: normalizeFrontendUi(source.ui)
  };
}

async function publishFrontendEditorPayload(payload, reason = "frontend-editor-publish", user = null) {
  const normalized = normalizeFrontendEditorPayload(payload);
  await snapshotFrontendEditor(reason);
  for (const item of frontendTextDefaults) {
    await setSetting(`site_text.${item.key}`, normalized.texts[item.key]);
  }
  await setSetting("site_text_rules", normalized.rules);
  await setSetting(footerSettingKey, JSON.stringify(normalized.footerSections));
  await setSetting(frontendLayoutSettingKey, JSON.stringify(normalized.layout));
  await setSetting(frontendUiSettingKey, JSON.stringify(normalized.ui));
  await cacheDel("site:texts");
  await recordSettingVersion("frontend-editor", normalized, user, reason);
  return normalized;
}

function footerSectionsFromBody(body) {
  const sections = [];
  for (let sectionIndex = 0; sectionIndex < footerSectionLimit; sectionIndex += 1) {
    const title = body[`footer_section_${sectionIndex}_title`];
    const links = [];
    for (let linkIndex = 0; linkIndex < footerLinkLimit; linkIndex += 1) {
      links.push({
        label: body[`footer_section_${sectionIndex}_link_${linkIndex}_label`],
        href: body[`footer_section_${sectionIndex}_link_${linkIndex}_href`],
        desc: body[`footer_section_${sectionIndex}_link_${linkIndex}_desc`]
      });
    }
    sections.push({ title, links });
  }
  return normalizeFooterSections(sections);
}

function renderFooterSectionEditor(sections) {
  const values = [...normalizeFooterSections(sections)];
  while (values.length < footerSectionLimit) values.push({ title: "", links: [] });
  return `<div class="footer-config">${values.map((section, sectionIndex) => {
    const links = [...section.links];
    while (links.length < footerLinkLimit) links.push({ label: "", href: "", desc: "" });
    return `<section class="footer-config-section">
      <h3>页脚栏目 ${sectionIndex + 1}</h3>
      <label>栏目名</label>
      <input name="footer_section_${sectionIndex}_title" value="${escapeAttr(section.title)}" placeholder="友链 / 图库">
      ${links.map((link, linkIndex) => `<div class="footer-link-row">
        <div><label>链接名</label><input name="footer_section_${sectionIndex}_link_${linkIndex}_label" value="${escapeAttr(link.label)}" placeholder="GitHub"></div>
        <div><label>地址</label><input name="footer_section_${sectionIndex}_link_${linkIndex}_href" value="${escapeAttr(link.href)}" placeholder="/archive 或 https://example.com"></div>
        <div><label>说明</label><input name="footer_section_${sectionIndex}_link_${linkIndex}_desc" value="${escapeAttr(link.desc)}" placeholder="可选说明"></div>
      </div>`).join("")}
    </section>`;
  }).join("")}</div>`;
}

function aboutGalleryImagesFromBody(body) {
  const items = [];
  for (let index = 0; index < aboutGalleryImageLimit; index += 1) {
    const url = body[`about_gallery_${index}_url`];
    if (!url) continue;
    items.push({
      id: body[`about_gallery_${index}_id`] || `about-gallery-${index + 1}`,
      url,
      visible: Object.prototype.hasOwnProperty.call(body, `about_gallery_${index}_visible`),
      sortOrder: body[`about_gallery_${index}_sort`]
    });
  }
  return normalizeAboutGalleryImages(items);
}

function renderAboutGalleryEditor(images) {
  const values = [...normalizeAboutGalleryImages(images)];
  if (values.length < aboutGalleryImageLimit) {
    const index = values.length;
    values.push({ id: `about-gallery-${index + 1}`, url: "", visible: true, sortOrder: index + 1 });
  }
  return `<div class="footer-config about-gallery-config">${values.slice(0, aboutGalleryImageLimit).map((image, index) => `
    <section class="footer-config-section">
      <h3>图片 ${index + 1}</h3>
      <input type="hidden" name="about_gallery_${index}_id" value="${escapeAttr(image.id || `about-gallery-${index + 1}`)}">
      <div class="gallery-link-row">
        <div><label>图片链接</label><input name="about_gallery_${index}_url" value="${escapeAttr(image.url || "")}" placeholder="/uploads/photo.jpg 或 https://example.com/photo.jpg"></div>
        <div><label>排序</label><input name="about_gallery_${index}_sort" type="number" value="${escapeAttr(image.sortOrder ?? index + 1)}"></div>
        <label class="gallery-visible"><input name="about_gallery_${index}_visible" type="checkbox"${image.visible === false ? "" : " checked"}>显示</label>
      </div>
    </section>`).join("")}</div>`;
}

function levelFromCount(count) {
  if (!count) return 0;
  if (count <= 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

async function fetchQuote() {
  const cacheKey = "site:quote:hz-library-v1";
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  if (databaseAvailable) {
    try {
      const rows = await query(`SELECT id, text, updated_at
        FROM hz_quotes
        WHERE status='published' AND visible=1 AND deleted_at IS NULL
        ORDER BY sort_order ASC, updated_at DESC, id DESC
        LIMIT 80`);
      if (rows.length) {
        const index = Math.floor(Date.now() / 300000) % rows.length;
        const row = rows[index];
        const quote = {
          id: row.id,
          text: String(row.text || "").trim(),
          from: "Hz",
          source: "hz-library",
          updatedAt: row.updated_at || null
        };
        await cacheSet(cacheKey, quote, 120);
        return quote;
      }
    } catch (error) {
      if (error.errno !== 1146) console.warn("hz quote library failed", error);
    }
  }

  const index = Math.floor(Date.now() / 300000) % fallbackQuotes.length;
  const quote = { ...fallbackQuotes[index], source: "hz-local" };
  await cacheSet(cacheKey, quote, 120);
  return quote;
}

function publicHzQuote(row = {}) {
  return {
    id: row.id || "",
    text: row.text || "",
    from: "Hz",
    status: row.status || "draft",
    visible: Boolean(Number(row.visible ?? 1)),
    sortOrder: Number(row.sort_order ?? row.sortOrder ?? 0),
    createdAt: row.created_at || row.createdAt || "",
    updatedAt: row.updated_at || row.updatedAt || "",
    deletedAt: row.deleted_at || row.deletedAt || null
  };
}

function normalizeHzQuotePayload(body = {}, current = {}) {
  const text = cleanMultilineText(body.text ?? current.text ?? "", 20000);
  return {
    text,
    status: cleanStatus(body.status ?? current.status, ["draft", "published"], current.status || "published"),
    visible: body.visible === undefined ? Number(current.visible ?? 1) : (body.visible ? 1 : 0),
    sort_order: clampNumber(body.sort_order ?? body.sortOrder ?? current.sort_order, -9999, 9999, 0)
  };
}

async function listHzQuotes({ includeDeleted = false } = {}) {
  if (!databaseAvailable) return { items: fallbackQuotes.map((item, index) => publicHzQuote({ id: index + 1, text: item.text, status: "published", visible: 1, sort_order: index * 10 })) };
  const rows = await query(`SELECT *
    FROM hz_quotes
    ${includeDeleted ? "" : "WHERE deleted_at IS NULL"}
    ORDER BY sort_order ASC, updated_at DESC, id DESC
    LIMIT 200`);
  return { items: rows.map(publicHzQuote) };
}

async function clearHzQuoteCache() {
  await cacheDel("site:quote:hz-library-v1").catch(() => {});
  await cacheDel("site:quote:dog-xxapi-v1").catch(() => {});
}

function formatMoyuPayload(payload) {
  const data = payload?.data || {};
  const date = data.date || {};
  const today = data.today || {};
  const progress = data.progress || {};
  const countdown = data.countdown || {};
  const nextHoliday = data.nextHoliday || null;
  const nextWeekend = data.nextWeekend || null;
  const quote = cleanText(data.moyuQuote || "今天也要保留一点余裕。", 180);
  const dateLabel = [date.gregorian, date.weekday].filter(Boolean).join(" ");
  const modules = [
    {
      kind: "quote",
      label: "摸鱼语录",
      title: quote,
      body: dateLabel || "今日状态同步中",
      percent: null
    }
  ];

  for (const [kind, label] of [["week", "本周"], ["month", "本月"], ["year", "今年"]]) {
    const item = progress[kind];
    if (!item) continue;
    const percent = clampNumber(item.percentage, 0, 100, 0);
    modules.push({
      kind: `progress-${kind}`,
      label: `${label}进度`,
      title: `${percent}%`,
      body: `已过 ${item.passed || 0}/${item.total || 0}，还剩 ${item.remaining || 0} 天`,
      percent
    });
  }

  if (nextHoliday?.name) {
    modules.push({
      kind: "holiday",
      label: "下个假期",
      title: `${cleanText(nextHoliday.name, 24)} 还有 ${nextHoliday.until ?? "?"} 天`,
      body: `${cleanText(nextHoliday.date || "", 20)}，共 ${nextHoliday.duration || 0} 天`,
      percent: null
    });
  }

  if (nextWeekend) {
    const days = Number(countdown.toWeekEnd ?? nextWeekend.daysUntil ?? 0);
    modules.push({
      kind: "weekend",
      label: "周末倒计时",
      title: days <= 0 ? "已经到周末啦" : `还有 ${days} 天`,
      body: [nextWeekend.date, nextWeekend.weekday].filter(Boolean).join(" "),
      percent: null
    });
  }

  return {
    source: "uctb-moyu",
    fetchedAt: new Date().toISOString(),
    date: {
      gregorian: cleanText(date.gregorian || "", 20),
      weekday: cleanText(date.weekday || "", 12)
    },
    status: {
      isWeekend: Boolean(today.isWeekend),
      isHoliday: Boolean(today.isHoliday),
      isWorkday: Boolean(today.isWorkday),
      label: today.isWorkday ? "工作日" : "休息日"
    },
    quote,
    modules: modules.filter((item) => item.title)
  };
}

const moyuSnapshotSettingKey = "moyu_daily_snapshot_v1";
const moyuSnapshotCacheKey = "site:moyu:daily-snapshot-v1";
const legacyMoyuCacheKey = "site:moyu:uctb-v1";
const chinaOffsetMs = 8 * 60 * 60 * 1000;

function chinaDateKey(date = new Date()) {
  return new Date(date.getTime() + chinaOffsetMs).toISOString().slice(0, 10);
}

function msUntilNextChinaMidnight(now = new Date()) {
  const chinaNow = new Date(now.getTime() + chinaOffsetMs);
  const nextUtc = Date.UTC(
    chinaNow.getUTCFullYear(),
    chinaNow.getUTCMonth(),
    chinaNow.getUTCDate() + 1,
    -8,
    0,
    0,
    0
  );
  return Math.max(1000, nextUtc - now.getTime());
}

function moyuCacheSeconds() {
  return Math.ceil(msUntilNextChinaMidnight() / 1000) + 3600;
}

const dailyApiSnapshotCachePrefix = "api:daily-snapshot:v1";
const dailyApiRefreshPromises = new Map();
const externalAssetCacheDirName = "_external-api-cache";
const externalAssetMaxBytes = 8 * 1024 * 1024;

function dailyApiSnapshotCacheSeconds() {
  return Math.ceil(msUntilNextChinaMidnight() / 1000) + 6 * 60 * 60;
}

function apiSnapshotCacheKey(snapshotKey, dayKey = chinaDateKey()) {
  return `${dailyApiSnapshotCachePrefix}:${snapshotKey}:${dayKey}`;
}

function normalizeApiSnapshotKey(value = "") {
  return cleanText(String(value || "").replace(/[^a-zA-Z0-9:_-]/g, "-"), 160) || "unknown";
}

async function readApiDailySnapshot(snapshotKey, { dayKey = chinaDateKey(), allowStale = false } = {}) {
  if (!databaseAvailable) return null;
  const key = normalizeApiSnapshotKey(snapshotKey);
  if (!allowStale) {
    const cached = await cacheGet(apiSnapshotCacheKey(key, dayKey));
    if (cached?.payload) return cached.payload;
  }
  const row = allowStale
    ? await getOne(`SELECT payload_json FROM api_daily_snapshots
        WHERE snapshot_key=:snapshot_key AND status='ready'
        ORDER BY day_key DESC, refreshed_at DESC, id DESC LIMIT 1`, { snapshot_key: key })
    : await getOne(`SELECT payload_json FROM api_daily_snapshots
        WHERE snapshot_key=:snapshot_key AND day_key=:day_key AND status='ready'
        LIMIT 1`, { snapshot_key: key, day_key: String(dayKey).slice(0, 10) });
  if (!row?.payload_json) return null;
  try {
    const payload = JSON.parse(row.payload_json);
    if (!allowStale) await cacheSet(apiSnapshotCacheKey(key, dayKey), { payload }, dailyApiSnapshotCacheSeconds());
    return payload;
  } catch {
    return null;
  }
}

async function writeApiDailySnapshot(snapshotKey, payload, { source = "" } = {}) {
  if (!databaseAvailable) return payload;
  const key = normalizeApiSnapshotKey(snapshotKey);
  const dayKey = chinaDateKey();
  const normalized = {
    ...(payload && typeof payload === "object" ? payload : { value: payload }),
    backendSnapshot: true,
    snapshotKey: key,
    snapshotDay: dayKey,
    snapshottedAt: new Date().toISOString()
  };
  await query(`INSERT INTO api_daily_snapshots
      (snapshot_key, day_key, status, payload_json, source, error_message, refreshed_at, created_at, updated_at)
    VALUES(:snapshot_key, :day_key, 'ready', :payload_json, :source, '', NOW(), NOW(), NOW())
    ON DUPLICATE KEY UPDATE
      status='ready', payload_json=:payload_json, source=:source, error_message='', refreshed_at=NOW(), updated_at=NOW()`, {
    snapshot_key: key,
    day_key: dayKey,
    payload_json: JSON.stringify(normalized),
    source: cleanText(source || normalized.source || "", 120)
  });
  await cacheSet(apiSnapshotCacheKey(key, dayKey), { payload: normalized }, dailyApiSnapshotCacheSeconds());
  return normalized;
}

async function recordApiDailySnapshotFailure(snapshotKey, error) {
  if (!databaseAvailable) return;
  const key = normalizeApiSnapshotKey(snapshotKey);
  await query(`INSERT INTO api_daily_snapshots
      (snapshot_key, day_key, status, payload_json, source, error_message, refreshed_at, created_at, updated_at)
    VALUES(:snapshot_key, :day_key, 'failed', NULL, '', :error_message, NOW(), NOW(), NOW())
    ON DUPLICATE KEY UPDATE status='failed', error_message=:error_message, refreshed_at=NOW(), updated_at=NOW()`, {
    snapshot_key: key,
    day_key: chinaDateKey(),
    error_message: cleanText(error?.message || String(error || "refresh failed"), 1000)
  });
}

function isExternalHttpUrl(value = "") {
  try {
    const url = new URL(String(value || ""));
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
    if (/^(?:10|127|169\.254|192\.168)\./.test(host)) return false;
    if (/^172\.(?:1[6-9]|2\d|3[0-1])\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function externalAssetProxyUrl(remoteUrl = "") {
  return isExternalHttpUrl(remoteUrl) ? `/api/external-asset?url=${encodeURIComponent(remoteUrl)}` : remoteUrl;
}

function externalAssetHash(remoteUrl = "") {
  return crypto.createHash("sha256").update(String(remoteUrl || "")).digest("hex").slice(0, 32);
}

function externalAssetExtension(remoteUrl = "", contentType = "") {
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (type === "image/png") return ".png";
  if (type === "image/webp") return ".webp";
  if (type === "image/gif") return ".gif";
  if (type === "image/svg+xml") return ".svg";
  if (type === "image/jpeg" || type === "image/jpg") return ".jpg";
  try {
    const ext = path.extname(new URL(remoteUrl).pathname).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"].includes(ext)) return ext === ".jpeg" ? ".jpg" : ext;
  } catch {}
  return ".jpg";
}

async function existingExternalAssetFile(hash) {
  const dir = path.join(config.uploads.dir, externalAssetCacheDirName);
  try {
    const files = await fs.promises.readdir(dir);
    const file = files.find((name) => name.startsWith(`${hash}.`) && !name.endsWith(".json"));
    if (!file) return null;
    const metaPath = path.join(dir, `${hash}.json`);
    let contentType = "";
    try {
      contentType = JSON.parse(await fs.promises.readFile(metaPath, "utf8"))?.contentType || "";
    } catch {}
    return { file: path.join(dir, file), contentType };
  } catch {
    return null;
  }
}

async function cacheExternalAsset(remoteUrl = "") {
  if (!isExternalHttpUrl(remoteUrl)) throw new Error("external asset url invalid");
  const hash = externalAssetHash(remoteUrl);
  const existing = await existingExternalAssetFile(hash);
  if (existing?.file) return existing;
  const response = await fetch(remoteUrl, {
    headers: { "User-Agent": "JlemonzBlog/1.0 (asset cache)", Accept: "image/*,*/*;q=0.5" },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`external asset failed: ${response.status}`);
  const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (contentType && !contentType.startsWith("image/")) throw new Error("external asset not image");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > externalAssetMaxBytes) throw new Error("external asset size invalid");
  const dir = path.join(config.uploads.dir, externalAssetCacheDirName);
  await fs.promises.mkdir(dir, { recursive: true });
  const ext = externalAssetExtension(remoteUrl, contentType);
  const file = path.join(dir, `${hash}${ext}`);
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fs.promises.writeFile(tmp, buffer);
  await fs.promises.rename(tmp, file);
  await fs.promises.writeFile(path.join(dir, `${hash}.json`), JSON.stringify({
    remoteUrl,
    contentType: contentType || staticMimeTypes[ext] || "image/jpeg",
    cachedAt: new Date().toISOString()
  }), "utf8");
  return { file, contentType: contentType || staticMimeTypes[ext] || "image/jpeg" };
}

async function prepareApiSnapshotPayload(payload, { cacheAssets = false } = {}) {
  const copy = JSON.parse(JSON.stringify(payload || {}));
  if (!cacheAssets || !Array.isArray(copy.items)) return copy;
  const assetFields = ["cover", "artwork", "image", "thumbnail"];
  await Promise.allSettled(copy.items.flatMap((item) => assetFields
    .map((field) => item?.[field])
    .filter(isExternalHttpUrl)
    .map((remoteUrl) => cacheExternalAsset(remoteUrl))));
  for (const item of copy.items) {
    for (const field of assetFields) {
      if (isExternalHttpUrl(item?.[field])) item[field] = externalAssetProxyUrl(item[field]);
    }
  }
  return copy;
}

async function refreshDailyApiSnapshot(snapshotKey, loader, options = {}) {
  if (!databaseAvailable) return loader();
  const key = normalizeApiSnapshotKey(snapshotKey);
  if (dailyApiRefreshPromises.has(key)) return dailyApiRefreshPromises.get(key);
  const promise = (async () => {
    try {
      const payload = await loader();
      const prepared = await prepareApiSnapshotPayload(payload, options);
      return await writeApiDailySnapshot(key, prepared, { source: prepared?.source || options.source || "" });
    } catch (error) {
      await recordApiDailySnapshotFailure(key, error);
      throw error;
    }
  })().finally(() => {
    dailyApiRefreshPromises.delete(key);
  });
  dailyApiRefreshPromises.set(key, promise);
  return promise;
}

async function dailyApiSnapshotPayload(snapshotKey, loader, fallbackLoader, options = {}) {
  if (!databaseAvailable) {
    try {
      return await loader();
    } catch (error) {
      return fallbackLoader ? fallbackLoader(error) : { items: [], error: "api_unavailable" };
    }
  }
  const key = normalizeApiSnapshotKey(snapshotKey);
  const todaySnapshot = await readApiDailySnapshot(key);
  if (todaySnapshot) return todaySnapshot;
  const stale = await readApiDailySnapshot(key, { allowStale: true });
  if (stale) {
    refreshDailyApiSnapshot(key, loader, options).catch((error) => console.warn("daily api background refresh failed", key, error?.message || error));
    return { ...stale, stale: true };
  }
  try {
    return await refreshDailyApiSnapshot(key, loader, options);
  } catch (error) {
    return fallbackLoader ? fallbackLoader(error) : { items: [], error: "api_unavailable", updatedAt: new Date().toISOString() };
  }
}

async function serveExternalAsset(req, res, url) {
  if (!["GET", "HEAD"].includes(req.method)) return false;
  const remoteUrl = url.searchParams.get("url") || "";
  try {
    const asset = await cacheExternalAsset(remoteUrl);
    const contentType = asset.contentType || staticMimeTypes[path.extname(asset.file).toLowerCase()] || "image/jpeg";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      ...corsHeaders
    });
    if (req.method === "HEAD") return res.end(), true;
    fs.createReadStream(asset.file).pipe(res);
    return true;
  } catch (error) {
    json(res, { error: "asset_unavailable" }, 404);
    return true;
  }
}

function chinaDateParts(date = new Date()) {
  const chinaNow = new Date(date.getTime() + chinaOffsetMs);
  const year = chinaNow.getUTCFullYear();
  const month = chinaNow.getUTCMonth() + 1;
  const day = chinaNow.getUTCDate();
  const weekdayIndex = chinaNow.getUTCDay();
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return { year, month, day, weekdayIndex, weekday: weekdays[weekdayIndex] };
}

function localMoyuProgressParts() {
  const parts = chinaDateParts();
  const daysInMonth = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
  const yearDays = new Date(Date.UTC(parts.year, 1, 29)).getUTCMonth() === 1 ? 366 : 365;
  const dayOfYear = Math.floor((Date.UTC(parts.year, parts.month - 1, parts.day) - Date.UTC(parts.year, 0, 0)) / 86400000);
  const weekPassed = parts.weekdayIndex === 0 ? 7 : parts.weekdayIndex;
  const weekPercent = Math.round((weekPassed / 7) * 100);
  const monthPercent = Math.round((parts.day / daysInMonth) * 100);
  const yearPercent = Math.round((dayOfYear / yearDays) * 100);
  const toWeekend = parts.weekdayIndex === 0 || parts.weekdayIndex === 6 ? 0 : 6 - parts.weekdayIndex;
  const dateText = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")} ${parts.weekday}`;
  return { ...parts, daysInMonth, yearDays, dayOfYear, weekPassed, weekPercent, monthPercent, yearPercent, toWeekend, dateText };
}

function fallbackMoyuSnapshot() {
  const parts = localMoyuProgressParts();
  const isWeekend = parts.weekdayIndex === 0 || parts.weekdayIndex === 6;
  return {
    source: "moyu-local",
    fetchedAt: new Date().toISOString(),
    snapshotDay: chinaDateKey(),
    date: { gregorian: parts.dateText, weekday: parts.weekday },
    status: { isWeekend, isHoliday: false, isWorkday: !isWeekend, label: isWeekend ? "休息日" : "工作日" },
    quote: isWeekend ? "周末慢慢充电，别让任务追着人跑。" : "今天也要保留一点余裕，把节奏握在自己手里。",
    modules: [
      {
        kind: "status",
        label: "今日状态",
        title: isWeekend ? "周末充电中" : "工作日稳住节奏",
        body: `${parts.dateText} · 外部摸鱼 API 不稳定时由本站自动计算`,
        percent: isWeekend ? null : parts.weekPercent
      },
      {
        kind: "progress-week",
        label: "本周进度",
        title: `${parts.weekPercent}%`,
        body: `已过 ${parts.weekPassed}/7 天，${parts.toWeekend ? `离周末还有 ${parts.toWeekend} 天` : "已经到周末啦"}`,
        percent: parts.weekPercent
      },
      {
        kind: "progress-month",
        label: "本月进度",
        title: `${parts.monthPercent}%`,
        body: `已过 ${parts.day}/${parts.daysInMonth} 天`,
        percent: parts.monthPercent
      },
      {
        kind: "progress-year",
        label: "今年进度",
        title: `${parts.yearPercent}%`,
        body: `已过 ${parts.dayOfYear}/${parts.yearDays} 天`,
        percent: parts.yearPercent
      }
    ]
  };
}

function isValidMoyuSnapshot(snapshot) {
  return Boolean(snapshot && Array.isArray(snapshot.modules) && snapshot.modules.some((item) => item?.title));
}

async function readMoyuSnapshot() {
  const cached = await cacheGet(moyuSnapshotCacheKey);
  if (isValidMoyuSnapshot(cached)) return cached;

  const raw = await getSetting(moyuSnapshotSettingKey, "");
  if (raw) {
    try {
      const snapshot = JSON.parse(raw);
      if (isValidMoyuSnapshot(snapshot)) {
        await cacheSet(moyuSnapshotCacheKey, snapshot, moyuCacheSeconds());
        return snapshot;
      }
    } catch {}
  }
  return fallbackMoyuSnapshot();
}

async function writeMoyuSnapshot(snapshot) {
  const normalized = {
    ...snapshot,
    snapshotDay: chinaDateKey(),
    refreshedAt: new Date().toISOString()
  };
  await setSetting(moyuSnapshotSettingKey, JSON.stringify(normalized));
  await cacheSet(moyuSnapshotCacheKey, normalized, moyuCacheSeconds());
  await cacheDel(legacyMoyuCacheKey);
  return normalized;
}

async function fetchMoyuJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`moyu api status ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function formatLooseMoyuPayload(payload, source) {
  const snapshot = fallbackMoyuSnapshot();
  const url = cleanText(payload?.url || payload?.img || payload?.image || payload?.data?.url || payload?.data?.img || "", 500);
  return {
    ...snapshot,
    source,
    modules: [
      {
        kind: "remote",
        label: "摸鱼接口",
        title: "外部摸鱼源已连接",
        body: url ? "外部日历图片已同步，页面继续显示本站进度卡。" : "外部源返回正常，页面继续显示本站进度卡。",
        percent: null
      },
      ...snapshot.modules.slice(1)
    ]
  };
}

async function fetchMoyuFromRemote() {
  const providers = [
    {
      source: "uctb-moyu",
      url: "https://apis.uctb.cn/api/moyu?encoding=json",
      parse(payload) {
        if (payload?.code !== 200 || !payload?.data) throw new Error("moyu api empty response");
        return formatMoyuPayload(payload);
      }
    },
    {
      source: "vvhan-moyu",
      url: "https://api.vvhan.com/api/moyu?type=json",
      parse(payload) {
        return formatLooseMoyuPayload(payload, "vvhan-moyu");
      }
    },
    {
      source: "qqsuu-moyu",
      url: "https://moyu.qqsuu.cn/?type=json",
      parse(payload) {
        return formatLooseMoyuPayload(payload, "qqsuu-moyu");
      }
    }
  ];
  let lastError = null;
  for (const provider of providers) {
    try {
      const payload = await fetchMoyuJson(provider.url);
      const parsed = provider.parse(payload);
      if (isValidMoyuSnapshot(parsed)) return parsed;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("moyu api unavailable");
}

async function refreshMoyuDailySnapshot({ force = false } = {}) {
  const existing = await readMoyuSnapshot();
  if (!force && existing.snapshotDay === chinaDateKey() && existing.source !== "moyu-local") {
    return existing;
  }

  try {
    const snapshot = await fetchMoyuFromRemote();
    return await writeMoyuSnapshot(snapshot);
  } catch (error) {
    console.warn("moyu daily refresh failed", error);
    if (isValidMoyuSnapshot(existing) && existing.source !== "moyu-local") return existing;
    return await writeMoyuSnapshot(fallbackMoyuSnapshot());
  }
}

async function fetchMoyu() {
  return readMoyuSnapshot();
}

function startMoyuDailySnapshotRefresher() {
  let timer = null;

  const scheduleNext = () => {
    clearTimeout(timer);
    timer = setTimeout(runAtMidnight, msUntilNextChinaMidnight());
  };

  const runAtMidnight = async () => {
    try {
      await refreshMoyuDailySnapshot({ force: true });
    } catch (error) {
      console.warn("moyu scheduled refresh failed", error);
    } finally {
      scheduleNext();
    }
  };

  setTimeout(() => {
    refreshMoyuDailySnapshot().catch((error) => console.warn("moyu startup refresh failed", error));
  }, 4000);
  scheduleNext();
}

function weatherCodeText(code) {
  const value = Number(code);
  if (value === 0) return "晴";
  if ([1, 2].includes(value)) return "晴间多云";
  if (value === 3) return "多云";
  if ([45, 48].includes(value)) return "雾";
  if ([51, 53, 55, 56, 57].includes(value)) return "毛毛雨";
  if ([61, 63, 65, 66, 67].includes(value)) return "雨";
  if ([71, 73, 75, 77, 85, 86].includes(value)) return "雪";
  if ([80, 81, 82].includes(value)) return "阵雨";
  if ([95, 96, 99].includes(value)) return "雷雨";
  return "天气同步中";
}

function roundWeatherCoord(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : "";
}

const weatherCityFallbacks = [
  { city: "\u676d\u5dde\u5e02", admin1: "\u6d59\u6c5f\u7701", country: "\u4e2d\u56fd", latitude: 30.2741, longitude: 120.1551 },
  { city: "\u4e0a\u6d77\u5e02", admin1: "\u4e0a\u6d77\u5e02", country: "\u4e2d\u56fd", latitude: 31.2304, longitude: 121.4737 },
  { city: "\u5317\u4eac\u5e02", admin1: "\u5317\u4eac\u5e02", country: "\u4e2d\u56fd", latitude: 39.9042, longitude: 116.4074 },
  { city: "\u6df1\u5733\u5e02", admin1: "\u5e7f\u4e1c\u7701", country: "\u4e2d\u56fd", latitude: 22.5431, longitude: 114.0579 },
  { city: "\u5e7f\u5dde\u5e02", admin1: "\u5e7f\u4e1c\u7701", country: "\u4e2d\u56fd", latitude: 23.1291, longitude: 113.2644 },
  { city: "\u6210\u90fd\u5e02", admin1: "\u56db\u5ddd\u7701", country: "\u4e2d\u56fd", latitude: 30.5728, longitude: 104.0668 },
  { city: "\u6b66\u6c49\u5e02", admin1: "\u6e56\u5317\u7701", country: "\u4e2d\u56fd", latitude: 30.5928, longitude: 114.3055 },
  { city: "\u5357\u4eac\u5e02", admin1: "\u6c5f\u82cf\u7701", country: "\u4e2d\u56fd", latitude: 32.0603, longitude: 118.7969 },
  { city: "\u82cf\u5dde\u5e02", admin1: "\u6c5f\u82cf\u7701", country: "\u4e2d\u56fd", latitude: 31.2989, longitude: 120.5853 },
  { city: "\u5b81\u6ce2\u5e02", admin1: "\u6d59\u6c5f\u7701", country: "\u4e2d\u56fd", latitude: 29.8683, longitude: 121.5440 },
  { city: "\u6e29\u5dde\u5e02", admin1: "\u6d59\u6c5f\u7701", country: "\u4e2d\u56fd", latitude: 27.9938, longitude: 120.6994 },
  { city: "\u91cd\u5e86\u5e02", admin1: "\u91cd\u5e86\u5e02", country: "\u4e2d\u56fd", latitude: 29.5630, longitude: 106.5516 },
  { city: "\u897f\u5b89\u5e02", admin1: "\u9655\u897f\u7701", country: "\u4e2d\u56fd", latitude: 34.3416, longitude: 108.9398 },
  { city: "\u5929\u6d25\u5e02", admin1: "\u5929\u6d25\u5e02", country: "\u4e2d\u56fd", latitude: 39.3434, longitude: 117.3616 },
  { city: "\u9752\u5c9b\u5e02", admin1: "\u5c71\u4e1c\u7701", country: "\u4e2d\u56fd", latitude: 36.0671, longitude: 120.3826 },
  { city: "\u53a6\u95e8\u5e02", admin1: "\u798f\u5efa\u7701", country: "\u4e2d\u56fd", latitude: 24.4798, longitude: 118.0894 },
  { city: "\u798f\u5dde\u5e02", admin1: "\u798f\u5efa\u7701", country: "\u4e2d\u56fd", latitude: 26.0745, longitude: 119.2965 },
  { city: "\u5408\u80a5\u5e02", admin1: "\u5b89\u5fbd\u7701", country: "\u4e2d\u56fd", latitude: 31.8206, longitude: 117.2272 },
  { city: "\u957f\u6c99\u5e02", admin1: "\u6e56\u5357\u7701", country: "\u4e2d\u56fd", latitude: 28.2282, longitude: 112.9388 },
  { city: "\u90d1\u5dde\u5e02", admin1: "\u6cb3\u5357\u7701", country: "\u4e2d\u56fd", latitude: 34.7466, longitude: 113.6254 },
  { city: "\u6d4e\u5357\u5e02", admin1: "\u5c71\u4e1c\u7701", country: "\u4e2d\u56fd", latitude: 36.6512, longitude: 117.1201 },
  { city: "\u5927\u8fde\u5e02", admin1: "\u8fbd\u5b81\u7701", country: "\u4e2d\u56fd", latitude: 38.9140, longitude: 121.6147 },
  { city: "\u6c88\u9633\u5e02", admin1: "\u8fbd\u5b81\u7701", country: "\u4e2d\u56fd", latitude: 41.8057, longitude: 123.4315 },
  { city: "\u54c8\u5c14\u6ee8\u5e02", admin1: "\u9ed1\u9f99\u6c5f\u7701", country: "\u4e2d\u56fd", latitude: 45.8038, longitude: 126.5350 },
  { city: "\u6606\u660e\u5e02", admin1: "\u4e91\u5357\u7701", country: "\u4e2d\u56fd", latitude: 25.0389, longitude: 102.7183 },
  { city: "\u5357\u5b81\u5e02", admin1: "\u5e7f\u897f\u58ee\u65cf\u81ea\u6cbb\u533a", country: "\u4e2d\u56fd", latitude: 22.8170, longitude: 108.3669 },
  { city: "\u6d77\u53e3\u5e02", admin1: "\u6d77\u5357\u7701", country: "\u4e2d\u56fd", latitude: 20.0440, longitude: 110.1999 }
];

function normalizeWeatherCityKeyword(value = "") {
  return cleanText(value, 80)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[市县区省]/g, "");
}

function findLocalWeatherCity(city = "") {
  const keyword = normalizeWeatherCityKeyword(city);
  if (!keyword) return null;
  const match = weatherCityFallbacks.find((item) => {
    const cityKey = normalizeWeatherCityKeyword(item.city);
    const adminKey = normalizeWeatherCityKeyword(item.admin1);
    return cityKey === keyword || cityKey.includes(keyword) || keyword.includes(cityKey) || adminKey === keyword;
  });
  if (!match) return null;
  return {
    name: match.city,
    city: match.city,
    admin1: match.admin1,
    country: match.country,
    latitude: match.latitude,
    longitude: match.longitude,
    source: "local-city"
  };
}

function weatherDistanceKm(aLat, aLon, bLat, bLon) {
  const toRad = (value) => Number(value) * Math.PI / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestWeatherLocation(lat, lon) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const nearest = weatherCityFallbacks
    .map((item) => ({ ...item, distance: weatherDistanceKm(latitude, longitude, item.latitude, item.longitude) }))
    .sort((a, b) => a.distance - b.distance)[0];
  if (!nearest || nearest.distance > 180) return null;
  return {
    name: nearest.city,
    city: nearest.city,
    admin1: nearest.admin1,
    country: nearest.country,
    latitude,
    longitude,
    source: "nearest-city"
  };
}

function normalizePublicIp(value = "") {
  let ip = String(value || "").trim().replace(/^\[|\]$/g, "");
  if (!ip) return "";
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  const ipv4Match = ip.match(/(?:\d{1,3}\.){3}\d{1,3}$/);
  if (ipv4Match) ip = ipv4Match[0];
  if (isPrivateWeatherIp(ip)) return "";
  return ip;
}

function isPrivateWeatherIp(ip = "") {
  const value = String(ip || "").trim().toLowerCase();
  if (!value || value === "localhost" || value === "::1") return true;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    const parts = value.split(".").map(Number);
    if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    const [a, b, c] = parts;
    return a === 0
      || a === 10
      || a === 127
      || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 192 && b === 0 && (c === 0 || c === 2))
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113);
  }
  if (value.includes(":")) {
    return value.startsWith("fc")
      || value.startsWith("fd")
      || value.startsWith("fe80:")
      || value === "::"
      || value.startsWith("2001:db8:");
  }
  return true;
}

async function fetchWeatherIpLocation(rawIp = "") {
  const ip = normalizePublicIp(rawIp);
  if (!ip) return null;
  const cacheKey = `weather:ipgeo:v1:${privacyHash(ip).slice(0, 24)}`;
  const cached = await cacheGet(cacheKey);
  if (cached?.latitude && cached?.longitude) return cached;
  const params = new URLSearchParams({
    lang: "zh-CN",
    fields: "status,message,country,regionName,city,lat,lon,query"
  });
  const payload = await fetchJsonWithTimeout(`http://ip-api.com/json/${encodeURIComponent(ip)}?${params.toString()}`, weatherFetchTimeoutMs);
  if (payload?.status !== "success") throw new Error(payload?.message || "ip geolocation unavailable");
  const latitude = Number(payload.lat);
  const longitude = Number(payload.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("ip geolocation coordinates invalid");
  const city = cleanText(payload.city || payload.regionName || payload.country || "当前位置", 80);
  const location = {
    name: city,
    city,
    admin1: cleanText(payload.regionName || "", 80),
    country: cleanText(payload.country || "", 80),
    latitude,
    longitude
  };
  await cacheSet(cacheKey, location, 24 * 60 * 60);
  return location;
}

function weatherLocationName(location = {}) {
  return cleanText(location.city || location.name || location.admin1 || location.country || "当前位置", 80);
}

const siteDefaultWeatherCity = "北京";
const chinaWeatherTimeZones = new Set(["Asia/Shanghai", "Asia/Chongqing", "Asia/Urumqi", "Asia/Harbin"]);

function isChinaWeatherTimeZone(value = "") {
  return chinaWeatherTimeZones.has(String(value || "").trim());
}

function isChinaWeatherLocation(location = {}) {
  const country = String(location.country || "").trim().toLowerCase();
  return country === "中国" || country === "china" || country === "cn" || country.includes("中国");
}

function shouldIgnoreWeatherIpLocation(location = {}, browserTimeZone = "") {
  return Boolean(location?.latitude && location?.longitude && isChinaWeatherTimeZone(browserTimeZone) && !isChinaWeatherLocation(location));
}

function fallbackWeatherCurrent(error = null) {
  const hasError = Boolean(error);
  return {
    error: hasError ? "weather_unavailable" : "weather_pending",
    location: {
      name: "当前位置",
      city: "当前位置",
      admin1: "",
      country: "",
      latitude: null,
      longitude: null
    },
    current: {
      temperature: null,
      apparentTemperature: null,
      weatherText: hasError ? "天气暂时同步失败" : "天气同步中",
      weatherCode: null,
      windSpeed: null,
      humidity: null,
      isDay: true
    },
    daily: {
      max: null,
      min: null,
      precipitationProbability: null
    },
    updatedAt: new Date().toISOString(),
    source: "weather-fallback"
  };
}

async function fetchJsonWithTimeout(url, timeoutMs = weatherFetchTimeoutMs, headers = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...headers
    },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`fetch failed ${response.status}`);
  return response.json();
}

function rejectAfter(ms = 2000, message = "timeout") {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), Math.max(200, Number(ms) || 2000));
  });
}

async function searchWeatherCity(city) {
  const keyword = cleanText(city, 80);
  if (!keyword) throw new Error("weather city required");
  const cacheKey = `weather:geocode:${keyword.toLowerCase()}`;
  const cached = await cacheGet(cacheKey);
  if (cached?.latitude && cached?.longitude) return cached;
  const localLocation = findLocalWeatherCity(keyword);
  if (localLocation) {
    await cacheSet(cacheKey, localLocation, 24 * 60 * 60);
    return localLocation;
  }
  let result = null;
  try {
    const params = new URLSearchParams({
      name: keyword,
      count: "1",
      language: "zh",
      format: "json"
    });
    const payload = await fetchJsonWithTimeout(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`);
    result = Array.isArray(payload?.results) ? payload.results[0] : null;
  } catch (error) {
    const fallback = findLocalWeatherCity(keyword);
    if (fallback) {
      await cacheSet(cacheKey, fallback, 24 * 60 * 60);
      return fallback;
    }
    throw error;
  }
  if (!result) throw new Error("weather city not found");
  const location = findLocalWeatherCity(result.name || keyword) || {
    name: cleanText(result.name || keyword, 80),
    city: cleanText(result.name || keyword, 80),
    admin1: cleanText(result.admin1 || "", 80),
    country: cleanText(result.country || "", 80),
    latitude: Number(result.latitude),
    longitude: Number(result.longitude)
  };
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) throw new Error("weather city coordinates invalid");
  await cacheSet(cacheKey, location, 24 * 60 * 60);
  return location;
}

async function reverseWeatherLocation(lat, lon) {
  const latKey = roundWeatherCoord(lat);
  const lonKey = roundWeatherCoord(lon);
  if (!latKey || !lonKey) throw new Error("weather coordinates invalid");
  const cacheKey = `weather:reverse:${latKey},${lonKey}`;
  const cached = await cacheGet(cacheKey);
  if (cached?.name || cached?.city) return cached;
  const params = new URLSearchParams({
    format: "jsonv2",
    lat: String(lat),
    lon: String(lon),
    "accept-language": "zh-CN"
  });
  const payload = await fetchJsonWithTimeout(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, weatherFetchTimeoutMs, {
    "User-Agent": "JlemonzBlog/1.0 (weather widget)",
    Referer: "https://jlemonz.com/"
  });
  const address = payload?.address || {};
  const city = cleanText(
    address.city || address.town || address.municipality || address.county || address.state_district || address.state || address.region || "",
    80
  );
  const nearby = city ? null : nearestWeatherLocation(lat, lon);
  const location = nearby || {
    name: city || "当前位置",
    city: city || "当前位置",
    admin1: cleanText(address.state || address.province || address.region || "", 80),
    country: cleanText(address.country || "", 80),
    latitude: Number(lat),
    longitude: Number(lon)
  };
  await cacheSet(cacheKey, location, 7 * 24 * 60 * 60);
  return location;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function fetchOpenMeteoWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: "1"
  });
  const payload = await fetchJsonWithTimeout(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  const current = payload?.current || {};
  const daily = payload?.daily || {};
  const code = numberOrNull(current.weather_code);
  return {
    current: {
      temperature: numberOrNull(current.temperature_2m),
      apparentTemperature: numberOrNull(current.apparent_temperature),
      weatherText: weatherCodeText(code),
      weatherCode: code,
      windSpeed: numberOrNull(current.wind_speed_10m),
      humidity: numberOrNull(current.relative_humidity_2m),
      isDay: current.is_day === 0 ? false : true
    },
    daily: {
      max: numberOrNull(Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[0] : null),
      min: numberOrNull(Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[0] : null),
      precipitationProbability: numberOrNull(Array.isArray(daily.precipitation_probability_max) ? daily.precipitation_probability_max[0] : null)
    }
  };
}

function weatherPayload(location, weather, source) {
  const normalizedLocation = {
    name: weatherLocationName(location),
    city: weatherLocationName(location),
    admin1: cleanText(location.admin1 || "", 80),
    country: cleanText(location.country || "", 80),
    latitude: numberOrNull(location.latitude),
    longitude: numberOrNull(location.longitude)
  };
  return {
    location: normalizedLocation,
    current: weather.current,
    daily: weather.daily,
    updatedAt: new Date().toISOString(),
    source
  };
}

async function cachedWeatherPayload(cacheKey, loader) {
  const currentKey = `weather:v2:current:${cacheKey}`;
  const lastKey = `weather:v2:last:${cacheKey}`;
  const cached = await cacheGet(currentKey);
  if (cached?.current && cached?.location) return cached;
  try {
    const payload = await loader();
    await cacheSet(currentKey, payload, 10 * 60);
    await cacheSet(lastKey, payload, 7 * 24 * 60 * 60);
    return payload;
  } catch (error) {
    const stale = await cacheGet(lastKey);
    if (stale?.current && stale?.location) return { ...stale, stale: true };
    throw error;
  }
}

async function publicWeatherCurrent(req, url) {
  const city = cleanText(url.searchParams.get("city") || "", 80);
  const browserTimeZone = cleanText(url.searchParams.get("tz") || url.searchParams.get("timezone") || "", 80);
  const allowIpEstimate = ["1", "true", "yes"].includes(String(url.searchParams.get("ip") || "").trim().toLowerCase());
  const latRaw = url.searchParams.get("lat");
  const lonRaw = url.searchParams.get("lon");
  const lat = latRaw === null || latRaw === "" ? NaN : Number(latRaw);
  const lon = lonRaw === null || lonRaw === "" ? NaN : Number(lonRaw);
  if (city) {
    return cachedWeatherPayload(`city:${city.toLowerCase()}`, async () => {
      const location = await searchWeatherCity(city);
      const weather = await fetchOpenMeteoWeather(location.latitude, location.longitude);
      return weatherPayload(location, weather, "open-meteo-city");
    });
  }
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    const latKey = roundWeatherCoord(lat);
    const lonKey = roundWeatherCoord(lon);
    return cachedWeatherPayload(`coord:${latKey},${lonKey}`, async () => {
      const [weather, location] = await Promise.all([
        fetchOpenMeteoWeather(lat, lon),
        reverseWeatherLocation(lat, lon).catch(() => nearestWeatherLocation(lat, lon) || ({ name: "当前位置", city: "当前位置", latitude: lat, longitude: lon }))
      ]);
      return weatherPayload(location, weather, "open-meteo-geo");
    });
  }
  const visitorIp = allowIpEstimate ? normalizePublicIp(requestIp(req)) : "";
  if (visitorIp) {
    const ipCacheKey = `ip:${privacyHash(visitorIp).slice(0, 24)}`;
    const cached = await cacheGet(`weather:v2:current:${ipCacheKey}`).catch(() => null);
    if (cached?.current && cached?.location && !shouldIgnoreWeatherIpLocation(cached.location, browserTimeZone)) return cached;
    const stale = await cacheGet(`weather:v2:last:${ipCacheKey}`).catch(() => null);
    if (stale?.current && stale?.location && !shouldIgnoreWeatherIpLocation(stale.location, browserTimeZone)) return { ...stale, stale: true };
    const ipWeatherPromise = cachedWeatherPayload(ipCacheKey, async () => {
        const location = await fetchWeatherIpLocation(visitorIp);
        if (!location) throw new Error("visitor ip location unavailable");
        if (shouldIgnoreWeatherIpLocation(location, browserTimeZone)) throw new Error("visitor ip location mismatches browser timezone");
        const weather = await fetchOpenMeteoWeather(location.latitude, location.longitude);
        return weatherPayload(location, weather, "ip-api-open-meteo");
    });
    ipWeatherPromise.catch((error) => console.warn("weather ip location background refresh failed", error.message || error));
    try {
      return await Promise.race([ipWeatherPromise, rejectAfter(5200, "weather_ip_timeout")]);
    } catch {}
  }
  const defaultCacheKey = `city:${siteDefaultWeatherCity}`;
  const defaultCurrent = await cacheGet(`weather:v2:current:${defaultCacheKey}`).catch(() => null);
  if (defaultCurrent?.current && defaultCurrent?.location) return defaultCurrent;
  const defaultStale = await cacheGet(`weather:v2:last:${defaultCacheKey}`).catch(() => null);
  const defaultWeatherPromise = cachedWeatherPayload(defaultCacheKey, async () => {
    const location = await searchWeatherCity(siteDefaultWeatherCity);
    const weather = await fetchOpenMeteoWeather(location.latitude, location.longitude);
    return weatherPayload(location, weather, "open-meteo-site-default-city");
  });
  defaultWeatherPromise.catch((error) => console.warn("weather default refresh failed", error.message || error));
  try {
    return await Promise.race([defaultWeatherPromise, rejectAfter(3500, "weather_default_timeout")]);
  } catch {}
  if (defaultStale?.current && defaultStale?.location) return { ...defaultStale, stale: true };
  return fallbackWeatherCurrent();
}

function parseContributionCells(htmlText) {
  const days = [];
  const tooltipByCellId = new Map();
  const tooltipPattern = /<tool-tip\b(?=[^>]*\bfor="([^"]+)")[^>]*>([\s\S]*?)<\/tool-tip>/g;
  let tooltipMatch;
  while ((tooltipMatch = tooltipPattern.exec(htmlText))) {
    const text = String(tooltipMatch[2] || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    tooltipByCellId.set(tooltipMatch[1], text);
  }

  const cellPattern = /<td\b(?=[^>]*\bdata-date="([^"]+)")(?=[^>]*\bid="([^"]+)")[^>]*>/g;
  let match;
  while ((match = cellPattern.exec(htmlText))) {
    const cell = match[0];
    const countMatch = cell.match(/data-count="(\d+)"/);
    const levelMatch = cell.match(/data-level="(\d+)"/);
    const tooltipText = tooltipByCellId.get(match[2]) || "";
    const tooltipCount = tooltipText.match(/([\d,]+)\s+contributions?/i);
    const count = countMatch ? Number(countMatch[1]) : (tooltipCount ? Number(tooltipCount[1].replace(/,/g, "")) : 0);
    days.push({
      date: match[1],
      count,
      level: levelMatch ? Number(levelMatch[1]) : levelFromCount(count)
    });
  }
  return days;
}

function githubDateRange() {
  const toDate = new Date();
  toDate.setHours(0, 0, 0, 0);
  const fromDate = new Date(toDate);
  fromDate.setDate(fromDate.getDate() - 364);
  return {
    from: fromDate.toISOString().slice(0, 10),
    to: toDate.toISOString().slice(0, 10),
    fromIso: `${fromDate.toISOString().slice(0, 10)}T00:00:00Z`,
    toIso: `${toDate.toISOString().slice(0, 10)}T23:59:59Z`
  };
}

function normalizeGithubLogin(username) {
  return cleanText(username || config.github.username || "Jlemonz", 40).replace(/[^a-zA-Z0-9-]/g, "") || "Jlemonz";
}

function normalizeGithubPayload(payload, username) {
  const range = githubDateRange();
  const byDate = new Map();
  for (const day of Array.isArray(payload?.days) ? payload.days : []) {
    const date = String(day.date || "").slice(0, 10);
    if (date >= range.from && date <= range.to) {
      byDate.set(date, {
        date,
        count: Number(day.count) || 0,
        level: Math.max(0, Math.min(4, Number(day.level) || 0)),
        color: day.color || ""
      });
    }
  }
  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return {
    username,
    total: typeof payload?.total === "number" ? payload.total : days.reduce((sum, day) => sum + day.count, 0),
    days,
    source: payload?.source || "unknown",
    range: { from: range.from, to: range.to },
    fetchedAt: new Date().toISOString()
  };
}

function requireCompleteGithubPayload(payload) {
  if (!Array.isArray(payload?.days) || payload.days.length < 300) {
    throw new Error("github contributions snapshot incomplete");
  }
  return payload;
}

function githubSnapshotKey(username) {
  return `github_snapshot:${normalizeGithubLogin(username).toLowerCase()}`;
}

async function getGithubSnapshot(username) {
  const raw = await getSetting(githubSnapshotKey(username), "");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.days) || !parsed.days.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function setGithubSnapshot(username, payload) {
  const normalized = requireCompleteGithubPayload(normalizeGithubPayload(payload, normalizeGithubLogin(username)));
  await setSetting(githubSnapshotKey(username), JSON.stringify(normalized));
  await cacheSet(`github:contrib:${normalized.username}`, normalized, githubSnapshotCacheSeconds());
  return normalized;
}

function githubSnapshotCacheSeconds() {
  return Math.ceil(msUntilNextChinaMidnight() / 1000) + 3600;
}

async function githubContributionsFromPublicYear(username, year) {
  const url = `https://github.com/users/${encodeURIComponent(username)}/contributions?from=${year}-01-01&to=${year}-12-31`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "JlemonzBlog/1.0",
      Accept: "text/html"
    },
    signal: AbortSignal.timeout(githubFetchTimeoutMs)
  });
  if (!response.ok) throw new Error("github public contributions failed");
  const text = await response.text();
  const days = parseContributionCells(text);
  if (!days.length) throw new Error("github contribution cells missing");
  return days;
}

async function githubContributionsFromPublicPage(username) {
  const { from, to } = githubDateRange();
  const years = [...new Set([from.slice(0, 4), to.slice(0, 4)])];
  const chunks = await Promise.all(years.map((year) => githubContributionsFromPublicYear(username, year)));
  const byDate = new Map();
  for (const day of chunks.flat()) {
    if (day.date >= from && day.date <= to) byDate.set(day.date, day);
  }
  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (days.length < 300) throw new Error("github public contributions incomplete");
  return {
    username,
    total: days.reduce((sum, day) => sum + day.count, 0),
    days,
    source: "github-public"
  };
}

async function githubContributionsFromProxy(username) {
  const response = await fetch(`https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(username)}?y=last`, {
    headers: {
      "User-Agent": "JlemonzBlog/1.0",
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(githubFetchTimeoutMs)
  });
  if (!response.ok) throw new Error("github contributions proxy failed");
  const data = await response.json();
  const days = Array.isArray(data.contributions) ? data.contributions.map((day) => ({
    date: day.date,
    count: Number(day.count) || 0,
    level: Number(day.level) || 0
  })) : [];
  if (!days.length) throw new Error("github proxy days missing");
  const total = typeof data.total?.lastYear === "number"
    ? data.total.lastYear
    : days.reduce((sum, day) => sum + day.count, 0);
  return { username, total, days, source: "github-contributions-api" };
}

async function githubContributionsFromGraphql(username) {
  const { fromIso, toIso } = githubDateRange();
  const queryText = `query($login:String!,$from:DateTime!,$to:DateTime!){
    user(login:$login){
      contributionsCollection(from:$from,to:$to){
        contributionCalendar{
          totalContributions
          weeks{ contributionDays{ date contributionCount color } }
        }
      }
    }
  }`;
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "User-Agent": "JlemonzBlog/1.0",
      Authorization: `Bearer ${config.github.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: queryText, variables: { login: username, from: fromIso, to: toIso } }),
    signal: AbortSignal.timeout(githubFetchTimeoutMs)
  });
  if (!response.ok) throw new Error("github graphql failed");
  const data = await response.json();
  const calendar = data?.data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendar) throw new Error("github calendar missing");
  const days = calendar.weeks.flatMap((week) => week.contributionDays.map((day) => ({
    date: day.date,
    count: day.contributionCount,
    level: levelFromCount(day.contributionCount),
    color: day.color
  })));
  return { username, total: calendar.totalContributions, days, source: "github-graphql" };
}

async function fetchGithubContributionsFresh(username) {
  const login = normalizeGithubLogin(username);
  if (!login) return { username: "", total: 0, days: [], source: "empty" };
  let data;
  if (config.github.token) {
    data = await githubContributionsFromGraphql(login);
  } else {
    try {
      data = await githubContributionsFromProxy(login);
    } catch {
      data = await githubContributionsFromPublicPage(login);
    }
  }
  return requireCompleteGithubPayload(normalizeGithubPayload(data, login));
}

let githubRefreshPromise = null;

async function refreshGithubContributionsSnapshot(username) {
  const login = normalizeGithubLogin(username);
  githubRefreshPromise ||= (async () => {
    const fresh = await fetchGithubContributionsFresh(login);
    return setGithubSnapshot(login, fresh);
  })().finally(() => {
    githubRefreshPromise = null;
  });
  return githubRefreshPromise;
}

function isGithubSnapshotStale(snapshot) {
  const fetchedAt = Date.parse(snapshot?.fetchedAt || "");
  return !Number.isFinite(fetchedAt) || chinaDateKey(new Date(fetchedAt)) !== chinaDateKey();
}

async function fetchGithubContributions(username) {
  const login = normalizeGithubLogin(username || await getSetting("github_username", config.github.username));
  const cacheKey = `github:contrib:${login}`;
  const cached = await cacheGet(cacheKey);
  if (cached?.days?.length) return cached;

  const snapshot = await getGithubSnapshot(login);
  if (snapshot?.days?.length) {
    await cacheSet(cacheKey, snapshot, githubSnapshotCacheSeconds());
    if (isGithubSnapshotStale(snapshot)) {
      refreshGithubContributionsSnapshot(login).catch((error) => console.warn("github background refresh failed", error));
    }
    return snapshot;
  }

  return refreshGithubContributionsSnapshot(login);
}

function startGithubContributionsRefresher() {
  let timer = null;
  const run = async () => {
    try {
      const username = await getSetting("github_username", config.github.username);
      await refreshGithubContributionsSnapshot(username);
    } catch (error) {
      console.warn("github scheduled refresh failed", error);
    } finally {
      scheduleNext();
    }
  };

  const scheduleNext = () => {
    clearTimeout(timer);
    timer = setTimeout(run, msUntilNextChinaMidnight());
  };

  setTimeout(run, 5000);
  scheduleNext();
}

function normalizeGithubRepository(repo = {}, username = "") {
  const owner = normalizeGithubLogin(repo.owner?.login || username);
  const name = cleanText(repo.name || "", 160).replace(/[^\w.-]/g, "");
  const fullName = cleanText(repo.full_name || `${owner}/${name}`, 240).replace(/[^\w./-]/g, "");
  return {
    github_id: Number(repo.id || 0) || null,
    owner,
    name,
    full_name: fullName,
    description: cleanText(repo.description || "", 1000),
    html_url: cleanText(repo.html_url || `https://github.com/${fullName}`, 500),
    language: cleanText(repo.language || "", 80),
    stargazers_count: clampNumber(repo.stargazers_count, 0, 9999999, 0),
    forks_count: clampNumber(repo.forks_count, 0, 9999999, 0),
    open_issues_count: clampNumber(repo.open_issues_count, 0, 9999999, 0),
    topics_json: JSON.stringify(Array.isArray(repo.topics) ? repo.topics.slice(0, 20).map((topic) => cleanKey(topic, "")).filter(Boolean) : []),
    archived: repo.archived ? 1 : 0,
    fork: repo.fork ? 1 : 0,
    pushed_at: repo.pushed_at ? formatDateTime(repo.pushed_at) : null
  };
}

function publicGithubRepository(row = {}) {
  return {
    ...row,
    topics: parseJsonArray(row.topics_json, []),
    topics_json: undefined,
    archived: Boolean(row.archived),
    fork: Boolean(row.fork)
  };
}

async function fetchGithubRepositoriesFresh(username) {
  const login = normalizeGithubLogin(username);
  const headers = {
    "User-Agent": "JlemonzBlog/1.0",
    Accept: "application/vnd.github+json"
  };
  if (config.github.token) headers.Authorization = `Bearer ${config.github.token}`;
  const response = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}/repos?type=owner&sort=pushed&per_page=100`, {
    headers,
    signal: AbortSignal.timeout(githubFetchTimeoutMs)
  });
  if (!response.ok) throw new Error(`github repositories failed: ${response.status}`);
  const repos = await response.json();
  if (!Array.isArray(repos)) throw new Error("github repositories response invalid");
  return repos.map((repo) => normalizeGithubRepository(repo, login)).filter((repo) => repo.owner && repo.name && repo.full_name);
}

async function recordGithubSyncJob(status, username, repoCount = 0, message = "", user = null, startedAt = new Date()) {
  if (!databaseAvailable) return null;
  const result = await query(`INSERT INTO github_sync_jobs(status, username, repo_count, message, created_by, started_at, finished_at, created_at)
    VALUES(:status, :username, :repo_count, :message, :created_by, :started_at,
      CASE WHEN :status IN ('success','failed') THEN NOW() ELSE NULL END,
      NOW())`, {
    status: cleanStatus(status, ["running", "success", "failed"], "running"),
    username: normalizeGithubLogin(username),
    repo_count: clampNumber(repoCount, 0, 10000, 0),
    message: cleanText(message, 500),
    created_by: Number(user?.id) > 0 ? user.id : null,
    started_at: formatDateTime(startedAt)
  });
  return getOne("SELECT * FROM github_sync_jobs WHERE id=:id", { id: result.insertId });
}

async function updateGithubSyncJob(id, status, repoCount = 0, message = "") {
  if (!databaseAvailable || !(Number(id) > 0)) return null;
  await query(`UPDATE github_sync_jobs
    SET status=:status, repo_count=:repo_count, message=:message, finished_at=NOW()
    WHERE id=:id`, {
    id,
    status: cleanStatus(status, ["success", "failed"], "failed"),
    repo_count: clampNumber(repoCount, 0, 10000, 0),
    message: cleanText(message, 500)
  });
  return getOne("SELECT * FROM github_sync_jobs WHERE id=:id", { id });
}

async function syncGithubRepositories(req = null, user = null, username = "") {
  if (!databaseAvailable) return { error: "database_unavailable", message: "数据库不可用，无法同步 GitHub 仓库。" };
  const login = normalizeGithubLogin(username || await getSetting("github_username", config.github.username || "Jlemonz"));
  const startedAt = new Date();
  const job = await recordGithubSyncJob("running", login, 0, "正在同步 GitHub 仓库", user, startedAt);
  try {
    const repos = await fetchGithubRepositoriesFresh(login);
    for (const repo of repos) {
      await query(`INSERT INTO github_repositories
          (github_id, owner, name, full_name, description, html_url, language, stargazers_count, forks_count,
           open_issues_count, topics_json, archived, fork, pushed_at, synced_at, created_at, updated_at)
        VALUES(:github_id, :owner, :name, :full_name, :description, :html_url, :language, :stargazers_count, :forks_count,
          :open_issues_count, :topics_json, :archived, :fork, :pushed_at, NOW(), NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          github_id=:github_id, description=:description, html_url=:html_url, language=:language,
          stargazers_count=:stargazers_count, forks_count=:forks_count, open_issues_count=:open_issues_count,
          topics_json=:topics_json, archived=:archived, fork=:fork, pushed_at=:pushed_at, synced_at=NOW(), updated_at=NOW()`, repo);
    }
    const done = await updateGithubSyncJob(job?.id, "success", repos.length, `已同步 ${repos.length} 个仓库`);
    await cacheDel([`github:repos:${login}`, `github:repos:${login.toLowerCase()}`]);
    if (req) await writeAuditLog(req, user, "sync-github-repos", "github-repositories", login, null, { count: repos.length, job: done?.id });
    return { ok: true, username: login, count: repos.length, job: done, items: repos.slice(0, 12) };
  } catch (error) {
    const failed = await updateGithubSyncJob(job?.id, "failed", 0, error.message || "GitHub 仓库同步失败");
    if (req) await writeAuditLog(req, user, "sync-github-repos-failed", "github-repositories", login, null, { error: error.message || String(error), job: failed?.id });
    return { error: "github_sync_failed", message: error.message || "GitHub 仓库同步失败", job: failed };
  }
}

async function listGithubRepositories(username = "", limit = 12) {
  const login = normalizeGithubLogin(username || await getSetting("github_username", config.github.username || "Jlemonz"));
  if (!databaseAvailable) return { username: login, items: [], jobs: [], source: "local-preview" };
  const cacheKey = `github:repos:${login}`;
  const cached = await cacheGet(cacheKey);
  if (cached?.items) return cached;
  const items = await query(`SELECT *
    FROM github_repositories
    WHERE owner=:owner AND archived=0 AND fork=0
    ORDER BY pushed_at DESC, stargazers_count DESC, id DESC
    LIMIT :limit`, { owner: login, limit: Math.min(100, Math.max(1, Number(limit) || 12)) });
  const jobs = await query(`SELECT * FROM github_sync_jobs WHERE username=:username ORDER BY created_at DESC, id DESC LIMIT 8`, { username: login });
  const payload = { username: login, items: items.map(publicGithubRepository), jobs };
  await cacheSet(cacheKey, payload, 600);
  return payload;
}

function publicGithubTrendingRepository(repo = {}) {
  return {
    name: repo.name || "",
    full_name: repo.full_name || "",
    description: cleanText(repo.description || "", 240),
    html_url: cleanText(repo.html_url || "", 500),
    language: repo.language || "",
    stargazers_count: clampNumber(repo.stargazers_count, 0, 99999999, 0),
    forks_count: clampNumber(repo.forks_count, 0, 99999999, 0),
    updated_at: repo.updated_at || repo.pushed_at || "",
    pushed_at: repo.pushed_at || "",
    topics: Array.isArray(repo.topics) ? repo.topics.slice(0, 6).map((topic) => cleanKey(topic, "")).filter(Boolean) : []
  };
}

async function fetchGithubTrendingRepositories(limit = 5) {
  const safeLimit = Math.min(8, Math.max(1, Number(limit) || 5));
  const cacheKey = `github:trending:robotics:${safeLimit}`;
  const cached = await cacheGet(cacheKey);
  if (cached?.items) return cached;
  const headers = {
    "User-Agent": "JlemonzBlog/1.0",
    Accept: "application/vnd.github+json"
  };
  if (config.github.token) headers.Authorization = `Bearer ${config.github.token}`;
  const params = new URLSearchParams({
    q: "topic:robotics stars:>100",
    sort: "stars",
    order: "desc",
    per_page: String(safeLimit)
  });
  const response = await fetch(`https://api.github.com/search/repositories?${params.toString()}`, {
    headers,
    signal: AbortSignal.timeout(githubFetchTimeoutMs)
  });
  if (!response.ok) throw new Error(`github trending failed: ${response.status}`);
  const data = await response.json();
  const payload = {
    topic: "robotics",
    updatedAt: new Date().toISOString(),
    items: Array.isArray(data.items) ? data.items.map(publicGithubTrendingRepository) : []
  };
  await cacheSet(cacheKey, payload, 6 * 60 * 60);
  return payload;
}

function plainTextFromHtml(value, maxLength = 220) {
  return cleanText(String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'"), maxLength);
}

function animeRecommendationFallback(error = null) {
  return {
    items: [
      {
        id: "fallback:frieren",
        title: "葬送的芙莉莲",
        nativeTitle: "葬送のフリーレン",
        summary: "适合慢慢看的冒险番：节奏干净、情绪稳定，适合当作今天的轻量补能。",
        cover: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx154587-gHSraOSa0nBG.jpg",
        url: "https://anilist.co/anime/154587",
        score: 90,
        tags: ["冒险", "奇幻"],
        meta: "90 分 · 每日兜底推荐"
      }
    ],
    updatedAt: new Date().toISOString(),
    source: "fallback",
    error: error ? "anime_recommendations_unavailable" : undefined
  };
}

const animeGenreZhMap = new Map(Object.entries({
  Action: "动作",
  Adventure: "冒险",
  Comedy: "喜剧",
  Drama: "剧情",
  Ecchi: "轻喜",
  Fantasy: "奇幻",
  Horror: "恐怖",
  Mahou: "魔法",
  "Mahou Shoujo": "魔法少女",
  Mecha: "机甲",
  Music: "音乐",
  Mystery: "悬疑",
  Psychological: "心理",
  Romance: "恋爱",
  "Sci-Fi": "科幻",
  "Slice of Life": "日常",
  Sports: "运动",
  Supernatural: "超自然",
  Thriller: "惊悚"
}));

const animeTitleZhOverrides = new Map(Object.entries({
  "葬送のフリーレン": "葬送的芙莉莲",
  "Sousou no Frieren": "葬送的芙莉莲",
  "Frieren: Beyond Journey's End": "葬送的芙莉莲",
  "ONE PIECE": "海贼王",
  "One Piece": "海贼王",
  "名探偵コナン": "名侦探柯南",
  "Detective Conan": "名侦探柯南",
  "僕のヒーローアカデミア": "我的英雄学院",
  "My Hero Academia": "我的英雄学院",
  "呪術廻戦": "咒术回战",
  "Jujutsu Kaisen": "咒术回战",
  "鬼滅の刃": "鬼灭之刃",
  "Demon Slayer: Kimetsu no Yaiba": "鬼灭之刃",
  "進撃の巨人": "进击的巨人",
  "Attack on Titan": "进击的巨人",
  "SPY×FAMILY": "间谍过家家",
  "SPY x FAMILY": "间谍过家家",
  "チェンソーマン": "链锯人",
  "Chainsaw Man": "链锯人",
  "薬屋のひとりごと": "药屋少女的呢喃",
  "The Apothecary Diaries": "药屋少女的呢喃",
  "ダンダダン": "胆大党",
  "DAN DA DAN": "胆大党",
  "推しの子": "我推的孩子",
  "Oshi no Ko": "我推的孩子"
}));

function animeGenreZh(value = "") {
  const text = cleanText(value, 40);
  return animeGenreZhMap.get(text) || text;
}

function pickAnimeChineseTitle(item = {}) {
  const candidates = [item.title, item.englishTitle, item.nativeTitle, item.romajiTitle].filter(Boolean).map((value) => cleanText(value, 140));
  for (const value of candidates) {
    if (animeTitleZhOverrides.has(value)) return animeTitleZhOverrides.get(value);
  }
  const alreadyChinese = candidates.find((value) => /[\u4e00-\u9fff]/.test(value));
  return alreadyChinese || candidates[0] || "今日动画推荐";
}

function animeChineseSummary(item = {}) {
  const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean).slice(0, 2) : [];
  const score = clampNumber(item.score, 0, 100, 0);
  const scoreText = score ? `评分 ${score}` : "口碑稳定";
  const tagText = tags.length ? `偏${tags.join(" / ")}` : "适合轻量补番";
  return cleanText(`今日趋势推荐，${tagText}，${scoreText}，适合当作今天的放松入口。`, 120);
}

function normalizeAnimeRecommendationChinese(item = {}) {
  const tags = Array.isArray(item.tags) ? item.tags.map(animeGenreZh).filter(Boolean).slice(0, 3) : [];
  const score = clampNumber(item.score, 0, 100, 0);
  const episodes = clampNumber(item.episodes, 0, 999, 0);
  const year = clampNumber(item.seasonYear, 0, 9999, 0);
  const normalized = {
    ...item,
    title: pickAnimeChineseTitle(item),
    tags,
    summary: cleanText(item.summary || "", 120),
    meta: [score ? `${score} 分` : "", episodes ? `${episodes} 集` : "", year || ""].filter(Boolean).join(" · ")
  };
  normalized.summary = normalized.summary && /[\u4e00-\u9fff]/.test(normalized.summary)
    ? normalized.summary
    : animeChineseSummary(normalized);
  return normalized;
}

async function localizeAnimeRecommendationsWithLlm(items = []) {
  const rows = items.map((item, index) => ({
    index,
    title: item.title || "",
    englishTitle: item.englishTitle || "",
    nativeTitle: item.nativeTitle || "",
    romajiTitle: item.romajiTitle || "",
    genres: item.tags || [],
    score: item.score || 0,
    episodes: item.episodes || 0,
    year: item.seasonYear || ""
  }));
  if (!rows.length) return items;
  try {
    const result = await callInterviewLlm([
      { role: "system", content: "你是动漫推荐文案翻译器。只输出合法 JSON，不要 Markdown，不要解释。" },
      {
        role: "user",
        content: `把下面 AniList 动漫推荐翻译成简体中文。要求：
1. title 使用常见中文译名；如果没有通用中文译名，就自然翻译成中文，不要保留日文或罗马音。
2. tags 全部翻译成中文短词，例如 Action=动作、Adventure=冒险、Romance=恋爱、Supernatural=超自然。
3. summary 用中文写 45 字以内，语气稳一点，不要轻浮，不要出现英文类型词。
4. 只输出 {"items":[{"index":0,"title":"...","summary":"...","tags":["..."]}]}。

原始数据：
${JSON.stringify(rows)}`
      }
    ], process.env.ANIME_TRANSLATE_LLM_PROVIDER || process.env.PROJECT_SUMMARY_LLM_PROVIDER || "");
    const parsed = parseInterviewModelJson(result.content);
    const translated = Array.isArray(parsed.items) ? parsed.items : [];
    const byIndex = new Map(translated.map((item) => [Number(item.index), item]));
    return items.map((item, index) => {
      const hit = byIndex.get(index) || {};
      const normalized = normalizeAnimeRecommendationChinese(item);
      const title = cleanText(hit.title || "", 140);
      const summary = cleanText(hit.summary || "", 120);
      const tags = Array.isArray(hit.tags) ? hit.tags.map((tag) => cleanText(tag, 40)).filter(Boolean).slice(0, 3) : [];
      return {
        ...normalized,
        title: title || normalized.title,
        summary: summary || normalized.summary,
        tags: tags.length ? tags : normalized.tags
      };
    });
  } catch (error) {
    console.warn("anime recommendation translation failed", error?.message || error);
    return items.map(normalizeAnimeRecommendationChinese);
  }
}

function anilistMediaToRecommendation(media = {}) {
  const title = media.title || {};
  const genres = Array.isArray(media.genres) ? media.genres.slice(0, 3).filter(Boolean).map(animeGenreZh) : [];
  const score = clampNumber(media.averageScore, 0, 100, 0);
  const episodes = clampNumber(media.episodes, 0, 999, 0);
  const seasonYear = clampNumber(media.seasonYear, 0, 9999, 0);
  const item = {
    id: `anilist:${media.id || title.romaji || title.native || ""}`,
    title: cleanText(title.english || title.native || title.romaji || "今日动画推荐", 120),
    englishTitle: cleanText(title.english || "", 140),
    nativeTitle: cleanText(title.native || "", 140),
    romajiTitle: cleanText(title.romaji || "", 140),
    summary: "",
    cover: cleanText(media.coverImage?.large || "", 500),
    accent: cleanText(media.coverImage?.color || "", 24),
    url: cleanText(media.siteUrl || "", 500),
    score,
    episodes,
    seasonYear,
    tags: genres,
    meta: [score ? `${score} 分` : "", episodes ? `${episodes} 集` : "", seasonYear || ""].filter(Boolean).join(" · ")
  };
  return normalizeAnimeRecommendationChinese(item);
}

async function fetchAnimeDailyRecommendations(limit = 2) {
  const safeLimit = Math.min(4, Math.max(1, Number(limit) || 2));
  const dayKey = chinaDateKey();
  const cacheKey = `anime:daily:v3:zh:${dayKey}:${safeLimit}`;
  const lastKey = `anime:daily:last:v3:zh:${safeLimit}`;
  const cached = await cacheGet(cacheKey);
  if (cached?.items) return cached;
  try {
    const daySeed = Number(dayKey.replace(/-/g, "")) || 1;
    const page = (daySeed % 4) + 1;
    const queryText = `query($page:Int,$perPage:Int){
      Page(page:$page,perPage:$perPage){
        media(type:ANIME,sort:TRENDING_DESC,isAdult:false){
          id
          title{romaji english native}
          description(asHtml:false)
          siteUrl
          coverImage{large color}
          episodes
          averageScore
          genres
          seasonYear
        }
      }
    }`;
    const response = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "User-Agent": "JlemonzBlog/1.0",
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query: queryText, variables: { page, perPage: Math.max(8, safeLimit * 4) } }),
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error(`anilist failed: ${response.status}`);
    const payload = await response.json();
    const media = Array.isArray(payload?.data?.Page?.media) ? payload.data.Page.media : [];
    const offset = daySeed % Math.max(1, media.length);
    const rawItems = [...media.slice(offset), ...media.slice(0, offset)]
      .map(anilistMediaToRecommendation)
      .filter((item) => item.title && item.cover)
      .slice(0, safeLimit);
    const items = await localizeAnimeRecommendationsWithLlm(rawItems);
    if (!items.length) throw new Error("anime recommendations empty");
    const result = {
      items,
      updatedAt: new Date().toISOString(),
      source: "anilist",
      day: dayKey,
      language: "zh-CN"
    };
    await cacheSet(cacheKey, result, 30 * 60 * 60);
    await cacheSet(lastKey, result, 7 * 24 * 60 * 60);
    return result;
  } catch (error) {
    const stale = await cacheGet(lastKey);
    if (stale?.items) return { ...stale, stale: true };
    return animeRecommendationFallback(error);
  }
}

const ddvMusicFallbackPool = [
  { id: "ddv:qing-tian", title: "晴天", artist: "周杰伦", album: "叶惠美", summary: "热评：前奏一响，青春就自动回头。", mood: "晴朗", source: "fallback" },
  { id: "ddv:dao-xiang", title: "稻香", artist: "周杰伦", album: "魔杰座", summary: "热评：走得再远，也别忘了能让自己安心的地方。", mood: "治愈", source: "fallback" },
  { id: "ddv:man-man-xi-huan-ni", title: "慢慢喜欢你", artist: "莫文蔚", album: "我们在中场相遇", summary: "热评：喜欢不用太吵，慢慢来就很珍贵。", mood: "温柔", source: "fallback" },
  { id: "ddv:hong-se-gao-gen-xie", title: "红色高跟鞋", artist: "蔡健雅", album: "Goodbye & Hello", summary: "热评：有些歌不是热烈，是刚好踩中心口。", mood: "轻盈", source: "fallback" },
  { id: "ddv:lemon", title: "Lemon", artist: "米津玄師", album: "Lemon", summary: "热评：听不懂每个词，也能听懂那种想念。", mood: "余味", source: "fallback" },
  { id: "ddv:da-shang-hua-huo", title: "打上花火", artist: "DAOKO / 米津玄師", album: "打上花火", summary: "热评：夏天会过去，但有些旋律会一直亮着。", mood: "夏夜", source: "fallback" },
  { id: "ddv:night-changes", title: "Night Changes", artist: "One Direction", album: "FOUR", summary: "热评：人会变，夜晚也会变，但当时的心动是真的。", mood: "夜色", source: "fallback" },
  { id: "ddv:somewhere-only-we-know", title: "Somewhere Only We Know", artist: "Keane", album: "Hopes and Fears", summary: "热评：总有一个地方，只要想起就会安静下来。", mood: "安静", source: "fallback" },
  { id: "ddv:hou-lai", title: "后来", artist: "刘若英", album: "我等你", summary: "热评：有些明白来得太晚，但还是会让人变温柔。", mood: "回望", source: "fallback" },
  { id: "ddv:qi-li-xiang", title: "七里香", artist: "周杰伦", album: "七里香", summary: "热评：一听就像夏天重新打开了窗。", mood: "夏风", source: "fallback" },
  { id: "ddv:sheng-ru-xia-hua", title: "生如夏花", artist: "朴树", album: "生如夏花", summary: "热评：疲惫的时候，它像把人从原地扶起来。", mood: "明亮", source: "fallback" },
  { id: "ddv:ping-fan-zhi-lu", title: "平凡之路", artist: "朴树", album: "猎户星座", summary: "热评：走过很多路以后，才知道平凡也很有力量。", mood: "远行", source: "fallback" },
  { id: "ddv:guang-hui-sui-yue", title: "光辉岁月", artist: "Beyond", album: "命运派对", summary: "热评：不是热血过期了，是每次听都还会站直一点。", mood: "坚定", source: "fallback" },
  { id: "ddv:ordinary-people", title: "Ordinary People", artist: "John Legend", album: "Get Lifted", summary: "热评：慢下来听，关系里的笨拙也变得真实。", mood: "低声", source: "fallback" },
  { id: "ddv:viva-la-vida", title: "Viva La Vida", artist: "Coldplay", album: "Viva La Vida", summary: "热评：像一场很大的风，把灰尘和遗憾都吹开。", mood: "开阔", source: "fallback" },
  { id: "ddv:yellow", title: "Yellow", artist: "Coldplay", album: "Parachutes", summary: "热评：它不吵，却能把夜里的心事照亮一点。", mood: "微光", source: "fallback" },
  { id: "ddv:secret-base", title: "secret base", artist: "ZONE", album: "Z", summary: "热评：像一封没寄出的信，被旋律好好收起来。", mood: "夏末", source: "fallback" },
  { id: "ddv:sakura", title: "さくら", artist: "森山直太朗", album: "いくつもの川を越えて生まれた言葉たち", summary: "热评：离别没有那么大声，但会在安静处回响。", mood: "告别", source: "fallback" },
  { id: "ddv:blue-bird", title: "ブルーバード", artist: "いきものがかり", album: "My song Your song", summary: "热评：节奏一起来，像把今天的低电量重新充满。", mood: "起飞", source: "fallback" },
  { id: "ddv:shelter", title: "Shelter", artist: "Porter Robinson / Madeon", album: "Shelter", summary: "热评：电子声里也能藏着很柔软的告别。", mood: "漂浮", source: "fallback" },
  { id: "ddv:river-flows-in-you", title: "River Flows in You", artist: "Yiruma", album: "First Love", summary: "热评：不需要歌词，也能把心里的褶皱慢慢熨平。", mood: "安放", source: "fallback" },
  { id: "ddv:flower-dance", title: "Flower Dance", artist: "DJ Okawari", album: "Diorama", summary: "热评：像把一段日常剪成了轻轻发光的片段。", mood: "轻快", source: "fallback" }
];

function dailyRotatedItems(pool = [], limit = 3, salt = 0) {
  const safeLimit = Math.min(pool.length, Math.max(1, Number(limit) || 1));
  if (!pool.length) return [];
  const seed = `${chinaDateKey()}:${salt}:${pool.length}`;
  return pool
    .map((item, index) => ({
      item,
      score: crypto.createHash("sha1").update(`${seed}:${item.id || index}:${index}`).digest("hex")
    }))
    .sort((a, b) => a.score.localeCompare(b.score))
    .map((entry) => entry.item)
    .slice(0, safeLimit);
}

function breakupMusicFallback(error = null, limit = 5) {
  return {
    items: dailyRotatedItems(ddvMusicFallbackPool, limit),
    updatedAt: new Date().toISOString(),
    source: "fallback",
    error: error ? "ddv_music_unavailable" : undefined
  };
}

function normalizeItunesBreakupTrack(track = {}, index = 0) {
  const title = cleanText(track.trackName || "", 140);
  const artist = cleanText(track.artistName || "", 100);
  const album = cleanText(track.collectionName || "", 120);
  const artwork = cleanText(String(track.artworkUrl100 || "").replace("100x100bb", "300x300bb"), 500);
  const url = cleanText(track.trackViewUrl || track.collectionViewUrl || "", 500);
  const previewUrl = cleanText(track.previewUrl || "", 500);
  if (!title || !artist) return null;
  return {
    id: `itunes:${track.trackId || `${artist}-${title}-${index}`}`,
    title,
    artist,
    album,
    summary: cleanText(`${artist}《${title}》：今天适合循环的一首。`, 90),
    artwork,
    url,
    previewUrl,
    mood: ["后劲", "告别", "失落", "释怀", "拉扯"][index % 5],
    source: "itunes"
  };
}

async function enrichBreakupMusicItem(base = {}, index = 0) {
  const term = [base.artist, base.title].filter(Boolean).join(" ");
  if (!term) return base;
  try {
    const params = new URLSearchParams({
      term,
      country: "CN",
      media: "music",
      entity: "song",
      limit: "4",
      lang: "zh_cn"
    });
    const payload = await fetchJsonWithTimeout(`https://itunes.apple.com/search?${params.toString()}`, 8000, {
      "User-Agent": "JlemonzBlog/1.0 (DDV music widget)"
    });
    const results = Array.isArray(payload?.results) ? payload.results : [];
    const hit = results.find((track) => {
      const title = cleanText(track.trackName || "", 140).toLowerCase();
      const artist = cleanText(track.artistName || "", 100).toLowerCase();
      return title.includes(String(base.title || "").toLowerCase()) || artist.includes(String(base.artist || "").toLowerCase());
    }) || results[0];
    const normalized = hit ? normalizeItunesBreakupTrack(hit, index) : null;
    return normalized ? {
      ...base,
      artwork: normalized.artwork || base.artwork || "",
      url: normalized.url || base.url || "",
      previewUrl: normalized.previewUrl || base.previewUrl || "",
      source: "itunes"
    } : base;
  } catch {
    return base;
  }
}

async function fetchBreakupMusicRecommendations(limit = 5) {
  const safeLimit = Math.min(8, Math.max(1, Number(limit) || 5));
  const dayKey = chinaDateKey();
  const cacheKey = `music:ddv:v1:${dayKey}:${safeLimit}`;
  const lastKey = `music:ddv:last:v1:${safeLimit}`;
  const cached = await cacheGet(cacheKey);
  if (cached?.items) return cached;
  try {
    const selected = dailyRotatedItems(ddvMusicFallbackPool, safeLimit, 7);
    const items = await Promise.all(selected.map(enrichBreakupMusicItem));
    const result = {
      items: items.slice(0, safeLimit),
      updatedAt: new Date().toISOString(),
      source: items.some((item) => item.source === "itunes") ? "itunes-curated" : "fallback",
      day: dayKey
    };
    await cacheSet(cacheKey, result, 30 * 60 * 60);
    await cacheSet(lastKey, result, 7 * 24 * 60 * 60);
    return result;
  } catch (error) {
    const stale = await cacheGet(lastKey);
    if (stale?.items) return { ...stale, stale: true };
    return breakupMusicFallback(error, safeLimit);
  }
}

const thinkingQuestionPool = [
  { id: "thinking:sunk-cost", title: "沉没成本", prompt: "如果一个项目已经投入很多时间，但继续做的收益变低，你会用哪三个指标判断该不该停？", hint: "只看未来成本、未来收益和替代选择。", difficulty: "中等", tags: ["决策", "取舍"] },
  { id: "thinking:counterfactual", title: "反事实", prompt: "如果今天的结论是错的，最可能是哪一个前提错了？你会怎么验证？", hint: "先找最关键、最脆弱的假设。", difficulty: "轻量", tags: ["验证", "表达"] },
  { id: "thinking:second-order", title: "二阶影响", prompt: "一个决定带来的第一个好处很明显，那它三个月后的副作用可能是什么？", hint: "从时间、他人反应、维护成本三个角度想。", difficulty: "中等", tags: ["系统", "预判"] },
  { id: "thinking:steelman", title: "强钢人", prompt: "选一个你不同意的观点，试着把它改写成对方最有说服力的版本。", hint: "先让对方观点变强，再决定是否反驳。", difficulty: "轻量", tags: ["沟通", "逻辑"] },
  { id: "thinking:tradeoff", title: "真实取舍", prompt: "如果只能保留速度、质量、成本中的两个，你会放弃哪一个？为什么？", hint: "不要写都要，必须明确牺牲项。", difficulty: "中等", tags: ["权衡", "项目"] },
  { id: "thinking:base-rate", title: "基准率", prompt: "在判断一件事能不能成功前，你能找到同类事情的一般成功率吗？", hint: "先看总体分布，再看自己的特殊性。", difficulty: "进阶", tags: ["概率", "判断"] }
];

async function fetchThinkingQuestions(limit = 3) {
  const safeLimit = Math.min(5, Math.max(1, Number(limit) || 3));
  const dayKey = chinaDateKey();
  const cacheKey = `thinking:daily:v1:${dayKey}:${safeLimit}`;
  const cached = await cacheGet(cacheKey);
  if (cached?.items) return cached;
  const result = {
    items: dailyRotatedItems(thinkingQuestionPool, safeLimit, 17),
    updatedAt: new Date().toISOString(),
    source: "local-daily",
    day: dayKey
  };
  await cacheSet(cacheKey, result, 30 * 60 * 60);
  return result;
}

function careerEventsFallback(error = null) {
  return {
    items: [],
    groups: { campus: [], social: [] },
    updatedAt: new Date().toISOString(),
    days: 30,
    regions: ["全国"],
    sources: ["招聘会网", "大学生招聘会", "高校就业网", "地方人才市场", "五湖招聘会网"],
    source: "fallback",
    error: error ? "career_events_unavailable" : undefined
  };
}

function careerDateInfo(year, month, day) {
  const safeYear = Number(year);
  const safeMonth = Number(month);
  const safeDay = Number(day);
  if (!Number.isInteger(safeYear) || !Number.isInteger(safeMonth) || !Number.isInteger(safeDay)) return null;
  return {
    date: `${safeYear}-${String(safeMonth).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`,
    time: Date.UTC(safeYear, safeMonth - 1, safeDay)
  };
}

function careerDateLabel(dateInfo) {
  if (!dateInfo?.date) return "";
  const [year, month, day] = dateInfo.date.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function parseCareerEventDates(value = "") {
  const text = String(value || "");
  const currentYear = Number(chinaDateKey().slice(0, 4)) || new Date().getFullYear();
  const items = [];
  const seen = new Set();
  const push = (year, month, day) => {
    const item = careerDateInfo(year, month, day);
    if (!item || seen.has(item.date)) return;
    seen.add(item.date);
    items.push(item);
  };
  for (const match of text.matchAll(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g)) push(match[1], match[2], match[3]);
  for (const match of text.matchAll(/(\d{4})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{1,2})/g)) push(match[1], match[2], match[3]);
  for (const match of text.matchAll(/(\d{4})(\d{2})(\d{2})/g)) push(match[1], match[2], match[3]);
  for (const match of text.matchAll(/(?:^|[^\d])(\d{1,2})\s*月\s*(\d{1,2})\s*日/g)) push(currentYear, match[1], match[2]);
  return items.sort((a, b) => a.time - b.time);
}

function parseChineseEventDate(value = "") {
  return parseCareerEventDates(value)[0] || null;
}

function pickFutureCareerDate(value = "", maxDays = 120) {
  const today = chinaDateUtcTime();
  const maxTime = today + Math.max(1, Number(maxDays) || 120) * 24 * 60 * 60 * 1000;
  return parseCareerEventDates(value).find((item) => item.time >= today && item.time <= maxTime) || parseChineseEventDate(value);
}

function chinaDateUtcTime(dateKey = chinaDateKey()) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return Date.UTC(year, (month || 1) - 1, day || 1);
}

function classifyCareerEvent(title = "", venue = "") {
  const text = `${title} ${venue}`;
  if (/校招|校园|双选|应届|毕业生|高校|大学|学院|实习|青年人才|春招|秋招/i.test(text)) return "campus";
  return "social";
}

const careerRegionKeywords = ["北京", "上海", "广州", "深圳", "成都", "杭州", "武汉", "西安", "南京", "重庆", "天津", "苏州", "青岛", "宁波", "长沙", "郑州", "合肥", "昆明", "东莞", "佛山", "无锡", "福州", "沈阳", "长春", "宜宾", "菏泽", "常州", "兰州", "石家庄", "四川", "广东", "江苏", "浙江", "湖北", "陕西", "山东", "安徽", "湖南", "河南", "辽宁", "吉林", "福建", "甘肃"];

function inferCareerRegion(title = "", venue = "", fallback = "全国") {
  const text = `${title} ${venue}`;
  return careerRegionKeywords.find((region) => text.includes(region)) || fallback || "全国";
}

function normalizeCareerTitle(value = "") {
  return plainTextFromHtml(value, 240)
    .replace(/^查看详情[:：]?\s*/i, "")
    .replace(/^\s*[•·]\s*(?:现场|网络)?\s*\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s*/i, "")
    .replace(/^\s*(?:现场|网络)\s*\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function careerDedupeTitle(value = "") {
  return String(value || "")
    .replace(/^\d{4}年/, "")
    .replace(/[\s,，.。:：;；()（）“”"'·•\-—_]/g, "")
    .replace(/招聘会$/, "招聘")
    .replace(/校园招聘会/g, "校园招聘")
    .slice(0, 80);
}

function careerEventSummary({ title = "", venue = "", kind = "social", sourceName = "" } = {}) {
  const pieces = [];
  if (venue) pieces.push(venue);
  pieces.push(kind === "campus" ? "校招 / 双选 / 应届信息" : "社招 / 现场招聘会信息");
  if (sourceName) pieces.push(sourceName);
  return pieces.join(" · ");
}

function careerEventItem({ title, venue = "", href = "", region = "全国", sourceName = "", sourceUrl = "", dateInfo: explicitDateInfo = null } = {}) {
  const cleanTitle = normalizeCareerTitle(title);
  if (!cleanTitle || !/(招聘会|双选会|供需见面|人才交流|岗位共享|就业专场|校招|校园招聘|招聘活动|现场招聘|专场招聘|网络联合招聘|人力资源市场)/.test(cleanTitle)) return null;
  const dateInfo = explicitDateInfo || parseChineseEventDate(cleanTitle);
  if (!dateInfo) return null;
  let url = cleanText(href || sourceUrl || "", 500);
  try { url = url && !url.startsWith("http") ? new URL(url, sourceUrl).toString() : url; } catch { url = sourceUrl || ""; }
  const kind = classifyCareerEvent(cleanTitle, venue);
  const displayRegion = inferCareerRegion(cleanTitle, venue, region);
  return {
    id: `${kind}:${displayRegion}:${dateInfo.date}:${privacyHash(url || cleanTitle).slice(0, 10)}`,
    kind,
    region: displayRegion,
    source: sourceName,
    title: cleanTitle,
    summary: careerEventSummary({ title: cleanTitle, venue, kind, sourceName }),
    venue,
    date: dateInfo.date,
    dateTime: dateInfo.time,
    url,
    tags: [displayRegion, kind === "campus" ? "校招" : "社招", "全国", sourceName].filter(Boolean)
  };
}

function decodeCareerHtml(buffer, contentType = "") {
  const bytes = Buffer.from(buffer || []);
  const head = bytes.toString("latin1", 0, Math.min(bytes.length, 4096));
  const charset = String(contentType || "").match(/charset=([^;\s]+)/i)?.[1]
    || head.match(/charset=["']?\s*([^"'\s/>]+)/i)?.[1]
    || "";
  const normalized = charset.toLowerCase().replace(/_/g, "-");
  const label = /gb2312|gbk|gb18030/.test(normalized) ? "gb18030" : "utf-8";
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function careerHtmlLines(html = "") {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|li|tr|td|th|div|h\d)>/gi, "\n")
    .replace(/<(?:td|th|p|li|tr|div|h\d)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;|&emsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split(/\n+/)
    .map((line) => cleanText(line, 220))
    .filter(Boolean);
}

function careerScheduleTitleFromLines(lines = [], index = 0, fallback = "") {
  const hasEventWord = (line = "") => /(招聘会|双选会|供需见面|就业专场|招聘活动|现场招聘|专场招聘|人才交流|网络联合招聘)/.test(line);
  const isNoise = (line = "") => /^(序号|活动名称|活动计划时间|活动内容|面向对象|活动区域|时间|地点|日期|当前位置|浏览次数|分享到|首页|登录|返回|关闭|打印|分享|联系方式)/.test(line)
    || /网站|版权所有|备案|隐私|使用帮助|招聘会信息\s*$|感谢贵单位|计划于|正式启动|申请预约|欢迎广大|具体活动|相关活动|发表时间|报名时间|截止/.test(line);
  const sameLine = lines[index] || "";
  const ordered = [
    sameLine,
    ...lines.slice(Math.max(0, index - 5), index).reverse(),
    ...lines.slice(index + 1, Math.min(lines.length, index + 6))
  ];
  const candidate = ordered.find((line) => hasEventWord(line) && !isNoise(line));
  const source = candidate || (hasEventWord(fallback) ? fallback : "");
  return normalizeCareerTitle(source)
    .replace(/^[-—\d.\s、]+/, "")
    .replace(/^(?:日期|时间|活动时间|计划时间)[:：]?\s*/, "")
    .replace(/\s*(?:日期|时间|活动时间|计划时间)[:：]?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function careerScheduleLineMayBeEventDate(lines = [], index = 0, fallback = "") {
  const line = lines[index] || "";
  if (/报名|发表|发布|截止|申请|正式启动|自\s*\d{1,2}\s*月\s*\d{1,2}\s*日\s*起|即日起|值班|联系|咨询|版权|备案|人气/.test(line)) return false;
  const nearby = lines.slice(Math.max(0, index - 4), Math.min(lines.length, index + 5)).join(" ");
  const eventText = `${nearby} ${fallback}`;
  if (!/(招聘会|双选会|供需见面|就业专场|招聘活动|现场招聘|专场招聘|人才交流|网络联合招聘)/.test(eventText)) return false;
  if (/活动时间|举办时间|活动计划时间|日期|时间/.test(line)) return true;
  if (/^(?:\d{4}\s*年\s*)?\d{1,2}\s*月\s*\d{1,2}\s*日(?:\s*[（(][^)）]+[)）])?$/.test(line)) return true;
  if (/^\d{4}\s*[\/\-.]\s*\d{1,2}\s*[\/\-.]\s*\d{1,2}$/.test(line)) return true;
  return /(招聘会|双选会|供需见面|就业专场|招聘活动|现场招聘|专场招聘|人才交流|网络联合招聘)/.test(line);
}

function careerScheduleVenueFromLines(lines = [], index = 0) {
  const windowLines = lines.slice(Math.max(0, index - 3), Math.min(lines.length, index + 6));
  const windowText = windowLines.join(" ");
  return venueFromCareerText(windowText)
    || cleanText(windowLines.find((line) => /校区|大厅|市场|中心|广场|体育馆|会场|地点|活动区域|服务大厅|人才大厦/.test(line)) || "", 120)
      .replace(/^(?:地点|活动地点|举办地点|活动区域)[:：]?\s*/, "");
}

function scheduleCareerEventItems(html = "", { region = "全国", sourceName = "", sourceUrl = "", title = "", singleEvent = false } = {}) {
  const lines = careerHtmlLines(html);
  const fallbackTitle = pageTitleFromHtml(html, title);
  const items = [];
  const seen = new Set();
  lines.forEach((line, index) => {
    if (!careerScheduleLineMayBeEventDate(lines, index, fallbackTitle)) return;
    const dateInfo = pickFutureCareerDate(line, 180);
    if (!dateInfo) return;
    const rawTitle = careerScheduleTitleFromLines(lines, index, fallbackTitle);
    if (!rawTitle) return;
    const displayTitle = /\d{4}\s*年|\d{4}[\/\-.]/.test(rawTitle) ? rawTitle : `${careerDateLabel(dateInfo)} ${rawTitle}`;
    const item = careerEventItem({
      href: sourceUrl,
      title: displayTitle,
      venue: careerScheduleVenueFromLines(lines, index),
      region,
      sourceName,
      sourceUrl,
      dateInfo
    });
    if (!item) return;
    const key = `${item.date}:${careerDedupeTitle(item.title)}:${sourceName}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  });
  return singleEvent ? items.slice(0, 1) : items;
}

function zhaopinhuiEventItems(html = "", { region = "全国", sourceName = "", sourceUrl = "" } = {}) {
  const items = [];
  const pattern = /<li>\s*<p>\s*<a\b[^>]*href=["']([^"']+)["'][^>]*?(?:title=["']([^"']*)["'])?[^>]*>([\s\S]*?)<\/a>\s*<\/p>\s*<span>([\s\S]*?)<\/span>\s*<\/li>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const item = careerEventItem({
      href: match[1],
      title: match[2] || match[3] || "",
      venue: plainTextFromHtml(match[4] || "", 120),
      region,
      sourceName,
      sourceUrl
    });
    if (item) items.push(item);
  }
  return items;
}

function genericCareerEventItems(html = "", { region = "全国", sourceName = "", sourceUrl = "" } = {}) {
  const items = [];
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*(?:title=["']([^"']*)["'])?[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const rawTitle = match[2] || match[3] || "";
    const item = careerEventItem({
      href: match[1],
      title: rawTitle,
      region,
      sourceName,
      sourceUrl
    });
    if (item) items.push(item);
  }
  return items;
}


function pageTitleFromHtml(html = "", fallback = "") {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const title = h1?.[1] || html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || fallback;
  return normalizeCareerTitle(title).replace(/[_｜|\-].*$/, "").trim() || fallback;
}

function venueFromCareerText(text = "") {
  const match = String(text || "").match(/(?:地点|地一?点|会场|举办地点|活动地点)[:：]?\s*([^。；;，,\n]{2,80})/);
  return cleanText(match?.[1] || "", 120);
}

function detailCareerEventItems(html = "", { region = "全国", sourceName = "", sourceUrl = "", title = "" } = {}) {
  const text = plainTextFromHtml(html, 12000);
  const cleanTitle = pageTitleFromHtml(html, title);
  const dateInfo = pickFutureCareerDate(`${cleanTitle} ${text}`, 150);
  if (!dateInfo) return [];
  const displayTitle = /\d{4}\s*年|\d{4}[\/\-.]/.test(cleanTitle) ? cleanTitle : `${careerDateLabel(dateInfo)} ${cleanTitle}`;
  const item = careerEventItem({
    href: sourceUrl,
    title: displayTitle,
    venue: venueFromCareerText(text),
    region,
    sourceName,
    sourceUrl,
    dateInfo
  });
  return item ? [item] : [];
}

function gdutScheduleEventItems(html = "", { region = "广东", sourceName = "", sourceUrl = "" } = {}) {
  const text = plainTextFromHtml(html, 30000);
  const items = [];
  const pattern = /\|?\s*(2026\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日[^|]{0,12})\s*\|\s*([^|]{3,30})\s*\|\s*([^|]{2,80})\s*\|\s*([^|\n]{2,80})/g;
  let match;
  while ((match = pattern.exec(text))) {
    const dateInfo = parseChineseEventDate(match[1]);
    if (!dateInfo) continue;
    const venue = cleanText(match[3], 100);
    const category = cleanText(match[4], 60);
    const item = careerEventItem({
      href: sourceUrl,
      title: `${careerDateLabel(dateInfo)} 广东工业大学2027届毕业生秋季校园招聘会（${category}）`,
      venue,
      region,
      sourceName,
      sourceUrl,
      dateInfo
    });
    if (item) items.push(item);
  }
  return items;
}

function jnuScheduleEventItems(html = "", { region = "广东", sourceName = "", sourceUrl = "" } = {}) {
  const text = plainTextFromHtml(html, 30000);
  const items = [];
  const pattern = /([^\s|]{2,12}校区)\s*\|\s*(2026\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日[^|]{0,24})\s*\|\s*([^|\n]{2,80})/g;
  let match;
  while ((match = pattern.exec(text))) {
    const dateInfo = parseChineseEventDate(match[2]);
    if (!dateInfo) continue;
    const campus = cleanText(match[1], 40);
    const venue = cleanText(match[3], 100);
    const item = careerEventItem({
      href: sourceUrl,
      title: `${careerDateLabel(dateInfo)} 暨南大学2027届毕业生秋季校园招聘会（${campus}）`,
      venue,
      region,
      sourceName,
      sourceUrl,
      dateInfo
    });
    if (item) items.push(item);
  }
  return items;
}

async function fetchCareerSource(source) {
  const response = await fetch(source.url, {
    headers: {
      "User-Agent": "JlemonzBlog/1.0 (+career radar)",
      Accept: "text/html,application/xhtml+xml"
    },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`career source failed ${source.region || source.url}: ${response.status}`);
  const html = decodeCareerHtml(await response.arrayBuffer(), response.headers.get("content-type") || "");
  const parsers = {
    zhaopinhui: zhaopinhuiEventItems,
    detail: detailCareerEventItems,
    gdut: gdutScheduleEventItems,
    jnu: jnuScheduleEventItems,
    schedule: scheduleCareerEventItems,
    generic: genericCareerEventItems
  };
  const parser = parsers[source.parser] || genericCareerEventItems;
  return parser(html, { region: source.region || "全国", sourceName: source.sourceName || "招聘会源", sourceUrl: source.url, title: source.title || "", singleEvent: Boolean(source.singleEvent) });
}

function careerEventGroups(items = [], safeLimit = 12) {
  const perGroupLimit = Math.max(3, Math.ceil(safeLimit / 2));
  const campus = items.filter((item) => item.kind === "campus").slice(0, perGroupLimit);
  const social = items.filter((item) => item.kind !== "campus").slice(0, perGroupLimit);
  return { campus, social };
}

async function fetchCareerEvents({ limit = 12, days = 30 } = {}) {
  const safeLimit = Math.min(32, Math.max(4, Number(limit) || 12));
  const safeDays = Math.min(60, Math.max(7, Number(days) || 30));
  const cacheKey = `career:events:v6:${chinaDateKey()}:${safeDays}:${safeLimit}`;
  const lastKey = `career:events:last:v6:${safeDays}:${safeLimit}`;
  const cached = await cacheGet(cacheKey);
  if (cached?.items || cached?.groups) return cached;
  try {
    const sources = [
      { region: "全国", sourceName: "全国招聘会网", url: "https://www.zhaopinhui.cc/", parser: "generic" },
      { region: "全国", sourceName: "大学生招聘会", url: "https://www.zhaopinhui.net/zhaopinhui/", parser: "zhaopinhui" },
      { region: "四川", sourceName: "大学生招聘会", url: "https://www.zhaopinhui.net/sichuan/", parser: "zhaopinhui" },
      { region: "广东", sourceName: "大学生招聘会", url: "https://www.zhaopinhui.net/guangdong/", parser: "zhaopinhui" },
      { region: "上海", sourceName: "大学生招聘会", url: "https://shanghai.zhaopinhui.net/", parser: "zhaopinhui" },
      { region: "北京", sourceName: "招聘会网", url: "https://www.zph.com.cn/beijing/" },
      { region: "上海", sourceName: "招聘会网", url: "https://www.zph.com.cn/shanghai/" },
      { region: "广州", sourceName: "招聘会网", url: "https://www.zph.com.cn/guangzhou/" },
      { region: "深圳", sourceName: "招聘会网", url: "https://www.zph.com.cn/shenzhen/" },
      { region: "成都", sourceName: "招聘会网", url: "https://www.zph.com.cn/chengdu/" },
      { region: "杭州", sourceName: "招聘会网", url: "https://www.zph.com.cn/hangzhou/" },
      { region: "武汉", sourceName: "招聘会网", url: "https://www.zph.com.cn/wuhan/" },
      { region: "西安", sourceName: "招聘会网", url: "https://www.zph.com.cn/xian/" },
      { region: "南京", sourceName: "招聘会网", url: "https://www.zph.com.cn/nanjing/" },
      { region: "重庆", sourceName: "招聘会网", url: "https://www.zph.com.cn/chongqing/" },
      { region: "广州", sourceName: "广州人社", url: "https://rsj.gz.gov.cn/zwdt/gzdt/content/post_10915923.html", parser: "schedule", title: "广州市人力资源市场智慧服务大厅2026年下半年活动清单" },
      { region: "广州", sourceName: "广州人社", url: "https://rsj.gz.gov.cn/zzzq/zwdt/content/post_10957343.html", parser: "schedule", title: "广州好揾工相约南站大型公益招聘会", singleEvent: true },
      { region: "天津", sourceName: "南开大学", url: "https://career.nankai.edu.cn/news/content/id/1949.html", parser: "schedule", title: "南开大学2026年秋季校园招聘活动邀请函" },
      { region: "全国", sourceName: "国家大学生就业服务平台", url: "https://job.ncss.cn/student/jobfair/joint.html", parser: "schedule", title: "2026届高校毕业生全国网络联合招聘" },
      { region: "全国", sourceName: "五湖招聘会网", url: "https://www.whzph.com/" }
    ];
    const results = await Promise.allSettled(sources.map(fetchCareerSource));
    const today = chinaDateUtcTime();
    const maxTime = today + safeDays * 24 * 60 * 60 * 1000;
    const seen = new Set();
    const sorted = results.flatMap((result) => result.status === "fulfilled" ? result.value : [])
      .filter((item) => item.dateTime >= today && item.dateTime <= maxTime)
      .sort((a, b) => a.dateTime - b.dateTime || String(a.region).localeCompare(String(b.region), "zh-CN"))
      .filter((item) => {
        const key = `${item.date}:${careerDedupeTitle(item.title)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const groupsWithDateTime = careerEventGroups(sorted, safeLimit);
    const itemsWithDateTime = [...groupsWithDateTime.campus, ...groupsWithDateTime.social]
      .sort((a, b) => a.dateTime - b.dateTime)
      .slice(0, safeLimit);
    const stripTime = ({ dateTime, ...item }) => item;
    const groups = {
      campus: groupsWithDateTime.campus.map(stripTime),
      social: groupsWithDateTime.social.map(stripTime)
    };
    const payload = {
      items: itemsWithDateTime.map(stripTime),
      groups,
      updatedAt: new Date().toISOString(),
      days: safeDays,
      regions: ["全国", "四川", "广东", "北京", "上海", "广州", "深圳", "成都", "杭州", "武汉", "西安", "南京", "重庆", "天津", "佛山", "无锡", "福州", "沈阳"],
      sources: ["招聘会网", "全国招聘会网", "大学生招聘会", "高校就业网", "地方人社", "地方人才市场", "五湖招聘会网", "国家大学生就业服务平台"],
      source: "career-events"
    };
    await cacheSet(cacheKey, payload, 6 * 60 * 60);
    await cacheSet(lastKey, payload, 3 * 24 * 60 * 60);
    return payload;
  } catch (error) {
    const stale = await cacheGet(lastKey);
    if (stale?.items || stale?.groups) return { ...stale, stale: true };
    return careerEventsFallback(error);
  }
}

function techHotspotFallback(error = null) {
  return {
    items: [],
    updatedAt: new Date().toISOString(),
    sources: ["GitHub", "Hacker News"],
    source: "fallback",
    error: error ? "tech_hotspots_unavailable" : undefined
  };
}

function githubRepoToTechHotspot(repo = {}, index = 0) {
  const fullName = repo.full_name || repo.name || "GitHub Repository";
  const topics = Array.isArray(repo.topics) ? repo.topics.slice(0, 3).filter(Boolean) : [];
  return {
    id: `github:${repo.full_name || repo.name || index}`,
    source: "GitHub",
    title: fullName,
    summary: cleanText(repo.description || "机器人 / AI 相关开源项目，适合跟进工程实践和技术栈变化。", 220),
    url: cleanText(repo.html_url || "", 500),
    score: clampNumber(repo.stargazers_count, 0, 99999999, 0),
    tags: topics.length ? topics : [repo.language || "open-source"].filter(Boolean),
    publishedAt: repo.pushed_at || repo.updated_at || "",
    meta: `${repo.language || "Code"} · ${clampNumber(repo.stargazers_count, 0, 99999999, 0)} stars`
  };
}

function hnHitToTechHotspot(hit = {}, index = 0) {
  const objectId = cleanText(hit.objectID || hit.id || index, 80);
  const url = cleanText(hit.url || (objectId ? `https://news.ycombinator.com/item?id=${objectId}` : ""), 500);
  const points = clampNumber(hit.points, 0, 99999999, 0);
  const comments = clampNumber(hit.num_comments, 0, 99999999, 0);
  return {
    id: `hn:${objectId}`,
    source: "Hacker News",
    title: cleanText(hit.title || hit.story_title || "Hacker News story", 180),
    summary: plainTextFromHtml(hit.story_text || hit.comment_text || "科技社区正在讨论的 AI / Robotics / Open Source 话题。", 220),
    url,
    score: points,
    tags: [hit.author ? `@${hit.author}` : "HN", "story"].filter(Boolean),
    publishedAt: hit.created_at || "",
    meta: `${points} points · ${comments} comments`
  };
}

async function fetchGithubTechHotspots(limit = 3) {
  const safeLimit = Math.min(8, Math.max(1, Number(limit) || 3));
  const headers = {
    "User-Agent": "JlemonzBlog/1.0",
    Accept: "application/vnd.github+json"
  };
  if (config.github.token) headers.Authorization = `Bearer ${config.github.token}`;
  const params = new URLSearchParams({
    q: "robotics OR ai OR embedded OR ros2 stars:>100",
    sort: "stars",
    order: "desc",
    per_page: String(safeLimit)
  });
  const response = await fetch(`https://api.github.com/search/repositories?${params.toString()}`, {
    headers,
    signal: AbortSignal.timeout(githubFetchTimeoutMs)
  });
  if (!response.ok) throw new Error(`github tech hotspots failed: ${response.status}`);
  const data = await response.json();
  return Array.isArray(data.items) ? data.items.map(githubRepoToTechHotspot) : [];
}

async function fetchHackerNewsTechHotspots(limit = 3) {
  const safeLimit = Math.min(8, Math.max(1, Number(limit) || 3));
  const queries = ["robotics", "artificial intelligence", "embedded systems", "open source hardware"];
  const hitsPerPage = Math.max(2, Math.ceil(safeLimit / queries.length));
  const chunks = await Promise.all(queries.map(async (queryText) => {
    const params = new URLSearchParams({
      query: queryText,
      tags: "story",
      hitsPerPage: String(hitsPerPage)
    });
    const response = await fetch(`https://hn.algolia.com/api/v1/search_by_date?${params.toString()}`, {
      headers: { "User-Agent": "JlemonzBlog/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`hn tech hotspots failed: ${response.status}`);
    const data = await response.json();
    return Array.isArray(data.hits) ? data.hits : [];
  }));
  const seen = new Set();
  return chunks.flat().map(hnHitToTechHotspot).filter((item) => {
    const key = item.url || item.id || item.title;
    if (!item.title || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, safeLimit);
}
async function fetchTechHotspots(limit = 6) {
  const safeLimit = Math.min(10, Math.max(1, Number(limit) || 6));
  const cacheKey = `tech:hotspots:v1:${safeLimit}`;
  const lastKey = `tech:hotspots:last:v1:${safeLimit}`;
  const cached = await cacheGet(cacheKey);
  if (cached?.items) return cached;
  try {
    const githubLimit = Math.ceil(safeLimit / 2);
    const hnLimit = safeLimit - githubLimit;
    const [githubResult, hnResult] = await Promise.allSettled([
      fetchGithubTechHotspots(githubLimit),
      fetchHackerNewsTechHotspots(hnLimit || 1)
    ]);
    const githubItems = githubResult.status === "fulfilled" ? githubResult.value : [];
    const hnItems = hnResult.status === "fulfilled" ? hnResult.value : [];
    const items = [...githubItems, ...hnItems]
      .filter((item) => item?.title)
      .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
      .slice(0, safeLimit);
    const payload = {
      items,
      updatedAt: new Date().toISOString(),
      sources: ["GitHub", "Hacker News"],
      source: "tech-hotspots"
    };
    await cacheSet(cacheKey, payload, 30 * 60);
    await cacheSet(lastKey, payload, 24 * 60 * 60);
    return payload;
  } catch (error) {
    const stale = await cacheGet(lastKey);
    if (stale?.items) return { ...stale, stale: true };
    return techHotspotFallback(error);
  }
}

function dailyApiSnapshotSpecs() {
  return [
    {
      key: "music:ddv:5",
      source: "ddv-music",
      cacheAssets: true,
      loader: () => fetchBreakupMusicRecommendations(5),
      fallback: (error) => breakupMusicFallback(error, 5)
    },
    {
      key: "anime:daily:2",
      source: "anime-daily",
      cacheAssets: true,
      loader: () => fetchAnimeDailyRecommendations(2),
      fallback: (error) => animeRecommendationFallback(error)
    },
    {
      key: "tech:hotspots:6",
      source: "tech-hotspots",
      loader: () => fetchTechHotspots(6),
      fallback: (error) => techHotspotFallback(error)
    },
    {
      key: "career:events:7:5",
      source: "career-events",
      loader: () => fetchCareerEvents({ limit: 5, days: 7 }),
      fallback: (error) => careerEventsFallback(error)
    },
    {
      key: "github:trending:4",
      source: "github-trending",
      loader: () => fetchGithubTrendingRepositories(4),
      fallback: () => ({ topic: "robotics", items: [], source: "fallback", updatedAt: new Date().toISOString() })
    },
    {
      key: "github:trending:5",
      source: "github-trending",
      loader: () => fetchGithubTrendingRepositories(5),
      fallback: () => ({ topic: "robotics", items: [], source: "fallback", updatedAt: new Date().toISOString() })
    },
    {
      key: "thinking:questions:3",
      source: "thinking-questions",
      loader: () => fetchThinkingQuestions(3),
      fallback: () => ({
        items: dailyRotatedItems(thinkingQuestionPool, 3, 17),
        updatedAt: new Date().toISOString(),
        source: "fallback"
      })
    }
  ];
}

async function refreshDailyApiSnapshots({ force = false } = {}) {
  if (!databaseAvailable) return { skipped: true, reason: "database_unavailable" };
  const results = [];
  for (const spec of dailyApiSnapshotSpecs()) {
    try {
      if (!force && await readApiDailySnapshot(spec.key)) {
        results.push({ key: spec.key, status: "cached" });
        continue;
      }
      const payload = await refreshDailyApiSnapshot(spec.key, spec.loader, {
        cacheAssets: Boolean(spec.cacheAssets),
        source: spec.source
      });
      results.push({ key: spec.key, status: "ready", count: Array.isArray(payload?.items) ? payload.items.length : 0 });
    } catch (error) {
      const stale = await readApiDailySnapshot(spec.key, { allowStale: true });
      if (stale) {
        results.push({ key: spec.key, status: "stale", message: error?.message || String(error) });
        continue;
      }
      if (typeof spec.fallback === "function") {
        try {
          const fallbackPayload = await prepareApiSnapshotPayload(spec.fallback(error), { cacheAssets: Boolean(spec.cacheAssets) });
          await writeApiDailySnapshot(spec.key, fallbackPayload, { source: `${spec.source || "api"}-fallback` });
          results.push({ key: spec.key, status: "fallback" });
          continue;
        } catch {}
      }
      results.push({ key: spec.key, status: "failed", message: error?.message || String(error) });
    }
  }
  return { ok: true, refreshedAt: new Date().toISOString(), results };
}

function startDailyApiSnapshotRefresher() {
  let timer = null;
  const scheduleNext = () => {
    clearTimeout(timer);
    timer = setTimeout(run, msUntilNextChinaMidnight() + 2 * 60 * 1000);
  };
  const run = async () => {
    try {
      await refreshDailyApiSnapshots({ force: true });
    } catch (error) {
      console.warn("daily api snapshot scheduled refresh failed", error);
    } finally {
      scheduleNext();
    }
  };
  setTimeout(() => {
    refreshDailyApiSnapshots().catch((error) => console.warn("daily api snapshot startup refresh failed", error));
  }, 12000);
  scheduleNext();
}

async function integrationStatusPayload() {
  const username = databaseAvailable
    ? await getSetting("github_username", config.github.username || "Jlemonz")
    : (config.github.username || "Jlemonz");
  const login = normalizeGithubLogin(username);
  const [repos, contributions, moyu] = await Promise.all([
    listGithubRepositories(login, 20).catch(() => ({ username: login, items: [], jobs: [] })),
    getGithubSnapshot(login).catch(() => null),
    readMoyuSnapshot().catch(() => fallbackMoyuSnapshot())
  ]);
  return {
    github: {
      username: login,
      tokenConfigured: Boolean(config.github.token),
      contributions: contributions ? {
        total: contributions.total || 0,
        source: contributions.source || "snapshot",
        fetchedAt: contributions.fetchedAt || contributions.refreshedAt || ""
      } : null,
      repositories: repos.items || [],
      jobs: repos.jobs || []
    },
    moyu: {
      source: moyu.source,
      snapshotDay: moyu.snapshotDay,
      refreshedAt: moyu.refreshedAt || moyu.fetchedAt || "",
      modules: Array.isArray(moyu.modules) ? moyu.modules.length : 0
    },
    feeds: {
      rss: "/rss.xml",
      sitemap: "/sitemap.xml"
    }
  };
}

function startGithubRepositoriesRefresher() {
  const run = async () => {
    try {
      const username = await getSetting("github_username", config.github.username);
      const result = await syncGithubRepositories(null, null, username);
      if (result?.error) console.warn("github repository scheduled sync failed", result.message);
    } catch (error) {
      console.warn("github repository scheduled sync failed", error);
    }
  };
  setTimeout(run, 9000);
  setInterval(run, 6 * 60 * 60 * 1000);
}

async function requireAdmin(req, res) {
  const user = await currentAdminUser(req);
  if (!user) {
    redirect(res, "/admin/login");
    return null;
  }
  return user;
}

async function requireAdminJson(req, res) {
  const user = await currentAdminUser(req);
  if (!user) {
    json(res, { error: "unauthorized", message: "请先登录" }, 401);
    return null;
  }
  return user;
}

async function readAdminObject(req) {
  const body = await readBody(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  return body;
}

function cleanStatus(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function cleanMomentKind(value, fallback = "life") {
  const kind = cleanKey(value, "");
  if (kind && kind !== "all") return kind;
  const fallbackKind = cleanKey(fallback, "life");
  return fallbackKind && fallbackKind !== "all" ? fallbackKind : "life";
}

function cleanMomentKindFilter(value) {
  const kind = cleanKey(value, "");
  return kind && kind !== "all" ? kind : "";
}

function tagsFromInput(value) {
  const raw = Array.isArray(value) ? value.join(",") : String(value || "");
  return raw.split(/[,\uFF0C\u3001]/).map((item) => cleanText(item, 40)).filter(Boolean).slice(0, 12);
}

function cleanInterviewSection(value, fallback = "bagu") {
  const raw = String(value || "").trim().toLowerCase();
  if (/八股|bagu|base|basic|基础/.test(raw)) return "bagu";
  if (/面经|experience|story|复盘/.test(raw)) return "experience";
  if (/daily|50|每日|刷题/.test(raw)) return "daily50";
  const section = cleanKey(raw, fallback);
  return ["bagu", "experience", "daily50"].includes(section) ? section : fallback;
}

const uploadImageTypes = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif"
};

const uploadExtensions = new Map(Object.entries(uploadImageTypes).map(([type, ext]) => [ext, type]));

function detectUploadImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { contentType: "image/jpeg", ext: ".jpg" };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { contentType: "image/png", ext: ".png" };
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return { contentType: "image/webp", ext: ".webp" };
  if (buffer.subarray(0, 4).toString("ascii") === "GIF8") return { contentType: "image/gif", ext: ".gif" };
  return null;
}

function publicUploadUrl(relativePath) {
  const base = config.uploads.publicPath.endsWith("/")
    ? config.uploads.publicPath.slice(0, -1)
    : config.uploads.publicPath;
  return `${base}/${relativePath.replace(/\\/g, "/").replace(/^\/+/, "")}`;
}

async function recordMediaAsset(asset, relativePath, user) {
  if (!databaseAvailable) return;
  try {
    await query(`INSERT INTO media_assets(storage_key,url,filename,mime,size,sha256,source,uploaded_by,last_seen_at,created_at)
      VALUES(:storage_key,:url,:filename,:mime,:size,:sha256,'admin-upload',:uploaded_by,NULL,NOW())
      ON DUPLICATE KEY UPDATE filename=:filename, mime=:mime, size=:size, sha256=:sha256, deleted_at=NULL`, {
      storage_key: relativePath,
      url: asset.url,
      filename: asset.filename,
      mime: asset.contentType,
      size: asset.size,
      sha256: asset.sha256 || "",
      uploaded_by: Number(user?.id) > 0 ? user.id : null
    });
  } catch (error) {
    console.warn("media asset write failed", error.message || error);
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeLocalMediaUrl(value) {
  const raw = String(value || "").trim().replace(/^['"]|['"]$/g, "").replace(/[),.;]+$/g, "");
  if (!raw) return "";
  const base = config.uploads.publicPath.startsWith("/") ? config.uploads.publicPath : `/${config.uploads.publicPath}`;
  let pathname = raw;
  try {
    if (/^https?:\/\//i.test(raw)) pathname = new URL(raw).pathname;
  } catch {
    pathname = raw;
  }
  if (!pathname.startsWith(base.endsWith("/") ? base : `${base}/`)) return "";
  return pathname.split(/[?#]/)[0];
}

function extractMediaUrlsFromText(value) {
  const text = String(value || "");
  if (!text) return [];
  const candidates = [];
  const markdownUrlPattern = /!?\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  const htmlUrlPattern = /\b(?:src|href)=["']([^"']+)["']/gi;
  const directUrlPattern = new RegExp(`${escapeRegex(config.uploads.publicPath)}/[^\\s"'\\)<>]+`, "g");
  for (const match of text.matchAll(markdownUrlPattern)) candidates.push(match[1]);
  for (const match of text.matchAll(htmlUrlPattern)) candidates.push(match[1]);
  for (const match of text.matchAll(directUrlPattern)) candidates.push(match[0]);
  return [...new Set(candidates.map(normalizeLocalMediaUrl).filter(Boolean))];
}

async function refreshAttachmentRefsForResource(resourceType, resourceId, fields = {}) {
  if (!databaseAvailable || !resourceType || !resourceId) return { resources: 0, refs: 0 };
  await query("DELETE FROM attachment_refs WHERE resource_type=:resource_type AND resource_id=:resource_id", {
    resource_type: resourceType,
    resource_id: String(resourceId)
  });
  let refs = 0;
  for (const [fieldKey, value] of Object.entries(fields)) {
    for (const mediaUrl of extractMediaUrlsFromText(value)) {
      const asset = await getOne("SELECT id FROM media_assets WHERE url=:url LIMIT 1", { url: mediaUrl });
      await query(`INSERT INTO attachment_refs(media_asset_id,media_url,resource_type,resource_id,field_key,created_at,updated_at)
        VALUES(:media_asset_id,:media_url,:resource_type,:resource_id,:field_key,NOW(),NOW())
        ON DUPLICATE KEY UPDATE media_asset_id=:media_asset_id, updated_at=NOW()`, {
        media_asset_id: asset?.id || null,
        media_url: mediaUrl,
        resource_type: resourceType,
        resource_id: String(resourceId),
        field_key: String(fieldKey).slice(0, 120)
      });
      if (asset?.id) {
        await query("UPDATE media_assets SET last_seen_at=NOW() WHERE id=:id", { id: asset.id });
      }
      refs += 1;
    }
  }
  return { resources: 1, refs };
}

async function clearAttachmentRefsForResource(resourceType, resourceId) {
  if (!databaseAvailable || !resourceType || !resourceId) return;
  await query("DELETE FROM attachment_refs WHERE resource_type=:resource_type AND resource_id=:resource_id", {
    resource_type: resourceType,
    resource_id: String(resourceId)
  });
}

async function rebuildAttachmentRefs() {
  if (!databaseAvailable) return { resources: 0, refs: 0, source: "local-preview" };
  await query("DELETE FROM attachment_refs");
  let resources = 0;
  let refs = 0;
  const scanners = [
    {
      type: "post",
      rows: await query("SELECT id, cover_url, content_md FROM posts WHERE deleted_at IS NULL"),
      fields: (row) => ({ cover_url: row.cover_url, content_md: row.content_md })
    },
    {
      type: "moment",
      rows: await query("SELECT id, image_url, content FROM moments WHERE deleted_at IS NULL"),
      fields: (row) => ({ image_url: row.image_url, content: row.content })
    },
    {
      type: "project",
      rows: await query("SELECT id, cover_url, content_md, summary, status_text FROM projects WHERE deleted_at IS NULL"),
      fields: (row) => ({ cover_url: row.cover_url, content_md: row.content_md, summary: row.summary, status_text: row.status_text })
    },
    {
      type: "interview",
      rows: await query("SELECT id, content_md, summary FROM interview_items WHERE deleted_at IS NULL"),
      fields: (row) => ({ content_md: row.content_md, summary: row.summary })
    },
    {
      type: "page-block",
      rows: await query("SELECT id, payload_json, title FROM page_blocks WHERE status<>'hidden'"),
      fields: (row) => ({ payload_json: row.payload_json, title: row.title })
    },
    {
      type: "theme-setting",
      rows: await query("SELECT id, payload_json FROM theme_settings WHERE status<>'draft'"),
      fields: (row) => ({ payload_json: row.payload_json })
    },
    {
      type: "site-setting",
      rows: await query("SELECT setting_key AS id, setting_value FROM site_settings"),
      fields: (row) => ({ setting_value: row.setting_value })
    }
  ];
  for (const scanner of scanners) {
    for (const row of scanner.rows) {
      const result = await refreshAttachmentRefsForResource(scanner.type, row.id, scanner.fields(row));
      resources += result.resources;
      refs += result.refs;
    }
  }
  return { resources, refs };
}

async function saveUploadedImage(file, user = null) {
  if (!file?.buffer?.length) {
    const error = new Error("没有收到图片文件");
    error.status = 400;
    throw error;
  }
  if (file.buffer.length > 8 * 1024 * 1024) {
    const error = new Error("图片不能超过 8MB");
    error.status = 413;
    throw error;
  }

  const declaredType = String(file.contentType || "").split(";")[0].trim().toLowerCase();
  const originalExt = path.extname(file.filename || "").toLowerCase();
  const detected = detectUploadImageType(file.buffer);
  const ext = detected?.ext || uploadImageTypes[declaredType] || (uploadExtensions.has(originalExt) ? originalExt : "");
  const contentType = detected?.contentType || declaredType || uploadExtensions.get(ext) || "application/octet-stream";
  if (!ext) {
    const error = new Error("只支持 JPG、PNG、WEBP、GIF 图片");
    error.status = 415;
    throw error;
  }

  const date = new Date();
  const folder = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}`;
  const dir = path.join(config.uploads.dir, folder);
  fs.mkdirSync(dir, { recursive: true });

  const base = path.basename(file.filename || "image", originalExt).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "image";
  const name = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${base.slice(0, 42)}${ext}`;
  const fullPath = path.join(dir, name);
  await fs.promises.writeFile(fullPath, file.buffer);

  const relativePath = `${folder}/${name}`;
  const asset = {
    url: publicUploadUrl(relativePath),
    filename: name,
    contentType,
    size: file.buffer.length,
    sha256: crypto.createHash("sha256").update(file.buffer).digest("hex")
  };
  await recordMediaAsset(asset, relativePath, user);
  return asset;
}

function adminMoment(row) {
  return {
    ...row,
    tags: parseTags(row.tags),
    created_at: formatPublicDateTime(row.created_at),
    updated_at: row.updated_at ? formatPublicDateTime(row.updated_at) : row.updated_at,
    deleted_at: row.deleted_at ? formatPublicDateTime(row.deleted_at) : row.deleted_at
  };
}

function normalizePostPayload(body, current = {}) {
  const content = String(body.content_md ?? current.content_md ?? "");
  const title = cleanText(body.title || current.title || titleFromMarkdown(content) || "未命名文章", 200);
  return {
    title,
    slug: normalizeSlug(body.slug || current.slug || title, "post"),
    summary: cleanText(body.summary || current.summary || stripMarkdown(content).slice(0, 160), 500),
    content_md: content,
    cover_url: cleanText(body.cover_url || current.cover_url || "", 500),
    status: cleanStatus(body.status, ["draft", "published"], current.status || "draft")
  };
}

function normalizeProjectPayload(body, current = {}) {
  const content = String(body.content_md ?? current.content_md ?? "");
  const name = cleanText(body.name || current.name || titleFromMarkdown(content) || "未命名项目", 120);
  const summary = cleanText(body.summary || current.summary || stripMarkdown(content).slice(0, 220), 500);
  return {
    name,
    slug: normalizeSlug(body.slug || current.slug || name, "project"),
    summary,
    status_text: cleanText(body.status_text || current.status_text || summary || name, 255),
    progress: clampNumber(body.progress ?? current.progress, 0, 100, 0),
    sort_order: clampNumber(body.sort_order ?? current.sort_order, 0, 9999, 0),
    content_md: content,
    cover_url: cleanText(body.cover_url || current.cover_url || "", 500),
    status: cleanStatus(body.status, ["active", "archived"], current.status || "active"),
    last_update: projectUpdateLabel(new Date())
  };
}

function normalizeInterviewPayload(body, current = {}) {
  const content = String(body.content_md ?? current.content_md ?? "");
  const title = cleanText(body.title || current.title || titleFromMarkdown(content) || "未命名面试题", 200);
  const summary = cleanText(body.summary || current.summary || stripMarkdown(content).slice(0, 220), 500);
  const section = cleanInterviewSection(body.section ?? current.section, current.section || "bagu");
  const questionCount = clampNumber(body.question_count ?? current.question_count, 0, 999, section === "daily50" ? 50 : 0);
  const finishedCount = Math.min(questionCount, clampNumber(body.finished_count ?? current.finished_count, 0, 999, 0));
  const tags = body.tagText !== undefined || body.tags !== undefined
    ? tagsFromInput(body.tagText || body.tags)
    : parseTags(current.tags);
  return {
    title,
    slug: normalizeSlug(body.slug || current.slug || title, "interview"),
    section,
    summary,
    content_md: content,
    difficulty: cleanText(body.difficulty || current.difficulty || "", 40),
    tags: JSON.stringify(tags),
    question_count: questionCount,
    finished_count: finishedCount,
    status: cleanStatus(body.status, ["draft", "published"], current.status || "draft"),
    sort_order: clampNumber(body.sort_order ?? current.sort_order, 0, 9999, 0)
  };
}


const interviewDifficultyLabels = ["基础", "进阶", "项目追问", "高频必会"];
const interviewTrainingFieldDefs = [
  { key: "points", label: "核心要点", max: 8 },
  { key: "followUps", label: "追问", max: 6 },
  { key: "interviewerFocus", label: "面试官看点", max: 6 },
  { key: "speechTemplate", label: "60 秒口述模板", max: 8 },
  { key: "commonMistakes", label: "常见错误回答", max: 6 },
  { key: "projectPrompts", label: "项目迁移追问", max: 6 }
];
const defaultInterviewSidebar = {
  plan: [
    { label: "热身", text: "先用今日题单扫一遍基础题。" },
    { label: "模拟", text: "抽 5 题限时口述，答案先隐藏。" },
    { label: "复盘", text: "把不熟和模糊的题留到错题回练。" }
  ],
  focus: ["先讲结论，再补原理和边界", "每题至少准备一个项目迁移说法", "常见错误回答优先避开"],
  review: ["今天不熟的题明天先练", "把追问写进自己的项目表达"],
  experiences: []
};

const interviewPublicQuestionExcludedSources = ["legacy-interview-items", "public-manual-add"];
const publicInterviewQuestionFilter = (alias = "q") =>
  `COALESCE(${alias}.source,'') NOT IN ('${interviewPublicQuestionExcludedSources.join("','")}')`;

let interviewPublicQuestionIndexState = { value: null, expiresAt: 0, promise: null };

function interviewQuestionStableMixedOrder(row = {}) {
  const id = Number(row.id || 0);
  const sortOrder = Number(row.sortOrder || row.sort_order || 0);
  const topicId = Number(row.topicId || row.topic_id || 0);
  return ((id * 1103515245) + (sortOrder * 2654435761) + (topicId * 1013904223)) % 2147483647;
}

async function getInterviewPublicQuestionIndex(force = false) {
  const now = Date.now();
  if (!force && interviewPublicQuestionIndexState.value && interviewPublicQuestionIndexState.expiresAt > now) return interviewPublicQuestionIndexState.value;
  if (!force && interviewPublicQuestionIndexState.promise) return interviewPublicQuestionIndexState.promise;
  interviewPublicQuestionIndexState.promise = (async () => {
    const rows = await query(`SELECT
      q.id,
      q.topic_id,
      q.tags,
      q.difficulty,
      q.source,
      q.sort_order,
      q.updated_at,
      q.created_at,
      t.slug AS topic_slug,
      t.title AS topic_title,
      t.sort_order AS topic_sort_order,
      gl.goal_ids,
      CASE WHEN q.example_case IS NOT NULL THEN 1 ELSE 0 END AS example_case_ready
      FROM interview_questions q
      LEFT JOIN interview_topics t ON t.id=q.topic_id
      LEFT JOIN (
        SELECT question_id, GROUP_CONCAT(goal_id ORDER BY goal_id ASC) AS goal_ids
        FROM interview_goal_question_links
        GROUP BY question_id
      ) gl ON gl.question_id=q.id
      WHERE q.status='published' AND q.deleted_at IS NULL AND ${publicInterviewQuestionFilter("q")}`);
    const value = rows.map((row) => {
      const tags = parseTags(row.tags).map((tag) => cleanText(tag, 40)).filter(Boolean);
      const goalIds = parseIdList(row.goal_ids || row.goalIds);
      return {
        id: Number(row.id || 0),
        topicId: String(row.topic_id || ""),
        topicSlug: row.topic_slug || "",
        topicTitle: row.topic_title || "",
        tags,
        difficulty: cleanInterviewDifficulty(row.difficulty || "", "基础"),
        source: row.source || "",
        sortOrder: Number(row.sort_order || 0),
        topicSortOrder: Number(row.topic_sort_order || 9999),
        updatedAt: row.updated_at ? new Date(row.updated_at).getTime() || 0 : 0,
        createdAt: row.created_at ? new Date(row.created_at).getTime() || 0 : 0,
        goalIds,
        exampleCaseReady: Boolean(Number(row.example_case_ready || 0))
      };
    }).filter((row) => row.id);
    interviewPublicQuestionIndexState = { value, expiresAt: Date.now() + 5 * 60 * 1000, promise: null };
    return value;
  })().catch((error) => {
    interviewPublicQuestionIndexState.promise = null;
    throw error;
  });
  return interviewPublicQuestionIndexState.promise;
}

function filterInterviewPublicQuestionIndex(rows = [], { topic = "", goalFilterIds = [], selectedTags = [], orderMode = "" } = {}) {
  const topicKey = String(topic || "").trim();
  const goalSet = new Set((goalFilterIds || []).map((id) => String(id)));
  const tagSet = (selectedTags || []).map((tag) => cleanText(tag, 40)).filter(Boolean);
  const filtered = rows.filter((row) => {
    if (topicKey && row.topicSlug !== topicKey && row.topicId !== topicKey) return false;
    if (goalSet.size && !row.goalIds.some((id) => goalSet.has(String(id)))) return false;
    if (tagSet.length && !tagSet.every((tag) => row.tags.includes(tag))) return false;
    return true;
  });
  const mixed = orderMode === "mixed" || goalSet.size || tagSet.length;
  return filtered.sort((a, b) => {
    if (mixed) return interviewQuestionStableMixedOrder(a) - interviewQuestionStableMixedOrder(b) || a.id - b.id;
    return a.topicSortOrder - b.topicSortOrder
      || a.sortOrder - b.sortOrder
      || b.updatedAt - a.updatedAt
      || b.id - a.id;
  });
}

function cleanInterviewDifficulty(value = "", fallback = "基础") {
  const text = cleanText(value || "", 40);
  if (interviewDifficultyLabels.includes(text)) return text;
  if (/高频|必会|重点/.test(text)) return "高频必会";
  if (/项目|追问/.test(text)) return "项目追问";
  if (/进阶|中等|提高/.test(text)) return "进阶";
  if (/基础|简单|入门/.test(text)) return "基础";
  return fallback;
}

function cleanInterviewTrainingList(value, max = 6) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/\r?\n|[；;]/u);
  return raw.map((item) => cleanText(item, 180)).filter(Boolean).slice(0, max);
}

function cleanLongText(value = "", maxLength = 8000) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeInterviewAnswerMeta(value = {}) {
  const parsed = value && typeof value === "object" && !Array.isArray(value) ? value : parseJsonObject(value, {});
  const meta = {};
  for (const field of interviewTrainingFieldDefs) meta[field.key] = cleanInterviewTrainingList(parsed[field.key], field.max);
  meta.difficulty = cleanInterviewDifficulty(parsed.difficulty || "", "基础");
  return meta;
}

function normalizeInterviewExampleCase(value = {}) {
  const parsed = value && typeof value === "object" && !Array.isArray(value) ? value : parseJsonObject(value, {});
  const normalized = {
    title: cleanText(parsed.title || parsed.name || "实例拆解", 80),
    example: cleanMultilineText(parsed.example || parsed.case || parsed.scene || "", 700),
    solution: cleanMultilineText(parsed.solution || parsed.fix || parsed.method || "", 700),
    cause: cleanMultilineText(parsed.cause || parsed.reason || parsed.analysis || "", 700),
    summary: cleanMultilineText(parsed.summary || parsed.conclusion || parsed.takeaway || "", 500)
  };
  return normalized.example && normalized.solution && normalized.cause && normalized.summary ? normalized : null;
}

function interviewQuestionExampleSourceHash(row = {}) {
  const payload = {
    title: row.title || row.question || "",
    answer: stripMarkdown(row.answer_md || row.answer || "").slice(0, 5000),
    tags: parseTags(row.tags).slice(0, 12),
    difficulty: cleanInterviewDifficulty(row.difficulty || "", "基础"),
    topic: [row.topic_slug || row.topicSlug || "", row.topic_title || row.topicTitle || ""].filter(Boolean).join("/"),
    goals: parseIdList(row.goal_ids || row.goalIds).slice(0, 24)
  };
  return crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex");
}

function publicInterviewExampleCase(row = {}) {
  const exampleCase = normalizeInterviewExampleCase(row.example_case || row.exampleCase || {});
  const sourceHash = interviewQuestionExampleSourceHash(row);
  const storedHash = String(row.example_case_source_hash || row.exampleCaseSourceHash || "");
  const provider = String(row.example_case_provider || row.exampleCaseProvider || "");
  const model = String(row.example_case_model || row.exampleCaseModel || "");
  const trustedLocalCase = provider === "local-direct" || provider === "local-unique" || provider === "codex-local" ||
    model === "structured-bank-v2" || model === "server-unique-example-v2" || model === "codex-curated-single-v1";
  const ready = Boolean(exampleCase && ((storedHash && storedHash === sourceHash) || trustedLocalCase));
  return {
    exampleCase: ready ? exampleCase : null,
    exampleCaseReady: ready,
    exampleCaseUpdatedAt: row.example_case_updated_at || row.exampleCaseUpdatedAt || "",
    exampleCaseError: row.example_case_error || row.exampleCaseError || ""
  };
}

function interviewAnswerMetaFromPayload(body = {}, current = {}) {
  const base = normalizeInterviewAnswerMeta(body.answer_points ?? body.answerPoints ?? current.answer_points ?? current.answerPoints ?? {});
  for (const field of interviewTrainingFieldDefs) {
    const textKey = field.key + "Text";
    if (body[field.key] !== undefined || body[textKey] !== undefined) {
      base[field.key] = cleanInterviewTrainingList(body[field.key] ?? body[textKey], field.max);
    }
  }
  base.difficulty = cleanInterviewDifficulty(body.difficulty ?? base.difficulty ?? current.difficulty, base.difficulty || "基础");
  return base;
}

function interviewTrainingMissing(meta = {}) {
  const normalized = normalizeInterviewAnswerMeta(meta);
  return interviewTrainingFieldDefs.filter((field) => !normalized[field.key].length).map((field) => field.label);
}

function publicInterviewDailyQuestion(row = {}, position = 1) {
  const meta = normalizeInterviewAnswerMeta(row.answer_points || row.answerPoints || {});
  const topicTitle = row.topic_title || row.topicTitle || row.category || "面试题";
  const tags = parseTags(row.tags);
  const goals = publicInterviewQuestionGoals(row);
  const starRating = Math.max(0, Math.min(5, Number(row.star_rating || 0)));
  return {
    questionId: row.slug || String(row.id || position),
    questionKey: row.slug || String(row.id || position),
    id: row.id || null,
    number: Number(row.position || row.number || position),
    category: topicTitle,
    tag: tags[0] || row.source || row.topic_slug || "",
    tags,
    knowledgePoint: tags[0] || goals[0]?.title || topicTitle,
    question: row.title || row.question || "",
    answer: cleanText(stripMarkdown(row.answer_md || row.answer || ""), 4000),
    points: meta.points,
    followUps: meta.followUps,
    interviewerFocus: meta.interviewerFocus,
    speechTemplate: meta.speechTemplate,
    commonMistakes: meta.commonMistakes,
    projectPrompts: meta.projectPrompts,
    difficulty: cleanInterviewDifficulty(row.difficulty || meta.difficulty, meta.difficulty),
    goalIds: parseIdList(row.goal_ids || row.goalIds),
    goals,
    ...publicInterviewExampleCase(row),
    markers: {
      starRating,
      isDifficult: Boolean(row.is_difficult),
      isCommon: Boolean(row.is_common),
      inCollection: Boolean(row.in_collection),
      markerNote: row.marker_note || ""
    }
  };
}

function publicInterviewQuestionListItem(row = {}, position = 1) {
  const topicTitle = row.topic_title || row.topicTitle || row.category || "面试题";
  const tags = parseTags(row.tags);
  const goals = publicInterviewQuestionGoals(row);
  const starRating = Math.max(0, Math.min(5, Number(row.star_rating || 0)));
  const exampleMeta = publicInterviewExampleCase(row);
  return {
    questionId: row.slug || String(row.id || position),
    questionKey: row.slug || String(row.id || position),
    id: row.id || null,
    number: Number(row.position || row.number || position),
    category: topicTitle,
    tag: tags[0] || row.source || row.topic_slug || "",
    tags,
    knowledgePoint: tags[0] || goals[0]?.title || topicTitle,
    question: row.title || row.question || "",
    answer: "",
    points: [],
    followUps: [],
    interviewerFocus: [],
    speechTemplate: [],
    commonMistakes: [],
    projectPrompts: [],
    difficulty: cleanInterviewDifficulty(row.difficulty || "", "基础"),
    goalIds: parseIdList(row.goal_ids || row.goalIds),
    goals,
    ...exampleMeta,
    detailReady: false,
    markers: {
      starRating,
      isDifficult: Boolean(row.is_difficult),
      isCommon: Boolean(row.is_common),
      inCollection: Boolean(row.in_collection),
      markerNote: row.marker_note || ""
    }
  };
}

async function ensureManualInterviewTopic(title = "手动添加") {
  const cleanTitle = cleanText(title || "手动添加", 80) || "手动添加";
  const asciiSlug = cleanTitle
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  const slug = asciiSlug || `manual-${privacyHash(cleanTitle).slice(0, 10)}`;
  const existing = await getOne("SELECT * FROM interview_topics WHERE slug=:slug LIMIT 1", { slug });
  if (existing) {
    if (existing.title !== cleanTitle) {
      await query("UPDATE interview_topics SET title=:title, visible=1, deleted_at=NULL, updated_at=NOW() WHERE id=:id", { id: existing.id, title: cleanTitle });
      return { ...existing, title: cleanTitle };
    }
    return existing;
  }
  const result = await query("INSERT INTO interview_topics(slug,title,description,sort_order,visible,created_at,updated_at) VALUES(:slug,:title,:description,90,1,NOW(),NOW())", {
    slug,
    title: cleanTitle,
    description: "前台手动添加的面试题"
  });
  return getOne("SELECT * FROM interview_topics WHERE id=:id", { id: result.insertId });
}

function shanghaiDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function questionIdPlaceholders(ids) {
  const params = {};
  const placeholders = ids.map((id, index) => {
    params["id" + index] = id;
    return ":id" + index;
  });
  return { params, sql: placeholders.join(",") };
}

function publicInterviewSet(row = {}) {
  return {
    id: row.id || null,
    date: row.day_date || row.date || "",
    title: row.title || "每日 50 问",
    subtitle: row.subtitle || "从后台题库发布的模拟面试题单。",
    published: row.status === "published",
    total: parseJsonArray(row.question_ids).length,
    generationStatus: row.generation_status || "",
    generatedAt: row.generated_at || row.generatedAt || null
  };
}

const interviewTopicDefaults = [
  { slug: "bagu", title: "\u516b\u80a1\u6587\u4e13\u533a", description: "Java\u3001\u524d\u7aef\u3001\u6570\u636e\u5e93\u3001\u7cfb\u7edf\u8bbe\u8ba1\u7b49\u9ad8\u9891\u57fa\u7840\u9898\u3002", sort_order: 10 },
  { slug: "experience", title: "\u9762\u7ecf\u590d\u76d8", description: "\u516c\u53f8\u8f6e\u6b21\u3001\u9898\u76ee\u590d\u76d8\u3001\u8868\u73b0\u603b\u7ed3\u548c\u6539\u8fdb\u8ba1\u5212\u3002", sort_order: 20 },
  { slug: "daily50", title: "\u6bcf\u65e5 50 \u9898", description: "\u6309\u5929\u63a8\u8fdb\u7684\u5237\u9898\u6e05\u5355\u548c\u77e5\u8bc6\u70b9\u56de\u987e\u3002", sort_order: 30 }
];

const interviewGoalStatusLabels = {
  planned: "计划中",
  doing: "进行中",
  review: "复盘中",
  mastered: "已掌握"
};

const interviewGoalDefaults = [
  { slug: "robotics", title: "机器人", summary: "把基础、运动、感知、控制和项目实战串成一张长期路线图。", status: "doing", sort_order: 10, accent: "#e95f98", icon: "root" },
  { slug: "foundation", parent: "robotics", title: "基础", summary: "语言、系统、计基和电机控制的底座。", status: "doing", sort_order: 10, accent: "#e95f98", icon: "base" },
  { slug: "motion", parent: "robotics", title: "运动", summary: "运动学、动力学、轨迹规划和控制器。", status: "planned", sort_order: 20, accent: "#f0a35a", icon: "motion" },
  { slug: "perception", parent: "robotics", title: "感知", summary: "相机、IMU、LiDAR、SLAM 和多传感器融合。", status: "planned", sort_order: 30, accent: "#6f9df6", icon: "eye" },
  { slug: "embedded-control", parent: "robotics", title: "控制与嵌入式", summary: "MCU、RTOS、通信协议和驱动调试。", status: "doing", sort_order: 40, accent: "#77bfa3", icon: "chip" },
  { slug: "robot-projects", parent: "robotics", title: "项目实战", summary: "ROS2、仿真、本体调试和作品集表达。", status: "review", sort_order: 50, accent: "#b981e8", icon: "project" },
  { slug: "other", parent: "robotics", title: "其他", summary: "未分类题目、临时错题和后续再整理的支线。", status: "planned", sort_order: 99, accent: "#9aa1ad", icon: "other" },
  { slug: "linux", parent: "foundation", title: "Ubuntu", summary: "Ubuntu 环境、ROS 开发依赖、命令行、进程网络和机器人调试基础。", status: "doing", sort_order: 10, accent: "#e95f98", icon: "linux" },
  { slug: "cpp", parent: "foundation", title: "C++", summary: "语言基础、STL、内存模型、并发和工程实践。", status: "doing", sort_order: 20, accent: "#e95f98", icon: "cpp" },
  { slug: "python", parent: "foundation", title: "Python", summary: "脚本效率、数据处理、工具链和机器人辅助开发。", status: "planned", sort_order: 30, accent: "#e95f98", icon: "python" },
  { slug: "cs-basics", parent: "foundation", title: "数据结构与计基", summary: "网络、操作系统、算法和常见面试基础。", status: "doing", sort_order: 40, accent: "#e95f98", icon: "cs" },
  { slug: "motor-basics", parent: "foundation", title: "电机基础", summary: "电机类型、驱动器、编码器和控制链路。", status: "planned", sort_order: 50, accent: "#e95f98", icon: "motor" },
  { slug: "foc", parent: "foundation", title: "FOC", summary: "从电机模型到电流环、速度环、位置环的闭环控制。", status: "doing", sort_order: 60, accent: "#e95f98", icon: "foc" },
  { slug: "motor-model", parent: "foc", title: "电机模型", summary: "PMSM/BLDC 模型、坐标系和电磁转矩。", status: "planned", sort_order: 10, accent: "#e95f98", icon: "model" },
  { slug: "clarke-park", parent: "foc", title: "Clarke/Park 变换", summary: "三相到两相、静止到旋转坐标系的数学链路。", status: "planned", sort_order: 20, accent: "#e95f98", icon: "math" },
  { slug: "svpwm", parent: "foc", title: "SVPWM", summary: "扇区判断、矢量作用时间和调制输出。", status: "planned", sort_order: 30, accent: "#e95f98", icon: "wave" },
  { slug: "current-loop", parent: "foc", title: "电流环", summary: "采样、PI、解耦和保护。", status: "planned", sort_order: 40, accent: "#e95f98", icon: "i" },
  { slug: "speed-loop", parent: "foc", title: "速度环", summary: "速度估计、PI 参数和动态响应。", status: "planned", sort_order: 50, accent: "#e95f98", icon: "v" },
  { slug: "position-loop", parent: "foc", title: "位置环", summary: "位置反馈、规划接口和稳定性。", status: "planned", sort_order: 60, accent: "#e95f98", icon: "p" },
  { slug: "foc-tuning", parent: "foc", title: "调参与保护", summary: "限流、过压、堵转、温升和调参流程。", status: "planned", sort_order: 70, accent: "#e95f98", icon: "safe" },
  { slug: "kinematics", parent: "motion", title: "运动学", summary: "正逆运动学、坐标变换和约束。", status: "planned", sort_order: 10, accent: "#f0a35a", icon: "axis" },
  { slug: "dynamics", parent: "motion", title: "动力学", summary: "力、惯量、关节动力学和建模。", status: "planned", sort_order: 20, accent: "#f0a35a", icon: "force" },
  { slug: "trajectory", parent: "motion", title: "轨迹规划", summary: "插值、速度曲线、避障和时间参数化。", status: "planned", sort_order: 30, accent: "#f0a35a", icon: "path" },
  { slug: "motion-controller", parent: "motion", title: "控制器", summary: "PID、MPC、状态反馈和稳定性。", status: "planned", sort_order: 40, accent: "#f0a35a", icon: "ctrl" },
  { slug: "chassis-gait", parent: "motion", title: "底盘/步态", summary: "轮式底盘、腿式步态和运动约束。", status: "planned", sort_order: 50, accent: "#f0a35a", icon: "gait" },
  { slug: "camera", parent: "perception", title: "相机", summary: "成像模型、标定、深度和视觉输入。", status: "planned", sort_order: 10, accent: "#6f9df6", icon: "cam" },
  { slug: "imu", parent: "perception", title: "IMU", summary: "姿态估计、噪声模型和融合。", status: "planned", sort_order: 20, accent: "#6f9df6", icon: "imu" },
  { slug: "lidar", parent: "perception", title: "LiDAR", summary: "点云、建图、匹配和定位。", status: "planned", sort_order: 30, accent: "#6f9df6", icon: "lidar" },
  { slug: "slam", parent: "perception", title: "SLAM", summary: "前端、后端、回环和地图管理。", status: "planned", sort_order: 40, accent: "#6f9df6", icon: "slam" },
  { slug: "vision-ai", parent: "perception", title: "视觉识别", summary: "目标检测、分割、跟踪和部署。", status: "planned", sort_order: 50, accent: "#6f9df6", icon: "vision" },
  { slug: "sensor-fusion", parent: "perception", title: "传感器融合", summary: "时空同步、滤波和多源状态估计。", status: "planned", sort_order: 60, accent: "#6f9df6", icon: "fusion" },
  { slug: "stm32", parent: "embedded-control", title: "STM32", summary: "外设、启动、时钟、中断和工程结构。", status: "doing", sort_order: 10, accent: "#77bfa3", icon: "stm32" },
  { slug: "rtos", parent: "embedded-control", title: "RTOS", summary: "任务、调度、同步和实时性。", status: "planned", sort_order: 20, accent: "#77bfa3", icon: "rtos" },
  { slug: "bus-protocols", parent: "embedded-control", title: "CAN/I2C/SPI/UART", summary: "总线协议、时序、错误处理和调试。", status: "doing", sort_order: 30, accent: "#77bfa3", icon: "bus" },
  { slug: "driver-debug", parent: "embedded-control", title: "驱动调试", summary: "寄存器、逻辑分析仪、日志和问题定位。", status: "doing", sort_order: 40, accent: "#77bfa3", icon: "debug" },
  { slug: "communication", parent: "embedded-control", title: "通信协议", summary: "上位机、设备协议、数据帧和可靠传输。", status: "planned", sort_order: 50, accent: "#77bfa3", icon: "net" },
  { slug: "ros2", parent: "robot-projects", title: "ROS2", summary: "节点、话题、服务、launch 和工程组织。", status: "review", sort_order: 10, accent: "#b981e8", icon: "ros" },
  { slug: "simulation", parent: "robot-projects", title: "仿真", summary: "URDF/SDF、Gazebo、控制插件和测试场景。", status: "planned", sort_order: 20, accent: "#b981e8", icon: "sim" },
  { slug: "robot-body", parent: "robot-projects", title: "机器人本体", summary: "结构、电气、控制板和整机调试。", status: "planned", sort_order: 30, accent: "#b981e8", icon: "bot" },
  { slug: "debug-log", parent: "robot-projects", title: "调试记录", summary: "把问题、现象、定位过程和修复沉淀下来。", status: "review", sort_order: 40, accent: "#b981e8", icon: "log" },
  { slug: "portfolio", parent: "robot-projects", title: "作品集表达", summary: "项目亮点、指标、复盘和面试表达。", status: "planned", sort_order: 50, accent: "#b981e8", icon: "portfolio" }
];

function parseIdList(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(raw.map((item) => cleanId(item)).filter(Boolean))];
}

function publicInterviewGoalNode(row = {}) {
  const manualProgress = clampNumber(row.manual_progress ?? row.manualProgress, 0, 100, 0);
  const questionCount = Number(row.question_count ?? row.questionCount ?? 0);
  const completedCount = Number(row.completed_count ?? row.completedCount ?? 0);
  const autoProgress = questionCount ? Math.round((completedCount / questionCount) * 100) : 0;
  const status = cleanStatus(row.status, ["planned", "doing", "review", "mastered"], "planned");
  return {
    id: row.id,
    parentId: row.parent_id || row.parentId || null,
    slug: row.slug,
    title: row.title,
    summary: row.summary || "",
    status,
    statusLabel: interviewGoalStatusLabels[status] || status,
    targetCount: Number(row.target_count ?? row.targetCount ?? 0),
    manualProgress,
    autoProgress,
    displayProgress: questionCount ? autoProgress : manualProgress,
    questionCount,
    completedCount,
    weakCount: Number(row.weak_count ?? row.weakCount ?? 0),
    mistakeCount: Number(row.mistake_count ?? row.mistakeCount ?? 0),
    directQuestionCount: questionCount,
    directCompletedCount: completedCount,
    directWeakCount: Number(row.weak_count ?? row.weakCount ?? 0),
    updateCount: Number(row.update_count ?? row.updateCount ?? 0),
    sortOrder: Number(row.sort_order || row.sortOrder || 0),
    visible: row.visible === undefined ? true : Boolean(row.visible),
    accent: row.accent || "#e95f98",
    icon: row.icon || "",
    children: [],
    updatedAt: row.updated_at || row.updatedAt || ""
  };
}

function publicInterviewGoalUpdate(row = {}) {
  const type = cleanStatus(row.type, ["progress", "mistake", "note"], "note");
  return {
    id: row.id,
    goalId: row.goal_id || row.goalId || null,
    goalTitle: row.goal_title || row.goalTitle || "",
    type,
    title: row.title || "",
    body_md: row.body_md || "",
    body_html: row.body_html || "",
    bodyHtml: row.body_html || "",
    relatedQuestionId: row.related_question_id || row.relatedQuestionId || null,
    relatedQuestionTitle: row.related_question_title || row.relatedQuestionTitle || "",
    status: row.status || "published",
    happenedAt: row.happened_at || row.happenedAt || "",
    sortOrder: Number(row.sort_order || row.sortOrder || 0),
    createdAt: row.created_at || row.createdAt || "",
    updatedAt: row.updated_at || row.updatedAt || ""
  };
}

function normalizeInterviewGoalPayload(body = {}, current = {}) {
  const title = cleanText(body.title || current.title || "未命名目标", 200);
  return {
    parent_id: cleanId(body.parent_id ?? body.parentId ?? current.parent_id) || null,
    slug: normalizeSlug(body.slug || current.slug || title, "goal"),
    title,
    summary: cleanText(body.summary ?? current.summary ?? "", 500),
    status: cleanStatus(body.status, ["planned", "doing", "review", "mastered"], current.status || "planned"),
    target_count: clampNumber(body.target_count ?? body.targetCount ?? current.target_count, 0, 9999, 0),
    manual_progress: clampNumber(body.manual_progress ?? body.manualProgress ?? current.manual_progress, 0, 100, 0),
    sort_order: clampNumber(body.sort_order ?? body.sortOrder ?? current.sort_order, 0, 9999, 0),
    visible: body.visible === undefined ? Number(current.visible ?? 1) : (body.visible ? 1 : 0),
    accent: cleanText(body.accent ?? current.accent ?? "", 40),
    icon: cleanText(body.icon ?? current.icon ?? "", 40)
  };
}

function normalizeInterviewGoalUpdatePayload(body = {}, current = {}) {
  const bodyMd = String(body.body_md ?? body.bodyMd ?? current.body_md ?? "");
  const title = cleanText(body.title || current.title || titleFromMarkdown(bodyMd) || "未命名记录", 220);
  return {
    goal_id: cleanId(body.goal_id ?? body.goalId ?? current.goal_id) || null,
    type: cleanStatus(body.type, ["progress", "mistake", "note"], current.type || "note"),
    title,
    body_md: bodyMd,
    body_html: markdownToHtml(bodyMd),
    related_question_id: cleanId(body.related_question_id ?? body.relatedQuestionId ?? current.related_question_id) || null,
    status: cleanStatus(body.status, ["draft", "published"], current.status || "published"),
    happened_at: cleanDateValue(body.happened_at ?? body.happenedAt ?? current.happened_at) || shanghaiDate(),
    sort_order: clampNumber(body.sort_order ?? body.sortOrder ?? current.sort_order, 0, 9999, 0)
  };
}

async function seedInterviewGoalDefaults() {
  const existing = await getOne("SELECT COUNT(*) AS count FROM interview_goal_nodes");
  if (Number(existing?.count || 0) > 0) return;
  const idBySlug = new Map();
  for (const item of interviewGoalDefaults) {
    const parentId = item.parent ? idBySlug.get(item.parent) || null : null;
    const result = await query(`INSERT INTO interview_goal_nodes
      (parent_id,slug,title,summary,status,target_count,manual_progress,sort_order,visible,accent,icon,created_at,updated_at,deleted_at)
      VALUES(:parent_id,:slug,:title,:summary,:status,:target_count,:manual_progress,:sort_order,1,:accent,:icon,NOW(),NOW(),NULL)`, {
      parent_id: parentId,
      slug: item.slug,
      title: item.title,
      summary: item.summary || "",
      status: item.status || "planned",
      target_count: item.target_count || 0,
      manual_progress: item.manual_progress || 0,
      sort_order: item.sort_order || 0,
      accent: item.accent || "",
      icon: item.icon || ""
    });
    idBySlug.set(item.slug, result.insertId);
  }
}

async function attachInterviewGoalIds(rows = []) {
  const items = Array.isArray(rows) ? rows : [rows].filter(Boolean);
  const ids = items.map((row) => cleanId(row.id)).filter(Boolean);
  if (!ids.length) return rows;
  const { params, sql } = questionIdPlaceholders(ids);
  const links = await query(`SELECT l.question_id,
    GROUP_CONCAT(l.goal_id ORDER BY l.is_primary DESC, l.goal_id ASC) AS goal_ids,
    GROUP_CONCAT(g.slug ORDER BY l.is_primary DESC, l.goal_id ASC) AS goal_slugs,
    GROUP_CONCAT(g.title ORDER BY l.is_primary DESC, l.goal_id ASC SEPARATOR '|||') AS goal_titles
    FROM interview_goal_question_links l
    LEFT JOIN interview_goal_nodes g ON g.id=l.goal_id
    WHERE l.question_id IN (${sql})
    GROUP BY l.question_id`, params);
  const byQuestion = new Map(links.map((row) => [String(row.question_id), row]));
  for (const row of items) {
    const link = byQuestion.get(String(row.id)) || {};
    row.goal_ids = link.goal_ids || "";
    row.goal_slugs = link.goal_slugs || "";
    row.goal_titles = link.goal_titles || "";
  }
  return rows;
}

function publicInterviewQuestionGoals(row = {}) {
  const ids = parseIdList(row.goal_ids || row.goalIds);
  const slugs = String(row.goal_slugs || row.goalSlugs || "").split(",").map((item) => item.trim());
  const titles = String(row.goal_titles || row.goalTitles || "").split("|||").map((item) => item.trim());
  return ids.map((id, index) => ({
    id,
    slug: slugs[index] || "",
    title: titles[index] || ""
  }));
}

async function syncInterviewQuestionGoalLinks(questionId, goalIds = []) {
  const id = cleanId(questionId);
  if (!id) return;
  const cleanGoalIds = parseIdList(goalIds);
  await query("DELETE FROM interview_goal_question_links WHERE question_id=:question_id", { question_id: id });
  for (const [index, goalId] of cleanGoalIds.entries()) {
    await query("INSERT IGNORE INTO interview_goal_question_links(goal_id,question_id,is_primary,created_at) VALUES(:goal_id,:question_id,:is_primary,NOW())", {
      goal_id: goalId,
      question_id: id,
      is_primary: index === 0 ? 1 : 0
    });
  }
}

const interviewGoalKeywordRules = [
  { slug: "linux", keywords: ["linux", "ssh", "nginx", "docker", "容器", "端口", "命令", "进程", "服务器", "部署", "日志", "权限"] },
  { slug: "cpp", keywords: ["c++", "cpp", "stl", "指针", "引用", "内存", "析构", "虚函数", "右值", "模板", "智能指针"] },
  { slug: "python", keywords: ["python", "脚本", "pandas", "爬虫", "自动化", "fastapi", "flask"] },
  { slug: "cs-basics", keywords: ["http", "https", "tcp", "udp", "url", "浏览器", "缓存", "网络", "数据库", "mysql", "redis", "索引", "事务", "线程", "进程", "操作系统", "算法", "数据结构"] },
  { slug: "foc", keywords: ["foc", "pmsm", "bldc", "电机", "svpwm", "park", "clarke", "电流环", "速度环", "位置环"] },
  { slug: "motor-model", keywords: ["电机模型", "pmsm", "bldc", "转矩", "反电动势", "dq"] },
  { slug: "clarke-park", keywords: ["clarke", "park", "坐标变换", "三相", "两相", "dq"] },
  { slug: "svpwm", keywords: ["svpwm", "扇区", "矢量", "占空比", "调制"] },
  { slug: "current-loop", keywords: ["电流环", "采样", "pi", "解耦", "限流"] },
  { slug: "speed-loop", keywords: ["速度环", "速度估计", "转速", "测速"] },
  { slug: "position-loop", keywords: ["位置环", "位置控制", "编码器", "轨迹跟随"] },
  { slug: "foc-tuning", keywords: ["调参", "保护", "过流", "过压", "堵转", "温升"] },
  { slug: "bus-protocols", keywords: ["i2c", "spi", "uart", "can", "rs485", "总线", "协议", "ack", "仲裁"] },
  { slug: "rtos", keywords: ["rtos", "freertos", "任务", "调度", "信号量", "队列", "中断"] },
  { slug: "stm32", keywords: ["stm32", "mcu", "外设", "寄存器", "时钟", "gpio", "dma"] },
  { slug: "driver-debug", keywords: ["驱动", "调试", "逻辑分析仪", "示波器", "排查", "寄存器"] },
  { slug: "kinematics", keywords: ["运动学", "逆解", "正解", "坐标变换", "雅可比"] },
  { slug: "dynamics", keywords: ["动力学", "惯量", "力矩", "拉格朗日", "牛顿欧拉"] },
  { slug: "trajectory", keywords: ["轨迹", "规划", "插值", "避障", "路径"] },
  { slug: "motion-controller", keywords: ["pid", "mpc", "控制器", "稳定性", "状态反馈"] },
  { slug: "chassis-gait", keywords: ["底盘", "步态", "轮式", "腿式", "里程计"] },
  { slug: "camera", keywords: ["相机", "视觉", "成像", "标定", "深度"] },
  { slug: "imu", keywords: ["imu", "姿态", "陀螺仪", "加速度计"] },
  { slug: "lidar", keywords: ["lidar", "雷达", "点云"] },
  { slug: "slam", keywords: ["slam", "定位", "建图", "回环"] },
  { slug: "vision-ai", keywords: ["视觉识别", "目标检测", "分割", "跟踪", "部署"] },
  { slug: "sensor-fusion", keywords: ["融合", "滤波", "kalman", "ekf", "同步"] },
  { slug: "ros2", keywords: ["ros", "ros2", "节点", "话题", "launch"] },
  { slug: "simulation", keywords: ["仿真", "gazebo", "urdf", "sdf"] },
  { slug: "robot-body", keywords: ["本体", "结构", "电气", "整机", "联调"] },
  { slug: "debug-log", keywords: ["调试记录", "现象", "定位过程", "复盘", "修复"] },
  { slug: "portfolio", keywords: ["项目", "面试", "复盘", "表达", "作品集", "经历", "简历"] }
];

function interviewQuestionSearchText(row = {}) {
  return [
    row.goalSlug,
    row.knowledgePoint,
    row.title,
    row.question,
    row.summary,
    row.answer_md,
    row.answer,
    row.category,
    row.topic_title,
    row.topicTitle,
    row.topic_slug,
    row.source,
    ...parseTags(row.tags || row.tag || row.tagText)
  ].filter(Boolean).join(" ").toLowerCase();
}

function inferInterviewGoalIdsFromRows(row = {}, goalRows = []) {
  const bySlug = new Map(goalRows.map((goal) => [String(goal.slug || "").toLowerCase(), goal]));
  const explicitSlug = cleanText(row.goalSlug || row.goal_slug || "", 180).toLowerCase();
  if (explicitSlug && bySlug.has(explicitSlug)) return [Number(bySlug.get(explicitSlug).id)].filter(Boolean);
  const text = interviewQuestionSearchText(row);
  const matches = interviewGoalKeywordRules
    .filter((rule) => bySlug.has(rule.slug) && rule.keywords.some((keyword) => text.includes(keyword.toLowerCase())))
    .map((rule) => bySlug.get(rule.slug))
    .filter(Boolean);
  const picked = matches.length ? matches : [bySlug.get("other")].filter(Boolean);
  return [...new Set(picked.map((goal) => Number(goal.id)).filter(Boolean))].slice(0, 3);
}
async function inferInterviewGoalIds(row = {}) {
  const goals = await query("SELECT id, slug, title FROM interview_goal_nodes WHERE visible=1 AND deleted_at IS NULL");
  return inferInterviewGoalIdsFromRows(row, goals);
}

let interviewGoalBackfillCheckedAt = 0;
async function ensureInterviewQuestionGoalBackfill(force = false) {
  if (!databaseAvailable) return { updated: 0 };
  const now = Date.now();
  if (!force && now - interviewGoalBackfillCheckedAt < 60000) return { skipped: true, updated: 0 };
  interviewGoalBackfillCheckedAt = now;
  const goals = await query("SELECT id, slug, title FROM interview_goal_nodes WHERE visible=1 AND deleted_at IS NULL");
  if (!goals.length) return { updated: 0 };
  const rows = await query(`SELECT q.id, q.slug, q.title, q.summary, q.answer_md, q.source, q.tags, t.slug AS topic_slug, t.title AS topic_title
    FROM interview_questions q
    LEFT JOIN interview_topics t ON t.id=q.topic_id
    LEFT JOIN interview_goal_question_links l ON l.question_id=q.id
    WHERE q.status='published' AND q.deleted_at IS NULL AND ${publicInterviewQuestionFilter("q")} AND l.id IS NULL
    ORDER BY q.updated_at DESC, q.id DESC
    LIMIT 240`);
  let updated = 0;
  for (const row of rows) {
    const goalIds = inferInterviewGoalIdsFromRows(row, goals);
    if (goalIds.length) {
      await syncInterviewQuestionGoalLinks(row.id, goalIds);
      updated += 1;
    }
  }
  return { updated };
}

function publicInterviewTopic(row = {}) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description || "",
    sortOrder: Number(row.sort_order || row.sortOrder || 0),
    visible: Boolean(row.visible),
    questionCount: Number(row.question_count || row.questionCount || 0),
    publishedQuestionCount: Number(row.published_question_count || row.publishedQuestionCount || 0),
    updatedAt: row.updated_at || row.updatedAt || ""
  };
}

function publicInterviewQuestion(row = {}) {
  const meta = normalizeInterviewAnswerMeta(row.answer_points || row.answerPoints || {});
  const difficulty = cleanInterviewDifficulty(row.difficulty || meta.difficulty, meta.difficulty);
  const missing = interviewTrainingMissing(meta);
  return {
    id: row.id,
    topicId: row.topic_id || row.topicId || null,
    topicSlug: row.topic_slug || row.topicSlug || "",
    topicTitle: row.topic_title || row.topicTitle || "",
    slug: row.slug,
    title: row.title,
    summary: row.summary || "",
    answer_md: row.answer_md,
    answer_html: row.answer_html,
    answerHtml: row.answer_html,
    answer_points: meta,
    answerPoints: meta,
    points: meta.points,
    followUps: meta.followUps,
    interviewerFocus: meta.interviewerFocus,
    speechTemplate: meta.speechTemplate,
    commonMistakes: meta.commonMistakes,
    projectPrompts: meta.projectPrompts,
    trainingMissing: missing,
    trainingComplete: missing.length === 0,
    difficulty,
    source: row.source || "",
    tags: parseTags(row.tags),
    goalIds: parseIdList(row.goal_ids || row.goalIds),
    goals: publicInterviewQuestionGoals(row),
    ...publicInterviewExampleCase(row),
    status: row.status || "draft",
    sortOrder: Number(row.sort_order || row.sortOrder || 0),
    reviewedAt: row.reviewed_at || row.reviewedAt || "",
    createdAt: row.created_at || row.createdAt || "",
    updatedAt: row.updated_at || row.updatedAt || ""
  };
}

function publicInterviewReview(row = {}) {
  return {
    id: row.id,
    companyAlias: row.company_alias || row.companyAlias || "",
    positionName: row.position_name || row.positionName || "",
    interviewRound: row.interview_round || row.interviewRound || "",
    happenedAt: row.happened_at || row.happenedAt || "",
    resultStatus: row.result_status || row.resultStatus || "",
    summary_md: row.summary_md || "",
    summary_html: row.summary_html || "",
    summaryHtml: row.summary_html || "",
    improvement_md: row.improvement_md || "",
    improvement_html: row.improvement_html || "",
    improvementHtml: row.improvement_html || "",
    status: row.status || "draft",
    sortOrder: Number(row.sort_order || row.sortOrder || 0),
    createdAt: row.created_at || row.createdAt || "",
    updatedAt: row.updated_at || row.updatedAt || ""
  };
}

function fallbackInterviewTopicItems({ visibleOnly = false } = {}) {
  const items = fallbackInterviewTopics
    .filter((item) => !visibleOnly || item.visible)
    .map((item) => publicInterviewTopic(cloneFallback(item)));
  return { items, source: "local-preview" };
}

function fallbackInterviewQuestionItems({ topic = "", status = "", q = "" } = {}) {
  const topicKey = String(topic || "").trim().toLowerCase();
  const statusKey = String(status || "").trim().toLowerCase();
  const keyword = String(q || "").trim().toLowerCase();
  const items = fallbackInterviewQuestions
    .filter((item) => !topicKey || String(item.topic_id) === topicKey || String(item.topic_slug || "").toLowerCase() === topicKey)
    .filter((item) => !statusKey || item.status === statusKey)
    .filter((item) => !keyword || `${item.title} ${item.summary} ${item.answer_md}`.toLowerCase().includes(keyword))
    .map((item) => publicInterviewQuestion({ ...cloneFallback(item), answer_html: markdownToHtml(item.answer_md || "") }));
  return { items, source: "local-preview" };
}

function fallbackInterviewQuestionDetail(key = "") {
  const row = fallbackInterviewQuestions.find((item) => String(item.id) === String(key) || item.slug === key);
  return row ? publicInterviewQuestion({ ...cloneFallback(row), answer_html: markdownToHtml(row.answer_md || "") }) : null;
}

function fallbackInterviewReviewItems({ status = "", q = "" } = {}) {
  const statusKey = String(status || "").trim().toLowerCase();
  const keyword = String(q || "").trim().toLowerCase();
  const items = fallbackInterviewReviews
    .filter((item) => !statusKey || item.status === statusKey)
    .filter((item) => !keyword || `${item.company_alias} ${item.position_name} ${item.summary_md}`.toLowerCase().includes(keyword))
    .map((item) => publicInterviewReview({
      ...cloneFallback(item),
      summary_html: markdownToHtml(item.summary_md || ""),
      improvement_html: markdownToHtml(item.improvement_md || "")
    }));
  return { items, source: "local-preview" };
}

function normalizeInterviewTopicPayload(body = {}, current = {}) {
  const title = cleanText(body.title || current.title || "\u672a\u547d\u540d\u4e13\u9898", 200);
  return {
    slug: normalizeSlug(body.slug || current.slug || title, "topic"),
    title,
    description: cleanText(body.description ?? current.description ?? "", 500),
    sort_order: clampNumber(body.sort_order ?? body.sortOrder ?? current.sort_order, 0, 9999, 0),
    visible: body.visible === undefined ? Number(current.visible ?? 1) : (body.visible ? 1 : 0)
  };
}

function normalizeInterviewQuestionPayload(body = {}, current = {}) {
  const answer = String(body.answer_md ?? body.answerMd ?? body.content_md ?? current.answer_md ?? "");
  const title = cleanText(body.title || current.title || titleFromMarkdown(answer) || "\u672a\u547d\u540d\u9762\u8bd5\u9898", 200);
  const tags = body.tagText !== undefined || body.tags !== undefined ? tagsFromInput(body.tagText || body.tags) : parseTags(current.tags);
  const answerMeta = interviewAnswerMetaFromPayload(body, current);
  const difficulty = cleanInterviewDifficulty(body.difficulty || current.difficulty || answerMeta.difficulty, answerMeta.difficulty);
  answerMeta.difficulty = difficulty;
  return {
    topic_id: cleanId(body.topic_id ?? body.topicId ?? current.topic_id) || null,
    slug: normalizeSlug(body.slug || current.slug || title, "question"),
    title,
    summary: cleanText(body.summary || current.summary || stripMarkdown(answer).slice(0, 220), 500),
    answer_md: answer,
    answer_html: markdownToHtml(answer),
    answer_points: JSON.stringify(answerMeta),
    difficulty,
    source: cleanText(body.source || current.source || "", 160),
    tags: JSON.stringify(tags),
    goal_ids: parseIdList(body.goalIds ?? body.goal_ids ?? current.goal_ids ?? current.goalIds),
    status: cleanStatus(body.status, ["draft", "published"], current.status || "draft"),
    sort_order: clampNumber(body.sort_order ?? body.sortOrder ?? current.sort_order, 0, 9999, 0),
    reviewed_at: cleanDateValue(body.reviewed_at ?? body.reviewedAt ?? current.reviewed_at)
  };
}

function normalizeInterviewReviewPayload(body = {}, current = {}) {
  const summary = String(body.summary_md ?? body.summaryMd ?? current.summary_md ?? "");
  const improvement = String(body.improvement_md ?? body.improvementMd ?? current.improvement_md ?? "");
  return {
    company_alias: cleanText(body.company_alias ?? body.companyAlias ?? current.company_alias ?? "\u672a\u547d\u540d\u516c\u53f8", 160),
    position_name: cleanText(body.position_name ?? body.positionName ?? current.position_name ?? "", 160),
    interview_round: cleanText(body.interview_round ?? body.interviewRound ?? current.interview_round ?? "", 80),
    happened_at: cleanDateValue(body.happened_at ?? body.happenedAt ?? current.happened_at),
    result_status: cleanText(body.result_status ?? body.resultStatus ?? current.result_status ?? "", 80),
    summary_md: summary,
    summary_html: markdownToHtml(summary),
    improvement_md: improvement,
    improvement_html: markdownToHtml(improvement),
    status: cleanStatus(body.status, ["draft", "published"], current.status || "draft"),
    sort_order: clampNumber(body.sort_order ?? body.sortOrder ?? current.sort_order, 0, 9999, 0)
  };
}

async function seedInterviewTopicDefaults() {
  for (const topic of interviewTopicDefaults) {
    await query("INSERT INTO interview_topics(slug,title,description,sort_order,visible,created_at,updated_at) " +
      "VALUES(:slug,:title,:description,:sort_order,1,NOW(),NOW()) " +
      "ON DUPLICATE KEY UPDATE title=:title, description=:description, sort_order=:sort_order", topic);
  }
}

async function backfillInterviewQuestionsFromLegacy() {
  const rows = await query("SELECT i.* FROM interview_items i " +
    "LEFT JOIN interview_questions q ON q.slug=i.slug " +
    "WHERE q.id IS NULL ORDER BY i.id ASC LIMIT 500");
  for (const row of rows) {
    const topic = await getOne("SELECT id FROM interview_topics WHERE slug=:slug LIMIT 1", { slug: row.section || "bagu" });
    const payload = normalizeInterviewQuestionPayload({
      topic_id: topic?.id || null,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      answer_md: row.content_md,
      difficulty: row.difficulty,
      tags: row.tags,
      status: row.status,
      sort_order: row.sort_order
    });
    await query("INSERT INTO interview_questions(topic_id,slug,title,summary,answer_md,answer_html,difficulty,source,tags,status,sort_order,reviewed_at,created_at,updated_at,deleted_at) " +
      "VALUES(:topic_id,:slug,:title,:summary,:answer_md,:answer_html,:difficulty,'legacy-interview-items',:tags,:status,:sort_order,CASE WHEN :status='published' THEN NOW() ELSE NULL END,NOW(),NOW(),NULL) " +
      "ON DUPLICATE KEY UPDATE topic_id=:topic_id, title=:title, summary=:summary, answer_md=:answer_md, answer_html=:answer_html, difficulty=:difficulty, tags=:tags, status=:status, sort_order=:sort_order, updated_at=NOW()", payload);
  }
}

async function backfillInterviewQuestionsFromDailyArchive() {
  if (!await databaseTableExists("interview_day_questions")) return;
  const rows = await query("SELECT q.*, DATE_FORMAT(d.day_date, '%Y-%m-%d') AS day_date FROM interview_day_questions q LEFT JOIN interview_days d ON d.id=q.day_id ORDER BY q.day_id DESC, q.position ASC LIMIT 500");
  for (const row of rows) {
    const topicSlug = normalizeSlug(row.category || "daily50", "daily50");
    await query("INSERT INTO interview_topics(slug,title,description,sort_order,visible,created_at,updated_at) VALUES(:slug,:title,:description,:sort_order,1,NOW(),NOW()) ON DUPLICATE KEY UPDATE title=:title, description=:description, sort_order=LEAST(sort_order,:sort_order)", {
      slug: topicSlug,
      title: cleanText(row.category || "每日 50 题", 200),
      description: "从服务器旧每日题单迁移来的训练题分类。",
      sort_order: 40
    });
    const topic = await getOne("SELECT id FROM interview_topics WHERE slug=:slug LIMIT 1", { slug: topicSlug });
    const meta = normalizeInterviewAnswerMeta(row.answer_points);
    const slug = normalizeSlug(`daily-${row.day_date || row.day_id}-${row.question_key || row.position}`, `daily-${row.id}`);
    const payload = {
      topic_id: topic?.id || null,
      slug,
      title: cleanText(row.question || `每日题 ${row.position || row.id}`, 200),
      summary: cleanText(row.question || "", 500),
      answer_md: String(row.answer_text || ""),
      answer_html: markdownToHtml(String(row.answer_text || "")),
      answer_points: JSON.stringify(meta),
      difficulty: cleanInterviewDifficulty(meta.difficulty || row.tag || "基础", "基础"),
      source: "legacy-interview-days",
      tags: JSON.stringify([row.tag, row.day_date].filter(Boolean).slice(0, 4)),
      status: "published",
      sort_order: clampNumber(row.position, 0, 9999, 0),
      reviewed_at: row.day_date || null
    };
    await query("INSERT INTO interview_questions(topic_id,slug,title,summary,answer_md,answer_html,answer_points,difficulty,source,tags,status,sort_order,reviewed_at,created_at,updated_at,deleted_at) " +
      "VALUES(:topic_id,:slug,:title,:summary,:answer_md,:answer_html,CAST(:answer_points AS JSON),:difficulty,:source,:tags,:status,:sort_order,:reviewed_at,NOW(),NOW(),NULL) " +
      "ON DUPLICATE KEY UPDATE topic_id=:topic_id, title=:title, summary=:summary, answer_md=:answer_md, answer_html=:answer_html, answer_points=CAST(:answer_points AS JSON), difficulty=:difficulty, source=:source, tags=:tags, status=:status, sort_order=:sort_order, updated_at=NOW()", payload);
  }
}

async function getAdminPost(id) {
  return getOne("SELECT * FROM posts WHERE id=:id", { id });
}

async function getAdminProject(id) {
  return getOne("SELECT * FROM projects WHERE id=:id", { id });
}

async function getAdminInterview(id) {
  return getOne("SELECT * FROM interview_items WHERE id=:id", { id });
}

async function restoreContentVersion(req, user, version) {
  if (!version) return { error: "not_found" };
  const type = normalizeContentResourceType(version.resource_type);
  const id = cleanId(version.resource_id);
  const payload = parseJsonObject(version.payload_json, {});
  if (!type || !id) return { error: "unsupported_resource" };

  if (type === "post") {
    const current = await getAdminPost(id);
    if (!current) return { error: "not_found" };
    const row = {
      id,
      title: cleanText(payload.title || current.title || "未命名文章", 200),
      slug: normalizeSlug(payload.slug || current.slug || payload.title || current.title, "post"),
      summary: cleanText(payload.summary || "", 500),
      content_md: String(payload.content_md || current.content_md || ""),
      cover_url: cleanText(payload.cover_url || "", 500),
      status: cleanStatus(payload.status, ["draft", "published"], "draft")
    };
    if (!row.content_md.trim()) return { error: "content_required", message: "版本正文为空，不能恢复。" };
    await query(`UPDATE posts SET title=:title, slug=:slug, summary=:summary, content_md=:content_md,
      cover_url=:cover_url, status=:status, deleted_at=NULL,
      published_at=CASE WHEN :status='published' AND published_at IS NULL THEN NOW() ELSE published_at END,
      updated_at=NOW() WHERE id=:id`, row);
    await cacheDel("site:overview");
    await syncSearchIndex();
    const restored = await getAdminPost(id);
    await refreshAttachmentRefsForResource("post", id, { cover_url: restored.cover_url, content_md: restored.content_md });
    await recordContentVersion("post", id, restored, user, `restore:v${version.version}`);
    await writeAuditLog(req, user, "restore-version", "post", id, current, restored);
    return { ok: true, resourceType: type, item: restored };
  }

  if (type === "moment") {
    const current = await getOne("SELECT * FROM moments WHERE id=:id", { id });
    if (!current) return { error: "not_found" };
    const row = {
      id,
      content: cleanText(payload.content || current.content || "", 1000),
      kind: cleanMomentKind(payload.kind, current.kind || "life"),
      tags: JSON.stringify(parseTags(payload.tags)),
      image_url: cleanText(payload.image_url || "", 500),
      status: cleanStatus(payload.status, ["draft", "published"], "draft")
    };
    if (!row.content) return { error: "content_required", message: "版本内容为空，不能恢复。" };
    await query("UPDATE moments SET content=:content, kind=:kind, tags=:tags, image_url=:image_url, status=:status, deleted_at=NULL, updated_at=NOW() WHERE id=:id", row);
    await cacheDel("site:overview");
    await syncSearchIndex();
    const restored = adminMoment(await getOne("SELECT * FROM moments WHERE id=:id", { id }));
    await refreshAttachmentRefsForResource("moment", id, { image_url: restored.image_url, content: restored.content });
    await recordContentVersion("moment", id, restored, user, `restore:v${version.version}`);
    await writeAuditLog(req, user, "restore-version", "moment", id, adminMoment(current), restored);
    return { ok: true, resourceType: type, item: restored };
  }

  if (type === "project") {
    const current = await getAdminProject(id);
    if (!current) return { error: "not_found" };
    const row = {
      id,
      name: cleanText(payload.name || current.name || "未命名项目", 120),
      slug: normalizeSlug(payload.slug || current.slug || payload.name || current.name, "project"),
      summary: cleanText(payload.summary || "", 500),
      status_text: cleanText(payload.status_text || "", 255),
      progress: clampNumber(payload.progress ?? current.progress, 0, 100, 0),
      last_update: cleanText(payload.last_update || projectUpdateLabel(new Date()), 255),
      status: cleanStatus(payload.status, ["active", "archived"], "active"),
      sort_order: clampNumber(payload.sort_order ?? current.sort_order, 0, 9999, 0),
      content_md: String(payload.content_md || current.content_md || ""),
      cover_url: cleanText(payload.cover_url || "", 500)
    };
    if (!row.content_md.trim()) return { error: "content_required", message: "版本 Markdown 为空，不能恢复。" };
    const summaryFields = await projectAiSummaryFields(row, current);
    const restoredProjectRow = { ...row, ...summaryFields };
    await query(`UPDATE projects SET name=:name, slug=:slug, summary=:summary, status_text=:status_text,
      progress=:progress, last_update=:last_update, status=:status, sort_order=:sort_order,
      content_md=:content_md, cover_url=:cover_url, ai_summary_updated_at=CASE WHEN COALESCE(ai_summary_source_hash,'')<>:ai_summary_source_hash OR COALESCE(ai_summary,'')<>:ai_summary THEN NOW() ELSE ai_summary_updated_at END,
      ai_summary=:ai_summary, ai_summary_source_hash=:ai_summary_source_hash,
      ai_summary_error=:ai_summary_error, deleted_at=NULL, updated_at=NOW() WHERE id=:id`, restoredProjectRow);
    await cacheDel("site:overview");
    await syncSearchIndex();
    const restored = publicProject(await getAdminProject(id));
    await refreshAttachmentRefsForResource("project", id, { cover_url: restored.cover_url, content_md: restored.content_md, summary: restored.summary, status_text: restored.status_text });
    await recordContentVersion("project", id, restored, user, `restore:v${version.version}`);
    await writeAuditLog(req, user, "restore-version", "project", id, publicProject(current), restored);
    return { ok: true, resourceType: type, item: restored };
  }

  if (type === "interview") {
    const current = await getAdminInterview(id);
    if (!current) return { error: "not_found" };
    const row = {
      id,
      title: cleanText(payload.title || current.title || "未命名面试内容", 200),
      slug: normalizeSlug(payload.slug || current.slug || payload.title || current.title, "interview"),
      section: cleanInterviewSection(payload.section || current.section, "bagu"),
      summary: cleanText(payload.summary || "", 500),
      content_md: String(payload.content_md || current.content_md || ""),
      difficulty: cleanText(payload.difficulty || "", 40),
      tags: JSON.stringify(parseTags(payload.tags)),
      question_count: clampNumber(payload.question_count ?? current.question_count, 0, 999, 0),
      finished_count: clampNumber(payload.finished_count ?? current.finished_count, 0, 999, 0),
      status: cleanStatus(payload.status, ["draft", "published"], "draft"),
      sort_order: clampNumber(payload.sort_order ?? current.sort_order, 0, 9999, 0)
    };
    if (!row.content_md.trim()) return { error: "content_required", message: "版本 Markdown 为空，不能恢复。" };
    row.finished_count = Math.min(row.finished_count, row.question_count);
    await query(`UPDATE interview_items SET title=:title, slug=:slug, section=:section, summary=:summary,
      content_md=:content_md, difficulty=:difficulty, tags=:tags, question_count=:question_count,
      finished_count=:finished_count, status=:status, sort_order=:sort_order, deleted_at=NULL,
      updated_at=NOW() WHERE id=:id`, row);
    await cacheDel("site:overview");
    await syncSearchIndex();
    const restored = publicInterview(await getAdminInterview(id));
    await refreshAttachmentRefsForResource("interview", id, { content_md: restored.content_md, summary: restored.summary });
    await recordContentVersion("interview", id, restored, user, `restore:v${version.version}`);
    await writeAuditLog(req, user, "restore-version", "interview", id, publicInterview(current), restored);
    return { ok: true, resourceType: type, item: restored };
  }

  return { error: "unsupported_resource" };
}

function wantsTrash(url) {
  return ["1", "true", "yes"].includes(String(url.searchParams.get("trash") || "").toLowerCase());
}

function wantsDeletedIncluded(url) {
  return ["1", "true", "yes"].includes(String(url.searchParams.get("includeDeleted") || "").toLowerCase());
}

function appendDeletedFilter(where, url, column = "deleted_at") {
  if (wantsDeletedIncluded(url)) return;
  where.push(wantsTrash(url) ? `${column} IS NOT NULL` : `${column} IS NULL`);
}

async function adminSiteTextsPayload() {
  return {
    definitions: frontendTextDefaults,
    texts: await getFrontendTextMap(),
    rules: await getSetting("site_text_rules", ""),
    footerSections: await getFooterSections(),
    layout: await getFrontendLayout(),
    ui: await getFrontendUi()
  };
}

async function adminAboutGalleryPayload() {
  const ui = await getFrontendUi();
  return {
    items: ui.aboutGalleryImages || [],
    limit: aboutGalleryImageLimit,
    updatedAt: new Date().toISOString()
  };
}

async function adminFrontendLayoutPayload() {
  return {
    layout: await getFrontendLayout(),
    ui: await getFrontendUi()
  };
}

async function adminFrontendEditorPayload() {
  const [layout, ui, texts, rules, footerSections, backup, draft] = await Promise.all([
    getFrontendLayout(),
    getFrontendUi(),
    getFrontendTextMap(),
    getSetting("site_text_rules", ""),
    getFooterSections(),
    getFrontendEditorBackup(),
    getFrontendEditorDraft()
  ]);
  const [posts, projects, moments, comments] = await Promise.all([
    query("SELECT id,title,slug,summary,cover_url,status,published_at,created_at,updated_at,deleted_at FROM posts WHERE deleted_at IS NULL ORDER BY updated_at DESC,id DESC LIMIT 120"),
    query("SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY sort_order ASC,id ASC LIMIT 120"),
    query("SELECT id,content,kind,tags,image_url,status,created_at,updated_at,deleted_at FROM moments WHERE deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 120"),
    query(`SELECT c.id, c.target, c.author_name, c.author_email, c.content,
        c.status, c.created_at, c.deleted_at, COALESCE(r.count, 0) AS likes
      FROM comments c
      LEFT JOIN reactions r ON r.target=CONCAT('comment:', c.id) AND r.kind='like'
      WHERE c.deleted_at IS NULL
      ORDER BY c.created_at DESC, c.id DESC LIMIT 200`)
  ]);
  return {
    definitions: frontendTextDefaults,
    texts,
    rules,
    footerSections,
    layout,
    ui,
    backup: backup ? { savedAt: backup.savedAt, reason: backup.reason } : null,
    draft: draft ? { savedAt: draft.savedAt, payload: draft.payload } : null,
    content: {
      posts,
      projects: projects.map(publicProject),
      moments: moments.map(adminMoment),
      comments
    }
  };
}

function compactJson(value, maxLength = 60000) {
  if (value === undefined) return null;
  try {
    const text = JSON.stringify(value ?? null);
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  } catch {
    return JSON.stringify({ error: "unserializable" });
  }
}

function requestIp(req) {
  const candidates = [
    req.headers["cf-connecting-ip"],
    req.headers["x-forwarded-for"],
    req.headers["x-real-ip"],
    req.socket.remoteAddress
  ].flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  const publicCandidate = candidates.find((value) => normalizePublicIp(value));
  return String(publicCandidate || candidates[0] || "").slice(0, 80);
}

async function writeAuditLog(req, user, action, resourceType, resourceId = "", before = null, after = null) {
  if (!databaseAvailable) return;
  try {
    await query(`INSERT INTO audit_logs
      (user_id, username, action, resource_type, resource_id, before_json, after_json, ip, user_agent, created_at)
      VALUES(:user_id, :username, :action, :resource_type, :resource_id, :before_json, :after_json, :ip, :user_agent, NOW())`, {
      user_id: Number(user?.id) > 0 ? user.id : null,
      username: cleanText(user?.username || "", 80),
      action: cleanKey(action, "update").slice(0, 80),
      resource_type: cleanKey(resourceType, "resource").slice(0, 80),
      resource_id: String(resourceId || "").slice(0, 120),
      before_json: compactJson(before),
      after_json: compactJson(after),
      ip: requestIp(req),
      user_agent: cleanText(req.headers["user-agent"] || "", 255)
    });
  } catch (error) {
    console.warn("audit log write failed", error.message || error);
  }
}

async function recordSettingVersion(scopeKey, payload, user, reason = "save") {
  if (!databaseAvailable) return;
  try {
    await query(`INSERT INTO setting_versions(scope_key, version, payload_json, reason, created_by, created_at)
      SELECT :scope_key, COALESCE(MAX(version), 0) + 1, :payload_json, :reason, :created_by, NOW()
      FROM setting_versions WHERE scope_key=:scope_key`, {
      scope_key: cleanKey(scopeKey, "site").slice(0, 120),
      payload_json: compactJson(payload, 100000) || "{}",
      reason: cleanText(reason, 120),
      created_by: Number(user?.id) > 0 ? user.id : null
    });
  } catch (error) {
    console.warn("setting version write failed", error.message || error);
  }
}

function contentVersionTitle(resourceType, row = {}) {
  if (resourceType === "post") return row.title || row.slug || `文章 ${row.id || ""}`;
  if (resourceType === "moment") return String(row.content || "").slice(0, 80) || `瞬间 ${row.id || ""}`;
  if (resourceType === "project") return row.name || row.slug || `项目 ${row.id || ""}`;
  if (resourceType === "interview") return row.title || row.slug || `面试 ${row.id || ""}`;
  if (resourceType === "hz-quote") return String(row.text || "").slice(0, 80) || `Hz ${row.id || ""}`;
  return row.title || row.name || row.slug || `${resourceType}:${row.id || ""}`;
}

function normalizeContentResourceType(value = "") {
  const type = cleanKey(value, "");
  return ({
    posts: "post",
    post: "post",
    moments: "moment",
    moment: "moment",
    projects: "project",
    project: "project",
    interviews: "interview",
    interview: "interview",
    "interview-topics": "interview-topic",
    "interview-topic": "interview-topic",
    "interview-questions": "interview-question",
    "interview-question": "interview-question",
    "interview-reviews": "interview-review",
    "interview-review": "interview-review",
    "hz-quotes": "hz-quote",
    "hz-quote": "hz-quote"
  })[type] || "";
}

async function recordContentVersion(resourceType, resourceId, row, user, reason = "save") {
  if (!databaseAvailable || !row) return;
  const type = normalizeContentResourceType(resourceType);
  const id = String(resourceId || row.id || "");
  if (!type || !id) return;
  try {
    await query(`INSERT INTO content_versions(resource_type, resource_id, version, title, slug, status, payload_json, reason, created_by, created_at)
      SELECT :resource_type, :resource_id, COALESCE(MAX(version), 0) + 1, :title, :slug, :status, :payload_json, :reason, :created_by, NOW()
      FROM content_versions WHERE resource_type=:resource_type AND resource_id=:resource_id`, {
      resource_type: type,
      resource_id: id,
      title: cleanText(contentVersionTitle(type, row), 220),
      slug: cleanText(row.slug || "", 220),
      status: cleanText(row.status || "", 60),
      payload_json: compactJson(row, 150000) || "{}",
      reason: cleanText(reason, 120),
      created_by: Number(user?.id) > 0 ? user.id : null
    });
  } catch (error) {
    console.warn("content version write failed", error.message || error);
  }
}

async function listContentVersions({ resourceType = "", resourceId = "", limit = 120 } = {}) {
  if (!databaseAvailable) return { items: [], source: "local-preview" };
  const where = [];
  const params = {
    limit: Math.min(240, Math.max(1, Number(limit) || 120))
  };
  const type = normalizeContentResourceType(resourceType);
  if (type) {
    where.push("resource_type=:resource_type");
    params.resource_type = type;
  }
  if (resourceId) {
    where.push("resource_id=:resource_id");
    params.resource_id = String(resourceId);
  }
  const rows = await query(`SELECT id, resource_type, resource_id, version, title, slug, status, reason, created_by, created_at
    FROM content_versions ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY created_at DESC, id DESC LIMIT :limit`, params);
  return { items: rows };
}

async function getContentVersion(id) {
  if (!databaseAvailable) return null;
  return getOne("SELECT * FROM content_versions WHERE id=:id", { id });
}

async function recordSearchSyncJob(status, count, message, user, startedAt) {
  if (!databaseAvailable) return;
  try {
    await query(`INSERT INTO search_sync_jobs(status,indexed_count,message,created_by,started_at,finished_at)
      VALUES(:status,:indexed_count,:message,:created_by,:started_at,NOW())`, {
      status,
      indexed_count: Number(count) || 0,
      message: cleanText(message || "", 500),
      created_by: Number(user?.id) > 0 ? user.id : null,
      started_at: formatDateTime(startedAt)
    });
  } catch (error) {
    console.warn("search sync job write failed", error.message || error);
  }
}

function normalizeLookbackDays(value, fallback = 7) {
  return Math.min(90, Math.max(1, Number(value) || fallback));
}

async function listAuditLogs({ limit = 80, action = "", resource = "", username = "", q = "" } = {}) {
  if (!databaseAvailable) {
    return {
      items: [{
        id: "preview",
        username: localPreviewAdminCredentials().username,
        action: "local-preview",
        resource_type: "system",
        resource_id: "fallback",
        created_at: formatDateTime(new Date()),
        summary: "当前是本地预览模式，真实审计日志会在数据库连接后写入。"
      }],
      source: "local-preview"
    };
  }
  const where = [];
  const params = {
    limit: Math.min(200, Math.max(1, Number(limit) || 80))
  };
  const nextAction = cleanKey(action, "");
  const nextResource = cleanKey(resource, "");
  const nextUsername = cleanText(username, 80);
  const keyword = cleanText(q, 120);
  if (nextAction) {
    where.push("action=:action");
    params.action = nextAction;
  }
  if (nextResource) {
    where.push("resource_type=:resource_type");
    params.resource_type = nextResource;
  }
  if (nextUsername) {
    where.push("username=:username");
    params.username = nextUsername;
  }
  if (keyword) {
    where.push("(username LIKE :q OR action LIKE :q OR resource_type LIKE :q OR resource_id LIKE :q)");
    params.q = `%${keyword}%`;
  }
  const rows = await query(`SELECT id, username, action, resource_type, resource_id, ip, created_at
    FROM audit_logs ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY created_at DESC, id DESC LIMIT :limit`, params);
  return { items: rows };
}

const adminContentResources = new Set(["posts", "moments", "projects", "interviews", "comments"]);
const adminBatchResources = new Set([...adminContentResources, "interview-questions", "interview-reviews"]);

function csvValue(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""').replace(/\r?\n/g, " ").trim()}"`;
}

function sendCsv(res, filename, rows, columns) {
  const header = columns.map((column) => csvValue(column.label)).join(",");
  const lines = rows.map((row) => columns.map((column) => csvValue(row[column.key])).join(","));
  const body = `\uFEFF${[header, ...lines].join("\n")}\n`;
  res.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${safeDownloadFilename(filename)}"`,
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function contentQueryBase(resource, url, { exportMode = false } = {}) {
  const where = [];
  const params = {};
  const q = cleanText(url.searchParams.get("q") || "", 120);
  const status = url.searchParams.get("status");
  const limit = exportMode ? 2000 : 200;
  if (resource === "comments") {
    appendDeletedFilter(where, url, "c.deleted_at");
    if (["pending", "published", "hidden"].includes(status)) {
      where.push("c.status=:status");
      params.status = status;
    }
    const target = cleanText(url.searchParams.get("target") || "", 160);
    if (target) {
      where.push("c.target=:target");
      params.target = target;
    }
    if (q) {
      where.push("(c.author_name LIKE :q OR c.content LIKE :q OR c.target LIKE :q)");
      params.q = `%${q}%`;
    }
    return { where, params, limit };
  }
  appendDeletedFilter(where, url);
  if (resource === "projects") {
    if (["active", "archived"].includes(status)) {
      where.push("status=:status");
      params.status = status;
    }
    if (q) {
      where.push("(name LIKE :q OR slug LIKE :q OR summary LIKE :q OR status_text LIKE :q)");
      params.q = `%${q}%`;
    }
    return { where, params, limit };
  }
  if (resource === "moments") {
    if (["draft", "published"].includes(status)) {
      where.push("status=:status");
      params.status = status;
    }
    const kind = cleanMomentKindFilter(url.searchParams.get("kind"));
    if (kind) {
      where.push("kind=:kind");
      params.kind = kind;
    }
    if (q) {
      where.push("(content LIKE :q OR kind LIKE :q)");
      params.q = `%${q}%`;
    }
    return { where, params, limit };
  }
  if (resource === "interviews") {
    if (["draft", "published"].includes(status)) {
      where.push("status=:status");
      params.status = status;
    }
    const section = cleanInterviewSection(url.searchParams.get("section") || "", "");
    if (section) {
      where.push("section=:section");
      params.section = section;
    }
    if (q) {
      where.push("(title LIKE :q OR slug LIKE :q OR summary LIKE :q)");
      params.q = `%${q}%`;
    }
    return { where, params, limit };
  }
  if (["draft", "published"].includes(status)) {
    where.push("status=:status");
    params.status = status;
  }
  if (q) {
    where.push("(title LIKE :q OR slug LIKE :q OR summary LIKE :q)");
    params.q = `%${q}%`;
  }
  return { where, params, limit };
}

function fallbackAdminContentRows(resource, url, { exportMode = false } = {}) {
  const limit = exportMode ? 1000 : Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 80));
  const status = String(url.searchParams.get("status") || "").trim();
  const section = String(url.searchParams.get("section") || "").trim();
  const kind = String(url.searchParams.get("kind") || "").trim();
  const keyword = String(url.searchParams.get("q") || "").trim().toLowerCase();
  let rows = [];
  if (resource === "posts") rows = cloneFallback(fallbackPosts);
  if (resource === "moments") rows = cloneFallback(fallbackMoments).map((item) => ({ ...item, status: item.status || "published", updated_at: item.updated_at || item.created_at }));
  if (resource === "projects") rows = cloneFallback(fallbackProjects).map(publicProject);
  if (resource === "interviews") rows = fallbackInterviewItems(section).items;
  if (resource === "comments") rows = [];
  rows = rows.filter((item) => !status || item.status === status);
  rows = rows.filter((item) => !kind || item.kind === kind);
  if (keyword) {
    rows = rows.filter((item) => JSON.stringify(item).toLowerCase().includes(keyword));
  }
  return rows.slice(0, limit);
}

async function listAdminContentRows(resource, url, { exportMode = false } = {}) {
  if (!databaseAvailable) return fallbackAdminContentRows(resource, url, { exportMode });
  const { where, params, limit } = contentQueryBase(resource, url, { exportMode });
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  try {
    if (resource === "posts") {
      const rows = await query(`SELECT id,title,slug,summary,cover_url,status,published_at,created_at,updated_at,deleted_at
        FROM posts ${whereSql} ORDER BY updated_at DESC,id DESC LIMIT :limit`, { ...params, limit });
      return rows;
    }
    if (resource === "moments") {
      const rows = await query(`SELECT id,content,kind,tags,image_url,status,created_at,updated_at,deleted_at
        FROM moments ${whereSql} ORDER BY created_at DESC,id DESC LIMIT :limit`, { ...params, limit });
      return rows.map(adminMoment);
    }
    if (resource === "projects") {
      const rows = await query(`SELECT * FROM projects ${whereSql}
        ORDER BY sort_order ASC,id ASC LIMIT :limit`, { ...params, limit });
      return rows.map(publicProject);
    }
    if (resource === "interviews") {
      const rows = await query(`SELECT * FROM interview_items ${whereSql}
        ORDER BY sort_order ASC, updated_at DESC, id DESC LIMIT :limit`, { ...params, limit });
      return rows.map(publicInterview);
    }
    const rows = await query(`SELECT c.id, c.target, c.author_name, c.author_email, c.content,
        c.status, c.moderation_reason, c.ip_hash, c.user_agent_hash, c.reviewed_at,
        c.created_at, c.deleted_at, COALESCE(r.count, 0) AS likes
      FROM comments c
      LEFT JOIN reactions r ON r.target=CONCAT('comment:', c.id) AND r.kind='like'
      ${whereSql}
      ORDER BY c.created_at DESC, c.id DESC LIMIT :limit`, { ...params, limit });
    return rows;
  } catch (error) {
    if (!isDatabaseConnectionError(error)) throw error;
    markDatabaseUnavailable(error, `admin ${resource} list`);
    return fallbackAdminContentRows(resource, url, { exportMode });
  }
}

const oldLaunchContentResources = [
  {
    key: "posts",
    label: "小记文章",
    table: "posts",
    resourceType: "post",
    statusSql: "status='draft'",
    commentTargetSql: "CONCAT('post:', slug)"
  },
  {
    key: "moments",
    label: "瞬间",
    table: "moments",
    resourceType: "moment",
    statusSql: "status='draft'",
    commentTargetSql: "CONCAT('moment:', id)"
  },
  {
    key: "interviews",
    label: "旧面试文章",
    table: "interview_items",
    resourceType: "interview",
    statusSql: "status='draft'",
    commentTargetSql: "CONCAT('interview:', id)"
  }
];

const oldLaunchContentResourceKeys = oldLaunchContentResources.map((item) => item.key);

function normalizeCleanupResourceKeys(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(/[,\s]+/);
  const selected = list.map((item) => String(item || "").trim()).filter(Boolean);
  const keys = selected.length ? selected : oldLaunchContentResourceKeys;
  return [...new Set(keys)].filter((key) => oldLaunchContentResourceKeys.includes(key));
}

async function oldLaunchContentStats() {
  if (!databaseAvailable) {
    return {
      items: oldLaunchContentResources.map((item) => ({ key: item.key, label: item.label, active: 0, deleted: 0, total: 0 })),
      totalActive: 0,
      totalDeleted: 0,
      source: "local-preview"
    };
  }
  const items = [];
  for (const item of oldLaunchContentResources) {
    const row = await getOne(`SELECT
      SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS deleted,
      COUNT(*) AS total
      FROM ${item.table}`);
    items.push({
      key: item.key,
      label: item.label,
      active: Number(row?.active || 0),
      deleted: Number(row?.deleted || 0),
      total: Number(row?.total || 0)
    });
  }
  return {
    items,
    totalActive: items.reduce((sum, item) => sum + item.active, 0),
    totalDeleted: items.reduce((sum, item) => sum + item.deleted, 0)
  };
}

async function cleanupOldLaunchContent(req, user, body = {}) {
  if (!databaseAvailable) return { error: "database_unavailable", message: "数据库不可用，不能清理旧内容。" };
  const keys = normalizeCleanupResourceKeys(body.resources || body.resourceKeys);
  if (!keys.length) return { error: "invalid_resources", message: "没有可清理的内容资源。" };
  const confirm = String(body.confirm || body.confirmation || "").trim();
  const dryRun = body.dryRun === true || body.dry_run === true || body.preview === true;
  const before = await oldLaunchContentStats();
  const selected = oldLaunchContentResources.filter((item) => keys.includes(item.key));
  if (dryRun) return { ok: true, dryRun: true, before, selected: selected.map(({ key, label }) => ({ key, label })) };
  if (confirm !== "clean-old-content") {
    return { error: "confirmation_required", message: "需要传 confirm=clean-old-content 才会执行清理。", before };
  }

  const result = [];
  for (const item of selected) {
    const activeBefore = before.items.find((row) => row.key === item.key)?.active || 0;
    await query(`UPDATE comments SET status='hidden', deleted_at=COALESCE(deleted_at,NOW())
      WHERE target IN (SELECT target FROM (SELECT ${item.commentTargetSql} AS target FROM ${item.table} WHERE deleted_at IS NULL) AS cleanup_targets)`);
    await query("DELETE FROM attachment_refs WHERE resource_type=:resource_type", { resource_type: item.resourceType });
    await query(`UPDATE ${item.table}
      SET ${item.statusSql}, deleted_at=COALESCE(deleted_at,NOW()), updated_at=NOW()
      WHERE deleted_at IS NULL`);
    result.push({ key: item.key, label: item.label, cleaned: activeBefore });
  }
  await cacheDel(["site:overview", "site:texts"]).catch(() => {});
  await syncSearchIndex().catch((error) => console.warn("search sync after content cleanup failed", error.message || error));
  const after = await oldLaunchContentStats();
  await recordSettingVersion("content-cleanup", { before, after, result }, user, "old-content-cleanup");
  await writeAuditLog(req, user, "cleanup", "content-cleanup", "old-launch-content", before, { after, result });
  return { ok: true, before, after, result };
}

function contentExportColumns(resource) {
  const common = [
    { key: "id", label: "ID" },
    { key: "status", label: "状态" },
    { key: "created_at", label: "创建时间" },
    { key: "updated_at", label: "更新时间" },
    { key: "deleted_at", label: "删除时间" }
  ];
  if (resource === "posts") return [{ key: "title", label: "标题" }, { key: "slug", label: "Slug" }, { key: "summary", label: "摘要" }, ...common];
  if (resource === "moments") return [{ key: "content", label: "内容" }, { key: "kind", label: "类型" }, { key: "tags", label: "标签" }, ...common];
  if (resource === "projects") return [{ key: "name", label: "名称" }, { key: "slug", label: "Slug" }, { key: "summary", label: "摘要" }, { key: "progress", label: "进度" }, ...common];
  if (resource === "interviews") return [{ key: "title", label: "标题" }, { key: "slug", label: "Slug" }, { key: "section_label", label: "分区" }, { key: "summary", label: "摘要" }, ...common];
  return [{ key: "target", label: "位置" }, { key: "author_name", label: "昵称" }, { key: "content", label: "内容" }, { key: "moderation_reason", label: "审核原因" }, ...common];
}

async function exportAdminContent(req, res, user, resource, url) {
  if (!databaseAvailable) return json(res, { error: "database_unavailable", message: "数据库不可用，无法导出。" }, 503);
  const rows = await listAdminContentRows(resource, url, { exportMode: true });
  await writeAuditLog(req, user, "export", resource, "csv", null, { count: rows.length });
  return sendCsv(res, `${resource}-${new Date().toISOString().slice(0, 10)}.csv`, rows, contentExportColumns(resource));
}

function batchContentVersionPayload(resource, row) {
  if (resource === "moments") return adminMoment(row);
  if (resource === "projects") return publicProject(row);
  if (resource === "interviews") return publicInterview(row);
  if (resource === "interview-questions") return publicInterviewQuestion(row);
  if (resource === "interview-reviews") return publicInterviewReview(row);
  return row;
}

async function getContentRowForBatch(resource, id) {
  if (resource === "posts") return getOne("SELECT * FROM posts WHERE id=:id", { id });
  if (resource === "moments") return getOne("SELECT * FROM moments WHERE id=:id", { id });
  if (resource === "projects") return getAdminProject(id);
  if (resource === "interviews") return getAdminInterview(id);
  if (resource === "interview-questions") return getOne("SELECT * FROM interview_questions WHERE id=:id", { id });
  if (resource === "interview-reviews") return getOne("SELECT * FROM interview_reviews WHERE id=:id", { id });
  if (resource === "comments") return getOne("SELECT * FROM comments WHERE id=:id", { id });
  return null;
}

function batchActionPermission(resource, action) {
  if (action === "delete") return "content:delete";
  if (["hide", "publish", "restore"].includes(action)) return "content:publish";
  return "content:write";
}

async function applyBatchContentAction(req, user, resource, id, action) {
  const before = await getContentRowForBatch(resource, id);
  if (!before) return { id, ok: false, error: "not_found" };
  if (resource === "posts") {
    if (action === "delete") await query("UPDATE posts SET status='draft', deleted_at=COALESCE(deleted_at,NOW()), updated_at=NOW() WHERE id=:id", { id });
    if (action === "hide") await query("UPDATE posts SET status='draft', updated_at=NOW() WHERE id=:id", { id });
    if (action === "publish") await query("UPDATE posts SET status='published', deleted_at=NULL, published_at=COALESCE(published_at,NOW()), updated_at=NOW() WHERE id=:id", { id });
    if (action === "restore") await query("UPDATE posts SET deleted_at=NULL, status='draft', updated_at=NOW() WHERE id=:id", { id });
  } else if (resource === "moments") {
    if (action === "delete") await query("UPDATE moments SET status='draft', deleted_at=COALESCE(deleted_at,NOW()), updated_at=NOW() WHERE id=:id", { id });
    if (action === "hide") await query("UPDATE moments SET status='draft', updated_at=NOW() WHERE id=:id", { id });
    if (action === "publish") await query("UPDATE moments SET status='published', deleted_at=NULL, updated_at=NOW() WHERE id=:id", { id });
    if (action === "restore") await query("UPDATE moments SET deleted_at=NULL, status='draft', updated_at=NOW() WHERE id=:id", { id });
  } else if (resource === "projects") {
    if (action === "delete") await query("UPDATE projects SET status='archived', deleted_at=COALESCE(deleted_at,NOW()), updated_at=NOW() WHERE id=:id", { id });
    if (action === "hide") await query("UPDATE projects SET status='archived', updated_at=NOW() WHERE id=:id", { id });
    if (action === "publish") await query("UPDATE projects SET status='active', deleted_at=NULL, updated_at=NOW() WHERE id=:id", { id });
    if (action === "restore") await query("UPDATE projects SET deleted_at=NULL, status='active', updated_at=NOW() WHERE id=:id", { id });
  } else if (resource === "interviews") {
    if (action === "delete") await query("UPDATE interview_items SET status='draft', deleted_at=COALESCE(deleted_at,NOW()), updated_at=NOW() WHERE id=:id", { id });
    if (action === "hide") await query("UPDATE interview_items SET status='draft', updated_at=NOW() WHERE id=:id", { id });
    if (action === "publish") await query("UPDATE interview_items SET status='published', deleted_at=NULL, updated_at=NOW() WHERE id=:id", { id });
    if (action === "restore") await query("UPDATE interview_items SET deleted_at=NULL, status='draft', updated_at=NOW() WHERE id=:id", { id });
  } else if (resource === "interview-questions") {
    if (action === "delete") await query("UPDATE interview_questions SET status='draft', deleted_at=COALESCE(deleted_at,NOW()), updated_at=NOW() WHERE id=:id", { id });
    if (action === "hide") await query("UPDATE interview_questions SET status='draft', updated_at=NOW() WHERE id=:id", { id });
    if (action === "publish") await query("UPDATE interview_questions SET status='published', deleted_at=NULL, reviewed_at=COALESCE(reviewed_at,NOW()), updated_at=NOW() WHERE id=:id", { id });
    if (action === "restore") await query("UPDATE interview_questions SET deleted_at=NULL, status='draft', updated_at=NOW() WHERE id=:id", { id });
  } else if (resource === "interview-reviews") {
    if (action === "delete") await query("UPDATE interview_reviews SET status='draft', deleted_at=COALESCE(deleted_at,NOW()), updated_at=NOW() WHERE id=:id", { id });
    if (action === "hide") await query("UPDATE interview_reviews SET status='draft', updated_at=NOW() WHERE id=:id", { id });
    if (action === "publish") await query("UPDATE interview_reviews SET status='published', deleted_at=NULL, updated_at=NOW() WHERE id=:id", { id });
    if (action === "restore") await query("UPDATE interview_reviews SET deleted_at=NULL, status='draft', updated_at=NOW() WHERE id=:id", { id });
  } else if (resource === "comments") {
    if (action === "delete") await query("UPDATE comments SET status='hidden', deleted_at=COALESCE(deleted_at,NOW()) WHERE id=:id", { id });
    if (action === "hide") await query("UPDATE comments SET status='hidden', reviewed_at=NOW() WHERE id=:id", { id });
    if (action === "publish") await query("UPDATE comments SET status='published', deleted_at=NULL, reviewed_at=NOW() WHERE id=:id", { id });
    if (action === "restore") await query("UPDATE comments SET deleted_at=NULL, status='pending', reviewed_at=NULL WHERE id=:id", { id });
  }
  const after = await getContentRowForBatch(resource, id);
  if (resource !== "comments") {
    const resourceType = normalizeContentResourceType(resource) || resource;
    await recordContentVersion(resourceType, id, batchContentVersionPayload(resource, after), user, `batch-${action}`);
    if (action === "delete") await clearAttachmentRefsForResource(resourceType, id);
  }
  await writeAuditLog(req, user, `batch-${action}`, normalizeContentResourceType(resource) || "comment", id, batchContentVersionPayload(resource, before), batchContentVersionPayload(resource, after));
  return { id, ok: true };
}

async function batchAdminContent(req, res, user, resource) {
  if (!databaseAvailable) return json(res, { error: "database_unavailable", message: "数据库不可用，无法批量操作。" }, 503);
  const body = await readAdminObject(req);
  const action = cleanStatus(body.action, ["hide", "publish", "restore", "delete"], "");
  if (!action) return json(res, { error: "invalid_action", message: "不支持的批量操作。" }, 400);
  const permission = batchActionPermission(resource, action);
  if (!userCan(user, permission)) return denyPermission(res, permission, user);
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(cleanId).filter(Boolean))].slice(0, 100);
  if (!ids.length) return json(res, { error: "empty_selection", message: "请先选择要处理的记录。" }, 400);
  const results = [];
  for (const id of ids) {
    try {
      results.push(await applyBatchContentAction(req, user, resource, id, action));
    } catch (error) {
      results.push({ id, ok: false, error: error.message || "处理失败" });
    }
  }
  await cacheDel("site:overview").catch(() => {});
  if (resource !== "comments") syncSearchIndex().catch((error) => console.warn("search sync after batch failed", error.message || error));
  return json(res, {
    ok: results.every((item) => item.ok),
    action,
    count: results.filter((item) => item.ok).length,
    results
  });
}

async function auditInsightsPayload(days = 7) {
  if (!databaseAvailable) {
    return {
      source: "local-preview",
      rangeDays: normalizeLookbackDays(days),
      summary: { total: 1, activeUsers: 1, today: 1, risky: 0 },
      byAction: [{ action: "local-preview", count: 1, latest: formatDateTime(new Date()) }],
      byResource: [{ resource_type: "system", count: 1, latest: formatDateTime(new Date()) }],
      byUser: [{ username: localPreviewAdminCredentials().username, count: 1, latest: formatDateTime(new Date()) }],
      riskyItems: []
    };
  }
  const rangeDays = normalizeLookbackDays(days);
  const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
  const params = { since };
  const riskyActions = ["delete", "backup-failed", "restore-backup", "restore-version", "unpublish", "delete-draft"];
  const [summary] = await query(`SELECT
      COUNT(*) AS total,
      COUNT(DISTINCT NULLIF(username, '')) AS activeUsers,
      SUM(CASE WHEN created_at >= CURDATE() THEN 1 ELSE 0 END) AS today,
      SUM(CASE WHEN action IN (${riskyActions.map((_, index) => `:risk${index}`).join(",")}) THEN 1 ELSE 0 END) AS risky
    FROM audit_logs WHERE created_at >= :since`, {
    ...params,
    ...Object.fromEntries(riskyActions.map((action, index) => [`risk${index}`, action]))
  });
  const byAction = await query(`SELECT action, COUNT(*) AS count, MAX(created_at) AS latest
    FROM audit_logs WHERE created_at >= :since
    GROUP BY action ORDER BY count DESC, latest DESC LIMIT 10`, params);
  const byResource = await query(`SELECT resource_type, COUNT(*) AS count, MAX(created_at) AS latest
    FROM audit_logs WHERE created_at >= :since
    GROUP BY resource_type ORDER BY count DESC, latest DESC LIMIT 10`, params);
  const byUser = await query(`SELECT COALESCE(NULLIF(username, ''), 'system') AS username, COUNT(*) AS count, MAX(created_at) AS latest
    FROM audit_logs WHERE created_at >= :since
    GROUP BY COALESCE(NULLIF(username, ''), 'system') ORDER BY count DESC, latest DESC LIMIT 8`, params);
  const riskyItems = await query(`SELECT id, username, action, resource_type, resource_id, ip, created_at
    FROM audit_logs
    WHERE created_at >= :since AND action IN (${riskyActions.map((_, index) => `:risk${index}`).join(",")})
    ORDER BY created_at DESC, id DESC LIMIT 12`, {
    ...params,
    ...Object.fromEntries(riskyActions.map((action, index) => [`risk${index}`, action]))
  });
  return {
    rangeDays,
    summary: {
      total: Number(summary?.total || 0),
      activeUsers: Number(summary?.activeUsers || 0),
      today: Number(summary?.today || 0),
      risky: Number(summary?.risky || 0)
    },
    byAction,
    byResource,
    byUser,
    riskyItems
  };
}

async function listSettingVersions({ scope = "", limit = 80 } = {}) {
  if (!databaseAvailable) return { items: [], source: "local-preview" };
  const params = {
    limit: Math.min(200, Math.max(1, Number(limit) || 80))
  };
  const where = [];
  const scopeKey = cleanKey(scope, "");
  if (scopeKey) {
    where.push("scope_key=:scope_key");
    params.scope_key = scopeKey;
  }
  const rows = await query(`SELECT id, scope_key, version, reason, created_by, created_at
    FROM setting_versions ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY created_at DESC, id DESC LIMIT :limit`, params);
  return { items: rows };
}

async function getSettingVersion(id) {
  if (!databaseAvailable) return null;
  return getOne("SELECT * FROM setting_versions WHERE id=:id", { id });
}

async function listMediaAssets({ limit = 120, orphan = false, includeDeleted = false } = {}) {
  if (!databaseAvailable) return { items: [], source: "local-preview" };
  const where = [];
  if (!includeDeleted) where.push("m.deleted_at IS NULL");
  const rows = await query(`SELECT * FROM (
      SELECT m.id, m.storage_key, m.url, m.filename, m.mime, m.size, m.sha256, m.source, m.uploaded_by,
        m.last_seen_at, m.deleted_at, m.created_at,
        (SELECT COUNT(*) FROM attachment_refs r WHERE r.media_asset_id=m.id OR r.media_url=m.url) AS ref_count,
        (SELECT MAX(COALESCE(r.updated_at, r.created_at)) FROM attachment_refs r WHERE r.media_asset_id=m.id OR r.media_url=m.url) AS last_ref_at
      FROM media_assets m ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ) media_rollup ${orphan ? "WHERE ref_count=0" : ""}
    ORDER BY created_at DESC, id DESC LIMIT :limit`, {
    limit: Math.min(240, Math.max(1, Number(limit) || 120))
  });
  return { items: rows };
}

function mediaAssetFilePath(storageKey) {
  const base = path.resolve(config.uploads.dir);
  const file = path.resolve(path.join(base, String(storageKey || "")));
  return file.startsWith(base) ? file : "";
}

async function deleteMediaAsset(id, { purgeFile = false } = {}) {
  const asset = await getOne(`SELECT m.*,
      (SELECT COUNT(*) FROM attachment_refs r WHERE r.media_asset_id=m.id OR r.media_url=m.url) AS ref_count
    FROM media_assets m WHERE m.id=:id`, { id });
  if (!asset) return { error: "not_found" };
  if (Number(asset.ref_count || 0) > 0) {
    return { error: "asset_in_use", message: "这个媒体仍被内容引用，不能清理。" };
  }
  let purged = false;
  if (purgeFile) {
    const file = mediaAssetFilePath(asset.storage_key);
    if (file && fs.existsSync(file)) {
      await fs.promises.unlink(file);
      purged = true;
    }
  }
  await query("UPDATE media_assets SET deleted_at=COALESCE(deleted_at,NOW()) WHERE id=:id", { id });
  return { ok: true, asset: { ...asset, deleted_at: asset.deleted_at || formatDateTime(new Date()) }, purged };
}

async function listSearchSyncJobs(limit = 50) {
  if (!databaseAvailable) return { items: [], source: "local-preview" };
  const rows = await query(`SELECT id, status, indexed_count, message, created_by, started_at, finished_at
    FROM search_sync_jobs ORDER BY finished_at DESC, id DESC LIMIT :limit`, {
    limit: Math.min(120, Math.max(1, Number(limit) || 50))
  });
  return { items: rows };
}

async function listBackupJobs(limit = 50) {
  if (!databaseAvailable) return { items: [], source: "local-preview" };
  const rows = await query(`SELECT id, status, scope, artifact_path, message, created_by, started_at, finished_at, created_at
    FROM backup_jobs ORDER BY created_at DESC, id DESC LIMIT :limit`, {
    limit: Math.min(120, Math.max(1, Number(limit) || 50))
  });
  return { items: rows };
}

function jobTone(status) {
  if (status === "success" || status === "ok") return "ok";
  if (status === "failed" || status === "danger") return "danger";
  if (status === "running" || status === "pending" || status === "attention") return "warn";
  return "neutral";
}

function normalizeTaskTime(item = {}) {
  return item.finished_at || item.started_at || item.created_at || new Date().toISOString();
}

async function taskCenterPayload() {
  if (!databaseAvailable) {
    return {
      source: "local-preview",
      summary: { pendingComments: 0, orphanMediaAssets: 0, trashItems: 0, failedJobs: 0, githubRepositories: 0, githubSyncJobs: 0 },
      items: [{
        id: "preview-task",
        kind: "system",
        label: "本地预览模式",
        status: "preview",
        tone: "neutral",
        detail: "数据库连接后会显示搜索、备份、审核和媒体治理任务。",
        created_at: formatDateTime(new Date())
      }]
    };
  }
  const [stats] = await query(`
    SELECT
      (SELECT COUNT(*) FROM comments WHERE status='pending' AND deleted_at IS NULL) AS pendingComments,
      (SELECT COUNT(*) FROM media_assets m WHERE m.deleted_at IS NULL AND NOT EXISTS (
        SELECT 1 FROM attachment_refs r WHERE r.media_asset_id=m.id OR r.media_url=m.url
      )) AS orphanMediaAssets,
      (SELECT COUNT(*) FROM posts WHERE deleted_at IS NOT NULL)
        + (SELECT COUNT(*) FROM moments WHERE deleted_at IS NOT NULL)
        + (SELECT COUNT(*) FROM projects WHERE deleted_at IS NOT NULL)
        + (SELECT COUNT(*) FROM interview_items WHERE deleted_at IS NOT NULL)
        + (SELECT COUNT(*) FROM interview_topics WHERE deleted_at IS NOT NULL)
        + (SELECT COUNT(*) FROM interview_questions WHERE deleted_at IS NOT NULL)
        + (SELECT COUNT(*) FROM interview_reviews WHERE deleted_at IS NOT NULL)
        + (SELECT COUNT(*) FROM comments WHERE deleted_at IS NOT NULL) AS trashItems,
      (SELECT COUNT(*) FROM search_sync_jobs WHERE status='failed' AND finished_at >= DATE_SUB(NOW(), INTERVAL 7 DAY))
        + (SELECT COUNT(*) FROM backup_jobs WHERE status='failed' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY))
        + (SELECT COUNT(*) FROM github_sync_jobs WHERE status='failed' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS failedJobs,
      (SELECT COUNT(*) FROM github_repositories WHERE archived=0 AND fork=0) AS githubRepositories,
      (SELECT COUNT(*) FROM github_sync_jobs) AS githubSyncJobs
  `);
  const searchJobs = (await listSearchSyncJobs(8)).items || [];
  const backupJobs = (await listBackupJobs(8)).items || [];
  const githubJobs = await query("SELECT * FROM github_sync_jobs ORDER BY created_at DESC, id DESC LIMIT 8");
  const items = [];
  if (Number(stats?.pendingComments || 0) > 0) {
    items.push({
      id: "pending-comments",
      kind: "comment-review",
      label: "留言审核",
      status: "pending",
      tone: "warn",
      detail: `${Number(stats.pendingComments)} 条留言待审核`,
      created_at: new Date().toISOString()
    });
  }
  if (Number(stats?.orphanMediaAssets || 0) > 0) {
    items.push({
      id: "orphan-media",
      kind: "media-cleanup",
      label: "孤儿媒体清理",
      status: "attention",
      tone: "warn",
      detail: `${Number(stats.orphanMediaAssets)} 个未引用媒体可清理`,
      created_at: new Date().toISOString()
    });
  }
  for (const job of searchJobs) {
    items.push({
      id: `search-${job.id}`,
      kind: "search",
      label: "搜索索引同步",
      status: job.status,
      tone: jobTone(job.status),
      detail: job.status === "success" ? `已索引 ${Number(job.indexed_count || 0)} 条内容` : (job.message || "搜索同步失败"),
      created_by: job.created_by,
      started_at: job.started_at,
      finished_at: job.finished_at,
      created_at: normalizeTaskTime(job)
    });
  }
  for (const job of backupJobs) {
    items.push({
      id: `backup-${job.id}`,
      kind: "backup",
      label: "备份快照",
      status: job.status,
      tone: jobTone(job.status),
      detail: job.message || (job.artifact_path ? "JSON 快照已生成" : "备份任务已登记"),
      created_by: job.created_by,
      started_at: job.started_at,
      finished_at: job.finished_at,
      created_at: normalizeTaskTime(job)
    });
  }
  for (const job of githubJobs) {
    items.push({
      id: `github-${job.id}`,
      kind: "github",
      label: "GitHub 仓库同步",
      status: job.status,
      tone: jobTone(job.status),
      detail: job.status === "success" ? `已同步 ${Number(job.repo_count || 0)} 个仓库` : (job.message || "GitHub 仓库同步失败"),
      created_by: job.created_by,
      started_at: job.started_at,
      finished_at: job.finished_at,
      created_at: normalizeTaskTime(job)
    });
  }
  items.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return {
    summary: {
      pendingComments: Number(stats?.pendingComments || 0),
      orphanMediaAssets: Number(stats?.orphanMediaAssets || 0),
      trashItems: Number(stats?.trashItems || 0),
      failedJobs: Number(stats?.failedJobs || 0),
      githubRepositories: Number(stats?.githubRepositories || 0),
      githubSyncJobs: Number(stats?.githubSyncJobs || 0)
    },
    items: items.slice(0, 20)
  };
}

async function interactionInsightsPayload(days = 7) {
  const rangeDays = normalizeLookbackDays(days);
  if (!databaseAvailable) {
    return {
      source: "local-preview",
      rangeDays,
      summary: { views: 0, uniqueVisitors: 0, likeTargets: 0, totalLikes: 0, comments: 0, pendingComments: 0 },
      topViews: [],
      topReactions: [],
      recentComments: [],
      viewTrend: []
    };
  }
  const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
  const [summary] = await query(`SELECT
      (SELECT COUNT(*) FROM view_events WHERE created_at >= :since) AS views,
      (SELECT COUNT(DISTINCT fingerprint) FROM view_events WHERE created_at >= :since AND fingerprint <> '') AS uniqueVisitors,
      (SELECT COUNT(*) FROM reactions WHERE kind='like') AS likeTargets,
      (SELECT COALESCE(SUM(count), 0) FROM reactions WHERE kind='like') AS totalLikes,
      (SELECT COUNT(*) FROM reaction_events WHERE kind='like' AND created_at >= :since) AS reactionEvents,
      (SELECT COUNT(DISTINCT actor_hash) FROM reaction_events WHERE kind='like' AND created_at >= :since) AS uniqueReactors,
      (SELECT COUNT(*) FROM comments WHERE created_at >= :since AND deleted_at IS NULL) AS comments,
      (SELECT COUNT(*) FROM comments WHERE status='pending' AND deleted_at IS NULL) AS pendingComments
    `, { since });
  const topViews = await query(`SELECT target, COUNT(*) AS views, COUNT(DISTINCT fingerprint) AS visitors, MAX(created_at) AS latest_at
    FROM view_events
    WHERE created_at >= :since
    GROUP BY target
    ORDER BY views DESC, latest_at DESC
    LIMIT 12`, { since });
  const topReactions = await query(`SELECT target, count AS likes, updated_at
    FROM reactions
    WHERE kind='like'
    ORDER BY count DESC, updated_at DESC
    LIMIT 12`);
  const recentComments = await query(`SELECT id, target, author_name, content, status, moderation_reason, created_at
    FROM comments
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC, id DESC
    LIMIT 8`);
  const viewTrend = await query(`SELECT DATE(created_at) AS day, COUNT(*) AS views, COUNT(DISTINCT fingerprint) AS visitors
    FROM view_events
    WHERE created_at >= :since
    GROUP BY DATE(created_at)
    ORDER BY day ASC`, { since });
  return {
    rangeDays,
    summary: {
      views: Number(summary?.views || 0),
      uniqueVisitors: Number(summary?.uniqueVisitors || 0),
      likeTargets: Number(summary?.likeTargets || 0),
      totalLikes: Number(summary?.totalLikes || 0),
      comments: Number(summary?.comments || 0),
      pendingComments: Number(summary?.pendingComments || 0),
      reactionEvents: Number(summary?.reactionEvents || 0),
      uniqueReactors: Number(summary?.uniqueReactors || 0)
    },
    topViews,
    topReactions,
    recentComments,
    viewTrend
  };
}

async function recordBackupJob(status, scope, message = "", artifactPath = "", user = null) {
  if (!databaseAvailable) return null;
  const result = await query(`INSERT INTO backup_jobs(status, scope, artifact_path, message, created_by, started_at, finished_at, created_at)
    VALUES(:status, :scope, :artifact_path, :message, :created_by,
      CASE WHEN :status IN ('running','success','failed') THEN NOW() ELSE NULL END,
      CASE WHEN :status IN ('success','failed') THEN NOW() ELSE NULL END,
      NOW())`, {
    status: cleanStatus(status, ["planned", "running", "success", "failed"], "planned"),
    scope: cleanKey(scope, "database"),
    artifact_path: cleanText(artifactPath, 500),
    message: cleanText(message, 500),
    created_by: Number(user?.id) > 0 ? user.id : null
  });
  return getOne("SELECT * FROM backup_jobs WHERE id=:id", { id: result.insertId });
}

const backupSnapshotTables = [
  { name: "categories", scopes: ["content"] },
  { name: "posts", scopes: ["content"] },
  { name: "moments", scopes: ["content"] },
  { name: "projects", scopes: ["content"] },
  { name: "hz_quotes", scopes: ["content"] },
  { name: "interview_items", scopes: ["content"] },
  { name: "interview_topics", scopes: ["content"] },
  { name: "interview_questions", scopes: ["content"] },
  { name: "interview_reviews", scopes: ["content"] },
  { name: "comments", scopes: ["content"] },
  { name: "reactions", scopes: ["content"] },
  { name: "reaction_events", scopes: ["content"] },
  { name: "site_settings", scopes: ["cms"] },
  { name: "page_blocks", scopes: ["cms"] },
  { name: "theme_settings", scopes: ["cms"] },
  { name: "navigation_items", scopes: ["cms"] },
  { name: "setting_versions", scopes: ["cms"] },
  { name: "content_versions", scopes: ["cms"] },
  { name: "media_assets", scopes: ["cms"] },
  { name: "attachment_refs", scopes: ["cms"] },
  { name: "github_repositories", scopes: ["system"] },
  { name: "github_sync_jobs", scopes: ["system"] },
  { name: "audit_logs", scopes: ["system"] },
  { name: "search_sync_jobs", scopes: ["system"] },
  { name: "backup_jobs", scopes: ["system"] },
  { name: "roles", scopes: ["system"] },
  { name: "permissions", scopes: ["system"] },
  { name: "role_permissions", scopes: ["system"] },
  { name: "user_roles", scopes: ["system"] }
];

function backupDirectory() {
  return path.resolve(process.cwd(), "backups");
}

function safeDownloadFilename(name) {
  return String(name || "joe-backup.json").replace(/[^\w.-]+/g, "_").slice(0, 120) || "joe-backup.json";
}

function quotedIdentifier(name) {
  if (!/^[a-z0-9_]+$/i.test(name)) throw new Error("非法表名");
  return `\`${name}\``;
}

function isBackupArtifactPath(file) {
  const root = path.resolve(backupDirectory()).toLowerCase();
  const resolved = path.resolve(String(file || "")).toLowerCase();
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}

async function getBackupJob(id) {
  if (!databaseAvailable) return null;
  return getOne("SELECT * FROM backup_jobs WHERE id=:id", { id });
}

function resolveBackupArtifact(job) {
  const artifactPath = path.resolve(String(job?.artifact_path || ""));
  if (!job?.artifact_path || !isBackupArtifactPath(artifactPath)) {
    return { error: "invalid_artifact", message: "备份文件路径无效或不在 backups 目录内。" };
  }
  if (!fs.existsSync(artifactPath) || !fs.statSync(artifactPath).isFile()) {
    return { error: "artifact_missing", message: "备份文件不存在，可能已被移动或清理。" };
  }
  return { file: artifactPath };
}

function backupTablesForScope(scope) {
  const normalizedScope = cleanKey(scope, "database");
  if (normalizedScope === "database" || normalizedScope === "all") return backupSnapshotTables;
  const filtered = backupSnapshotTables.filter((table) => table.scopes.includes(normalizedScope));
  return filtered.length ? filtered : backupSnapshotTables;
}

async function buildBackupSnapshot(scope = "database") {
  const normalizedScope = cleanKey(scope, "database");
  const tables = backupTablesForScope(normalizedScope);
  const snapshot = {
    app: "Joe",
    version: 1,
    scope: normalizedScope,
    created_at: new Date().toISOString(),
    tables: {},
    counts: {},
    warnings: []
  };
  for (const table of tables) {
    if (!/^[a-z0-9_]+$/i.test(table.name)) continue;
    try {
      const rows = await query(`SELECT * FROM ${table.name}`);
      snapshot.tables[table.name] = rows;
      snapshot.counts[table.name] = rows.length;
    } catch (error) {
      if (error.errno === 1146) {
        snapshot.tables[table.name] = [];
        snapshot.counts[table.name] = 0;
        snapshot.warnings.push(`${table.name} 不存在，已跳过`);
      } else {
        throw error;
      }
    }
  }
  return snapshot;
}

function backupTablesForRestore(snapshot, includeSystem = false) {
  const blocked = new Set(["audit_logs", "backup_jobs", "search_sync_jobs"]);
  return backupSnapshotTables.filter((table) => {
    if (!snapshot.tables || !Object.prototype.hasOwnProperty.call(snapshot.tables, table.name)) return false;
    if (blocked.has(table.name)) return false;
    if (!includeSystem && table.scopes.includes("system")) return false;
    return true;
  });
}

async function restoreTableRows(connection, tableName, rows) {
  const table = quotedIdentifier(tableName);
  await connection.query(`DELETE FROM ${table}`);
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row || {})))).filter((column) => /^[a-z0-9_]+$/i.test(column));
  if (!columns.length) return 0;
  const columnSql = columns.map(quotedIdentifier).join(", ");
  const placeholderSql = columns.map(() => "?").join(", ");
  for (const row of rows) {
    await connection.query(`INSERT INTO ${table} (${columnSql}) VALUES (${placeholderSql})`, columns.map((column) => row[column] ?? null));
  }
  return rows.length;
}

async function restoreBackupJob(req, user, id, body = {}) {
  const job = await getBackupJob(id);
  if (!job) return { error: "not_found", message: "没有找到这个备份任务。" };
  if (job.status !== "success") return { error: "invalid_status", message: "只有已完成的备份快照可以恢复。" };
  const artifact = resolveBackupArtifact(job);
  if (artifact.error) return artifact;
  const raw = await fs.promises.readFile(artifact.file, "utf8");
  const snapshot = JSON.parse(raw);
  if (snapshot?.app !== "Joe" || !snapshot.tables || typeof snapshot.tables !== "object") {
    return { error: "invalid_snapshot", message: "备份文件格式不正确。" };
  }
  const includeSystem = body.includeSystem === true || body.include_system === true;
  const tables = backupTablesForRestore(snapshot, includeSystem);
  if (!tables.length) return { error: "empty_snapshot", message: "这个备份里没有可恢复的数据表。" };
  const restored = {};
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("SET FOREIGN_KEY_CHECKS=0");
    for (const table of [...tables].reverse()) {
      await connection.query(`DELETE FROM ${quotedIdentifier(table.name)}`);
    }
    for (const table of tables) {
      restored[table.name] = await restoreTableRows(connection, table.name, snapshot.tables[table.name]);
    }
    await connection.query("SET FOREIGN_KEY_CHECKS=1");
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS=1").catch(() => {});
    connection.release();
  }
  await Promise.all([
    cacheDel("site:overview"),
    cacheDel(publicCmsCacheKeys())
  ]).catch(() => {});
  syncSearchIndex().catch((error) => console.warn("search sync after backup restore failed", error.message || error));
  await writeAuditLog(req, user, "restore-backup", "backup-job", id, null, {
    artifact_path: job.artifact_path,
    includeSystem,
    tables: restored
  });
  return { ok: true, item: job, restored, includeSystem };
}

function sendBackupArtifact(req, res, job) {
  const artifact = resolveBackupArtifact(job);
  if (artifact.error) {
    json(res, artifact, artifact.error === "artifact_missing" ? 404 : 400);
    return true;
  }
  const filename = safeDownloadFilename(path.basename(artifact.file));
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
    "Content-Length": fs.statSync(artifact.file).size
  });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(artifact.file).pipe(res);
  return true;
}

async function runBackupJob(req, user, scope = "database", message = "后台手动创建 JSON 备份") {
  const normalizedScope = cleanKey(scope, "database");
  const runningJob = await recordBackupJob("running", normalizedScope, "正在创建 JSON 备份快照", "", user);
  if (!runningJob) return { error: "database_unavailable", message: "数据库不可用，无法创建备份快照。" };
  try {
    const snapshot = await buildBackupSnapshot(normalizedScope);
    const dir = backupDirectory();
    await fs.promises.mkdir(dir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(dir, `joe-backup-${timestamp}.json`);
    await fs.promises.writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    const successMessage = cleanText(message || `已导出 ${Object.keys(snapshot.tables).length} 张表`, 500);
    await query(`UPDATE backup_jobs
      SET status='success', artifact_path=:artifact_path, message=:message, finished_at=NOW()
      WHERE id=:id`, {
      id: runningJob.id,
      artifact_path: filePath,
      message: successMessage
    });
    const job = await getOne("SELECT * FROM backup_jobs WHERE id=:id", { id: runningJob.id });
    await writeAuditLog(req, user, "backup", "backup-job", job.id, runningJob, {
      ...job,
      tables: snapshot.counts,
      warnings: snapshot.warnings
    });
    return { item: job, snapshot: { counts: snapshot.counts, warnings: snapshot.warnings } };
  } catch (error) {
    const failMessage = cleanText(error.message || "备份快照创建失败", 500);
    await query("UPDATE backup_jobs SET status='failed', message=:message, finished_at=NOW() WHERE id=:id", {
      id: runningJob.id,
      message: failMessage
    }).catch(() => {});
    const job = await getOne("SELECT * FROM backup_jobs WHERE id=:id", { id: runningJob.id }).catch(() => runningJob);
    await writeAuditLog(req, user, "backup-failed", "backup-job", runningJob.id, runningJob, { ...job, error: failMessage });
    return { error: "backup_failed", message: failMessage, item: job };
  }
}

function pageBlockFromRow(row = {}) {
  return {
    ...row,
    payload: parseJsonObject(row.payload_json, {}),
    payload_json: undefined
  };
}

function themeSettingFromRow(row = {}) {
  return {
    ...row,
    payload: parseJsonObject(row.payload_json, {}),
    payload_json: undefined
  };
}

function normalizePageBlockPayload(body = {}, current = {}) {
  const payload = body.payload && typeof body.payload === "object"
    ? body.payload
    : parseJsonObject(body.payload_json, parseJsonObject(current.payload_json, {}));
  return {
    page_key: cleanKey(body.page_key || body.pageKey || current.page_key, "home"),
    block_key: cleanKey(body.block_key || body.blockKey || current.block_key, `block-${Date.now().toString(36)}`),
    title: cleanText(body.title ?? current.title ?? "", 160),
    payload_json: compactJson(payload, 100000) || "{}",
    status: cleanStatus(body.status, ["draft", "published", "hidden"], current.status || "published"),
    sort_order: clampNumber(body.sort_order ?? body.sortOrder ?? current.sort_order, -9999, 9999, 0)
  };
}

function normalizeThemeSettingPayload(body = {}, current = {}) {
  const payload = body.payload && typeof body.payload === "object"
    ? body.payload
    : parseJsonObject(body.payload_json, parseJsonObject(current.payload_json, {}));
  return {
    scope_key: cleanKey(body.scope_key || body.scopeKey || current.scope_key, "default"),
    payload_json: compactJson(payload, 100000) || "{}",
    status: cleanStatus(body.status, ["draft", "published"], current.status || "published")
  };
}

function normalizeNavigationPayload(body = {}, current = {}) {
  return {
    label: cleanText(body.label ?? current.label ?? "未命名导航", 80) || "未命名导航",
    href: cleanUiHref(body.href ?? current.href ?? "/", "/"),
    icon: cleanText(body.icon ?? current.icon ?? "", 40),
    placement: cleanKey(body.placement ?? current.placement ?? "main", "main"),
    visible: body.visible === undefined ? Number(current.visible ?? 1) : (body.visible ? 1 : 0),
    sort_order: clampNumber(body.sort_order ?? body.sortOrder ?? current.sort_order, -9999, 9999, 0)
  };
}

async function restoreSettingVersion(req, user, version) {
  if (!version) return { error: "not_found" };
  const payload = parseJsonObject(version.payload_json, {});
  const scopeKey = cleanKey(version.scope_key, "");
  if (scopeKey === "frontend-editor" || scopeKey === "site-texts") {
    const restored = await publishFrontendEditorPayload(payload, `restore:${scopeKey}:v${version.version}`, user);
    await writeAuditLog(req, user, "restore-version", "setting-version", version.id, version, restored);
    return { ok: true, scopeKey, payload: restored };
  }
  if (scopeKey === "frontend-layout") {
    const layout = normalizeFrontendLayout(payload.layout || payload);
    const ui = normalizeFrontendUi(payload.ui || {});
    await setSetting(frontendLayoutSettingKey, JSON.stringify(layout));
    await setSetting(frontendUiSettingKey, JSON.stringify(ui));
    await cacheDel("site:texts");
    const restored = await adminFrontendLayoutPayload();
    await recordSettingVersion("frontend-layout", restored, user, `restore:v${version.version}`);
    await writeAuditLog(req, user, "restore-version", "setting-version", version.id, version, restored);
    return { ok: true, scopeKey, payload: restored };
  }
  if (scopeKey === "about-gallery") {
    const currentUi = await getFrontendUi();
    const nextUi = normalizeFrontendUi({ ...currentUi, aboutGalleryImages: payload.items || payload.aboutGalleryImages || [] });
    await setSetting(frontendUiSettingKey, JSON.stringify(nextUi));
    await cacheDel("site:texts");
    const restored = await adminAboutGalleryPayload();
    await recordSettingVersion("about-gallery", restored, user, `restore:v${version.version}`);
    await writeAuditLog(req, user, "restore-version", "setting-version", version.id, version, restored);
    return { ok: true, scopeKey, payload: restored };
  }
  if (scopeKey === "settings") {
    const restored = await saveAdminSettings(payload);
    await cacheDel([`github:contrib:${restored.githubUsername}`, `github:contrib:${restored.githubUsername.toLowerCase()}`, `github:repos:${restored.githubUsername}`, `github:repos:${restored.githubUsername.toLowerCase()}`]);
    refreshGithubContributionsSnapshot(restored.githubUsername).catch((error) => console.warn("github refresh after settings restore failed", error));
    syncGithubRepositories(null, user, restored.githubUsername).catch((error) => console.warn("github repositories sync after settings restore failed", error));
    await recordSettingVersion("settings", restored, user, `restore:v${version.version}`);
    await writeAuditLog(req, user, "restore-version", "setting-version", version.id, version, restored);
    return { ok: true, scopeKey, payload: restored };
  }
  return { error: "unsupported_scope", message: "这个配置版本暂不支持一键恢复" };
}

function humanFileTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function inspectResource(label, targetPath, expected = "file") {
  const resolved = path.resolve(targetPath);
  try {
    if (!fs.existsSync(resolved)) {
      return {
        label,
        path: resolved,
        value: "未找到",
        tone: expected === "dir-optional" ? "warn" : "danger",
        detail: expected === "dir-optional" ? "目录会在首次上传时自动创建。" : "文件或目录不存在，需要检查构建/部署。"
      };
    }
    const stat = fs.statSync(resolved);
    const isDir = stat.isDirectory();
    const isFile = stat.isFile();
    const ok = expected.startsWith("dir") ? isDir : isFile;
    return {
      label,
      path: resolved,
      value: ok ? "就绪" : "类型异常",
      tone: ok ? "ok" : "danger",
      detail: ok ? `最后更新：${humanFileTime(stat.mtime)}` : `期望 ${expected.startsWith("dir") ? "目录" : "文件"}，实际不是。`
    };
  } catch (error) {
    return {
      label,
      path: resolved,
      value: "检查失败",
      tone: "danger",
      detail: error.message || "无法读取路径状态。"
    };
  }
}

async function adminRuntimeStats() {
  if (!databaseAvailable) return fallbackAdminOverview().stats;
  try {
    const [stats] = await query(`
      SELECT
        (SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL) AS posts,
        (SELECT COUNT(*) FROM posts WHERE status='published' AND deleted_at IS NULL) AS publishedPosts,
        (SELECT COUNT(*) FROM posts WHERE status='draft' AND deleted_at IS NULL) AS draftPosts,
        (SELECT COUNT(*) FROM moments WHERE deleted_at IS NULL) AS moments,
        (SELECT COUNT(*) FROM moments WHERE status='published' AND deleted_at IS NULL) AS publishedMoments,
        (SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL) AS projects,
        (SELECT COUNT(*) FROM projects WHERE status='active' AND deleted_at IS NULL) AS activeProjects,
        (SELECT COUNT(*) FROM interview_items WHERE deleted_at IS NULL) AS interviews,
        (SELECT COUNT(*) FROM interview_items WHERE status='published' AND deleted_at IS NULL) AS publishedInterviews,
        (SELECT COUNT(*) FROM interview_topics WHERE deleted_at IS NULL) AS interviewTopics,
        (SELECT COUNT(*) FROM interview_questions WHERE deleted_at IS NULL) AS interviewQuestions,
        (SELECT COUNT(*) FROM interview_reviews WHERE deleted_at IS NULL) AS interviewReviews,
        (SELECT COUNT(*) FROM comments WHERE deleted_at IS NULL) AS comments,
        (SELECT COUNT(*) FROM comments WHERE status='pending' AND deleted_at IS NULL) AS pendingComments,
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM roles) AS roles,
        (SELECT COUNT(*) FROM permissions) AS permissions,
        (SELECT COUNT(*) FROM posts WHERE deleted_at IS NOT NULL)
          + (SELECT COUNT(*) FROM moments WHERE deleted_at IS NOT NULL)
          + (SELECT COUNT(*) FROM projects WHERE deleted_at IS NOT NULL)
          + (SELECT COUNT(*) FROM interview_items WHERE deleted_at IS NOT NULL)
        + (SELECT COUNT(*) FROM interview_topics WHERE deleted_at IS NOT NULL)
        + (SELECT COUNT(*) FROM interview_questions WHERE deleted_at IS NOT NULL)
        + (SELECT COUNT(*) FROM interview_reviews WHERE deleted_at IS NOT NULL)
        + (SELECT COUNT(*) FROM comments WHERE deleted_at IS NOT NULL) AS trashItems,
        (SELECT COUNT(*) FROM audit_logs) AS auditLogs,
        (SELECT COUNT(*) FROM setting_versions) AS settingVersions,
        (SELECT COUNT(*) FROM content_versions) AS contentVersions,
        (SELECT COUNT(*) FROM media_assets WHERE deleted_at IS NULL) AS mediaAssets,
        (SELECT COUNT(*) FROM media_assets m WHERE m.deleted_at IS NULL AND NOT EXISTS (
          SELECT 1 FROM attachment_refs r WHERE r.media_asset_id=m.id OR r.media_url=m.url
        )) AS orphanMediaAssets,
        (SELECT COUNT(*) FROM search_sync_jobs) AS searchJobs,
        (SELECT COUNT(*) FROM backup_jobs) AS backupJobs,
        (SELECT COUNT(*) FROM github_repositories WHERE archived=0 AND fork=0) AS githubRepositories,
        (SELECT COUNT(*) FROM github_sync_jobs) AS githubSyncJobs
    `);
    return stats || fallbackAdminOverview().stats;
  } catch (error) {
    markDatabaseUnavailable(error, "admin system status database");
    return fallbackAdminOverview().stats;
  }
}

async function adminSystemStatusPayload(user) {
  const stats = await adminRuntimeStats();
  const adminStatic = inspectResource("后台静态包", adminIndexFile, "file");
  const uploads = inspectResource("上传目录", config.uploads.dir, "dir-optional");
  const backupStorage = inspectResource("备份目录", backupDirectory(), "dir-optional");
  const publicFrontend = inspectResource("前台目录", path.resolve(process.cwd(), "..", "blog-redesign"), "dir");
  const generatedAt = new Date();
  const mode = databaseAvailable ? "database" : "local-preview";
  const checks = [
    {
      key: "database",
      label: "数据库",
      value: databaseAvailable ? "已连接" : "本地预览",
      tone: databaseAvailable ? "ok" : "warn",
      detail: databaseAvailable ? "管理端正在读取真实 MySQL 数据。" : "MySQL 不可用时自动使用预览数据，方便本地看 UI。"
    },
    {
      key: "admin-static",
      label: "后台构建",
      value: adminStatic.value,
      tone: adminStatic.tone,
      detail: adminStatic.detail
    },
    {
      key: "uploads",
      label: "媒体上传",
      value: uploads.value,
      tone: uploads.tone,
      detail: uploads.detail
    },
    {
      key: "search",
      label: "搜索索引",
      value: "可手动同步",
      tone: "neutral",
      detail: `Meilisearch 地址：${config.meili.host || "未配置"}`
    },
    {
      key: "backup",
      label: "备份能力",
      value: backupStorage.value,
      tone: backupStorage.tone,
      detail: backupStorage.value === "未找到" ? "首次创建 JSON 快照时会自动生成 backups 目录。" : backupStorage.detail
    },
    {
      key: "runtime",
      label: "Node 运行时",
      value: process.version,
      tone: "ok",
      detail: `已运行 ${Math.max(1, Math.round(process.uptime() / 60))} 分钟。`
    }
  ];
  return {
    generatedAt: generatedAt.toISOString(),
    generatedAtText: humanFileTime(generatedAt),
    mode,
    modeLabel: databaseAvailable ? "真实数据库模式" : "本地预览模式",
    modeDetail: databaseAvailable ? "后台数据来自 MySQL，适合正式编辑。" : "后台数据来自内置兜底，适合本地预览和 UI 调整。",
    user: { id: user?.id, username: user?.username, preview: Boolean(user?.preview) },
    checks,
    resources: [adminStatic, publicFrontend, uploads, backupStorage],
    contentStats: [
      { label: "文章", value: Number(stats.posts || 0), detail: `${Number(stats.publishedPosts || 0)} 已发布 / ${Number(stats.draftPosts || 0)} 草稿` },
      { label: "瞬间", value: Number(stats.moments || 0), detail: `${Number(stats.publishedMoments || stats.moments || 0)} 已发布` },
      { label: "项目", value: Number(stats.projects || 0), detail: `${Number(stats.activeProjects || 0)} 个展示中` },
      { label: "面试", value: Number(stats.interviews || 0), detail: `${Number(stats.publishedInterviews || 0)} 已发布` },
      { label: "留言", value: Number(stats.comments || 0), detail: `${Number(stats.pendingComments || 0)} 待处理` },
      { label: "后台用户", value: Number(stats.users || 0), detail: "可登录后台的账号" },
      { label: "角色权限", value: Number(stats.roles || 0), detail: `${Number(stats.permissions || 0)} 个权限点` },
      { label: "审计", value: Number(stats.auditLogs || 0), detail: "后台关键改动记录" },
      { label: "配置版本", value: Number(stats.settingVersions || 0), detail: "前台文案/主题发布快照" },
      { label: "内容版本", value: Number(stats.contentVersions || 0), detail: "内容保存/删除/恢复快照" },
      { label: "媒体资源", value: Number(stats.mediaAssets || 0), detail: `${Number(stats.orphanMediaAssets || 0)} 个可清理` },
      { label: "搜索任务", value: Number(stats.searchJobs || 0), detail: "搜索同步 job 记录" },
      { label: "备份快照", value: Number(stats.backupJobs || 0), detail: "JSON 快照与计划备份记录" },
      { label: "GitHub 仓库", value: Number(stats.githubRepositories || 0), detail: `${Number(stats.githubSyncJobs || 0)} 条同步记录` }
    ]
  };
}


async function getInterviewDailySet(requestedDate) {
  const exact = await getOne("SELECT *, DATE_FORMAT(day_date, '%Y-%m-%d') AS day_date FROM interview_daily_sets WHERE status='published' AND day_date=:day_date LIMIT 1", { day_date: requestedDate });
  if (exact) return exact;
  return getOne("SELECT *, DATE_FORMAT(day_date, '%Y-%m-%d') AS day_date FROM interview_daily_sets WHERE status='published' AND day_date<=:day_date ORDER BY day_date DESC LIMIT 1", { day_date: requestedDate });
}

async function selectInterviewQuestionsByIds(ids = []) {
  const cleanIds = ids.map((id) => cleanId(id)).filter(Boolean).slice(0, 50);
  if (!cleanIds.length) return [];
  const { params, sql } = questionIdPlaceholders(cleanIds);
  const rows = await query("SELECT q.*, t.slug AS topic_slug, t.title AS topic_title FROM interview_questions q LEFT JOIN interview_topics t ON t.id=q.topic_id WHERE q.id IN (" + sql + ") AND q.status='published' AND q.deleted_at IS NULL AND " + publicInterviewQuestionFilter("q"), params);
  await attachInterviewGoalIds(rows);
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  return cleanIds.map((id) => byId.get(String(id))).filter(Boolean);
}

async function selectPublishedInterviewQuestions(limit = 50) {
  const safeLimit = Math.min(160, Math.max(1, Number.parseInt(limit, 10) || 50));
  const rows = await query(`SELECT q.*, t.slug AS topic_slug, t.title AS topic_title FROM interview_questions q LEFT JOIN interview_topics t ON t.id=q.topic_id WHERE q.status='published' AND q.deleted_at IS NULL AND ${publicInterviewQuestionFilter("q")} ORDER BY COALESCE(t.sort_order,9999) ASC, q.sort_order ASC, q.updated_at DESC, q.id DESC LIMIT ${safeLimit}`);
  await attachInterviewGoalIds(rows);
  return rows
    .map((row) => ({ row, missing: interviewTrainingMissing(row.answer_points).length }))
    .sort((a, b) => a.missing - b.missing || Number(a.row.sort_order || 0) - Number(b.row.sort_order || 0) || Number(a.row.id || 0) - Number(b.row.id || 0))
    .slice(0, 50)
    .map((item) => item.row);
}

async function questionsForDailySet(set) {
  if (!set) return selectPublishedInterviewQuestions(50);
  const rows = await selectInterviewQuestionsByIds(parseJsonArray(set.question_ids));
  return rows.length ? rows : selectPublishedInterviewQuestions(50);
}

function interviewClientHash(req) {
  const clientKey = cleanText(req.headers["x-client-key"] || "", 160);
  return privacyHash(clientKey || clientFingerprint(req));
}

function progressCompleted(total, doneCount) {
  return Number(total || 0) >= 50 && Number(doneCount || 0) >= Number(total || 0);
}

function addDays(dateText, days) {
  const [year, month, day] = String(dateText || "").slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year || 1970, (month || 1) - 1, (day || 1) + days, 12, 0, 0));
  return date.toISOString().slice(0, 10);
}

async function progressRowsForRange(client_hash, start, end) {
  return query(`SELECT DATE_FORMAT(day_date, '%Y-%m-%d') AS date, SUM(CASE WHEN completed=1 THEN 1 ELSE 0 END) AS done_count
    FROM interview_progress
    WHERE client_hash=:client_hash AND day_date>=:start AND day_date<=:end
    GROUP BY day_date`, { client_hash, start, end });
}

async function publicInterviewDaily(url) {
  const requestedDate = cleanDateValue(url.searchParams.get("date")) || shanghaiDate();
  await ensureInterviewQuestionGoalBackfill();
  const set = await getInterviewDailySet(requestedDate);
  const rows = await questionsForDailySet(set);
  const date = set?.day_date || requestedDate;
  return {
    requestedDate,
    date,
    title: set?.title || "每日 50 问",
    subtitle: set?.subtitle || "从后台题库发布的模拟面试题单。",
    total: rows.length,
    questions: rows.map((row, index) => publicInterviewDailyQuestion(row, index + 1)),
    sidebar: parseJsonObject(set?.sidebar_json, defaultInterviewSidebar),
    fallback: Boolean(set && date !== requestedDate),
    source: { provider: set?.source_provider || "admin", model: set?.source_model || "manual", generatedAt: set?.generated_at || null },
    generationStatus: set?.generation_status || (rows.length ? "fallback-question-bank" : "missing"),
    fallbackReason: set && date !== requestedDate ? "requested_date_missing" : (set ? "" : "no_daily_set")
  };
}

async function publicInterviewCalendar(req, url) {
  const month = cleanText(url.searchParams.get("month") || shanghaiDate().slice(0, 7), 7);
  const start = /^\d{4}-\d{2}$/.test(month) ? month + "-01" : shanghaiDate().slice(0, 7) + "-01";
  const [yearText, monthText] = start.slice(0, 7).split("-");
  const end = `${yearText}-${monthText}-${String(new Date(Number(yearText), Number(monthText), 0).getDate()).padStart(2, "0")}`;
  const streakStart = addDays(start, -120);
  const [rows, streakRows, progressRows] = await Promise.all([
    query("SELECT DATE_FORMAT(day_date, '%Y-%m-%d') AS date, title, status, JSON_LENGTH(question_ids) AS total, generation_status, source_provider, generated_at FROM interview_daily_sets WHERE day_date>=:start AND day_date<DATE_ADD(:start, INTERVAL 1 MONTH) ORDER BY day_date ASC", { start }),
    query("SELECT DATE_FORMAT(day_date, '%Y-%m-%d') AS date, JSON_LENGTH(question_ids) AS total FROM interview_daily_sets WHERE status='published' AND day_date>=:start AND day_date<=:end ORDER BY day_date ASC", { start: streakStart, end }),
    progressRowsForRange(interviewClientHash(req), streakStart, end)
  ]);
  const doneByDate = new Map(progressRows.map((row) => [row.date, Number(row.done_count || 0)]));
  const totalByDate = new Map(streakRows.map((row) => [row.date, Number(row.total || 0)]));
  const streakByDate = new Map();
  let cursor = streakStart;
  let streak = 0;
  while (cursor <= end) {
    const total = totalByDate.get(cursor) || 0;
    const completed = progressCompleted(total, doneByDate.get(cursor) || 0);
    streak = completed ? streak + 1 : 0;
    if (completed) streakByDate.set(cursor, streak);
    cursor = addDays(cursor, 1);
  }
  return {
    month: start.slice(0, 7),
    items: rows.map((row) => ({
      date: row.date,
      title: row.title || "每日 50 问",
      status: row.status || "draft",
      total: Number(row.total || 0),
      doneCount: doneByDate.get(row.date) || 0,
      completed: progressCompleted(Number(row.total || 0), doneByDate.get(row.date) || 0),
      streak: streakByDate.get(row.date) || 0,
      generationStatus: row.generation_status || "",
      sourceProvider: row.source_provider || "",
      generatedAt: row.generated_at || null
    }))
  };
}

function buildInterviewGoalTree(items = []) {
  const byId = new Map(items.map((item) => [String(item.id), { ...item, children: [] }]));
  const roots = [];
  for (const item of byId.values()) {
    const parent = item.parentId ? byId.get(String(item.parentId)) : null;
    if (parent && parent.id !== item.id) parent.children.push(item);
    else roots.push(item);
  }
  const sortNodes = (nodes) => {
    nodes.sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || Number(a.id || 0) - Number(b.id || 0));
    nodes.forEach((node) => sortNodes(node.children || []));
  };
  sortNodes(roots);
  return roots;
}

function flattenInterviewGoalTree(nodes = []) {
  return nodes.flatMap((node) => [node, ...flattenInterviewGoalTree(node.children || [])]);
}

function publicInterviewGoalQuestionPreview(row = {}) {
  return {
    questionKey: row.slug || String(row.id || ""),
    id: row.id || null,
    title: row.title || "",
    tags: parseTags(row.tags).slice(0, 4),
    difficulty: row.difficulty || "",
    completed: Boolean(row.completed),
    weak: Boolean(row.is_difficult)
  };
}

async function goalQuestionPreviewRows(client_hash, questionIds = []) {
  const cleanIds = parseIdList(questionIds).slice(0, 200);
  if (!cleanIds.length) return [];
  const { params, sql } = questionIdPlaceholders(cleanIds);
  return query(`SELECT l.goal_id, q.id, q.slug, q.title, q.tags, q.difficulty, q.is_difficult,
    MAX(CASE WHEN p.completed=1 THEN 1 ELSE 0 END) AS completed
    FROM interview_goal_question_links l
    JOIN interview_questions q ON q.id=l.question_id AND q.status='published' AND q.deleted_at IS NULL AND ${publicInterviewQuestionFilter("q")}
      AND q.id IN (${sql})
    LEFT JOIN interview_progress p ON p.client_hash=:client_hash AND (
      CONVERT(p.question_key USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(q.slug USING utf8mb4) COLLATE utf8mb4_unicode_ci
      OR CONVERT(p.question_key USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(CAST(q.id AS CHAR) USING utf8mb4) COLLATE utf8mb4_unicode_ci
    )
    GROUP BY l.goal_id, q.id
    ORDER BY l.is_primary DESC, q.sort_order ASC, q.updated_at DESC, q.id DESC
    LIMIT 800`, { client_hash, ...params });
}

function enhanceInterviewGoalTree(tree = [], previewRows = []) {
  const rowsByGoal = new Map();
  for (const row of previewRows) {
    const key = String(row.goal_id || "");
    if (!rowsByGoal.has(key)) rowsByGoal.set(key, []);
    rowsByGoal.get(key).push(row);
  }
  const seenQuestion = (items = []) => {
    const seen = new Set();
    return items.filter((item) => {
      const key = item.questionKey || item.id || item.title;
      if (!key || seen.has(String(key))) return false;
      seen.add(String(key));
      return true;
    });
  };
  const visit = (node) => {
    const directRows = rowsByGoal.get(String(node.id)) || [];
    const directTags = [...new Set(directRows.flatMap((row) => parseTags(row.tags)).filter(Boolean))];
    node.descendantIds = [String(node.id)];
    node.questionPreview = directRows.map(publicInterviewGoalQuestionPreview).slice(0, 6);
    node.knowledgePoints = directTags.slice(0, 8);
    for (const child of node.children || []) {
      visit(child);
      node.descendantIds.push(...(child.descendantIds || []));
      node.questionCount += Number(child.questionCount || 0);
      node.completedCount += Number(child.completedCount || 0);
      node.weakCount += Number(child.weakCount || 0);
      node.mistakeCount += Number(child.mistakeCount || 0);
      node.questionPreview = seenQuestion([...(node.questionPreview || []), ...(child.questionPreview || [])]).slice(0, 6);
    }
    node.descendantIds = [...new Set(node.descendantIds.map(String))];
    if (node.children?.length) node.knowledgePoints = node.children.map((child) => child.title).filter(Boolean).slice(0, 8);
    node.autoProgress = node.questionCount ? Math.round((node.completedCount / node.questionCount) * 100) : 0;
    node.displayProgress = node.questionCount ? node.autoProgress : Number(node.manualProgress || 0);
  };
  tree.forEach(visit);
  return tree;
}

async function refreshInterviewGoalDistinctRollups(flat = [], client_hash = "") {
  const parentNodes = flat.filter((node) => Array.isArray(node.descendantIds) && node.descendantIds.length > 1);
  for (const node of parentNodes) {
    const ids = node.descendantIds.map((id) => String(id || "").trim()).filter(Boolean);
    if (!ids.length) continue;
    const { params, sql } = questionIdPlaceholders(ids);
    const row = await getOne(`SELECT
      COUNT(DISTINCT q.id) AS question_count,
      COUNT(DISTINCT CASE WHEN p.completed=1 THEN q.id END) AS completed_count,
      COUNT(DISTINCT CASE WHEN q.is_difficult=1 THEN q.id END) AS weak_count
      FROM interview_goal_question_links l
      JOIN interview_questions q ON q.id=l.question_id AND q.status='published' AND q.deleted_at IS NULL AND ${publicInterviewQuestionFilter("q")}
      LEFT JOIN interview_progress p ON p.client_hash=:client_hash AND (
        CONVERT(p.question_key USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(q.slug USING utf8mb4) COLLATE utf8mb4_unicode_ci
        OR CONVERT(p.question_key USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(CAST(q.id AS CHAR) USING utf8mb4) COLLATE utf8mb4_unicode_ci
      )
      WHERE l.goal_id IN (${sql})`, { ...params, client_hash });
    node.questionCount = Number(row?.question_count || 0);
    node.completedCount = Number(row?.completed_count || 0);
    node.weakCount = Number(row?.weak_count || 0);
    node.autoProgress = node.questionCount ? Math.round((node.completedCount / node.questionCount) * 100) : 0;
    node.displayProgress = node.questionCount ? node.autoProgress : Number(node.manualProgress || 0);
  }
}

async function resolveInterviewGoalFilterIds({ goalIds = [], goalSlug = "" } = {}) {
  const seedIds = new Set((goalIds || []).map((id) => String(id || "").trim()).filter(Boolean));
  const cleanSlug = cleanKey(goalSlug || "", "");
  if (cleanSlug) {
    const goal = await getOne("SELECT id FROM interview_goal_nodes WHERE slug=:slug AND visible=1 AND deleted_at IS NULL LIMIT 1", { slug: cleanSlug }).catch(() => null);
    if (goal?.id) seedIds.add(String(goal.id));
  }
  if (!seedIds.size) return [];
  const rows = await query("SELECT id,parent_id FROM interview_goal_nodes WHERE visible=1 AND deleted_at IS NULL");
  const childrenByParent = new Map();
  for (const row of rows) {
    const parentKey = String(row.parent_id || "");
    if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, []);
    childrenByParent.get(parentKey).push(String(row.id));
  }
  const result = new Set();
  const stack = [...seedIds];
  while (stack.length) {
    const id = String(stack.pop() || "");
    if (!id || result.has(id)) continue;
    result.add(id);
    for (const childId of childrenByParent.get(id) || []) stack.push(childId);
  }
  return [...result];
}

async function publicInterviewPlan(req, url) {
  const date = cleanDateValue(url.searchParams.get("date")) || shanghaiDate();
  if (!databaseAvailable) {
    const nodes = interviewGoalDefaults.map((item, index) => publicInterviewGoalNode({
      ...item,
      id: index + 1,
      parent_id: item.parent ? interviewGoalDefaults.findIndex((parent) => parent.slug === item.parent) + 1 : null,
      visible: 1
    }));
    const tree = buildInterviewGoalTree(nodes);
    return {
      date,
      tree,
      flat: nodes,
      board: Object.fromEntries(Object.keys(interviewGoalStatusLabels).map((status) => [status, nodes.filter((node) => node.status === status)])),
      summary: { totalGoals: nodes.length, questionCount: 0, completedCount: 0, weakCount: 0, mistakeCount: 0, overallProgress: 0 },
      today: { title: "每日 50 问", total: 0, doneCount: 0, completed: false },
      topWeak: [],
      recentUpdates: [],
      other: nodes.find((item) => item.slug === "other") || null,
      source: "local-preview"
    };
  }

  const client_hash = interviewClientHash(req);
  const cacheKey = `interview-plan:v9:${date}`;
  const basePlan = await publicRouteCached(cacheKey, 120, async () => {
    ensureInterviewQuestionGoalBackfill().catch((error) => console.warn("interview goal backfill skipped", error?.message || error));
    const [dailySet, rows, countRows, unlinked, bankSummary] = await Promise.all([
      getInterviewDailySet(date).catch(() => null),
      query(`SELECT g.*,
        0 AS question_count,
        0 AS completed_count,
        0 AS weak_count,
        COUNT(DISTINCT CASE WHEN u.type='mistake' AND u.status='published' AND u.deleted_at IS NULL THEN u.id END) AS mistake_count,
        COUNT(DISTINCT CASE WHEN u.status='published' AND u.deleted_at IS NULL THEN u.id END) AS update_count
        FROM interview_goal_nodes g
        LEFT JOIN interview_goal_updates u ON u.goal_id=g.id AND u.deleted_at IS NULL
        WHERE g.visible=1 AND g.deleted_at IS NULL
        GROUP BY g.id
        ORDER BY COALESCE(g.parent_id,0) ASC, g.sort_order ASC, g.id ASC`),
      query(`SELECT l.goal_id,
        COUNT(DISTINCT q.id) AS question_count,
        COUNT(DISTINCT CASE WHEN q.is_difficult=1 THEN q.id END) AS weak_count
        FROM interview_goal_question_links l
        JOIN interview_questions q ON q.id=l.question_id AND q.status='published' AND q.deleted_at IS NULL AND ${publicInterviewQuestionFilter("q")}
        GROUP BY l.goal_id`),
      getOne(`SELECT
        COUNT(DISTINCT q.id) AS question_count,
        COUNT(DISTINCT CASE WHEN q.is_difficult=1 THEN q.id END) AS weak_count
        FROM interview_questions q
        LEFT JOIN interview_goal_question_links l ON l.question_id=q.id
        WHERE q.status='published' AND q.deleted_at IS NULL AND ${publicInterviewQuestionFilter("q")} AND l.id IS NULL`),
      getOne(`SELECT
        COUNT(DISTINCT q.id) AS question_count,
        COUNT(DISTINCT CASE WHEN q.is_difficult=1 THEN q.id END) AS weak_count
        FROM interview_questions q
        WHERE q.status='published' AND q.deleted_at IS NULL AND ${publicInterviewQuestionFilter("q")}`)
    ]);
    const nodes = rows.map(publicInterviewGoalNode);
    const nodeById = new Map(nodes.map((node) => [String(node.id), node]));
    const otherNode = nodes.find((node) => node.slug === "other") || null;
    for (const row of countRows) {
      const node = nodeById.get(String(row.goal_id || ""));
      if (!node) continue;
      node.questionCount = Number(row.question_count || 0);
      node.completedCount = 0;
      node.weakCount = Number(row.weak_count || 0);
      node.directQuestionCount = node.questionCount;
      node.directCompletedCount = 0;
      node.directWeakCount = node.weakCount;
      node.autoProgress = 0;
      node.displayProgress = node.questionCount ? 0 : Number(node.manualProgress || 0);
    }
    if (otherNode) {
      otherNode.questionCount += Number(unlinked?.question_count || 0);
      otherNode.completedCount = 0;
      otherNode.weakCount += Number(unlinked?.weak_count || 0);
      otherNode.directQuestionCount = Number(otherNode.directQuestionCount || 0) + Number(unlinked?.question_count || 0);
      otherNode.directCompletedCount = 0;
      otherNode.directWeakCount = Number(otherNode.directWeakCount || 0) + Number(unlinked?.weak_count || 0);
      otherNode.autoProgress = 0;
      otherNode.displayProgress = otherNode.questionCount ? 0 : Number(otherNode.manualProgress || 0);
    }
    const tree = enhanceInterviewGoalTree(buildInterviewGoalTree(nodes), []);
    const flat = flattenInterviewGoalTree(tree);
    const weakCount = nodes.reduce((sum, node) => sum + Number(node.directWeakCount ?? node.weakCount ?? 0), 0);
    const mistakeCount = nodes.reduce((sum, node) => sum + Number(node.mistakeCount || 0), 0);
    const dailyIds = parseJsonArray(dailySet?.question_ids);
    const dailyQuestionCount = dailyIds.length || 50;
    const dailyCompletedCount = 0;
    const summaryQuestionCount = Number(bankSummary?.question_count || 0) || nodes.reduce((sum, node) => sum + Number(node.directQuestionCount ?? node.questionCount ?? 0), 0) || dailyQuestionCount;
    const summaryCompletedCount = dailyCompletedCount;
    if (tree.length === 1 && summaryQuestionCount) {
      tree[0].questionCount = summaryQuestionCount;
      tree[0].completedCount = summaryCompletedCount;
      tree[0].autoProgress = Math.round((summaryCompletedCount / summaryQuestionCount) * 100);
      tree[0].displayProgress = tree[0].autoProgress;
    }
    return {
      date,
      tree,
      summary: {
        totalGoals: flat.length,
        questionCount: summaryQuestionCount,
        completedCount: summaryCompletedCount,
        weakCount,
        mistakeCount,
        overallProgress: summaryQuestionCount ? Math.round((summaryCompletedCount / summaryQuestionCount) * 100) : 0
      },
      today: {
        date: dailySet?.day_date || date,
        requestedDate: date,
        title: dailySet?.title || "每日 50 问",
        total: dailyQuestionCount,
        doneCount: dailyCompletedCount,
        completed: progressCompleted(dailyQuestionCount, dailyCompletedCount),
        fallback: Boolean(dailySet && dailySet.day_date !== date)
      },
      source: "database"
    };
  });
  const progressRow = await getOne(`SELECT COUNT(*) AS done_count
    FROM interview_progress
    WHERE client_hash=:client_hash AND day_date=:day_date AND completed=1`, { client_hash, day_date: basePlan.today?.date || date }).catch(() => ({ done_count: 0 }));
  const doneCount = Number(progressRow?.done_count || 0);
  const todayTotal = Number(basePlan.today?.total || 0);
  const questionCount = Number(basePlan.summary?.questionCount || 0);
  return {
    ...basePlan,
    summary: {
      ...(basePlan.summary || {}),
      completedCount: doneCount,
      overallProgress: questionCount ? Math.round((doneCount / questionCount) * 100) : Number(basePlan.summary?.overallProgress || 0)
    },
    today: {
      ...(basePlan.today || {}),
      doneCount,
      completed: progressCompleted(todayTotal, doneCount)
    }
  };
}

async function adminInterviewDailyStatus(url) {
  const date = cleanDateValue(url.searchParams.get("date")) || shanghaiDate();
  const todaySet = await getOne("SELECT *, DATE_FORMAT(day_date, '%Y-%m-%d') AS day_date FROM interview_daily_sets WHERE day_date=:day_date ORDER BY id DESC LIMIT 1", { day_date: date });
  const questions = await query("SELECT id, answer_points, status FROM interview_questions WHERE deleted_at IS NULL LIMIT 500");
  const published = questions.filter((item) => item.status === "published");
  const complete = published.filter((item) => interviewTrainingMissing(item.answer_points).length === 0);
  return {
    date,
    todaySet: publicInterviewSet(todaySet || { day_date: date, title: "未发布", question_ids: "[]", status: "draft" }),
    questionStats: {
      total: questions.length,
      published: published.length,
      complete: complete.length,
      missing: published.length - complete.length
    }
  };
}

async function publishInterviewDailySet(req, options = {}) {
  const body = options.body || await readBody(req);
  const date = cleanDateValue(body.date) || options.date || shanghaiDate();
  const existing = await getOne("SELECT * FROM interview_daily_sets WHERE day_date=:day_date LIMIT 1", { day_date: date });
  if (existing && !body.force && options.skipExisting) {
    return { skipped: true, date, total: parseJsonArray(existing.question_ids).length };
  }
  let rows = [];
  const bodyIds = Array.isArray(body.questionIds) ? body.questionIds : [];
  if (bodyIds.length) rows = await selectInterviewQuestionsByIds(bodyIds);
  if (!rows.length) rows = await selectPublishedInterviewQuestions(50);
  const questionIds = rows.map((row) => Number(row.id)).filter(Boolean);
  const payload = {
    day_date: date,
    title: cleanText(body.title || "每日 50 问", 120),
    subtitle: cleanText(body.subtitle || (body.topic ? `主题：${body.topic}` : "从后台题库发布的模拟面试题单。"), 240),
    status: "published",
    question_ids: JSON.stringify(questionIds),
    sidebar_json: JSON.stringify(defaultInterviewSidebar),
    source_provider: cleanText(body.provider || "admin", 40),
    source_model: cleanText(body.model || "manual-question-bank", 120),
    generation_status: questionIds.length ? "success" : "empty",
    generation_error: questionIds.length ? null : "no_published_questions"
  };
  if (existing) {
    await query("UPDATE interview_daily_sets SET title=:title, subtitle=:subtitle, status=:status, question_ids=CAST(:question_ids AS JSON), sidebar_json=CAST(:sidebar_json AS JSON), source_provider=:source_provider, source_model=:source_model, generated_at=NOW(), generation_status=:generation_status, generation_error=:generation_error, updated_at=NOW() WHERE day_date=:day_date", payload);
  } else {
    await query("INSERT INTO interview_daily_sets(day_date,title,subtitle,status,question_ids,sidebar_json,source_provider,source_model,generated_at,generation_status,generation_error,created_at,updated_at) VALUES(:day_date,:title,:subtitle,:status,CAST(:question_ids AS JSON),CAST(:sidebar_json AS JSON),:source_provider,:source_model,NOW(),:generation_status,:generation_error,NOW(),NOW())", payload);
  }
  return { skipped: false, date, total: questionIds.length, generationStatus: payload.generation_status };
}

async function addPublicInterviewDailyQuestion(req) {
  const body = await readBody(req);
  const day_date = cleanDateValue(body.date) || shanghaiDate();
  const question = cleanText(body.question || body.title || "", 500);
  if (!question) return { ok: false, message: "question_required" };

  const category = cleanText(body.category || body.topic || "手动添加", 80) || "手动添加";
  const topic = await ensureManualInterviewTopic(category);
  const answer = cleanLongText(body.answer || body.answer_md || body.answerMd || "暂无参考答案，后续补充。", 8000);
  const tagList = parseTags(body.tags || body.tag || "").map((item) => cleanText(item, 60)).filter(Boolean).slice(0, 8);
  const answerMeta = normalizeInterviewAnswerMeta({
    points: body.points,
    followUps: body.followUps,
    interviewerFocus: body.interviewerFocus,
    speechTemplate: body.speechTemplate,
    commonMistakes: body.commonMistakes,
    projectPrompts: body.projectPrompts,
    difficulty: body.difficulty
  });
  const difficulty = cleanInterviewDifficulty(body.difficulty || answerMeta.difficulty, answerMeta.difficulty);
  answerMeta.difficulty = difficulty;

  const nextSort = await getOne("SELECT COALESCE(MAX(sort_order),0) + 10 AS sort_order FROM interview_questions WHERE topic_id=:topic_id", { topic_id: topic.id });
  const slugSeed = normalizeSlug(question, "");
  const slug = cleanKey(slugSeed, `manual-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`);
  const payload = {
    topic_id: topic.id,
    slug,
    title: question,
    summary: cleanText(body.summary || stripMarkdown(answer).slice(0, 220), 500),
    answer_md: answer,
    answer_html: markdownToHtml(answer),
    answer_points: JSON.stringify(answerMeta),
    difficulty,
    source: "public-manual-add",
    tags: JSON.stringify(tagList),
    status: "published",
    sort_order: clampNumber(body.sortOrder ?? body.sort_order ?? nextSort?.sort_order, 0, 99999, 0)
  };
  const result = await query("INSERT INTO interview_questions(topic_id,slug,title,summary,answer_md,answer_html,answer_points,difficulty,source,tags,status,sort_order,reviewed_at,created_at,updated_at,deleted_at) VALUES(:topic_id,:slug,:title,:summary,:answer_md,:answer_html,CAST(:answer_points AS JSON),:difficulty,:source,:tags,:status,:sort_order,NOW(),NOW(),NOW(),NULL)", payload);
  const questionId = Number(result.insertId);
  const explicitGoalIds = parseIdList(body.goalIds || body.goal_ids || []);
  const goalIds = explicitGoalIds.length ? explicitGoalIds : await inferInterviewGoalIds({ ...payload, tags: tagList, category, goalSlug: body.goalSlug || body.goal_slug });
  await syncInterviewQuestionGoalLinks(questionId, goalIds);

  const existing = await getOne("SELECT *, DATE_FORMAT(day_date, '%Y-%m-%d') AS day_date FROM interview_daily_sets WHERE day_date=:day_date LIMIT 1", { day_date });
  const ids = parseJsonArray(existing?.question_ids).map((id) => Number(id)).filter(Boolean);
  if (!ids.includes(questionId)) ids.push(questionId);
  const setPayload = {
    day_date,
    title: existing?.title || "每日 50 问",
    subtitle: existing?.subtitle || "前台手动维护的面试题单。",
    status: "published",
    question_ids: JSON.stringify(ids),
    sidebar_json: existing?.sidebar_json || JSON.stringify(defaultInterviewSidebar),
    source_provider: existing?.source_provider || "manual",
    source_model: existing?.source_model || "public-add-question",
    generation_status: "success",
    generation_error: null
  };
  if (existing) {
    await query("UPDATE interview_daily_sets SET status='published', question_ids=CAST(:question_ids AS JSON), source_provider=:source_provider, source_model=:source_model, generated_at=COALESCE(generated_at,NOW()), generation_status=:generation_status, generation_error=:generation_error, updated_at=NOW() WHERE day_date=:day_date", setPayload);
  } else {
    await query("INSERT INTO interview_daily_sets(day_date,title,subtitle,status,question_ids,sidebar_json,source_provider,source_model,generated_at,generation_status,generation_error,created_at,updated_at) VALUES(:day_date,:title,:subtitle,:status,CAST(:question_ids AS JSON),CAST(:sidebar_json AS JSON),:source_provider,:source_model,NOW(),:generation_status,:generation_error,NOW(),NOW())", setPayload);
  }

  const row = await getOne("SELECT q.*, t.slug AS topic_slug, t.title AS topic_title FROM interview_questions q LEFT JOIN interview_topics t ON t.id=q.topic_id WHERE q.id=:id", { id: questionId });
  await attachInterviewGoalIds([row]);
  return {
    ok: true,
    date: day_date,
    total: ids.length,
    question: publicInterviewDailyQuestion(row, ids.length)
  };
}

async function publicInterviewProgress(req, url) {
  const date = cleanDateValue(url.searchParams.get("date")) || shanghaiDate();
  const client_hash = interviewClientHash(req);
  const set = await getInterviewDailySet(date);
  const total = parseJsonArray(set?.question_ids).length || 50;
  const rows = await query("SELECT question_key, completed, updated_at FROM interview_progress WHERE day_date=:day_date AND client_hash=:client_hash", { day_date: date, client_hash });
  const progress = Object.fromEntries(rows.map((row) => [row.question_key, {
    completed: Boolean(row.completed),
    updatedAt: row.updated_at || ""
  }]));
  const doneCount = rows.filter((row) => Number(row.completed) === 1).length;
  return { date, total, doneCount, completed: progressCompleted(total, doneCount), progress };
}

async function saveInterviewProgress(req) {
  const body = await readBody(req);
  const day_date = cleanDateValue(body.date) || shanghaiDate();
  const question_key = cleanText(body.questionKey || body.questionId || "", 220);
  if (!question_key) return { ok: false, message: "question_required" };
  const payload = {
    day_date,
    question_key,
    client_hash: interviewClientHash(req),
    completed: body.completed === true || body.completed === 1 || body.completed === "1" ? 1 : 0
  };
  await query(`INSERT INTO interview_progress(day_date,question_key,client_hash,completed,created_at,updated_at)
    VALUES(:day_date,:question_key,:client_hash,:completed,NOW(),NOW())
    ON DUPLICATE KEY UPDATE completed=:completed, updated_at=NOW()`, payload);
  return { ok: true, date: day_date, questionKey: question_key, completed: Boolean(payload.completed) };
}

async function saveInterviewQuestionMarkers(req) {
  const body = await readBody(req);
  const questionKey = cleanText(body.questionKey || body.questionId || body.slug || "", 220);
  const numericId = cleanId(body.id || questionKey);
  if (!questionKey && !numericId) return { ok: false, message: "question_required" };
  const payload = {
    id: numericId || "0",
    slug: questionKey,
    star_rating: Math.max(0, Math.min(5, Number(body.starRating ?? body.star_rating ?? 0) || 0)),
    is_difficult: body.isDifficult || body.is_difficult ? 1 : 0,
    is_common: body.isCommon || body.is_common ? 1 : 0,
    in_collection: body.inCollection || body.in_collection ? 1 : 0,
    marker_note: cleanText(body.markerNote || body.marker_note || "", 500)
  };
  const result = await query(`UPDATE interview_questions
    SET star_rating=:star_rating,
        is_difficult=:is_difficult,
        is_common=:is_common,
        in_collection=:in_collection,
        marker_note=:marker_note,
        updated_at=NOW()
    WHERE deleted_at IS NULL AND (id=:id OR slug=:slug)`, payload);
  if (!Number(result?.affectedRows || 0)) return { ok: false, message: "question_not_found" };
  return {
    ok: true,
    questionKey,
    markers: {
      starRating: payload.star_rating,
      isDifficult: Boolean(payload.is_difficult),
      isCommon: Boolean(payload.is_common),
      inCollection: Boolean(payload.in_collection),
      markerNote: payload.marker_note
    }
  };
}

function interviewInsightClientHash(req) {
  return interviewClientHash(req);
}

function interviewInsightClientHashes(req) {
  return [...new Set([
    interviewInsightClientHash(req),
    privacyHash(clientFingerprint(req))
  ].filter(Boolean))];
}

function interviewInsightKeys(url) {
  return [...new Set(String(url.searchParams.get("keys") || "")
    .split(",")
    .map((item) => cleanText(item, 220))
    .filter(Boolean))]
    .slice(0, 80);
}

const sharedInterviewInsightClientHash = "shared-public";

async function publicInterviewInsights(req, url) {
  const date = cleanDateValue(url.searchParams.get("date")) || shanghaiDate();
  const keys = interviewInsightKeys(url);
  let rows = [];
  if (keys.length) {
    const { params, sql } = questionIdPlaceholders(keys);
    rows = await query(`SELECT question_key, content, updated_at, DATE_FORMAT(day_date, '%Y-%m-%d') AS source_date
      FROM interview_question_insights
      WHERE day_date=:day_date OR question_key IN (${sql})
      ORDER BY updated_at ASC, id ASC`, { ...params, day_date: date });
  } else {
    rows = await query(`SELECT question_key, content, updated_at, DATE_FORMAT(day_date, '%Y-%m-%d') AS source_date
      FROM interview_question_insights
      WHERE day_date=:day_date
      ORDER BY updated_at ASC, id ASC`, { day_date: date });
  }
  const insights = {};
  rows.forEach((row) => {
    insights[row.question_key] = { content: row.content || "", updatedAt: row.updated_at || "", sourceDate: row.source_date || date, shared: true };
  });
  return {
    date,
    visibility: "public",
    insights
  };
}

async function saveInterviewInsight(req) {
  const body = await readBody(req);
  const day_date = cleanDateValue(body.date) || shanghaiDate();
  const question_key = cleanText(body.questionKey || body.questionId || "", 220);
  if (!question_key) return { ok: false, message: "question_required" };
  const payload = {
    day_date,
    question_key,
    client_hash: sharedInterviewInsightClientHash,
    content: cleanLongText(body.content || "", 2000)
  };
  await query("INSERT INTO interview_question_insights(day_date,question_key,client_hash,content,created_at,updated_at) VALUES(:day_date,:question_key,:client_hash,:content,NOW(),NOW()) ON DUPLICATE KEY UPDATE content=:content, updated_at=NOW()", payload);
  return { ok: true, date: day_date, questionKey: question_key, visibility: "public" };
}

function ensureInterviewGenerationAuth(req) {
  const required = process.env.INTERVIEW_GENERATE_TOKEN || "";
  if (!required) return true;
  const header = String(req.headers.authorization || "");
  const tokenHeader = String(req.headers["x-interview-token"] || "");
  return header === `Bearer ${required}` || tokenHeader === required;
}

function interviewGenerationError(message, status = 500, code = "interview_generation_failed") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function isFatalInterviewLlmError(error) {
  const code = String(error?.code || "");
  return [
    "llm_key_missing",
    "llm_model_missing",
    "llm_provider_mismatch",
    "llm_auth_failed",
    "llm_quota_exhausted"
  ].includes(code);
}

function interviewLlmConfig(providerOverride = "") {
  const provider = cleanKey(providerOverride || process.env.LLM_PROVIDER || "deepseek", "deepseek");
  const options = {
    deepseek: {
      provider: "deepseek",
      apiKey: process.env.DEEPSEEK_API_KEY || "",
      baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat"
    },
    doubao: {
      provider: "doubao",
      apiKey: process.env.DOUBAO_API_KEY || "",
      baseUrl: process.env.DOUBAO_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
      model: process.env.DOUBAO_MODEL || ""
    }
  };
  const selected = options[provider] || options.deepseek;
  selected.baseUrl = String(selected.baseUrl || "").replace(/\/+$/, "");
  if (!selected.apiKey) {
    throw interviewGenerationError(`${selected.provider === "doubao" ? "DOUBAO_API_KEY" : "DEEPSEEK_API_KEY"} 未配置`, 422, "llm_key_missing");
  }
  if (!selected.model) {
    throw interviewGenerationError(`${selected.provider.toUpperCase()}_MODEL 未配置`, 422, "llm_model_missing");
  }
  if (
    selected.provider === "doubao" &&
    process.env.DEEPSEEK_API_KEY &&
    selected.apiKey === process.env.DEEPSEEK_API_KEY
  ) {
    throw interviewGenerationError("DOUBAO_API_KEY 当前和 DEEPSEEK_API_KEY 相同，请配置真实 Doubao/火山 Ark Key 后再启动题库重建", 422, "llm_provider_mismatch");
  }
  if (selected.provider === "doubao" && /^deepseek/i.test(String(selected.model || ""))) {
    throw interviewGenerationError("DOUBAO_MODEL 当前是 DeepSeek 模型名，请改成火山 Ark 模型/endpoint 后再启动题库重建", 422, "llm_provider_mismatch");
  }
  return selected;
}

function fallbackInterviewGoalRows() {
  return interviewGoalDefaults.map((item, index) => ({
    id: index + 1,
    parent_id: item.parent ? interviewGoalDefaults.findIndex((parent) => parent.slug === item.parent) + 1 : null,
    slug: item.slug,
    title: item.title,
    summary: item.summary || "",
    sort_order: item.sort_order || 0
  }));
}

async function interviewGenerationGoalCatalog() {
  let rows = [];
  if (databaseAvailable) {
    rows = await query(`SELECT id,parent_id,slug,title,summary,sort_order
      FROM interview_goal_nodes
      WHERE visible=1 AND deleted_at IS NULL
      ORDER BY COALESCE(parent_id,0) ASC, sort_order ASC, id ASC`).catch(() => []);
  }
  if (!rows.length) rows = fallbackInterviewGoalRows();
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  const childCount = new Map();
  for (const row of rows) {
    if (row.parent_id) childCount.set(String(row.parent_id), (childCount.get(String(row.parent_id)) || 0) + 1);
  }
  const topCategory = (row) => {
    let current = row;
    let parent = current?.parent_id ? byId.get(String(current.parent_id)) : null;
    while (parent && parent.slug !== "robotics") {
      current = parent;
      parent = current?.parent_id ? byId.get(String(current.parent_id)) : null;
    }
    return current || row;
  };
  return rows.map((row) => {
    const category = topCategory(row);
    const parent = row.parent_id ? byId.get(String(row.parent_id)) : null;
    return {
      id: row.id,
      parentId: row.parent_id || null,
      parentSlug: parent?.slug || "",
      parentTitle: parent?.title || "",
      slug: row.slug,
      title: row.title,
      summary: row.summary || "",
      isLeaf: !childCount.has(String(row.id)),
      categorySlug: category?.slug || row.slug,
      categoryTitle: category?.title || row.title,
      sortOrder: Number(row.sort_order || 0)
    };
  });
}

function interviewGenerationPrompt(date, topic, catalog = []) {
  const usableGoals = catalog.filter((goal) => goal.slug && goal.slug !== "robotics");
  const leafGoals = usableGoals.filter((goal) => goal.isLeaf);
  const categories = usableGoals
    .filter((goal) => goal.parentSlug === "robotics")
    .map((goal) => `${goal.title}(${goal.slug})`)
    .join("、") || "基础、运动、感知、控制与嵌入式、项目实战、其他";
  const goalLines = (leafGoals.length ? leafGoals : usableGoals)
    .slice(0, 80)
    .map((goal) => `- ${goal.slug}: ${goal.title} / 分类 ${goal.categoryTitle}${goal.summary ? ` / ${goal.summary}` : ""}`)
    .join("\n");
  const topicLine = topic ? `\n额外要求：${topic}` : "";
  return [
    { role: "system", content: "你是面试题库生成器。只输出合法 JSON，不要 Markdown，不要解释。" },
    {
      role: "user",
      content: `生成 ${date} 的每日 50 问。${topicLine}
页面目录分类是：${categories}
可用 goalSlug 只能从下面选择，优先选择最具体的知识点节点：
${goalLines}

输出要求：
1. 必须正好 50 题，id 为 q01 到 q50，number 为 1 到 50。
2. 每题必须包含 category、goalSlug、knowledgePoint、tags；category 用一级分类名，goalSlug 用上方目录 slug，knowledgePoint 用具体知识点。
3. tags 必须 2-5 个，可交叉，例如 ["Ubuntu","ROS","FOC"]，第一个标签要等于 knowledgePoint 或高度相关。
4. 每题 question 要短，answer 要具体，能直接口述。
5. 每题 points、followUps、interviewerFocus、speechTemplate、commonMistakes、projectPrompts 都用短句数组。
6. 题目覆盖基础、运动、感知、控制与嵌入式、项目实战；无法归类才使用 other。
7. 输出 JSON 结构：
{
  "date": "${date}",
  "title": "每日 50 问",
  "subtitle": "一句短说明",
  "sidebar": {
    "plan": [{"label":"15 分钟","text":"快速过题"}],
    "focus": ["重点内容"],
    "review": ["复盘提醒"],
    "experiences": [{"title":"面经提醒","text":"短句"}]
  },
  "questions": [
    {
      "id": "q01",
      "number": 1,
      "category": "控制与嵌入式",
      "goalSlug": "bus-protocols",
      "knowledgePoint": "I2C",
      "tags": ["I2C","总线","驱动调试"],
      "difficulty": "高频必会",
      "question": "I2C 为什么需要上拉电阻？",
      "answer": "标准详解答案",
      "points": ["要点1","要点2","要点3"],
      "followUps": ["追问1"],
      "interviewerFocus": ["看点1"],
      "speechTemplate": ["口述步骤1"],
      "commonMistakes": ["常见错误1"],
      "projectPrompts": ["项目迁移1"]
    }
  ]
}`
    }
  ];
}

async function callInterviewLlm(messages, providerOverride = "") {
  const llm = interviewLlmConfig(providerOverride);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.LLM_TIMEOUT_MS || 45000));
  try {
    const body = {
      model: llm.model,
      messages,
      temperature: Number(process.env.LLM_TEMPERATURE || 0.35),
      max_tokens: Number(process.env.LLM_MAX_TOKENS || 14000)
    };
    if (process.env.LLM_RESPONSE_FORMAT !== "off") body.response_format = { type: "json_object" };
    const response = await fetch(`${llm.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${llm.apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      const snippet = text.slice(0, 240);
      if (response.status === 401 || response.status === 403) {
        throw interviewGenerationError(`模型认证失败：${response.status} ${snippet}`, 502, "llm_auth_failed");
      }
      if (response.status === 402 || /insufficient|quota|balance|余额|额度/i.test(text)) {
        throw interviewGenerationError(`模型余额或额度不足：${response.status} ${snippet}`, 502, "llm_quota_exhausted");
      }
      throw interviewGenerationError(`模型请求失败：${response.status} ${snippet}`, 502, "llm_request_failed");
    }
    const data = JSON.parse(text);
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw interviewGenerationError("模型返回缺少 content", 502, "llm_empty_response");
    return { provider: llm.provider, model: llm.model, content };
  } catch (error) {
    if (error.name === "AbortError") throw interviewGenerationError("模型请求超时", 504, "llm_timeout");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseInterviewModelJson(content) {
  const text = String(content || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw interviewGenerationError("模型返回不是合法 JSON", 502, "llm_invalid_json");
  }
}

const interviewBankRebuildTargetSlugs = [
  "motor-model",
  "clarke-park",
  "svpwm",
  "current-loop",
  "speed-loop",
  "position-loop",
  "foc-tuning",
  "stm32",
  "rtos",
  "bus-protocols",
  "driver-debug",
  "communication",
  "ros2",
  "simulation",
  "robot-body",
  "debug-log",
  "portfolio"
];

const interviewBankRebuildQuestionTypes = [
  { id: "mechanism", label: "机制理解", focus: "解释底层机制、关键公式、状态流转和工程边界" },
  { id: "tradeoff", label: "参数取舍", focus: "说明参数怎么选、为什么这样选、极端条件下怎么保护" },
  { id: "coding", label: "代码实现", focus: "围绕驱动、控制、协议或工程代码讲实现细节和坑点" },
  { id: "debug", label: "故障排查", focus: "给出现象、复现条件、定位顺序和修复验证" },
  { id: "evidence", label: "证据分析", focus: "结合日志、波形、寄存器、抓包、bag 或仿真数据判断根因" },
  { id: "optimization", label: "性能优化", focus: "围绕实时性、稳定性、资源、延迟、温升或精度做优化" },
  { id: "integration", label: "系统集成", focus: "把单点知识放进机器人整机、上位机、ROS 或硬件链路里" },
  { id: "safety", label: "安全保护", focus: "讲限幅、保护、降级、异常恢复和验证闭环" },
  { id: "project", label: "项目表达", focus: "要求能把项目背景、职责、指标、复盘和取舍说清楚" },
  { id: "followup", label: "面试追问", focus: "模拟面试官连续追问，逼近边界、反例和二次方案" }
];

const interviewBankRebuildState = {
  running: false,
  runId: "",
  startedAt: null,
  updatedAt: null,
  finishedAt: null,
  status: "idle",
  currentGoalSlug: "",
  currentGoalTitle: "",
  targetLeafCount: 100,
  expectedTotal: 0,
  generatedCount: 0,
  readyCount: 0,
  failedCount: 0,
  committedCount: 0,
  lastError: "",
  lastIds: []
};

function interviewBankRebuildRunId() {
  return `bank-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${crypto.randomBytes(4).toString("hex")}`;
}

function normalizeInterviewBankTitle(value = "") {
  return cleanText(value, 240)
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "")
    .replace(/^(请|请你|说明|介绍|谈谈|分析|解释|如何|怎么|为什么|什么是|能否)+/u, "")
    .slice(0, 220);
}

function interviewBankRebuildTopicTitle(goal = {}) {
  if (goal.parentSlug === "foc" || goal.slug === "foc" || ["motor-model", "clarke-park", "svpwm", "current-loop", "speed-loop", "position-loop", "foc-tuning"].includes(goal.slug)) return "FOC";
  if (goal.categorySlug === "embedded-control" || goal.parentSlug === "embedded-control") return "控制与嵌入式";
  if (goal.categorySlug === "robot-projects" || goal.parentSlug === "robot-projects") return "项目实战";
  return goal.categoryTitle || goal.parentTitle || goal.title || "面试题";
}

function interviewBankGoalTerms(goal = {}) {
  const extras = [];
  if (interviewBankRebuildTopicTitle(goal) === "FOC") extras.push("FOC", "电机", "控制");
  if (interviewBankRebuildTopicTitle(goal) === "控制与嵌入式") extras.push("嵌入式", "STM32", "驱动", "调试");
  if (interviewBankRebuildTopicTitle(goal) === "项目实战") extras.push("项目", "ROS", "机器人", "调试");
  return [...new Set([
    goal.title,
    goal.slug,
    goal.summary,
    goal.parentTitle,
    interviewBankRebuildTopicTitle(goal),
    ...extras
  ].flatMap((item) => String(item || "").split(/[、，,\/\s]+/)).map((item) => cleanText(item, 32)).filter((item) => item.length >= 2))];
}

function interviewBankRebuildDomainPolicy(goal = {}) {
  const slug = String(goal.slug || "");
  const focSlugs = ["motor-model", "clarke-park", "svpwm", "current-loop", "speed-loop", "position-loop", "foc-tuning"];
  const bareMetalSlugs = ["stm32", "bus-protocols", "driver-debug", "communication"];
  const policies = {
    foc: {
      must: "只写电机控制、FOC、驱动板、编码器、电流/速度/位置环、SVPWM、波形、调参和保护；项目场景只能是电机驱动/伺服/底盘驱动台架。",
      requiredAny: ["FOC", "电机", "SVPWM", "电流环", "速度环", "位置环", "编码器", "驱动板", "母线", "调参"],
      forbidden: ["ROS", "ROS2", "话题", "节点", "launch", "bag", "Ubuntu", "Linux", "RTOS", "FreeRTOS", "相机", "雷达", "SLAM", "导航"]
    },
    bareMetal: {
      must: "只写 STM32/裸机外设、寄存器、中断、DMA、ADC、PWM、Flash、看门狗、HardFault、总线协议和驱动调试。",
      requiredAny: ["STM32", "裸机", "寄存器", "外设", "DMA", "ADC", "PWM", "Flash", "中断", "HardFault", "看门狗", "CAN", "I2C", "SPI", "UART", "RS485", "CRC", "驱动"],
      forbidden: ["ROS", "ROS2", "话题", "节点", "launch", "bag", "RTOS", "FreeRTOS", "任务调度", "互斥锁", "信号量", "队列满", "FOC", "SVPWM"]
    },
    rtos: {
      must: "只写 RTOS/FreeRTOS 任务、调度、优先级、队列、信号量、互斥锁、栈水位、死锁和实时性问题。",
      requiredAny: ["RTOS", "FreeRTOS", "任务", "调度", "优先级", "队列", "信号量", "互斥锁", "栈水位", "死锁", "竞态"],
      forbidden: ["ROS", "ROS2", "话题", "节点", "launch", "bag", "FOC", "SVPWM", "电流环", "速度环"]
    },
    ros2: {
      must: "只写 ROS2 节点、话题、服务、Action、QoS、TF、launch、bag、生命周期节点、多机通信和机器人软件集成。",
      requiredAny: ["ROS2", "节点", "话题", "服务", "Action", "QoS", "TF", "launch", "bag", "生命周期"],
      forbidden: ["STM32", "Flash", "DMA", "ADC", "PWM", "中断", "寄存器", "HardFault", "FOC", "SVPWM", "电流环", "RTOS", "FreeRTOS"]
    },
    simulation: {
      must: "只写仿真、Gazebo、URDF/SDF、碰撞体、传感器仿真、摩擦/惯量、仿真到实机和回归脚本。",
      requiredAny: ["仿真", "Gazebo", "URDF", "SDF", "碰撞", "传感器仿真", "摩擦", "惯量", "回归脚本"],
      forbidden: ["STM32", "Flash", "DMA", "HardFault", "FOC", "SVPWM", "RTOS", "FreeRTOS"]
    },
    robotBody: {
      must: "只写机器人本体、供电、线束、结构、散热、EMI、接地、电源纹波、整机联调和验收指标。",
      requiredAny: ["本体", "整机", "供电", "线束", "结构", "散热", "EMI", "接地", "纹波", "验收"],
      forbidden: ["ROS2", "话题", "launch", "bag", "STM32", "Flash", "RTOS", "FOC", "SVPWM"]
    },
    debugLog: {
      must: "只写调试记录方法：现象、时间线、日志、复现路径、假设验证、版本 diff、故障树、回归和复盘。",
      requiredAny: ["调试记录", "日志", "时间线", "复现", "假设", "版本", "故障树", "回归", "复盘"],
      forbidden: ["ROS2 launch", "STM32 Flash", "FOC SVPWM", "FreeRTOS 队列"]
    },
    portfolio: {
      must: "只写作品集和项目表达：目标、职责、指标、证据、难点、方案取舍、失败复盘、可迁移能力。",
      requiredAny: ["作品集", "项目表达", "职责", "指标", "证据", "难点", "取舍", "复盘", "简历"],
      forbidden: ["ROS2 launch", "STM32 Flash", "FOC SVPWM", "FreeRTOS 队列"]
    }
  };
  if (focSlugs.includes(slug)) return policies.foc;
  if (bareMetalSlugs.includes(slug)) return policies.bareMetal;
  if (slug === "rtos") return policies.rtos;
  if (slug === "ros2") return policies.ros2;
  if (slug === "simulation") return policies.simulation;
  if (slug === "robot-body") return policies.robotBody;
  if (slug === "debug-log") return policies.debugLog;
  if (slug === "portfolio") return policies.portfolio;
  return { must: "严格围绕当前小分支，不要跨到其他技术域。", requiredAny: interviewBankGoalTerms(goal), forbidden: [] };
}

function interviewBankDomainErrors(item = {}, goal = {}) {
  const policy = interviewBankRebuildDomainPolicy(goal);
  const body = [
    item.title,
    item.summary,
    item.answerMd,
    item.scenarioKey,
    ...(item.tags || []),
    item.exampleCase?.title,
    item.exampleCase?.example,
    item.exampleCase?.solution,
    item.exampleCase?.cause,
    item.exampleCase?.summary,
    ...(item.answerPoints?.points || []),
    ...(item.answerPoints?.followUps || []),
    ...(item.answerPoints?.projectPrompts || [])
  ].filter(Boolean).join(" ");
  const errors = [];
  const required = (policy.requiredAny || []).filter(Boolean);
  if (required.length && !required.some((term) => body.includes(term))) {
    errors.push(`缺少 ${goal.title || goal.slug} 领域关键词`);
  }
  const forbiddenHit = (policy.forbidden || []).find((term) => {
    const text = String(term || "").trim();
    if (!text) return false;
    if (text.includes(" ")) return text.split(/\s+/).every((part) => body.includes(part));
    return body.includes(text);
  });
  if (forbiddenHit) errors.push(`领域串台：出现禁用词 ${forbiddenHit}`);
  return errors;
}

function interviewBankRebuildPrompt({ runId, goal, count = 1, startPosition = 1, existingTitles = [], providerRound = 1 } = {}) {
  const safeCount = clampNumber(count, 1, 1, 1);
  const typeLines = interviewBankRebuildQuestionTypes.map((item, index) => `${index + 1}. ${item.label}(${item.id})：${item.focus}`).join("\n");
  const avoidLines = existingTitles.slice(-80).map((title) => `- ${title}`).join("\n");
  const topicTitle = interviewBankRebuildTopicTitle(goal);
  const goalTerms = interviewBankGoalTerms(goal).slice(0, 12).join("、");
  const domainPolicy = interviewBankRebuildDomainPolicy(goal);
  return [
    {
      role: "system",
      content: "你是机器人、FOC、电机控制、嵌入式、ROS 项目的资深面试官和工程导师。只输出合法 JSON，不要 Markdown，不要解释。每次只精写一道题。"
    },
    {
      role: "user",
      content: `为面试题库重建任务 ${runId} 精写 ${safeCount} 道题。目标小分支：${goal.title}(${goal.slug})，上级：${topicTitle}，说明：${goal.summary || ""}。

当前分支领域边界：
- 必须：${domainPolicy.must}
- 严禁出现：${(domainPolicy.forbidden || []).join("、") || "无"}

必须覆盖的题型池：
${typeLines}

本轮从题型池里交错选择，position 从 ${startPosition} 开始。轮次 ${providerRound}，请换工程场景、故障现象、证据类型和追问角度。
核心词：${goalTerms}
${avoidLines ? `\n严禁重复或改写这些已有题干：\n${avoidLines}` : ""}

硬性质量要求：
1. 每题必须是具体、可面试口述、可工程落地的问题，不能是“请介绍/谈谈理解”这种空泛题。
2. 每题必须返回题干、摘要、完整答案、追问、面试官关注点、口述模板、常见错误、项目追问、实例。
3. 答案必须包含结论、原因、排查路径、验证闭环和项目表达；不要写套话。
4. 实例必须唯一，包含现场现象、日志/波形/寄存器/抓包/bag/版本/负载等证据之一，包含解决方法、原因分析和思路总结。
5. tags 必须 4-8 个，包含领域、知识点、能力、场景或故障标签。
6. 每道题都要给 scenarioKey，用“知识点|场景|故障|追问角度”组成，保证同分支不重复。
7. items 数组必须正好 1 条；不要一批多题，不要拆成模板题。
8. 输出 JSON 结构固定：
{
  "items": [
    {
      "position": ${startPosition},
      "questionType": "debug",
      "scenarioKey": "SVPWM|低速启动|抖动|采样时刻",
      "title": "低速启动时 FOC 电流波形抖动，你会如何判断是采样时刻还是角度零偏导致？",
      "summary": "一句话说明这题考什么",
      "difficulty": "项目追问",
      "tags": ["FOC","SVPWM","电流采样","调试","波形分析"],
      "answer": "可直接口述的完整答案，至少 260 个中文字符",
      "points": ["要点1","要点2","要点3","要点4"],
      "followUps": ["追问1","追问2","追问3"],
      "interviewerFocus": ["看点1","看点2"],
      "speechTemplate": ["口述步骤1","口述步骤2","口述步骤3"],
      "commonMistakes": ["误区1","误区2"],
      "projectPrompts": ["项目追问1","项目追问2"],
      "exampleCase": {
        "title": "实例标题",
        "example": "具体例子",
        "solution": "解决方法",
        "cause": "原因分析",
        "summary": "思路总结"
      }
    }
  ]
}`
    }
  ];
}

function normalizeInterviewBankRebuildItem(raw = {}, { goal = {}, position = 1, provider = "", model = "", retryCount = 0 } = {}) {
  const title = cleanText(raw.title || raw.question || "", 220);
  const summary = cleanText(raw.summary || "", 500);
  const answer = cleanLongText(raw.answer || raw.answer_md || raw.answerMd || "", 12000);
  const questionType = cleanText(raw.questionType || raw.question_type || "", 80);
  const scenarioKey = cleanText(raw.scenarioKey || raw.scenario_key || "", 120);
  const topicTitle = interviewBankRebuildTopicTitle(goal);
  const tags = [...new Set([
    topicTitle,
    goal.title,
    questionType,
    ...parseTags(raw.tags || [])
  ].map((tag) => cleanText(tag, 60)).filter(Boolean))].slice(0, 8);
  const answerPoints = normalizeInterviewAnswerMeta({
    difficulty: raw.difficulty,
    points: raw.points,
    followUps: raw.followUps || raw.follow_ups,
    interviewerFocus: raw.interviewerFocus || raw.interviewer_focus,
    speechTemplate: raw.speechTemplate || raw.speech_template,
    commonMistakes: raw.commonMistakes || raw.common_mistakes,
    projectPrompts: raw.projectPrompts || raw.project_prompts
  });
  const exampleCase = normalizeInterviewExampleCase(raw.exampleCase || raw.example_case || {});
  const normalizedTitle = normalizeInterviewBankTitle(title);
  const comboSource = scenarioKey || [goal.slug, questionType, tags.slice(0, 4).join("-"), normalizeInterviewBankTitle(title).slice(0, 60)].join("|");
  return {
    goalId: goal.id || null,
    goalSlug: goal.slug || "",
    goalTitle: goal.title || "",
    topicTitle,
    position: Number(position || raw.position || 1),
    questionType,
    scenarioKey,
    normalizedTitle,
    comboKey: crypto.createHash("sha1").update(`${goal.slug}|${comboSource}`).digest("hex"),
    title,
    summary,
    answerMd: answer,
    answerPoints,
    exampleCase,
    difficulty: cleanInterviewDifficulty(raw.difficulty || answerPoints.difficulty, "项目追问"),
    tags,
    sourceProvider: cleanText(provider || "", 40),
    sourceModel: cleanText(model || "", 120),
    retryCount: Number(retryCount || 0)
  };
}

function validateInterviewBankRebuildItem(item = {}, goal = {}) {
  const errors = [];
  const strippedAnswer = stripMarkdown(item.answerMd || "").replace(/\s+/g, "");
  const exampleBody = item.exampleCase ? [item.exampleCase.example, item.exampleCase.solution, item.exampleCase.cause, item.exampleCase.summary].join("") : "";
  const allText = [item.title, item.summary, strippedAnswer, exampleBody, item.tags.join(" ")].join(" ");
  const goalTerms = interviewBankGoalTerms(goal);
  if (!item.title || item.title.length < 18 || item.title.length > 220) errors.push("题干长度不合格");
  if (/^(请|请你)?(介绍|谈谈|说明|解释|什么是)[^？?。]{0,28}[？?。]?$/u.test(item.title)) errors.push("题干过于空泛");
  if (!item.normalizedTitle || item.normalizedTitle.length < 8) errors.push("题干唯一指纹过短");
  if (strippedAnswer.length < 220) errors.push("答案太短");
  if (!item.answerPoints.points?.length || item.answerPoints.points.length < 4) errors.push("要点不足");
  if (!item.answerPoints.followUps?.length || item.answerPoints.followUps.length < 2) errors.push("追问不足");
  if (!item.answerPoints.interviewerFocus?.length || item.answerPoints.interviewerFocus.length < 2) errors.push("面试官关注点不足");
  if (!item.answerPoints.speechTemplate?.length || item.answerPoints.speechTemplate.length < 3) errors.push("口述模板不足");
  if (!item.answerPoints.commonMistakes?.length || item.answerPoints.commonMistakes.length < 2) errors.push("常见错误不足");
  if (!item.answerPoints.projectPrompts?.length || item.answerPoints.projectPrompts.length < 2) errors.push("项目追问不足");
  if (!item.exampleCase) errors.push("实例字段不完整");
  if (item.exampleCase && [item.exampleCase.example, item.exampleCase.solution, item.exampleCase.cause].some((part) => cleanText(part, 1000).length < 60)) errors.push("实例不够具体");
  if (!Array.isArray(item.tags) || item.tags.length < 4) errors.push("标签不足");
  if (/(undefined|null|\[object Object\])/i.test(allText)) errors.push("内容含非法占位");
  if (goalTerms.length && !goalTerms.some((term) => allText.includes(term))) errors.push("内容和目标分支不匹配");
  errors.push(...interviewBankDomainErrors(item, goal));
  if (errors.length) throw interviewGenerationError(errors.join("；"), 422, "bank_rebuild_item_quality_failed");
  return true;
}

function normalizeInterviewBankRebuildPayload(raw, context = {}) {
  const payload = raw && typeof raw === "object" ? raw : {};
  const rows = Array.isArray(payload.items) ? payload.items : (Array.isArray(payload.questions) ? payload.questions : []);
  if (!rows.length) throw interviewGenerationError("模型没有返回题目", 502, "bank_rebuild_empty_items");
  const expected = clampNumber(context.count || 1, 1, 1, 1);
  if (rows.length !== expected) throw interviewGenerationError(`模型必须正好返回 ${expected} 道题，实际 ${rows.length} 道`, 502, "bank_rebuild_wrong_item_count");
  return rows.map((row, index) => {
    const item = normalizeInterviewBankRebuildItem(row, {
      ...context,
      position: (context.startPosition || 1) + index
    });
    validateInterviewBankRebuildItem(item, context.goal || {});
    return item;
  });
}

async function generateInterviewBankRebuildItems({ runId, goal, count = 1, startPosition = 1, existingTitles = [], provider = "", retryCount = 0 } = {}) {
  const llm = await callInterviewLlm(interviewBankRebuildPrompt({ runId, goal, count, startPosition, existingTitles, providerRound: retryCount + 1 }), provider);
  const items = normalizeInterviewBankRebuildPayload(parseInterviewModelJson(llm.content), {
    goal,
    count,
    startPosition,
    provider: llm.provider,
    model: llm.model,
    retryCount
  });
  return { items, provider: llm.provider, model: llm.model };
}

function interviewBankStagingRowToItem(row = {}) {
  return {
    title: row.title || "",
    summary: row.summary || "",
    answerMd: row.answer_md || row.answerMd || "",
    answerPoints: normalizeInterviewAnswerMeta(row.answer_points || row.answerPoints || {}),
    exampleCase: normalizeInterviewExampleCase(row.example_case || row.exampleCase || {}),
    scenarioKey: row.scenario_key || row.scenarioKey || "",
    tags: parseTags(row.tags),
    normalizedTitle: row.normalized_title || row.normalizedTitle || "",
    comboKey: row.combo_key || row.comboKey || "",
    difficulty: cleanInterviewDifficulty(row.difficulty || "", "项目追问")
  };
}

async function insertInterviewBankRebuildItem(runId, item) {
  await query(`INSERT INTO interview_bank_rebuild_items
    (run_id,goal_id,goal_slug,goal_title,topic_title,position,question_type,scenario_key,normalized_title,combo_key,title,summary,answer_md,answer_points,example_case,difficulty,tags,source_provider,source_model,quality_status,quality_error,retry_count,created_at,updated_at)
    VALUES(:run_id,:goal_id,:goal_slug,:goal_title,:topic_title,:position,:question_type,:scenario_key,:normalized_title,:combo_key,:title,:summary,:answer_md,CAST(:answer_points AS JSON),CAST(:example_case AS JSON),:difficulty,CAST(:tags AS JSON),:source_provider,:source_model,'ready',NULL,:retry_count,NOW(),NOW())`, {
    run_id: runId,
    goal_id: item.goalId,
    goal_slug: item.goalSlug,
    goal_title: item.goalTitle,
    topic_title: item.topicTitle,
    position: item.position,
    question_type: item.questionType,
    scenario_key: item.scenarioKey,
    normalized_title: item.normalizedTitle,
    combo_key: item.comboKey,
    title: item.title,
    summary: item.summary,
    answer_md: item.answerMd,
    answer_points: JSON.stringify(item.answerPoints),
    example_case: JSON.stringify(item.exampleCase),
    difficulty: item.difficulty,
    tags: JSON.stringify(item.tags),
    source_provider: item.sourceProvider,
    source_model: item.sourceModel,
    retry_count: item.retryCount
  });
}

async function updateInterviewBankRebuildJob(runId, patch = {}) {
  const fields = [];
  const params = { run_id: runId };
  const map = {
    status: "status",
    targetLeafCount: "target_leaf_count",
    expectedTotal: "expected_total",
    generatedCount: "generated_count",
    readyCount: "ready_count",
    failedCount: "failed_count",
    committedCount: "committed_count",
    currentGoalSlug: "current_goal_slug",
    sourceProvider: "source_provider",
    sourceModel: "source_model",
    auditJson: "audit_json",
    generationError: "generation_error",
    finishedAt: "finished_at"
  };
  for (const [key, column] of Object.entries(map)) {
    if (patch[key] === undefined) continue;
    params[key] = key === "auditJson" ? JSON.stringify(patch[key]) : patch[key];
    fields.push(`${column}=${key === "auditJson" ? `CAST(:${key} AS JSON)` : `:${key}`}`);
  }
  if (!fields.length) return;
  await query(`UPDATE interview_bank_rebuild_jobs SET ${fields.join(", ")}, updated_at=NOW() WHERE run_id=:run_id`, params);
}

async function latestInterviewBankRebuildJob() {
  return getOne("SELECT * FROM interview_bank_rebuild_jobs ORDER BY id DESC LIMIT 1").catch(() => null);
}

async function interviewBankRebuildTargetGoals(targetSlugs = interviewBankRebuildTargetSlugs) {
  const catalog = await interviewGenerationGoalCatalog();
  const bySlug = new Map(catalog.map((goal) => [goal.slug, goal]));
  const goals = targetSlugs.map((slug) => bySlug.get(slug)).filter(Boolean);
  const missing = targetSlugs.filter((slug) => !bySlug.has(slug));
  if (missing.length) throw interviewGenerationError(`目标分支不存在：${missing.join("、")}`, 422, "bank_rebuild_target_missing");
  return goals;
}

async function interviewBankRebuildReadyCount(runId, goalSlug = "") {
  const where = ["run_id=:run_id", "quality_status='ready'"];
  const params = { run_id: runId };
  if (goalSlug) {
    where.push("goal_slug=:goal_slug");
    params.goal_slug = goalSlug;
  }
  const row = await getOne(`SELECT COUNT(*) AS count FROM interview_bank_rebuild_items WHERE ${where.join(" AND ")}`, params);
  return Number(row?.count || 0);
}

async function interviewBankRebuildExistingTitles(runId, goalSlug = "") {
  const rows = await query(`SELECT title FROM interview_bank_rebuild_items
    WHERE run_id=:run_id ${goalSlug ? "AND goal_slug=:goal_slug" : ""}
    ORDER BY id DESC LIMIT 160`, { run_id: runId, goal_slug: goalSlug }).catch(() => []);
  return rows.map((row) => row.title).filter(Boolean);
}

async function interviewBankRebuildAudit(runId = "") {
  const job = runId
    ? await getOne("SELECT * FROM interview_bank_rebuild_jobs WHERE run_id=:run_id LIMIT 1", { run_id: runId }).catch(() => null)
    : await latestInterviewBankRebuildJob();
  const selectedRunId = job?.run_id || runId || "";
  if (!selectedRunId) return { runId: "", status: "idle", readyToCommit: false, summary: { expectedTotal: 0, ready: 0, failed: 0 } };
  const [summary, targetRows, duplicateTitles, duplicateCombos, duplicateExamples, incomplete] = await Promise.all([
    getOne(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN quality_status='ready' THEN 1 ELSE 0 END) AS ready,
      SUM(CASE WHEN quality_status='failed' THEN 1 ELSE 0 END) AS failed
      FROM interview_bank_rebuild_items WHERE run_id=:run_id`, { run_id: selectedRunId }),
    query(`SELECT goal_slug AS goalSlug, goal_title AS goalTitle, COUNT(*) AS total
      FROM interview_bank_rebuild_items
      WHERE run_id=:run_id AND quality_status='ready'
      GROUP BY goal_slug, goal_title
      ORDER BY goal_slug`, { run_id: selectedRunId }),
    getOne(`SELECT COUNT(*) AS groups, COALESCE(SUM(c),0) AS rows
      FROM (SELECT COUNT(*) AS c FROM interview_bank_rebuild_items WHERE run_id=:run_id AND quality_status='ready' GROUP BY normalized_title HAVING c>1) d`, { run_id: selectedRunId }),
    getOne(`SELECT COUNT(*) AS groups, COALESCE(SUM(c),0) AS rows
      FROM (SELECT COUNT(*) AS c FROM interview_bank_rebuild_items WHERE run_id=:run_id AND quality_status='ready' GROUP BY combo_key HAVING c>1) d`, { run_id: selectedRunId }),
    getOne(`SELECT COUNT(*) AS groups, COALESCE(SUM(c),0) AS rows
      FROM (
        SELECT COUNT(*) AS c
        FROM interview_bank_rebuild_items
        WHERE run_id=:run_id AND quality_status='ready'
        GROUP BY SHA2(CONCAT_WS('|', title, answer_md, JSON_EXTRACT(example_case,'$.example'), JSON_EXTRACT(example_case,'$.solution'), JSON_EXTRACT(example_case,'$.cause'), JSON_EXTRACT(example_case,'$.summary')),256)
        HAVING c>1
      ) d`, { run_id: selectedRunId }),
    getOne(`SELECT COUNT(*) AS count
      FROM interview_bank_rebuild_items
      WHERE run_id=:run_id AND quality_status='ready' AND (
        title='' OR answer_md='' OR JSON_LENGTH(tags)<4 OR
        COALESCE(JSON_LENGTH(JSON_EXTRACT(answer_points,'$.points')),0)<4 OR
        COALESCE(JSON_LENGTH(JSON_EXTRACT(answer_points,'$.followUps')),0)<2 OR
        JSON_UNQUOTE(JSON_EXTRACT(example_case,'$.example'))='' OR
        JSON_UNQUOTE(JSON_EXTRACT(example_case,'$.solution'))='' OR
        JSON_UNQUOTE(JSON_EXTRACT(example_case,'$.cause'))='' OR
        JSON_UNQUOTE(JSON_EXTRACT(example_case,'$.summary'))=''
      )`, { run_id: selectedRunId })
  ]);
  const domainRows = await query(`SELECT id, goal_slug, goal_title, title, summary, answer_md, answer_points, example_case, scenario_key, tags, normalized_title, combo_key, difficulty
    FROM interview_bank_rebuild_items
    WHERE run_id=:run_id AND quality_status='ready'
    ORDER BY id ASC`, { run_id: selectedRunId }).catch(() => []);
  const targetGoals = await interviewBankRebuildTargetGoals(interviewBankRebuildTargetSlugs).catch(() => []);
  const goalBySlug = new Map(targetGoals.map((goal) => [goal.slug, goal]));
  const domainMismatchSamples = [];
  for (const row of domainRows) {
    const goal = goalBySlug.get(row.goal_slug) || { slug: row.goal_slug, title: row.goal_title };
    const errors = interviewBankDomainErrors(interviewBankStagingRowToItem(row), goal);
    if (errors.length) {
      domainMismatchSamples.push({ id: row.id, goalSlug: row.goal_slug, title: row.title, error: errors.join("；") });
      if (domainMismatchSamples.length >= 12) break;
    }
  }
  const expectedTotal = Number(job?.expected_total || 0);
  const ready = Number(summary?.ready || 0);
  const targetCounts = targetRows.map((row) => ({ goalSlug: row.goalSlug, goalTitle: row.goalTitle, total: Number(row.total || 0) }));
  const targetLeafCount = Number(job?.target_leaf_count || 0);
  const expectedGoalCount = targetLeafCount ? Math.floor(expectedTotal / targetLeafCount) : 0;
  const perGoalComplete = Boolean(
    targetLeafCount > 0 &&
    expectedGoalCount > 0 &&
    targetCounts.length === expectedGoalCount &&
    targetCounts.every((row) => row.total === targetLeafCount)
  );
  const audit = {
    runId: selectedRunId,
    status: job?.status || "draft",
    summary: {
      expectedTotal,
      total: Number(summary?.total || 0),
      ready,
      failed: Number(summary?.failed || 0)
    },
    targetLeafCount,
    expectedGoalCount,
    perGoalComplete,
    targetCounts,
    duplicates: {
      titleGroups: Number(duplicateTitles?.groups || 0),
      titleRows: Number(duplicateTitles?.rows || 0),
      comboGroups: Number(duplicateCombos?.groups || 0),
      comboRows: Number(duplicateCombos?.rows || 0),
      exampleGroups: Number(duplicateExamples?.groups || 0),
      exampleRows: Number(duplicateExamples?.rows || 0)
    },
    incomplete: Number(incomplete?.count || 0),
    domainMismatch: {
      count: domainMismatchSamples.length,
      samples: domainMismatchSamples
    }
  };
  audit.readyToCommit = Boolean(
    expectedTotal > 0 &&
    ready === expectedTotal &&
    audit.perGoalComplete &&
    audit.duplicates.titleGroups === 0 &&
    audit.duplicates.comboGroups === 0 &&
    audit.duplicates.exampleGroups === 0 &&
    audit.incomplete === 0 &&
    audit.domainMismatch.count === 0
  );
  return audit;
}

function resetInterviewQuestionRuntimeCaches() {
  interviewPublicQuestionIndexState = { value: null, expiresAt: 0, promise: null };
  publicRouteMemoryCache.clear();
}

async function commitInterviewBankRebuild(runId) {
  const audit = await interviewBankRebuildAudit(runId);
  if (!audit.readyToCommit) throw interviewGenerationError("staging 审计未通过，拒绝清库注入", 409, "bank_rebuild_audit_not_ready");
  const rows = await query(`SELECT * FROM interview_bank_rebuild_items
    WHERE run_id=:run_id AND quality_status='ready'
    ORDER BY goal_slug ASC, position ASC, id ASC`, { run_id: runId });
  const goals = await interviewBankRebuildTargetGoals(interviewBankRebuildTargetSlugs);
  const goalBySlug = new Map(goals.map((goal) => [goal.slug, goal]));
  const topicTitleBySlug = new Map(goals.map((goal) => [goal.slug, interviewBankRebuildTopicTitle(goal)]));
  const topicIdByTitle = new Map();
  for (const title of [...new Set([...topicTitleBySlug.values()])]) {
    const topic = await ensureManualInterviewTopic(title);
    topicIdByTitle.set(title, topic.id);
  }
  await updateInterviewBankRebuildJob(runId, { status: "committing" });
  const connection = await pool.getConnection();
  let committed = 0;
  try {
    await connection.beginTransaction();
    await connection.query("SET FOREIGN_KEY_CHECKS=0");
    for (const table of ["interview_goal_question_links", "interview_progress", "interview_question_insights", "interview_insights", "interview_day_questions", "interview_daily_sets", "interview_days", "interview_generation_candidates", "interview_generation_batches", "interview_questions"]) {
      const [exists] = await connection.query("SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=? LIMIT 1", [table]);
      if (exists.length) await connection.query(`DELETE FROM ${quotedIdentifier(table)}`);
    }
    await connection.query("SET FOREIGN_KEY_CHECKS=1");
    for (const row of rows) {
      const goal = goalBySlug.get(row.goal_slug) || {};
      const topicTitle = topicTitleBySlug.get(row.goal_slug) || row.topic_title || "面试题";
      const topicId = topicIdByTitle.get(topicTitle) || null;
      const slug = cleanKey(`bank-${row.goal_slug}-${row.position}-${privacyHash(row.title).slice(0, 10)}`, `bank-${row.id}`);
      const answerPoints = normalizeInterviewAnswerMeta(row.answer_points || {});
      const exampleCase = normalizeInterviewExampleCase(row.example_case || {});
      const tags = parseTags(row.tags);
      const sourceHash = interviewQuestionExampleSourceHash({
        title: row.title,
        answer_md: row.answer_md,
        tags,
        difficulty: row.difficulty,
        topic_slug: row.goal_slug,
        topic_title: row.goal_title,
        goal_ids: String(goal.id || row.goal_id || "")
      });
      const [result] = await connection.query(`INSERT INTO interview_questions
        (topic_id,slug,title,summary,answer_md,answer_html,answer_points,example_case,example_case_source_hash,example_case_provider,example_case_model,example_case_updated_at,example_case_error,difficulty,source,tags,status,sort_order,reviewed_at,created_at,updated_at,deleted_at)
        VALUES(?,?,?,?,?,?,CAST(? AS JSON),CAST(? AS JSON),?,?,?,NOW(),NULL,?,?,CAST(? AS JSON),'published',?,NOW(),NOW(),NOW(),NULL)`, [
        topicId,
        slug,
        row.title,
        row.summary || cleanText(stripMarkdown(row.answer_md).slice(0, 220), 500),
        row.answer_md,
        markdownToHtml(row.answer_md || ""),
        JSON.stringify(answerPoints),
        JSON.stringify(exampleCase),
        sourceHash,
        "bank-rebuild-ai",
        row.source_model || "",
        cleanInterviewDifficulty(row.difficulty, answerPoints.difficulty || "项目追问"),
        "bank-rebuild-ai",
        JSON.stringify(tags),
        Number(row.position || 0)
      ]);
      const questionId = result.insertId;
      if (goal.id) {
        await connection.query("INSERT IGNORE INTO interview_goal_question_links(goal_id,question_id,is_primary,created_at) VALUES(?,?,1,NOW())", [goal.id, questionId]);
      }
      committed += 1;
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS=1").catch(() => {});
    connection.release();
  }
  resetInterviewQuestionRuntimeCaches();
  syncSearchIndex().catch((error) => console.warn("search sync after interview bank rebuild failed", error?.message || error));
  await updateInterviewBankRebuildJob(runId, { status: "committed", committedCount: committed, finishedAt: new Date() });
  Object.assign(interviewBankRebuildState, {
    status: "committed",
    committedCount: committed,
    finishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  return { committed, audit };
}

async function runInterviewBankRebuildJob(options = {}) {
  const provider = cleanKey(options.provider || process.env.LLM_PROVIDER || "deepseek", "deepseek");
  interviewLlmConfig(provider);
  const runId = options.runId || interviewBankRebuildRunId();
  const generationMode = cleanKey(options.mode || options.generationMode || "llm-single", "llm-single");
  const targetLeafCount = clampNumber(options.leafCount ?? options.targetLeafCount, 1, 1000, 100);
  const chunkSize = generationMode === "llm-single" ? 1 : clampNumber(options.chunkSize, 1, 5, 1);
  const targetSlugs = Array.isArray(options.targetSlugs) && options.targetSlugs.length
    ? options.targetSlugs.map((slug) => cleanKey(slug, "")).filter(Boolean)
    : interviewBankRebuildTargetSlugs;
  const goals = await interviewBankRebuildTargetGoals(targetSlugs);
  const expectedTotal = goals.length * targetLeafCount;
  Object.assign(interviewBankRebuildState, {
    running: true,
    runId,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finishedAt: null,
    status: "generating",
    targetLeafCount,
    expectedTotal,
    generatedCount: 0,
    readyCount: 0,
    failedCount: 0,
    committedCount: 0,
    lastError: "",
    lastIds: []
  });
  await query(`INSERT INTO interview_bank_rebuild_jobs
    (run_id,status,target_leaf_count,expected_total,generated_count,ready_count,failed_count,committed_count,current_goal_slug,source_provider,source_model,audit_json,generation_error,started_at,finished_at,created_at,updated_at)
    VALUES(:run_id,'generating',:target_leaf_count,:expected_total,0,0,0,0,'',:source_provider,'',NULL,NULL,NOW(),NULL,NOW(),NOW())`, {
    run_id: runId,
    target_leaf_count: targetLeafCount,
    expected_total: expectedTotal,
    source_provider: provider
  });
  let generatedCount = 0;
  let failedCount = 0;
  let lastProvider = provider;
  let lastModel = "";
  try {
    for (const goal of goals) {
      interviewBankRebuildState.currentGoalSlug = goal.slug;
      interviewBankRebuildState.currentGoalTitle = goal.title;
      await updateInterviewBankRebuildJob(runId, { currentGoalSlug: goal.slug });
      let goalReady = await interviewBankRebuildReadyCount(runId, goal.slug);
      let safetyFailures = 0;
      while (goalReady < targetLeafCount) {
        const needed = Math.min(chunkSize, targetLeafCount - goalReady);
        const existingTitles = await interviewBankRebuildExistingTitles(runId, goal.slug);
        let generated;
        let savedInRound = 0;
        try {
          generated = await generateInterviewBankRebuildItems({
            runId,
            goal,
            count: needed,
            startPosition: goalReady + 1,
            existingTitles,
            provider,
            retryCount: safetyFailures
          });
          lastProvider = generated.provider || lastProvider;
          lastModel = generated.model || lastModel;
          for (const item of generated.items) {
            try {
              await insertInterviewBankRebuildItem(runId, item);
              savedInRound += 1;
              generatedCount += 1;
            } catch (error) {
              if (error?.code === "ER_DUP_ENTRY" || error?.errno === 1062) {
                failedCount += 1;
                safetyFailures += 1;
                continue;
              }
              throw error;
            }
          }
          if (!savedInRound) {
            failedCount += 1;
            safetyFailures += 1;
          }
        } catch (error) {
          failedCount += 1;
          safetyFailures += 1;
          interviewBankRebuildState.lastError = cleanText(error?.message || "本轮生成失败", 1200);
          if (isFatalInterviewLlmError(error)) throw error;
          if (safetyFailures % 4 === 0) await new Promise((resolve) => setTimeout(resolve, 800));
        }
        goalReady = await interviewBankRebuildReadyCount(runId, goal.slug);
        const readyCount = await interviewBankRebuildReadyCount(runId);
        Object.assign(interviewBankRebuildState, {
          generatedCount,
          readyCount,
          failedCount,
          updatedAt: new Date().toISOString(),
          lastIds: generated?.items?.map((item) => item.normalizedTitle).slice(0, 5) || []
        });
        await updateInterviewBankRebuildJob(runId, {
          generatedCount,
          readyCount,
          failedCount,
          sourceProvider: lastProvider,
          sourceModel: lastModel,
          generationError: interviewBankRebuildState.lastError || null
        });
        if (safetyFailures > Math.max(200, targetLeafCount * 4)) {
          throw interviewGenerationError(`${goal.title} 连续质量失败过多，已停止，避免灌入低质量题`, 422, "bank_rebuild_quality_loop");
        }
      }
    }
    const audit = await interviewBankRebuildAudit(runId);
    await updateInterviewBankRebuildJob(runId, { auditJson: audit });
    if (!audit.readyToCommit) {
      await updateInterviewBankRebuildJob(runId, { status: "audit_failed", generationError: "staging 审计未通过", finishedAt: new Date() });
      Object.assign(interviewBankRebuildState, { status: "audit_failed", finishedAt: new Date().toISOString(), running: false });
      return publicInterviewBankRebuildState();
    }
    if (options.autoCommit !== false) {
      await commitInterviewBankRebuild(runId);
    } else {
      await updateInterviewBankRebuildJob(runId, { status: "ready", finishedAt: new Date() });
      Object.assign(interviewBankRebuildState, { status: "ready", finishedAt: new Date().toISOString() });
    }
  } catch (error) {
    const message = cleanText(error?.message || "题库重建失败", 1200);
    await updateInterviewBankRebuildJob(runId, { status: "failed", generationError: message, finishedAt: new Date() }).catch(() => {});
    Object.assign(interviewBankRebuildState, { status: "failed", lastError: message, finishedAt: new Date().toISOString() });
  } finally {
    interviewBankRebuildState.running = false;
    interviewBankRebuildState.updatedAt = new Date().toISOString();
  }
  return publicInterviewBankRebuildState();
}

async function publicInterviewBankRebuildState() {
  const job = await latestInterviewBankRebuildJob();
  const audit = job?.run_id ? await interviewBankRebuildAudit(job.run_id).catch(() => null) : null;
  return {
    running: interviewBankRebuildState.running,
    runId: interviewBankRebuildState.runId || job?.run_id || "",
    status: interviewBankRebuildState.running ? interviewBankRebuildState.status : (job?.status || "idle"),
    currentGoalSlug: interviewBankRebuildState.currentGoalSlug || job?.current_goal_slug || "",
    currentGoalTitle: interviewBankRebuildState.currentGoalTitle || "",
    targetLeafCount: Number(job?.target_leaf_count || interviewBankRebuildState.targetLeafCount || 100),
    expectedTotal: Number(job?.expected_total || interviewBankRebuildState.expectedTotal || 0),
    generatedCount: Number(job?.generated_count || interviewBankRebuildState.generatedCount || 0),
    readyCount: Number(job?.ready_count || interviewBankRebuildState.readyCount || audit?.summary?.ready || 0),
    failedCount: Number(job?.failed_count || interviewBankRebuildState.failedCount || 0),
    committedCount: Number(job?.committed_count || interviewBankRebuildState.committedCount || 0),
    source: { provider: job?.source_provider || "", model: job?.source_model || "" },
    startedAt: job?.started_at || interviewBankRebuildState.startedAt,
    updatedAt: job?.updated_at || interviewBankRebuildState.updatedAt,
    finishedAt: job?.finished_at || interviewBankRebuildState.finishedAt,
    error: job?.generation_error || interviewBankRebuildState.lastError || "",
    audit
  };
}

async function startInterviewBankRebuild(req, url) {
  if (!databaseAvailable) throw interviewGenerationError("数据库不可用，不能重建题库", 503, "database_unavailable");
  if (interviewBankRebuildState.running) return { job: await publicInterviewBankRebuildState(), alreadyRunning: true };
  const body = await readBody(req).catch(() => ({}));
  const provider = cleanKey(body.provider || url.searchParams.get("provider") || process.env.LLM_PROVIDER || "deepseek", "deepseek");
  const mode = cleanKey(body.mode || url.searchParams.get("mode") || "llm-single", "llm-single");
  const leafCount = clampNumber(body.leafCount ?? body.leaf_count ?? url.searchParams.get("leafCount"), 1, 1000, 100);
  const chunkSize = mode === "llm-single" ? 1 : clampNumber(body.chunkSize ?? body.chunk_size ?? url.searchParams.get("chunkSize"), 1, 5, 1);
  const targetSlugs = parseTags(body.targetSlugs || body.target_slugs || url.searchParams.get("targetSlugs") || "").filter(Boolean);
  const autoCommitValue = body.autoCommit ?? body.auto_commit ?? url.searchParams.get("autoCommit") ?? url.searchParams.get("auto_commit");
  const autoCommit = autoCommitValue === undefined || autoCommitValue === ""
    ? true
    : !["0", "false", "no", "off"].includes(String(autoCommitValue).trim().toLowerCase());
  const runId = interviewBankRebuildRunId();
  Object.assign(interviewBankRebuildState, {
    running: true,
    runId,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finishedAt: null,
    status: "generating",
    targetLeafCount: leafCount,
    expectedTotal: targetSlugs.length ? targetSlugs.length * leafCount : interviewBankRebuildTargetSlugs.length * leafCount,
    generatedCount: 0,
    readyCount: 0,
    failedCount: 0,
    committedCount: 0,
    currentGoalSlug: "",
    currentGoalTitle: "",
    lastError: "",
    lastIds: []
  });
  runInterviewBankRebuildJob({ runId, provider, leafCount, chunkSize, targetSlugs, autoCommit, mode }).catch((error) => {
    Object.assign(interviewBankRebuildState, {
      running: false,
      status: "failed",
      lastError: cleanText(error?.message || "题库重建任务启动失败", 1200),
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  });
  return { job: { ...interviewBankRebuildState, runId, status: "generating", targetLeafCount: leafCount }, accepted: true };
}

const interviewExampleCaseBackfillState = {
  running: false,
  startedAt: null,
  updatedAt: null,
  finishedAt: null,
  force: false,
  limit: 0,
  chunkSize: 5,
  provider: "",
  processed: 0,
  success: 0,
  failed: 0,
  skipped: 0,
  lastError: "",
  lastIds: []
};

const uniqueInterviewExampleDomains = [
  {
    id: "FOC",
    title: "FOC 工程实例",
    keywords: ["FOC", "SVPWM", "电流环", "速度环", "位置环", "弱磁", "编码器", "母线", "电机", "过调制"],
    scenes: ["带载启动台架", "高速弱磁验证", "SVPWM 扇区切换点", "低速爬行工况", "客户现场换电机后", "长稳升温阶段", "母线电压下探窗口"],
    artifacts: ["三相电流波形", "Iq/Id 限幅日志", "ADC 采样时间戳", "编码器角度差分曲线", "母线电压保护记录", "PWM 比较寄存器快照", "转速环误差趋势"],
    actions: ["校正采样触发点", "拆开电流环和速度环验证", "固定 PI 参数只改限幅", "对调相序并重算零位", "回放同一段速度指令", "把保护阈值和波形时间戳对齐"],
    causes: ["采样相位和电角度没有对齐", "限幅策略在边界工况下提前介入", "反馈角度抖动被电流环放大", "速度指令斜率超过当前电压裕量", "硬件保护时间戳和软件保护口径不一致"],
    verifies: ["空载、半载、额定负载三组波形", "低速、高速、弱磁三段回归", "连续 30 分钟温升曲线", "同一参数包在两台电机上的复测"]
  },
  {
    id: "嵌入式",
    title: "嵌入式现场实例",
    keywords: ["STM32", "DMA", "ADC", "PWM", "Flash", "中断", "HardFault", "看门狗", "寄存器", "内存", "启动文件", "堆栈"],
    scenes: ["固件升级回归", "高频采样压力测试", "现场偶发复位", "Flash 写入保护窗口", "中断嵌套压力上来后", "产测烧录后首次启动", "低功耗唤醒后"],
    artifacts: ["HardFault 栈帧", "复位原因寄存器", "DMA 写指针", "栈水位记录", "Flash 校验值", "中断计数器", "外设寄存器快照"],
    actions: ["保留异常栈帧", "二分固件版本", "把 DMA 边界加断言", "记录进入中断前后的寄存器", "拆开 Flash 擦写和业务任务", "用看门狗窗口复现边界输入"],
    causes: ["缓冲区生命周期和中断回调边界不清", "栈空间估算没有覆盖最深调用链", "Flash 操作阻塞了实时任务", "DMA 半传输和全传输处理顺序混乱", "初始化顺序依赖了未稳定的外设状态"],
    verifies: ["冷启动、热启动和异常断电回归", "压力样本跑满 12 小时", "边界长度和空包样本复测", "升级前后 CRC 与日志对齐"]
  },
  {
    id: "RTOS",
    title: "RTOS 调度实例",
    keywords: ["RTOS", "FreeRTOS", "任务", "队列", "信号量", "互斥", "优先级", "堆栈", "调度", "竞态", "死锁"],
    scenes: ["多任务并发压测", "日志量突然增大", "控制周期抖动", "通信任务阻塞", "临界区变长", "同优先级任务抢占", "队列满载回放"],
    artifacts: ["任务运行时间 trace", "队列水位", "锁持有时间", "栈水位", "中断屏蔽时长", "调度切换记录", "超时计数器"],
    actions: ["统计每个任务最大运行时间", "缩短临界区", "拆分阻塞日志", "调整消息队列深度", "把 ISR 通信改成轻量通知", "给锁等待加超时日志"],
    causes: ["优先级和资源占用没有匹配实时链路", "低优先级任务持锁时间过长", "队列生产速度长期大于消费速度", "ISR 和任务之间共享状态缺少边界", "日志 IO 进入了实时路径"],
    verifies: ["最坏周期时间统计", "队列峰值回归", "长稳 trace 对照", "禁用日志后的对比曲线"]
  },
  {
    id: "通信",
    title: "通信协议实例",
    keywords: ["CAN", "I2C", "SPI", "UART", "通信", "CRC", "丢帧", "粘包", "超时", "总线", "协议"],
    scenes: ["线下联调抓包", "高频上报压测", "长线缆换型", "异常重传窗口", "设备热插拔", "多节点同时上电", "波特率切换后"],
    artifacts: ["逻辑分析仪帧间隔", "CRC 失败率", "重传计数", "DMA 接收缓冲区", "协议状态机分支", "ACK/NACK 时间戳", "总线错误计数器"],
    actions: ["回放原始帧", "检查长度字段和 CRC 覆盖范围", "给状态机增加异常恢复分支", "分离半包和完整包处理", "调整超时窗口", "记录每次重传的原因码"],
    causes: ["协议只覆盖理想路径", "半包和乱序后状态机没有复位", "超时窗口和真实总线延迟不匹配", "DMA 接收边界没有清理旧数据", "错误帧重传缺少幂等设计"],
    verifies: ["异常帧回放", "不同波特率回归", "热插拔测试", "连续丢帧样本压测"]
  },
  {
    id: "ROS",
    title: "机器人系统实例",
    keywords: ["ROS", "ROS2", "TF", "QoS", "launch", "bag", "节点", "话题", "仿真", "导航", "里程计"],
    scenes: ["实机联调", "bag 回放对照", "多节点启动", "仿真切实机", "传感器频率下降", "导航闭环测试", "坐标系重映射后"],
    artifacts: ["topic hz 频率", "TF 时间戳", "QoS 丢样统计", "bag 对照样本", "节点生命周期日志", "launch 参数快照", "坐标变换树"],
    actions: ["固定 launch 参数", "对比仿真和实机话题", "检查 TF 发布频率", "重放同一段 bag", "拆开感知、控制和通信节点", "把 QoS 配置写入回归样本"],
    causes: ["时间同步和启动依赖没有被固化", "QoS 策略不适合实机丢包场景", "TF 链路存在短时断裂", "仿真输入和实机传感器噪声分布不同", "节点生命周期没有覆盖异常重启"],
    verifies: ["bag 回放和实机双通道验证", "多次冷启动回归", "话题频率监控", "TF 延迟阈值检查"]
  },
  {
    id: "Linux",
    title: "Linux 部署实例",
    keywords: ["Ubuntu", "Linux", "驱动", "内核", "权限", "系统", "脚本", "部署", "日志", "udev", "systemd"],
    scenes: ["部署到新 Ubuntu 环境", "服务重启后", "设备热插拔", "权限策略收紧", "日志轮转后", "内核版本升级", "开机自启动链路"],
    artifacts: ["dmesg 设备日志", "systemctl 状态", "journalctl 时间线", "udev 规则", "权限位对照", "内核模块加载记录", "启动脚本输出"],
    actions: ["固定用户和权限", "拆开服务启动顺序", "对比正常机器的 udev 规则", "记录设备节点创建时间", "把环境变量写入服务文件", "检查内核模块和驱动版本"],
    causes: ["设备节点和服务启动存在竞态", "权限规则没有覆盖新设备名", "脚本依赖了交互式 shell 环境", "日志轮转影响了文件句柄", "内核版本差异改变了驱动行为"],
    verifies: ["冷启动、热插拔和重启回归", "不同用户权限复测", "服务自恢复测试", "升级前后配置 diff"]
  },
  {
    id: "视觉 AI",
    title: "视觉 AI 实例",
    keywords: ["视觉", "视觉识别", "目标检测", "分割", "跟踪", "小目标", "漏检", "误检", "mAP", "NMS", "置信度", "数据集", "标注", "模型", "推理"],
    scenes: ["相机样本回放", "小目标漏检复盘", "夜间数据集验证", "模型换版回归", "边缘端推理压测", "标注规则调整后", "现场光照突变窗口"],
    artifacts: ["漏检样本清单", "混淆矩阵", "置信度分布", "NMS 前后框数量", "标注版本 diff", "推理耗时曲线", "特征热力图"],
    actions: ["固定同一批图片回放", "分开验证标注和模型输出", "调整置信度阈值做对照", "把漏检样本按尺度分桶", "对比 NMS 前后的候选框", "保留模型版本和数据集 hash"],
    causes: ["小目标尺度低于当前特征层有效分辨率", "标注口径和训练样本不一致", "置信度阈值把边界样本过滤掉", "NMS 在密集目标里压掉了正确框", "现场光照分布和训练集差异过大"],
    verifies: ["同一漏检样本集回放", "按尺度分桶统计召回率", "新旧模型 mAP 对照", "端侧推理耗时和召回双指标回归"]
  },
  {
    id: "项目表达",
    title: "项目表达实例",
    keywords: ["项目表达", "作品集", "项目亮点", "项目答辩", "复盘", "面试复盘", "表达", "量产", "交付", "验证记录", "长稳测试", "工程验证"],
    scenes: ["项目答辩准备", "作品集复盘", "量产前评审", "交付记录整理", "面试追问演练", "长稳测试复盘", "客户现场复盘"],
    artifacts: ["版本对比表", "长稳测试记录", "风险闭环清单", "关键日志截图", "指标前后对比", "问题复盘时间线", "项目架构图"],
    actions: ["把问题拆成背景、动作和结果", "用一张表对齐指标前后变化", "把限制条件写成工程取舍", "用日志截图证明闭环", "准备可量化的复盘结论", "把不能改硬件的约束转成验证边界"],
    causes: ["表达只讲了做过什么，没有证明为什么有效", "项目亮点缺少可量化指标", "限制条件没有转成工程取舍", "复盘没有把风险和验证闭环讲清楚", "证据链缺少版本和样本对照"],
    verifies: ["答辩版讲稿回放", "指标表复核", "项目复盘清单", "限制条件下的替代验证", "面试追问脚本演练"]
  },  {
    id: "通用",
    title: "项目排查实例",
    keywords: [],
    scenes: ["现场复现", "版本回归", "联调测试", "交付前压测", "异常反馈后", "新分支合入后", "配置切换后"],
    artifacts: ["日志时间线", "关键指标曲线", "版本 diff", "输入输出样本", "配置快照", "异常计数", "回归记录"],
    actions: ["固定复现条件", "做单变量对照", "保留修改前后证据", "把边界样本写进回归", "拆开输入、处理和输出链路", "记录每次假设的验证结果"],
    causes: ["边界条件没有被测试覆盖", "配置和代码假设不一致", "异常恢复路径缺少证据", "版本差异扩大了小问题", "输入样本超过了原有假设"],
    verifies: ["复现脚本", "边界样本", "回归清单", "长稳数据", "对照组曲线"]
  }
];

const uniqueInterviewTermDictionary = [
  "FOC", "SVPWM", "PWM", "ADC", "DMA", "Flash", "CAN", "I2C", "SPI", "UART", "RTOS", "FreeRTOS", "ROS", "ROS2", "TF", "QoS",
  "Ubuntu", "Linux", "STM32", "STM32G4", "HardFault", "CRC", "PID", "PI", "电流环", "速度环", "位置环", "弱磁", "编码器", "母线电压",
  "相电流", "采样点", "电角度", "零位", "相序", "过调制", "堵转", "过流", "欠压", "过压", "死机", "复位", "看门狗", "堆栈",
  "中断", "任务", "队列", "信号量", "互斥锁", "优先级", "调度", "寄存器", "内存", "粘包", "丢帧", "超时", "抓包", "日志",
  "launch", "bag", "节点", "话题", "导航", "里程计", "udev", "systemd", "dmesg", "视觉 AI", "视觉识别", "目标检测", "分割", "跟踪", "小目标", "漏检", "误检", "mAP", "NMS", "置信度", "数据集", "标注", "模型", "推理", "作品集", "项目表达", "项目亮点", "项目答辩", "复盘", "量产", "交付", "长稳测试"
];

const uniqueInterviewFaultTerms = ["过调制", "削顶", "谐波", "毛刺", "噪声", "欠压", "过压", "过流", "堵转", "死机", "HardFault", "丢帧", "掉帧", "丢样", "粘包", "超时", "抖动", "漂移", "温升", "复位", "内存越界", "Flash 写入失败", "启动失败", "启动异常", "误判", "不稳定", "异常", "漏检", "误检", "误码", "队列满", "FPS", "帧率", "卡顿", "响应慢", "通信异常", "召回下降", "指标波动"];

function normalizeUniqueFaultTerm(term = "") {
  const raw = cleanText(term, 32);
  const map = {
    FPS: "帧率不足",
    "帧率": "帧率不足",
    "误码": "误码率升高",
    "队列满": "队列满载",
    "掉帧": "连续掉帧",
    "丢样": "传感器丢样",
    "Flash": "Flash 写入异常",
    "HardFault": "HardFault",
    "启动失败": "启动失败",
    "启动异常": "启动异常"
  };
  return map[raw] || raw || "异常现象";
}

const uniqueInterviewIntents = [
  { id: "debug", words: ["排查", "定位", "故障", "异常", "解决", "发现"], label: "排查闭环", fallbackFault: "复现不稳定" },
  { id: "verify", words: ["验证", "判断", "确认", "证明", "评估"], label: "验证判断", fallbackFault: "判断证据不足" },
  { id: "why", words: ["为什么", "原因", "作用", "需要", "原理"], label: "因果解释", fallbackFault: "因果链不完整" },
  { id: "design", words: ["设计", "实现", "方案", "架构", "流程"], label: "方案落地", fallbackFault: "接口边界遗漏" },
  { id: "compare", words: ["区别", "对比", "相比", "选择", "取舍"], label: "方案取舍", fallbackFault: "方案边界混淆" },
  { id: "optimize", words: ["优化", "改善", "提升", "降低", "减少"], label: "指标优化", fallbackFault: "指标波动超限" }
];

function uniqueExampleSeedParts(row = {}) {
  const hash = crypto.createHash("sha1").update([row.id, row.title, row.summary, row.tags, row.answer_md].map((item) => String(item || "")).join("|")).digest("hex");
  return { hash, seed: Number.parseInt(hash.slice(0, 8), 16) || 0, marker: `L${hash.slice(0, 6).toUpperCase()}` };
}

function uniqueExamplePick(list = [], seed = 0, offset = 0) {
  if (!list.length) return "";
  return list[Math.abs(seed + offset * 2654435761) % list.length];
}

function uniqueExampleText(row = {}) {
  return [row.title, row.summary, row.answer_md, row.topic_title, row.topic_slug, parseTags(row.tags).join(" ")].join(" ");
}

function uniqueExampleTerms(row = {}) {
  const text = uniqueExampleText(row);
  const tags = parseTags(row.tags).map((item) => cleanText(item, 28)).filter((item) => item && !["高频必会", "项目追问", "基础", "训练"].includes(item));
  const english = [...String(text).matchAll(/\b[A-Za-z][A-Za-z0-9_+.-]{1,}\b/g)].map((match) => match[0]);
  const dictionaryHits = uniqueInterviewTermDictionary.filter((term) => text.includes(term));
  const topic = [row.topic_title, row.topic_slug].map((item) => cleanText(item, 28)).filter(Boolean);
  return [...new Set([...tags, ...dictionaryHits, ...english, ...topic])]
    .filter((item) => item && item.length <= 28)
    .slice(0, 8);
}

function uniqueExampleDomain(row = {}) {
  const strongText = [row.title, row.summary, row.topic_title, row.topic_slug, parseTags(row.tags).join(" ")].join(" ");
  const weakText = String(row.answer_md || "");
  const fallback = uniqueInterviewExampleDomains[uniqueInterviewExampleDomains.length - 1];
  const technicalPriority = [
    { id: "FOC", words: ["FOC", "SVPWM", "电流环", "速度环", "位置环", "弱磁", "电角度", "编码器", "母线电压", "抗积分饱和"] },
    { id: "视觉 AI", words: ["视觉", "视觉 AI", "目标检测", "分割", "跟踪", "小目标", "漏检", "误检", "mAP", "NMS", "置信度", "数据集", "标注", "模型推理"] },
    { id: "ROS", words: ["ROS", "ROS2", "TF", "QoS", "launch", "bag", "话题", "导航", "里程计"] },
    { id: "RTOS", words: ["RTOS", "FreeRTOS", "任务调度", "队列", "信号量", "互斥锁", "死锁", "优先级反转"] },
    { id: "通信", words: ["CAN", "I2C", "SPI", "UART", "CRC", "丢帧", "粘包", "抓包", "总线"] },
    { id: "嵌入式", words: ["STM32", "DMA", "ADC", "PWM", "Flash", "中断", "HardFault", "看门狗", "寄存器", "堆栈", "启动文件"] },
    { id: "Linux", words: ["Ubuntu", "Linux", "udev", "systemd", "dmesg", "journalctl", "内核", "权限"] }
  ];
  for (const priority of technicalPriority) {
    if (priority.words.some((word) => strongText.includes(word))) {
      const matched = uniqueInterviewExampleDomains.find((domain) => domain.id === priority.id);
      if (matched) return matched;
    }
  }
  let best = fallback;
  let bestScore = -1;
  for (const domain of uniqueInterviewExampleDomains) {
    const score = domain.keywords.reduce((sum, word) => {
      if (!word) return sum;
      return sum + (strongText.includes(word) ? 5 : 0) + (weakText.includes(word) ? 1 : 0);
    }, 0);
    if (score > bestScore) {
      best = domain;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : fallback;
}

function uniqueExampleIntent(row = {}) {
  const text = uniqueExampleText(row);
  return uniqueInterviewIntents.find((intent) => intent.words.some((word) => text.includes(word))) || uniqueInterviewIntents[0];
}

function uniqueExampleFault(row = {}, intent = uniqueInterviewIntents[0]) {
  const text = uniqueExampleText(row);
  const strongText = [row.title, row.topic_title, row.topic_slug, parseTags(row.tags).join(" ")].join(" ");
  const preferredFaultTerms = uniqueInterviewFaultTerms.filter((term) => term !== "异常");
  const matched = preferredFaultTerms.find((term) => strongText.includes(term)) ||
    preferredFaultTerms.find((term) => text.includes(term)) ||
    (text.includes("异常") ? "异常" : "");
  return normalizeUniqueFaultTerm(matched || intent.fallbackFault || "异常现象");
}

function uniqueExampleFocus(row = {}, terms = [], intent = uniqueInterviewIntents[0]) {
  const title = cleanText(row.title || "", 180);
  const text = [title, row.summary, parseTags(row.tags).join(" ")].join(" ");
  const fragments = title
    .replace(/[？?]/g, "")
    .split(/[，,；;。]|如果|当|请|如何|怎么|为什么|哪些|什么|是否|能否|说明|分析/)
    .map((item) => cleanText(item, 34))
    .filter((item) => item.length >= 4 && !/^在/.test(item) && !/[时里中的]$/.test(item));
  const matched = fragments.find((item) => terms.some((term) => item.includes(term)));
  const primary = terms[0] || cleanText(row.topic_title || row.topic_slug || "关键模块", 18);
  const secondary = terms.find((term) => term !== primary) || intent.label;
  if (matched && matched.length >= 8) return matched;
  const scenario = ["版本升级", "交付验收", "负载阶跃", "长稳测试", "现场联调", "驱动初始化", "低速启动", "高速弱磁", "项目答辩", "量产验证"]
    .find((word) => text.includes(word)) || "现场问题";
  const fault = uniqueExampleFault(row, intent);
  const patterns = {
    debug: `定位${scenario}里${primary}与${secondary}导致${fault}的证据链`,
    verify: `验证${scenario}下${primary}和${secondary}是否真是${fault}根因`,
    why: `解释${primary}在${scenario}触发${fault}的因果链`,
    design: `设计${scenario}下${primary}和${secondary}的可回归方案`,
    compare: `对比${scenario}里${primary}和${secondary}两条排查路径`,
    optimize: `优化${scenario}中${primary}相关的${fault}指标`
  };
  return patterns[intent.id] || `${primary}与${secondary}的${intent.label}`;
}

function buildUniqueInterviewExampleCase(row = {}) {
  const { hash, seed, marker } = uniqueExampleSeedParts(row);
  const domain = uniqueExampleDomain(row);
  const intent = uniqueExampleIntent(row);
  const terms = uniqueExampleTerms(row);
  const primary = terms[0] || domain.id;
  const secondary = terms.find((term) => term !== primary) || intent.label;
  const focus = uniqueExampleFocus(row, terms, intent);
  const fault = uniqueExampleFault(row, intent);
  const scene = uniqueExamplePick(domain.scenes, seed, 1);
  const artifact = uniqueExamplePick(domain.artifacts, seed, 2);
  const action = uniqueExamplePick(domain.actions, seed, 3);
  const cause = uniqueExamplePick(domain.causes, seed, 4);
  const verification = uniqueExamplePick(domain.verifies, seed, 5);
  const branch = `r${(seed % 17) + 2}.${Number.parseInt(hash.slice(8, 10), 16) % 10}.${Number.parseInt(hash.slice(10, 12), 16) % 10}`;
  const windowMs = 8 + (seed % 117);
  const sampleCount = 3 + (seed % 9);
  const threshold = `${(Number.parseInt(hash.slice(12, 14), 16) % 7) + 2}.${Number.parseInt(hash.slice(14, 15), 16)}%`;
  const title = `${primary} 实例拆解`;
  const exampleCase = normalizeInterviewExampleCase({
    title,
    example: `例：${scene}里，现场表现为${fault}，排查目标是${focus}。我会把现场记成日志批次 ${marker}：固件分支 ${branch}，连续 ${sampleCount} 组输入复现后，重点抓 ${artifact}，并把 ${primary} 与 ${secondary} 的时间线对齐到 ${windowMs}ms 窗口内。`,
    solution: `处理顺序是先固定版本、负载和输入样本，再围绕 ${artifact} 做单变量验证；第一步做 ${action}，第二步把正常组和异常组的日志 diff 保存下来，第三步只改一个参数或一段逻辑，并用同一批次 ${marker} 的样本复测。`,
    cause: `原因判断必须回到 ${primary} 和 ${secondary} 的证据链：${cause}。如果题干是在排除某个根因，就先用 ${artifact} 证明它和异常不同步；不能只背 ${intent.label} 的结论，证据要解释为什么偏差超过 ${threshold} 后才暴露。`,
    summary: `面试回答按“${fault}现象 -> ${artifact}证据 -> ${primary}假设 -> ${action}处理 -> ${verification}”收口。这样实例和题目绑定，也能说明你不是泛泛讲流程，而是能把 ${focus} 落到可复现、可验证的工程闭环。`
  });
  return validateUniqueInterviewExampleCase(row, exampleCase);
}

function validateUniqueInterviewExampleCase(row = {}, exampleCase = {}) {
  const normalized = normalizeInterviewExampleCase(exampleCase);
  if (!normalized) throw interviewGenerationError(`题目 ${row.id || ""} 的实例字段不完整`, 422, "example_case_incomplete");
  const terms = uniqueExampleTerms(row).slice(0, 6);
  const body = [normalized.title, normalized.example, normalized.solution, normalized.cause, normalized.summary].join(" ");
  const hasTerm = terms.length ? terms.some((term) => body.includes(term)) : body.includes(cleanText(row.topic_title || row.topic_slug || "", 18));
  if (!hasTerm || /undefined|null|\[object Object\]/i.test(body)) {
    throw interviewGenerationError(`题目 ${row.id || ""} 的实例和题干不匹配`, 422, "example_case_mismatch");
  }
  return normalized;
}

function generateLocalInterviewQuestionExampleCases(rows = []) {
  const cases = new Map();
  for (const row of rows) cases.set(String(row.id), buildUniqueInterviewExampleCase(row));
  return { cases, provider: "local-unique", model: "server-unique-example-v2" };
}

function isLocalInterviewExampleProvider(provider = "") {
  const key = cleanKey(provider || "", "");
  return key === "local" || key === "local-unique";
}

function interviewExampleCasePrompt(rows = []) {
  const questionLines = rows.map((row) => {
    const tags = parseTags(row.tags).slice(0, 8).join("、");
    const answer = stripMarkdown(row.answer_md || "").replace(/\s+/g, " ").slice(0, 1100);
    const goals = publicInterviewQuestionGoals(row).map((goal) => goal.title || goal.slug).filter(Boolean).slice(0, 4).join("、");
    return [
      `ID: ${row.id}`,
      `题目: ${row.title}`,
      `分类: ${row.topic_title || row.topic_slug || ""}${goals ? ` / 目标: ${goals}` : ""}`,
      `难度: ${row.difficulty || "基础"}`,
      `标签: ${tags}`,
      `参考答案摘要: ${answer}`
    ].join("\n");
  }).join("\n\n---\n\n");
  return [
    { role: "system", content: "你是机器人、FOC、电机控制、嵌入式和 ROS 项目的面试实例生成器。只输出合法 JSON，不要 Markdown，不要解释。" },
    {
      role: "user",
      content: `为下面 ${rows.length} 道面试题生成后端入库用的结构化实例。每题都要结合题目、标签和参考答案，写成真实工程口吻，不要空泛，不要鸡汤，不要重复同一句模板。

要求：
1. 每题必须返回 questionId、title、example、solution、cause、summary。
2. example 是具体例子：要包含现场现象、日志/波形/寄存器/抓包/版本/负载等至少一种证据。
3. solution 是解决方法：要有排查顺序、单变量验证、修复动作和回归验证。
4. cause 是原因分析：解释为什么会发生，体现机制或工程边界。
5. summary 是思路总结：适合面试时收口表达。
6. 每段 80-220 个中文字符，具体但不要过长。
7. 输出 JSON 结构固定：
{
  "items": [
    {
      "questionId": 123,
      "title": "FOC 调试实例",
      "example": "具体例子",
      "solution": "解决方法",
      "cause": "原因分析",
      "summary": "思路总结"
    }
  ]
}

题目：
${questionLines}`
    }
  ];
}

function normalizeInterviewExampleCasePayload(raw, rows = []) {
  const payload = raw && typeof raw === "object" ? raw : {};
  const items = Array.isArray(payload.items) ? payload.items : (Array.isArray(payload.cases) ? payload.cases : []);
  const byId = new Map(items.map((item) => [String(item.questionId || item.question_id || item.id || ""), item]));
  const output = new Map();
  for (const row of rows) {
    const item = byId.get(String(row.id));
    if (!item) throw interviewGenerationError(`模型缺少题目 ${row.id} 的实例`, 422, "example_case_missing");
    const normalized = normalizeInterviewExampleCase(item);
    if (!normalized) throw interviewGenerationError(`题目 ${row.id} 的实例字段不完整`, 422, "example_case_incomplete");
    output.set(String(row.id), normalized);
  }
  return output;
}

async function generateInterviewQuestionExampleCases(rows = [], provider = "") {
  if (!rows.length) return { cases: new Map(), provider: "", model: "" };
  if (isLocalInterviewExampleProvider(provider)) return generateLocalInterviewQuestionExampleCases(rows);
  const llm = await callInterviewLlm(interviewExampleCasePrompt(rows), provider);
  const cases = normalizeInterviewExampleCasePayload(parseInterviewModelJson(llm.content), rows);
  return { cases, provider: llm.provider, model: llm.model };
}

async function selectInterviewExampleCaseBackfillRows({ limit = 5, force = false, excludeIds = [], beforeId = 0 } = {}) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 5));
  const scanLimit = Math.max(80, safeLimit * 30);
  const params = { scanLimit };
  const where = ["q.status='published'", "q.deleted_at IS NULL", publicInterviewQuestionFilter("q")];
  if (force && Number(beforeId || 0) > 0) {
    params.beforeId = Number(beforeId);
    where.push("q.id<:beforeId");
  }
  const cleanExclude = force ? [] : parseIdList(excludeIds).slice(0, 100000);
  if (cleanExclude.length) {
    const { params: excludeParams, sql } = questionIdPlaceholders(cleanExclude);
    Object.assign(params, excludeParams);
    where.push(`q.id NOT IN (${sql})`);
  }
  const rows = await query(`SELECT q.*, t.slug AS topic_slug, t.title AS topic_title
    FROM interview_questions q
    LEFT JOIN interview_topics t ON t.id=q.topic_id
    WHERE ${where.join(" AND ")}
    ORDER BY ${force ? "q.id DESC" : `
      CASE
        WHEN q.example_case IS NULL THEN 0
        WHEN q.example_case_source_hash IS NULL OR q.example_case_source_hash='' THEN 1
        WHEN q.example_case_error IS NOT NULL AND q.example_case_error<>'' THEN 2
        ELSE 3
      END ASC,
      q.updated_at DESC,
      q.id DESC`}
    LIMIT :scanLimit`, params);
  await attachInterviewGoalIds(rows);
  return rows.filter((row) => force || !publicInterviewExampleCase(row).exampleCaseReady).slice(0, safeLimit);
}

async function saveInterviewQuestionExampleCase(row = {}, exampleCase = {}, source = {}) {
  const normalized = normalizeInterviewExampleCase(exampleCase);
  if (!row?.id || !normalized) throw interviewGenerationError("实例内容不完整", 422, "example_case_invalid");
  await query(`UPDATE interview_questions
    SET example_case=CAST(:example_case AS JSON),
        example_case_source_hash=:source_hash,
        example_case_provider=:provider,
        example_case_model=:model,
        example_case_updated_at=NOW(),
        example_case_error=NULL,
        updated_at=updated_at
    WHERE id=:id`, {
    id: row.id,
    example_case: JSON.stringify(normalized),
    source_hash: interviewQuestionExampleSourceHash(row),
    provider: cleanText(source.provider || "", 40),
    model: cleanText(source.model || "", 120)
  });
}

async function markInterviewQuestionExampleCaseError(row = {}, error = "") {
  if (!row?.id) return;
  await query("UPDATE interview_questions SET example_case_error=:error, updated_at=updated_at WHERE id=:id", {
    id: row.id,
    error: cleanText(error || "实例生成失败", 1200)
  }).catch(() => {});
}

async function interviewExampleCaseBackfillStats() {
  if (!databaseAvailable) return { total: 0, ready: 0, failed: 0, pending: 0 };
  const row = await getOne(`SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN q.example_case IS NOT NULL AND JSON_UNQUOTE(JSON_EXTRACT(q.example_case,'$.example'))<>'' THEN 1 ELSE 0 END) AS ready,
    SUM(CASE WHEN q.example_case IS NULL AND q.example_case_error IS NOT NULL AND q.example_case_error<>'' THEN 1 ELSE 0 END) AS failed
    FROM interview_questions q
    WHERE q.status='published' AND q.deleted_at IS NULL AND ${publicInterviewQuestionFilter("q")}`).catch(() => null);
  const total = Number(row?.total || 0);
  const ready = Number(row?.ready || 0);
  const failed = Number(row?.failed || 0);
  return { total, ready, failed, pending: Math.max(0, total - ready) };
}

async function interviewExampleCaseAuditStats() {
  if (!databaseAvailable) return { stats: { total: 0, ready: 0, failed: 0, pending: 0 }, providers: [], duplicates: {} };
  const where = `q.status='published' AND q.deleted_at IS NULL AND ${publicInterviewQuestionFilter("q")}`;
  const [stats, providers, duplicateExample, duplicateFull, duplicateSamples] = await Promise.all([
    interviewExampleCaseBackfillStats(),
    query(`SELECT COALESCE(q.example_case_provider,'') AS provider, COALESCE(q.example_case_model,'') AS model, COUNT(*) AS total
      FROM interview_questions q WHERE ${where}
      GROUP BY COALESCE(q.example_case_provider,''), COALESCE(q.example_case_model,'')
      ORDER BY total DESC`),
    getOne(`SELECT COUNT(*) AS groupCount, COALESCE(SUM(c),0) AS rowCount
      FROM (
        SELECT COUNT(*) AS c
        FROM interview_questions q
        WHERE ${where} AND q.example_case IS NOT NULL
        GROUP BY JSON_UNQUOTE(JSON_EXTRACT(q.example_case,'$.example'))
        HAVING c>1
      ) d`),
    getOne(`SELECT COUNT(*) AS groupCount, COALESCE(SUM(c),0) AS rowCount
      FROM (
        SELECT COUNT(*) AS c
        FROM interview_questions q
        WHERE ${where} AND q.example_case IS NOT NULL
        GROUP BY SHA2(CONCAT_WS('|',
          JSON_UNQUOTE(JSON_EXTRACT(q.example_case,'$.example')),
          JSON_UNQUOTE(JSON_EXTRACT(q.example_case,'$.solution')),
          JSON_UNQUOTE(JSON_EXTRACT(q.example_case,'$.cause')),
          JSON_UNQUOTE(JSON_EXTRACT(q.example_case,'$.summary'))
        ),256)
        HAVING c>1
      ) d`),
    query(`SELECT JSON_UNQUOTE(JSON_EXTRACT(q.example_case,'$.example')) AS example, COUNT(*) AS count, MIN(q.id) AS firstId, MAX(q.id) AS lastId
      FROM interview_questions q
      WHERE ${where} AND q.example_case IS NOT NULL
      GROUP BY JSON_UNQUOTE(JSON_EXTRACT(q.example_case,'$.example'))
      HAVING count>1
      ORDER BY count DESC
      LIMIT 10`)
  ]);
  return {
    stats,
    providers: providers.map((row) => ({ provider: row.provider || "", model: row.model || "", total: Number(row.total || 0) })),
    duplicates: {
      exampleGroups: Number(duplicateExample?.groupCount || 0),
      exampleRows: Number(duplicateExample?.rowCount || 0),
      fullGroups: Number(duplicateFull?.groupCount || 0),
      fullRows: Number(duplicateFull?.rowCount || 0),
      samples: duplicateSamples.map((row) => ({
        count: Number(row.count || 0),
        firstId: row.firstId,
        lastId: row.lastId,
        example: cleanText(row.example || "", 220)
      }))
    }
  };
}

function publicInterviewExampleBackfillState(extra = {}) {
  return {
    ...interviewExampleCaseBackfillState,
    ...extra
  };
}

async function runInterviewExampleCaseBackfillJob(options = {}) {
  if (interviewExampleCaseBackfillState.running) return publicInterviewExampleBackfillState({ alreadyRunning: true });
  const selectedProvider = cleanKey(options.provider || process.env.INTERVIEW_EXAMPLE_CASE_PROVIDER || "local-unique", "local-unique");
  const useLocalProvider = isLocalInterviewExampleProvider(selectedProvider);
  const maxChunkSize = useLocalProvider ? 100 : 10;
  Object.assign(interviewExampleCaseBackfillState, {
    running: true,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finishedAt: null,
    force: Boolean(options.force),
    limit: Math.max(0, Number(options.limit || 0)),
    chunkSize: Math.min(maxChunkSize, Math.max(1, Number(options.chunkSize || process.env.INTERVIEW_EXAMPLE_CASE_CHUNK_SIZE || (useLocalProvider ? 50 : 5)))),
    provider: selectedProvider,
    processed: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    lastError: "",
    lastIds: []
  });
  const excluded = new Set();
  let forceCursorId = Number.MAX_SAFE_INTEGER;
  try {
    while (interviewExampleCaseBackfillState.running) {
      const remaining = interviewExampleCaseBackfillState.limit
        ? interviewExampleCaseBackfillState.limit - interviewExampleCaseBackfillState.processed
        : interviewExampleCaseBackfillState.chunkSize;
      if (remaining <= 0) break;
      const rows = await selectInterviewExampleCaseBackfillRows({
        limit: Math.min(interviewExampleCaseBackfillState.chunkSize, remaining),
        force: interviewExampleCaseBackfillState.force,
        excludeIds: [...excluded],
        beforeId: interviewExampleCaseBackfillState.force ? forceCursorId : 0
      });
      if (!rows.length) break;
      if (interviewExampleCaseBackfillState.force) {
        forceCursorId = Math.min(...rows.map((row) => Number(row.id || forceCursorId)).filter(Number.isFinite));
      }
      interviewExampleCaseBackfillState.lastIds = rows.map((row) => row.id);
      try {
        const generated = await generateInterviewQuestionExampleCases(rows, interviewExampleCaseBackfillState.provider);
        for (const row of rows) {
          const exampleCase = generated.cases.get(String(row.id));
          await saveInterviewQuestionExampleCase(row, exampleCase, generated);
          excluded.add(String(row.id));
          interviewExampleCaseBackfillState.success += 1;
          interviewExampleCaseBackfillState.processed += 1;
        }
      } catch (error) {
        const message = cleanText(error?.message || "实例生成失败", 1200);
        interviewExampleCaseBackfillState.lastError = message;
        for (const row of rows) {
          await markInterviewQuestionExampleCaseError(row, message);
          excluded.add(String(row.id));
          interviewExampleCaseBackfillState.failed += 1;
          interviewExampleCaseBackfillState.processed += 1;
        }
      }
      interviewExampleCaseBackfillState.updatedAt = new Date().toISOString();
      if (interviewExampleCaseBackfillState.limit && interviewExampleCaseBackfillState.processed >= interviewExampleCaseBackfillState.limit) break;
      const pauseMs = isLocalInterviewExampleProvider(interviewExampleCaseBackfillState.provider) ? 0 : Math.max(0, Number(process.env.INTERVIEW_EXAMPLE_CASE_PAUSE_MS || 250));
      if (pauseMs) await new Promise((resolve) => setTimeout(resolve, pauseMs));
    }
  } catch (error) {
    interviewExampleCaseBackfillState.lastError = cleanText(error?.message || "实例任务失败", 1200);
  } finally {
    interviewExampleCaseBackfillState.running = false;
    interviewExampleCaseBackfillState.finishedAt = new Date().toISOString();
    interviewExampleCaseBackfillState.updatedAt = interviewExampleCaseBackfillState.finishedAt;
  }
  return publicInterviewExampleBackfillState();
}

async function startInterviewExampleCaseBackfill(req, url) {
  if (!databaseAvailable) throw interviewGenerationError("数据库不可用，不能生成实例", 503, "database_unavailable");
  const body = await readBody(req).catch(() => ({}));
  const force = Boolean(body.force || url.searchParams.get("force") === "1");
  const limit = clampNumber(body.limit ?? url.searchParams.get("limit"), 0, 1000000, 0);
  const provider = cleanKey(body.provider || url.searchParams.get("provider") || process.env.INTERVIEW_EXAMPLE_CASE_PROVIDER || "local-unique", "local-unique");
  const useLocalProvider = isLocalInterviewExampleProvider(provider);
  const chunkSize = clampNumber(body.chunkSize ?? body.chunk_size ?? url.searchParams.get("chunkSize"), 1, useLocalProvider ? 100 : 10, useLocalProvider ? 50 : 5);
  if (!interviewExampleCaseBackfillState.running) {
    runInterviewExampleCaseBackfillJob({ force, limit, chunkSize, provider }).catch((error) => {
      interviewExampleCaseBackfillState.running = false;
      interviewExampleCaseBackfillState.lastError = cleanText(error?.message || "实例任务失败", 1200);
      interviewExampleCaseBackfillState.finishedAt = new Date().toISOString();
      interviewExampleCaseBackfillState.updatedAt = interviewExampleCaseBackfillState.finishedAt;
    });
  }
  return { job: publicInterviewExampleBackfillState({ alreadyRunning: interviewExampleCaseBackfillState.running }), stats: await interviewExampleCaseBackfillStats() };
}

function publicInterviewGenerationCandidate(row = {}) {
  return {
    id: row.id || null,
    batchId: row.batch_id || row.batchId || null,
    position: Number(row.position || 0),
    questionKey: row.question_key || row.questionKey || "",
    status: row.status || "pending",
    question: row.question || "",
    originalQuestion: row.original_question || row.originalQuestion || "",
    category: row.category || "",
    goalSlug: row.goal_slug || row.goalSlug || "",
    knowledgePoint: row.knowledge_point || row.knowledgePoint || "",
    tags: parseTags(row.tags),
    difficulty: row.difficulty || "基础",
    hasAnswer: Boolean(row.answer_md || row.answerMd),
    answer: row.answer_md || row.answerMd || "",
    answerPoints: normalizeInterviewAnswerMeta(parseJsonObject(row.answer_points || row.answerPoints, {})),
    questionId: row.question_id || row.questionId || null,
    createdAt: row.created_at || row.createdAt || "",
    updatedAt: row.updated_at || row.updatedAt || ""
  };
}

function interviewGenerationCandidateProgress(candidates = [], targetCount = 50) {
  const target = clampNumber(targetCount, 1, 50, 50);
  const active = candidates.filter((item) => item.status !== "discarded");
  const approved = candidates.filter((item) => ["approved", "answered", "published"].includes(item.status));
  const answered = candidates.filter((item) => ["answered", "published"].includes(item.status) && item.hasAnswer);
  return {
    target,
    total: candidates.length,
    activeCount: active.length,
    pendingCount: candidates.filter((item) => item.status === "pending").length,
    approvedCount: approved.length,
    discardedCount: candidates.filter((item) => item.status === "discarded").length,
    answeredCount: answered.length,
    canFill: active.length < target,
    canGenerateAnswers: approved.length === target,
    canPublish: answered.length === target
  };
}

function publicInterviewGenerationBatch(batch = {}, candidates = []) {
  const publicCandidates = candidates.map(publicInterviewGenerationCandidate).sort((a, b) => a.position - b.position || Number(a.id || 0) - Number(b.id || 0));
  return {
    id: batch.id || null,
    date: batch.day_date || batch.date || "",
    goalId: batch.goal_id || batch.goalId || null,
    goalSlug: batch.goal_slug || batch.goalSlug || "",
    goalTitle: batch.goal_title || batch.goalTitle || "",
    status: batch.status || "draft",
    targetCount: Number(batch.target_count || batch.targetCount || 50),
    approvedCount: Number(batch.approved_count || batch.approvedCount || 0),
    answeredCount: Number(batch.answered_count || batch.answeredCount || 0),
    publishedSetId: batch.published_set_id || batch.publishedSetId || null,
    source: {
      provider: batch.source_provider || batch.sourceProvider || "",
      model: batch.source_model || batch.sourceModel || ""
    },
    error: batch.generation_error || batch.generationError || "",
    createdAt: batch.created_at || batch.createdAt || "",
    updatedAt: batch.updated_at || batch.updatedAt || "",
    progress: interviewGenerationCandidateProgress(publicCandidates, batch.target_count || 50),
    candidates: publicCandidates
  };
}

async function loadInterviewGenerationBatch(batchId) {
  const id = cleanId(batchId);
  if (!id) return null;
  const batch = await getOne("SELECT *, DATE_FORMAT(day_date, '%Y-%m-%d') AS day_date FROM interview_generation_batches WHERE id=:id LIMIT 1", { id });
  if (!batch) return null;
  const candidates = await query("SELECT * FROM interview_generation_candidates WHERE batch_id=:batch_id ORDER BY position ASC, id ASC", { batch_id: id });
  return { batch, candidates };
}

async function refreshInterviewGenerationBatch(batchId, statusOverride = "") {
  const loaded = await loadInterviewGenerationBatch(batchId);
  if (!loaded) return null;
  const publicBatch = publicInterviewGenerationBatch(loaded.batch, loaded.candidates);
  const locked = ["published", "failed"].includes(publicBatch.status);
  const nextStatus = statusOverride || (locked ? publicBatch.status : publicBatch.progress.canPublish ? "answered" : "reviewing");
  await query(`UPDATE interview_generation_batches
    SET status=:status, approved_count=:approved_count, answered_count=:answered_count, updated_at=NOW()
    WHERE id=:id`, {
    id: loaded.batch.id,
    status: nextStatus,
    approved_count: publicBatch.progress.approvedCount,
    answered_count: publicBatch.progress.answeredCount
  });
  const refreshed = await loadInterviewGenerationBatch(batchId);
  return publicInterviewGenerationBatch(refreshed.batch, refreshed.candidates);
}

async function latestInterviewGenerationBatch(url) {
  const date = cleanDateValue(url.searchParams.get("date")) || shanghaiDate();
  const goalId = cleanId(url.searchParams.get("goalId") || url.searchParams.get("goal_id"));
  const published = await getOne("SELECT id, updated_at FROM interview_daily_sets WHERE day_date=:day_date AND status='published' ORDER BY updated_at DESC, id DESC LIMIT 1", { day_date: date });
  const where = ["day_date=:day_date", "status IN ('answered','answers_generating','reviewing')"];
  const params = { day_date: date };
  if (published?.updated_at) {
    where.push("updated_at > :published_updated_at");
    params.published_updated_at = published.updated_at;
  }
  if (goalId) {
    where.push("goal_id=:goal_id");
    params.goal_id = goalId;
  }
  const row = await getOne(`SELECT id FROM interview_generation_batches
    WHERE ${where.join(" AND ")}
    ORDER BY FIELD(status,'answered','answers_generating','reviewing') ASC, updated_at DESC, id DESC
    LIMIT 1`, params);
  if (!row?.id) return { batch: null, date, publishedSetId: published?.id || null };
  const loaded = await loadInterviewGenerationBatch(row.id);
  return loaded ? publicInterviewGenerationBatch(loaded.batch, loaded.candidates) : { batch: null, date, publishedSetId: published?.id || null };
}

async function interviewGenerationGoalById(goalId) {
  const id = cleanId(goalId);
  if (!id) return null;
  return getOne(`SELECT id,parent_id,slug,title,summary,accent
    FROM interview_goal_nodes
    WHERE id=:id AND visible=1 AND deleted_at IS NULL LIMIT 1`, { id });
}

function interviewQuestionOnlyPrompt({ date, goal, catalog = [], count = 50, existingQuestions = [], requirements = "", difficulty = "" } = {}) {
  const targetCount = clampNumber(count, 1, 50, 50);
  const goalLine = goal ? `${goal.title}(${goal.slug})${goal.summary ? `：${goal.summary}` : ""}` : "未选择目标";
  const targetDifficulty = cleanInterviewDifficulty(difficulty || "", "");
  const catalogLines = catalog
    .filter((item) => item.slug && item.slug !== "robotics")
    .slice(0, 90)
    .map((item) => `- ${item.slug}: ${item.title}${item.parentTitle ? ` / 上级 ${item.parentTitle}` : ""}${item.summary ? ` / ${item.summary}` : ""}`)
    .join("\n");
  const existingLine = existingQuestions.length ? `\n避免重复这些题干：\n${existingQuestions.slice(0, 80).map((item) => `- ${item}`).join("\n")}` : "";
  const reqLine = requirements ? `\n出题方向与范围：${cleanText(requirements, 500)}` : "";
  const difficultyLine = targetDifficulty
    ? `\n目标难度：${targetDifficulty}。除非题目确实需要铺垫，否则 difficulty 字段必须填写「${targetDifficulty}」，题干也要匹配这个难度。`
    : "";
  const builtInStandard = `
内置出题基准：
- 默认按机器人、嵌入式、控制算法、工程调试的真实面试来出题，不要出轻飘飘的“背概念”题。
- 每题必须带具体工程语境：调试现象、约束条件、硬件/软件链路、参数取舍、异常定位、项目落地、边界条件中至少一个。
- FOC / SVPWM / PID / CAN / I2C / Ubuntu / ROS2 / C++ 等方向，要优先追问时序、参数、误差来源、资源限制、保护策略、调试证据和实际项目表达。
- 难度为「进阶」「项目追问」「高频必会」时，题干优先使用“如何排查 / 如何取舍 / 如何设计 / 出现某现象怎么定位 / 项目里怎么证明”这类真实问法。
- 严格避免空泛：不要批量生成“请介绍...”“谈谈理解...”“有哪些...”这类题；这类泛题最多 3 题，且也要带具体边界。`;
  return [
    { role: "system", content: "你是机器人学习与面试题库的出题助手。只输出合法 JSON，不要 Markdown，不要解释。" },
    {
      role: "user",
      content: `围绕目标「${goalLine}」生成 ${targetCount} 个候选题，只生成题干，不要生成答案。${reqLine}${difficultyLine}
可用目标目录如下，goalSlug 必须优先使用最具体、最贴近题目的 slug；如果题目属于当前目标，优先使用 ${goal?.slug || "other"} 或其子目标：
${catalogLines}
${existingLine}
${builtInStandard}

输出要求：
1. 必须正好 ${targetCount} 题，questionKey 使用 q01、q02 这种顺序编号。
2. 每题只包含 question/category/goalSlug/knowledgePoint/tags/difficulty，不要 answer。
3. question 要短、具体、可面试口述；必须贴合“出题方向与范围”，不要生成泛泛的大类题。
4. 覆盖概念理解、工程排查、项目表达和容易混淆点，但不要偏离当前目标。
5. 至少 70% 的题目应是场景、排查、设计、参数取舍或项目追问类；不要让 50 题都停留在定义层。
6. tags 为 2-5 个短标签，difficulty 从「基础」「进阶」「项目追问」「高频必会」中选择${targetDifficulty ? `，并优先使用「${targetDifficulty}」` : ""}。
7. 输出 JSON 结构：
{
  "questions": [
    {
      "questionKey": "q01",
      "question": "I2C 为什么需要上拉电阻？",
      "category": "控制与嵌入式",
      "goalSlug": "bus-protocols",
      "knowledgePoint": "I2C",
      "tags": ["I2C","总线","驱动调试"],
      "difficulty": "高频必会"
    }
  ]
}`
    }
  ];
}

function normalizeInterviewGenerationQuestions(raw, { count = 50, startPosition = 1, goal = {}, catalog = [] } = {}) {
  const payload = raw && typeof raw === "object" ? raw : {};
  const items = Array.isArray(payload.questions) ? payload.questions : (Array.isArray(payload.candidates) ? payload.candidates : []);
  const targetCount = clampNumber(count, 1, 50, 50);
  if (!items.length) {
    throw interviewGenerationError(`模型没有返回候选题，当前 0/${targetCount}`, 422, "invalid_candidate_count");
  }
  const bySlug = new Map(catalog.map((item) => [String(item.slug || "").toLowerCase(), item]));
  const seen = new Set();
  return items.slice(0, targetCount).map((item, index) => {
    const position = startPosition + index;
    const expectedKey = `q${String(position).padStart(2, "0")}`;
    const questionKey = expectedKey;
    const question = cleanText(item.question || item.title || "", 500);
    const rawGoalSlug = cleanKey(item.goalSlug || item.goal_slug || goal?.slug || "other", goal?.slug || "other");
    const goalRow = bySlug.get(rawGoalSlug) || bySlug.get(String(goal?.slug || "").toLowerCase()) || null;
    const category = cleanText(item.category || goalRow?.categoryTitle || goalRow?.parentTitle || goal?.title || "其他", 80);
    const knowledgePoint = cleanText(item.knowledgePoint || item.knowledge_point || goalRow?.title || goal?.title || category, 100);
    const tags = [...new Set([
      knowledgePoint,
      ...parseTags(item.tags || item.tag || ""),
      category
    ].map((tag) => cleanText(tag, 60)).filter(Boolean))].slice(0, 6);
    const uniqueKey = `${questionKey}:${question}`;
    if (!question || seen.has(uniqueKey)) {
      throw interviewGenerationError(`第 ${index + 1} 个候选题为空或重复`, 422, "candidate_content_missing");
    }
    seen.add(uniqueKey);
    return {
      position,
      questionKey,
      question,
      originalQuestion: question,
      category,
      goalSlug: goalRow?.slug || rawGoalSlug,
      knowledgePoint,
      tags,
      difficulty: cleanInterviewDifficulty(item.difficulty || "", "基础")
    };
  });
}


function interviewQuestionFingerprint(value = "") {
  return cleanText(value, 500)
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "")
    .replace(/^(请|请你|说明|介绍|谈谈|分析|解释|如何|怎么|为什么)+/u, "")
    .slice(0, 180);
}

function filterUniqueInterviewGenerationCandidates(candidates = [], excludedQuestions = [], startPosition = 1) {
  const seen = new Set(excludedQuestions.map(interviewQuestionFingerprint).filter(Boolean));
  const output = [];
  for (const item of candidates) {
    const fingerprint = interviewQuestionFingerprint(item.question);
    if (!fingerprint || seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    output.push(item);
  }
  return output.map((item, index) => ({
    ...item,
    position: startPosition + index,
    questionKey: `q${String(startPosition + index).padStart(2, "0")}`
  }));
}

async function interviewGenerationExcludedQuestions({ goalId = "", goalTitle = "", batchId = "", currentQuestions = [] } = {}) {
  const excluded = [...currentQuestions].map((item) => cleanText(item, 500)).filter(Boolean);
  if (!databaseAvailable) return excluded;
  const goal_id = cleanId(goalId);
  const batch_id = cleanId(batchId);
  const goal_title = cleanText(goalTitle || "", 200);
  if (goal_id || goal_title) {
    const questionRows = await query(`SELECT DISTINCT q.title
      FROM interview_questions q
      LEFT JOIN interview_goal_question_links l ON l.question_id=q.id
      WHERE q.deleted_at IS NULL
        AND (${goal_id ? "l.goal_id=:goal_id" : "0"} ${goal_title ? "OR q.title LIKE :goal_title" : ""})
      ORDER BY q.updated_at DESC LIMIT 120`, {
      goal_id,
      goal_title: `%${goal_title}%`
    }).catch(() => []);
    excluded.push(...questionRows.map((row) => row.title));
  }
  const candidateWhere = [];
  if (batch_id) candidateWhere.push("c.batch_id=:batch_id");
  const discardedWhere = [];
  if (goal_id) discardedWhere.push("b.goal_id=:goal_id");
  if (goal_title) discardedWhere.push("b.goal_title=:goal_title_exact");
  if (discardedWhere.length) candidateWhere.push(`(c.status='discarded' AND (${discardedWhere.join(" OR ")}))`);
  if (candidateWhere.length) {
    const candidateRows = await query(`SELECT c.question
      FROM interview_generation_candidates c
      JOIN interview_generation_batches b ON b.id=c.batch_id
      WHERE ${candidateWhere.join(" OR ")}
      ORDER BY c.updated_at DESC, c.id DESC LIMIT 220`, {
      goal_id,
      goal_title_exact: goal_title,
      batch_id
    }).catch(() => []);
    excluded.push(...candidateRows.map((row) => row.question));
  }
  return [...new Set(excluded.map((item) => cleanText(item, 500)).filter(Boolean))];
}

function interviewGenerationScenarioHint(goal = {}, attempt = 0, position = 1) {
  const generalHints = [
    "具体故障现象、日志、波形和排查顺序",
    "参数取舍、边界条件、异常恢复和面试官追问",
    "项目表达、复盘结论、工程权衡和可量化结果",
    "线上调试、定位路径、复现方法和验证闭环",
    "硬件约束、实时性、噪声、温漂和安全保护"
  ];
  const focHints = [
    "电流环带宽、PI 参数、抗积分饱和和限幅策略",
    "SVPWM 扇区切换、过调制、死区补偿和母线电压利用率",
    "编码器零偏校准、相序判断、启动抖动和低速观测",
    "ADC 触发时刻、采样偏置、单/双电阻采样和电流重构",
    "弱磁控制、速度环耦合、转矩脉动和保护降额",
    "FOC 上电流程、故障注入、示波器波形和项目答辩表达"
  ];
  const label = `${goal?.slug || ""} ${goal?.title || ""}`.toLowerCase();
  const pool = label.includes("foc") ? [...focHints, ...generalHints] : generalHints;
  return pool[Math.abs(Number(position || 1) + Number(attempt || 0)) % pool.length];
}

async function generateInterviewQuestionCandidatesWithDedupe({
  date,
  goal,
  catalog,
  count,
  startPosition = 1,
  existingQuestions = [],
  requirements = "",
  difficulty = "",
  provider = ""
} = {}) {
  const targetCount = clampNumber(count, 1, 50, 50);
  const chunkSize = clampNumber(process.env.INTERVIEW_QUESTION_CHUNK_SIZE, 1, 10, 10);
  const maxAttempts = clampNumber(process.env.INTERVIEW_QUESTION_MAX_ATTEMPTS, 1, 12, 3);
  const accepted = [];
  const excluded = [...existingQuestions];
  let source = { provider: "", model: "" };
  let lastError = null;
  for (let attempt = 0; attempt < maxAttempts && accepted.length < targetCount; attempt += 1) {
    const needed = targetCount - accepted.length;
    const requestCount = Math.min(chunkSize, needed);
    const scenarioHint = interviewGenerationScenarioHint(goal, attempt, startPosition + accepted.length);
    const roundRequirements = `${requirements || ""}\n补题轮次 ${attempt + 1}：本轮新角度是「${scenarioHint}」。请换一组不同工程场景、调试现象、参数取舍或项目追问，不要重复前面题干；题干必须具体到现象、参数、波形、约束或排查动作，不要只问概念。`.trim();
    try {
      const llm = await callInterviewLlm(interviewQuestionOnlyPrompt({
        date,
        goal,
        catalog,
        count: requestCount,
        existingQuestions: [...excluded, ...accepted.map((item) => item.question)],
        requirements: roundRequirements,
        difficulty
      }), provider);
      source = { provider: llm.provider, model: llm.model };
      const raw = normalizeInterviewGenerationQuestions(parseInterviewModelJson(llm.content), {
        count: requestCount,
        startPosition: startPosition + accepted.length,
        goal,
        catalog
      });
      const unique = filterUniqueInterviewGenerationCandidates(raw, [...excluded, ...accepted.map((item) => item.question)], startPosition + accepted.length);
      accepted.push(...unique.slice(0, needed));
      excluded.push(...raw.map((item) => item.question));
    } catch (error) {
      lastError = error;
    }
  }
  return {
    candidates: accepted,
    source,
    shortfall: Math.max(0, targetCount - accepted.length),
    error: lastError?.message ? cleanText(lastError.message, 240) : ""
  };
}

function interviewBatchAnswersPrompt({ batch, candidates = [], catalog = [] } = {}) {
  const catalogLines = catalog
    .filter((item) => item.slug && item.slug !== "robotics")
    .slice(0, 90)
    .map((item) => `- ${item.slug}: ${item.title}${item.summary ? ` / ${item.summary}` : ""}`)
    .join("\n");
  const questionLines = candidates.map((item, index) => {
    const publicItem = publicInterviewGenerationCandidate(item);
    return `${index + 1}. ${publicItem.questionKey} | ${publicItem.goalSlug || batch.goal_slug || "other"} | ${publicItem.category || batch.goal_title || "其他"} | ${publicItem.difficulty || "基础"} | ${publicItem.question}`;
  }).join("\n");
  return [
    { role: "system", content: "你是机器人学习与面试训练答案生成器。只输出合法 JSON，不要 Markdown，不要解释。" },
    {
      role: "user",
      content: `为下面 ${candidates.length} 个已审核通过的题目生成答案卡片。题目属于「${batch.goal_title || batch.goal_slug || "机器人"}」。
可用目标目录：
${catalogLines}

题目：
${questionLines}

输出要求：
1. 必须给每个 questionKey 返回一条 answer。
2. answer 是可直接口述的参考答案，具体、有工程排查思路。
3. points/followUps/interviewerFocus/speechTemplate/commonMistakes/projectPrompts 都用短句数组。
4. difficulty 从「基础」「进阶」「项目追问」「高频必会」中选择。
5. 输出 JSON 结构：
{
  "answers": [
    {
      "questionKey": "q01",
      "answer": "参考答案正文",
      "points": ["核心要点1","核心要点2"],
      "followUps": ["追问1"],
      "interviewerFocus": ["看点1"],
      "speechTemplate": ["口述步骤1"],
      "commonMistakes": ["常见错误1"],
      "projectPrompts": ["项目追问1"],
      "difficulty": "高频必会"
    }
  ]
}`
    }
  ];
}

function normalizeInterviewGenerationAnswers(raw, candidates = []) {
  const payload = raw && typeof raw === "object" ? raw : {};
  const rows = Array.isArray(payload.answers) ? payload.answers : (Array.isArray(payload.questions) ? payload.questions : []);
  const byKey = new Map(rows.map((item) => [cleanKey(item.questionKey || item.question_key || item.id || "", ""), item]));
  const output = new Map();
  for (const candidate of candidates) {
    const key = cleanKey(candidate.question_key || candidate.questionKey || "", "");
    const item = byKey.get(key);
    if (!item) throw interviewGenerationError(`模型缺少 ${key} 的答案`, 422, "answer_missing");
    const answer = cleanLongText(item.answer || item.answer_md || item.answerMd || "", 8000);
    if (!answer) throw interviewGenerationError(`${key} 答案为空`, 422, "answer_content_missing");
    const meta = normalizeInterviewAnswerMeta({
      difficulty: item.difficulty || candidate.difficulty,
      points: item.points,
      followUps: item.followUps || item.follow_ups,
      interviewerFocus: item.interviewerFocus || item.interviewer_focus,
      speechTemplate: item.speechTemplate || item.speech_template,
      commonMistakes: item.commonMistakes || item.common_mistakes,
      projectPrompts: item.projectPrompts || item.project_prompts
    });
    meta.difficulty = cleanInterviewDifficulty(meta.difficulty || candidate.difficulty, candidate.difficulty || "基础");
    output.set(key, { answer, meta });
  }
  return output;
}

async function insertInterviewGenerationCandidates(batchId, candidates = []) {
  for (const item of candidates) {
    await query(`INSERT INTO interview_generation_candidates
      (batch_id,position,question_key,status,question,original_question,category,goal_slug,knowledge_point,tags,difficulty,created_at,updated_at)
      VALUES(:batch_id,:position,:question_key,'pending',:question,:original_question,:category,:goal_slug,:knowledge_point,CAST(:tags AS JSON),:difficulty,NOW(),NOW())`, {
      batch_id: batchId,
      position: item.position,
      question_key: item.questionKey,
      question: item.question,
      original_question: item.originalQuestion || item.question,
      category: item.category,
      goal_slug: item.goalSlug,
      knowledge_point: item.knowledgePoint,
      tags: JSON.stringify(item.tags || []),
      difficulty: item.difficulty
    });
  }
}

async function saveInterviewGenerationQuestion(candidateRow, batchRow, status = "draft") {
  const candidate = publicInterviewGenerationCandidate(candidateRow);
  if (!candidate.answer) throw interviewGenerationError("候选题还没有答案", 422, "candidate_answer_missing");
  const topic = await ensureManualInterviewTopic(candidate.category || batchRow.goal_title || "AI 出题");
  const answerMeta = normalizeInterviewAnswerMeta(candidate.answerPoints || {});
  const slug = cleanKey(`ai-${String(batchRow.day_date || shanghaiDate()).replace(/-/g, "")}-${batchRow.id}-${candidate.questionKey}`, `ai-${Date.now().toString(36)}-${candidate.id}`);
  const payload = {
    topic_id: topic.id,
    slug,
    title: candidate.question,
    summary: cleanText(stripMarkdown(candidate.answer).slice(0, 220), 500),
    answer_md: candidate.answer,
    answer_html: markdownToHtml(candidate.answer),
    answer_points: JSON.stringify(answerMeta),
    difficulty: cleanInterviewDifficulty(candidate.difficulty || answerMeta.difficulty, answerMeta.difficulty || "基础"),
    source: "ai-generation-review",
    tags: JSON.stringify(candidate.tags || []),
    status: cleanStatus(status, ["draft", "published"], "draft"),
    sort_order: candidate.position * 10
  };
  await query(`INSERT INTO interview_questions(topic_id,slug,title,summary,answer_md,answer_html,answer_points,difficulty,source,tags,status,sort_order,reviewed_at,created_at,updated_at,deleted_at)
    VALUES(:topic_id,:slug,:title,:summary,:answer_md,:answer_html,CAST(:answer_points AS JSON),:difficulty,:source,CAST(:tags AS JSON),:status,:sort_order,CASE WHEN :status='published' THEN NOW() ELSE NULL END,NOW(),NOW(),NULL)
    ON DUPLICATE KEY UPDATE topic_id=:topic_id,title=:title,summary=:summary,answer_md=:answer_md,answer_html=:answer_html,answer_points=CAST(:answer_points AS JSON),difficulty=:difficulty,source=:source,tags=CAST(:tags AS JSON),status=:status,sort_order=:sort_order,reviewed_at=CASE WHEN :status='published' THEN COALESCE(reviewed_at,NOW()) ELSE reviewed_at END,deleted_at=NULL,updated_at=NOW()`, payload);
  const saved = await getOne("SELECT id FROM interview_questions WHERE slug=:slug LIMIT 1", { slug });
  if (!saved?.id) throw interviewGenerationError("题库写入失败", 500, "question_save_failed");
  let goalIds = [];
  if (candidate.goalSlug) {
    const goal = await getOne("SELECT id FROM interview_goal_nodes WHERE slug=:slug AND deleted_at IS NULL LIMIT 1", { slug: candidate.goalSlug }).catch(() => null);
    if (goal?.id) goalIds.push(goal.id);
  }
  if (batchRow.goal_id) goalIds.push(batchRow.goal_id);
  if (!goalIds.length) goalIds = await inferInterviewGoalIds({
    goalSlug: candidate.goalSlug || batchRow.goal_slug,
    knowledgePoint: candidate.knowledgePoint,
    title: candidate.question,
    answer: candidate.answer,
    category: candidate.category,
    tags: candidate.tags
  });
  await syncInterviewQuestionGoalLinks(saved.id, [...new Set(goalIds.map(String).filter(Boolean))]);
  await query("UPDATE interview_generation_candidates SET question_id=:question_id, updated_at=NOW() WHERE id=:id", { id: candidate.id, question_id: saved.id });
  return Number(saved.id);
}

async function createInterviewGenerationBatch(req) {
  if (!databaseAvailable) throw interviewGenerationError("数据库不可用，不能生成候选题", 503, "database_unavailable");
  const body = await readBody(req);
  const goal = await interviewGenerationGoalById(body.goalId || body.goal_id);
  if (!goal) throw interviewGenerationError("请先在右侧目标计划表选择一个目标", 400, "goal_required");
  const requirements = cleanText(body.requirements || body.topic || "", 500);
  if (!requirements) throw interviewGenerationError("请先填写出题方向/范围", 400, "requirements_required");
  const targetDifficulty = cleanInterviewDifficulty(body.difficulty || body.level || "", "进阶");
  const date = cleanDateValue(body.date) || shanghaiDate();
  const targetCount = 50;
  const initialCount = clampNumber(body.initialCount || process.env.INTERVIEW_QUESTION_INITIAL_CHUNK_SIZE, 1, 10, 10);
  const result = await query(`INSERT INTO interview_generation_batches
    (day_date,goal_id,goal_slug,goal_title,status,target_count,approved_count,answered_count,source_provider,source_model,created_at,updated_at)
    VALUES(:day_date,:goal_id,:goal_slug,:goal_title,'generating',:target_count,0,0,'','',NOW(),NOW())`, {
    day_date: date,
    goal_id: goal.id,
    goal_slug: goal.slug,
    goal_title: goal.title,
    target_count: targetCount
  });
  const batchId = result.insertId;
  let source = { provider: "", model: "" };
  try {
    const catalog = await interviewGenerationGoalCatalog();
    const existingQuestions = await interviewGenerationExcludedQuestions({
      goalId: goal.id,
      goalTitle: goal.title,
      currentQuestions: []
    });
    const generated = await generateInterviewQuestionCandidatesWithDedupe({
      date,
      goal,
      catalog,
      count: Math.min(initialCount, targetCount),
      startPosition: 1,
      existingQuestions,
      requirements,
      difficulty: targetDifficulty,
      provider: body.provider
    });
    source = generated.source;
    if (!generated.candidates.length) {
      throw interviewGenerationError(`候选题只生成 0/${Math.min(initialCount, targetCount)} 题，请换一个更具体的方向或稍后重试${generated.error ? `；最近错误：${generated.error}` : ""}`, 422, "candidate_generation_shortfall");
    }
    await insertInterviewGenerationCandidates(batchId, generated.candidates);
    await query("UPDATE interview_generation_batches SET status='reviewing', source_provider=:provider, source_model=:model, generation_error=NULL, updated_at=NOW() WHERE id=:id", { id: batchId, provider: source.provider, model: source.model });
    return refreshInterviewGenerationBatch(batchId, "reviewing");
  } catch (error) {
    await query("UPDATE interview_generation_batches SET status='failed', source_provider=:provider, source_model=:model, generation_error=:message, updated_at=NOW() WHERE id=:id", {
      id: batchId,
      provider: source.provider || cleanKey(process.env.LLM_PROVIDER || "deepseek", "deepseek"),
      model: source.model || "",
      message: cleanText(error?.message || "生成失败", 1200)
    }).catch(() => {});
    throw error;
  }
}

async function updateInterviewGenerationCandidate(req, candidateId) {
  const id = cleanId(candidateId);
  if (!id) throw interviewGenerationError("候选题不存在", 404, "candidate_not_found");
  const body = await readBody(req);
  const current = await getOne("SELECT * FROM interview_generation_candidates WHERE id=:id LIMIT 1", { id });
  if (!current) throw interviewGenerationError("候选题不存在", 404, "candidate_not_found");
  const batch = await getOne("SELECT * FROM interview_generation_batches WHERE id=:id LIMIT 1", { id: current.batch_id });
  if (batch?.status === "published") throw interviewGenerationError("已发布批次不能再编辑", 409, "batch_published");
  const sets = [];
  const params = { id };
  const action = cleanKey(body.action || body.status || "", "");
  if (["approve", "approved"].includes(action)) {
    sets.push("status='approved'");
  } else if (["discard", "discarded"].includes(action)) {
    sets.push("status='discarded'");
  } else if (["pending", "restore"].includes(action)) {
    sets.push("status='pending'");
  }
  if (body.question !== undefined) {
    const question = cleanText(body.question, 500);
    if (!question) throw interviewGenerationError("题干不能为空", 400, "question_required");
    params.question = question;
    sets.push("question=:question", "answer_md=NULL", "answer_points=NULL");
    if (current.status === "answered") sets.push("status='approved'");
  }
  if (body.category !== undefined) {
    params.category = cleanText(body.category, 80);
    sets.push("category=:category");
  }
  if (body.goalSlug !== undefined || body.goal_slug !== undefined) {
    params.goal_slug = cleanKey(body.goalSlug || body.goal_slug || "", current.goal_slug || "");
    sets.push("goal_slug=:goal_slug");
  }
  if (body.knowledgePoint !== undefined || body.knowledge_point !== undefined) {
    params.knowledge_point = cleanText(body.knowledgePoint || body.knowledge_point || "", 100);
    sets.push("knowledge_point=:knowledge_point");
  }
  if (body.difficulty !== undefined) {
    params.difficulty = cleanInterviewDifficulty(body.difficulty, current.difficulty || "基础");
    sets.push("difficulty=:difficulty");
  }
  if (body.tags !== undefined) {
    params.tags = JSON.stringify(parseTags(body.tags).map((tag) => cleanText(tag, 60)).filter(Boolean).slice(0, 6));
    sets.push("tags=CAST(:tags AS JSON)");
  }
  if (!sets.length) return refreshInterviewGenerationBatch(current.batch_id);
  await query(`UPDATE interview_generation_candidates SET ${sets.join(", ")}, updated_at=NOW() WHERE id=:id`, params);
  return refreshInterviewGenerationBatch(current.batch_id);
}


async function approveAllInterviewGenerationCandidates(req, batchId) {
  const loaded = await loadInterviewGenerationBatch(batchId);
  if (!loaded) throw interviewGenerationError("批次不存在", 404, "batch_not_found");
  if (["published", "failed"].includes(loaded.batch.status)) throw interviewGenerationError("当前批次不能批量通过", 409, "batch_locked");
  await query("UPDATE interview_generation_candidates SET status='approved', updated_at=NOW() WHERE batch_id=:batch_id AND status='pending'", { batch_id: loaded.batch.id });
  return refreshInterviewGenerationBatch(loaded.batch.id, "reviewing");
}

async function fillInterviewGenerationBatch(req, batchId) {
  const loaded = await loadInterviewGenerationBatch(batchId);
  if (!loaded) throw interviewGenerationError("批次不存在", 404, "batch_not_found");
  if (["published", "failed"].includes(loaded.batch.status)) throw interviewGenerationError("当前批次不能补题", 409, "batch_locked");
  const body = await readBody(req);
  const requirements = cleanText(body.requirements || "", 500);
  if (!requirements) throw interviewGenerationError("请先填写出题方向/范围", 400, "requirements_required");
  const targetDifficulty = cleanInterviewDifficulty(body.difficulty || body.level || "", "进阶");
  const activeCount = loaded.candidates.filter((item) => item.status !== "discarded").length;
  const targetCount = clampNumber(loaded.batch.target_count, 1, 50, 50);
  const needed = targetCount - activeCount;
  if (needed <= 0) return publicInterviewGenerationBatch(loaded.batch, loaded.candidates);
  const fillCount = Math.min(clampNumber(body.count || body.limit || process.env.INTERVIEW_QUESTION_FILL_CHUNK_SIZE, 1, 10, 10), needed);
  const catalog = await interviewGenerationGoalCatalog();
  const goal = await interviewGenerationGoalById(loaded.batch.goal_id) || { id: loaded.batch.goal_id, slug: loaded.batch.goal_slug, title: loaded.batch.goal_title };
  const maxPosition = loaded.candidates.reduce((max, item) => Math.max(max, Number(item.position || 0)), 0);
  const existingQuestions = await interviewGenerationExcludedQuestions({
    goalId: loaded.batch.goal_id,
    goalTitle: loaded.batch.goal_title,
    batchId: loaded.batch.id,
    currentQuestions: loaded.candidates.map((item) => item.question)
  });
  const generated = await generateInterviewQuestionCandidatesWithDedupe({
    date: loaded.batch.day_date,
    goal,
    catalog,
    count: fillCount,
    startPosition: maxPosition + 1,
    existingQuestions,
    requirements,
    difficulty: targetDifficulty,
    provider: body.provider
  });
  if (!generated.candidates.length) {
    await query("UPDATE interview_generation_batches SET status='reviewing', generation_error=:message, updated_at=NOW() WHERE id=:id", {
      id: loaded.batch.id,
      message: cleanText(generated.error || "本轮没有生成新的候选题，可继续补齐或调整方向", 1200)
    });
    return refreshInterviewGenerationBatch(loaded.batch.id, "reviewing");
  }
  await insertInterviewGenerationCandidates(loaded.batch.id, generated.candidates);
  await query("UPDATE interview_generation_batches SET status='reviewing', source_provider=:provider, source_model=:model, generation_error=NULL, updated_at=NOW() WHERE id=:id", {
    id: loaded.batch.id,
    provider: generated.source.provider,
    model: generated.source.model
  });
  return refreshInterviewGenerationBatch(loaded.batch.id, "reviewing");
}

async function generateInterviewGenerationAnswers(req, batchId) {
  const loaded = await loadInterviewGenerationBatch(batchId);
  if (!loaded) throw interviewGenerationError("批次不存在", 404, "batch_not_found");
  if (["published", "failed"].includes(loaded.batch.status)) throw interviewGenerationError("当前批次不能生成答案", 409, "batch_locked");
  const publicBatch = publicInterviewGenerationBatch(loaded.batch, loaded.candidates);
  if (!publicBatch.progress.canGenerateAnswers) {
    throw interviewGenerationError(`需要正好 ${publicBatch.progress.target} 个通过题后再生成答案`, 400, "approved_count_required");
  }
  const body = await readBody(req);
  const answerChunkSize = clampNumber(body.limit || body.chunkSize || process.env.INTERVIEW_ANSWER_CHUNK_SIZE, 1, 10, 3);
  const candidates = loaded.candidates.filter((item) => ["approved", "answered"].includes(item.status));
  const missing = candidates.filter((item) => !item.answer_md);
  if (missing.length) {
    const chunk = missing.slice(0, answerChunkSize);
    await query("UPDATE interview_generation_batches SET status='answers_generating', updated_at=NOW() WHERE id=:id", { id: loaded.batch.id });
    const catalog = await interviewGenerationGoalCatalog();
    const llm = await callInterviewLlm(interviewBatchAnswersPrompt({ batch: loaded.batch, candidates: chunk, catalog }), body.provider);
    const answers = normalizeInterviewGenerationAnswers(parseInterviewModelJson(llm.content), chunk);
    for (const candidate of chunk) {
      const key = cleanKey(candidate.question_key, "");
      const answer = answers.get(key);
      await query(`UPDATE interview_generation_candidates
        SET status='answered', answer_md=:answer_md, answer_points=CAST(:answer_points AS JSON), difficulty=:difficulty, updated_at=NOW()
        WHERE id=:id`, {
        id: candidate.id,
        answer_md: answer.answer,
        answer_points: JSON.stringify(answer.meta),
        difficulty: cleanInterviewDifficulty(answer.meta.difficulty || candidate.difficulty, candidate.difficulty || "基础")
      });
    }
    const afterAnswers = await loadInterviewGenerationBatch(loaded.batch.id);
    const answeredIds = new Set(chunk.map((item) => String(item.id)));
    for (const candidate of afterAnswers.candidates.filter((item) => answeredIds.has(String(item.id)) && item.status === "answered" && item.answer_md)) {
      await saveInterviewGenerationQuestion(candidate, afterAnswers.batch, "published");
    }
    await query("UPDATE interview_generation_batches SET source_provider=:provider, source_model=:model, updated_at=NOW() WHERE id=:id", {
      id: loaded.batch.id,
      provider: llm.provider,
      model: llm.model
    });
  }
  const refreshed = await loadInterviewGenerationBatch(loaded.batch.id);
  const remaining = refreshed.candidates.filter((item) => ["approved", "answered"].includes(item.status) && !item.answer_md).length;
  return refreshInterviewGenerationBatch(loaded.batch.id, remaining ? "answers_generating" : "answered");
}

async function finalizeInterviewGenerationBatch(req, batchId) {
  const loaded = await loadInterviewGenerationBatch(batchId);
  if (!loaded) throw interviewGenerationError("批次不存在", 404, "batch_not_found");
  const publicBatch = publicInterviewGenerationBatch(loaded.batch, loaded.candidates);
  if (!publicBatch.progress.canPublish) {
    throw interviewGenerationError(`需要 ${publicBatch.progress.target} 个已生成答案的通过题才能入库`, 400, "answered_count_required");
  }
  const target = publicBatch.progress.target;
  const candidates = loaded.candidates
    .filter((item) => ["answered", "published"].includes(item.status) && item.answer_md)
    .sort((a, b) => Number(a.position || 0) - Number(b.position || 0) || Number(a.id || 0) - Number(b.id || 0))
    .slice(0, target);
  const questionIds = [];
  for (const candidate of candidates) {
    const questionId = await saveInterviewGenerationQuestion(candidate, loaded.batch, "published");
    questionIds.push(questionId);
    await query("UPDATE interview_generation_candidates SET status='published', question_id=:question_id, updated_at=NOW() WHERE id=:id", {
      id: candidate.id,
      question_id: questionId
    });
  }
  await query("UPDATE interview_generation_batches SET status='published', published_set_id=NULL, approved_count=:approved_count, answered_count=:answered_count, updated_at=NOW() WHERE id=:id", {
    id: loaded.batch.id,
    approved_count: target,
    answered_count: target
  });
  await ensureInterviewQuestionGoalBackfill(true);
  return { ...(await refreshInterviewGenerationBatch(loaded.batch.id, "published")), finalized: { total: questionIds.length, questionIds } };
}

async function publishInterviewGenerationBatch(req, batchId) {
  return finalizeInterviewGenerationBatch(req, batchId);
}

function normalizeGeneratedInterviewPayload(raw, date, catalog = []) {
  const payload = raw && typeof raw === "object" ? raw : {};
  const questions = Array.isArray(payload.questions) ? payload.questions : [];
  if (questions.length !== 50) {
    throw interviewGenerationError(`模型必须返回 50 题，当前 ${questions.length} 题`, 422, "invalid_question_count");
  }
  const bySlug = new Map(catalog.map((goal) => [String(goal.slug || "").toLowerCase(), goal]));
  const seen = new Set();
  const normalizedQuestions = questions.map((item, index) => {
    const number = Number(item.number || index + 1);
    const expectedId = `q${String(index + 1).padStart(2, "0")}`;
    const id = cleanKey(item.id || item.questionId || expectedId, expectedId);
    if (number !== index + 1 || id !== expectedId || seen.has(id)) {
      throw interviewGenerationError(`第 ${index + 1} 题编号不正确`, 422, "invalid_question_sequence");
    }
    seen.add(id);
    const rawGoalSlug = cleanKey(item.goalSlug || item.goal_slug || "", "");
    const goal = bySlug.get(rawGoalSlug) || null;
    const question = cleanText(item.question || item.title || "", 260);
    const answer = cleanLongText(item.answer || item.answerMd || item.answer_md || "", 6000);
    const knowledgePoint = cleanText(item.knowledgePoint || item.knowledge_point || item.tag || goal?.title || "", 80);
    const category = cleanText(item.category || goal?.categoryTitle || goal?.parentTitle || "其他", 80);
    const tags = [
      knowledgePoint,
      ...parseTags(item.tags || item.tag || ""),
      category
    ].map((tag) => cleanText(tag, 60)).filter(Boolean);
    const uniqueTags = [...new Set(tags)].slice(0, 6);
    const points = cleanInterviewTrainingList(item.points, 6);
    if (!question || !answer || !category || !knowledgePoint || points.length < 2) {
      throw interviewGenerationError(`${id} 缺少问题、答案、知识点或要点`, 422, "question_content_missing");
    }
    return {
      id,
      number,
      category,
      goalSlug: goal?.slug || rawGoalSlug,
      knowledgePoint,
      tags: uniqueTags,
      question,
      answer,
      difficulty: cleanInterviewDifficulty(item.difficulty || "", "基础"),
      points,
      followUps: cleanInterviewTrainingList(item.followUps || item.follow_ups, 5),
      interviewerFocus: cleanInterviewTrainingList(item.interviewerFocus || item.interviewer_focus, 5),
      speechTemplate: cleanInterviewTrainingList(item.speechTemplate || item.speech_template, 6),
      commonMistakes: cleanInterviewTrainingList(item.commonMistakes || item.common_mistakes, 5),
      projectPrompts: cleanInterviewTrainingList(item.projectPrompts || item.project_prompts, 5)
    };
  });
  return {
    date,
    title: cleanText(payload.title || "每日 50 问", 120),
    subtitle: cleanText(payload.subtitle || "由后端模型生成，按目标目录自动归类。", 240),
    sidebar: parseJsonObject(payload.sidebar, defaultInterviewSidebar),
    questions: normalizedQuestions
  };
}

async function recordInterviewGenerationFailure(date, source = {}, error) {
  const message = cleanText(error?.message || "生成失败", 1200);
  const existing = await getOne("SELECT id FROM interview_daily_sets WHERE day_date=:day_date LIMIT 1", { day_date: date });
  const payload = {
    day_date: date,
    title: "每日 50 问",
    subtitle: "生成失败，页面会继续使用最近可用题单。",
    status: "draft",
    question_ids: JSON.stringify([]),
    sidebar_json: JSON.stringify(defaultInterviewSidebar),
    source_provider: source.provider || cleanKey(process.env.LLM_PROVIDER || "deepseek", "deepseek"),
    source_model: source.model || "",
    generation_status: "failed",
    generation_error: message
  };
  if (existing) {
    await query(`UPDATE interview_daily_sets
      SET source_provider=:source_provider, source_model=:source_model,
          generation_status=:generation_status, generation_error=:generation_error, updated_at=NOW()
      WHERE day_date=:day_date`, payload);
  } else {
    await query(`INSERT INTO interview_daily_sets(day_date,title,subtitle,status,question_ids,sidebar_json,source_provider,source_model,generated_at,generation_status,generation_error,created_at,updated_at)
      VALUES(:day_date,:title,:subtitle,:status,CAST(:question_ids AS JSON),CAST(:sidebar_json AS JSON),:source_provider,:source_model,NULL,:generation_status,:generation_error,NOW(),NOW())`, payload);
  }
}

async function saveGeneratedInterviewDaily(payload, source) {
  const questionIds = [];
  for (const item of payload.questions) {
    const topic = await ensureManualInterviewTopic(item.category);
    const slug = cleanKey(`daily-${payload.date.replace(/-/g, "")}-${item.id}`, `daily-${Date.now().toString(36)}-${item.id}`);
    const answerMeta = normalizeInterviewAnswerMeta({
      difficulty: item.difficulty,
      points: item.points,
      followUps: item.followUps,
      interviewerFocus: item.interviewerFocus,
      speechTemplate: item.speechTemplate,
      commonMistakes: item.commonMistakes,
      projectPrompts: item.projectPrompts
    });
    const rowPayload = {
      topic_id: topic.id,
      slug,
      title: item.question,
      summary: cleanText(stripMarkdown(item.answer).slice(0, 220), 500),
      answer_md: item.answer,
      answer_html: markdownToHtml(item.answer),
      answer_points: JSON.stringify(answerMeta),
      difficulty: item.difficulty,
      source: `ai-daily-${source.provider || "llm"}`,
      tags: JSON.stringify(item.tags),
      status: "published",
      sort_order: item.number * 10
    };
    await query(`INSERT INTO interview_questions(topic_id,slug,title,summary,answer_md,answer_html,answer_points,difficulty,source,tags,status,sort_order,reviewed_at,created_at,updated_at,deleted_at)
      VALUES(:topic_id,:slug,:title,:summary,:answer_md,:answer_html,CAST(:answer_points AS JSON),:difficulty,:source,CAST(:tags AS JSON),:status,:sort_order,NOW(),NOW(),NOW(),NULL)
      ON DUPLICATE KEY UPDATE topic_id=:topic_id,title=:title,summary=:summary,answer_md=:answer_md,answer_html=:answer_html,answer_points=CAST(:answer_points AS JSON),difficulty=:difficulty,source=:source,tags=CAST(:tags AS JSON),status=:status,sort_order=:sort_order,reviewed_at=NOW(),deleted_at=NULL,updated_at=NOW()`, rowPayload);
    const saved = await getOne("SELECT id FROM interview_questions WHERE slug=:slug LIMIT 1", { slug });
    if (!saved?.id) continue;
    const goalIds = await inferInterviewGoalIds({
      goalSlug: item.goalSlug,
      knowledgePoint: item.knowledgePoint,
      title: item.question,
      answer: item.answer,
      category: item.category,
      tags: item.tags
    });
    await syncInterviewQuestionGoalLinks(saved.id, goalIds);
    questionIds.push(Number(saved.id));
  }
  const setPayload = {
    day_date: payload.date,
    title: payload.title,
    subtitle: payload.subtitle,
    status: "published",
    question_ids: JSON.stringify(questionIds.slice(0, 50)),
    sidebar_json: JSON.stringify(payload.sidebar || defaultInterviewSidebar),
    source_provider: source.provider || "llm",
    source_model: source.model || "",
    generation_status: questionIds.length >= 50 ? "success" : "partial",
    generation_error: questionIds.length >= 50 ? null : `only_saved_${questionIds.length}`
  };
  const existing = await getOne("SELECT id FROM interview_daily_sets WHERE day_date=:day_date LIMIT 1", { day_date: payload.date });
  if (existing) {
    await query(`UPDATE interview_daily_sets
      SET title=:title, subtitle=:subtitle, status=:status, question_ids=CAST(:question_ids AS JSON),
          sidebar_json=CAST(:sidebar_json AS JSON), source_provider=:source_provider,
          source_model=:source_model, generated_at=NOW(), generation_status=:generation_status,
          generation_error=:generation_error, updated_at=NOW()
      WHERE day_date=:day_date`, setPayload);
  } else {
    await query(`INSERT INTO interview_daily_sets(day_date,title,subtitle,status,question_ids,sidebar_json,source_provider,source_model,generated_at,generation_status,generation_error,created_at,updated_at)
      VALUES(:day_date,:title,:subtitle,:status,CAST(:question_ids AS JSON),CAST(:sidebar_json AS JSON),:source_provider,:source_model,NOW(),:generation_status,:generation_error,NOW(),NOW())`, setPayload);
  }
  await ensureInterviewQuestionGoalBackfill(true);
  return {
    date: payload.date,
    total: questionIds.length,
    skipped: false,
    source: { provider: setPayload.source_provider, model: setPayload.source_model, generatedAt: new Date().toISOString() },
    generationStatus: setPayload.generation_status
  };
}

async function ensureInterviewDailyGenerated({ date, topic = "", requirements = "", provider = "", force = false, reason = "manual" } = {}) {
  if (!databaseAvailable) throw interviewGenerationError("数据库不可用，不能生成题单", 503, "database_unavailable");
  const targetDate = cleanDateValue(date) || shanghaiDate();
  const existing = await getOne("SELECT *, JSON_LENGTH(question_ids) AS total FROM interview_daily_sets WHERE day_date=:day_date LIMIT 1", { day_date: targetDate });
  if (existing && !force && Number(existing.total || 0) >= 50 && existing.status === "published") {
    return {
      date: targetDate,
      total: Number(existing.total || 0),
      skipped: true,
      source: { provider: existing.source_provider || "admin", model: existing.source_model || "manual", generatedAt: existing.generated_at || null },
      generationStatus: existing.generation_status || "success"
    };
  }
  let source = { provider: provider || process.env.LLM_PROVIDER || "deepseek", model: "" };
  try {
    const catalog = await interviewGenerationGoalCatalog();
    const promptTopic = cleanText(requirements || topic || "", 500);
    const result = await callInterviewLlm(interviewGenerationPrompt(targetDate, promptTopic, catalog), provider);
    source = { provider: result.provider, model: result.model, reason };
    const payload = normalizeGeneratedInterviewPayload(parseInterviewModelJson(result.content), targetDate, catalog);
    return await saveGeneratedInterviewDaily(payload, source);
  } catch (error) {
    await recordInterviewGenerationFailure(targetDate, source, error).catch(() => {});
    throw error;
  }
}

async function adminApi(req, res, url) {
  if (url.pathname === "/admin/api/login" && req.method === "POST") {
    const body = await readAdminObject(req);
    const username = String(body.username || "").trim();
    const password = String(body.password ?? "");
    if (matchesLocalPreviewAdmin(req, username, password)) {
      return json(res, { user: { id: -1, username, preview: true } }, 200, {
        "Set-Cookie": `session=${encodeURIComponent(signSession(-1))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`
      });
    }
    let user;
    try {
      user = await getOne("SELECT * FROM users WHERE username=:username", { username });
    } catch (error) {
      markDatabaseUnavailable(error, "admin login database");
      if (matchesLocalPreviewAdmin(req, username, password)) {
        return json(res, { user: { id: -1, username, preview: true } }, 200, {
          "Set-Cookie": `session=${encodeURIComponent(signSession(-1))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`
        });
      }
      return json(res, { error: "database_unavailable", message: "本地数据库未启动，可使用预览账号登录" }, 503);
    }
    if (!user || !passwordMatches(password, user.password_hash)) {
      return json(res, { error: "invalid_credentials", message: "用户名或密码不对" }, 401);
    }
    return json(res, { user: { id: user.id, username: user.username } }, 200, {
      "Set-Cookie": `session=${encodeURIComponent(signSession(user.id))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`
    });
  }

  if (url.pathname === "/admin/api/logout" && req.method === "POST") {
    return json(res, { ok: true }, 200, { "Set-Cookie": "session=; Path=/; Max-Age=0" });
  }

  const permission = adminPermissionForRequest(req, url);
  const user = await requireAdminJson(req, res, permission);
  if (!user) return;
  if (!userCan(user, permission)) return denyPermission(res, permission, user);

  if (url.pathname === "/admin/api/me" && req.method === "GET") {
    return json(res, { user });
  }

  if (url.pathname === "/admin/api/overview" && req.method === "GET") {
    if (!databaseAvailable) return json(res, fallbackAdminOverview());
    const [stats] = await query(`
      SELECT
        (SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL) AS posts,
        (SELECT COUNT(*) FROM posts WHERE status='published' AND deleted_at IS NULL) AS publishedPosts,
        (SELECT COUNT(*) FROM posts WHERE status='draft' AND deleted_at IS NULL) AS draftPosts,
        (SELECT COUNT(*) FROM moments WHERE deleted_at IS NULL) AS moments,
        (SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL) AS projects,
        (SELECT COUNT(*) FROM projects WHERE status='active' AND deleted_at IS NULL) AS activeProjects,
        (SELECT COUNT(*) FROM interview_items WHERE deleted_at IS NULL) AS interviews,
        (SELECT COUNT(*) FROM interview_items WHERE status='published' AND deleted_at IS NULL) AS publishedInterviews,
        (SELECT COUNT(*) FROM comments WHERE deleted_at IS NULL) AS comments,
        (SELECT COUNT(*) FROM comments WHERE status='pending' AND deleted_at IS NULL) AS pendingComments,
        (SELECT COUNT(*) FROM posts WHERE deleted_at IS NOT NULL)
          + (SELECT COUNT(*) FROM moments WHERE deleted_at IS NOT NULL)
          + (SELECT COUNT(*) FROM projects WHERE deleted_at IS NOT NULL)
          + (SELECT COUNT(*) FROM interview_items WHERE deleted_at IS NOT NULL)
        + (SELECT COUNT(*) FROM interview_topics WHERE deleted_at IS NOT NULL)
        + (SELECT COUNT(*) FROM interview_questions WHERE deleted_at IS NOT NULL)
        + (SELECT COUNT(*) FROM interview_reviews WHERE deleted_at IS NOT NULL)
        + (SELECT COUNT(*) FROM comments WHERE deleted_at IS NOT NULL) AS trashItems,
        (SELECT COUNT(*) FROM audit_logs) AS auditLogs,
        (SELECT COUNT(*) FROM setting_versions) AS settingVersions,
        (SELECT COUNT(*) FROM content_versions) AS contentVersions,
        (SELECT COUNT(*) FROM media_assets WHERE deleted_at IS NULL) AS mediaAssets,
        (SELECT COUNT(*) FROM media_assets m WHERE m.deleted_at IS NULL AND NOT EXISTS (
          SELECT 1 FROM attachment_refs r WHERE r.media_asset_id=m.id OR r.media_url=m.url
        )) AS orphanMediaAssets,
        (SELECT COUNT(*) FROM search_sync_jobs) AS searchJobs,
        (SELECT COUNT(*) FROM backup_jobs) AS backupJobs
    `);
    const recentPosts = await query("SELECT id,title,slug,status,published_at,created_at,updated_at FROM posts WHERE deleted_at IS NULL ORDER BY updated_at DESC,id DESC LIMIT 6");
    const recentProjects = await query("SELECT id,name,slug,progress,status,updated_at FROM projects WHERE deleted_at IS NULL ORDER BY updated_at DESC,id DESC LIMIT 6");
    const recentMoments = await query("SELECT id,content,kind,status,created_at FROM moments WHERE deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 6");
    return json(res, { stats, recentPosts, recentProjects, recentMoments });
  }

  if (url.pathname === "/admin/api/content-cleanup") {
    if (req.method === "GET") return json(res, await oldLaunchContentStats());
    if (req.method === "POST") {
      const result = await cleanupOldLaunchContent(req, user, await readAdminObject(req));
      return json(res, result, result.error ? (result.error === "database_unavailable" ? 503 : 400) : 200);
    }
  }

  if (url.pathname === "/admin/api/sync-search" && req.method === "POST") {
    const startedAt = new Date();
    try {
      const count = await syncSearchIndex();
      await recordSearchSyncJob("success", count, "", user, startedAt);
      await writeAuditLog(req, user, "sync-search", "search-index", "posts", null, { count });
      return json(res, { count });
    } catch (error) {
      await recordSearchSyncJob("failed", 0, error.message || "同步失败", user, startedAt);
      throw error;
    }
  }

  if (url.pathname === "/admin/api/system-status" && req.method === "GET") {
    return json(res, await adminSystemStatusPayload(user));
  }

  if (url.pathname === "/admin/api/task-center" && req.method === "GET") {
    return json(res, await taskCenterPayload());
  }

  if (url.pathname === "/admin/api/interaction-insights" && req.method === "GET") {
    return json(res, await interactionInsightsPayload(url.searchParams.get("days") || 7));
  }

  if (url.pathname === "/admin/api/integrations" && req.method === "GET") {
    return json(res, await integrationStatusPayload());
  }

  if (url.pathname === "/admin/api/integrations/github/sync" && req.method === "POST") {
    const body = await readAdminObject(req);
    const result = await syncGithubRepositories(req, user, body.username || body.githubUsername || "");
    if (result.error) return json(res, result, result.error === "database_unavailable" ? 503 : 502);
    return json(res, result);
  }

  if (url.pathname === "/admin/api/integrations/github/contributions/refresh" && req.method === "POST") {
    const body = await readAdminObject(req);
    const username = normalizeGithubLogin(body.username || body.githubUsername || await getSetting("github_username", config.github.username || "Jlemonz"));
    try {
      const snapshot = await refreshGithubContributionsSnapshot(username);
      await writeAuditLog(req, user, "refresh-github-contributions", "github-contributions", username, null, {
        total: snapshot.total || 0,
        source: snapshot.source || "github"
      });
      return json(res, snapshot);
    } catch (error) {
      await writeAuditLog(req, user, "refresh-github-contributions-failed", "github-contributions", username, null, {
        error: error.message || String(error)
      });
      return json(res, { error: "github_contributions_failed", message: error.message || "GitHub 贡献日历刷新失败" }, 502);
    }
  }

  if (url.pathname === "/admin/api/roles" && req.method === "GET") {
    return json(res, await listRolesAndPermissions());
  }

  if (url.pathname === "/admin/api/users" && req.method === "GET") {
    return json(res, await listAdminUsers());
  }

  if (url.pathname === "/admin/api/audit-logs" && req.method === "GET") {
    return json(res, await listAuditLogs({
      limit: url.searchParams.get("limit"),
      action: url.searchParams.get("action") || "",
      resource: url.searchParams.get("resource") || url.searchParams.get("resourceType") || "",
      username: url.searchParams.get("username") || "",
      q: url.searchParams.get("q") || ""
    }));
  }

  if (url.pathname === "/admin/api/audit-insights" && req.method === "GET") {
    return json(res, await auditInsightsPayload(url.searchParams.get("days") || 7));
  }

  if (url.pathname === "/admin/api/uploads" && req.method === "POST") {
    try {
      const body = await readForm(req);
      const file = body.files?.file || body.files?.image;
      const asset = await saveUploadedImage(file, user);
      await rebuildAttachmentRefs();
      await writeAuditLog(req, user, "upload", "media-asset", asset.url, null, asset);
      return json(res, asset, 201);
    } catch (error) {
      return json(res, {
        error: "upload_failed",
        message: error.message || "图片上传失败"
      }, error.status || 400);
    }
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (url.pathname === "/admin/api/interview-daily" && req.method === "GET") {
    return json(res, await adminInterviewDailyStatus(url));
  }
  if (url.pathname === "/admin/api/interview-daily/publish" && req.method === "POST") {
    return json(res, await publishInterviewDailySet(req));
  }

  const resource = parts[2];
  const id = cleanId(parts[3] || "");
  const action = parts[4] || "";

  if (adminContentResources.has(resource) && parts[3] === "export" && req.method === "GET") {
    return exportAdminContent(req, res, user, resource, url);
  }

  if (adminBatchResources.has(resource) && parts[3] === "batch" && req.method === "POST") {
    return batchAdminContent(req, res, user, resource);
  }

  if (resource === "roles") {
    if (req.method === "GET" && !id) return json(res, await listRolesAndPermissions());
    if (req.method === "POST" && !id) {
      const result = await createAdminRole(req, user, await readAdminObject(req));
      if (result.error) return json(res, result, result.status || 400);
      return json(res, result.item, result.status || 200);
    }
    if (req.method === "PUT" && id) {
      const result = await updateAdminRole(req, user, id, await readAdminObject(req));
      if (result.error) return json(res, result, result.status || 400);
      return json(res, result.item);
    }
  }

  if (resource === "users") {
    if (req.method === "GET" && !id) return json(res, await listAdminUsers());
    if (["POST", "PUT"].includes(req.method) && id && action === "roles") {
      const result = await updateAdminUserRoles(req, user, id, await readAdminObject(req));
      if (result.error) return json(res, result, result.status || 400);
      return json(res, result.item);
    }
  }

  if (resource === "hz-quotes") {
    if (!databaseAvailable) return json(res, await listHzQuotes());
    if (req.method === "GET" && !id) return json(res, await listHzQuotes({ includeDeleted: url.searchParams.get("trash") === "1" }));
    if (req.method === "GET" && id) {
      const row = await getOne("SELECT * FROM hz_quotes WHERE id=:id", { id });
      return row ? json(res, publicHzQuote(row)) : json(res, { error: "not_found" }, 404);
    }
    if (req.method === "POST" && !id) {
      const payload = normalizeHzQuotePayload(await readAdminObject(req));
      if (!payload.text) return json(res, { error: "empty_text", message: "请先写一句内容。" }, 400);
      const result = await query(`INSERT INTO hz_quotes(text,status,visible,sort_order,created_at,updated_at,deleted_at)
        VALUES(:text,:status,:visible,:sort_order,NOW(),NOW(),NULL)`, payload);
      const row = await getOne("SELECT * FROM hz_quotes WHERE id=:id", { id: result.insertId });
      await clearHzQuoteCache();
      await recordContentVersion("hz-quote", row.id, publicHzQuote(row), user, "create");
      await writeAuditLog(req, user, "create", "hz-quote", row.id, null, publicHzQuote(row));
      return json(res, publicHzQuote(row), 201);
    }
    if (req.method === "PUT" && id) {
      const current = await getOne("SELECT * FROM hz_quotes WHERE id=:id", { id });
      if (!current) return json(res, { error: "not_found" }, 404);
      const payload = { ...normalizeHzQuotePayload(await readAdminObject(req), current), id };
      if (!payload.text) return json(res, { error: "empty_text", message: "请先写一句内容。" }, 400);
      await query("UPDATE hz_quotes SET text=:text,status=:status,visible=:visible,sort_order=:sort_order,updated_at=NOW() WHERE id=:id", payload);
      const row = await getOne("SELECT * FROM hz_quotes WHERE id=:id", { id });
      await clearHzQuoteCache();
      await recordContentVersion("hz-quote", id, publicHzQuote(row), user, "update");
      await writeAuditLog(req, user, "update", "hz-quote", id, publicHzQuote(current), publicHzQuote(row));
      return json(res, publicHzQuote(row));
    }
    if (req.method === "POST" && id && ["publish", "hide", "restore"].includes(action)) {
      const current = await getOne("SELECT * FROM hz_quotes WHERE id=:id", { id });
      if (!current) return json(res, { error: "not_found" }, 404);
      if (action === "publish") await query("UPDATE hz_quotes SET status='published', visible=1, deleted_at=NULL, updated_at=NOW() WHERE id=:id", { id });
      if (action === "hide") await query("UPDATE hz_quotes SET status='draft', visible=0, updated_at=NOW() WHERE id=:id", { id });
      if (action === "restore") await query("UPDATE hz_quotes SET deleted_at=NULL, visible=1, updated_at=NOW() WHERE id=:id", { id });
      const row = await getOne("SELECT * FROM hz_quotes WHERE id=:id", { id });
      await clearHzQuoteCache();
      await recordContentVersion("hz-quote", id, publicHzQuote(row), user, action);
      await writeAuditLog(req, user, action, "hz-quote", id, publicHzQuote(current), publicHzQuote(row));
      return json(res, publicHzQuote(row));
    }
    if (req.method === "DELETE" && id) {
      const current = await getOne("SELECT * FROM hz_quotes WHERE id=:id", { id });
      if (!current) return json(res, { error: "not_found" }, 404);
      await query("UPDATE hz_quotes SET status='draft', visible=0, deleted_at=COALESCE(deleted_at,NOW()), updated_at=NOW() WHERE id=:id", { id });
      const row = await getOne("SELECT * FROM hz_quotes WHERE id=:id", { id });
      await clearHzQuoteCache();
      await recordContentVersion("hz-quote", id, publicHzQuote(row), user, "delete");
      await writeAuditLog(req, user, "delete", "hz-quote", id, publicHzQuote(current), publicHzQuote(row));
      return json(res, { ok: true });
    }
  }

  if (resource === "interview-goals") {
    if (!databaseAvailable) {
      const idBySlug = new Map(interviewGoalDefaults.map((item, index) => [item.slug, index + 1]));
      return json(res, {
        items: interviewGoalDefaults.map((item, index) => publicInterviewGoalNode({
          ...item,
          id: index + 1,
          parent_id: item.parent ? idBySlug.get(item.parent) || null : null,
          visible: 1
        }))
      });
    }
    if (req.method === "GET" && !id) {
      const rows = await query(`SELECT g.*,
        COUNT(DISTINCT l.question_id) AS question_count,
        SUM(CASE WHEN q.status='published' AND q.deleted_at IS NULL THEN 1 ELSE 0 END) AS published_question_count,
        SUM(CASE WHEN q.is_difficult=1 THEN 1 ELSE 0 END) AS weak_count,
        COUNT(DISTINCT CASE WHEN u.type='mistake' AND u.status='published' AND u.deleted_at IS NULL THEN u.id END) AS mistake_count,
        COUNT(DISTINCT u.id) AS update_count
        FROM interview_goal_nodes g
        LEFT JOIN interview_goal_question_links l ON l.goal_id=g.id
        LEFT JOIN interview_questions q ON q.id=l.question_id AND q.deleted_at IS NULL
        LEFT JOIN interview_goal_updates u ON u.goal_id=g.id AND u.deleted_at IS NULL
        WHERE g.deleted_at IS NULL
        GROUP BY g.id
        ORDER BY COALESCE(g.parent_id,0) ASC, g.sort_order ASC, g.id ASC`);
      return json(res, { items: rows.map(publicInterviewGoalNode) });
    }
    if (req.method === "GET" && id) {
      const row = await getOne("SELECT * FROM interview_goal_nodes WHERE id=:id", { id });
      return row ? json(res, publicInterviewGoalNode(row)) : json(res, { error: "not_found" }, 404);
    }
    if (req.method === "POST" && !id) {
      const payload = normalizeInterviewGoalPayload(await readAdminObject(req));
      const result = await query(`INSERT INTO interview_goal_nodes
        (parent_id,slug,title,summary,status,target_count,manual_progress,sort_order,visible,accent,icon,created_at,updated_at,deleted_at)
        VALUES(:parent_id,:slug,:title,:summary,:status,:target_count,:manual_progress,:sort_order,:visible,:accent,:icon,NOW(),NOW(),NULL)`, payload);
      const row = await getOne("SELECT * FROM interview_goal_nodes WHERE id=:id", { id: result.insertId });
      await recordContentVersion("interview-goal", row.id, row, user, "create");
      await writeAuditLog(req, user, "create", "interview-goal", row.id, null, row);
      return json(res, publicInterviewGoalNode(row), 201);
    }
    if (req.method === "PUT" && id) {
      const current = await getOne("SELECT * FROM interview_goal_nodes WHERE id=:id", { id });
      if (!current) return json(res, { error: "not_found" }, 404);
      const payload = { ...normalizeInterviewGoalPayload(await readAdminObject(req), current), id };
      if (payload.parent_id && String(payload.parent_id) === String(id)) return json(res, { error: "invalid_parent", message: "目标不能把自己设为父级" }, 400);
      if (current.slug === "other") {
        payload.slug = "other";
        payload.visible = 1;
      } else if (payload.slug === "other") {
        return json(res, { error: "protected_goal", message: "其他分类为系统兜底分类，不能被普通节点占用" }, 400);
      }
      await query(`UPDATE interview_goal_nodes SET parent_id=:parent_id,slug=:slug,title=:title,summary=:summary,status=:status,
        target_count=:target_count,manual_progress=:manual_progress,sort_order=:sort_order,visible=:visible,accent=:accent,icon=:icon,updated_at=NOW()
        WHERE id=:id`, payload);
      const row = await getOne("SELECT * FROM interview_goal_nodes WHERE id=:id", { id });
      await recordContentVersion("interview-goal", id, row, user, "update");
      await writeAuditLog(req, user, "update", "interview-goal", id, current, row);
      return json(res, publicInterviewGoalNode(row));
    }
    if (req.method === "POST" && id && ["publish", "hide", "restore"].includes(action)) {
      const current = await getOne("SELECT * FROM interview_goal_nodes WHERE id=:id", { id });
      if (!current) return json(res, { error: "not_found" }, 404);
      if (current.slug === "other" && action === "hide") return json(res, { error: "protected_goal", message: "其他分类必须保持展示" }, 400);
      await query("UPDATE interview_goal_nodes SET visible=:visible, deleted_at=NULL, updated_at=NOW() WHERE id=:id", { id, visible: action === "hide" ? 0 : 1 });
      const row = await getOne("SELECT * FROM interview_goal_nodes WHERE id=:id", { id });
      await recordContentVersion("interview-goal", id, row, user, action);
      await writeAuditLog(req, user, action, "interview-goal", id, current, row);
      return json(res, publicInterviewGoalNode(row));
    }
    if (req.method === "DELETE" && id) {
      const current = await getOne("SELECT * FROM interview_goal_nodes WHERE id=:id", { id });
      if (current?.slug === "other") return json(res, { error: "protected_goal", message: "其他分类不可删除" }, 400);
      await query("UPDATE interview_goal_nodes SET visible=0, deleted_at=COALESCE(deleted_at,NOW()), updated_at=NOW() WHERE id=:id", { id });
      await writeAuditLog(req, user, "delete", "interview-goal", id, current, await getOne("SELECT * FROM interview_goal_nodes WHERE id=:id", { id }));
      return json(res, { ok: true });
    }
  }

  if (resource === "interview-goal-updates") {
    if (!databaseAvailable) return json(res, { items: [] });
    if (req.method === "GET" && !id) {
      const where = ["u.deleted_at IS NULL"];
      const params = { limit: Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 120)) };
      const goalId = cleanId(url.searchParams.get("goalId") || url.searchParams.get("goal_id") || "");
      if (goalId) { where.push("u.goal_id=:goal_id"); params.goal_id = goalId; }
      const type = cleanText(url.searchParams.get("type") || "", 20);
      if (["progress", "mistake", "note"].includes(type)) { where.push("u.type=:type"); params.type = type; }
      const rows = await query(`SELECT u.*, g.title AS goal_title, q.title AS related_question_title
        FROM interview_goal_updates u
        LEFT JOIN interview_goal_nodes g ON g.id=u.goal_id
        LEFT JOIN interview_questions q ON q.id=u.related_question_id
        WHERE ${where.join(" AND ")}
        ORDER BY u.happened_at DESC, u.sort_order ASC, u.id DESC LIMIT :limit`, params);
      return json(res, { items: rows.map(publicInterviewGoalUpdate) });
    }
    if (req.method === "GET" && id) {
      const row = await getOne("SELECT u.*, g.title AS goal_title, q.title AS related_question_title FROM interview_goal_updates u LEFT JOIN interview_goal_nodes g ON g.id=u.goal_id LEFT JOIN interview_questions q ON q.id=u.related_question_id WHERE u.id=:id", { id });
      return row ? json(res, publicInterviewGoalUpdate(row)) : json(res, { error: "not_found" }, 404);
    }
    if (req.method === "POST" && !id) {
      const payload = normalizeInterviewGoalUpdatePayload(await readAdminObject(req));
      const result = await query(`INSERT INTO interview_goal_updates
        (goal_id,type,title,body_md,body_html,related_question_id,status,happened_at,sort_order,created_at,updated_at,deleted_at)
        VALUES(:goal_id,:type,:title,:body_md,:body_html,:related_question_id,:status,:happened_at,:sort_order,NOW(),NOW(),NULL)`, payload);
      const row = await getOne("SELECT * FROM interview_goal_updates WHERE id=:id", { id: result.insertId });
      await recordContentVersion("interview-goal-update", row.id, row, user, "create");
      await writeAuditLog(req, user, "create", "interview-goal-update", row.id, null, row);
      return json(res, publicInterviewGoalUpdate(row), 201);
    }
    if (req.method === "PUT" && id) {
      const current = await getOne("SELECT * FROM interview_goal_updates WHERE id=:id", { id });
      if (!current) return json(res, { error: "not_found" }, 404);
      const payload = { ...normalizeInterviewGoalUpdatePayload(await readAdminObject(req), current), id };
      await query(`UPDATE interview_goal_updates SET goal_id=:goal_id,type=:type,title=:title,body_md=:body_md,body_html=:body_html,
        related_question_id=:related_question_id,status=:status,happened_at=:happened_at,sort_order=:sort_order,updated_at=NOW()
        WHERE id=:id`, payload);
      const row = await getOne("SELECT * FROM interview_goal_updates WHERE id=:id", { id });
      await recordContentVersion("interview-goal-update", id, row, user, "update");
      await writeAuditLog(req, user, "update", "interview-goal-update", id, current, row);
      return json(res, publicInterviewGoalUpdate(row));
    }
    if (req.method === "POST" && id && ["publish", "hide", "restore"].includes(action)) {
      const current = await getOne("SELECT * FROM interview_goal_updates WHERE id=:id", { id });
      if (!current) return json(res, { error: "not_found" }, 404);
      const status = action === "hide" ? "draft" : "published";
      await query("UPDATE interview_goal_updates SET status=:status, deleted_at=NULL, updated_at=NOW() WHERE id=:id", { id, status });
      const row = await getOne("SELECT * FROM interview_goal_updates WHERE id=:id", { id });
      await recordContentVersion("interview-goal-update", id, row, user, action);
      await writeAuditLog(req, user, action, "interview-goal-update", id, current, row);
      return json(res, publicInterviewGoalUpdate(row));
    }
    if (req.method === "DELETE" && id) {
      const current = await getOne("SELECT * FROM interview_goal_updates WHERE id=:id", { id });
      await query("UPDATE interview_goal_updates SET status='draft', deleted_at=COALESCE(deleted_at,NOW()), updated_at=NOW() WHERE id=:id", { id });
      await writeAuditLog(req, user, "delete", "interview-goal-update", id, current, await getOne("SELECT * FROM interview_goal_updates WHERE id=:id", { id }));
      return json(res, { ok: true });
    }
  }


  if (resource === "interview-topics") {
    if (!databaseAvailable) return json(res, fallbackInterviewTopicItems());
    if (req.method === "GET" && !id) {
      const rows = await query("SELECT t.*, COUNT(q.id) AS question_count, SUM(CASE WHEN q.status='published' AND q.deleted_at IS NULL THEN 1 ELSE 0 END) AS published_question_count " +
        "FROM interview_topics t LEFT JOIN interview_questions q ON q.topic_id=t.id AND q.deleted_at IS NULL " +
        "WHERE t.deleted_at IS NULL GROUP BY t.id ORDER BY t.sort_order ASC, t.id ASC LIMIT 120");
      return json(res, { items: rows.map(publicInterviewTopic) });
    }
    if (req.method === "GET" && id) {
      const row = await getOne("SELECT * FROM interview_topics WHERE id=:id", { id });
      return row ? json(res, publicInterviewTopic(row)) : json(res, { error: "not_found" }, 404);
    }
    if (req.method === "POST" && !id) {
      const payload = normalizeInterviewTopicPayload(await readAdminObject(req));
      const result = await query("INSERT INTO interview_topics(slug,title,description,sort_order,visible,created_at,updated_at) VALUES(:slug,:title,:description,:sort_order,:visible,NOW(),NOW())", payload);
      const row = await getOne("SELECT * FROM interview_topics WHERE id=:id", { id: result.insertId });
      await recordContentVersion("interview-topic", row.id, row, user, "create");
      await writeAuditLog(req, user, "create", "interview-topic", row.id, null, row);
      return json(res, publicInterviewTopic(row), 201);
    }
    if (req.method === "PUT" && id) {
      const current = await getOne("SELECT * FROM interview_topics WHERE id=:id", { id });
      if (!current) return json(res, { error: "not_found" }, 404);
      const payload = { ...normalizeInterviewTopicPayload(await readAdminObject(req), current), id };
      await query("UPDATE interview_topics SET slug=:slug,title=:title,description=:description,sort_order=:sort_order,visible=:visible,updated_at=NOW() WHERE id=:id", payload);
      const row = await getOne("SELECT * FROM interview_topics WHERE id=:id", { id });
      await recordContentVersion("interview-topic", id, row, user, "update");
      await writeAuditLog(req, user, "update", "interview-topic", id, current, row);
      return json(res, publicInterviewTopic(row));
    }
    if (req.method === "POST" && id && ["publish", "hide", "restore"].includes(action)) {
      const current = await getOne("SELECT * FROM interview_topics WHERE id=:id", { id });
      if (!current) return json(res, { error: "not_found" }, 404);
      const visible = action === "hide" ? 0 : 1;
      await query("UPDATE interview_topics SET visible=:visible, deleted_at=NULL, updated_at=NOW() WHERE id=:id", { id, visible });
      const row = await getOne("SELECT * FROM interview_topics WHERE id=:id", { id });
      await recordContentVersion("interview-topic", id, row, user, action);
      await writeAuditLog(req, user, action, "interview-topic", id, current, row);
      return json(res, publicInterviewTopic(row));
    }
    if (req.method === "DELETE" && id) {
      const current = await getOne("SELECT * FROM interview_topics WHERE id=:id", { id });
      await query("UPDATE interview_topics SET visible=0, deleted_at=COALESCE(deleted_at,NOW()), updated_at=NOW() WHERE id=:id", { id });
      await writeAuditLog(req, user, "delete", "interview-topic", id, current, await getOne("SELECT * FROM interview_topics WHERE id=:id", { id }));
      return json(res, { ok: true });
    }
  }

  if (resource === "interview-questions") {
    if (!databaseAvailable) return json(res, fallbackInterviewQuestionItems({
      topic: url.searchParams.get("topic") || "",
      status: url.searchParams.get("status") || "",
      q: url.searchParams.get("q") || ""
    }));
    if (req.method === "GET" && !id) {
      const where = [];
      const params = { limit: Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 120)) };
      appendDeletedFilter(where, url, "q.deleted_at");
      const status = url.searchParams.get("status");
      if (["draft", "published"].includes(status)) { where.push("q.status=:status"); params.status = status; }
      const topic = cleanText(url.searchParams.get("topic") || "", 160);
      if (topic) { where.push("(t.slug=:topic OR q.topic_id=:topic_id)"); params.topic = topic; params.topic_id = cleanId(topic) || "0"; }
      const keyword = cleanText(url.searchParams.get("q") || "", 120);
      if (keyword) { where.push("(q.title LIKE :q OR q.summary LIKE :q OR q.answer_md LIKE :q)"); params.q = "%" + keyword + "%"; }
      const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
      const rows = await query("SELECT q.*, t.slug AS topic_slug, t.title AS topic_title FROM interview_questions q LEFT JOIN interview_topics t ON t.id=q.topic_id " + whereSql + " ORDER BY COALESCE(t.sort_order,9999) ASC, q.sort_order ASC, q.updated_at DESC, q.id DESC LIMIT :limit", params);
      await attachInterviewGoalIds(rows);
      return json(res, { items: rows.map(publicInterviewQuestion) });
    }
    if (req.method === "GET" && id) {
      const row = await getOne("SELECT q.*, t.slug AS topic_slug, t.title AS topic_title FROM interview_questions q LEFT JOIN interview_topics t ON t.id=q.topic_id WHERE q.id=:id", { id });
      if (row) await attachInterviewGoalIds([row]);
      return row ? json(res, publicInterviewQuestion(row)) : json(res, { error: "not_found" }, 404);
    }
    if (req.method === "POST" && !id) {
      const payload = normalizeInterviewQuestionPayload(await readAdminObject(req));
      if (!payload.answer_md.trim()) return json(res, { error: "content_required" }, 400);
      const result = await query("INSERT INTO interview_questions(topic_id,slug,title,summary,answer_md,answer_html,answer_points,difficulty,source,tags,status,sort_order,reviewed_at,created_at,updated_at) VALUES(:topic_id,:slug,:title,:summary,:answer_md,:answer_html,CAST(:answer_points AS JSON),:difficulty,:source,:tags,:status,:sort_order,:reviewed_at,NOW(),NOW())", payload);
      const row = await getOne("SELECT * FROM interview_questions WHERE id=:id", { id: result.insertId });
      await syncInterviewQuestionGoalLinks(row.id, payload.goal_ids);
      await attachInterviewGoalIds([row]);
      await refreshAttachmentRefsForResource("interview-question", row.id, { answer_md: row.answer_md, summary: row.summary });
      await recordContentVersion("interview-question", row.id, row, user, "create");
      await writeAuditLog(req, user, "create", "interview-question", row.id, null, row);
      syncSearchIndex().catch((error) => console.warn("search sync after interview question create failed", error.message || error));
      return json(res, publicInterviewQuestion(row), 201);
    }
    if (req.method === "PUT" && id) {
      const current = await getOne("SELECT * FROM interview_questions WHERE id=:id", { id });
      if (!current) return json(res, { error: "not_found" }, 404);
      const payload = { ...normalizeInterviewQuestionPayload(await readAdminObject(req), current), id };
      if (!payload.answer_md.trim()) return json(res, { error: "content_required" }, 400);
      await query("UPDATE interview_questions SET topic_id=:topic_id,slug=:slug,title=:title,summary=:summary,answer_md=:answer_md,answer_html=:answer_html,answer_points=CAST(:answer_points AS JSON),difficulty=:difficulty,source=:source,tags=:tags,status=:status,sort_order=:sort_order,reviewed_at=:reviewed_at,updated_at=NOW() WHERE id=:id", payload);
      const row = await getOne("SELECT * FROM interview_questions WHERE id=:id", { id });
      await syncInterviewQuestionGoalLinks(id, payload.goal_ids);
      await attachInterviewGoalIds([row]);
      await refreshAttachmentRefsForResource("interview-question", id, { answer_md: row.answer_md, summary: row.summary });
      await recordContentVersion("interview-question", id, row, user, "update");
      await writeAuditLog(req, user, "update", "interview-question", id, current, row);
      syncSearchIndex().catch((error) => console.warn("search sync after interview question update failed", error.message || error));
      return json(res, publicInterviewQuestion(row));
    }
    if (req.method === "POST" && id && ["publish", "hide", "restore"].includes(action)) {
      const current = await getOne("SELECT * FROM interview_questions WHERE id=:id", { id });
      if (!current) return json(res, { error: "not_found" }, 404);
      const status = action === "hide" ? "draft" : "published";
      await query("UPDATE interview_questions SET status=:status, deleted_at=NULL, reviewed_at=CASE WHEN :status='published' THEN COALESCE(reviewed_at,NOW()) ELSE reviewed_at END, updated_at=NOW() WHERE id=:id", { id, status });
      const row = await getOne("SELECT * FROM interview_questions WHERE id=:id", { id });
      await recordContentVersion("interview-question", id, row, user, action);
      await writeAuditLog(req, user, action, "interview-question", id, current, row);
      syncSearchIndex().catch((error) => console.warn("search sync after interview question status failed", error.message || error));
      return json(res, publicInterviewQuestion(row));
    }
    if (req.method === "DELETE" && id) {
      const current = await getOne("SELECT * FROM interview_questions WHERE id=:id", { id });
      await query("UPDATE interview_questions SET status='draft', deleted_at=COALESCE(deleted_at,NOW()), updated_at=NOW() WHERE id=:id", { id });
      await clearAttachmentRefsForResource("interview-question", id);
      await writeAuditLog(req, user, "delete", "interview-question", id, current, await getOne("SELECT * FROM interview_questions WHERE id=:id", { id }));
      syncSearchIndex().catch((error) => console.warn("search sync after interview question delete failed", error.message || error));
      return json(res, { ok: true });
    }
  }

  if (resource === "interview-reviews") {
    if (!databaseAvailable) return json(res, fallbackInterviewReviewItems({
      status: url.searchParams.get("status") || "",
      q: url.searchParams.get("q") || ""
    }));
    if (req.method === "GET" && !id) {
      const where = [];
      const params = { limit: Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 120)) };
      appendDeletedFilter(where, url, "deleted_at");
      const status = url.searchParams.get("status");
      if (["draft", "published"].includes(status)) { where.push("status=:status"); params.status = status; }
      const keyword = cleanText(url.searchParams.get("q") || "", 120);
      if (keyword) { where.push("(company_alias LIKE :q OR position_name LIKE :q OR summary_md LIKE :q)"); params.q = "%" + keyword + "%"; }
      const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
      const rows = await query("SELECT * FROM interview_reviews " + whereSql + " ORDER BY happened_at DESC, sort_order ASC, id DESC LIMIT :limit", params);
      return json(res, { items: rows.map(publicInterviewReview) });
    }
    if (req.method === "GET" && id) {
      const row = await getOne("SELECT * FROM interview_reviews WHERE id=:id", { id });
      return row ? json(res, publicInterviewReview(row)) : json(res, { error: "not_found" }, 404);
    }
    if (req.method === "POST" && !id) {
      const payload = normalizeInterviewReviewPayload(await readAdminObject(req));
      if (!payload.summary_md.trim()) return json(res, { error: "content_required" }, 400);
      const result = await query("INSERT INTO interview_reviews(company_alias,position_name,interview_round,happened_at,result_status,summary_md,summary_html,improvement_md,improvement_html,status,sort_order,created_at,updated_at) VALUES(:company_alias,:position_name,:interview_round,:happened_at,:result_status,:summary_md,:summary_html,:improvement_md,:improvement_html,:status,:sort_order,NOW(),NOW())", payload);
      const row = await getOne("SELECT * FROM interview_reviews WHERE id=:id", { id: result.insertId });
      await refreshAttachmentRefsForResource("interview-review", row.id, { summary_md: row.summary_md, improvement_md: row.improvement_md });
      await recordContentVersion("interview-review", row.id, row, user, "create");
      await writeAuditLog(req, user, "create", "interview-review", row.id, null, row);
      return json(res, publicInterviewReview(row), 201);
    }
    if (req.method === "PUT" && id) {
      const current = await getOne("SELECT * FROM interview_reviews WHERE id=:id", { id });
      if (!current) return json(res, { error: "not_found" }, 404);
      const payload = { ...normalizeInterviewReviewPayload(await readAdminObject(req), current), id };
      if (!payload.summary_md.trim()) return json(res, { error: "content_required" }, 400);
      await query("UPDATE interview_reviews SET company_alias=:company_alias,position_name=:position_name,interview_round=:interview_round,happened_at=:happened_at,result_status=:result_status,summary_md=:summary_md,summary_html=:summary_html,improvement_md=:improvement_md,improvement_html=:improvement_html,status=:status,sort_order=:sort_order,updated_at=NOW() WHERE id=:id", payload);
      const row = await getOne("SELECT * FROM interview_reviews WHERE id=:id", { id });
      await refreshAttachmentRefsForResource("interview-review", id, { summary_md: row.summary_md, improvement_md: row.improvement_md });
      await recordContentVersion("interview-review", id, row, user, "update");
      await writeAuditLog(req, user, "update", "interview-review", id, current, row);
      return json(res, publicInterviewReview(row));
    }
    if (req.method === "POST" && id && ["publish", "hide", "restore"].includes(action)) {
      const current = await getOne("SELECT * FROM interview_reviews WHERE id=:id", { id });
      if (!current) return json(res, { error: "not_found" }, 404);
      const status = action === "hide" ? "draft" : "published";
      await query("UPDATE interview_reviews SET status=:status, deleted_at=NULL, updated_at=NOW() WHERE id=:id", { id, status });
      const row = await getOne("SELECT * FROM interview_reviews WHERE id=:id", { id });
      await recordContentVersion("interview-review", id, row, user, action);
      await writeAuditLog(req, user, action, "interview-review", id, current, row);
      return json(res, publicInterviewReview(row));
    }
    if (req.method === "DELETE" && id) {
      const current = await getOne("SELECT * FROM interview_reviews WHERE id=:id", { id });
      await query("UPDATE interview_reviews SET status='draft', deleted_at=COALESCE(deleted_at,NOW()), updated_at=NOW() WHERE id=:id", { id });
      await clearAttachmentRefsForResource("interview-review", id);
      await writeAuditLog(req, user, "delete", "interview-review", id, current, await getOne("SELECT * FROM interview_reviews WHERE id=:id", { id }));
      return json(res, { ok: true });
    }
  }

  if (resource === "page-blocks") {
    if (req.method === "GET" && !id) {
      if (!databaseAvailable) return json(res, { items: [], source: "local-preview" });
      const where = [];
      const params = {};
      const pageKey = cleanKey(url.searchParams.get("page") || "", "");
      const status = cleanStatus(url.searchParams.get("status"), ["draft", "published", "hidden"], "");
      if (pageKey) {
        where.push("page_key=:page_key");
        params.page_key = pageKey;
      }
      if (status) {
        where.push("status=:status");
        params.status = status;
      }
      const rows = await query(`SELECT * FROM page_blocks ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY page_key ASC, sort_order ASC, id ASC LIMIT 240`, params);
      return json(res, { items: rows.map(pageBlockFromRow) });
    }
    if (req.method === "GET" && id) {
      const row = databaseAvailable ? await getOne("SELECT * FROM page_blocks WHERE id=:id", { id }) : null;
      return row ? json(res, pageBlockFromRow(row)) : json(res, { error: "not_found" }, 404);
    }
    if (req.method === "POST" && !id) {
      const payload = normalizePageBlockPayload(await readAdminObject(req));
      const result = await query(`INSERT INTO page_blocks(page_key, block_key, title, payload_json, status, sort_order, created_at, updated_at)
        VALUES(:page_key, :block_key, :title, :payload_json, :status, :sort_order, NOW(), NOW())`, payload);
      const row = pageBlockFromRow(await getOne("SELECT * FROM page_blocks WHERE id=:id", { id: result.insertId }));
      await cacheDel(publicCmsCacheKeys(row.page_key));
      await refreshAttachmentRefsForResource("page-block", row.id, { title: row.title, payload: JSON.stringify(row.payload || {}) });
      await recordSettingVersion(`page-blocks-${row.page_key}`, row, user, "page-block-create");
      await writeAuditLog(req, user, "create", "page-block", row.id, null, row);
      return json(res, row, 201);
    }
    if (req.method === "PUT" && id) {
      const current = await getOne("SELECT * FROM page_blocks WHERE id=:id", { id });
      if (!current) return json(res, { error: "not_found" }, 404);
      const payload = { ...normalizePageBlockPayload(await readAdminObject(req), current), id };
      await query(`UPDATE page_blocks SET page_key=:page_key, block_key=:block_key, title=:title,
        payload_json=:payload_json, status=:status, sort_order=:sort_order, updated_at=NOW() WHERE id=:id`, payload);
      const row = pageBlockFromRow(await getOne("SELECT * FROM page_blocks WHERE id=:id", { id }));
      await cacheDel(publicCmsCacheKeys(current.page_key, row.page_key));
      await refreshAttachmentRefsForResource("page-block", row.id, { title: row.title, payload: JSON.stringify(row.payload || {}) });
      await recordSettingVersion(`page-blocks-${row.page_key}`, row, user, "page-block-update");
      await writeAuditLog(req, user, "update", "page-block", id, pageBlockFromRow(current), row);
      return json(res, row);
    }
    if (req.method === "DELETE" && id) {
      const current = await getOne("SELECT * FROM page_blocks WHERE id=:id", { id });
      if (current) {
        await query("UPDATE page_blocks SET status='hidden', updated_at=NOW() WHERE id=:id", { id });
        const row = pageBlockFromRow(await getOne("SELECT * FROM page_blocks WHERE id=:id", { id }));
        await cacheDel(publicCmsCacheKeys(row.page_key));
        await clearAttachmentRefsForResource("page-block", id);
        await recordSettingVersion(`page-blocks-${row.page_key}`, row, user, "page-block-hide");
        await writeAuditLog(req, user, "hide", "page-block", id, pageBlockFromRow(current), row);
      }
      return json(res, { ok: true });
    }
  }

  if (resource === "theme-settings") {
    if (req.method === "GET" && !id) {
      if (!databaseAvailable) return json(res, { items: [], source: "local-preview" });
      const rows = await query("SELECT * FROM theme_settings ORDER BY updated_at DESC, id DESC LIMIT 120");
      return json(res, { items: rows.map(themeSettingFromRow) });
    }
    if (req.method === "GET" && id) {
      const row = databaseAvailable ? await getOne("SELECT * FROM theme_settings WHERE id=:id", { id }) : null;
      return row ? json(res, themeSettingFromRow(row)) : json(res, { error: "not_found" }, 404);
    }
    if (req.method === "POST" && !id) {
      const payload = normalizeThemeSettingPayload(await readAdminObject(req));
      const result = await query(`INSERT INTO theme_settings(scope_key, payload_json, status, created_at, updated_at)
        VALUES(:scope_key, :payload_json, :status, NOW(), NOW())`, payload);
      const row = themeSettingFromRow(await getOne("SELECT * FROM theme_settings WHERE id=:id", { id: result.insertId }));
      await cacheDel(publicCmsCacheKeys());
      await refreshAttachmentRefsForResource("theme-setting", row.id, { payload: JSON.stringify(row.payload || {}) });
      await recordSettingVersion(`theme-settings-${row.scope_key}`, row, user, "theme-setting-create");
      await writeAuditLog(req, user, "create", "theme-setting", row.id, null, row);
      return json(res, row, 201);
    }
    if (req.method === "PUT" && id) {
      const current = await getOne("SELECT * FROM theme_settings WHERE id=:id", { id });
      if (!current) return json(res, { error: "not_found" }, 404);
      const payload = { ...normalizeThemeSettingPayload(await readAdminObject(req), current), id };
      await query("UPDATE theme_settings SET scope_key=:scope_key, payload_json=:payload_json, status=:status, updated_at=NOW() WHERE id=:id", payload);
      const row = themeSettingFromRow(await getOne("SELECT * FROM theme_settings WHERE id=:id", { id }));
      await cacheDel(publicCmsCacheKeys());
      await refreshAttachmentRefsForResource("theme-setting", row.id, { payload: JSON.stringify(row.payload || {}) });
      await recordSettingVersion(`theme-settings-${row.scope_key}`, row, user, "theme-setting-update");
      await writeAuditLog(req, user, "update", "theme-setting", id, themeSettingFromRow(current), row);
      return json(res, row);
    }
    if (req.method === "DELETE" && id) {
      const current = await getOne("SELECT * FROM theme_settings WHERE id=:id", { id });
      if (current) {
        await query("UPDATE theme_settings SET status='draft', updated_at=NOW() WHERE id=:id", { id });
        const row = themeSettingFromRow(await getOne("SELECT * FROM theme_settings WHERE id=:id", { id }));
        await cacheDel(publicCmsCacheKeys());
        await clearAttachmentRefsForResource("theme-setting", id);
        await recordSettingVersion(`theme-settings-${row.scope_key}`, row, user, "theme-setting-draft");
        await writeAuditLog(req, user, "unpublish", "theme-setting", id, themeSettingFromRow(current), row);
      }
      return json(res, { ok: true });
    }
  }

  if (resource === "navigation-items") {
    if (req.method === "GET" && !id) {
      if (!databaseAvailable) return json(res, { items: [], source: "local-preview" });
      const placement = cleanKey(url.searchParams.get("placement") || "", "");
      const rows = await query(`SELECT * FROM navigation_items ${placement ? "WHERE placement=:placement" : ""}
        ORDER BY placement ASC, sort_order ASC, id ASC LIMIT 160`, placement ? { placement } : {});
      return json(res, { items: rows });
    }
    if (req.method === "GET" && id) {
      const row = databaseAvailable ? await getOne("SELECT * FROM navigation_items WHERE id=:id", { id }) : null;
      return row ? json(res, row) : json(res, { error: "not_found" }, 404);
    }
    if (req.method === "POST" && !id) {
      const payload = normalizeNavigationPayload(await readAdminObject(req));
      const result = await query(`INSERT INTO navigation_items(label, href, icon, placement, visible, sort_order, created_at, updated_at)
        VALUES(:label, :href, :icon, :placement, :visible, :sort_order, NOW(), NOW())`, payload);
      const row = await getOne("SELECT * FROM navigation_items WHERE id=:id", { id: result.insertId });
      await cacheDel(publicCmsCacheKeys());
      await recordSettingVersion(`navigation-${row.placement}`, row, user, "navigation-create");
      await writeAuditLog(req, user, "create", "navigation-item", row.id, null, row);
      return json(res, row, 201);
    }
    if (req.method === "PUT" && id) {
      const current = await getOne("SELECT * FROM navigation_items WHERE id=:id", { id });
      if (!current) return json(res, { error: "not_found" }, 404);
      const payload = { ...normalizeNavigationPayload(await readAdminObject(req), current), id };
      await query(`UPDATE navigation_items SET label=:label, href=:href, icon=:icon, placement=:placement,
        visible=:visible, sort_order=:sort_order, updated_at=NOW() WHERE id=:id`, payload);
      const row = await getOne("SELECT * FROM navigation_items WHERE id=:id", { id });
      await cacheDel(publicCmsCacheKeys());
      await recordSettingVersion(`navigation-${row.placement}`, row, user, "navigation-update");
      await writeAuditLog(req, user, "update", "navigation-item", id, current, row);
      return json(res, row);
    }
    if (req.method === "DELETE" && id) {
      const current = await getOne("SELECT * FROM navigation_items WHERE id=:id", { id });
      if (current) {
        await query("UPDATE navigation_items SET visible=0, updated_at=NOW() WHERE id=:id", { id });
        const row = await getOne("SELECT * FROM navigation_items WHERE id=:id", { id });
        await cacheDel(publicCmsCacheKeys());
        await recordSettingVersion(`navigation-${row.placement}`, row, user, "navigation-hide");
        await writeAuditLog(req, user, "hide", "navigation-item", id, current, row);
      }
      return json(res, { ok: true });
    }
  }

  if (resource === "setting-versions") {
    if (req.method === "GET" && !id) {
      return json(res, await listSettingVersions({
        scope: url.searchParams.get("scope") || "",
        limit: url.searchParams.get("limit") || 80
      }));
    }
    if (req.method === "GET" && id) {
      const version = await getSettingVersion(id);
      return version ? json(res, { ...version, payload: parseJsonObject(version.payload_json, {}) }) : json(res, { error: "not_found" }, 404);
    }
    if (req.method === "POST" && id && action === "restore") {
      const result = await restoreSettingVersion(req, user, await getSettingVersion(id));
      if (result.error) return json(res, result, result.error === "not_found" ? 404 : 400);
      return json(res, result);
    }
  }

  if (resource === "content-versions") {
    if (req.method === "GET" && !id) {
      return json(res, await listContentVersions({
        resourceType: url.searchParams.get("resource") || url.searchParams.get("resourceType") || "",
        resourceId: url.searchParams.get("id") || url.searchParams.get("resourceId") || "",
        limit: url.searchParams.get("limit") || 120
      }));
    }
    if (req.method === "GET" && id) {
      const version = await getContentVersion(id);
      return version ? json(res, { ...version, payload: parseJsonObject(version.payload_json, {}) }) : json(res, { error: "not_found" }, 404);
    }
    if (req.method === "POST" && id && action === "restore") {
      const result = await restoreContentVersion(req, user, await getContentVersion(id));
      if (result.error) return json(res, result, result.error === "not_found" ? 404 : 400);
      return json(res, result);
    }
  }

  if (resource === "media-assets") {
    if (req.method === "GET") {
      return json(res, await listMediaAssets({
        limit: url.searchParams.get("limit") || 120,
        orphan: ["1", "true", "yes"].includes(String(url.searchParams.get("orphan") || "").toLowerCase()),
        includeDeleted: ["1", "true", "yes"].includes(String(url.searchParams.get("includeDeleted") || "").toLowerCase())
      }));
    }
    if (req.method === "POST" && parts[3] === "rescan") {
      const result = await rebuildAttachmentRefs();
      await writeAuditLog(req, user, "rescan", "media-asset", "attachment-refs", null, result);
      return json(res, result);
    }
    if (req.method === "DELETE" && id) {
      const result = await deleteMediaAsset(id, {
        purgeFile: ["1", "true", "yes"].includes(String(url.searchParams.get("purge") || "").toLowerCase())
      });
      if (result.error) return json(res, result, result.error === "not_found" ? 404 : 409);
      await writeAuditLog(req, user, "delete", "media-asset", id, result.asset, { deleted_at: true, purged: result.purged });
      return json(res, result);
    }
  }

  if (resource === "search-sync-jobs" && req.method === "GET") {
    return json(res, await listSearchSyncJobs(url.searchParams.get("limit") || 50));
  }

  if (resource === "backup-jobs") {
    if (req.method === "GET" && id && action === "download") {
      const job = await getBackupJob(id);
      if (!job) return json(res, { error: "not_found", message: "没有找到这个备份任务。" }, 404);
      return sendBackupArtifact(req, res, job);
    }
    if (req.method === "GET") return json(res, await listBackupJobs(url.searchParams.get("limit") || 50));
    if (req.method === "POST" && id && action === "restore") {
      try {
        const result = await restoreBackupJob(req, user, id, await readAdminObject(req));
        if (result.error) return json(res, result, result.error === "not_found" || result.error === "artifact_missing" ? 404 : 400);
        return json(res, result);
      } catch (error) {
        return json(res, { error: "restore_failed", message: error.message || "备份恢复失败" }, 500);
      }
    }
    if (req.method === "POST") {
      const body = await readAdminObject(req);
      if (body.execute === false || body.status === "planned") {
        const job = await recordBackupJob("planned", body.scope || "database", body.message || "后台手动登记备份计划", body.artifactPath || body.artifact_path || "", user);
        await writeAuditLog(req, user, "create", "backup-job", job?.id || "local-preview", null, job || body);
        return json(res, job || { ok: true, source: "local-preview" }, 201);
      }
      const result = await runBackupJob(req, user, body.scope || "database", body.message || "后台手动创建 JSON 备份");
      if (result.error) return json(res, result, result.error === "database_unavailable" ? 503 : 500);
      return json(res, result, 201);
    }
  }

  if (resource === "posts") {
    if (req.method === "GET" && !id) {
      return json(res, { items: await listAdminContentRows(resource, url) });
    }
    if (req.method === "GET" && id) {
      const post = await getAdminPost(id);
      return post ? json(res, post) : json(res, { error: "not_found" }, 404);
    }
    if (req.method === "POST" && !id) {
      const payload = normalizePostPayload(await readAdminObject(req));
      if (!payload.content_md.trim()) return json(res, { error: "content_required", message: "正文不能为空" }, 400);
      try {
        const result = await query(`INSERT INTO posts(title,slug,summary,content_md,cover_url,status,published_at,created_at,updated_at)
          VALUES(:title,:slug,:summary,:content_md,:cover_url,:status,IF(:status='published',NOW(),NULL),NOW(),NOW())`, payload);
        await cacheDel("site:overview");
        if (payload.status === "published") await syncSearchIndex();
        const post = await getAdminPost(result.insertId);
        await refreshAttachmentRefsForResource("post", post.id, { cover_url: post.cover_url, content_md: post.content_md });
        await recordContentVersion("post", post.id, post, user, "create");
        await writeAuditLog(req, user, "create", "post", post?.id, null, post);
        return json(res, post, 201);
      } catch (error) {
        if (error.errno === 1062) return json(res, { error: "duplicate_slug", message: "Slug 已被占用" }, 409);
        throw error;
      }
    }
    if (req.method === "PUT" && id) {
      const current = await getAdminPost(id);
      if (!current) return json(res, { error: "not_found" }, 404);
      const payload = { ...normalizePostPayload(await readAdminObject(req), current), id };
      if (!payload.content_md.trim()) return json(res, { error: "content_required", message: "正文不能为空" }, 400);
      try {
        await query(`UPDATE posts SET title=:title, slug=:slug, summary=:summary, content_md=:content_md,
          cover_url=:cover_url, status=:status,
          published_at=CASE WHEN :status='published' AND published_at IS NULL THEN NOW() ELSE published_at END,
          updated_at=NOW()
          WHERE id=:id`, payload);
        await cacheDel("site:overview");
        await syncSearchIndex();
        const post = await getAdminPost(id);
        await refreshAttachmentRefsForResource("post", post.id, { cover_url: post.cover_url, content_md: post.content_md });
        await recordContentVersion("post", id, post, user, "update");
        await writeAuditLog(req, user, "update", "post", id, current, post);
        return json(res, post);
      } catch (error) {
        if (error.errno === 1062) return json(res, { error: "duplicate_slug", message: "Slug 已被占用" }, 409);
        throw error;
      }
    }
    if (req.method === "POST" && id && action === "hide") {
      const current = await getAdminPost(id);
      await query("UPDATE posts SET status='draft', updated_at=NOW() WHERE id=:id", { id });
      await cacheDel("site:overview");
      await syncSearchIndex();
      const hidden = await getAdminPost(id);
      if (hidden) await recordContentVersion("post", id, hidden, user, "hide");
      await writeAuditLog(req, user, "hide", "post", id, current, hidden || { id, status: "draft" });
      return json(res, { ok: true });
    }
    if (req.method === "POST" && id && action === "restore") {
      const current = await getAdminPost(id);
      if (!current) return json(res, { error: "not_found" }, 404);
      const body = await readAdminObject(req);
      const status = cleanStatus(body.status, ["draft", "published"], "draft");
      await query(`UPDATE posts
        SET deleted_at=NULL, status=:status,
          published_at=CASE WHEN :status='published' AND published_at IS NULL THEN NOW() ELSE published_at END,
          updated_at=NOW()
        WHERE id=:id`, { id, status });
      await cacheDel("site:overview");
      await syncSearchIndex();
      const restored = await getAdminPost(id);
      await refreshAttachmentRefsForResource("post", restored.id, { cover_url: restored.cover_url, content_md: restored.content_md });
      await recordContentVersion("post", id, restored, user, "restore");
      await writeAuditLog(req, user, "restore", "post", id, current, restored);
      return json(res, restored);
    }
    if (req.method === "DELETE" && id) {
      const post = await getAdminPost(id);
      if (post) {
        const target = post.slug ? `post:${post.slug}` : "";
        await query("UPDATE posts SET status='draft', deleted_at=COALESCE(deleted_at,NOW()), updated_at=NOW() WHERE id=:id", { id });
        if (target) {
          await deleteCommentsForTarget(target);
        }
        await clearAttachmentRefsForResource("post", id);
        await cacheDel("site:overview");
        await syncSearchIndex();
        const deleted = await getAdminPost(id);
        await recordContentVersion("post", id, deleted, user, "delete");
        await writeAuditLog(req, user, "delete", "post", id, post, deleted);
      }
      return json(res, { ok: true });
    }
  }

  if (resource === "moments") {
    if (req.method === "GET" && !id) {
      return json(res, { items: await listAdminContentRows(resource, url) });
    }
    if (req.method === "POST" && !id) {
      const body = await readAdminObject(req);
      const content = cleanText(body.content, 1000);
      if (!content) return json(res, { error: "content_required", message: "内容不能为空" }, 400);
      const tags = JSON.stringify(tagsFromInput(body.tagText || body.tags));
      const payload = {
        content,
        kind: cleanMomentKind(body.kind, "life"),
        status: cleanStatus(body.status, ["draft", "published"], "published"),
        image_url: cleanText(body.image_url || "", 500),
        tags
      };
      const result = await query(`INSERT INTO moments(content,kind,tags,image_url,status,created_at,updated_at)
        VALUES(:content,:kind,:tags,:image_url,:status,NOW(),NOW())`, payload);
      await cacheDel("site:overview");
      await syncSearchIndex();
      const row = await getOne("SELECT * FROM moments WHERE id=:id", { id: result.insertId });
      const moment = adminMoment(row);
      await refreshAttachmentRefsForResource("moment", moment.id, { image_url: moment.image_url, content: moment.content });
      await recordContentVersion("moment", moment.id, moment, user, "create");
      await writeAuditLog(req, user, "create", "moment", moment?.id, null, moment);
      return json(res, moment, 201);
    }
    if (req.method === "PUT" && id) {
      const current = await getOne("SELECT * FROM moments WHERE id=:id", { id });
      if (!current) return json(res, { error: "not_found" }, 404);
      const body = await readAdminObject(req);
      const nextTags = body.tagText !== undefined || body.tags !== undefined
        ? tagsFromInput(body.tagText || body.tags)
        : parseTags(current.tags);
      const payload = {
        id,
        content: cleanText(body.content || current.content, 1000),
        kind: cleanMomentKind(body.kind, current.kind),
        status: cleanStatus(body.status, ["draft", "published"], current.status),
        image_url: cleanText(body.image_url || current.image_url || "", 500),
        tags: JSON.stringify(nextTags)
      };
      await query("UPDATE moments SET content=:content, kind=:kind, tags=:tags, image_url=:image_url, status=:status, updated_at=NOW() WHERE id=:id", payload);
      await cacheDel("site:overview");
      await syncSearchIndex();
      const row = await getOne("SELECT * FROM moments WHERE id=:id", { id });
      const moment = adminMoment(row);
      await refreshAttachmentRefsForResource("moment", moment.id, { image_url: moment.image_url, content: moment.content });
      await recordContentVersion("moment", id, moment, user, "update");
      await writeAuditLog(req, user, "update", "moment", id, adminMoment(current), moment);
      return json(res, moment);
    }
    if (req.method === "POST" && id && action === "hide") {
      const current = await getOne("SELECT * FROM moments WHERE id=:id", { id });
      await query("UPDATE moments SET status='draft', updated_at=NOW() WHERE id=:id", { id });
      await cacheDel("site:overview");
      await syncSearchIndex();
      if (current) await refreshAttachmentRefsForResource("moment", id, { image_url: current.image_url, content: current.content });
      const hidden = adminMoment(await getOne("SELECT * FROM moments WHERE id=:id", { id }));
      await recordContentVersion("moment", id, hidden, user, "hide");
      await writeAuditLog(req, user, "hide", "moment", id, current ? adminMoment(current) : null, hidden);
      return json(res, { ok: true });
    }
    if (req.method === "POST" && id && action === "restore") {
      const current = await getOne("SELECT * FROM moments WHERE id=:id", { id });
      if (!current) return json(res, { error: "not_found" }, 404);
      const body = await readAdminObject(req);
      const status = cleanStatus(body.status, ["draft", "published"], "draft");
      await query("UPDATE moments SET deleted_at=NULL, status=:status, updated_at=NOW() WHERE id=:id", { id, status });
      await cacheDel("site:overview");
      await syncSearchIndex();
      const restored = adminMoment(await getOne("SELECT * FROM moments WHERE id=:id", { id }));
      await refreshAttachmentRefsForResource("moment", restored.id, { image_url: restored.image_url, content: restored.content });
      await recordContentVersion("moment", id, restored, user, "restore");
      await writeAuditLog(req, user, "restore", "moment", id, adminMoment(current), restored);
      return json(res, restored);
    }
    if (req.method === "DELETE" && id) {
      const current = await getOne("SELECT * FROM moments WHERE id=:id", { id });
      await query("UPDATE moments SET status='draft', deleted_at=COALESCE(deleted_at,NOW()), updated_at=NOW() WHERE id=:id", { id });
      await cacheDel("site:overview");
      await syncSearchIndex();
      await clearAttachmentRefsForResource("moment", id);
      const deleted = adminMoment(await getOne("SELECT * FROM moments WHERE id=:id", { id }));
      await recordContentVersion("moment", id, deleted, user, "delete");
      await writeAuditLog(req, user, "delete", "moment", id, current ? adminMoment(current) : null, deleted);
      return json(res, { ok: true });
    }
  }

  if (resource === "projects") {
    if (req.method === "GET" && !id) {
      return json(res, { items: await listAdminContentRows(resource, url) });
    }
    if (req.method === "GET" && id) {
      const project = await getAdminProject(id);
      return project ? json(res, publicProject(project)) : json(res, { error: "not_found" }, 404);
    }
    if (req.method === "POST" && !id) {
      let payload = normalizeProjectPayload(await readAdminObject(req));
      if (!payload.content_md.trim()) return json(res, { error: "content_required", message: "content required" }, 400);
      try {
        payload = { ...payload, ...await projectAiSummaryFields(payload) };
        const result = await query(`INSERT INTO projects
          (name, slug, summary, status_text, progress, last_update, status, sort_order, content_md, cover_url, ai_summary, ai_summary_source_hash, ai_summary_updated_at, ai_summary_error, created_at, updated_at)
          VALUES(:name, :slug, :summary, :status_text, :progress, :last_update, :status, :sort_order, :content_md, :cover_url, :ai_summary, :ai_summary_source_hash, NOW(), :ai_summary_error, NOW(), NOW())`, payload);
        await cacheDel("site:overview");
        await syncSearchIndex();
        const project = publicProject(await getAdminProject(result.insertId));
        await refreshAttachmentRefsForResource("project", project.id, { cover_url: project.cover_url, content_md: project.content_md, summary: project.summary, status_text: project.status_text });
        await recordContentVersion("project", project.id, project, user, "create");
        await writeAuditLog(req, user, "create", "project", project?.id, null, project);
        return json(res, project, 201);
      } catch (error) {
        if (error.errno === 1062) return json(res, { error: "duplicate_slug", message: "duplicate slug" }, 409);
        throw error;
      }
    }
    if (req.method === "PUT" && id) {
      const current = await getAdminProject(id);
      if (!current) return json(res, { error: "not_found" }, 404);
      let payload = { ...normalizeProjectPayload(await readAdminObject(req), current), id };
      if (!payload.content_md.trim()) return json(res, { error: "content_required", message: "content required" }, 400);
      try {
        payload = { ...payload, ...await projectAiSummaryFields(payload, current) };
        await query(`UPDATE projects
          SET name=:name, slug=:slug, summary=:summary, status_text=:status_text, progress=:progress,
            last_update=:last_update, status=:status, sort_order=:sort_order, content_md=:content_md,
            cover_url=:cover_url, ai_summary_updated_at=CASE WHEN COALESCE(ai_summary_source_hash,'')<>:ai_summary_source_hash OR COALESCE(ai_summary,'')<>:ai_summary THEN NOW() ELSE ai_summary_updated_at END,
            ai_summary=:ai_summary, ai_summary_source_hash=:ai_summary_source_hash,
            ai_summary_error=:ai_summary_error, updated_at=NOW()
          WHERE id=:id`, payload);
        await cacheDel("site:overview");
        await syncSearchIndex();
        const project = publicProject(await getAdminProject(id));
        await refreshAttachmentRefsForResource("project", project.id, { cover_url: project.cover_url, content_md: project.content_md, summary: project.summary, status_text: project.status_text });
        await recordContentVersion("project", id, project, user, "update");
        await writeAuditLog(req, user, "update", "project", id, publicProject(current), project);
        return json(res, project);
      } catch (error) {
        if (error.errno === 1062) return json(res, { error: "duplicate_slug", message: "duplicate slug" }, 409);
        throw error;
      }
    }
    if (req.method === "POST" && id && action === "hide") {
      const current = await getAdminProject(id);
      await query("UPDATE projects SET status='archived', updated_at=NOW() WHERE id=:id", { id });
      await cacheDel("site:overview");
      await syncSearchIndex();
      if (current) await refreshAttachmentRefsForResource("project", id, { cover_url: current.cover_url, content_md: current.content_md, summary: current.summary, status_text: current.status_text });
      const hidden = publicProject(await getAdminProject(id));
      await recordContentVersion("project", id, hidden, user, "hide");
      await writeAuditLog(req, user, "hide", "project", id, current ? publicProject(current) : null, hidden);
      return json(res, { ok: true });
    }
    if (req.method === "POST" && id && action === "restore") {
      const current = await getAdminProject(id);
      if (!current) return json(res, { error: "not_found" }, 404);
      const body = await readAdminObject(req);
      const status = cleanStatus(body.status, ["active", "archived"], "active");
      await query("UPDATE projects SET deleted_at=NULL, status=:status, updated_at=NOW() WHERE id=:id", { id, status });
      await cacheDel("site:overview");
      await syncSearchIndex();
      const restored = publicProject(await getAdminProject(id));
      await refreshAttachmentRefsForResource("project", restored.id, { cover_url: restored.cover_url, content_md: restored.content_md, summary: restored.summary, status_text: restored.status_text });
      await recordContentVersion("project", id, restored, user, "restore");
      await writeAuditLog(req, user, "restore", "project", id, publicProject(current), restored);
      return json(res, restored);
    }
    if (req.method === "DELETE" && id) {
      const project = await getAdminProject(id);
      if (project) {
        const target = `project:${project.id}`;
        await deleteCommentsForTarget(target);
        await query("UPDATE projects SET status='archived', deleted_at=COALESCE(deleted_at,NOW()), updated_at=NOW() WHERE id=:id", { id });
        await cacheDel("site:overview");
        await syncSearchIndex();
        await clearAttachmentRefsForResource("project", id);
        const deleted = publicProject(await getAdminProject(id));
        await recordContentVersion("project", id, deleted, user, "delete");
        await writeAuditLog(req, user, "delete", "project", id, publicProject(project), deleted);
      }
      return json(res, { ok: true });
    }
  }

  if (resource === "interviews") {
    if (req.method === "GET" && !id) {
      return json(res, { items: await listAdminContentRows(resource, url) });
    }
    if (req.method === "GET" && id) {
      const item = await getAdminInterview(id);
      return item ? json(res, publicInterview(item)) : json(res, { error: "not_found" }, 404);
    }
    if (req.method === "POST" && !id) {
      const payload = normalizeInterviewPayload(await readAdminObject(req));
      if (!payload.content_md.trim()) return json(res, { error: "content_required", message: "Markdown 正文不能为空" }, 400);
      try {
        const result = await query(`INSERT INTO interview_items
          (title, slug, section, summary, content_md, difficulty, tags, question_count, finished_count, status, sort_order, created_at, updated_at)
          VALUES(:title, :slug, :section, :summary, :content_md, :difficulty, :tags, :question_count, :finished_count, :status, :sort_order, NOW(), NOW())`, payload);
        await cacheDel("site:overview");
        await syncSearchIndex();
        const interview = publicInterview(await getAdminInterview(result.insertId));
        await refreshAttachmentRefsForResource("interview", interview.id, { content_md: interview.content_md, summary: interview.summary });
        await recordContentVersion("interview", interview.id, interview, user, "create");
        await writeAuditLog(req, user, "create", "interview", interview?.id, null, interview);
        return json(res, interview, 201);
      } catch (error) {
        if (error.errno === 1062) return json(res, { error: "duplicate_slug", message: "Slug 已被占用" }, 409);
        throw error;
      }
    }
    if (req.method === "PUT" && id) {
      const current = await getAdminInterview(id);
      if (!current) return json(res, { error: "not_found" }, 404);
      const payload = { ...normalizeInterviewPayload(await readAdminObject(req), current), id };
      if (!payload.content_md.trim()) return json(res, { error: "content_required", message: "Markdown 正文不能为空" }, 400);
      try {
        await query(`UPDATE interview_items
          SET title=:title, slug=:slug, section=:section, summary=:summary, content_md=:content_md,
            difficulty=:difficulty, tags=:tags, question_count=:question_count, finished_count=:finished_count,
            status=:status, sort_order=:sort_order, updated_at=NOW()
          WHERE id=:id`, payload);
        await cacheDel("site:overview");
        await syncSearchIndex();
        const interview = publicInterview(await getAdminInterview(id));
        await refreshAttachmentRefsForResource("interview", interview.id, { content_md: interview.content_md, summary: interview.summary });
        await recordContentVersion("interview", id, interview, user, "update");
        await writeAuditLog(req, user, "update", "interview", id, publicInterview(current), interview);
        return json(res, interview);
      } catch (error) {
        if (error.errno === 1062) return json(res, { error: "duplicate_slug", message: "Slug 已被占用" }, 409);
        throw error;
      }
    }
    if (req.method === "POST" && id && action === "hide") {
      const current = await getAdminInterview(id);
      await query("UPDATE interview_items SET status='draft', updated_at=NOW() WHERE id=:id", { id });
      await cacheDel("site:overview");
      await syncSearchIndex();
      if (current) await refreshAttachmentRefsForResource("interview", id, { content_md: current.content_md, summary: current.summary });
      const hidden = publicInterview(await getAdminInterview(id));
      await recordContentVersion("interview", id, hidden, user, "hide");
      await writeAuditLog(req, user, "hide", "interview", id, current ? publicInterview(current) : null, hidden);
      return json(res, { ok: true });
    }
    if (req.method === "POST" && id && action === "restore") {
      const current = await getAdminInterview(id);
      if (!current) return json(res, { error: "not_found" }, 404);
      const body = await readAdminObject(req);
      const status = cleanStatus(body.status, ["draft", "published"], "draft");
      await query("UPDATE interview_items SET deleted_at=NULL, status=:status, updated_at=NOW() WHERE id=:id", { id, status });
      await cacheDel("site:overview");
      await syncSearchIndex();
      const restored = publicInterview(await getAdminInterview(id));
      await refreshAttachmentRefsForResource("interview", restored.id, { content_md: restored.content_md, summary: restored.summary });
      await recordContentVersion("interview", id, restored, user, "restore");
      await writeAuditLog(req, user, "restore", "interview", id, publicInterview(current), restored);
      return json(res, restored);
    }
    if (req.method === "DELETE" && id) {
      const item = await getAdminInterview(id);
      if (item) {
        const target = `interview:${item.id}`;
        await deleteCommentsForTarget(target);
        await query("UPDATE interview_items SET status='draft', deleted_at=COALESCE(deleted_at,NOW()), updated_at=NOW() WHERE id=:id", { id });
        await cacheDel("site:overview");
        await syncSearchIndex();
        await clearAttachmentRefsForResource("interview", id);
        const deleted = publicInterview(await getAdminInterview(id));
        await recordContentVersion("interview", id, deleted, user, "delete");
        await writeAuditLog(req, user, "delete", "interview", id, publicInterview(item), deleted);
      }
      return json(res, { ok: true });
    }
  }

  if (resource === "comments") {
    if (req.method === "GET" && !id) {
      return json(res, { items: await listAdminContentRows(resource, url) });
    }
    if (req.method === "GET" && id) {
      const row = await getOne(`SELECT c.id, c.target, c.author_name, c.author_email, c.content,
          c.status, c.moderation_reason, c.ip_hash, c.user_agent_hash, c.reviewed_at,
          c.created_at, c.deleted_at, COALESCE(r.count, 0) AS likes
        FROM comments c
        LEFT JOIN reactions r ON r.target=CONCAT('comment:', c.id) AND r.kind='like'
        WHERE c.id=:id`, { id });
      return row ? json(res, row) : json(res, { error: "not_found" }, 404);
    }
    if (req.method === "PUT" && id) {
      const current = await getOne("SELECT * FROM comments WHERE id=:id", { id });
      if (!current) return json(res, { error: "not_found" }, 404);
      const body = await readAdminObject(req);
      const payload = {
        id,
        status: cleanStatus(body.status, ["pending", "published", "hidden"], current.status),
        author_name: cleanText(body.author_name || current.author_name || "路过的人", 80),
        content: cleanText(body.content || current.content, 800),
        moderation_reason: cleanText(body.moderation_reason ?? current.moderation_reason ?? "", 255)
      };
      if (payload.content.length < 2) return json(res, { error: "content_too_short", message: "留言内容太短" }, 400);
      await query(`UPDATE comments
        SET status=:status, author_name=:author_name, content=:content, moderation_reason=:moderation_reason,
          reviewed_at=CASE WHEN :status='pending' THEN reviewed_at ELSE NOW() END
        WHERE id=:id`, payload);
      const row = await getOne(`SELECT c.id, c.target, c.author_name, c.author_email, c.content,
          c.status, c.moderation_reason, c.ip_hash, c.user_agent_hash, c.reviewed_at,
          c.created_at, c.deleted_at, COALESCE(r.count, 0) AS likes
        FROM comments c
        LEFT JOIN reactions r ON r.target=CONCAT('comment:', c.id) AND r.kind='like'
        WHERE c.id=:id`, { id });
      await writeAuditLog(req, user, "update", "comment", id, current, row);
      return json(res, row);
    }
    if (req.method === "POST" && id && ["publish", "hide"].includes(action)) {
      const status = action === "publish" ? "published" : "hidden";
      const current = await getOne("SELECT * FROM comments WHERE id=:id", { id });
      await query("UPDATE comments SET status=:status, reviewed_at=NOW() WHERE id=:id", { id, status });
      await writeAuditLog(req, user, action, "comment", id, current, { id, status });
      return json(res, { ok: true });
    }
    if (req.method === "POST" && id && action === "restore") {
      const current = await getOne("SELECT * FROM comments WHERE id=:id", { id });
      if (!current) return json(res, { error: "not_found" }, 404);
      const body = await readAdminObject(req);
      const status = cleanStatus(body.status, ["pending", "published", "hidden"], "pending");
      await query(`UPDATE comments
        SET deleted_at=NULL, status=:status, reviewed_at=CASE WHEN :status='pending' THEN NULL ELSE NOW() END
        WHERE id=:id`, { id, status });
      const row = await getOne(`SELECT c.id, c.target, c.author_name, c.author_email, c.content,
          c.status, c.moderation_reason, c.ip_hash, c.user_agent_hash, c.reviewed_at,
          c.created_at, c.deleted_at, COALESCE(r.count, 0) AS likes
        FROM comments c
        LEFT JOIN reactions r ON r.target=CONCAT('comment:', c.id) AND r.kind='like'
        WHERE c.id=:id`, { id });
      await writeAuditLog(req, user, "restore", "comment", id, current, row);
      return json(res, row);
    }
    if (req.method === "DELETE" && id) {
      const current = await getOne("SELECT * FROM comments WHERE id=:id", { id });
      await query("UPDATE comments SET status='hidden', deleted_at=COALESCE(deleted_at,NOW()) WHERE id=:id", { id });
      await writeAuditLog(req, user, "delete", "comment", id, current, await getOne("SELECT * FROM comments WHERE id=:id", { id }));
      return json(res, { ok: true });
    }
  }

  if (resource === "site-texts") {
    if (req.method === "GET") return json(res, await adminSiteTextsPayload());
    if (req.method === "PUT") {
      const body = await readAdminObject(req);
      const before = await adminSiteTextsPayload();
      const incomingTexts = body.texts && typeof body.texts === "object" ? body.texts : {};
      for (const item of frontendTextDefaults) {
        const value = String(normalizeFrontendTextValue(item.key, incomingTexts[item.key] ?? item.defaultValue)).slice(0, 1200);
        await setSetting(`site_text.${item.key}`, value);
      }
      await setSetting(footerSettingKey, JSON.stringify(normalizeFooterSections(body.footerSections)));
      if (body.layout) await setSetting(frontendLayoutSettingKey, JSON.stringify(normalizeFrontendLayout(body.layout)));
      if (body.ui) await setSetting(frontendUiSettingKey, JSON.stringify(normalizeFrontendUi(body.ui)));
      await setSetting("site_text_rules", String(body.rules || "").slice(0, 10000));
      await cacheDel("site:texts");
      const after = await adminSiteTextsPayload();
      await recordSettingVersion("site-texts", after, user, "site-texts-save");
      await writeAuditLog(req, user, "update", "site-texts", "global", before, after);
      return json(res, after);
    }
  }

  if (resource === "about-gallery") {
    if (req.method === "GET") return json(res, await adminAboutGalleryPayload());
    if (req.method === "PUT") {
      const body = await readAdminObject(req);
      const before = await adminAboutGalleryPayload();
      const currentUi = await getFrontendUi();
      const incomingImages = Array.isArray(body.items) ? body.items : body.aboutGalleryImages;
      const nextUi = normalizeFrontendUi({ ...currentUi, aboutGalleryImages: incomingImages || [] });
      await snapshotFrontendEditor("about-gallery-save");
      await setSetting(frontendUiSettingKey, JSON.stringify(nextUi));
      await cacheDel("site:texts");
      const after = await adminAboutGalleryPayload();
      await recordSettingVersion("about-gallery", after, user, "about-gallery-save");
      await writeAuditLog(req, user, "update", "about-gallery", "global", before, after);
      return json(res, after);
    }
  }

  if (resource === "frontend-layout") {
    if (req.method === "GET") return json(res, await adminFrontendLayoutPayload());
    if (req.method === "PUT") {
      const body = await readAdminObject(req);
      const before = await adminFrontendLayoutPayload();
      const layout = normalizeFrontendLayout(body.layout || body);
      await setSetting(frontendLayoutSettingKey, JSON.stringify(layout));
      if (body.ui) await setSetting(frontendUiSettingKey, JSON.stringify(normalizeFrontendUi(body.ui)));
      await cacheDel("site:texts");
      const after = await adminFrontendLayoutPayload();
      await recordSettingVersion("frontend-layout", after, user, "frontend-layout-save");
      await writeAuditLog(req, user, "update", "frontend-layout", "global", before, after);
      return json(res, after);
    }
  }

  if (resource === "frontend-editor") {
    if (req.method === "GET") return json(res, await adminFrontendEditorPayload());
    if (parts[3] === "draft") {
      if (req.method === "PUT") {
        const body = await readAdminObject(req);
        const draft = await setFrontendEditorDraft(body.payload || body);
        await writeAuditLog(req, user, "save-draft", "frontend-editor", "draft", null, draft.payload);
        return json(res, { ok: true, draft: { savedAt: draft.savedAt, payload: draft.payload } });
      }
      if (req.method === "DELETE") {
        await clearFrontendEditorDraft();
        await writeAuditLog(req, user, "delete-draft", "frontend-editor", "draft", null, null);
        return json(res, { ok: true });
      }
    }
    if (req.method === "POST" && parts[3] === "publish") {
      const body = await readAdminObject(req);
      const draft = body.payload ? null : await getFrontendEditorDraft();
      const published = await publishFrontendEditorPayload(body.payload || draft?.payload || body, "frontend-editor-publish", user);
      await clearFrontendEditorDraft();
      await writeAuditLog(req, user, "publish", "frontend-editor", "global", draft?.payload || null, published);
      return json(res, await adminFrontendEditorPayload());
    }
    if (req.method === "POST" && parts[3] === "restore") {
      const backup = await getFrontendEditorBackup();
      if (!backup) return json(res, { error: "backup_not_found", message: "没有找到备份" }, 404);
      for (const item of frontendTextDefaults) {
        await setSetting(`site_text.${item.key}`, String(backup.texts?.[item.key] ?? item.defaultValue).slice(0, 1200));
      }
      await setSetting("site_text_rules", String(backup.rules || "").slice(0, 10000));
      await setSetting(footerSettingKey, JSON.stringify(normalizeFooterSections(backup.footerSections)));
      await setSetting(frontendLayoutSettingKey, JSON.stringify(normalizeFrontendLayout(backup.layout)));
      await setSetting(frontendUiSettingKey, JSON.stringify(normalizeFrontendUi(backup.ui)));
      await cacheDel("site:texts");
      await clearFrontendEditorDraft();
      const restored = normalizeFrontendEditorPayload(backup);
      await recordSettingVersion("frontend-editor", restored, user, "frontend-editor-restore");
      await writeAuditLog(req, user, "restore", "frontend-editor", "global", null, restored);
      return json(res, await adminFrontendEditorPayload());
    }
    if (req.method === "PUT") {
      const body = await readAdminObject(req);
      const saved = await publishFrontendEditorPayload(body.payload || body, "frontend-editor-save", user);
      await clearFrontendEditorDraft();
      await writeAuditLog(req, user, "save", "frontend-editor", "global", null, saved);
      return json(res, await adminFrontendEditorPayload());
    }
  }

  if (resource === "settings") {
    if (req.method === "GET") return json(res, await adminSettingsPayload());
    if (req.method === "PUT") {
      const body = await readAdminObject(req);
      const before = await adminSettingsPayload();
      const after = await saveAdminSettings(body);
      await cacheDel([
        `github:contrib:${before.githubUsername}`,
        `github:contrib:${String(before.githubUsername || "").toLowerCase()}`,
        `github:contrib:${after.githubUsername}`,
        `github:contrib:${after.githubUsername.toLowerCase()}`,
        `github:repos:${before.githubUsername}`,
        `github:repos:${String(before.githubUsername || "").toLowerCase()}`,
        `github:repos:${after.githubUsername}`,
        `github:repos:${after.githubUsername.toLowerCase()}`
      ]);
      refreshGithubContributionsSnapshot(after.githubUsername).catch((error) => console.warn("github refresh after settings save failed", error));
      syncGithubRepositories(req, user, after.githubUsername).catch((error) => console.warn("github repositories sync after settings save failed", error));
      await recordSettingVersion("settings", after, user, "settings-save");
      await writeAuditLog(req, user, "update", "settings", "global", before, after);
      return json(res, after);
    }
  }

  return json(res, { error: "not_found" }, 404);
}

function serveAdminApp(req, res, url) {
  if (!["GET", "HEAD"].includes(req.method)) return false;
  if (url.pathname.startsWith("/admin/assets/")) {
    const file = safeJoin(adminStaticRoot, decodeURIComponent(url.pathname.replace(/^\/admin\//, "")));
    if (file && serveStaticFile(req, res, file, "no-store")) return true;
    json(res, { error: "not_found" }, 404);
    return true;
  }
  if (!fs.existsSync(adminIndexFile)) return false;
  return serveStaticFile(req, res, adminIndexFile, "no-store");
}

async function publicApi(req, res, url) {
  if (url.pathname === "/api/health") return json(res, { ok: true, database: databaseAvailable ? "ready" : "local-preview" });
  if (url.pathname === "/api/quote") return json(res, await withPublicFallback("quote", () => ({ ...fallbackQuotes[0], source: "local-preview" }), fetchQuote));
  if (url.pathname === "/api/moyu") return json(res, await withPublicFallback("moyu", fallbackMoyu, fetchMoyu));
  if (url.pathname === "/api/weather/current") return json(res, await publicWeatherCurrent(req, url).catch((error) => fallbackWeatherCurrent(error)));
  if (url.pathname === "/api/music/ddv" || url.pathname === "/api/music/breakup") {
    const limit = Math.min(8, Math.max(1, Number(url.searchParams.get("limit")) || 5));
    return json(res, await dailyApiSnapshotPayload(
      `music:ddv:${limit}`,
      () => fetchBreakupMusicRecommendations(limit),
      (error) => breakupMusicFallback(error, limit),
      { cacheAssets: true, source: "ddv-music" }
    ));
  }
  if (url.pathname === "/api/thinking/questions") {
    const limit = Math.min(5, Math.max(1, Number(url.searchParams.get("limit")) || 3));
    return json(res, await dailyApiSnapshotPayload(
      `thinking:questions:${limit}`,
      () => fetchThinkingQuestions(limit),
      () => ({
        items: dailyRotatedItems(thinkingQuestionPool, limit, 17),
        updatedAt: new Date().toISOString(),
        source: "fallback"
      }),
      { source: "thinking-questions" }
    ));
  }
  if (url.pathname === "/api/site/texts") {
    return json(res, await withPublicFallback("site texts", fallbackSiteTextsPayload, async () => {
      const projectKey = projectDetailKeyFromRequest(req, url);
      const cached = projectKey ? null : await cacheGet("site:texts");
      if (cached) return cached;
      const texts = await getFrontendTextMap();
      const rules = parseFrontendTextRules(await getSetting("site_text_rules", ""));
      const footerSections = await getFooterSections();
      const layout = await getFrontendLayout();
      const ui = await getFrontendUi();
      const project = projectKey ? await getPublicProjectDetail(projectKey) : null;
      const payload = { texts: applyProjectAiSummaryTexts(texts, project), rules, footerSections, layout, ui };
      if (!projectKey) await cacheSet("site:texts", payload, 60);
      return payload;
    }));
  }
  if (url.pathname === "/api/site/cms") {
    const pageKey = cleanKey(url.searchParams.get("page") || "", "");
    return json(res, await withPublicFallback("site cms", () => ({
      pageBlocks: [],
      navigationItems: [],
      themeSettings: [],
      source: "local-preview"
    }), async () => {
      const cacheKey = `site:cms:${pageKey || "all"}`;
      const cached = await cacheGet(cacheKey);
      if (cached) return cached;
      const params = pageKey ? { page_key: pageKey } : {};
      const blocks = await query(`SELECT * FROM page_blocks
        WHERE status='published' ${pageKey ? "AND page_key=:page_key" : ""}
        ORDER BY page_key ASC, sort_order ASC, id ASC LIMIT 240`, params);
      const navigationItems = await query(`SELECT id, label, href, icon, placement, visible, sort_order
        FROM navigation_items WHERE visible=1 ORDER BY placement ASC, sort_order ASC, id ASC LIMIT 160`);
      const themeSettings = await query(`SELECT * FROM theme_settings WHERE status='published' ORDER BY updated_at DESC, id DESC LIMIT 40`);
      const payload = {
        pageBlocks: blocks.map(pageBlockFromRow),
        navigationItems,
        themeSettings: themeSettings.map(themeSettingFromRow)
      };
      await cacheSet(cacheKey, payload, 60);
      return payload;
    }));
  }
  if (url.pathname === "/api/github/contributions") {
    const configuredUsername = await withPublicFallback("github setting", config.github.username || "jlemonz", () => getSetting("github_username", config.github.username || "jlemonz"));
    return json(res, await withPublicFallback("github contributions", () => fallbackGithubContributions(configuredUsername || "jlemonz"), () => fetchGithubContributions(configuredUsername)));
  }
  if (url.pathname === "/api/github/repositories") {
    const configuredUsername = await withPublicFallback("github setting", config.github.username || "jlemonz", () => getSetting("github_username", config.github.username || "jlemonz"));
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 12));
    return json(res, await withPublicFallback("github repositories", () => ({ username: configuredUsername || "jlemonz", items: [], source: "local-preview" }), async () => {
      const payload = await listGithubRepositories(configuredUsername, limit);
      return { username: payload.username, items: payload.items || [] };
    }));
  }
  if (url.pathname === "/api/github/trending") {
    const limit = Math.min(8, Math.max(1, Number(url.searchParams.get("limit")) || 5));
    return json(res, await dailyApiSnapshotPayload(
      `github:trending:${limit}`,
      () => fetchGithubTrendingRepositories(limit),
      () => ({ topic: "robotics", items: [], source: "fallback" }),
      { source: "github-trending" }
    ));
  }
  if (url.pathname === "/api/tech/hotspots") {
    const limit = Math.min(10, Math.max(1, Number(url.searchParams.get("limit")) || 6));
    return json(res, await dailyApiSnapshotPayload(
      `tech:hotspots:${limit}`,
      () => fetchTechHotspots(limit),
      (error) => techHotspotFallback(error),
      { source: "tech-hotspots" }
    ));
  }
  if (url.pathname === "/api/anime/daily") {
    const limit = Math.min(4, Math.max(1, Number(url.searchParams.get("limit")) || 2));
    return json(res, await dailyApiSnapshotPayload(
      `anime:daily:${limit}`,
      () => fetchAnimeDailyRecommendations(limit),
      (error) => animeRecommendationFallback(error),
      { cacheAssets: true, source: "anime-daily" }
    ));
  }
  if (url.pathname === "/api/career/events") {
    const limit = Math.min(32, Math.max(4, Number(url.searchParams.get("limit")) || 12));
    const days = Math.min(60, Math.max(7, Number(url.searchParams.get("days")) || 30));
    return json(res, await dailyApiSnapshotPayload(
      `career:events:v6:${days}:${limit}`,
      () => fetchCareerEvents({ limit, days }),
      (error) => careerEventsFallback(error),
      { source: "career-events" }
    ));
  }
  if (url.pathname === "/api/reactions/batch" && ["GET", "POST"].includes(req.method)) {
    const body = req.method === "POST" ? await readBody(req) : {};
    const targets = normalizeReactionTargets(body.targets || url.searchParams.get("targets"));
    return json(res, await withPublicFallback("reactions batch", () => fallbackReactionBatch(targets), async () => {
      if (!targets.length) return { items: [] };
      const targetParams = Object.fromEntries(targets.map((target, index) => [`target${index}`, target]));
      const targetSql = targets.map((_, index) => `:target${index}`).join(",");
      const likesRows = await query(`SELECT target, count FROM reactions WHERE kind='like' AND target IN (${targetSql})`, targetParams);
      const likeMap = new Map(likesRows.map((row) => [row.target, Number(row.count || 0)]));
      const eventParams = {};
      const eventSql = targets.map((target, index) => {
        eventParams[`target${index}`] = target;
        eventParams[`actor${index}`] = reactionActorHash(req, target, "like");
        return `(target=:target${index} AND actor_hash=:actor${index})`;
      }).join(" OR ");
      const eventRows = await query(`SELECT target FROM reaction_events WHERE kind='like' AND (${eventSql})`, eventParams);
      const reacted = new Set(eventRows.map((row) => row.target));
      return {
        items: targets.map((target) => ({
          target,
          likes: likeMap.get(target) || 0,
          reacted: reacted.has(target)
        }))
      };
    }));
  }
  if (url.pathname === "/api/reactions") {
    const target = cleanText(url.searchParams.get("target") || "site-home", 160);
    return json(res, await withPublicFallback("reactions", () => fallbackReaction(target), async () => {
      const actor_hash = reactionActorHash(req, target, "like");
      const [row, event] = await Promise.all([
        getOne("SELECT count FROM reactions WHERE target=:target AND kind='like'", { target }),
        getOne("SELECT id FROM reaction_events WHERE target=:target AND kind='like' AND actor_hash=:actor_hash LIMIT 1", { target, actor_hash })
      ]);
      return { target, likes: row?.count || 0, reacted: Boolean(event) };
    }));
  }
  if (url.pathname === "/api/reactions/like" && req.method === "POST") {
    const body = await readBody(req);
    const target = cleanText(body.target || "site-home", 160);
    return json(res, await withPublicFallback("reaction like", () => fallbackLike(target), async () => {
      const parts = reactionTargetParts(target);
      const actor_hash = reactionActorHash(req, target, "like");
      const user_agent_hash = privacyHash(req.headers["user-agent"] || "");
      const result = await query(`INSERT IGNORE INTO reaction_events(target,target_type,target_id,kind,actor_hash,user_agent_hash,created_at)
        VALUES(:target,:target_type,:target_id,'like',:actor_hash,:user_agent_hash,NOW())`, {
        ...parts,
        actor_hash,
        user_agent_hash
      });
      const counted = Number(result?.affectedRows || 0) > 0;
      if (counted) {
        await query(`INSERT INTO reactions(target,kind,count,updated_at)
          VALUES(:target,'like',1,NOW())
          ON DUPLICATE KEY UPDATE count=count+1, updated_at=NOW()`, { target });
      }
      const row = await getOne("SELECT count FROM reactions WHERE target=:target AND kind='like'", { target });
      return { target, likes: row?.count || 0, counted, reacted: true };
    }));
  }
  if (url.pathname === "/api/comments" && req.method === "GET") {
    const target = cleanText(url.searchParams.get("target") || "site-home", 160);
    return json(res, await withPublicFallback("comments", () => fallbackCommentsForTarget(target), async () => ({ target, items: await publicCommentsForTarget(target) })));
  }
  if (url.pathname === "/api/comments" && req.method === "POST") {
    const body = await readBody(req);
    const target = cleanText(body.target || "site-home", 160);
    const author_name = cleanText(body.author_name || "路过的人", 80);
    const author_email = cleanText(body.author_email || "", 160);
    const content = cleanText(body.content, 800);
      if (content.length < 2) return json(res, { error: "content_too_short" }, 400);
    const limit = await consumePublicRateLimit(req, "comment", 5, 10 * 60);
    if (!limit.allowed) {
      return json(res, { error: "rate_limited", message: "留言太频繁了，稍后再试。", retryAfter: limit.retryAfter }, 429, { "Retry-After": String(limit.retryAfter) });
    }
    const moderation = assessCommentModeration({ authorName: author_name, authorEmail: author_email, content });
    return json(res, await withPublicFallback("add comment", () => fallbackAddComment(target, author_name, content, moderation.status, moderation.reason), async () => {
      const ip_hash = privacyHash(requestIp(req));
      const user_agent_hash = privacyHash(req.headers["user-agent"] || "");
      const result = await query(`INSERT INTO comments(target,author_name,author_email,content,status,moderation_reason,ip_hash,user_agent_hash,created_at)
        VALUES(:target,:author_name,:author_email,:content,:status,:moderation_reason,:ip_hash,:user_agent_hash,NOW())`, {
        target,
        author_name,
        author_email,
        content,
        status: moderation.status,
        moderation_reason: moderation.reason,
        ip_hash,
        user_agent_hash
      });
      return {
        target,
        item: { id: result.insertId, target, author_name, content, status: moderation.status, moderation_reason: moderation.reason },
        items: await publicCommentsForTarget(target),
        pending: moderation.status !== "published",
        message: moderation.status === "published" ? "留言已发布" : "留言已进入审核队列"
      };
    }), 201);
  }
  if (url.pathname === "/api/view-events" && req.method === "POST") {
    const body = await readBody(req);
    const target = cleanText(body.target || "site-home", 160);
    if (!target) return json(res, { error: "target_required" }, 400);
    const limit = await consumePublicRateLimit(req, "view", 80, 10 * 60);
    if (!limit.allowed) {
      return json(res, { error: "rate_limited", message: "访问上报太频繁，已暂时忽略。", retryAfter: limit.retryAfter }, 429, { "Retry-After": String(limit.retryAfter) });
    }
    return json(res, await withPublicFallback("view event", () => ({ ok: true, target, source: "local-preview" }), async () => {
      const fingerprint = clientFingerprint(req);
      const key = `view:${target}:${fingerprint}`;
      const already = await cacheGet(key);
      if (!already) {
        await query(`INSERT INTO view_events(target, fingerprint, user_agent, created_at)
          VALUES(:target, :fingerprint, :user_agent, NOW())`, {
          target,
          fingerprint,
          user_agent: cleanText(req.headers["user-agent"] || "", 255)
        });
        await cacheSet(key, { ok: true }, 30 * 60);
      }
      return { ok: true, target, counted: !already };
    }), 201);
  }
  if (url.pathname === "/api/site/overview") {
    return json(res, await withPublicFallback("site overview", fallbackOverview, async () => {
      const cached = await cacheGet("site:overview");
      if (cached) return cached;
      const [stats] = await query(`
        SELECT
          (SELECT COUNT(*) FROM posts WHERE status='published' AND deleted_at IS NULL) AS posts,
          (SELECT COUNT(*) FROM moments WHERE status='published' AND deleted_at IS NULL) AS moments,
          (SELECT COUNT(*) FROM projects WHERE status='active' AND deleted_at IS NULL) AS projects,
          (SELECT COUNT(*) FROM interview_items WHERE status='published' AND deleted_at IS NULL) AS interviews,
          (SELECT COUNT(*) FROM categories) AS categories
      `);
      const latestMoments = await query("SELECT id, content, kind, tags, image_url, created_at FROM moments WHERE status='published' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 3");
      const data = { stats, latestMoments: latestMoments.map(adminMoment) };
      await cacheSet("site:overview", data, 90);
      return data;
    }));
  }
  if (url.pathname === "/api/posts") {
    const cat = cleanText(url.searchParams.get("cat") || "", 80).toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const params = {};
    const filters = ["p.status='published'", "p.deleted_at IS NULL"];
    if (cat) {
      filters.push("(LOWER(c.slug)=:cat OR LOWER(c.name)=:cat)");
      params.cat = cat;
    }
    return json(res, await withPublicFallback("posts", () => fallbackPostItems(cat), async () => {
      const posts = await query(`
        SELECT p.id, p.title, p.slug, p.summary, p.cover_url, p.published_at, c.name AS category, c.slug AS category_slug
        FROM posts p LEFT JOIN categories c ON c.id=p.category_id
        WHERE ${filters.join(" AND ")}
        ORDER BY p.published_at DESC, p.id DESC
        LIMIT 30
      `, params);
      return { items: posts };
    }));
  }
  if (url.pathname.startsWith("/api/posts/")) {
    const slug = decodeURIComponent(url.pathname.split("/").pop());
    const post = await withPublicFallback("post detail", () => fallbackPostDetail(slug), async () => {
      const current = await getOne(`
        SELECT p.*, c.name AS category
        FROM posts p
        LEFT JOIN categories c ON c.id=p.category_id
        WHERE p.slug=:slug AND p.status='published' AND p.deleted_at IS NULL
        LIMIT 1
      `, { slug });
      if (!current) return null;
      const sortAt = current.published_at || current.created_at || current.updated_at || new Date(0).toISOString();
      const adjacentColumns = `
        SELECT p.id, p.title, p.slug, p.summary, p.cover_url, p.published_at, p.updated_at, c.name AS category
        FROM posts p
        LEFT JOIN categories c ON c.id=p.category_id
        WHERE p.status='published' AND p.deleted_at IS NULL
      `;
      const [previousPost, nextPost] = await Promise.all([
        getOne(`${adjacentColumns}
          AND (COALESCE(p.published_at, p.created_at) < :sortAt
            OR (COALESCE(p.published_at, p.created_at) = :sortAt AND p.id < :id))
          ORDER BY COALESCE(p.published_at, p.created_at) DESC, p.id DESC
          LIMIT 1
        `, { sortAt, id: current.id }),
        getOne(`${adjacentColumns}
          AND (COALESCE(p.published_at, p.created_at) > :sortAt
            OR (COALESCE(p.published_at, p.created_at) = :sortAt AND p.id > :id))
          ORDER BY COALESCE(p.published_at, p.created_at) ASC, p.id ASC
          LIMIT 1
        `, { sortAt, id: current.id })
      ]);
      return { ...current, previousPost: previousPost || null, nextPost: nextPost || null };
    });
    if (!post) return json(res, { error: "not_found" }, 404);
    return json(res, post.content_html ? post : { ...post, content_html: markdownToHtml(post.content_md) });
  }
  if (url.pathname === "/api/moments") {
    const kind = cleanMomentKindFilter(url.searchParams.get("kind"));
    const keyword = cleanText(url.searchParams.get("q") || "", 120);
    return json(res, await withPublicFallback("moments", () => fallbackMomentItems(kind, keyword), async () => {
      const where = ["status='published'", "deleted_at IS NULL"];
      const params = {};
      if (kind) {
        where.push("kind=:kind");
        params.kind = kind;
      }
      if (keyword) {
        where.push("(content LIKE :keyword OR kind LIKE :keyword OR tags LIKE :keyword)");
        params.keyword = `%${keyword}%`;
      }
      const limit = keyword ? 120 : 40;
      const rows = await query(
        `SELECT id, content, kind, tags, image_url, created_at FROM moments WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ${limit}`,
        params
      );
      return { items: rows.map(adminMoment), query: keyword, kind: kind || "all" };
    }));
  }
  if (url.pathname === "/api/projects") {
    return json(res, await withPublicFallback("projects", fallbackProjectItems, async () => {
      const rows = await query("SELECT id, name, slug, summary, status_text, progress, last_update, sort_order, cover_url, ai_summary, created_at, updated_at FROM projects WHERE status='active' AND deleted_at IS NULL ORDER BY sort_order ASC, id ASC");
      return { items: rows.map(publicProject) };
    }));
  }
  if (url.pathname.startsWith("/api/projects/")) {
    const key = decodeURIComponent(url.pathname.split("/").pop());
    const isId = /^\d+$/.test(key);
    const project = await withPublicFallback("project detail", () => fallbackProjectDetail(key), () => getOne(`SELECT ${projectPublicColumns}
        FROM projects WHERE status='active' AND deleted_at IS NULL AND ${isId ? "id=:key" : "slug=:key"} LIMIT 1`, { key }));
    if (!project) return json(res, { error: "not_found" }, 404);
    const content = project.content_md || `# ${project.name}\n\n${project.status_text || ""}\n\n还没有详细记录。`;
    return json(res, project.content_html ? project : { ...publicProject(project), content_html: markdownToHtml(content) });
  }
  if (url.pathname === "/api/interview/plan") return json(res, await publicInterviewPlan(req, url));
  if (url.pathname === "/api/interview/daily") return json(res, await publicInterviewDaily(url));
  if (url.pathname === "/api/interview/calendar") return json(res, await publicInterviewCalendar(req, url));
  if (url.pathname === "/api/interview/bank-rebuild" && req.method === "GET") {
    if (!ensureInterviewGenerationAuth(req)) return json(res, { error: "forbidden", message: "生成口令不正确" }, 403);
    return json(res, { job: await publicInterviewBankRebuildState() });
  }
  if (url.pathname === "/api/interview/bank-rebuild/audit" && req.method === "GET") {
    if (!ensureInterviewGenerationAuth(req)) return json(res, { error: "forbidden", message: "生成口令不正确" }, 403);
    return json(res, await interviewBankRebuildAudit(url.searchParams.get("runId") || url.searchParams.get("run_id") || ""));
  }
  if (url.pathname === "/api/interview/bank-rebuild" && req.method === "POST") {
    if (!ensureInterviewGenerationAuth(req)) return json(res, { error: "forbidden", message: "生成口令不正确" }, 403);
    try {
      return json(res, await startInterviewBankRebuild(req, url), 202);
    } catch (error) {
      return json(res, { error: error.code || "bank_rebuild_failed", message: error.message || "题库重建任务启动失败" }, error.status || 500);
    }
  }
  if (url.pathname === "/api/interview/example-cases/backfill" && req.method === "GET") {
    if (!ensureInterviewGenerationAuth(req)) return json(res, { error: "forbidden", message: "生成口令不正确" }, 403);
    return json(res, { job: publicInterviewExampleBackfillState(), stats: await interviewExampleCaseBackfillStats() });
  }
  if (url.pathname === "/api/interview/example-cases/audit" && req.method === "GET") {
    if (!ensureInterviewGenerationAuth(req)) return json(res, { error: "forbidden", message: "生成口令不正确" }, 403);
    return json(res, await interviewExampleCaseAuditStats());
  }
  if (url.pathname === "/api/interview/example-cases/backfill" && req.method === "POST") {
    if (!ensureInterviewGenerationAuth(req)) return json(res, { error: "forbidden", message: "生成口令不正确" }, 403);
    try {
      return json(res, await startInterviewExampleCaseBackfill(req, url), 202);
    } catch (error) {
      return json(res, { error: error.code || "example_case_backfill_failed", message: error.message || "实例生成任务启动失败" }, error.status || 500);
    }
  }
  if (url.pathname === "/api/interview/generation-batches" && req.method === "POST") {
    if (!ensureInterviewGenerationAuth(req)) return json(res, { error: "forbidden", message: "生成口令不正确" }, 403);
    try {
      return json(res, await createInterviewGenerationBatch(req), 201);
    } catch (error) {
      return json(res, { error: error.code || "interview_generation_failed", message: error.message || "生成失败" }, error.status || 500);
    }
  }
  if (url.pathname === "/api/interview/generation-batches/latest" && req.method === "GET") {
    if (!ensureInterviewGenerationAuth(req)) return json(res, { error: "forbidden", message: "生成口令不正确" }, 403);
    try {
      return json(res, await latestInterviewGenerationBatch(url));
    } catch (error) {
      return json(res, { error: error.code || "interview_generation_failed", message: error.message || "读取最新批次失败" }, error.status || 500);
    }
  }
  const generationBatchMatch = url.pathname.match(/^\/api\/interview\/generation-batches\/(\d+)$/);
  if (generationBatchMatch && req.method === "GET") {
    if (!ensureInterviewGenerationAuth(req)) return json(res, { error: "forbidden", message: "生成口令不正确" }, 403);
    const loaded = await loadInterviewGenerationBatch(generationBatchMatch[1]);
    return loaded ? json(res, publicInterviewGenerationBatch(loaded.batch, loaded.candidates)) : json(res, { error: "not_found" }, 404);
  }
  const generationFillMatch = url.pathname.match(/^\/api\/interview\/generation-batches\/(\d+)\/fill$/);
  if (generationFillMatch && req.method === "POST") {
    if (!ensureInterviewGenerationAuth(req)) return json(res, { error: "forbidden", message: "生成口令不正确" }, 403);
    try {
      return json(res, await fillInterviewGenerationBatch(req, generationFillMatch[1]));
    } catch (error) {
      return json(res, { error: error.code || "interview_generation_failed", message: error.message || "补题失败" }, error.status || 500);
    }
  }
  const generationApproveAllMatch = url.pathname.match(/^\/api\/interview\/generation-batches\/(\d+)\/approve-all$/);
  if (generationApproveAllMatch && req.method === "POST") {
    if (!ensureInterviewGenerationAuth(req)) return json(res, { error: "forbidden", message: "生成口令不正确" }, 403);
    try {
      return json(res, await approveAllInterviewGenerationCandidates(req, generationApproveAllMatch[1]));
    } catch (error) {
      return json(res, { error: error.code || "interview_generation_failed", message: error.message || "批量通过失败" }, error.status || 500);
    }
  }
  const generationAnswersMatch = url.pathname.match(/^\/api\/interview\/generation-batches\/(\d+)\/answers$/);
  if (generationAnswersMatch && req.method === "POST") {
    if (!ensureInterviewGenerationAuth(req)) return json(res, { error: "forbidden", message: "生成口令不正确" }, 403);
    try {
      return json(res, await generateInterviewGenerationAnswers(req, generationAnswersMatch[1]));
    } catch (error) {
      return json(res, { error: error.code || "interview_generation_failed", message: error.message || "生成答案失败" }, error.status || 500);
    }
  }
  const generationFinalizeMatch = url.pathname.match(/^\/api\/interview\/generation-batches\/(\d+)\/finalize$/);
  if (generationFinalizeMatch && req.method === "POST") {
    if (!ensureInterviewGenerationAuth(req)) return json(res, { error: "forbidden", message: "Token invalid" }, 403);
    try {
      return json(res, await finalizeInterviewGenerationBatch(req, generationFinalizeMatch[1]));
    } catch (error) {
      return json(res, { error: error.code || "interview_generation_failed", message: error.message || "Finalize failed" }, error.status || 500);
    }
  }
  const generationPublishMatch = url.pathname.match(/^\/api\/interview\/generation-batches\/(\d+)\/publish$/);
  if (generationPublishMatch && req.method === "POST") {
    if (!ensureInterviewGenerationAuth(req)) return json(res, { error: "forbidden", message: "生成口令不正确" }, 403);
    try {
      return json(res, await publishInterviewGenerationBatch(req, generationPublishMatch[1]));
    } catch (error) {
      return json(res, { error: error.code || "interview_generation_failed", message: error.message || "发布失败" }, error.status || 500);
    }
  }
  const generationCandidateMatch = url.pathname.match(/^\/api\/interview\/generation-candidates\/(\d+)$/);
  if (generationCandidateMatch && req.method === "PATCH") {
    if (!ensureInterviewGenerationAuth(req)) return json(res, { error: "forbidden", message: "生成口令不正确" }, 403);
    try {
      return json(res, await updateInterviewGenerationCandidate(req, generationCandidateMatch[1]));
    } catch (error) {
      return json(res, { error: error.code || "interview_generation_failed", message: error.message || "候选题更新失败" }, error.status || 500);
    }
  }
  if (url.pathname === "/api/interview/tomorrow" && req.method === "POST") {
    if (!ensureInterviewGenerationAuth(req)) return json(res, { error: "forbidden", message: "生成口令不正确" }, 403);
    const body = await readBody(req);
    if (!body.confirm) return json(res, { error: "confirmation_required", message: "需要二次确认后再生成" }, 400);
    try {
      return json(res, await ensureInterviewDailyGenerated({
        date: shanghaiDate(1),
        topic: body.topic,
        requirements: body.requirements,
        provider: body.provider,
        force: Boolean(body.force),
        reason: "public-tomorrow"
      }));
    } catch (error) {
      return json(res, { error: error.code || "interview_generation_failed", message: error.message || "生成失败" }, error.status || 500);
    }
  }
  if (url.pathname === "/api/interview/generate" && req.method === "POST") {
    if (!ensureInterviewGenerationAuth(req)) return json(res, { error: "forbidden", message: "生成口令不正确" }, 403);
    const body = await readBody(req);
    if (!body.confirm) return json(res, { error: "confirmation_required", message: "需要二次确认后再生成" }, 400);
    try {
      return json(res, await ensureInterviewDailyGenerated({
        date: cleanDateValue(body.date) || shanghaiDate(),
        topic: body.topic,
        requirements: body.requirements,
        provider: body.provider,
        force: Boolean(body.force),
        reason: "public-generate"
      }));
    } catch (error) {
      return json(res, { error: error.code || "interview_generation_failed", message: error.message || "生成失败" }, error.status || 500);
    }
  }
  if (url.pathname === "/api/interview/daily-question" && req.method === "POST") {
    if (!ensureInterviewGenerationAuth(req)) return json(res, { error: "forbidden", message: "生成口令不正确" }, 403);
    const result = await addPublicInterviewDailyQuestion(req);
    return json(res, result, result.ok === false ? 400 : 200);
  }
  if (url.pathname === "/api/interview/progress" && req.method === "GET") return json(res, await publicInterviewProgress(req, url));
  if (url.pathname === "/api/interview/progress" && req.method === "PUT") {
    const result = await saveInterviewProgress(req);
    return json(res, result, result.ok === false ? 400 : 200);
  }
  if (url.pathname === "/api/interview/question-markers" && req.method === "PUT") {
    if (!ensureInterviewGenerationAuth(req)) return json(res, { error: "forbidden", message: "生成口令不正确" }, 403);
    const result = await saveInterviewQuestionMarkers(req);
    return json(res, result, result.ok === false ? 404 : 200);
  }
  if (url.pathname === "/api/interview/insights" && req.method === "GET") return json(res, await publicInterviewInsights(req, url));
  if (url.pathname === "/api/interview/insights" && req.method === "PUT") return json(res, await saveInterviewInsight(req));
  if (url.pathname === "/api/interview/topics") {
    return json(res, await withPublicFallback("interview topics", () => fallbackInterviewTopicItems({ visibleOnly: true }), async () => {
      const rows = await query("SELECT t.*, COUNT(DISTINCT CASE WHEN q.status='published' AND q.deleted_at IS NULL THEN q.id END) AS question_count, COUNT(DISTINCT CASE WHEN q.status='published' AND q.deleted_at IS NULL THEN q.id END) AS published_question_count " +
        "FROM interview_topics t LEFT JOIN interview_questions q ON q.topic_id=t.id AND q.deleted_at IS NULL AND " + publicInterviewQuestionFilter("q") + " " +
        "WHERE t.visible=1 AND t.deleted_at IS NULL GROUP BY t.id ORDER BY t.sort_order ASC, t.id ASC LIMIT 80");
      return { items: rows.map(publicInterviewTopic) };
    }));
  }
  if (url.pathname === "/api/interview/tags") {
    return json(res, await withPublicFallback("interview tags", () => ({ items: [], total: 0, source: "local-preview" }), async () => {
      const requestedGoalIds = parseIdList(url.searchParams.get("goalIds") || url.searchParams.get("goal_ids") || url.searchParams.get("goalId") || url.searchParams.get("goal_id")).slice(0, 80);
      const goalSlug = cleanKey(url.searchParams.get("goalSlug") || url.searchParams.get("goal_slug") || "", "");
      const goalFilterIds = await resolveInterviewGoalFilterIds({ goalIds: requestedGoalIds, goalSlug });
      const limit = Math.min(80, Math.max(12, Number(url.searchParams.get("limit")) || 36));
      const cacheKey = `interview-tags:v5:${goalFilterIds.join(".")}:${goalSlug}:${requestedGoalIds.join(".")}:${limit}`;
      return publicRouteCached(cacheKey, 600, async () => {
        const rows = filterInterviewPublicQuestionIndex(await getInterviewPublicQuestionIndex(), { goalFilterIds, orderMode: "mixed" });
        const counts = new Map();
        for (const row of rows) {
          for (const tag of row.tags || []) {
            counts.set(tag, (counts.get(tag) || 0) + 1);
          }
        }
        const items = [...counts.entries()]
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => Number(b.count || 0) - Number(a.count || 0) || a.tag.localeCompare(b.tag, "zh-Hans-CN"))
          .slice(0, limit);
        return { items, total: rows.length };
      });
    }));
  }
  if (url.pathname === "/api/interview/questions") {
    const topic = cleanText(url.searchParams.get("topic") || "", 160);
    return json(res, await withPublicFallback("interview questions", () => fallbackInterviewQuestionItems({ topic, status: "published" }), async () => {
      const limit = Math.min(60, Math.max(1, Number(url.searchParams.get("limit")) || 24));
      const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
      const offset = Math.max(0, Number(url.searchParams.get("offset")) || ((page - 1) * limit));
      const requestedGoalIds = parseIdList(url.searchParams.get("goalIds") || url.searchParams.get("goal_ids") || url.searchParams.get("goalId") || url.searchParams.get("goal_id")).slice(0, 60);
      const goalSlug = cleanKey(url.searchParams.get("goalSlug") || url.searchParams.get("goal_slug") || "", "");
      const selectedTags = parseInterviewFilterTags(url.searchParams.get("tags") || url.searchParams.get("tag") || "");
      const goalFilterIds = await resolveInterviewGoalFilterIds({ goalIds: requestedGoalIds, goalSlug });
      const orderMode = cleanKey(url.searchParams.get("order") || "", (goalFilterIds.length || selectedTags.length) ? "mixed" : "");
      const compact = ["1", "true", "yes"].includes(String(url.searchParams.get("compact") || "").toLowerCase());
      const cacheKey = `interview-questions:v11:${topic}:${goalFilterIds.join(".")}:${selectedTags.join("|")}:${orderMode}:${page}:${limit}:${offset}:${compact ? "compact" : "full"}`;
      return publicRouteCached(cacheKey, compact ? 240 : 120, async () => {
        const filtered = filterInterviewPublicQuestionIndex(await getInterviewPublicQuestionIndex(), { topic, goalFilterIds, selectedTags, orderMode });
        const ids = filtered.slice(offset, offset + limit).map((row) => row.id).filter(Boolean);
        let rows = [];
        if (ids.length) {
          const { params: idParams, sql } = questionIdPlaceholders(ids);
          const selectColumns = compact
            ? "q.id,q.topic_id,q.slug,q.title,q.summary,q.answer_md,q.difficulty,q.source,q.tags,q.status,q.sort_order,q.example_case,q.example_case_source_hash,q.example_case_provider,q.example_case_model,q.example_case_updated_at,q.example_case_error,q.star_rating,q.is_difficult,q.is_common,q.in_collection,q.marker_note,t.slug AS topic_slug,t.title AS topic_title "
            : "q.id,q.topic_id,q.slug,q.title,q.summary,q.answer_md,q.answer_html,q.answer_points,q.difficulty,q.source,q.tags,q.status,q.sort_order,q.reviewed_at,q.created_at,q.updated_at,q.example_case,q.example_case_source_hash,q.example_case_provider,q.example_case_model,q.example_case_updated_at,q.example_case_error,q.star_rating,q.is_difficult,q.is_common,q.in_collection,q.marker_note,t.slug AS topic_slug,t.title AS topic_title ";
          rows = await query("SELECT " + selectColumns +
            "FROM interview_questions q LEFT JOIN interview_topics t ON t.id=q.topic_id WHERE q.id IN (" + sql + ")" +
            ` ORDER BY FIELD(q.id, ${ids.join(",")})`, idParams);
        }
        await attachInterviewGoalIds(rows);
        const total = filtered.length;
        return { items: rows.map((row, index) => compact ? publicInterviewQuestionListItem(row, offset + index + 1) : publicInterviewDailyQuestion(row, offset + index + 1)), total, page, limit, offset, hasMore: offset + rows.length < total };
      });
    }));
  }
  if (url.pathname.startsWith("/api/interview/questions/")) {
    const key = decodeURIComponent(url.pathname.split("/").pop());
    const isId = /^\d+$/.test(key);
    const row = await withPublicFallback("interview question detail", () => fallbackInterviewQuestionDetail(key), () => getOne(
      "SELECT q.*, t.slug AS topic_slug, t.title AS topic_title " +
      "FROM interview_questions q LEFT JOIN interview_topics t ON t.id=q.topic_id " +
      "WHERE q.status='published' AND q.deleted_at IS NULL AND " + publicInterviewQuestionFilter("q") + " AND " +
      (isId ? "q.id=:key" : "q.slug=:key") + " LIMIT 1",
      { key }
    ));
    if (!row) return json(res, { error: "not_found" }, 404);
    if (!row.goalIds) await attachInterviewGoalIds([row]);
    return json(res, publicInterviewQuestion(row.answer_html ? row : { ...row, answer_html: markdownToHtml(row.answer_md || "") }));
  }
  if (url.pathname === "/api/interview/reviews") {
    return json(res, await withPublicFallback("interview reviews", () => fallbackInterviewReviewItems({ status: "published" }), async () => {
      const rows = await query("SELECT * FROM interview_reviews WHERE status='published' AND deleted_at IS NULL ORDER BY happened_at DESC, sort_order ASC, id DESC LIMIT 80");
      return { items: rows.map(publicInterviewReview) };
    }));
  }
  if (url.pathname === "/api/interview/workspace") {
    return json(res, await withPublicFallback("interview workspace", () => ({
      topics: fallbackInterviewTopicItems({ visibleOnly: true }).items,
      questions: fallbackInterviewQuestionItems({ status: "published" }).items,
      reviews: fallbackInterviewReviewItems({ status: "published" }).items,
      legacy: fallbackInterviewItems("").items,
      source: "local-preview"
    }), async () => {
      const topics = await query("SELECT t.*, COUNT(DISTINCT CASE WHEN q.status='published' AND q.deleted_at IS NULL THEN q.id END) AS question_count, COUNT(DISTINCT CASE WHEN q.status='published' AND q.deleted_at IS NULL THEN q.id END) AS published_question_count " +
        "FROM interview_topics t LEFT JOIN interview_questions q ON q.topic_id=t.id AND q.deleted_at IS NULL AND " + publicInterviewQuestionFilter("q") + " " +
        "WHERE t.visible=1 AND t.deleted_at IS NULL GROUP BY t.id ORDER BY t.sort_order ASC, t.id ASC LIMIT 80");
      const questions = await query("SELECT q.id,q.topic_id,q.slug,q.title,q.summary,q.answer_md,q.answer_html,q.answer_points,q.difficulty,q.source,q.tags,q.status,q.sort_order,q.reviewed_at,q.created_at,q.updated_at,q.example_case,q.example_case_source_hash,q.example_case_provider,q.example_case_model,q.example_case_updated_at,q.example_case_error,t.slug AS topic_slug,t.title AS topic_title " +
        "FROM interview_questions q LEFT JOIN interview_topics t ON t.id=q.topic_id WHERE q.status='published' AND q.deleted_at IS NULL AND " + publicInterviewQuestionFilter("q") +
        " ORDER BY COALESCE(t.sort_order,9999) ASC, q.sort_order ASC, q.updated_at DESC, q.id DESC LIMIT 160");
      await attachInterviewGoalIds(questions);
      const reviews = await query("SELECT * FROM interview_reviews WHERE status='published' AND deleted_at IS NULL ORDER BY happened_at DESC, sort_order ASC, id DESC LIMIT 40");
      return { topics: topics.map(publicInterviewTopic), questions: questions.map(publicInterviewQuestion), reviews: reviews.map(publicInterviewReview) };
    }));
  }
  if (url.pathname === "/api/interviews") {
    const section = cleanInterviewSection(url.searchParams.get("section") || "", "");
    return json(res, await withPublicFallback("interviews", () => fallbackInterviewItems(section), async () => {
      const rows = await query(`SELECT id, title, slug, section, summary, difficulty, tags, question_count, finished_count, sort_order, created_at, updated_at
        FROM interview_items
        WHERE status='published' AND deleted_at IS NULL ${section ? "AND section=:section" : ""}
        ORDER BY sort_order ASC, updated_at DESC, id DESC LIMIT 80`, section ? { section } : {});
      return { items: rows.map(publicInterview) };
    }));
  }
  if (url.pathname.startsWith("/api/interviews/")) {
    const key = decodeURIComponent(url.pathname.split("/").pop());
    const isId = /^\d+$/.test(key);
    const item = await withPublicFallback("interview detail", () => fallbackInterviewDetail(key), () => getOne(`SELECT * FROM interview_items
      WHERE status='published' AND deleted_at IS NULL AND ${isId ? "id=:key" : "slug=:key"} LIMIT 1`, { key }));
    if (!item) return json(res, { error: "not_found" }, 404);
    return json(res, item.content_html ? publicInterview(item) : publicInterview({ ...item, content_html: markdownToHtml(item.content_md || "") }));
  }
  if (url.pathname === "/api/categories") {
    return json(res, await withPublicFallback("categories", { items: fallbackCategories, source: "local-preview" }, async () => {
      const rows = await query("SELECT id, name, slug, description FROM categories ORDER BY id ASC");
      return { items: rows };
    }));
  }
  if (url.pathname === "/api/search") {
    const q = url.searchParams.get("q") || "";
    return json(res, await withPublicFallback("search", () => fallbackSearchItems(q), async () => {
      const hits = await searchContent(q);
      return { items: hits };
    }));
  }
  return false;
}

async function adminRoutes(req, res, url) {
  if (url.pathname.startsWith("/admin/api/")) return adminApi(req, res, url);
  if (serveAdminApp(req, res, url)) return;

  if (url.pathname === "/admin/login" && req.method === "GET") {
    return html(res, page("登录", `<div class="login-shell"><form class="card" method="post"><h2>后台登录</h2><p class="muted">输入管理员账号后进入内容工作台。</p><label>用户名</label><input name="username" autocomplete="username" required><label>密码</label><input name="password" type="password" autocomplete="current-password" required><button class="btn">登录</button></form></div>`));
  }
  if (url.pathname === "/admin/login" && req.method === "POST") {
    const body = await readBody(req);
    const username = String(body.username || "").trim();
    const password = String(body.password ?? "");
    if (matchesLocalPreviewAdmin(req, username, password)) {
      res.writeHead(302, {
        "Set-Cookie": `session=${encodeURIComponent(signSession(-1))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`,
        Location: "/admin"
      });
      return res.end();
    }
    let user;
    try {
      user = await getOne("SELECT * FROM users WHERE username=:username", { username });
    } catch (error) {
      markDatabaseUnavailable(error, "admin login database");
      if (matchesLocalPreviewAdmin(req, username, password)) {
        res.writeHead(302, {
          "Set-Cookie": `session=${encodeURIComponent(signSession(-1))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`,
          Location: "/admin"
        });
        return res.end();
      }
      return html(res, page("本地数据库未启动", `<div class="card"><h2>本地数据库未启动</h2><p>请使用本地预览账号，或先启动 MySQL。</p><p><a class="btn" href="/admin/login">返回登录</a></p></div>`), 503);
    }
    if (!user || !passwordMatches(password, user.password_hash)) {
      return html(res, page("登录失败", `<div class="card"><h2>登录失败</h2><p>用户名或密码不对。</p><p><a class="btn" href="/admin/login">返回登录</a></p></div>`), 401);
    }
    res.writeHead(302, {
      "Set-Cookie": `session=${encodeURIComponent(signSession(user.id))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`,
      Location: "/admin"
    });
    return res.end();
  }
  if (url.pathname === "/admin/logout") {
    res.writeHead(302, { "Set-Cookie": "session=; Path=/; Max-Age=0", Location: "/admin/login" });
    return res.end();
  }

  const user = await requireAdmin(req, res);
  if (!user) return;

  if (url.pathname === "/admin") {
    const [stats] = await query(`
      SELECT
        (SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL) AS posts,
        (SELECT COUNT(*) FROM moments WHERE deleted_at IS NULL) AS moments,
        (SELECT COUNT(*) FROM interview_items WHERE deleted_at IS NULL) AS interviews,
        (SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL) AS projects,
        (SELECT COUNT(*) FROM projects WHERE status='active' AND deleted_at IS NULL) AS activeProjects
    `);
    const cleanupStats = await oldLaunchContentStats();
    return html(res, page("概览", `<div class="toolbar">
      <div>
        <h2>正式使用工作台</h2>
        <p class="muted">后台现在按前台界面维护：页面文案、项目、瞬间、面试训练和设置都从这里统一整理。</p>
      </div>
      <div class="toolbar-actions">
        <a class="btn" href="/admin/projects/new">新项目</a>
        <a class="link-pill" href="/admin/texts">改前台文案</a>
      </div>
    </div>
    <div class="admin-grid">
      <section class="card stat-card"><strong>${stats.posts}</strong><p class="muted">小记文章</p></section>
      <section class="card stat-card"><strong>${stats.moments}</strong><p class="muted">瞬间</p></section>
      <section class="card stat-card"><strong>${stats.interviews}</strong><p class="muted">旧面试文章</p></section>
      <section class="card stat-card"><strong>${stats.activeProjects}/${stats.projects}</strong><p class="muted">前台项目 / 全部项目</p></section>
    </div>
    <div class="grid">
      <section class="card"><h2>前台界面</h2><p class="muted">首页、瞬间、小记、项目、关于和详情页的静态文案已经补齐到后端文案库。</p><a class="link-pill" href="/admin/texts">进入文案工作台</a></section>
      <section class="card"><h2>旧内容清理</h2><p class="muted">当前待清理旧内容 ${cleanupStats.totalActive || 0} 条：小记文章、瞬间、旧面试文章。不会动项目、题库和学习知识。</p><a class="link-pill" href="/admin/content-cleanup">进入清理页</a></section>
      <section class="card"><h2>搜索索引</h2><p class="muted">文章保存后会自动同步；需要时也可以手动重建。</p><form method="post" action="/admin/sync-search"><button class="btn">同步搜索索引</button></form></section>
    </div>`));
  }

  if (url.pathname === "/admin/sync-search" && req.method === "POST") {
    const count = await syncSearchIndex();
    return html(res, page("搜索同步", `<div class="card"><p>已同步 ${count} 篇文章到 Meilisearch。</p><p><a href="/admin">返回</a></p></div>`));
  }

  if (url.pathname === "/admin/content-cleanup" && req.method === "GET") {
    const stats = await oldLaunchContentStats();
    const rows = stats.items.map((item) => `<tr><td>${escapeHtml(item.label)}</td><td>${item.active}</td><td>${item.deleted}</td><td>${item.total}</td></tr>`).join("");
    return html(res, page("旧内容清理", `<div class="toolbar">
      <div>
        <h2>旧内容清理</h2>
        <p class="muted">用于正式投入使用前清空旧的小记文章、瞬间和旧面试文章。项目、面试题库、目标计划、学习知识和今日题单不会被处理。</p>
      </div>
      <a class="link-pill" href="/admin">返回概览</a>
    </div>
    <div class="card"><table><tr><th>资源</th><th>待清理</th><th>已在回收态</th><th>总数</th></tr>${rows}</table></div>
    <form class="card" method="post" action="/admin/content-cleanup" onsubmit="return confirm('确认清理旧内容？这会把小记文章、瞬间和旧面试文章移入回收态，不影响项目、题库和知识库。')">
      <h2>执行清理</h2>
      <p class="muted">当前待清理 ${stats.totalActive || 0} 条。执行前建议已完成服务器备份。</p>
      <input type="hidden" name="confirm" value="clean-old-content">
      <button class="danger-btn destroy-btn" type="submit">清理旧内容</button>
    </form>`));
  }

  if (url.pathname === "/admin/content-cleanup" && req.method === "POST") {
    const body = await readBody(req);
    const result = await cleanupOldLaunchContent(req, user, { ...body, confirm: body.confirm || "clean-old-content" });
    const message = result.error
      ? `${escapeHtml(result.message || result.error)}`
      : `已清理 ${result.result.reduce((sum, item) => sum + Number(item.cleaned || 0), 0)} 条旧内容。`;
    return html(res, page("旧内容清理", `<div class="card"><h2>${result.error ? "清理失败" : "清理完成"}</h2><p>${message}</p><p><a class="btn" href="/admin/content-cleanup">返回清理页</a></p></div>`), result.error ? 400 : 200);
  }

  if (url.pathname === "/admin/posts" && req.method === "GET") {
    const posts = await query("SELECT id,title,slug,status,published_at FROM posts WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 80");
    const rows = posts.map((p) => `<tr>
      <td>${escapeHtml(p.id)}</td>
      <td>${escapeHtml(p.title)}</td>
      <td>${escapeHtml(p.status)}</td>
      <td><div class="row-actions">
        <a href="/admin/posts/edit?id=${encodeURIComponent(p.id)}">编辑</a>
        <a href="/post.html?slug=${encodeURIComponent(p.slug || "")}" target="_blank" rel="noreferrer">前台</a>
        <form method="post" action="/admin/posts/delete" onsubmit="return confirm('这会把文章从前台隐藏，数据仍会保留。继续？')">
          <input type="hidden" name="id" value="${escapeAttr(p.id)}">
          <button class="danger-btn" type="submit">隐藏</button>
        </form>
        <form method="post" action="/admin/posts/destroy" onsubmit="return confirm('将文章移入回收站，评论会自动隐藏，之后可恢复。继续？')">
          <input type="hidden" name="id" value="${escapeAttr(p.id)}">
          <button class="danger-btn destroy-btn" type="submit">移入回收站</button>
        </form>
      </div></td>
    </tr>`).join("");
    return html(res, page("文章", `<div class="card"><h2>文章库</h2><p class="muted">长记录、教程草稿和复盘都从这里维护。隐藏会从前台下架；移入回收站后仍可通过新版后台恢复。</p><a class="btn" href="/admin/posts/new">新文章</a></div><div class="card"><table><tr><th>ID</th><th>标题</th><th>状态</th><th>操作</th></tr>${rows}</table></div>`));
  }
  if ((url.pathname === "/admin/posts/new" || url.pathname === "/admin/posts/edit") && req.method === "GET") {
    const id = url.searchParams.get("id");
    const post = id ? await getOne("SELECT * FROM posts WHERE id=:id", { id }) : {};
    return html(res, page(id ? "编辑文章" : "新建文章", `<form class="editor-layout" method="post" action="/admin/posts/save">
      <input type="hidden" name="id" value="${escapeAttr(post.id || "")}">
      <section class="card editor-card">
        <div class="toolbar">
          <div>
            <h2>Markdown 编辑器</h2>
            <p class="muted">正文保留纯文本编辑区；按 Ctrl+S 可以直接保存。</p>
          </div>
          <div class="toolbar-actions">
            ${post.slug ? `<a class="link-pill" href="/post.html?slug=${encodeURIComponent(post.slug)}" target="_blank" rel="noreferrer">打开前台</a>` : ""}
            <button class="btn" type="submit">保存文章</button>
          </div>
        </div>
        <textarea name="content_md" spellcheck="false">${escapeHtml(post.content_md || "")}</textarea>
      </section>
      <aside class="card meta-card">
        <h2>文章信息</h2>
        <label>标题</label>
        <input name="title" value="${escapeAttr(post.title || "")}" required>
        <label>Slug</label>
        <input name="slug" value="${escapeAttr(post.slug || "")}" required>
        <label>摘要</label>
        <textarea name="summary" rows="4">${escapeHtml(post.summary || "")}</textarea>
        <label>状态</label>
        <select name="status">
          <option value="published" ${post.status === "published" ? "selected" : ""}>published</option>
          <option value="draft" ${post.status === "draft" ? "selected" : ""}>draft</option>
        </select>
        <ul class="hint-list">
          <li>文章保存后会刷新站点统计。</li>
          <li>发布状态会同步搜索索引。</li>
          <li>摘要为空时会从正文自动截取。</li>
        </ul>
      </aside>
    </form>`));
  }
  if (url.pathname === "/admin/posts/save" && req.method === "POST") {
    const body = await readBody(req);
    const summary = body.summary || stripMarkdown(body.content_md || "").slice(0, 160);
    if (body.id) {
      await query("UPDATE posts SET title=:title, slug=:slug, summary=:summary, content_md=:content_md, status=:status, updated_at=NOW() WHERE id=:id", { ...body, summary });
    } else {
      await query("INSERT INTO posts(title,slug,summary,content_md,status,published_at,created_at,updated_at) VALUES(:title,:slug,:summary,:content_md,:status,NOW(),NOW(),NOW())", { ...body, summary });
    }
    await cacheDel("site:overview");
    await syncSearchIndex();
    return redirect(res, "/admin/posts");
  }
  if (url.pathname === "/admin/posts/destroy" && req.method === "POST") {
    const body = await readBody(req);
    const id = cleanId(body.id);
    if (!id) return redirect(res, "/admin/posts");
    const post = await getOne("SELECT id, slug FROM posts WHERE id=:id", { id });
    if (post) {
      const target = post.slug ? `post:${post.slug}` : "";
      await query("UPDATE posts SET status='draft', deleted_at=COALESCE(deleted_at,NOW()), updated_at=NOW() WHERE id=:id", { id });
      if (target) {
        await deleteCommentsForTarget(target);
      }
      await cacheDel("site:overview");
      await syncSearchIndex();
    }
    return redirect(res, "/admin/posts");
  }
  if (url.pathname === "/admin/posts/delete" && req.method === "POST") {
    const body = await readBody(req);
    const id = cleanId(body.id);
    if (!id) return redirect(res, "/admin/posts");
    await query("UPDATE posts SET status='draft', updated_at=NOW() WHERE id=:id", { id });
    await cacheDel("site:overview");
    await syncSearchIndex();
    return redirect(res, "/admin/posts");
  }

  if (url.pathname === "/admin/moments" && req.method === "GET") {
    const moments = await query("SELECT id,content,kind,status,created_at FROM moments WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 80");
    const rows = moments.map((m) => `<tr>
      <td>${escapeHtml(m.id)}</td>
      <td>${escapeHtml(m.content)}</td>
      <td>${escapeHtml(m.kind)}</td>
      <td>${escapeHtml(m.status)}</td>
      <td><div class="row-actions">
        <form method="post" action="/admin/moments/delete" onsubmit="return confirm('这会把瞬间从前台隐藏，数据仍会保留。继续？')">
          <input type="hidden" name="id" value="${escapeAttr(m.id)}">
          <button class="danger-btn" type="submit">隐藏</button>
        </form>
        <form method="post" action="/admin/moments/destroy" onsubmit="return confirm('将瞬间移入回收站，之后可恢复。继续？')">
          <input type="hidden" name="id" value="${escapeAttr(m.id)}">
          <button class="danger-btn destroy-btn" type="submit">移入回收站</button>
        </form>
      </div></td>
    </tr>`).join("");
    return html(res, page("瞬间", `<form class="card" method="post" action="/admin/moments/save"><h2>发一条瞬间</h2><p class="muted">适合不够成文的进度、状态和临时记录。隐藏会从前台下架；移入回收站后仍可通过新版后台恢复。</p><label>内容</label><textarea name="content"></textarea><div class="grid"><div><label>类型</label><select name="kind"><option value="tech">技术</option><option value="project">项目</option><option value="life">生活</option></select></div><div><label>标签，逗号分隔</label><input name="tags" value="Ubuntu,ROS,FOC"></div></div><button class="btn">发布瞬间</button></form><div class="card"><table><tr><th>ID</th><th>内容</th><th>类型</th><th>状态</th><th>操作</th></tr>${rows}</table></div>`));
  }
  if (url.pathname === "/admin/moments/save" && req.method === "POST") {
    const body = await readBody(req);
    const tags = JSON.stringify(String(body.tags || "").split(/[,\uFF0C\u3001]/).map((x) => x.trim()).filter(Boolean));
    await query("INSERT INTO moments(content,kind,tags,status,created_at,updated_at) VALUES(:content,:kind,:tags,'published',NOW(),NOW())", { content: body.content || "", kind: cleanMomentKind(body.kind, "life"), tags });
    await cacheDel("site:overview");
    await syncSearchIndex();
    return redirect(res, "/admin/moments");
  }
  if (url.pathname === "/admin/moments/destroy" && req.method === "POST") {
    const body = await readBody(req);
    const id = cleanId(body.id);
    if (!id) return redirect(res, "/admin/moments");
    await query("UPDATE moments SET status='draft', deleted_at=COALESCE(deleted_at,NOW()), updated_at=NOW() WHERE id=:id", { id });
    await cacheDel("site:overview");
    await syncSearchIndex();
    return redirect(res, "/admin/moments");
  }
  if (url.pathname === "/admin/moments/delete" && req.method === "POST") {
    const body = await readBody(req);
    const id = cleanId(body.id);
    if (!id) return redirect(res, "/admin/moments");
    await query("UPDATE moments SET status='draft', updated_at=NOW() WHERE id=:id", { id });
    await cacheDel("site:overview");
    await syncSearchIndex();
    return redirect(res, "/admin/moments");
  }

  if (url.pathname === "/admin/projects" && req.method === "GET") {
    const projects = await query("SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY sort_order ASC,id ASC");
    const activeCount = projects.filter((project) => project.status === "active").length;
    const rows = projects.map((p) => {
      const updateText = p.updated_at ? formatDateTime(p.updated_at) : "";
      return `<tr>
        <td class="project-title-cell"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.slug || "")}</small></td>
        <td>${escapeHtml(p.status_text || "")}</td>
        <td><div class="project-progress" aria-label="${Number(p.progress) || 0}%"><span style="width:${Number(p.progress) || 0}%"></span></div><small>${Number(p.progress) || 0}%</small></td>
        <td>${escapeHtml(p.status || "")}</td>
        <td>${escapeHtml(updateText || p.last_update || "")}</td>
        <td><div class="row-actions">
          <a href="/admin/projects/edit?id=${encodeURIComponent(p.id)}">编辑</a>
          <a href="/project.html?id=${encodeURIComponent(p.id)}" target="_blank" rel="noreferrer">前台</a>
          <form method="post" action="/admin/projects/delete" onsubmit="return confirm('这会把项目从前台隐藏，数据仍会保留。继续？')">
            <input type="hidden" name="id" value="${escapeAttr(p.id)}">
            <button class="danger-btn" type="submit">隐藏</button>
          </form>
          <form method="post" action="/admin/projects/destroy" onsubmit="return confirm('将项目移入回收站，评论会自动隐藏，之后可恢复。继续？')">
            <input type="hidden" name="id" value="${escapeAttr(p.id)}">
            <button class="danger-btn destroy-btn" type="submit">移入回收站</button>
          </form>
        </div></td>
      </tr>`;
    }).join("");
    return html(res, page("项目", `<div class="toolbar">
      <div>
        <h2>项目工作台</h2>
        <p class="muted">项目采用“元数据 + Markdown 正文”的结构。保存后前台列表、详情页和最后编辑时间会立即读取最新数据。</p>
      </div>
      <div class="toolbar-actions"><a class="btn" href="/admin/projects/new">新建项目</a></div>
    </div>
    <div class="admin-grid">
      <section class="card stat-card"><strong>${projects.length}</strong><p class="muted">全部项目</p></section>
      <section class="card stat-card"><strong>${activeCount}</strong><p class="muted">前台显示</p></section>
      <section class="card stat-card"><strong>MD</strong><p class="muted">支持 Markdown 文件导入</p></section>
    </div>
    <div class="card"><table><tr><th>项目</th><th>卡片状态</th><th>进度</th><th>状态</th><th>最后编辑</th><th></th></tr>${rows}</table></div>`));
  }

  if ((url.pathname === "/admin/projects/new" || url.pathname === "/admin/projects/edit") && req.method === "GET") {
    const id = url.searchParams.get("id");
    const project = id ? await getOne("SELECT * FROM projects WHERE id=:id", { id }) : {};
    if (id && !project) return html(res, page("项目不存在", `<div class="card">没有找到这个项目。<p><a href="/admin/projects">返回项目列表</a></p></div>`), 404);
    const notice = url.searchParams.get("saved") ? "项目已保存，前台 API 会读取最新内容。" : "";
    return html(res, page(id ? "编辑项目" : "新建项目", projectEditor(project || {}, notice)));
  }

  if (url.pathname === "/admin/projects/save" && req.method === "POST") {
    const body = await readForm(req);
    let project = applyMarkdownMetaToProject(body);
    if (!project.content_md.trim()) {
      return html(res, page("Project save failed", `<div class="card"><p>Markdown content cannot be empty.</p><p><a href="/admin/projects">Back to projects</a></p></div>`), 400);
    }
    let id = project.id;
    try {
      if (id) {
        const current = await getAdminProject(id);
        project = { ...project, ...await projectAiSummaryFields(project, current || {}) };
        await query(`UPDATE projects
          SET name=:name, slug=:slug, summary=:summary, status_text=:status_text, progress=:progress,
            last_update=:last_update, status=:status, sort_order=:sort_order, content_md=:content_md,
            cover_url=:cover_url, ai_summary_updated_at=CASE WHEN COALESCE(ai_summary_source_hash,'')<>:ai_summary_source_hash OR COALESCE(ai_summary,'')<>:ai_summary THEN NOW() ELSE ai_summary_updated_at END,
            ai_summary=:ai_summary, ai_summary_source_hash=:ai_summary_source_hash,
            ai_summary_error=:ai_summary_error, updated_at=NOW()
          WHERE id=:id`, project);
      } else {
        project = { ...project, ...await projectAiSummaryFields(project) };
        const result = await query(`INSERT INTO projects
          (name, slug, summary, status_text, progress, last_update, status, sort_order, content_md, cover_url, ai_summary, ai_summary_source_hash, ai_summary_updated_at, ai_summary_error, created_at, updated_at)
          VALUES(:name, :slug, :summary, :status_text, :progress, :last_update, :status, :sort_order, :content_md, :cover_url, :ai_summary, :ai_summary_source_hash, NOW(), :ai_summary_error, NOW(), NOW())`, project);
        id = result.insertId;
      }
    } catch (error) {
      if (error.errno === 1062) {
        return html(res, page("Project save failed", `<div class="card"><p>Slug is already used by another project.</p><p><a href="/admin/projects">Back to projects</a></p></div>`), 409);
      }
      throw error;
    }
    await cacheDel("site:overview");
    await syncSearchIndex();
    return redirect(res, `/admin/projects/edit?id=${encodeURIComponent(id)}&saved=1`);
  }
  if (url.pathname === "/admin/projects/delete" && req.method === "POST") {
    const body = await readBody(req);
    const id = cleanId(body.id);
    if (!id) return redirect(res, "/admin/projects");
    await query("UPDATE projects SET status='archived', updated_at=NOW() WHERE id=:id", { id });
    await cacheDel("site:overview");
    await syncSearchIndex();
    return redirect(res, "/admin/projects");
  }
  if (url.pathname === "/admin/projects/destroy" && req.method === "POST") {
    const body = await readBody(req);
    const id = cleanId(body.id);
    if (!id) return redirect(res, "/admin/projects");
    const project = await getOne("SELECT id FROM projects WHERE id=:id", { id });
    if (project) {
      const target = `project:${project.id}`;
      await deleteCommentsForTarget(target);
      await query("UPDATE projects SET status='archived', deleted_at=COALESCE(deleted_at,NOW()), updated_at=NOW() WHERE id=:id", { id });
      await cacheDel("site:overview");
      await syncSearchIndex();
    }
    return redirect(res, "/admin/projects");
  }

  if (url.pathname === "/admin/texts" && req.method === "GET") {
    const values = await getFrontendTextMap();
    const customRules = await getSetting("site_text_rules", "");
    const footerSections = await getFooterSections();
    const frontendUi = await getFrontendUi();
    const aboutGalleryFields = renderAboutGalleryEditor(frontendUi.aboutGalleryImages);
    const footerSectionFields = renderFooterSectionEditor(footerSections);
    let lastGroup = "";
    const fields = frontendTextDefaults.map((item) => {
      const heading = item.group !== lastGroup ? `<h2>${escapeHtml(item.group)}</h2>` : "";
      lastGroup = item.group;
      const value = values[item.key] ?? item.defaultValue;
      return `${heading}
        <label>${escapeHtml(item.label)} <small class="muted">${escapeHtml(item.key)}</small></label>
        <textarea name="${escapeAttr(item.key)}" rows="2">${escapeHtml(value)}</textarea>`;
    }).join("");
    return html(res, page("页面文案", `<form class="card text-editor" method="post" action="/admin/texts">
      <div class="toolbar">
        <div>
          <h2>前台页面文案</h2>
      <p class="muted">这里编辑带文案 key 的前台静态文字。文章、项目、瞬间正文仍在各自内容后台维护。</p>
        </div>
        <button class="btn" type="submit">保存文案</button>
      </div>
      ${fields}
      <h2>About 图库</h2>
      <p class="muted">只填图片链接、排序和显隐。支持 /uploads/、/assets/ 和 https 图片；空行会自动忽略。</p>
      ${aboutGalleryFields}
      <h2>页脚栏目</h2>
      <p class="muted">前台页脚按栏目渲染。空栏目和空链接会自动忽略；地址支持站内路径、https 链接和 mailto。</p>
      ${footerSectionFields}
      <h2>高级：任意位置文案规则</h2>
      <p class="muted">每行一条规则：CSS 选择器 | 新文字，或 CSS 选择器 | 属性名 | 新值。用于临时覆盖没有预置 key 的前台文字。</p>
      <label>自定义规则</label>
      <textarea name="__rules" rows="8" spellcheck="false">${escapeHtml(customRules)}</textarea>
      <button class="btn" type="submit">保存文案</button>
    </form>`));
  }
  if (url.pathname === "/admin/texts" && req.method === "POST") {
    const body = await readBody(req);
    for (const item of frontendTextDefaults) {
      const value = String(normalizeFrontendTextValue(item.key, body[item.key] ?? item.defaultValue)).slice(0, 1200);
      await setSetting(`site_text.${item.key}`, value);
    }
    const currentUi = await getFrontendUi();
    const nextUi = normalizeFrontendUi({ ...currentUi, aboutGalleryImages: aboutGalleryImagesFromBody(body) });
    await setSetting(footerSettingKey, JSON.stringify(footerSectionsFromBody(body)));
    await setSetting(frontendUiSettingKey, JSON.stringify(nextUi));
    await setSetting("site_text_rules", String(body.__rules || "").slice(0, 10000));
    await cacheDel("site:texts");
    return redirect(res, "/admin/texts");
  }

  if (url.pathname === "/admin/settings" && req.method === "GET") {
    const githubUsername = await getSetting("github_username", config.github.username || "Jlemonz");
    return html(res, page("设置", `<form class="card" method="post" action="/admin/settings"><h2>站点设置</h2><p class="muted">这些配置由后端保存，前台只读取结果，不让访客修改。</p><label>GitHub 用户名</label><input name="github_username" value="${githubUsername}" autocomplete="username"><button class="btn">保存设置</button></form>`));
  }
  if (url.pathname === "/admin/settings" && req.method === "POST") {
    const body = await readBody(req);
    const githubUsername = cleanText(body.github_username || config.github.username || "Jlemonz", 40).replace(/[^a-zA-Z0-9-]/g, "");
    await setSetting("github_username", githubUsername || "Jlemonz");
    await cacheDel([`github:contrib:${githubUsername || "Jlemonz"}`, `github:contrib:${(githubUsername || "Jlemonz").toLowerCase()}`, `github:repos:${githubUsername || "Jlemonz"}`, `github:repos:${(githubUsername || "Jlemonz").toLowerCase()}`]);
    refreshGithubContributionsSnapshot(githubUsername || "Jlemonz").catch((error) => console.warn("github refresh after settings save failed", error));
    syncGithubRepositories(req, user, githubUsername || "Jlemonz").catch((error) => console.warn("github repositories sync after settings save failed", error));
    return redirect(res, "/admin/settings");
  }
  return html(res, page("未找到", `<div class="card">页面不存在</div>`), 404);
}

function serveUpload(req, res, url) {
  const rel = decodeURIComponent(url.pathname.replace(config.uploads.publicPath, ""));
  const file = path.normalize(path.join(config.uploads.dir, rel));
  if (!file.startsWith(path.normalize(config.uploads.dir))) return false;
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  const types = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream", "Cache-Control": "public, max-age=604800" });
  fs.createReadStream(file).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders);
      return res.end();
    }
    req.cookies = parseCookies(req.headers.cookie || "");
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith(config.uploads.publicPath) && serveUpload(req, res, url)) return;
    if (url.pathname === "/rss.xml" || url.pathname === "/feed.xml") return renderRss(req, res);
    if (url.pathname === "/sitemap.xml") return renderSitemap(req, res);
    if (url.pathname === "/project.html" && await serveProjectDetailHtml(req, res, url)) return;
    if (url.pathname === "/api/external-asset" && await serveExternalAsset(req, res, url)) return;
    if (url.pathname.startsWith("/api/")) {
      const handled = await publicApi(req, res, url);
      if (handled !== false) return;
    }
    if (url.pathname.startsWith("/admin")) return adminRoutes(req, res, url);
    return json(res, { error: "not_found" }, 404);
  } catch (error) {
    console.error(error);
    return json(res, { error: "server_error" }, 500);
  }
});

try {
  await ensureProjectSchema();
  await ensureInterviewSchema();
  await ensureContentLifecycleSchema();
  await ensureRbacSchema();
  await ensureCmsSchema();
  await ensureMediaGovernanceSchema();
  await ensureContentVersionSchema();
  await ensureApiDailySnapshotSchema();
  await seedInterviewDefaultsIfEmpty();
  await backfillProjectAiSummariesIfNeeded();
  await syncConfiguredAdminUser();
} catch (error) {
  markDatabaseUnavailable(error, "startup database");
}

async function warmPublicPerformanceCaches() {
  if (!databaseAvailable) return;
  const localOrigin = `http://127.0.0.1:${config.port}`;
  const headers = { Accept: "application/json", "x-client-key": "server-prewarm" };
  await getInterviewPublicQuestionIndex().catch((error) => console.warn("interview index prewarm skipped", error?.message || error));
  if (typeof fetch !== "function") return;
  const paths = [
    "/api/site/texts",
    "/api/interview/plan",
    "/api/interview/questions?goalIds=1&limit=24&page=1&order=mixed&compact=1",
    "/api/interview/tags?goalIds=1&limit=48",
    "/api/weather/current",
    "/api/music/ddv?limit=5",
    "/api/thinking/questions?limit=3"
  ];
  await Promise.allSettled(paths.map((pathName) =>
    fetch(localOrigin + pathName, { headers }).then((response) => response.arrayBuffer())
  ));
}

server.listen(config.port, config.host, () => {
  console.log(`blog backend listening on ${config.host}:${config.port}`);
  setTimeout(() => {
    warmPublicPerformanceCaches().catch((error) => console.warn("public cache prewarm skipped", error?.message || error));
  }, 1200);
});

if (databaseAvailable) {
  startGithubContributionsRefresher();
  startGithubRepositoriesRefresher();
  startMoyuDailySnapshotRefresher();
  startDailyApiSnapshotRefresher();
}
