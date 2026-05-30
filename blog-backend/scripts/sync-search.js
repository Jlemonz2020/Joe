import { pool } from "../src/db.js";
import { syncSearchIndex } from "../src/search.js";

const count = await syncSearchIndex();
await pool.end();
console.log(`synced ${count} posts`);
