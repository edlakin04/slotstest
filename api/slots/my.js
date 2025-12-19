const { getPool } = require("../_lib/db");
const { getSession } = require("../_lib/session");

module.exports = async function handler(req, res) {
  try {
    const s = getSession(req);
    if (!s?.wallet) return res.status(200).json({ ok: true, slots: [] });

    const p = getPool();
    const rows = await p.query(
      "select id, wallet, name, created_at from slots where wallet=$1 order by created_at desc limit 200",
      [s.wallet]
    );

    res.status(200).json({ ok: true, slots: rows.rows });
  } catch (err) {
    console.error("slots/my error:", err);
    res.status(500).json({ error: "Server error", message: err.message });
  }
};
