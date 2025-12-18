const { Pool } = require("pg");
const { withIronSessionApiRoute } = require("iron-session/next");

let pool;
function getPool() {
  if (pool) return pool;
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  return pool;
}

const sessionOptions = {
  password: process.env.SESSION_PASSWORD,
  cookieName: "slots_session",
  cookieOptions: {
    secure: process.env.VERCEL_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  }
};

async function handler(req, res) {
  try {
    const wallet = req.session?.user?.wallet;
    if (!wallet) return res.status(200).json({ ok: false, error: "Not logged in" });

    const p = getPool();
    const r = await p.query("SELECT wallet, fake_balance, last_login_at FROM users WHERE wallet=$1", [wallet]);
    if (r.rowCount === 0) return res.status(200).json({ ok: false, error: "User not found" });

    res.status(200).json({ ok: true, user: r.rows[0] });
  } catch (err) {
    console.error("me2 error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
}

module.exports = withIronSessionApiRoute(handler, sessionOptions);
