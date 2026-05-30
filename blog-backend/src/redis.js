import net from "node:net";
import { config } from "./config.js";

function encodeCommand(parts) {
  return `*${parts.length}\r\n${parts.map((part) => {
    const value = String(part);
    return `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
  }).join("")}`;
}

async function redisCommand(parts) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: config.redis.host, port: config.redis.port });
    let data = "";
    socket.setTimeout(1200);
    socket.on("connect", () => {
      const commands = [];
      if (config.redis.password) commands.push(["AUTH", config.redis.password]);
      commands.push(parts);
      socket.write(commands.map(encodeCommand).join(""));
    });
    socket.on("data", (chunk) => {
      data += chunk.toString("utf8");
      if (data.includes("\r\n")) {
        socket.end();
        resolve(data);
      }
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(null);
    });
    socket.on("error", () => resolve(null));
  });
}

export async function cacheGet(key) {
  const data = await redisCommand(["GET", key]);
  if (!data || data.startsWith("$-1")) return null;
  const match = data.match(/^\$\d+\r\n([\s\S]*)\r\n$/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export async function cacheSet(key, value, seconds = 60) {
  await redisCommand(["SETEX", key, seconds, JSON.stringify(value)]);
}

export async function cacheDel(keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  if (list.length) await redisCommand(["DEL", ...list]);
}
