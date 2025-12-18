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
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const wallet = req.session?.user?.wallet;
    if (!wallet) return res.status(401).json({ ok: false, error: "Not logged in" });

    const p = getPool();
    const r = await p.query(
      `SELECT id, name, creator_wallet, owner_wallet, created_at
       FROM slots
       WHERE creator_wallet=$1 OR owner_wallet=$1
       ORDER BY created_at DESC`,
      [wallet]
    );

    res.status(200).json({ ok: true, slots: r.rows });
  } catch (err) {
    console.error("slots/my error:", err);
    res.status(500).json({ ok: false, error: "Server error", message: err.message });
  }
}

module.exports = withIronSessionApiRoute(handler, sessionOptions);
