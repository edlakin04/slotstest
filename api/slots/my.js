const { withSessionRoute } = require("../_lib/session");
const { getPool } = require("../_lib/db");

async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const wallet = req.session?.user?.wallet;
    if (!wallet) return res.status(401).json({ error: "Not logged in" });

    const p = getPool();
    const q = await p.query(
      "SELECT slot_json FROM slots WHERE wallet=$1 ORDER BY created_at DESC LIMIT 500",
      [wallet]
    );

    const slots = q.rows.map(r => r.slot_json);
    res.status(200).json({ ok: true, slots });
  } catch (err) {
    console.error("slots/my error:", err);
    res.status(500).json({ error: "Server error", message: err.message });
  }
}

module.exports = withSessionRoute(handler);
