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
  const wallet = req.session.user?.wallet;
  if (!wallet) return res.status(401).json({ error: "Not logged in" });

  const p = getPool();
  const u = await p.query("SELECT wallet, fake_balance FROM users WHERE wallet=$1", [wallet]);
  if (u.rowCount === 0) return res.status(401).json({ error: "User not found" });

  res.status(200).json({ ok: true, user: u.rows[0] });
}

module.exports = withIronSessionApiRoute(handler, sessionOptions);
