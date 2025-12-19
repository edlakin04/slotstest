const crypto = require("crypto");
const { getPool } = require("../_lib/db");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { wallet } = req.body || {};
    if (!wallet || typeof wallet !== "string") return res.status(400).json({ error: "Missing wallet" });

    const nonce = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000);

    const message =
`Sign in to Slots (test)
Wallet: ${wallet}
Nonce: ${nonce}
Expires: ${expiresAt.toISOString()}`;

    const p = getPool();
    await p.query(
      "INSERT INTO auth_nonces (nonce, wallet, message, expires_at, used) VALUES ($1,$2,$3,$4,false)",
      [nonce, wallet, message, expiresAt.toISOString()]
    );

    return res.status(200).json({ nonce, message, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    console.error("challenge error:", err);
    return res.status(500).json({ error: "Server error", message: err.message });
  }
};
