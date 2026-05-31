import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.js";
import { getOne, query } from "./db.js";
import { cacheDel, cacheGet, cacheSet } from "./redis.js";
import { currentUser, hashPassword, signSession, verifyPassword } from "./auth.js";
import { markdownToHtml, stripMarkdown } from "./markdown.js";
import { searchContent, syncSearchIndex } from "./search.js";

const json = (res, data, status = 200, headers = {}) => {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(body);
};

const githubFetchTimeoutMs = 20000;

const html = (res, body, status = 200) => {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
};

const redirect = (res, location) => {
  res.writeHead(302, { Location: location });
  res.end();
};

const adminStaticRoot = path.resolve(process.cwd(), "public", "admin");
const adminIndexFile = path.join(adminStaticRoot, "index.html");
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

async function readBody(req) {
  const raw = (await readRawBuffer(req)).toString("utf8");
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
        text: buffer.toString("utf8").replace(/^\uFEFF/, "")
      };
    } else {
      fields[name] = buffer.toString("utf8");
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
    await query("INSERT INTO users(username,password_hash,created_at) VALUES(:username,:hash,NOW())", { username, hash: nextHash });
    return;
  }
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
      background:url("/assets/sailei/hero-1100.jpg") center / cover no-repeat;
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
    .footer-link-row input{
      margin-bottom:12px;
    }
    @media(max-width:1040px){
      .admin-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      .editor-layout{grid-template-columns:1fr}
      .meta-card{position:relative;top:auto}
      .footer-link-row{grid-template-columns:1fr}
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
      .footer-link-row{grid-template-columns:1fr}
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="side">
      <a class="brand" href="/admin">
        <span class="brand-mark">JL</span>
        <span><strong>Jlemonz</strong><small>admin workspace</small></span>
      </a>
      <nav aria-label="后台导航">
        <a href="/admin">概览</a>
        <a href="/admin/posts">文章</a>
        <a href="/admin/moments">瞬间</a>
        <a href="/admin/projects">项目</a>
        <a href="/admin/texts">文案</a>
        <a href="/admin/settings">设置</a>
        <a href="/admin/logout">退出</a>
      </nav>
    </aside>
    <main class="main">
      <div class="topbar">
        <div>
          <h1>${title}</h1>
          <p class="admin-note">写作、记录和维护入口，只在内网使用。</p>
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
  { text: "她只是回了一个嗯，我却把今天的坏心情都原谅了。", from: "舔狗日记" },
  { text: "我把消息撤回了，像把自己也撤回了一点。", from: "舔狗日记" },
  { text: "你说早点睡，我听成了你还关心我。", from: "舔狗日记" },
  { text: "她朋友圈三天可见，我连旧梦都翻不到。", from: "舔狗日记" },
  { text: "她不是敷衍我，她只是本来就没打算认真看。", from: "舔狗日记" },
  { text: "怕打扰她，又怕她没人打扰也想不起我。", from: "舔狗日记" },
  { text: "她路过我的生活，我把余光留到天黑。", from: "舔狗日记" },
  { text: "我不是没脾气，只是舍不得把脾气用在她身上。", from: "舔狗日记" }
];

const frontendTextDefaults = [
  { group: "全站导航", key: "shared.nav.home", label: "导航：首页", defaultValue: "首页" },
  { group: "全站导航", key: "shared.nav.moments", label: "导航：瞬间", defaultValue: "瞬间" },
  { group: "全站导航", key: "shared.nav.archive", label: "导航：小记", defaultValue: "小记" },
  { group: "全站导航", key: "shared.nav.projects", label: "导航：项目", defaultValue: "项目" },
  { group: "全站导航", key: "shared.nav.about", label: "导航：关于", defaultValue: "关于" },
  { group: "全站搜索", key: "shared.search.tip", label: "顶部搜索提示", defaultValue: "搜索" },
  { group: "全站搜索", key: "shared.search.placeholder", label: "顶部搜索框占位", defaultValue: "搜索" },
  { group: "全站搜索", key: "shared.search.title", label: "搜索弹窗标题", defaultValue: "找一条旧记录" },
  { group: "全站搜索", key: "shared.search.input", label: "搜索弹窗输入提示", defaultValue: "试试 Linux、服务器、博客、驱动学习..." },
  { group: "首页", key: "home.hero.kicker", label: "首页 Hero 小字", defaultValue: "Pi5 / Linux / Notes" },
  { group: "首页", key: "home.hero.title", label: "首页标题", defaultValue: "Jlemonz" },
  { group: "首页", key: "home.hero.lead", label: "首页主说明", defaultValue: "Linux、服务器和一些小记" },
  { group: "首页", key: "home.status.build.title", label: "首页状态卡 1 标题", defaultValue: "REVIEW" },
  { group: "首页", key: "home.status.build.body", label: "首页状态卡 1 说明", defaultValue: "梳理踩坑记录，总结技术心得，说不明白=不明白，问了AI就是不会" },
  { group: "首页", key: "home.status.trace.title", label: "首页状态卡 2 标题", defaultValue: "THINK" },
  { group: "首页", key: "home.status.trace.body", label: "首页状态卡 2 说明", defaultValue: "真的很懂吗？底层了解吗？底层这两个字了解吗？\n爱就是爱，不爱就是不爱" },
  { group: "首页", key: "home.status.mode.title", label: "首页状态卡 3 标题", defaultValue: "PLAIN" },
  { group: "首页", key: "home.status.mode.body", label: "首页状态卡 3 说明", defaultValue: "两点一线，三点共面" },
  { group: "首页", key: "home.profile.body", label: "首页头像卡说明", defaultValue: "今日摸鱼模块已接入站内接口，可随机切换展示。" },
  { group: "瞬间页", key: "moments.hero.kicker", label: "瞬间页小字", defaultValue: "moments" },
  { group: "瞬间页", key: "moments.hero.title", label: "瞬间页标题", defaultValue: "瞬间" },
  { group: "瞬间页", key: "moments.hero.lead", label: "瞬间页说明", defaultValue: "短记录、项目进度和当天状态都先放在这里。文案再长也会自动换行，不再把右侧工具栏或标签挤歪。" },
  { group: "瞬间页", key: "moments.draft.title", label: "草稿卡标题", defaultValue: "写之前先记一" },
  { group: "瞬间页", key: "moments.draft.input", label: "草稿输入提示", defaultValue: "今天折腾了什么..." },
  { group: "瞬间页", key: "moments.draft.note", label: "草稿说明", defaultValue: "公开页只展示效果，真正发布仍走后台。" },
  { group: "札记页", key: "archive.hero.kicker", label: "札记页小字", defaultValue: "notes" },
  { group: "小记页", key: "archive.hero.title", label: "小记页标题", defaultValue: "小记" },
  { group: "小记页", key: "archive.hero.lead", label: "小记页说明", defaultValue: "文章、调试记录和长一点的想法都收在这里。标题再长也会被稳稳排版，之后顺着线索找回来就行。" },
  { group: "札记页", key: "archive.search.kicker", label: "札记搜索小字", defaultValue: "find back" },
  { group: "札记页", key: "archive.search.placeholder", label: "札记过滤提示", defaultValue: "在札记里过滤标题..." },
  { group: "札记页", key: "archive.github.title", label: "札记 GitHub 标题", defaultValue: "最近一年的密度" },
  { group: "项目页", key: "projects.hero.kicker", label: "项目页小字", defaultValue: "projects" },
  { group: "项目页", key: "projects.hero.title", label: "项目页标题", defaultValue: "项目" },
  { group: "项目页", key: "projects.hero.lead", label: "项目页说明", defaultValue: "这里按项目保留当前状态、最近进展和下一步。项目名或说明很长时，卡片会自动换行，不会把布局撑乱。" },
  { group: "项目页", key: "projects.roadmap.title", label: "下一步标题", defaultValue: "下一步" },
  { group: "项目页", key: "projects.maintain.title", label: "维护规则标题", defaultValue: "长期维护的规则" },
  { group: "项目页", key: "projects.maintain.body", label: "维护规则说明", defaultValue: "项目页只放公开、可复盘的进度，不放管理入口、内部端口和密钥。需要运维信息时，回服务器上的维护文档查。" },
  { group: "关于页", key: "about.hero.kicker", label: "关于页小字", defaultValue: "about" },
  { group: "关于页", key: "about.hero.title", label: "关于页标题", defaultValue: "关于" },
  { group: "关于页", key: "about.hero.lead", label: "关于页说明", defaultValue: "这里放站点状态、留言和联系入口。页面内容会跟随后台文案变化，但布局会自动收住长句和长标签。" },
  { group: "关于页", key: "about.current.title", label: "当前状态标题", defaultValue: "当前状态" },
  { group: "关于页", key: "about.current.state", label: "当前状态标签", defaultValue: "在线折腾" },
  { group: "关于页", key: "about.current.body", label: "当前状态说明", defaultValue: "本周主要在看 Linux 驱动和博客页面，也在把服务器的公开入口、备份和后台整理成长期可维护的状态。" },
  { group: "关于页", key: "about.stack.title", label: "技术栈标题", defaultValue: "站点后面会用到的东西" },
  { group: "关于页", key: "about.comments.title", label: "留言标题", defaultValue: "留言" },
  { group: "关于页", key: "about.contact.title", label: "联系标题", defaultValue: "联系" },
  { group: "关于页", key: "about.contact.body", label: "联系说明", defaultValue: "公开页面只放普通联系入口，不放私有服务、管理入口或内部地址。" },
  { group: "详情页", key: "detail.project.comments", label: "项目评论标题", defaultValue: "项目评论" },
  { group: "详情页", key: "detail.project.rule.title", label: "项目原则标题", defaultValue: "记录原则" },
  { group: "详情页", key: "detail.project.rule.body", label: "项目原则说明", defaultValue: "项目详情页只写公开可复盘内容，不放管理入口、内网端口和敏感配置。" },
  { group: "详情页", key: "detail.post.comments", label: "札记评论标题", defaultValue: "札记评论" },
  { group: "详情页", key: "detail.post.public.title", label: "公开札记标题", defaultValue: "公开札记" },
  { group: "详情页", key: "detail.post.public.body", label: "公开札记说明", defaultValue: "这里只展示可以公开复盘的记录，不放后台入口、内网地址和敏感配置。" }
];

const footerSectionLimit = 4;
const footerLinkLimit = 6;
const footerSettingKey = "footer_sections_v1";
const defaultFooterSections = [
  {
    title: "友链",
    links: [
      { label: "GitHub", href: "https://github.com/Jlemonz", desc: "代码和项目记录" },
      { label: "交换友链", href: "/about.html#contact", desc: "留言或邮件联系" }
    ]
  },
  {
    title: "图库",
    links: [
      { label: "瞬间图文", href: "/moments.html", desc: "日常图文入口" },
      { label: "项目图片", href: "/projects.html", desc: "项目相关素材" },
      { label: "素材联系", href: "/about.html#contact", desc: "补充图片从这里联系" }
    ]
  }
];
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
const defaultFrontendUi = {
  profile: {
    avatarUrl: "/assets/sailei/avatar.jpg"
  },
  archiveCategories: [
    { id: "all", label: "全部", slug: "", description: "所有公开札记", countText: "", href: "/archive.html", visibleInHome: false, visibleInArchive: true, sortOrder: 0 },
    { id: "linux", label: "Linux", slug: "linux", description: "命令、驱动、系统记录", countText: "18", href: "/archive.html?cat=linux", visibleInHome: true, visibleInArchive: true, sortOrder: 10 },
    { id: "raspberry-pi", label: "树莓", slug: "raspberry-pi", description: "家庭服务器和小实验", countText: "12", href: "/archive.html?cat=raspberry-pi", visibleInHome: true, visibleInArchive: true, sortOrder: 20 },
    { id: "server", label: "服务", slug: "server", description: "Nginx、Docker、备份", countText: "15", href: "/archive.html?cat=server", visibleInHome: true, visibleInArchive: true, sortOrder: 30 },
    { id: "life", label: "生活", slug: "life", description: "不太正式的碎片", countText: "9", href: "/moments.html?kind=life", visibleInHome: true, visibleInArchive: true, sortOrder: 40 }
  ],
  aboutStackItems: [
    { id: "database", label: "PostgreSQL / MySQL 数据", visible: true, sortOrder: 10 },
    { id: "redis", label: "Redis 缓存", visible: true, sortOrder: 20 },
    { id: "meilisearch", label: "Meilisearch 搜索", visible: true, sortOrder: 30 },
    { id: "markdown", label: "Markdown 写作", visible: true, sortOrder: 40 },
    { id: "nginx", label: "Nginx 静态部署", visible: true, sortOrder: 50 },
    { id: "backup", label: "每日备份", visible: true, sortOrder: 60 }
  ],
  momentKinds: [
    { id: "all", label: "碎片", kind: "all", subLabel: "随手记", visible: true, sortOrder: 0 },
    { id: "project", label: "项目", kind: "project", subLabel: "进度留痕", visible: true, sortOrder: 10 },
    { id: "life", label: "生活", kind: "life", subLabel: "轻一点", visible: true, sortOrder: 20 },
    { id: "tech", label: "技术", kind: "tech", subLabel: "慢慢补", visible: false, sortOrder: 30 }
  ],
  pageChips: {
    archive: [
      { id: "article", label: "文章", subLabel: "长记录", visible: true, sortOrder: 10 },
      { id: "debug", label: "调试", subLabel: "可回溯", visible: true, sortOrder: 20 },
      { id: "note", label: "笔记", subLabel: "慢慢补", visible: true, sortOrder: 30 }
    ],
    projects: [
      { id: "public", label: "公开", subLabel: "只留可复盘内容", visible: true, sortOrder: 10 },
      { id: "progress", label: "进度", subLabel: "看得见", visible: true, sortOrder: 20 },
      { id: "next", label: "下一步", subLabel: "不丢线索", visible: true, sortOrder: 30 }
    ],
    about: [
      { id: "pi5", label: "Pi5", subLabel: "常驻服务", visible: true, sortOrder: 10 },
      { id: "linux", label: "Linux", subLabel: "边学边记", visible: true, sortOrder: 20 },
      { id: "blog", label: "Blog", subLabel: "长期整理", visible: true, sortOrder: 30 }
    ]
  },
  footer: {
    brandBody: "Linux、Pi5、项目和图文，慢慢归档。",
    tags: [
      { id: "pi5", label: "Pi5", visible: true, sortOrder: 10 },
      { id: "linux", label: "Linux", visible: true, sortOrder: 20 },
      { id: "gallery", label: "图库", visible: true, sortOrder: 30 }
    ]
  },
  searchSuggestions: [
    { id: "project-server", label: "树莓派家庭服务器", href: "/projects.html", visible: true, sortOrder: 10 },
    { id: "device-tree", label: "设备树绑定", href: "/moments.html", visible: true, sortOrder: 20 },
    { id: "archive", label: "札记", href: "/archive.html", visible: true, sortOrder: 30 }
  ],
  sectionTitles: {
    homeProjects: "Project",
    homeMoments: "Moments",
    homeCategory: "分类入口"
  }
};

function clientFingerprint(req) {
  const raw = `${req.headers["x-forwarded-for"] || req.socket.remoteAddress || ""}|${req.headers["user-agent"] || ""}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

function cleanText(value, maxLength) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
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
    return String(value).split(/[,，]/).map((item) => item.trim()).filter(Boolean);
  }
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

function formatDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function projectUpdateLabel(value = new Date()) {
  const formatted = formatDateTime(value);
  return formatted ? `最近更新：${formatted}` : "最近更新：刚刚";
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
    updated_at: updatedAt ? formatDateTime(updatedAt) : "",
    last_update: computedUpdate || row.last_update || projectUpdateLabel(new Date())
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
    WHERE c.target=:target AND c.status='published'
    ORDER BY c.created_at DESC, c.id DESC LIMIT 80`, { target });
}

async function deleteCommentsForTarget(target) {
  if (!target) return;
  await query(`DELETE FROM reactions
    WHERE kind='like'
      AND target IN (SELECT CONCAT('comment:', id) FROM comments WHERE target=:target)`, { target });
  await query("DELETE FROM comments WHERE target=:target", { target });
}

async function ensureProjectSchema() {
  const statements = [
    "ALTER TABLE projects ADD COLUMN slug VARCHAR(160) NULL",
    "ALTER TABLE projects ADD COLUMN summary VARCHAR(500) DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN content_md MEDIUMTEXT NULL",
    "ALTER TABLE projects ADD COLUMN cover_url VARCHAR(500) DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN created_at DATETIME NULL",
    "ALTER TABLE projects ADD COLUMN updated_at DATETIME NULL",
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

function option(value, label, selectedValue) {
  return `<option value="${escapeAttr(value)}" ${String(value) === String(selectedValue) ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function projectEditor(project = {}, notice = "") {
  const isEdit = Boolean(project.id);
  const content = project.content_md || `# ${project.name || "新项目"}\n\n## 当前状态\n\n\n## 最近更新\n\n\n## 下一步\n\n- `;
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
      <input name="name" value="${escapeAttr(project.name || "")}" placeholder="例如：树莓派家庭服务器；上传带 name 的 Markdown 时可留空">
      <label>Slug</label>
      <input name="slug" value="${escapeAttr(project.slug || "")}" placeholder="raspberry-pi-server">
      <label>卡片状态文案</label>
      <input name="status_text" value="${escapeAttr(project.status_text || "")}" placeholder="还在整理，先把公开入口和私有服务分清楚。">
      <label>摘要</label>
      <input name="summary" value="${escapeAttr(project.summary || "")}" placeholder="不填时自动从 Markdown 里截取">
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
        <li>项目状态为“前台显示”时，/api/projects 会立刻返回新内容。</li>
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

async function getFrontendTextMap() {
  const texts = Object.fromEntries(frontendTextDefaults.map((item) => [item.key, item.defaultValue]));
  const allowedKeys = new Set(frontendTextDefaults.map((item) => item.key));
  try {
    const rows = await query("SELECT setting_key, setting_value FROM site_settings WHERE setting_key LIKE 'site_text.%'");
    for (const row of rows) {
      const key = String(row.setting_key || "").replace(/^site_text\./, "");
      if (allowedKeys.has(key)) texts[key] = row.setting_value || "";
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
  if (/^(https?:\/\/|mailto:|\/(?!\/))/i.test(href)) return href;
  return "";
}

function cleanUiHref(value, fallback = "") {
  const href = String(value || "").trim().slice(0, 500);
  if (/^(https?:\/\/|mailto:|\/(?!\/))/i.test(href)) return href;
  return fallback;
}

function normalizeFooterSections(value) {
  const sections = Array.isArray(value) ? value : [];
  return sections.slice(0, footerSectionLimit).map((section) => {
    const title = cleanText(section?.title, 30);
    if (title === "站内" || title === "站内入口") return null;
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
  if (!raw) return fallback;
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

function normalizeUiList(value, fallback, normalizer, limit = 24) {
  const list = Array.isArray(value) ? value : fallback;
  const normalized = list.slice(0, limit).map((item, index) => normalizer(item, fallback[index] || {}, index)).filter(Boolean);
  return normalized.length ? normalized.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)) : fallback;
}

function normalizeArchiveCategory(item = {}, fallback = {}, index = 0) {
  const slug = cleanKey(item.slug ?? fallback.slug ?? "", "");
  const id = cleanKey(item.id || slug || fallback.id, `cat-${index + 1}`);
  const href = cleanUiHref(item.href || fallback.href || (slug ? `/archive.html?cat=${slug}` : "/archive.html"), slug ? `/archive.html?cat=${slug}` : "/archive.html");
  return {
    id,
    label: cleanText(item.label ?? fallback.label ?? "分类", 40),
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
    label: cleanText(item.label ?? fallback.label ?? "技术项", 60),
    visible: pickBoolean(item.visible, fallback.visible ?? true),
    sortOrder: normalizeSort(item.sortOrder, fallback.sortOrder ?? index * 10)
  };
}

function normalizeMomentKind(item = {}, fallback = {}, index = 0) {
  const kind = cleanKey(item.kind ?? fallback.kind ?? "", index === 0 ? "all" : `kind-${index + 1}`);
  return {
    id: cleanKey(item.id || kind || fallback.id, `kind-${index + 1}`),
    label: cleanText(item.label ?? fallback.label ?? "类型", 40),
    kind,
    subLabel: cleanText(item.subLabel ?? fallback.subLabel ?? "", 60),
    visible: pickBoolean(item.visible, fallback.visible ?? true),
    sortOrder: normalizeSort(item.sortOrder, fallback.sortOrder ?? index * 10)
  };
}

function normalizePageChip(item = {}, fallback = {}, index = 0) {
  return {
    id: cleanKey(item.id || fallback.id, `chip-${index + 1}`),
    label: cleanText(item.label ?? fallback.label ?? "标签", 40),
    subLabel: cleanText(item.subLabel ?? fallback.subLabel ?? "", 80),
    visible: pickBoolean(item.visible, fallback.visible ?? true),
    sortOrder: normalizeSort(item.sortOrder, fallback.sortOrder ?? index * 10)
  };
}

function normalizeFooterTag(item = {}, fallback = {}, index = 0) {
  return {
    id: cleanKey(item.id || fallback.id, `footer-tag-${index + 1}`),
    label: cleanText(item.label ?? fallback.label ?? "标签", 40),
    visible: pickBoolean(item.visible, fallback.visible ?? true),
    sortOrder: normalizeSort(item.sortOrder, fallback.sortOrder ?? index * 10)
  };
}

function normalizeSearchSuggestion(item = {}, fallback = {}, index = 0) {
  return {
    id: cleanKey(item.id || fallback.id, `suggestion-${index + 1}`),
    label: cleanText(item.label ?? fallback.label ?? "入口", 60),
    href: cleanUiHref(item.href || fallback.href || "/index.html", "/index.html"),
    visible: pickBoolean(item.visible, fallback.visible ?? true),
    sortOrder: normalizeSort(item.sortOrder, fallback.sortOrder ?? index * 10)
  };
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
    momentKinds: normalizeUiList(source.momentKinds, defaultFrontendUi.momentKinds, normalizeMomentKind, 20),
    pageChips: {
      archive: normalizeUiList(pageChips.archive, defaultFrontendUi.pageChips.archive, normalizePageChip, 12),
      projects: normalizeUiList(pageChips.projects, defaultFrontendUi.pageChips.projects, normalizePageChip, 12),
      about: normalizeUiList(pageChips.about, defaultFrontendUi.pageChips.about, normalizePageChip, 12)
    },
    footer: {
      brandBody: cleanText(footer.brandBody ?? defaultFrontendUi.footer.brandBody, 180),
      tags: normalizeUiList(footer.tags, defaultFrontendUi.footer.tags, normalizeFooterTag, 12)
    },
    searchSuggestions: normalizeUiList(source.searchSuggestions, defaultFrontendUi.searchSuggestions, normalizeSearchSuggestion, 12),
    sectionTitles: {
      homeProjects: cleanText(sectionTitles.homeProjects ?? defaultFrontendUi.sectionTitles.homeProjects, 40),
      homeMoments: cleanText(sectionTitles.homeMoments ?? defaultFrontendUi.sectionTitles.homeMoments, 40),
      homeCategory: cleanText(sectionTitles.homeCategory ?? defaultFrontendUi.sectionTitles.homeCategory, 40)
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
  if (!raw) return normalizeFrontendUi(defaultFrontendUi);
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
    texts[item.key] = String(incomingTexts[item.key] ?? item.defaultValue).slice(0, 1200);
  }
  return {
    texts,
    rules: String(source.rules || "").slice(0, 10000),
    footerSections: normalizeFooterSections(source.footerSections),
    layout: normalizeFrontendLayout(source.layout),
    ui: normalizeFrontendUi(source.ui)
  };
}

async function publishFrontendEditorPayload(payload, reason = "frontend-editor-publish") {
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
        <div><label>地址</label><input name="footer_section_${sectionIndex}_link_${linkIndex}_href" value="${escapeAttr(link.href)}" placeholder="/archive.html 或 https://example.com"></div>
        <div><label>说明</label><input name="footer_section_${sectionIndex}_link_${linkIndex}_desc" value="${escapeAttr(link.desc)}" placeholder="可留空"></div>
      </div>`).join("")}
    </section>`;
  }).join("")}</div>`;
}

function levelFromCount(count) {
  if (!count) return 0;
  if (count <= 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

async function fetchQuote() {
  const cacheKey = "site:quote:dog-xxapi-v1";
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const response = await fetch("https://v2.xxapi.cn/api/dog", {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`dog api status ${response.status}`);
    const payload = await response.json();
    const text = cleanText(payload?.data || "", 500);
    if (!text || payload?.code !== 200) throw new Error("dog api empty response");
    const quote = {
      text,
      from: "舔狗日记",
      source: "xxapi-dog",
      requestId: cleanText(payload?.request_id || "", 80)
    };
    await cacheSet(cacheKey, quote, 300);
    return quote;
  } catch (error) {
    console.warn("dog quote api failed", error);
  }

  const index = Math.floor(Date.now() / 300000) % fallbackQuotes.length;
  const quote = { ...fallbackQuotes[index], source: "sad-local" };
  await cacheSet(cacheKey, quote, 300);
  return quote;
}

function formatMoyuPayload(payload) {
  const data = payload?.data || {};
  const date = data.date || {};
  const today = data.today || {};
  const progress = data.progress || {};
  const countdown = data.countdown || {};
  const nextHoliday = data.nextHoliday || null;
  const nextWeekend = data.nextWeekend || null;
  const quote = cleanText(data.moyuQuote || "今天也要认真摸鱼。", 180);
  const dateLabel = [date.gregorian, date.weekday].filter(Boolean).join(" ");
  const modules = [
    {
      kind: "quote",
      label: "摸鱼格言",
      title: quote,
      body: dateLabel || "今日摸鱼状态",
      percent: null
    }
  ];

  for (const [kind, label] of [["week", "本周"], ["month", "本月"], ["year", "本年"]]) {
    const item = progress[kind];
    if (!item) continue;
    const percent = clampNumber(item.percentage, 0, 100, 0);
    modules.push({
      kind: `progress-${kind}`,
      label: `${label}进度`,
      title: `${percent}%`,
      body: `已过 ${item.passed || 0}/${item.total || 0} 天，还剩 ${item.remaining || 0} 天`,
      percent
    });
  }

  if (nextHoliday?.name) {
    modules.push({
      kind: "holiday",
      label: "下个假期",
      title: `${cleanText(nextHoliday.name, 24)} · ${nextHoliday.until ?? "?"} 天`,
      body: `${cleanText(nextHoliday.date || "", 20)} 开始，可摸 ${nextHoliday.duration || 0} 天`,
      percent: null
    });
  }

  if (nextWeekend) {
    const days = Number(countdown.toWeekEnd ?? nextWeekend.daysUntil ?? 0);
    modules.push({
      kind: "weekend",
      label: "周末倒计时",
      title: days <= 0 ? "今天就能松一口气" : `离周末 ${days} 天`,
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

function fallbackMoyuSnapshot() {
  return {
    source: "moyu-local",
    fetchedAt: new Date().toISOString(),
    snapshotDay: chinaDateKey(),
    date: {},
    status: { isWeekend: false, isHoliday: false, isWorkday: false, label: "记录中" },
    quote: "摸鱼接口暂时不可用，先休息一下。",
    modules: [
      {
        kind: "fallback",
        label: "当前状态",
        title: "摸鱼接口暂时不可用",
        body: "先休息一下，稍后再刷新。",
        percent: null
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

async function fetchMoyuFromRemote() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch("https://apis.uctb.cn/api/moyu?encoding=json", {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`moyu api status ${response.status}`);
    const payload = await response.json();
    if (payload?.code !== 200 || !payload?.data) throw new Error("moyu api empty response");
    return formatMoyuPayload(payload);
  } finally {
    clearTimeout(timeout);
  }
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

function parseContributionCells(htmlText) {
  const days = [];
  const cellPattern = /<td\b[^>]*data-date="([^"]+)"[^>]*>/g;
  let match;
  while ((match = cellPattern.exec(htmlText))) {
    const cell = match[0];
    const countMatch = cell.match(/data-count="(\d+)"/);
    const levelMatch = cell.match(/data-level="(\d+)"/);
    const count = countMatch ? Number(countMatch[1]) : 0;
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
  await cacheSet(`github:contrib:${normalized.username}`, normalized, 600);
  return normalized;
}

async function githubContributionsFromPublicPage(username) {
  const { from, to } = githubDateRange();
  const url = `https://github.com/users/${encodeURIComponent(username)}/contributions?from=${from}&to=${to}`;
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
  return !Number.isFinite(fetchedAt) || Date.now() - fetchedAt > 60 * 60 * 1000;
}

async function fetchGithubContributions(username) {
  const login = normalizeGithubLogin(username || await getSetting("github_username", config.github.username));
  const cacheKey = `github:contrib:${login}`;
  const cached = await cacheGet(cacheKey);
  if (cached?.days?.length) return cached;

  const snapshot = await getGithubSnapshot(login);
  if (snapshot?.days?.length) {
    await cacheSet(cacheKey, snapshot, 600);
    if (isGithubSnapshotStale(snapshot)) {
      refreshGithubContributionsSnapshot(login).catch((error) => console.warn("github background refresh failed", error));
    }
    return snapshot;
  }

  return refreshGithubContributionsSnapshot(login);
}

function startGithubContributionsRefresher() {
  const run = async () => {
    try {
      const username = await getSetting("github_username", config.github.username);
      await refreshGithubContributionsSnapshot(username);
    } catch (error) {
      console.warn("github scheduled refresh failed", error);
    }
  };
  setTimeout(run, 5000);
  setInterval(run, 60 * 60 * 1000);
}

async function requireAdmin(req, res) {
  const user = await currentUser(req);
  if (!user) {
    redirect(res, "/admin/login");
    return null;
  }
  return user;
}

async function requireAdminJson(req, res) {
  const user = await currentUser(req);
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
  return raw.split(/[,，]/).map((item) => cleanText(item, 40)).filter(Boolean).slice(0, 12);
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

async function saveUploadedImage(file) {
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
  return {
    url: publicUploadUrl(relativePath),
    filename: name,
    contentType,
    size: file.buffer.length
  };
}

function adminMoment(row) {
  return { ...row, tags: parseTags(row.tags) };
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

async function getAdminPost(id) {
  return getOne("SELECT * FROM posts WHERE id=:id", { id });
}

async function getAdminProject(id) {
  return getOne("SELECT * FROM projects WHERE id=:id", { id });
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
    query("SELECT id,title,slug,summary,cover_url,status,published_at,created_at,updated_at FROM posts ORDER BY updated_at DESC,id DESC LIMIT 120"),
    query("SELECT * FROM projects ORDER BY sort_order ASC,id ASC LIMIT 120"),
    query("SELECT id,content,kind,tags,image_url,status,created_at,updated_at FROM moments ORDER BY created_at DESC,id DESC LIMIT 120"),
    query(`SELECT c.id, c.target, c.author_name, c.author_email, c.content,
        c.status, c.created_at, COALESCE(r.count, 0) AS likes
      FROM comments c
      LEFT JOIN reactions r ON r.target=CONCAT('comment:', c.id) AND r.kind='like'
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

async function adminApi(req, res, url) {
  if (url.pathname === "/admin/api/login" && req.method === "POST") {
    const body = await readAdminObject(req);
    const username = String(body.username || "").trim();
    const password = String(body.password ?? "");
    const user = await getOne("SELECT * FROM users WHERE username=:username", { username });
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

  const user = await requireAdminJson(req, res);
  if (!user) return;

  if (url.pathname === "/admin/api/me" && req.method === "GET") {
    return json(res, { user });
  }

  if (url.pathname === "/admin/api/overview" && req.method === "GET") {
    const [stats] = await query(`
      SELECT
        (SELECT COUNT(*) FROM posts) AS posts,
        (SELECT COUNT(*) FROM posts WHERE status='published') AS publishedPosts,
        (SELECT COUNT(*) FROM posts WHERE status='draft') AS draftPosts,
        (SELECT COUNT(*) FROM moments) AS moments,
        (SELECT COUNT(*) FROM projects) AS projects,
        (SELECT COUNT(*) FROM projects WHERE status='active') AS activeProjects,
        (SELECT COUNT(*) FROM comments) AS comments
    `);
    const recentPosts = await query("SELECT id,title,slug,status,published_at,created_at,updated_at FROM posts ORDER BY updated_at DESC,id DESC LIMIT 6");
    const recentProjects = await query("SELECT id,name,slug,progress,status,updated_at FROM projects ORDER BY updated_at DESC,id DESC LIMIT 6");
    const recentMoments = await query("SELECT id,content,kind,status,created_at FROM moments ORDER BY created_at DESC,id DESC LIMIT 6");
    return json(res, { stats, recentPosts, recentProjects, recentMoments });
  }

  if (url.pathname === "/admin/api/sync-search" && req.method === "POST") {
    const count = await syncSearchIndex();
    return json(res, { count });
  }

  if (url.pathname === "/admin/api/uploads" && req.method === "POST") {
    try {
      const body = await readForm(req);
      const file = body.files?.file || body.files?.image;
      return json(res, await saveUploadedImage(file), 201);
    } catch (error) {
      return json(res, {
        error: "upload_failed",
        message: error.message || "图片上传失败"
      }, error.status || 400);
    }
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const resource = parts[2];
  const id = cleanId(parts[3] || "");
  const action = parts[4] || "";

  if (resource === "posts") {
    if (req.method === "GET" && !id) {
      const where = [];
      const params = {};
      const status = url.searchParams.get("status");
      const q = cleanText(url.searchParams.get("q") || "", 120);
      if (["draft", "published"].includes(status)) {
        where.push("status=:status");
        params.status = status;
      }
      if (q) {
        where.push("(title LIKE :q OR slug LIKE :q)");
        params.q = `%${q}%`;
      }
      const rows = await query(`SELECT id,title,slug,summary,cover_url,status,published_at,created_at,updated_at
        FROM posts ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY updated_at DESC,id DESC LIMIT 120`, params);
      return json(res, { items: rows });
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
        return json(res, await getAdminPost(result.insertId), 201);
      } catch (error) {
        if (error.errno === 1062) return json(res, { error: "duplicate_slug", message: "Slug 已经被使用" }, 409);
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
        return json(res, await getAdminPost(id));
      } catch (error) {
        if (error.errno === 1062) return json(res, { error: "duplicate_slug", message: "Slug 已经被使用" }, 409);
        throw error;
      }
    }
    if (req.method === "POST" && id && action === "hide") {
      await query("UPDATE posts SET status='draft', updated_at=NOW() WHERE id=:id", { id });
      await cacheDel("site:overview");
      await syncSearchIndex();
      return json(res, { ok: true });
    }
    if (req.method === "DELETE" && id) {
      const post = await getAdminPost(id);
      if (post) {
        const target = post.slug ? `post:${post.slug}` : "";
        await query("DELETE FROM posts WHERE id=:id", { id });
        if (target) {
          await deleteCommentsForTarget(target);
          await query("DELETE FROM reactions WHERE target=:target", { target });
        }
        await cacheDel("site:overview");
        await syncSearchIndex();
      }
      return json(res, { ok: true });
    }
  }

  if (resource === "moments") {
    if (req.method === "GET" && !id) {
      const where = [];
      const params = {};
      const status = url.searchParams.get("status");
      const kind = cleanMomentKindFilter(url.searchParams.get("kind"));
      if (["draft", "published"].includes(status)) {
        where.push("status=:status");
        params.status = status;
      }
      if (kind) {
        where.push("kind=:kind");
        params.kind = kind;
      }
      const rows = await query(`SELECT id,content,kind,tags,image_url,status,created_at,updated_at
        FROM moments ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY created_at DESC,id DESC LIMIT 120`, params);
      return json(res, { items: rows.map(adminMoment) });
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
      const row = await getOne("SELECT * FROM moments WHERE id=:id", { id: result.insertId });
      return json(res, adminMoment(row), 201);
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
      const row = await getOne("SELECT * FROM moments WHERE id=:id", { id });
      return json(res, adminMoment(row));
    }
    if (req.method === "POST" && id && action === "hide") {
      await query("UPDATE moments SET status='draft', updated_at=NOW() WHERE id=:id", { id });
      await cacheDel("site:overview");
      return json(res, { ok: true });
    }
    if (req.method === "DELETE" && id) {
      await query("DELETE FROM moments WHERE id=:id", { id });
      await cacheDel("site:overview");
      return json(res, { ok: true });
    }
  }

  if (resource === "projects") {
    if (req.method === "GET" && !id) {
      const where = [];
      const params = {};
      const status = url.searchParams.get("status");
      const q = cleanText(url.searchParams.get("q") || "", 120);
      if (["active", "archived"].includes(status)) {
        where.push("status=:status");
        params.status = status;
      }
      if (q) {
        where.push("(name LIKE :q OR slug LIKE :q)");
        params.q = `%${q}%`;
      }
      const rows = await query(`SELECT * FROM projects ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY sort_order ASC,id ASC LIMIT 120`, params);
      return json(res, { items: rows.map(publicProject) });
    }
    if (req.method === "GET" && id) {
      const project = await getAdminProject(id);
      return project ? json(res, publicProject(project)) : json(res, { error: "not_found" }, 404);
    }
    if (req.method === "POST" && !id) {
      const payload = normalizeProjectPayload(await readAdminObject(req));
      if (!payload.content_md.trim()) return json(res, { error: "content_required", message: "Markdown 正文不能为空" }, 400);
      try {
        const result = await query(`INSERT INTO projects
          (name, slug, summary, status_text, progress, last_update, status, sort_order, content_md, cover_url, created_at, updated_at)
          VALUES(:name, :slug, :summary, :status_text, :progress, :last_update, :status, :sort_order, :content_md, :cover_url, NOW(), NOW())`, payload);
        await cacheDel("site:overview");
        return json(res, publicProject(await getAdminProject(result.insertId)), 201);
      } catch (error) {
        if (error.errno === 1062) return json(res, { error: "duplicate_slug", message: "Slug 已经被使用" }, 409);
        throw error;
      }
    }
    if (req.method === "PUT" && id) {
      const current = await getAdminProject(id);
      if (!current) return json(res, { error: "not_found" }, 404);
      const payload = { ...normalizeProjectPayload(await readAdminObject(req), current), id };
      if (!payload.content_md.trim()) return json(res, { error: "content_required", message: "Markdown 正文不能为空" }, 400);
      try {
        await query(`UPDATE projects
          SET name=:name, slug=:slug, summary=:summary, status_text=:status_text, progress=:progress,
            last_update=:last_update, status=:status, sort_order=:sort_order, content_md=:content_md,
            cover_url=:cover_url, updated_at=NOW()
          WHERE id=:id`, payload);
        await cacheDel("site:overview");
        return json(res, publicProject(await getAdminProject(id)));
      } catch (error) {
        if (error.errno === 1062) return json(res, { error: "duplicate_slug", message: "Slug 已经被使用" }, 409);
        throw error;
      }
    }
    if (req.method === "POST" && id && action === "hide") {
      await query("UPDATE projects SET status='archived', updated_at=NOW() WHERE id=:id", { id });
      await cacheDel("site:overview");
      return json(res, { ok: true });
    }
    if (req.method === "DELETE" && id) {
      const project = await getAdminProject(id);
      if (project) {
        const target = `project:${project.id}`;
        await deleteCommentsForTarget(target);
        await query("DELETE FROM reactions WHERE target=:target", { target });
        await query("DELETE FROM projects WHERE id=:id", { id });
        await cacheDel("site:overview");
      }
      return json(res, { ok: true });
    }
  }

  if (resource === "comments") {
    if (req.method === "GET" && !id) {
      const where = [];
      const params = {};
      const status = url.searchParams.get("status");
      const target = cleanText(url.searchParams.get("target") || "", 160);
      const q = cleanText(url.searchParams.get("q") || "", 120);
      if (["pending", "published", "hidden"].includes(status)) {
        where.push("c.status=:status");
        params.status = status;
      }
      if (target) {
        where.push("c.target=:target");
        params.target = target;
      }
      if (q) {
        where.push("(c.author_name LIKE :q OR c.content LIKE :q OR c.target LIKE :q)");
        params.q = `%${q}%`;
      }
      const rows = await query(`SELECT c.id, c.target, c.author_name, c.author_email, c.content,
          c.status, c.created_at, COALESCE(r.count, 0) AS likes
        FROM comments c
        LEFT JOIN reactions r ON r.target=CONCAT('comment:', c.id) AND r.kind='like'
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY c.created_at DESC, c.id DESC LIMIT 200`, params);
      return json(res, { items: rows });
    }
    if (req.method === "GET" && id) {
      const row = await getOne(`SELECT c.id, c.target, c.author_name, c.author_email, c.content,
          c.status, c.created_at, COALESCE(r.count, 0) AS likes
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
        content: cleanText(body.content || current.content, 800)
      };
      if (payload.content.length < 2) return json(res, { error: "content_too_short", message: "留言内容太短" }, 400);
      await query("UPDATE comments SET status=:status, author_name=:author_name, content=:content WHERE id=:id", payload);
      const row = await getOne(`SELECT c.id, c.target, c.author_name, c.author_email, c.content,
          c.status, c.created_at, COALESCE(r.count, 0) AS likes
        FROM comments c
        LEFT JOIN reactions r ON r.target=CONCAT('comment:', c.id) AND r.kind='like'
        WHERE c.id=:id`, { id });
      return json(res, row);
    }
    if (req.method === "POST" && id && ["publish", "hide"].includes(action)) {
      const status = action === "publish" ? "published" : "hidden";
      await query("UPDATE comments SET status=:status WHERE id=:id", { id, status });
      return json(res, { ok: true });
    }
    if (req.method === "DELETE" && id) {
      await query("DELETE FROM reactions WHERE target=:target AND kind='like'", { target: commentLikeTarget(id) });
      await query("DELETE FROM comments WHERE id=:id", { id });
      return json(res, { ok: true });
    }
  }

  if (resource === "site-texts") {
    if (req.method === "GET") return json(res, await adminSiteTextsPayload());
    if (req.method === "PUT") {
      const body = await readAdminObject(req);
      const incomingTexts = body.texts && typeof body.texts === "object" ? body.texts : {};
      for (const item of frontendTextDefaults) {
        const value = String(incomingTexts[item.key] ?? "").slice(0, 1200);
        await setSetting(`site_text.${item.key}`, value);
      }
      await setSetting(footerSettingKey, JSON.stringify(normalizeFooterSections(body.footerSections)));
      if (body.layout) await setSetting(frontendLayoutSettingKey, JSON.stringify(normalizeFrontendLayout(body.layout)));
      if (body.ui) await setSetting(frontendUiSettingKey, JSON.stringify(normalizeFrontendUi(body.ui)));
      await setSetting("site_text_rules", String(body.rules || "").slice(0, 10000));
      await cacheDel("site:texts");
      return json(res, await adminSiteTextsPayload());
    }
  }

  if (resource === "frontend-layout") {
    if (req.method === "GET") return json(res, await adminFrontendLayoutPayload());
    if (req.method === "PUT") {
      const body = await readAdminObject(req);
      const layout = normalizeFrontendLayout(body.layout || body);
      await setSetting(frontendLayoutSettingKey, JSON.stringify(layout));
      if (body.ui) await setSetting(frontendUiSettingKey, JSON.stringify(normalizeFrontendUi(body.ui)));
      await cacheDel("site:texts");
      return json(res, await adminFrontendLayoutPayload());
    }
  }

  if (resource === "frontend-editor") {
    if (req.method === "GET") return json(res, await adminFrontendEditorPayload());
    if (parts[3] === "draft") {
      if (req.method === "PUT") {
        const body = await readAdminObject(req);
        const draft = await setFrontendEditorDraft(body.payload || body);
        return json(res, { ok: true, draft: { savedAt: draft.savedAt, payload: draft.payload } });
      }
      if (req.method === "DELETE") {
        await clearFrontendEditorDraft();
        return json(res, { ok: true });
      }
    }
    if (req.method === "POST" && parts[3] === "publish") {
      const body = await readAdminObject(req);
      const draft = body.payload ? null : await getFrontendEditorDraft();
      await publishFrontendEditorPayload(body.payload || draft?.payload || body, "frontend-editor-publish");
      await clearFrontendEditorDraft();
      return json(res, await adminFrontendEditorPayload());
    }
    if (req.method === "POST" && parts[3] === "restore") {
      const backup = await getFrontendEditorBackup();
      if (!backup) return json(res, { error: "backup_not_found", message: "没有可恢复的上一版" }, 404);
      for (const item of frontendTextDefaults) {
        await setSetting(`site_text.${item.key}`, String(backup.texts?.[item.key] ?? item.defaultValue).slice(0, 1200));
      }
      await setSetting("site_text_rules", String(backup.rules || "").slice(0, 10000));
      await setSetting(footerSettingKey, JSON.stringify(normalizeFooterSections(backup.footerSections)));
      await setSetting(frontendLayoutSettingKey, JSON.stringify(normalizeFrontendLayout(backup.layout)));
      await setSetting(frontendUiSettingKey, JSON.stringify(normalizeFrontendUi(backup.ui)));
      await cacheDel("site:texts");
      await clearFrontendEditorDraft();
      return json(res, await adminFrontendEditorPayload());
    }
    if (req.method === "PUT") {
      const body = await readAdminObject(req);
      await publishFrontendEditorPayload(body.payload || body, "frontend-editor-save");
      await clearFrontendEditorDraft();
      return json(res, await adminFrontendEditorPayload());
    }
  }

  if (resource === "settings") {
    if (req.method === "GET") {
      const githubUsername = await getSetting("github_username", config.github.username || "Jlemonz");
      return json(res, { githubUsername });
    }
    if (req.method === "PUT") {
      const body = await readAdminObject(req);
      const githubUsername = cleanText(body.githubUsername || body.github_username || config.github.username || "Jlemonz", 40).replace(/[^a-zA-Z0-9-]/g, "") || "Jlemonz";
      await setSetting("github_username", githubUsername);
      await cacheDel([`github:contrib:${githubUsername}`, `github:contrib:${githubUsername.toLowerCase()}`]);
      refreshGithubContributionsSnapshot(githubUsername).catch((error) => console.warn("github refresh after settings save failed", error));
      return json(res, { githubUsername });
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
  if (url.pathname === "/api/health") return json(res, { ok: true });
  if (url.pathname === "/api/quote") return json(res, await fetchQuote());
  if (url.pathname === "/api/moyu") return json(res, await fetchMoyu());
  if (url.pathname === "/api/site/texts") {
    const cached = await cacheGet("site:texts");
    if (cached) return json(res, cached);
    const texts = await getFrontendTextMap();
    const rules = parseFrontendTextRules(await getSetting("site_text_rules", ""));
    const footerSections = await getFooterSections();
    const layout = await getFrontendLayout();
    const ui = await getFrontendUi();
    const payload = { texts, rules, footerSections, layout, ui };
    await cacheSet("site:texts", payload, 60);
    return json(res, payload);
  }
  if (url.pathname === "/api/github/contributions") {
    const configuredUsername = await getSetting("github_username", config.github.username);
    try {
      return json(res, await fetchGithubContributions(configuredUsername));
    } catch (error) {
      console.error(error);
      return json(res, { username: configuredUsername, total: 0, days: [], source: "fallback" });
    }
  }
  if (url.pathname === "/api/reactions") {
    const target = cleanText(url.searchParams.get("target") || "site-home", 160);
    const row = await getOne("SELECT count FROM reactions WHERE target=:target AND kind='like'", { target });
    return json(res, { target, likes: row?.count || 0 });
  }
  if (url.pathname === "/api/reactions/like" && req.method === "POST") {
    const body = await readBody(req);
    const target = cleanText(body.target || "site-home", 160);
    const key = `like:${target}:${clientFingerprint(req)}`;
    const already = await cacheGet(key);
    if (!already) {
      await query(`INSERT INTO reactions(target,kind,count,updated_at)
        VALUES(:target,'like',1,NOW())
        ON DUPLICATE KEY UPDATE count=count+1, updated_at=NOW()`, { target });
      await cacheSet(key, { ok: true }, 86400);
    }
    const row = await getOne("SELECT count FROM reactions WHERE target=:target AND kind='like'", { target });
    return json(res, { target, likes: row?.count || 0, counted: !already });
  }
  if (url.pathname === "/api/comments" && req.method === "GET") {
    const target = cleanText(url.searchParams.get("target") || "site-home", 160);
    return json(res, { target, items: await publicCommentsForTarget(target) });
  }
  if (url.pathname === "/api/comments" && req.method === "POST") {
    const body = await readBody(req);
    const target = cleanText(body.target || "site-home", 160);
    const author_name = cleanText(body.author_name || "路过的人", 80);
    const author_email = cleanText(body.author_email || "", 160);
    const content = cleanText(body.content, 800);
    if (content.length < 2) return json(res, { error: "content_too_short" }, 400);
    await query(`INSERT INTO comments(target,author_name,author_email,content,status,created_at)
      VALUES(:target,:author_name,:author_email,:content,'published',NOW())`, {
      target, author_name, author_email, content
    });
    return json(res, { target, items: await publicCommentsForTarget(target) }, 201);
  }
  if (url.pathname === "/api/site/overview") {
    const cached = await cacheGet("site:overview");
    if (cached) return json(res, cached);
    const [stats] = await query(`
      SELECT
        (SELECT COUNT(*) FROM posts WHERE status='published') AS posts,
        (SELECT COUNT(*) FROM moments WHERE status='published') AS moments,
        (SELECT COUNT(*) FROM projects WHERE status='active') AS projects,
        (SELECT COUNT(*) FROM categories) AS categories
    `);
    const latestMoments = await query("SELECT id, content, kind, tags, image_url, created_at FROM moments WHERE status='published' ORDER BY created_at DESC LIMIT 3");
    const data = { stats, latestMoments: latestMoments.map(adminMoment) };
    await cacheSet("site:overview", data, 90);
    return json(res, data);
  }
  if (url.pathname === "/api/posts") {
    const cat = cleanText(url.searchParams.get("cat") || "", 80).toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const params = {};
    const filters = ["p.status='published'"];
    if (cat) {
      filters.push("(LOWER(c.slug)=:cat OR LOWER(c.name)=:cat)");
      params.cat = cat;
    }
    const posts = await query(`
      SELECT p.id, p.title, p.slug, p.summary, p.cover_url, p.published_at, c.name AS category, c.slug AS category_slug
      FROM posts p LEFT JOIN categories c ON c.id=p.category_id
      WHERE ${filters.join(" AND ")}
      ORDER BY p.published_at DESC, p.id DESC
      LIMIT 30
    `, params);
    return json(res, { items: posts });
  }
  if (url.pathname.startsWith("/api/posts/")) {
    const slug = decodeURIComponent(url.pathname.split("/").pop());
    const post = await getOne(`
      SELECT p.*, c.name AS category
      FROM posts p
      LEFT JOIN categories c ON c.id=p.category_id
      WHERE p.slug=:slug AND p.status='published'
      LIMIT 1
    `, { slug });
    if (!post) return json(res, { error: "not_found" }, 404);
    return json(res, { ...post, content_html: markdownToHtml(post.content_md) });
  }
  if (url.pathname === "/api/moments") {
    const kind = cleanMomentKindFilter(url.searchParams.get("kind"));
    const rows = await query(
      `SELECT id, content, kind, tags, image_url, created_at FROM moments WHERE status='published' ${kind ? "AND kind=:kind" : ""} ORDER BY created_at DESC LIMIT 40`,
      kind ? { kind } : {}
    );
    return json(res, { items: rows.map((row) => ({ ...row, tags: parseTags(row.tags) })) });
  }
  if (url.pathname === "/api/projects") {
    const rows = await query("SELECT id, name, slug, summary, status_text, progress, last_update, sort_order, cover_url, created_at, updated_at FROM projects WHERE status='active' ORDER BY sort_order ASC, id ASC");
    return json(res, { items: rows.map(publicProject) });
  }
  if (url.pathname.startsWith("/api/projects/")) {
    const key = decodeURIComponent(url.pathname.split("/").pop());
    const isId = /^\d+$/.test(key);
    const project = await getOne(`SELECT id, name, slug, summary, status_text, progress, last_update, sort_order, cover_url, content_md, created_at, updated_at
      FROM projects WHERE status='active' AND ${isId ? "id=:key" : "slug=:key"} LIMIT 1`, { key });
    if (!project) return json(res, { error: "not_found" }, 404);
    const content = project.content_md || `# ${project.name}\n\n${project.status_text || ""}\n\n这里还没有补详细记录。`;
    return json(res, { ...publicProject(project), content_html: markdownToHtml(content) });
  }
  if (url.pathname === "/api/categories") {
    const rows = await query("SELECT id, name, slug, description FROM categories ORDER BY id ASC");
    return json(res, { items: rows });
  }
  if (url.pathname === "/api/search") {
    const hits = await searchContent(url.searchParams.get("q") || "");
    return json(res, { items: hits });
  }
  return false;
}

async function adminRoutes(req, res, url) {
  if (url.pathname.startsWith("/admin/api/")) return adminApi(req, res, url);
  if (serveAdminApp(req, res, url)) return;

  if (url.pathname === "/admin/login" && req.method === "GET") {
    return html(res, page("登录", `<div class="login-shell"><form class="card" method="post"><h2>进入后台</h2><p class="muted">只在内网维护内容。登录后可以写文章、发瞬间和同步搜索索引。</p><label>用户名</label><input name="username" autocomplete="username" required><label>密码</label><input name="password" type="password" autocomplete="current-password" required><button class="btn">登录</button></form></div>`));
  }
  if (url.pathname === "/admin/login" && req.method === "POST") {
    const body = await readBody(req);
    const username = String(body.username || "").trim();
    const password = String(body.password ?? "");
    const user = await getOne("SELECT * FROM users WHERE username=:username", { username });
    if (!user || !passwordMatches(password, user.password_hash)) {
      return html(res, page("登录失败", `<div class="card">用户名或密码不对。<p><a href="/admin/login">返回登录</a></p></div>`), 401);
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
        (SELECT COUNT(*) FROM posts) AS posts,
        (SELECT COUNT(*) FROM moments) AS moments,
        (SELECT COUNT(*) FROM projects) AS projects,
        (SELECT COUNT(*) FROM projects WHERE status='active') AS activeProjects
    `);
    return html(res, page("概览", `<div class="toolbar">
      <div>
        <h2>内容工作台</h2>
        <p class="muted">后端按内容资源管理：文章、瞬间、项目和站点设置分开维护，前台只读取发布后的数据。</p>
      </div>
      <div class="toolbar-actions">
        <a class="btn" href="/admin/projects/new">新项目</a>
        <a class="link-pill" href="/admin/posts/new">新文章</a>
      </div>
    </div>
    <div class="admin-grid">
      <section class="card stat-card"><strong>${stats.posts}</strong><p class="muted">文章</p></section>
      <section class="card stat-card"><strong>${stats.moments}</strong><p class="muted">瞬间</p></section>
      <section class="card stat-card"><strong>${stats.activeProjects}/${stats.projects}</strong><p class="muted">前台项目 / 全部项目</p></section>
    </div>
    <div class="grid">
      <section class="card"><h2>项目 Markdown 流程</h2><p class="muted">项目支持直接编辑 Markdown 或上传 .md 文件。保存后会刷新 updated_at、最后编辑时间和前台 API。</p><a class="link-pill" href="/admin/projects">进入项目工作台</a></section>
      <section class="card"><h2>搜索索引</h2><p class="muted">文章保存后会自动同步；需要时也可以手动重建。</p><form method="post" action="/admin/sync-search"><button class="btn">同步搜索索引</button></form></section>
    </div>`));
  }

  if (url.pathname === "/admin/sync-search" && req.method === "POST") {
    const count = await syncSearchIndex();
    return html(res, page("搜索同步", `<div class="card">已同步 ${count} 篇文章到 Meilisearch。<p><a href="/admin">返回</a></p></div>`));
  }

  if (url.pathname === "/admin/posts" && req.method === "GET") {
    const posts = await query("SELECT id,title,slug,status,published_at FROM posts ORDER BY id DESC LIMIT 80");
    const rows = posts.map((p) => `<tr>
      <td>${escapeHtml(p.id)}</td>
      <td>${escapeHtml(p.title)}</td>
      <td>${escapeHtml(p.status)}</td>
      <td><div class="row-actions">
        <a href="/admin/posts/edit?id=${encodeURIComponent(p.id)}">编辑</a>
        <a href="/post.html?slug=${encodeURIComponent(p.slug || "")}" target="_blank" rel="noreferrer">前台</a>
        <form method="post" action="/admin/posts/delete" onsubmit="return confirm('这会把文章从前台隐藏，数据仍保留。继续？')">
          <input type="hidden" name="id" value="${escapeAttr(p.id)}">
          <button class="danger-btn" type="submit">隐藏</button>
        </form>
        <form method="post" action="/admin/posts/destroy" onsubmit="return confirm('彻底删除文章不可恢复，并会清理对应评论和点赞。继续？')">
          <input type="hidden" name="id" value="${escapeAttr(p.id)}">
          <button class="danger-btn destroy-btn" type="submit">彻底删除</button>
        </form>
      </div></td>
    </tr>`).join("");
    return html(res, page("文章", `<div class="card"><h2>文章库</h2><p class="muted">长记录、教程草稿和复盘都从这里维护。隐藏会从前台下架，彻底删除会从数据库移除且不可恢复。</p><a class="btn" href="/admin/posts/new">新文章</a></div><div class="card"><table><tr><th>ID</th><th>标题</th><th>状态</th><th>操作</th></tr>${rows}</table></div>`));
  }
  if ((url.pathname === "/admin/posts/new" || url.pathname === "/admin/posts/edit") && req.method === "GET") {
    const id = url.searchParams.get("id");
    const post = id ? await getOne("SELECT * FROM posts WHERE id=:id", { id }) : {};
    return html(res, page("编辑文章", `<form class="editor-layout" method="post" action="/admin/posts/save">
      <input type="hidden" name="id" value="${escapeAttr(post.id || "")}">
      <section class="card editor-card">
        <div class="toolbar">
          <div>
            <h2>Markdown 编辑器</h2>
            <p class="muted">正文只保留文本编辑区；按 Ctrl+S 可以直接保存。</p>
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
      await query("DELETE FROM posts WHERE id=:id", { id });
      if (target) {
        await deleteCommentsForTarget(target);
        await query("DELETE FROM reactions WHERE target=:target", { target });
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
    const moments = await query("SELECT id,content,kind,status,created_at FROM moments ORDER BY id DESC LIMIT 80");
    const rows = moments.map((m) => `<tr>
      <td>${escapeHtml(m.id)}</td>
      <td>${escapeHtml(m.content)}</td>
      <td>${escapeHtml(m.kind)}</td>
      <td>${escapeHtml(m.status)}</td>
      <td><div class="row-actions">
        <form method="post" action="/admin/moments/delete" onsubmit="return confirm('这会把瞬间从前台隐藏，数据仍保留。继续？')">
          <input type="hidden" name="id" value="${escapeAttr(m.id)}">
          <button class="danger-btn" type="submit">隐藏</button>
        </form>
        <form method="post" action="/admin/moments/destroy" onsubmit="return confirm('彻底删除瞬间不可恢复。继续？')">
          <input type="hidden" name="id" value="${escapeAttr(m.id)}">
          <button class="danger-btn destroy-btn" type="submit">彻底删除</button>
        </form>
      </div></td>
    </tr>`).join("");
    return html(res, page("瞬间", `<form class="card" method="post" action="/admin/moments/save"><h2>发一条瞬间</h2><p class="muted">适合不够成文的进度、状态和临时记录。隐藏会从前台下架，彻底删除会从数据库移除且不可恢复。</p><label>内容</label><textarea name="content"></textarea><div class="grid"><div><label>类型</label><select name="kind"><option value="tech">技术</option><option value="project">项目</option><option value="life">生活</option></select></div><div><label>标签，逗号分隔</label><input name="tags" value="Linux,博客"></div></div><button class="btn">发布瞬间</button></form><div class="card"><table><tr><th>ID</th><th>内容</th><th>类型</th><th>状态</th><th>操作</th></tr>${rows}</table></div>`));
  }
  if (url.pathname === "/admin/moments/save" && req.method === "POST") {
    const body = await readBody(req);
    const tags = JSON.stringify(String(body.tags || "").split(/[,，]/).map((x) => x.trim()).filter(Boolean));
    await query("INSERT INTO moments(content,kind,tags,status,created_at,updated_at) VALUES(:content,:kind,:tags,'published',NOW(),NOW())", { content: body.content || "", kind: cleanMomentKind(body.kind, "life"), tags });
    await cacheDel("site:overview");
    return redirect(res, "/admin/moments");
  }
  if (url.pathname === "/admin/moments/destroy" && req.method === "POST") {
    const body = await readBody(req);
    const id = cleanId(body.id);
    if (!id) return redirect(res, "/admin/moments");
    await query("DELETE FROM moments WHERE id=:id", { id });
    await cacheDel("site:overview");
    return redirect(res, "/admin/moments");
  }
  if (url.pathname === "/admin/moments/delete" && req.method === "POST") {
    const body = await readBody(req);
    const id = cleanId(body.id);
    if (!id) return redirect(res, "/admin/moments");
    await query("UPDATE moments SET status='draft', updated_at=NOW() WHERE id=:id", { id });
    await cacheDel("site:overview");
    return redirect(res, "/admin/moments");
  }

  if (url.pathname === "/admin/projects" && req.method === "GET") {
    const projects = await query("SELECT * FROM projects ORDER BY sort_order ASC,id ASC");
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
          <form method="post" action="/admin/projects/delete" onsubmit="return confirm('这会把项目从前台隐藏，数据仍保留。继续？')">
            <input type="hidden" name="id" value="${escapeAttr(p.id)}">
            <button class="danger-btn" type="submit">隐藏</button>
          </form>
          <form method="post" action="/admin/projects/destroy" onsubmit="return confirm('彻底删除项目不可恢复，并会清理对应评论和点赞。继续？')">
            <input type="hidden" name="id" value="${escapeAttr(p.id)}">
            <button class="danger-btn destroy-btn" type="submit">彻底删除</button>
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
    const notice = url.searchParams.get("saved") ? "已保存：前台项目列表、详情页和最后更新时间已经同步。" : "";
    return html(res, page(id ? "编辑项目" : "新建项目", projectEditor(project || {}, notice)));
  }

  if (url.pathname === "/admin/projects/save" && req.method === "POST") {
    const body = await readForm(req);
    const project = applyMarkdownMetaToProject(body);
    if (!project.content_md.trim()) {
      return html(res, page("项目保存失败", `<div class="card">Markdown 正文不能为空。<p><a href="/admin/projects">返回项目列表</a></p></div>`), 400);
    }
    let id = project.id;
    try {
      if (id) {
        await query(`UPDATE projects
          SET name=:name, slug=:slug, summary=:summary, status_text=:status_text, progress=:progress,
            last_update=:last_update, status=:status, sort_order=:sort_order, content_md=:content_md,
            cover_url=:cover_url, updated_at=NOW()
          WHERE id=:id`, project);
      } else {
        const result = await query(`INSERT INTO projects
          (name, slug, summary, status_text, progress, last_update, status, sort_order, content_md, cover_url, created_at, updated_at)
          VALUES(:name, :slug, :summary, :status_text, :progress, :last_update, :status, :sort_order, :content_md, :cover_url, NOW(), NOW())`, project);
        id = result.insertId;
      }
    } catch (error) {
      if (error.errno === 1062) {
        return html(res, page("项目保存失败", `<div class="card">Slug 已经被其他项目使用，请换一个。<p><a href="/admin/projects">返回项目列表</a></p></div>`), 409);
      }
      throw error;
    }
    await cacheDel("site:overview");
    return redirect(res, `/admin/projects/edit?id=${encodeURIComponent(id)}&saved=1`);
  }
  if (url.pathname === "/admin/projects/delete" && req.method === "POST") {
    const body = await readBody(req);
    const id = cleanId(body.id);
    if (!id) return redirect(res, "/admin/projects");
    await query("UPDATE projects SET status='archived', updated_at=NOW() WHERE id=:id", { id });
    await cacheDel("site:overview");
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
      await query("DELETE FROM reactions WHERE target=:target", { target });
      await query("DELETE FROM projects WHERE id=:id", { id });
      await cacheDel("site:overview");
    }
    return redirect(res, "/admin/projects");
  }

  if (url.pathname === "/admin/texts" && req.method === "GET") {
    const values = await getFrontendTextMap();
    const customRules = await getSetting("site_text_rules", "");
    const footerSections = await getFooterSections();
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
      <h2>页脚栏目</h2>
      <p class="muted">前台页脚按栏目渲染。空栏目和空链接会自动忽略；地址支持站内路径、https 链接和 mailto。</p>
      ${footerSectionFields}
      <h2>高级：任意位置文案规则</h2>
      <p class="muted">每行一条规则：CSS选择器 | 新文字，或 CSS选择器 | 属性名 | 新值。用于临时覆盖没有预置 key 的前台文字。</p>
      <label>自定义规则</label>
      <textarea name="__rules" rows="8" spellcheck="false">${escapeHtml(customRules)}</textarea>
      <button class="btn" type="submit">保存文案</button>
    </form>`));
  }
  if (url.pathname === "/admin/texts" && req.method === "POST") {
    const body = await readBody(req);
    for (const item of frontendTextDefaults) {
      const value = String(body[item.key] ?? "").slice(0, 1200);
      await setSetting(`site_text.${item.key}`, value);
    }
    await setSetting(footerSettingKey, JSON.stringify(footerSectionsFromBody(body)));
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
    await cacheDel([`github:contrib:${githubUsername || "Jlemonz"}`, `github:contrib:${(githubUsername || "Jlemonz").toLowerCase()}`]);
    refreshGithubContributionsSnapshot(githubUsername || "Jlemonz").catch((error) => console.warn("github refresh after settings save failed", error));
    return redirect(res, "/admin/settings");
  }
  return html(res, page("未找到", `<div class="card">页面不存在。</div>`), 404);
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
    req.cookies = parseCookies(req.headers.cookie || "");
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith(config.uploads.publicPath) && serveUpload(req, res, url)) return;
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

await ensureProjectSchema();
await syncConfiguredAdminUser();

server.listen(config.port, config.host, () => {
  console.log(`blog backend listening on ${config.host}:${config.port}`);
});

startGithubContributionsRefresher();
startMoyuDailySnapshotRefresher();
