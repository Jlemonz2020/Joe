import crypto from "node:crypto";
import { config } from "./config.js";
import { getOne } from "./db.js";

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, expected] = stored.split(":");
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

export function signSession(userId) {
  const payload = `${userId}.${Date.now()}`;
  const signature = crypto.createHmac("sha256", config.admin.sessionSecret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function verifySession(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = `${parts[0]}.${parts[1]}`;
  const signature = crypto.createHmac("sha256", config.admin.sessionSecret).update(payload).digest("hex");
  if (signature !== parts[2]) return null;
  const age = Date.now() - Number(parts[1]);
  if (!Number.isFinite(age) || age > 7 * 24 * 3600 * 1000) return null;
  return Number(parts[0]);
}

export async function currentUser(req) {
  const token = req.cookies.session;
  const id = verifySession(token);
  if (!id) return null;
  return getOne("SELECT id, username FROM users WHERE id = :id", { id });
}
