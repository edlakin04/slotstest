const nacl = require("tweetnacl");
const bs58 = require("bs58");
const { TextEncoder } = require("util");
const { getPool } = require("../_lib/db");
const { setSessionCookie } = require("../_lib/session");

function verifySig({ wallet, message, signatureB58 }) {
  const pubkeyBytes = bs58.decode(wallet);
  const sigBytes = bs58.decode(signatureB58);
  const msgBytes = new TextEncoder().encode(message);
  return nacl.sign.detached.verify(msgBytes, sigBytes, pubkeyBytes);
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { wallet, nonce, signature } = req.body || {};
    if (!wallet || !nonce || !signature) return res.status(400).json({ error: "Missing fields" });

    const p = getPool();
    const rec = await p.query("select * from auth_nonces where nonce=$1", [nonce]);
    if (rec.rowCount === 0) return res.status(400).json({ error: "Bad nonce" });

    const row = rec.rows[0];
    if (row.wallet !== wallet) return res.status(400).json({ error: "Nonce wallet mismatch" });
    if (row.used) return res.status(400).json({ error: "Nonce already used" });
    if (new Date(row.expires_at).getTime() < Date.now()) return res.status(400).json({ error: "Nonce expired" });

    const ok = verifySig({ wallet, message: row.message, signatureB58: signature });
    if (!ok) return res.status(401).json({ error: "Invalid signature" });

    await p.query("update auth_nonces set used=true where nonce=$1", [nonce]);

    // ensure user exists with default fake balance
    await p.query(
      `insert into users (wallet, fake_balance, last_login_at)
       values ($1, 1000, now())
       on conflict (wallet) do update set last_login_at=now()`,
      [wallet]
    );

    setSessionCookie(res, wallet);
    res.status(200).json({ ok: true, wallet });
  } catch (err) {
    console.error("verify error:", err);
    res.status(500).json({ error: "Server error", message: err.message });
  }
};
