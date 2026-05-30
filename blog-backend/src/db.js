import mysql from "mysql2/promise";
import { config } from "./config.js";

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 8,
  namedPlaceholders: true,
  charset: "utf8mb4"
});

export async function query(sql, params = {}) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

export async function getOne(sql, params = {}) {
  const rows = await query(sql, params);
  return rows[0] || null;
}
