const { Pool } = require("pg");
const { withIronSessionApiRoute } = require("iron-session/next");

let pool;
let schemaReady = false;

function getPool() {
  if (pool) return pool;
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  return pool;
}

async function ensureSchema(p) {
  if (schemaReady) return;
  // safe to run multiple times
  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      wallet TEXT PRIMARY KEY,
      fake_balance NUMERIC NOT NULL DEFAULT 1000,
      last_login_at TIMESTAMPTZ
    );
  `);
  schemaReady = true;
}

const sessionOptions = {
  password: process.env.SESSION_PASSWORD,
  cookieName: "slots_session",
  cookieOptions: {
    secure: process.env.VERCEL_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  },
};

async function handler(req, res) {
  try {
    const user = req.session.user;
    if (!user || !user.wallet) {
      return res.status(401).json({ error: "Not logged in" });
    }

    const p = getPool();
    await ensureSchema(p);

    const r = await p.query("SELECT wallet, fake_balance, last_login_at FROM users WHERE wallet=$1", [
      user.wallet,
    ]);

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(200).json({ ok: true, user: r.rows[0] });
  } catch (err) {
    console.error("me2 error:", err);
    return res.status(500).json({ error: "Server error", message: err.message });
  }
}

module.exports = withIronSessionApiRoute(handler, sessionOptions);
