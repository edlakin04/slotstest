const { withSessionRoute } = require("./_lib/session");
const { getPool } = require("./_lib/db");

async function handler(req, res) {
  try {
    const wallet = req.session?.user?.wallet || null;
    if (!wallet) return res.status(200).json({ ok: true, wallet: null });

    const p = getPool();
    const u = await p.query("SELECT wallet, fake_balance FROM users WHERE wallet=$1", [wallet]);
    if (u.rowCount === 0) return res.status(200).json({ ok: true, wallet: null });

    res.status(200).json({
      ok: true,
      wallet: u.rows[0].wallet,
      fake_balance: Number(u.rows[0].fake_balance),
    });
  } catch (err) {
    console.error("me error:", err);
    res.status(500).json({ error: "Server error", message: err.message });
  }
}

module.exports = withSessionRoute(handler);
