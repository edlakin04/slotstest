import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  try {
    // TEMP TEST (no auth yet)
    const result = await pool.query("SELECT NOW()");
    res.status(200).json({
      ok: true,
      time: result.rows[0].now
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
}
