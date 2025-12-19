const { getPool } = require("../_lib/db");
const { getSession } = require("../_lib/session");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const s = getSession(req);
    if (!s?.wallet) return res.status(401).json({ error: "Not logged in" });

    const { name } = req.body || {};
    if (!name || typeof name !== "string") return res.status(400).json({ error: "Missing name" });

    const COST = 20;

    const p = getPool();

    // deduct fake balance atomically (must have enough)
    const dec = await p.query(
      "update users set fake_balance = fake_balance - $1 where wallet=$2 and fake_balance >= $1 returning fake_balance",
      [COST, s.wallet]
    );
    if (dec.rowCount === 0) return res.status(400).json({ error: "Insufficient fake balance" });

    const ins = await p.query(
      "insert into slots (wallet, name) values ($1,$2) returning id, wallet, name, created_at",
      [s.wallet, name]
    );

    res.status(200).json({
      ok: true,
      slot: ins.rows[0],
      fake_balance: Number(dec.rows[0].fake_balance)
    });
  } catch (err) {
    console.error("slots/create error:", err);
    res.status(500).json({ error: "Server error", message: err.message });
  }
};
