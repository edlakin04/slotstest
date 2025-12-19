const { getPool } = require("./_lib/db");
const { getSession } = require("./_lib/session");

module.exports = async function handler(req, res) {
  try {
    const s = getSession(req);
    if (!s?.wallet) return res.status(200).json({ ok: true, wallet: null });

    const p = getPool();
    const u = await p.query("select wallet, fake_balance from users where wallet=$1", [s.wallet]);
    if (u.rowCount === 0) return res.status(200).json({ ok: true, wallet: null });

    res.status(200).json({
      ok: true,
      wallet: u.rows[0].wallet,
      fake_balance: Number(u.rows[0].fake_balance)
    });
  } catch (err) {
    console.error("me error:", err);
    res.status(500).json({ error: "Server error", message: err.message });
  }
};
