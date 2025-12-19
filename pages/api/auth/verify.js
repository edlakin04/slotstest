// pages/api/auth/verify.js
const nacl = require("tweetnacl");
const bs58 = require("bs58");
const { withIronSessionApiRoute } = require("iron-session/next");
const { getPool } = require("../../../lib/db");
const { sessionOptions } = require("../../../lib/session");

function verifySig({ wallet, message, signatureB58 }) {
  const pubkeyBytes = bs58.decode(wallet);
  const sigBytes = bs58.decode(signatureB58);
  const msgBytes = new TextEncoder().encode(message);
  return nacl.sign.detached.verify(msgBytes, sigBytes, pubkeyBytes);
}

async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { wallet, nonce, signature } = req.body || {};
    if (!wallet || !nonce || !signature) return res.status(400).json({ error: "Missing fields" });

    const p = getPool();
    const rec = await p.query("SELECT * FROM auth_nonces WHERE nonce=$1", [nonce]);
    if (rec.rowCount === 0) return res.status(400).json({ error: "Bad nonce" });

    const row = rec.rows[0];
    if (row.wallet !== wallet) return res.status(400).json({ error: "Nonce wallet mismatch" });
    if (row.used) return res.status(400).json({ error: "Nonce already used" });
    if (new Date(row.expires_at).getTime() < Date.now()) return res.status(400).json({ error: "Nonce expired" });

    const ok = verifySig({ wallet, message: row.message, signatureB58: signature });
    if (!ok) return res.status(401).json({ error: "Invalid signature" });

    await p.query("UPDATE auth_nonces SET used=true WHERE nonce=$1", [nonce]);

    await p.query(
      `INSERT INTO users (wallet, last_login_at, fake_balance)
       VALUES ($1, NOW(), 1000)
       ON CONFLICT (wallet) DO UPDATE SET last_login_at=NOW()`,
      [wallet]
    );

    req.session.user = { wallet };
    await req.session.save();

    return res.status(200).json({ ok: true, wallet });
  } catch (err) {
    console.error("verify error:", err);
    return res.status(500).json({ error: "Server error", message: err.message });
  }
}

module.exports = withIronSessionApiRoute(handler, sessionOptions);
