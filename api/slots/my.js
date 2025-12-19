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

  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      wallet TEXT PRIMARY KEY,
      fake_balance NUMERIC NOT NULL DEFAULT 1000,
      last_login_at TIMESTAMPTZ
    );
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS slots (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      creator_wallet TEXT NOT NULL REFERENCES users(wallet) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const user = req.session.user;
    if (!user || !user.wallet) {
      return res.status(401).json({ ok: false, error: "Not logged in" });
    }

    const p = getPool();
    await ensureSchema(p);

    const r = await p.query(
      `SELECT id, name, creator_wallet, created_at
       FROM slots
       WHERE creator_wallet=$1
       ORDER BY created_at DESC
       LIMIT 200`,
      [user.wallet]
    );

    return res.status(200).json({ ok: true, slots: r.rows });
  } catch (err) {
    console.error("slots/my error:", err);
    return res.status(500).json({ ok: false, error: "Server error", message: err.message });
  }
}

module.exports = withIronSessionApiRoute(handler, sessionOptions);
