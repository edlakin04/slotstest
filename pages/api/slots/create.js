// pages/api/slots/create.js
const { withIronSessionApiRoute } = require("iron-session/next");
const { sessionOptions } = require("../../../lib/session");
const { getPool } = require("../../../lib/db");

const nameA = ["Neon","Turbo","Ghost","Violet","Chrome","Solar","Apex","Shadow","Feral","Nova","Glitch","Pixel","Hyper","Omega","Void","Mint","Lunar","Prism","Rogue","Flux"];
const nameB = ["Trump","Wizard","Monkey","Whale","Cat","Pepe","Rocket","Goblin","Knight","Alien","Dragon","Degen","Reaper","Angel","Bot","King","Queen","Titan","Hacker","Joker"];
const nameC = ["Protocol","Poster","Slot","Board","Cannon","Machine","Signal","Hype","Wave","Engine","Temple","Arena","Mint","Market","Scroll","Portal","Gem","Grail","Relay","Index"];
function randChoice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function makeName(){ return `${randChoice(nameA)} ${randChoice(nameB)} ${randChoice(nameC)}`; }

async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const wallet = req.session?.user?.wallet;
    if (!wallet) return res.status(401).json({ error: "Not logged in" });

    const COST = 20;
    const p = getPool();

    // Deduct fake balance atomically
    const updated = await p.query(
      `UPDATE users
       SET fake_balance = fake_balance - $2
       WHERE wallet = $1 AND fake_balance >= $2
       RETURNING fake_balance`,
      [wallet, COST]
    );

    if (updated.rowCount === 0) {
      return res.status(400).json({ error: "Insufficient fake balance" });
    }

    const name = makeName();
    const ins = await p.query(
      `INSERT INTO slots (wallet, name)
       VALUES ($1, $2)
       RETURNING id, wallet, name, created_at`,
      [wallet, name]
    );

    const row = ins.rows[0];
    const createdMs = new Date(row.created_at).getTime();

    // Match your frontend slot shape
    const slot = {
      id: Number(row.id),
      name: row.name,
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

    return res.status(200).json({
      ok: true,
      fake_balance: Number(updated.rows[0].fake_balance),
      slot
    });
  } catch (err) {
    console.error("slots/create error:", err);
    return res.status(500).json({ error: "Server error", message: err.message });
  }
}

module.exports = withIronSessionApiRoute(handler, sessionOptions);
