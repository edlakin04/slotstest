// pages/api/slots/my.js
const { withIronSessionApiRoute } = require("iron-session/next");
const { sessionOptions } = require("../../../lib/session");
const { getPool } = require("../../../lib/db");

async function handler(req, res) {
  try {
    const wallet = req.session?.user?.wallet;
    if (!wallet) return res.status(200).json({ ok: true, slots: [] });

    const p = getPool();
    const q = await p.query(
      `SELECT id, name, created_at
       FROM slots
       WHERE wallet=$1
       ORDER BY created_at DESC
       LIMIT 200`,
      [wallet]
    );

    const slots = q.rows.map(r => {
      const createdMs = new Date(r.created_at).getTime();
      return {
        id: Number(r.id),
        name: r.name,
        createdAt: createdMs,
        creatorWallet: wallet,
        ownerWallet: wallet,
        lockedUntil: 0,
        votes: [],
        sales: [],
        priceHistory: [{ t: createdMs, priceUSD: 5 }],
        up: 0,
        down: 0,
        scoreS: 0,
        priceUSD: 5,
        lastVoteAt: createdMs,
        voteRatePerSec: 0.2
      };
    });

    return res.status(200).json({ ok: true, slots });
  } catch (err) {
    console.error("slots/my error:", err);
    return res.status(500).json({ error: "Server error", message: err.message });
  }
}

module.exports = withIronSessionApiRoute(handler, sessionOptions);
