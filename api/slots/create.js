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
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const wallet = req.session?.user?.wallet;
    if (!wallet) return res.status(401).json({ ok: false, error: "Not logged in" });

    const { name } = req.body || {};

    const p = getPool();
    const r = await p.query(
      `INSERT INTO slots (name, creator_wallet, owner_wallet)
       VALUES ($1, $2, $2)
       RETURNING id, name, creator_wallet, owner_wallet, created_at`,
      [name || null, wallet]
    );

    res.status(200).json({ ok: true, slot: r.rows[0] });
  } catch (err) {
    console.error("slots/create error:", err);
    res.status(500).json({ ok: false, error: "Server error", message: err.message });
  }
}

module.exports = withIronSessionApiRoute(handler, sessionOptions);
