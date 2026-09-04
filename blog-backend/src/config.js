import fs from "node:fs";
import path from "node:path";

export function loadEnv(file = ".env") {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv(path.resolve(process.cwd(), ".env"));
loadEnv(process.env.JOE_KEYS_FILE || path.resolve(process.cwd(), "config", "keys.env"));

export const config = {
  env: process.env.NODE_ENV || "production",
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 8097),
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || "yifang_blog",
    user: process.env.DB_USER || "yifang_blog",
    password: process.env.DB_PASSWORD || ""
  },
  redis: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || ""
  },
  meili: {
    host: process.env.MEILI_HOST || "http://127.0.0.1:7700",
    masterKey: process.env.MEILI_MASTER_KEY || ""
  },
  admin: {
    username: process.env.ADMIN_USERNAME || "yifang",
    password: process.env.ADMIN_PASSWORD || "",
    sessionSecret: process.env.SESSION_SECRET || "change-me"
  },
  uploads: {
    dir: process.env.UPLOAD_DIR || "/data/blog-backend/uploads",
    publicPath: process.env.PUBLIC_UPLOAD_PATH || "/uploads"
  },
  github: {
    username: process.env.GITHUB_USERNAME || "Jlemonz",
    token: process.env.GITHUB_TOKEN || ""
  }
};
