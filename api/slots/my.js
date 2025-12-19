const { getPool } = require("../_lib/db");
const { withSession } = require("../_lib/session");

async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const wallet = req.session.wallet;
    if (!wallet) return res.status(401).json({ error: "Not signed in" });

    const p = getPool();
    const rows = await p.query(
      "SELECT id, slot_json, created_at FROM slots WHERE wallet=$1 ORDER BY created_at DESC LIMIT 200",
      [wallet]
    );

    const slots = rows.rows.map(r => {
      const s = r.slot_json;
      // Ensure id is the DB id
      s.id = Number(r.id);
      return s;
    });

    return res.status(200).json({ ok: true, wallet, slots });
  } catch (err) {
    console.error("slots/my error:", err);
    return res.status(500).json({ error: "Server error", message: err.message });
  }
}

module.exports = withSession(handler);
